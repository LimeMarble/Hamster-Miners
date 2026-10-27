(function () {
  "use strict";
  const A = window.NoAmmo, D = A.DATA, R = window.NoAmmoRenderer;
  const $ = (id) => document.getElementById(id);
  let factory, storageFailed = false;
  function backupTerrainSave(raw, loaded) {
    if (!loaded.terrainUpdated) return;
    const key = `${D.saveKey}-before-fixed-terrain-${D.startingTerrain.version}`;
    try { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }
    catch (error) { console.warn("Could not back up the old terrain save:", error); }
  }
  function terrainNotice() {
    return `Fixed tree map applied. ${factory.pickedUpForTerrainReset} placed machine(s) returned to inventory; their contents were recovered.`;
  }
  try { const save = localStorage.getItem(D.saveKey); factory = save ? A.Factory.importSave(save) : new A.Factory(); if (save) backupTerrainSave(save, factory); }
  catch (error) { factory = new A.Factory(); storageFailed = true; console.warn("Prototype save not loaded:", error); }
  const camera = { x: 0, y: 0, zoom: 1 }, viewport = { width: 0, height: 0 };
  let cameraReady = false;
  const interaction = { selected: null, selectedIds: [], tree: null, tool: null, group: null, box: null, marquee: null, hover: null };
  let activeTab = "factory", category = "All", shopSelection = "fiber", inspectorSignature = "", floorSignature = "";
  let inventoryTab = "machines", inventoryCategory = "All", inventorySelection = "planter", machineSignature = "";
  let gesture = null, suppressClick = false, shiftHeld = false;
  let shopSignature = "", itemSignature = "", pointer = null, toastTime = 0, lastFrame = 0, accumulator = 0, saveElapsed = 0;
  let overlaySignature = "";
  const floor = $("floor").getContext("2d"), overlay = $("cargo").getContext("2d");
  const machineCards = new Map(), cards = new Map();
  const number = A.formatNumber;
  const money = (value) => `$${number(value)}`;
  function appendMachineEffects(panel, definition) {
    for (const recipe of Object.values(definition.recipes ?? {})) if (recipe.gradeProfile) {
      panel.append(element("p", `Base grade chances: ${recipe.gradeProfile.map((chance, index) => `${D.grades[index].name} ${number(chance * 100)}%`).join(" · ")}`, "machine-effect"));
    }
    const effect = definition.cashEffect;
    if (!effect || typeof effect !== "object") return;
    const lines = [`Cash effect: ${effect.multiplier ? `×${number(effect.multiplier)}` : `+${money(effect.bonus)}`}`];
    if (effect.useLimit !== undefined) lines.push(`Use Limit: ${number(effect.useLimit)}`);
    if (effect.upperLimit !== undefined) lines.push(`Upper Limit: ${money(effect.upperLimit)}`);
    if (effect.baseValueRequired !== undefined) lines.push(`Base Value Required: ${money(effect.baseValueRequired)}`);
    if (definition.gradeEffect) lines.push(`Grade Effects: converts ${number(definition.gradeEffect.poorToStandardPerUse * 100)} percentage points of Poor chance to Standard per use on clay products (${number(definition.gradeEffect.useLimit)} uses).`);
    for (const line of lines) panel.append(element("p", line, "machine-effect"));
  }
  function text(element, value) { if (element && element.textContent !== value) element.textContent = value; }
  function renderOutputHistory(list, machine) {
    const history = factory.recentOutputs(machine.id), signature = JSON.stringify([machine.id, history]);
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature; list.replaceChildren();
    if (!history.length) { list.append(element("li", "No processed output yet.", "muted")); return; }
    for (const entry of history) {
      const value = entry.value === null ? "Unsellable" : Math.abs(entry.quantity - 1) < 1e-8 ? money(entry.value)
        : `${money(entry.value * entry.quantity)} total · ${number(entry.quantity)} × ${money(entry.value)}`;
      list.append(element("li", `${entry.grade ? `${entry.grade} · ` : ""}${value}`));
    }
  }
  function renderHoverHistory() {
    const tooltip = $("historyTooltip");
    const point = pointer && tile(pointer), machine = point && factory.at.get(A.key(point.x, point.y));
    const visible = activeTab === "factory" && shiftHeld && machine && A.supportsOutputHistory(machine.type)
      && !interaction.tool && !interaction.group && !gesture?.active && !interaction.box?.start
      && (!interaction.box || interaction.box.contextual);
    tooltip.hidden = !visible;
    if (!visible) return;
    text($("historyTooltipTitle"), `${D.machines[machine.type].name} · Last 5 outputs`);
    renderOutputHistory($("hoverOutputHistory"), machine);
    const width = Math.min(260, viewport.width - 16);
    tooltip.style.width = `${width}px`;
    const height = Math.min(tooltip.offsetHeight || 205, viewport.height - 16);
    tooltip.style.left = `${Math.max(8, Math.min(pointer.x + 14, viewport.width - width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(pointer.y + 14, viewport.height - height - 8))}px`;
  }
  function element(tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  }
  function action(label, fn, className) {
    const button = element("button", label, className); button.type = "button";
    button.addEventListener("click", fn); return button;
  }
  function notify(message) { text($("notice"), message); $("notice").classList.add("visible"); toastTime = performance.now() + 3500; }
  function result(value, message) { if (value?.error) notify(value.error); else if (message) notify(message); refresh(); }
  function save() {
    if (storageFailed) { text($("saveStatus"), "The unreadable saved prototype is preserved. Import or explicitly reset before saving over it."); return; }
    try { localStorage.setItem(D.saveKey, factory.exportSave()); text($("saveStatus"), "Prototype saved locally. Existing mine saves are unchanged."); }
    catch { text($("saveStatus"), "Local saving is unavailable. Export your prototype save to keep it."); }
  }
  function setTab(tab) {
    activeTab = tab;
    for (const screen of document.querySelectorAll(".screen")) screen.hidden = screen.id !== tab;
    for (const button of document.querySelectorAll("[data-tab]")) button.classList.toggle("active", button.dataset.tab === tab);
    pointer = null; interaction.hover = null;
    gesture = null; interaction.marquee = null; interaction.box = null; suppressClick = false;
    if (tab === "factory") { resize(); floorSignature = ""; }
    refresh();
  }
  function bounds() {
    const width = viewport.width / (R.TILE * camera.zoom), height = viewport.height / (R.TILE * camera.zoom);
    camera.x = Math.max(-3, Math.min(D.config.columns + 3 - width, camera.x));
    camera.y = Math.max(-3, Math.min(D.config.rows + 3 - height, camera.y));
  }
  function resize() {
    if (activeTab !== "factory") return;
    const rect = $("viewport").getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const resolution = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(rect.width * resolution), pixelHeight = Math.round(rect.height * resolution);
    if (cameraReady && viewport.width === rect.width && viewport.height === rect.height
      && $("floor").width === pixelWidth && $("floor").height === pixelHeight) return;
    // Hidden tabs have no meaningful viewport. Keep the viewed world centre,
    // and only establish the initial view once the floor has real dimensions.
    const centerX = cameraReady ? camera.x + viewport.width / (R.TILE * camera.zoom * 2) : D.config.columns / 2;
    const centerY = cameraReady ? camera.y + viewport.height / (R.TILE * camera.zoom * 2) : D.config.rows / 2;
    viewport.width = rect.width; viewport.height = rect.height;
    for (const canvas of [$("floor"), $("cargo")]) {
      canvas.width = pixelWidth; canvas.height = pixelHeight;
      canvas.getContext("2d").setTransform(resolution, 0, 0, resolution, 0, 0);
    }
    camera.x = centerX - viewport.width / (R.TILE * camera.zoom * 2);
    camera.y = centerY - viewport.height / (R.TILE * camera.zoom * 2);
    cameraReady = true;
    bounds(); floorSignature = ""; overlaySignature = "";
  }
  function home() { cameraReady = false; resize(); }
  function zoom(change, anchor) {
    const next = Math.max(0.5, Math.min(2, Math.round((camera.zoom + change) * 10) / 10));
    const p = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 };
    camera.x += p.x / R.TILE * (1 / camera.zoom - 1 / next);
    camera.y += p.y / R.TILE * (1 / camera.zoom - 1 / next);
    camera.zoom = next; bounds(); text($("zoomLabel"), `${Math.round(next * 100)}%`); floorSignature = "";
  }
  function build(type) {
    if (!(factory.state.stock[type] > 0)) { shopSelection = type; shopSignature = ""; setTab("shop"); return; }
    select([]); interaction.group = null; interaction.box = null;
    interaction.tool = { type, facing: D.machines[type].defaultFacing ?? "right",
      mode: factory.state.storedMachines.find((machine) => machine.type === type)?.mode ?? D.machines[type].defaultMode };
    setTab("factory"); inspectorSignature = ""; refresh();
  }
  function select(ids) {
    interaction.selectedIds = [...new Set(ids)].filter((id) => factory.byId.has(id));
    interaction.selected = interaction.selectedIds.length === 1 ? interaction.selectedIds[0] : null;
    interaction.tree = null;
  }
  function cancel() {
    if (interaction.box || gesture) { interaction.box = null; interaction.marquee = null; gesture = null; }
    else if (interaction.group || interaction.tool) { interaction.group = null; interaction.tool = null; }
    else { select([]); interaction.tree = null; }
    refresh();
  }
  function beginBox(contextual = false) {
    if (interaction.box) {
      if (!contextual) interaction.box.contextual = false;
      return;
    }
    interaction.tool = null; interaction.group = null;
    interaction.box = { start: null, end: null, add: false, contextual }; refresh();
  }
  function emptyTile(point) {
    const key = A.key(point.x, point.y);
    return !factory.at.has(key) && !factory.treeAt.has(key);
  }
  function collect(id) {
    const count = factory.collect(id);
    notify(`Collected ${number(count)} items.`); refresh();
  }
  function finishBox(start, end, add) {
    select([...(add ? interaction.selectedIds : []), ...factory.selectBox(start, end)]);
    interaction.box = null; interaction.marquee = null; refresh();
  }
  function beginGroupMove() {
    if (!interaction.selectedIds.length) return;
    interaction.tool = null; interaction.box = null;
    interaction.group = { ids: [...interaction.selectedIds], turns: 0 }; refresh();
  }
  function rotate(count) {
    if (interaction.group) interaction.group.turns = (interaction.group.turns + count + 4) % 4;
    else if (interaction.tool) interaction.tool.facing = A.turn(interaction.tool.facing, count);
    else if (interaction.selectedIds.length > 1) { beginGroupMove(); interaction.group.turns = (count + 4) % 4; }
    else {
      const machine = factory.byId.get(interaction.selected);
      if (machine) result(factory.move(machine.id, machine.x, machine.y, A.turn(machine.facing, count)));
    }
    refresh();
  }
  for (const [type, definition] of Object.entries(D.machines)) {
    const count = element("span", "0"), button = action("", () => { inventorySelection = type; renderInventory(); }, "shop-card");
    const inventorySwatch = element("i", undefined, "machine-swatch"); inventorySwatch.style.backgroundColor = definition.color;
    button.dataset.machine = type;
    button.append(inventorySwatch, element("strong", definition.name), count); $("machineCards").append(button); machineCards.set(type, { button, count });
  }
  const shopEntries = Object.entries(D.machines).sort(([, a], [, b]) => (a.cost?.cash ?? Infinity) - (b.cost?.cash ?? Infinity));
  for (const [type, definition] of shopEntries) {
    const card = action("", () => { shopSelection = type; shopSignature = ""; refresh(); }, "shop-card");
    card.dataset.machine = type;
    const swatch = element("i", undefined, "machine-swatch"); swatch.style.backgroundColor = definition.color;
    const owned = element("span", "Owned: 0"), bottom = element("small"); bottom.append(swatch, owned);
    card.append(element("strong", definition.name), element("span", definition.cost ? money(definition.cost.cash) : "Cost unset", "muted"), bottom);
    $("shopCards").append(card); cards.set(type, { card, owned });
  }
  for (const button of document.querySelectorAll("[data-tab]")) button.addEventListener("click", () => setTab(button.dataset.tab));
  for (const button of document.querySelectorAll("[data-inventory-tab]")) button.addEventListener("click", () => {
    inventoryTab = button.dataset.inventoryTab; renderInventory();
  });
  for (const button of document.querySelectorAll("[data-inventory-category]")) button.addEventListener("click", () => {
    inventoryCategory = button.dataset.inventoryCategory; renderInventory();
  });
  for (const button of document.querySelectorAll("[data-category]")) button.addEventListener("click", () => {
    category = button.dataset.category;
    for (const other of document.querySelectorAll("[data-category]")) other.classList.toggle("active", other === button);
    refresh();
  });
  $("openInventory").addEventListener("click", () => { inventoryTab = "machines"; setTab("inventory"); });
  $("boxSelect").addEventListener("click", () => { beginBox(); refresh(); });
  $("hireCrew").addEventListener("click", () => {
    const response = factory.hireCrew();
    if (!response.error) save();
    result(response, "Hired one hamster.");
  });
  $("rotateLeft").addEventListener("click", () => rotate(-1)); $("rotateRight").addEventListener("click", () => rotate(1));
  $("cancel").addEventListener("click", cancel); $("home").addEventListener("click", home);
  $("zoomIn").addEventListener("click", () => zoom(0.1)); $("zoomOut").addEventListener("click", () => zoom(-0.1));
  function position(event) {
    const rect = $("cargo").getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function tile(point) { return { x: Math.floor(camera.x + point.x / (R.TILE * camera.zoom)), y: Math.floor(camera.y + point.y / (R.TILE * camera.zoom)) }; }
  $("cargo").addEventListener("pointerdown", (event) => {
    if (activeTab !== "factory" || (event.button ?? 0) !== 0) return;
    suppressClick = false;
    const pixel = position(event), point = tile(pixel);
    const explicitBox = interaction.box && (!interaction.box.contextual || interaction.box.start);
    if (!interaction.tool && !interaction.group && (explicitBox || emptyTile(point))) {
      gesture = { pixel, start: point, add: Boolean(event.shiftKey), active: false };
    }
  });
  $("cargo").addEventListener("pointermove", (event) => {
    pointer = position(event); interaction.hover = tile(pointer);
    if (typeof event.shiftKey === "boolean") shiftHeld = event.shiftKey;
    if (gesture) {
      if (Math.hypot(pointer.x - gesture.pixel.x, pointer.y - gesture.pixel.y) >= 8) gesture.active = true;
      if (gesture.active) interaction.marquee = { start: gesture.start, end: interaction.hover };
    }
    if (interaction.box?.start) interaction.box.end = interaction.hover;
    renderHoverHistory();
  });
  $("cargo").addEventListener("pointerup", (event) => {
    if (!gesture) return;
    if (gesture.active) {
      finishBox(gesture.start, tile(position(event)), gesture.add || Boolean(event.shiftKey) || Boolean(interaction.box?.add));
      suppressClick = true;
    }
    gesture = null;
  });
  window.addEventListener("pointerup", (event) => {
    if (event.target !== $("cargo")) { gesture = null; interaction.marquee = null; }
  });
  $("cargo").addEventListener("pointercancel", () => { gesture = null; interaction.marquee = null; });
  $("cargo").addEventListener("pointerleave", () => { pointer = null; interaction.hover = null; renderHoverHistory(); });
  $("cargo").addEventListener("contextmenu", (event) => { event.preventDefault(); cancel(); });
  $("cargo").addEventListener("click", (event) => {
    if (activeTab !== "factory") return;
    if (suppressClick) { suppressClick = false; return; }
    const point = tile(position(event)), tool = interaction.tool;
    const contextual = (interaction.box?.contextual && !interaction.box.start)
      || (!interaction.box && !tool && !interaction.group && event.shiftKey);
    if (contextual) {
      if (emptyTile(point)) {
        if (!interaction.box) beginBox(true);
      } else {
        interaction.box = null; gesture = null; interaction.marquee = null;
        const machine = factory.at.get(A.key(point.x, point.y));
        const otherSelected = interaction.tree || interaction.selectedIds.some((id) => id !== machine?.id);
        if (machine && !otherSelected && D.machines[machine.type].quickAction === "collect") {
          collect(machine.id); return;
        }
        // Shift adds buildings to the selection without invoking their quick action.
        // Do not accidentally chop a tree or collect a different selected Basket.
        select(machine ? [...interaction.selectedIds, machine.id] : []);
        interaction.tree = machine ? null : factory.treeAt.get(A.key(point.x, point.y))?.id ?? null;
        refresh(); return;
      }
    }
    if (interaction.box) {
      if (!interaction.box.start) { interaction.box.start = point; interaction.box.end = point; interaction.box.add = Boolean(event.shiftKey); refresh(); }
      else finishBox(interaction.box.start, point, interaction.box.add || Boolean(event.shiftKey));
      return;
    }
    if (interaction.group) {
      const { ids, turns } = interaction.group, response = factory.moveGroup(ids, point.x, point.y, turns);
      if (response.error) return notify(response.error);
      interaction.group = null; select(ids);
    } else if (tool) {
      const response = tool.id ? factory.move(tool.id, point.x, point.y, tool.facing) : factory.place(tool.type, point.x, point.y, tool.facing);
      if (response.error) return notify(response.error);
      if (tool.id || !factory.state.stock[tool.type]) interaction.tool = null;
      else tool.mode = factory.state.storedMachines.find((machine) => machine.type === tool.type)?.mode ?? D.machines[tool.type].defaultMode;
      select([response.machine.id]);
    } else {
      const machine = factory.at.get(A.key(point.x, point.y)), tree = factory.treeAt.get(A.key(point.x, point.y));
      select(machine ? [machine.id] : []); interaction.tree = machine ? null : tree?.id ?? null;
      if (interaction.tree) chop(interaction.tree);
    }
    inspectorSignature = ""; refresh();
  });
  $("cargo").addEventListener("wheel", (event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 0.1 : -0.1, position(event)); }, { passive: false });
  function chop(id) { const response = factory.chop(id); if (response.wood) notify(`+${response.wood} Wood`); refresh(); }
  document.addEventListener("keydown", (event) => {
    const target = event.target ?? document.activeElement;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName) || target?.isContentEditable) return;
    if (event.key === "Shift") { shiftHeld = true; renderHoverHistory(); }
    if (event.key === "Escape") cancel();
    if (activeTab !== "factory") return;
    if (event.key === "Shift" && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && !interaction.tool && !interaction.group) {
      event.preventDefault(); beginBox(true);
    }
    if (event.key.toLowerCase() === "q") rotate(-1);
    if (event.key.toLowerCase() === "e") rotate(1);
  });
  document.addEventListener("keyup", (event) => { if (event.key === "Shift") { shiftHeld = false; renderHoverHistory(); } });
  window.addEventListener("blur", () => { shiftHeld = false; pointer = null; renderHoverHistory(); });
  function renderInspector() {
    const machine = factory.byId.get(interaction.selected), tree = factory.state.trees.find((entry) => entry.id === interaction.tree);
    const signature = `${interaction.selectedIds.join(",")}:${tree?.id ?? ""}:${factory.layoutVersion}:${Boolean(interaction.tool)}:${Boolean(interaction.group)}`;
    if (signature !== inspectorSignature) {
      inspectorSignature = signature; const panel = $("inspector"); panel.replaceChildren();
      if (interaction.selectedIds.length > 1) {
        panel.append(element("h2", `${interaction.selectedIds.length} machines selected`));
        const controls = element("div", undefined, "row");
        const move = action("Move", beginGroupMove); move.id = "moveGroup";
        const pickup = action("Pick up", () => {
          const response = factory.pickupGroup(interaction.selectedIds);
          if (response.error) return notify(response.error);
          select([]); interaction.group = null; interaction.box = null; interaction.marquee = null; gesture = null; refresh();
        }, "secondary"); pickup.id = "pickupGroup";
        controls.append(move, pickup); panel.append(controls,
          element("p", "Q/E or Rotate turns the group. Tap a valid position to place it; Cancel leaves the original machines unchanged."));
      } else if (tree) {
        panel.append(element("h2", "Woodland tree"), element("p", "Inexhaustible. Five chops harvest 1–5 Wood. The five-clicks/second cap is shared across every tree."));
        const counter = element("div", undefined, "tree-chops"); counter.id = "chopCounter";
        for (let i = 0; i < 5; i++) counter.append(element("i"));
        panel.append(counter, action("Chop tree", () => chop(tree.id)), element("p", "Loggers go inside the four middle edge tiles and face outward."));
      } else if (machine) {
        const definition = D.machines[machine.type];
        const status = element("p", "", "status"); status.id = "machineStatus";
        panel.append(element("h2", definition.name), status, element("p", definition.description));
        appendMachineEffects(panel, definition);
        if (A.supportsOutputHistory(machine.type)) {
          const history = element("ol", undefined, "output-history"); history.id = "outputHistory";
          panel.append(element("h3", "Last 5 outputs · newest first"), history);
        }
        const controls = element("div", undefined, "row");
        const move = action("Move", () => {
          interaction.box = null; interaction.marquee = null; gesture = null;
          interaction.tool = { type: machine.type, id: machine.id, facing: machine.facing, mode: machine.mode }; refresh();
        }); move.id = "moveMachine";
        const pickup = action("Pick up", () => {
          factory.pickup(machine.id); select([]); interaction.tool = null; interaction.box = null; interaction.marquee = null; gesture = null; refresh();
        }, "secondary"); pickup.id = "pickupMachine";
        controls.append(move, pickup);
        panel.append(controls);
        if (definition.crew) panel.append(element("p", `${definition.crew} crew assigned`));
        if (definition.manualTransferSeconds) {
          const label = element("label", "Overflow side "), mode = element("select");
          mode.id = "overflowMode"; mode.setAttribute("aria-label", "Overflow side");
          for (const [id, name] of [["up", "Left"], ["down", "Right"]]) {
            const option = element("option", name); option.value = id; mode.append(option);
          }
          mode.value = machine.mode;
          mode.addEventListener("change", () => {
            const response = factory.setOverflowMode(machine.id, mode.value);
            if (response.error) mode.value = machine.mode;
            else if (interaction.tool?.id === machine.id) interaction.tool.mode = machine.mode;
            result(response);
          });
          label.append(mode); panel.append(label);
        }
        if (definition.heatCapacity) {
          const heat = element("p"); heat.id = "kilnHeat";
          const buffers = element("p"); buffers.id = "kilnBuffers";
          panel.append(heat, buffers, element("p", machine.type === "kiln"
            ? "Full batches only. Each firing consumes 80ku of heat when it starts; Wood provides 30ku and Charcoal provides 240ku. Either input accepts fuel or unfired products."
            : "Full batches only. Charcoal mode uses Wood as its ingredient, without external heat. Copper mode accepts fuel through either input and consumes 500ku per batch. Connect the output directly to an Ingot Molder.", "muted"));
          if (definition.manualRecipes) {
            const label = element("label", "Furnace mode "), mode = element("select");
            mode.id = "furnaceMode"; mode.setAttribute("aria-label", "Furnace mode");
            for (const [id, recipe] of Object.entries(definition.recipes)) {
              const option = element("option", `${recipe.name} · ${recipe.seconds}s`); option.value = id; mode.append(option);
            }
            mode.value = machine.mode;
            mode.addEventListener("change", () => result(factory.setFurnaceMode(machine.id, mode.value)));
            label.append(mode); panel.append(label, element("p", "Changing mode returns waiting ingredients to inventory. The current batch finishes normally, and finished output stays in the furnace.", "muted"));
          }
        }
        if (machine.type === "potSpinner") {
          const buffers = element("p"); buffers.id = "spinnerBuffers";
          panel.append(buffers);
        }
        if (machine.type === "crudeGearBench") {
          const buffers = element("p"); buffers.id = "gearBuffers"; panel.append(buffers);
        }
        if (definition.molder) {
          const buffers = element("p"); buffers.id = "molderBuffers";
          panel.append(buffers, element("p", "One ingot per second, preserving the liquid metal's value. No Clay or other consumables. Cast Iron requires a Refractory Caster.", "muted"));
        }
        if (definition.maxStackSize) {
          const label = element("label", "Stack size "), input = element("input");
          input.id = "stackSize"; input.type = "number"; input.min = "1";
          input.max = String(definition.maxStackSize); input.step = "1";
          input.setAttribute("aria-label", "Stack size"); input.value = machine.stackSize;
          input.addEventListener("change", () => {
            const changed = factory.setStackSize(machine.id, input.value);
            if (changed.error) input.value = machine.stackSize;
            result(changed);
          });
          label.append(input); panel.append(label);
        }
        if (machine.type === "clayShaper") {
          const label = element("label", "Shaping mode "), mode = element("select");
          mode.id = "shapingMode"; mode.setAttribute("aria-label", "Shaping mode");
          for (const [id, recipe] of Object.entries(definition.recipes)) {
            const option = element("option", `${recipe.name} · ${recipe.input} Clay · ${recipe.seconds}s`);
            option.value = id; mode.append(option);
          }
          mode.value = machine.mode;
          mode.addEventListener("change", () => result(factory.setShapingMode(machine.id, mode.value)));
          const buffers = element("p"); buffers.id = "shapingBuffers";
          label.append(mode); panel.append(label, buffers, element("p", "Mode changes apply to the next job. The lower working tile accepts Clay from behind and outputs in the facing direction.", "muted"));
        }
        if (machine.type === "gradingBench") {
          const chance = element("p"); chance.id = "gradingChances";
          panel.append(element("p", "One grade roll per stack, at one second per total weight. Uses one hamster. Graded stacks cannot be graded again."), chance);
        }
        if (definition.sourceModes) {
          const label = element("label", "Extraction mode "), mode = element("select");
          mode.id = "extractionMode"; mode.setAttribute("aria-label", "Extraction mode");
          for (const [id, name] of Object.entries(definition.sourceModes)) {
            const option = element("option", name); option.value = id; mode.append(option);
          }
          mode.value = machine.mode;
          mode.addEventListener("change", () => result(factory.setSourceMode(machine.id, mode.value)));
          label.append(mode); panel.append(label);
        }
        if (A.collectorCapacity(machine)) {
          const contents = element("div", undefined, "basket-counts"); contents.id = "basketContents";
          const collectButton = action("Collect all", () => collect(machine.id)); collectButton.id = "collectBasket";
          collectButton.title = "Shift-click this collector to collect all, unless another object is selected.";
          panel.append(contents, collectButton, element("p", "Shortcut: Shift-click to collect all. If another building is selected, Shift-click adds this collector to the selection.", "muted"));
        }
        if (machine.type === "primitive") panel.append(
          element("p", `Cash effect: +${money(factory.state.tuning.primitiveBonus)}`, "machine-effect"),
          element("p", `Upper Limit: ${money(factory.state.tuning.primitiveLimit)}`, "machine-effect"));
      } else {
        panel.append(element("h2", "Opening factory"), element("p", "Open Inventory → Machines to place your two free Leek Planters, Basket and Sell Tube. Click trees to gather Wood."),
          element("p", "Shift-click empty ground to start two-tap box selection. Shift-click another building to add it to your selection. With no other building selected, Shift-click a Basket to collect all. Box select can start anywhere."),
          element("p", "Use Q/E or the visible Rotate buttons. Placement continues while you still own that machine. Cancel or right-click to stop."));
        const help = element("details", undefined, "opening-help"), list = element("ol");
        help.append(element("summary", "Getting started"));
        for (const line of ["Point the Planter’s edge output into the Basket. It grows one Leek every 8 seconds.", "A Fiber Extractor costs 30 Wood and 1 Leek, with no cash requirement. Chop trees for Wood and collect a Leek from your Basket.", "Put the Extractor between the Planter and Basket.", "Build manual Clay Pits for $5 and 100 Wood each. Point their output directly into the free Sell Tube to earn $0.25 per Clay.", "Five tree chops harvest 1–5 Wood, at most five chops per second.", "A Crude Gear Bench costs 25 Wood. Point a Logger directly into the Bench to carve gears before building conveyors.", "Primitive Conveyors cost 10 Wood and 4 Wooden Gears. Machines with internal belts use purchased conveyors as components.", "Build a Wheel and Drive using materials, then buy Primitive Upgraders for $2 each. Connect the Drive’s intake to a long Wheel edge."]) list.append(element("li", line));
        help.append(list); panel.append(help);
      }
    }
    if (tree) for (const [index, marker] of [...$("chopCounter").children].entries()) marker.classList.toggle("done", index < factory.state.harvestProgress);
    if (machine) {
      text($("machineStatus"), factory.status(machine));
      if (A.supportsOutputHistory(machine.type)) renderOutputHistory($("outputHistory"), machine);
      if (machine.type === "potSpinner") text($("spinnerBuffers"), `Waiting Clay: ${number(factory.total(machine, "input"))} / 2 · Finished pots: ${number(factory.total(machine, "output"))} / 1`);
      if (machine.type === "clayShaper") text($("shapingBuffers"), `Waiting Clay: ${number(factory.total(machine, "input"))} / ${number(D.machines.clayShaper.inputLimit)} · Finished items: ${number(factory.total(machine, "output"))} / 1`);
      if (machine.type === "gradingBench") {
        const item = machine.job?.input ?? machine.input[0] ?? machine.output[0] ?? A.cargo("clay");
        const probabilities = A.gradeProbabilities(item);
        text($("gradingChances"), `${D.materials[item.material].name}: ${probabilities.map((chance, index) => `${D.grades[index].name} ${number(chance * 100)}%`).join(" · ")}`);
      }
      if (D.machines[machine.type].heatCapacity) {
        text($("kilnHeat"), `Heat: ${number(machine.heat)} / ${number(D.machines[machine.type].heatCapacity)}u`);
        text($("kilnBuffers"), `Waiting inputs: ${number(factory.total(machine, "input"))} · Finished products: ${number(factory.total(machine, "output"))}`);
      }
      if (machine.type === "crudeGearBench") text($("gearBuffers"), `Waiting Wood: ${number(factory.total(machine, "input"))} / 2 · Finished gears: ${number(factory.total(machine, "output"))} / 1`);
      if (D.machines[machine.type].molder) text($("molderBuffers"), `Waiting liquid: ${number(factory.total(machine, "input"))} / 1 · Finished ingots: ${number(factory.total(machine, "output"))} / 1`);
      if (A.collectorCapacity(machine)) {
        const totals = new Map();
        for (const item of machine.contents) {
          const grade = A.gradeLabel(item), label = `${D.materials[item.material].name}${grade ? ` · ${grade}` : ""}`;
          totals.set(label, (totals.get(label) ?? 0) + item.quantity);
        }
        const signature = JSON.stringify([...totals]);
        if ($("basketContents").dataset.signature !== signature) {
          $("basketContents").dataset.signature = signature; $("basketContents").replaceChildren();
          for (const [label, quantity] of totals) { const line = element("div"); line.append(element("span", label), element("strong", number(quantity))); $("basketContents").append(line); }
        }
        $("collectBasket").disabled = machine.contents.length === 0;
      }
    }
  }
  function renderShop() {
    for (const [type, entry] of cards) {
      entry.card.hidden = category !== "All" && D.machines[type].category !== category;
      entry.card.classList.toggle("selected", type === shopSelection);
      const count = factory.state.stock[type] + factory.state.machines.filter((machine) => machine.type === type).length;
      text(entry.owned, `Owned: ${number(count)}`);
    }
    if (!shopSelection) return;
    const definition = D.machines[shopSelection], panel = $("shopDetail");
    if (shopSignature !== shopSelection) {
      shopSignature = shopSelection; panel.replaceChildren(element("h2", definition.name), element("p", definition.description));
      appendMachineEffects(panel, definition);
      const defaultSize = A.size({ type: shopSelection, facing: definition.defaultFacing ?? "right" });
      panel.append(element("p", `${defaultSize.width}×${defaultSize.height} default footprint${definition.crew ? ` · ${definition.crew} crew` : ""}`, "muted"));
      const owned = element("p"); owned.id = "shopOwned"; panel.append(owned);
      const quantity = element("input"); quantity.id = "quantity"; quantity.type = "number"; quantity.min = "1"; quantity.max = "9999"; quantity.value = "1";
      const label = element("label", "Purchase amount "); label.append(quantity); panel.append(label);
      quantity.addEventListener("input", renderShop);
      const costs = element("div", undefined, "costs"); costs.id = "costs"; panel.append(costs);
      const buy = action(definition.cost ? "Buy" : "Borrow unpriced test equipment", () => {
        const amount = Number(quantity.value);
        if (definition.cost) result(factory.buy(shopSelection, amount), `Purchased ${number(amount)} ${definition.name}.`);
        else {
          if (!factory.borrow(shopSelection, amount)) notify("Choose 1–100 borrowed test machines.");
          else { notify("Borrowed unpriced prototype equipment; no game price assigned."); refresh(); }
        }
      }); buy.id = "buyMachine";
      panel.append(buy, action("Place owned", () => build(shopSelection), "secondary"));
      if (!definition.cost) panel.append(element("p", "This item's cost is unsettled. Borrowing is a prototype test aid, not its actual recipe.", "muted"));
      if (shopSelection === "planter") panel.append(element("p", "Your first two Planters are supplied free. Additional Planters require the listed cost.", "muted"));
    }
    const count = factory.state.stock[shopSelection], total = count + factory.state.machines.filter((machine) => machine.type === shopSelection).length;
    text($("shopOwned"), `Owned: ${number(total)} · available to place: ${number(count)}`);
    const amount = Number($("quantity").value), valid = Number.isInteger(amount) && amount >= 1 && amount <= 9999;
    const entries = definition.cost ? [["Cash", factory.state.cash, definition.cost.cash],
      ...Object.entries(definition.cost.materials).map(([id, needed]) => [D.materials[id].name, factory.state.inventory[id], needed]),
      ...Object.entries(definition.cost.machines ?? {}).map(([id, needed]) => [D.machines[id].name, factory.state.stock[id], needed])] : [];
    const signature = JSON.stringify([entries, amount]);
    if ($("costs").dataset.signature !== signature) {
      $("costs").dataset.signature = signature; $("costs").replaceChildren();
      for (const [name, owned, needed] of entries) {
        const line = element("div", undefined, `cost-line${owned + 1e-8 < needed * amount ? " insufficient" : ""}`);
        line.append(element("span", name), element("span", `${name === "Cash" ? money(owned) : number(owned)} / ${name === "Cash" ? money(needed * amount) : number(needed * amount)}`)); $("costs").append(line);
      }
    }
    $("buyMachine").disabled = !valid || (definition.cost ? Boolean(factory.affordability(shopSelection, amount)) : amount > 100);
  }
  function renderItems() {
    const signature = JSON.stringify(factory.state.inventory);
    if (itemSignature === signature) return;
    itemSignature = signature; $("itemCards").replaceChildren();
    for (const [material, quantity] of Object.entries(factory.state.inventory)) {
      if (quantity <= 0) continue;
      const definition = D.materials[material], card = element("article", undefined, "item-card");
      const swatch = element("i", undefined, "machine-swatch"); swatch.style.backgroundColor = definition.color;
      card.append(swatch, element("h2", definition.name), element("strong", number(quantity)));
      if (definition.value !== null) {
        card.append(element("p", `${money(definition.value)} each from inventory`, "muted"));
        card.append(action("Sell all", () => { notify(`Sold for ${money(factory.sellInventory(material, quantity))}.`); refresh(); }));
        card.append(action("Sell 10", () => { notify(`Sold for ${money(factory.sellInventory(material, 10))}.`); refresh(); }, "secondary"));
      }
      $("itemCards").append(card);
    }
    if (!$("itemCards").children.length) $("itemCards").append(element("p", "Inventory is empty. Collect a Basket or chop a tree."));
  }
  function renderInventory() {
    $("machineInventory").hidden = inventoryTab !== "machines";
    $("itemInventory").hidden = inventoryTab !== "items";
    for (const button of document.querySelectorAll("[data-inventory-tab]")) button.classList.toggle("active", button.dataset.inventoryTab === inventoryTab);
    for (const button of document.querySelectorAll("[data-inventory-category]")) button.classList.toggle("active", button.dataset.inventoryCategory === inventoryCategory);
    if (inventoryTab === "items") { renderItems(); return; }
    const visible = [];
    for (const [type, entry] of machineCards) {
      const available = factory.state.stock[type], total = available + factory.state.machines.filter((machine) => machine.type === type).length;
      entry.button.hidden = total === 0 || (inventoryCategory !== "All" && D.machines[type].category !== inventoryCategory);
      if (!entry.button.hidden) visible.push(type);
      text(entry.count, `Owned: ${number(total)} · available: ${number(available)}`);
    }
    if (!visible.includes(inventorySelection)) inventorySelection = visible[0] ?? null;
    for (const [type, entry] of machineCards) entry.button.classList.toggle("selected", type === inventorySelection);
    $("machineEmpty").hidden = visible.length > 0;
    const panel = $("machineDetail"); panel.hidden = !inventorySelection;
    if (!inventorySelection) return;
    if (machineSignature !== inventorySelection) {
      machineSignature = inventorySelection;
      const definition = D.machines[inventorySelection], bounds = A.size({ type: inventorySelection, facing: definition.defaultFacing ?? "right" });
      panel.replaceChildren(element("h2", definition.name), element("p", definition.description), element("p", `${bounds.width}×${bounds.height} default footprint`, "muted"));
      appendMachineEffects(panel, definition);
      const owned = element("p"); owned.id = "inventoryOwned";
      const place = action("Place", () => build(inventorySelection)); place.id = "placeMachine";
      panel.append(owned, place, action("View in Shop", () => { shopSelection = inventorySelection; shopSignature = ""; setTab("shop"); }, "secondary"));
    }
    const available = factory.state.stock[inventorySelection], placed = factory.state.machines.filter((machine) => machine.type === inventorySelection).length;
    text($("inventoryOwned"), `Owned: ${number(available + placed)} · available to place: ${number(available)}`);
    $("placeMachine").disabled = available < 1;
  }
  function refresh() {
    if (interaction.selectedIds.some((id) => !factory.byId.has(id))) {
      select(interaction.selectedIds.filter((id) => factory.byId.has(id)));
    }
    if (interaction.tool?.id && !factory.byId.has(interaction.tool.id)) interaction.tool = null;
    if (interaction.group?.ids.some((id) => !factory.byId.has(id))) interaction.group = null;
    text($("cash"), money(factory.state.cash)); text($("crew"), `${factory.availableCrew()} / ${factory.totalCrew()}`);
    const hireCost = factory.crewHireCost();
    text($("hireCrew"), `Hire · ${Number.isFinite(hireCost) ? money(hireCost) : "—"}`);
    $("hireCrew").disabled = !factory.canHireCrew();
    text($("toolLabel"), interaction.box ? interaction.box.start ? "Tap the opposite corner" : interaction.box.contextual ? "Tap empty ground to box-select, or an object for its Shift action" : "Tap the first corner"
      : interaction.group ? `Moving ${interaction.group.ids.length} machines · Q/E rotates the group`
      : interaction.tool ? `${interaction.tool.id ? "Moving" : "Placing"} ${D.machines[interaction.tool.type].name} · ${interaction.tool.facing}` : "Select a machine or click a tree");
    $("cancel").disabled = !(interaction.tool || interaction.group || interaction.box || interaction.selectedIds.length || interaction.tree);
    text($("cancel"), interaction.box ? "Cancel selection" : interaction.group || interaction.tool ? "Cancel" : "Clear selection");
    if (activeTab === "factory") renderInspector();
    if (activeTab === "shop") renderShop();
    if (activeTab === "inventory") renderInventory();
    renderHoverHistory();
  }
  $("export").addEventListener("click", () => { $("saveText").value = factory.exportSave(); $("saveText").select(); save(); });
  $("import").addEventListener("click", () => {
    try { const replacement = A.Factory.importSave($("saveText").value); backupTerrainSave($("saveText").value, replacement); factory = replacement; storageFailed = false;
      select([]); interaction.tool = null; interaction.group = null; interaction.box = null; interaction.marquee = null; gesture = null;
      inspectorSignature = ""; floorSignature = ""; itemSignature = ""; shopSignature = ""; machineSignature = "";
      save(); refresh(); notify(factory.terrainUpdated ? terrainNotice() : factory.recoveredForPlanterResize
        ? `Save imported. ${factory.recoveredForPlanterResize} overlapping machine(s) returned to inventory for the corrected footprints.`
        : factory.reorientedForFiberResize ? "Save imported. Fiber Extractor inputs and outputs now share the lower working tile." : "Prototype save imported.");
    } catch (error) { notify(error.message); }
  });
  $("reset").addEventListener("click", () => {
    if (!window.confirm("Reset only this opening prototype? Existing mining saves will not be changed.")) return;
    factory = new A.Factory(); storageFailed = false; select([]); interaction.tool = null; interaction.group = null; interaction.box = null; interaction.marquee = null; gesture = null;
    inspectorSignature = ""; floorSignature = ""; itemSignature = ""; shopSignature = ""; machineSignature = "";
    home(); save(); refresh();
  });
  window.addEventListener("resize", resize); window.addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); lastFrame = performance.now(); });
  new ResizeObserver(resize).observe($("viewport"));
  function frame(now) {
    const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.25) : 0; lastFrame = now;
    if (!document.hidden) {
      accumulator += elapsed;
      if (accumulator >= 0.1) { factory.update(accumulator); saveElapsed += accumulator; accumulator = 0; refresh(); }
      if (saveElapsed >= 5) { saveElapsed = 0; save(); }
      if (activeTab === "factory" && viewport.width) {
        if (pointer) {
          const edge = 30, speed = 8 / camera.zoom;
          if (pointer.x < edge) camera.x -= elapsed * speed;
          if (pointer.x > viewport.width - edge) camera.x += elapsed * speed;
          if (pointer.y < edge) camera.y -= elapsed * speed;
          if (pointer.y > viewport.height - edge) camera.y += elapsed * speed;
          bounds(); interaction.hover = tile(pointer);
          if (interaction.box?.start) interaction.box.end = interaction.hover;
          if (gesture?.active) interaction.marquee = { start: gesture.start, end: interaction.hover };
        }
        const signature = `${factory.layoutVersion}:${camera.x}:${camera.y}:${camera.zoom}:${viewport.width}:${viewport.height}`;
        if (floorSignature !== signature) { floorSignature = signature; R.drawFloor(floor, factory, camera, viewport); renderHoverHistory(); }
        const cargoSignature = `${signature}:${factory.state.seconds}:${interaction.selectedIds.join(",")}:${interaction.tree}:${JSON.stringify(interaction.tool)}:${JSON.stringify(interaction.group)}:${JSON.stringify(interaction.box)}:${JSON.stringify(interaction.marquee)}:${JSON.stringify(interaction.hover)}`;
        if (overlaySignature !== cargoSignature) { overlaySignature = cargoSignature; R.drawOverlay(overlay, factory, camera, viewport, interaction); }
      }
    }
    if (toastTime && now >= toastTime) { $("notice").classList.remove("visible"); toastTime = 0; }
    requestAnimationFrame(frame);
  }
  resize(); refresh();
  if (storageFailed) notify("A saved prototype could not be loaded. It has not been overwritten; export or import a valid save before continuing.");
  else if (factory.terrainUpdated) notify(terrainNotice());
  else if (factory.recoveredForPlanterResize) notify(`${factory.recoveredForPlanterResize} overlapping machine(s) returned to inventory for the corrected footprints. Their contents were recovered.`);
  else if (factory.reorientedForFiberResize) notify("Fiber Extractor layouts corrected; reconnect their working tile. Contents are preserved.");
  if (!storageFailed) save();
  requestAnimationFrame(frame);
}());
