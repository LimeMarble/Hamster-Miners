(function (root) {
  "use strict";

  // Index the same quantities and material mappings used by production. The
  // browser owns navigation only; it never changes factory or inventory state.
  function buildCatalog(data) {
    const entries = new Map(), recipes = [], producers = new Map(), consumers = new Map(), constructionUses = new Map();
    const item = (id, quantity) => ({ key: `item:${id}`, quantity });
    const addTo = (index, key, value) => { if (!index.has(key)) index.set(key, []); index.get(key).push(value); };
    for (const [id, definition] of Object.entries(data.materials)) entries.set(`item:${id}`, { key: `item:${id}`, id, kind: "item", ...definition });
    for (const [id, definition] of Object.entries(data.machines)) entries.set(`machine:${id}`, { key: `machine:${id}`, id, kind: "machine", ...definition });
    function add(machine, id, inputs, outputs, recipe = {}) {
      const definition = data.machines[machine];
      const entry = { ...recipe, id: `${machine}:${id}`, machine: `machine:${machine}`, inputs, outputs,
        heatPerSecond: recipe.heatPerSecond ?? definition.heatPerSecond ?? 0 };
      recipes.push(entry);
      inputs.forEach(input => addTo(consumers, input.key, entry));
      outputs.forEach(output => addTo(producers, output.key, entry));
    }
    for (const [id, definition] of Object.entries(data.machines)) {
      if (definition.batchModes) {
        add(id, "chert", [], [item("soil", 0.1), item("chert", 0.1)], { seconds: definition.cycle, modeName: "Chert" });
        add(id, "malachite", [], [item("soil", 0.1), { ...item("malachitePebble", 1), chance: 0.2 }], { seconds: definition.cycle, modeName: "Malachite focus" });
        add(id, "soil", [], [item("soil", 0.2)], { seconds: definition.cycle, modeName: "Soil focus" });
      } else if (definition.batchOutputs) add(id, "source", [], Object.entries(definition.batchOutputs).map(([material, amount]) => item(material, amount)), { seconds: definition.cycle });
      else if (definition.source || definition.sourceModes) {
        for (const material of definition.source ? [definition.source] : Object.keys(definition.sourceModes)) {
          add(id, material, [], [item(material, definition.sourceQuantity ?? 1)], { seconds: definition.cycle });
        }
      }
      for (const [mode, recipe] of Object.entries(definition.recipes ?? {})) {
        const input = definition.craftInput ?? recipe.material ?? mode;
        add(id, mode, [item(input, recipe.input)], [item(recipe.output, recipe.outputQuantity ?? (definition.heatCapacity ? recipe.input : 1))], recipe);
      }
      if (definition.paintRecipe) {
        const recipe = definition.paintRecipe;
        add(id, "paint", Object.entries(recipe.inputs).map(([material, amount]) => item(material, amount)),
          [item(recipe.output, 1)], { ...recipe, valueIngredient: "pot" });
      }
      if (definition.molder) for (const [material, source] of Object.entries(data.materials)) {
        const output = data.materials[source.moldsTo];
        if (source.fluid && output && !output.fluid && !source.requiresRefractoryCaster && !output.requiresRefractoryCaster) {
          add(id, material, [item(material, 1)], [item(source.moldsTo, 1)], { seconds: definition.seconds, valueMultiplier: 1 });
        }
      }
      for (const [mode, recipe] of Object.entries(definition.formingModes ?? definition.pressModes ?? {})) {
        for (const [material, source] of Object.entries(data.materials)) {
          const output = source[recipe.materialProperty];
          if (data.materials[output] && !data.materials[output].fluid && Boolean(source.fluid) === Boolean(definition.fluidInput)) {
            const resolved = { ...recipe, ...(recipe.recipeProperty ? source[recipe.recipeProperty] : {}) };
            add(id, `${mode}:${material}`, [item(material, resolved.input)], [item(output, resolved.outputQuantity ?? 1)],
              { ...resolved, seconds: resolved.seconds ?? definition.seconds, adjacentPairSpeed: definition.pressModes && !definition.dualPower ? 2 : definition.kineticPairSpeed });
          }
        }
      }
      for (const [material, amount] of Object.entries(definition.cost?.materials ?? {})) addTo(constructionUses, `item:${material}`, { machine: `machine:${id}`, quantity: amount });
      for (const [machine, amount] of Object.entries(definition.cost?.machines ?? {})) addTo(constructionUses, `machine:${machine}`, { machine: `machine:${id}`, quantity: amount });
    }
    // The hand-operated extractor predates the generic crafting definitions.
    add("fiber", "fiber", [item("leek", 1)], [item("leekFiber", 2)], { seconds: data.config.fiberSeconds, valueMultiplier: 2 });
    const normalize = text => text.toLocaleLowerCase().trim();
    function search(query = "", kind = "all", machine = "all") {
      const term = normalize(query), related = new Set([`machine:${machine}`]);
      if (machine !== "all") {
        for (const recipe of recipes.filter(recipe => recipe.machine === `machine:${machine}`)) {
          [...recipe.inputs, ...recipe.outputs].forEach(part => related.add(part.key));
        }
        const definition = data.machines[machine];
        Object.keys(definition?.cost?.materials ?? {}).forEach(id => related.add(`item:${id}`));
        Object.keys(definition?.cost?.machines ?? {}).forEach(id => related.add(`machine:${id}`));
        if (definition?.heatCapacity) for (const [id, material] of Object.entries(data.materials)) if (material.heat) related.add(`item:${id}`);
      }
      const rank = entry => normalize(entry.name) === term ? 0 : normalize(entry.name).startsWith(term) ? 1 : 2;
      return [...entries.values()].filter(entry => (kind === "all" || entry.kind === kind)
        && normalize(entry.name).includes(term) && (machine === "all" || related.has(entry.key)))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
    }
    return { entries, recipes, producers, consumers, constructionUses, search };
  }

  function mount({ document, data, formatNumber: number, primitiveEffect, openShop }) {
    const catalog = buildCatalog(data), $ = id => document.getElementById(id);
    const list = $("recipeEntries"), detail = $("recipeDetail"), query = $("recipeSearch"), kind = $("recipeKind"), filter = $("recipeMachine");
    const back = [], forward = [];
    let state = { selection: "item:clay", query: "", kind: "all", machine: "all", listScroll: 0, detailScroll: 0 };
    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    }
    function button(text, fn, className = "secondary") {
      const node = element("button", text, className); node.type = "button"; node.addEventListener("click", fn); return node;
    }
    function reference(key, label) {
      const entry = catalog.entries.get(key), node = button(label ?? entry.name, () => open(key), "recipe-link");
      node.dataset.entry = key; return node;
    }
    function capture() { return { ...state, listScroll: list.scrollTop || 0, detailScroll: detail.scrollTop || 0 }; }
    function open(key, follow = true) {
      if (!catalog.entries.has(key)) return;
      const previous = capture();
      if (state.selection !== key || follow && (state.query || state.kind !== "all" || state.machine !== "all")) {
        back.push(previous); forward.length = 0;
        state = { ...previous, selection: key, detailScroll: 0,
          ...(follow ? { query: "", kind: "all", machine: "all", listScroll: 0 } : {}) };
      } else state = previous;
      render();
    }
    function history(from, to) {
      if (!from.length) return;
      to.push(capture()); state = from.pop(); render();
    }
    function section(title, empty) {
      const node = element("section", undefined, "recipe-section"); node.append(element("h3", title)); detail.append(node);
      if (empty) node.append(element("p", empty, "muted"));
      return node;
    }
    function parts(container, values) {
      values.forEach((part, i) => {
        if (i) container.append(element("span", "+", "recipe-plus"));
        container.append(reference(part.key, `${number(part.quantity)} ${catalog.entries.get(part.key).name}${part.chance !== undefined ? ` (${number(part.chance * 100)}% chance)` : ""}`));
      });
    }
    function gradeNotes(node, recipe) {
      if (recipe.gradeProfile) node.append(element("p", `Starting grade chances before inherited treatments: ${recipe.gradeProfile.map((chance, i) => chance ? `${data.grades[i].name} ${number(chance * 100)}%` : "").filter(Boolean).join(" · ")}`, "muted"));
      if (recipe.gradePromotion) {
        const ceiling = recipe.gradePromotionCeiling ?? data.grades.length - 1;
        const transitions = data.grades.slice(0, ceiling).map((grade, i) => `${grade.name} → ${data.grades[i + 1].name}`).join(", ");
        node.append(element("p", `Grade effect: moves ${number(recipe.gradePromotion * 100)}% of the chance at each grade up one step, all at once: ${transitions}. Existing ${data.grades[ceiling].name} and higher chances do not move. Already graded cargo is unaffected.`, "muted"));
      }
      if (recipe.burnishedGradeEffect) {
        const effect = recipe.burnishedGradeEffect;
        node.append(element("p", `Burnished input: ${data.grades[effect.from].name} chance becomes ${effect.outcomes.map(outcome => `${number(outcome.share * 100)}% ${data.grades[outcome.grade].name}`).join(" and ")}.`, "muted"));
      }
    }
    function recipeCard(recipe) {
      const node = element("article", undefined, "recipe-card"); node.dataset.recipe = recipe.id;
      const heading = element("div", undefined, "recipe-card-heading"); heading.append(reference(recipe.machine));
      heading.append(element("span", `${recipe.modeName ? `${recipe.modeName} · ` : ""}${number(recipe.seconds)}s per batch`, "muted")); node.append(heading);
      const flow = element("div", undefined, "recipe-flow");
      if (recipe.inputs.length) { parts(flow, recipe.inputs); flow.append(element("span", "→", "recipe-arrow")); }
      else flow.append(element("span", "Produces", "muted"));
      parts(flow, recipe.outputs); node.append(flow);
      const machine = catalog.entries.get(recipe.machine), facts = [];
      if (machine.crew) facts.push(`${number(machine.crew)} crew`);
      if (machine.requiresKinetic) facts.push(`${machine.pressModes ? 2 : machine.kineticInputsRequired ?? 1} kinetic connection(s)`);
      if (recipe.adjacentPairSpeed) facts.push(`${number(recipe.seconds / recipe.adjacentPairSpeed)}s with an adjacent kinetic pair`);
      if (machine.heatCapacity) facts.push(`${number(recipe.heatPerSecond * recipe.seconds)}u heat per batch`);
      if (recipe.preheatedSeconds) facts.push(`${number(recipe.preheatedSeconds)}s and ${number(recipe.heatPerSecond * recipe.preheatedSeconds)}u when fully preheated`);
      if (machine.preheats) facts.push(`moves up to ${number(machine.preheatGradeTransfer * 100)} percentage points of Unremarkable chance to Standard`);
      if (recipe.heatPerSecond) facts.push(`${number(recipe.heatPerSecond)}u/s heat`);
      if (recipe.water) facts.push(`${number(recipe.water)} Water per batch`);
      node.append(element("p", facts.join(" · "), "recipe-facts"));
      node.append(element("p", recipe.outputs.map(part => `${number(part.quantity * (part.chance ?? 1) * 60 / recipe.seconds)} ${catalog.entries.get(part.key).name}/min`).join(" · ") + (recipe.outputs.some(part => part.chance !== undefined) ? " on average while continuously running" : " while continuously running"), "muted"));
      if (recipe.valueIngredient) node.append(element("p", `Output cash value is ×${number(recipe.valueMultiplier)} the Pot's value; the Malachite Pebble's value is not added.`, "muted"));
      else if (recipe.valueMultiplier !== undefined) node.append(element("p", recipe.valueMultiplier === 1 ? "Preserves total input cash value." : `Total output cash value: ×${number(recipe.valueMultiplier)} combined input value.`, "muted"));
      if (recipe.outputs.some(part => catalog.entries.get(part.key).fluid)) node.append(element("p", "Liquid output requires a direct machine connection; it does not travel on conveyors.", "muted"));
      gradeNotes(node, recipe); return node;
    }
    function effects(entry) {
      const cash = entry.id === "primitive" ? { bonus: primitiveEffect().primitiveBonus, upperLimit: primitiveEffect().primitiveLimit } : entry.cashEffect;
      if (cash) {
        const lines = [`Cash effect: ${cash.multiplier ? `×${number(cash.multiplier)}` : `+$${number(cash.bonus)}`}`];
        for (const [key, label] of [["useLimit", "Use Limit"], ["upperLimit", "Upper Limit"], ["lowerLimit", "Lower Bound"], ["baseValueRequired", "Base Value Required"]]) {
          if (cash[key] !== undefined) lines.push(`${label}: ${key === "useLimit" ? "" : "$"}${number(cash[key])}`);
        }
        const node = section("Upgrade effects"); lines.forEach(line => node.append(element("p", line)));
        if (entry.gradeEffect?.poorToStandardPerUse) node.append(element("p", `Grade Effects: each of ${number(entry.gradeEffect.useLimit)} uses moves ${number(entry.gradeEffect.poorToStandardPerUse * 100)} percentage points from Poor to Unremarkable on Clay products. Repairs carry through shaping and firing.`));
        if (entry.gradeEffect?.promotionRates) node.append(element("p", `Grade Effects: ${entry.gradeEffect.promotionRates.map((rate, i) => rate ? `${number(rate * 100)}% ${data.grades[i].name} → ${data.grades[i + 1].name}` : "").filter(Boolean).join(" · ")}. Applies outside the cash range.`));
        if (entry.persistentEffects) node.append(element("p", "Cash effect applies once across the entire processing chain."));
      }
      if (entry.secondsPerWeight) {
        const node = section("Grading");
        node.append(element("p", `${number(entry.secondsPerWeight)}s per weight · ${entry.crew} crew · one roll per ungraded stack.`));
        node.append(element("p", data.grades.map(grade => `${grade.name} ×${number(grade.multiplier)}`).join(" · ")));
        node.append(element("p", "Grade chances come from the incoming material and its treatments. If any input is graded, the whole stack is graded and cannot roll again."));
      }
    }
    function showDetail() {
      detail.replaceChildren();
      const entry = catalog.entries.get(state.selection);
      if (!entry) { detail.append(element("h2", "Choose an item or machine")); return; }
      const title = element("h2", entry.name); title.id = "recipeTitle";
      detail.append(element("p", entry.kind === "machine" ? `${entry.category} machine` : entry.fluid ? "Fluid" : "Item", "recipe-kind-label"), title);
      if (entry.kind === "item") {
        detail.append(element("p", `${entry.value === null ? "Unsellable" : `Base value: $${number(entry.value)}`} · Weight: ${number(entry.weight)}`, "recipe-facts"));
        const chances = data.gradeTables[entry.gradeTable ?? entry.family];
        if (chances) detail.append(element("p", `Starting grade chances for fresh cargo: ${chances.map((chance, i) => chance ? `${data.grades[i].name} ${number(chance * 100)}%` : "").filter(Boolean).join(" · ")}. Manufactured cargo can inherit different chances and treatments.`, "muted"));
        const sources = catalog.producers.get(entry.key) ?? [], uses = catalog.consumers.get(entry.key) ?? [];
        const made = section("Sources", sources.length || entry.id === "wood" ? "" : "No production source is available in this version.");
        if (entry.id === "wood") made.append(element("p", `Tree chopping: ${data.config.chopsPerHarvest} accepted clicks yield 1–5 Wood.`));
        sources.forEach(recipe => made.append(recipeCard(recipe)));
        const used = section("Production uses", uses.length ? "" : "Not consumed by a production recipe.");
        uses.forEach(recipe => used.append(recipeCard(recipe)));
        if (entry.heat) {
          const fuel = section("Fuel"); fuel.append(element("p", `1 ${entry.name} supplies ${number(entry.heat)}u of heat.`));
          for (const [id, machine] of Object.entries(data.machines)) if (machine.heatCapacity && Object.values(machine.recipes).some(recipe => (recipe.heatPerSecond ?? machine.heatPerSecond) > 0)) fuel.append(reference(`machine:${id}`));
        }
      } else {
        const swapSize = ["down", "up"].includes(entry.defaultFacing ?? "right");
        detail.append(element("p", entry.description), element("p", `${swapSize ? entry.height : entry.width}×${swapSize ? entry.width : entry.height} · ${entry.crew ?? 0} operating crew`, "recipe-facts"));
        detail.append(button("View in Shop", () => openShop(entry.id)));
        const cost = section("Construction cost"), flow = element("div", undefined, "recipe-flow");
        if (entry.cost) {
          cost.append(element("p", `$${number(entry.cost.cash)} cash`));
          parts(flow, [...Object.entries(entry.cost.materials ?? {}).map(([id, quantity]) => ({ key: `item:${id}`, quantity })),
            ...Object.entries(entry.cost.machines ?? {}).map(([id, quantity]) => ({ key: `machine:${id}`, quantity }))]);
          cost.append(flow);
        }
        const recipes = catalog.recipes.filter(recipe => recipe.machine === entry.key);
        const production = section("Production recipes", recipes.length ? "" : "This machine has no material-production recipe.");
        recipes.forEach(recipe => production.append(recipeCard(recipe))); effects(entry);
        if (entry.electricPower || entry.electricOutput) {
          const power = section("Electricity");
          power.append(element("p", entry.electricOutput ? `Supplies ${number(entry.electricOutput)}u with both kinetic inputs connected.`
            : `Draws ${number(entry.electricPower)}u${entry.conveyors ? ", including its internal conveyor" : ""}.`));
          power.append(element("p", "All generators share one factory-wide supply. All electric machines pause when demand exceeds supply."));
          if (entry.conveyors) power.append(element("p", `Conveyor: weight capacity ${number(entry.beltWeight)} · ${number(entry.beltSeconds)}s per tile · one cargo stack per tile.`));
        }
        if (entry.heatCapacity) {
          const fuel = section("Fuel & heat"); fuel.append(element("p", `Heat capacity: ${number(entry.heatCapacity)}u. Full batches consume their heat when started.`));
          for (const [id, material] of Object.entries(data.materials)) if (material.heat) fuel.append(reference(`item:${id}`, `${material.name} · ${number(material.heat)}u each`));
        }
      }
      const uses = catalog.constructionUses.get(entry.key) ?? [];
      const construction = section("Used in construction", uses.length ? "" : "No machine construction costs use this entry.");
      for (const use of uses) {
        const line = element("p"); line.append(reference(use.machine), element("span", ` · ${number(use.quantity)} required`)); construction.append(line);
      }
    }
    function render() {
      query.value = state.query; kind.value = state.kind; filter.value = state.machine;
      $("recipeBack").disabled = !back.length; $("recipeForward").disabled = !forward.length;
      const matches = catalog.search(state.query, state.kind, state.machine);
      $("recipeCount").textContent = `${matches.length} ${matches.length === 1 ? "entry" : "entries"}`;
      list.replaceChildren();
      if (!matches.length) list.append(element("p", "No matching items or machines.", "muted"));
      for (const entry of matches) {
        const node = button(undefined, () => open(entry.key, false), "recipe-entry"); node.dataset.entry = entry.key;
        node.classList.toggle("selected", entry.key === state.selection); node.setAttribute("aria-pressed", String(entry.key === state.selection));
        const swatch = element("i", undefined, "machine-swatch"); swatch.style.background = entry.color; swatch.setAttribute("aria-hidden", "true");
        const label = element("span"); label.append(element("strong", entry.name), element("small", entry.kind === "machine" ? "Machine" : entry.fluid ? "Fluid" : "Item"));
        node.append(swatch, label); list.append(node);
      }
      showDetail(); list.scrollTop = state.listScroll; detail.scrollTop = state.detailScroll;
    }
    for (const [value, name] of [["all", "Items & machines"], ["item", "Items"], ["machine", "Machines"]]) {
      const option = element("option", name); option.value = value; kind.append(option);
    }
    const all = element("option", "All machines"); all.value = "all"; filter.append(all);
    for (const entry of [...catalog.entries.values()].filter(entry => entry.kind === "machine").sort((a, b) => a.name.localeCompare(b.name))) {
      const option = element("option", entry.name); option.value = entry.id; filter.append(option);
    }
    function applyFilters() {
      state = { ...capture(), query: query.value, kind: kind.value, machine: filter.value, listScroll: 0 };
      render();
    }
    query.addEventListener("input", applyFilters); kind.addEventListener("change", applyFilters); filter.addEventListener("change", applyFilters);
    $("recipeClear").addEventListener("click", () => { state = { ...capture(), query: "", kind: "all", machine: "all", listScroll: 0 }; render(); });
    $("recipeBack").addEventListener("click", () => history(back, forward));
    $("recipeForward").addEventListener("click", () => history(forward, back));
    render();
    return { open, refresh: () => { state = capture(); render(); } };
  }
  const api = { buildCatalog, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NoAmmoRecipes = api;
}(globalThis));
