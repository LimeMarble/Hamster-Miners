(function () {
  "use strict";
  const A = window.NoAmmo, D = A.DATA, R = window.NoAmmoRenderer;
  const $ = (id) => document.getElementById(id);
  let factory, storageFailed = false, protectedSave = null, loadFailure = null;
  function syncCapitalUnlock(target) {
    if (localStorage.getItem(D.capitalSaveKey) === "1") target.state.capitalUnlocked = true;
    else if (target.state.capitalUnlocked) localStorage.setItem(D.capitalSaveKey, "1");
  }
  function backupBeforeMigration(raw) {
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
    const prefix = `${D.saveKey}-before-migration-${(hash >>> 0).toString(36)}`;
    let key = prefix, suffix = 0;
    while (localStorage.getItem(key) !== null && localStorage.getItem(key) !== raw) key = `${prefix}-${++suffix}`;
    if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
  }
  function backupTerrainSave(raw, loaded) {
    if (!loaded.terrainUpdated) return;
    const key = `${D.saveKey}-before-fixed-terrain-${D.startingTerrain.version}`;
    try { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }
    catch (error) { console.warn("Could not back up the old terrain save:", error); }
  }
  function terrainNotice() {
    return `Fixed tree map applied. ${factory.pickedUpForTerrainReset} placed machine(s) returned to inventory; their contents were recovered.`;
  }
  try {
    protectedSave = localStorage.getItem(D.saveKey);
    factory = protectedSave ? A.Factory.importSave(protectedSave) : new A.Factory();
    syncCapitalUnlock(factory);
    if (protectedSave) {
      const previous = JSON.parse(protectedSave);
      if (JSON.stringify(previous.state) !== JSON.stringify(factory.state)) backupBeforeMigration(protectedSave);
      backupTerrainSave(protectedSave, factory);
    }
  } catch (error) {
    if (!factory) factory = new A.Factory();
    storageFailed = true; loadFailure = error.message; console.warn("Factory save not loaded or backed up:", error);
  }
  const camera = { x: 0, y: 0, zoom: 1 }, viewport = { width: 0, height: 0 };
  let cameraReady = false;
  const interaction = { selected: null, selectedIds: [], tree: null, tool: null, group: null, box: null, marquee: null, hover: null };
  let activeTab = "factory", category = "All", shopSelection = "fiber", inspectorSignature = "", floorSignature = "";
  let runeCategory = "harvest";
  let inventoryTab = "machines", inventoryCategory = "All", inventorySelection = "planter", machineSignature = "";
  let dismantledSelection = null;
  let gesture = null, suppressClick = false, shiftHeld = false, waterSelecting = null;
  let shopSignature = "", itemSignature = "", pointer = null, toastTime = 0, lastFrame = 0, accumulator = 0, saveElapsed = 0;
  let overlaySignature = "";
  let lastSimulation = performance.now();
  function resetSimulationClock() {
    lastSimulation = performance.now(); accumulator = 0; saveElapsed = 0;
  }
  function advanceSimulation(now) {
    accumulator += Math.max(0, (now - lastSimulation) / 1000);
    lastSimulation = Math.max(lastSimulation, now);
    let changed = false;
    // Timers in hidden tabs may wake late. Replay normal factory steps,
    // splitting long gaps because Factory.update accepts at most 60 seconds.
    while (accumulator >= 0.1) {
      const seconds = Math.min(accumulator, 60);
      factory.update(seconds); accumulator -= seconds; saveElapsed += seconds;
      changed = true;
    }
    if (saveElapsed >= 5) { saveElapsed = 0; save(); }
    return changed;
  }
  const floor = $("floor").getContext("2d"), overlay = $("cargo").getContext("2d");
  const machineCards = new Map(), cards = new Map();
  const number = A.formatNumber;
  $("gradeMultipliers").textContent = D.grades.map((grade) => `${grade.name} ×${number(grade.multiplier)}`).join(" · ");
  const money = (value) => `$${number(value)}`;
  const recipeBook = window.NoAmmoRecipes.mount({ document, data: D, formatNumber: number,
    primitiveEffect: () => factory.state.tuning,
    openShop: (type) => {
      shopSelection = type; shopSignature = ""; category = "All";
      for (const button of document.querySelectorAll("[data-category]")) button.classList.toggle("active", button.dataset.category === "All");
      setTab("shop");
    } });
  function viewRecipes(type) { recipeBook.open(`machine:${type}`); setTab("recipes"); }
  function appendMachineEffects(panel, definition) {
    if (definition.electricPower) panel.append(element("p", `Electricity demand: ${number(definition.electricPower)}u${definition.conveyors ? ", including internal conveyors" : ""}.`, "machine-effect"));
    if (definition.electricOutput) panel.append(element("p", `Electricity supply: ${number(definition.electricOutput)}u with both kinetic inputs connected.`, "machine-effect"));
    if (definition.electricPower || definition.electricOutput) panel.append(element("p", "Generators share one factory-wide supply. All electric machines pause when total demand exceeds supply.", "muted"));
    if (definition.electricPower && definition.conveyors) panel.append(element("p", `Conveyor: weight capacity ${number(definition.beltWeight)} · ${number(definition.beltSeconds)}s per tile · one cargo stack per tile.`, "machine-effect"));
    for (const recipe of Object.values(definition.recipes ?? {})) if (recipe.gradeProfile) {
      panel.append(element("p", `Starting grade chances before inherited treatments: ${recipe.gradeProfile.map((chance, index) => `${D.grades[index].name} ${number(chance * 100)}%`).join(" · ")}`, "machine-effect"));
    }
    for (const [input, recipe] of Object.entries(definition.recipes ?? {})) if (recipe.gradePromotion) {
      const ceiling = recipe.gradePromotionCeiling ?? D.grades.length - 1;
      const transitions = D.grades.slice(0, ceiling).map((grade, index) => `${grade.name} → ${D.grades[index + 1].name}`).join(", ");
      panel.append(element("p", `${D.materials[recipe.output]?.name ?? input} grade effect: moves ${number(recipe.gradePromotion * 100)}% of the chance at each grade up one step, all at once: ${transitions}. Existing ${D.grades[ceiling].name} and higher chances do not move. Already graded cargo is unaffected.`, "machine-effect"));
    }
    for (const recipe of Object.values(definition.recipes ?? {})) if (recipe.burnishedGradeEffect) {
      const treatment = recipe.burnishedGradeEffect;
      const outcomes = treatment.outcomes.map((outcome) => `${number(outcome.share * 100)}% ${D.grades[outcome.grade].name}`).join(" and ");
      panel.append(element("p", `Burnished Pot grade effect: ${D.grades[treatment.from].name} chance becomes ${outcomes} when fired. Unburnished Pots keep their incoming grade chances.`, "machine-effect"));
    }
    const effect = definition.cashEffect;
    if (!effect || typeof effect !== "object") return;
    const lines = [`Cash effect: ${effect.multiplier ? `×${number(effect.multiplier)}` : `+${money(effect.bonus)}`}`];
    if (effect.useLimit !== undefined) lines.push(`Use Limit: ${number(effect.useLimit)}`);
    if (effect.lowerLimit !== undefined) lines.push(`Lower Bound: ${money(effect.lowerLimit)}`);
    if (effect.upperLimit !== undefined && effect.upperLimit !== 1e50) lines.push(`Upper Limit: ${money(effect.upperLimit)}`);
    if (effect.baseValueRequired !== undefined) lines.push(`Base Value Required: ${money(effect.baseValueRequired)}`);
    if (definition.gradeEffect?.poorToStandardPerUse) lines.push(`Grade Effects: converts ${number(definition.gradeEffect.poorToStandardPerUse * 100)} percentage points of Poor chance to Unremarkable per use on clay products (${number(definition.gradeEffect.useLimit)} uses).`);
    if (definition.gradeEffect?.promotionRates) lines.push(`Grade Effects: moves ${definition.gradeEffect.promotionRates.map((rate, i) => rate ? `${number(rate * 100)}% of ${D.grades[i].name} to ${D.grades[i + 1].name}` : "").filter(Boolean).join("; ")}. Applies outside the cash limit.`);
    if (definition.persistentEffects) lines.push("Cash effect applies only once across the entire processing chain.");
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
  function redeemRune(machine, category) {
    const currentFactory = factory;
    const redeem = () => {
      if (currentFactory !== factory) return;
      const activation = category === "activation";
      try {
        if (activation) syncCapitalUnlock(factory);
        const previousCash = factory.state.cash;
        const response = factory.redeemRune(machine.id, category);
        if (response.error) return result(response);
        if (activation) {
          try { syncCapitalUnlock(factory); }
          catch (error) {
            factory.state.cash = previousCash;
            factory.state.capitalUnlocked = false;
            throw error;
          }
        }
        save();
        result(response, `${response.offering.name} unlocked.`);
      } catch (error) {
        notify(`Could not save the rune unlock. ${error.message}`);
      }
    };
    if (category === "activation" && window.navigator?.locks) {
      window.navigator.locks.request(D.capitalSaveKey, redeem).catch(error => notify(error.message));
    } else redeem();
  }
  function save() {
    if (storageFailed) { text($("saveStatus"), "The unreadable factory save is preserved. Import or explicitly reset before saving over it."); return; }
    try { localStorage.setItem(D.saveKey, factory.exportSave()); text($("saveStatus"), "Factory saved locally. Existing mine saves are unchanged."); }
    catch { text($("saveStatus"), "Local saving is unavailable. Export your factory save to keep it."); }
  }
  function setTab(tab) {
    activeTab = tab;
    for (const screen of document.querySelectorAll(".screen")) screen.hidden = screen.id !== tab;
    for (const button of document.querySelectorAll("[data-tab]")) button.classList.toggle("active", button.dataset.tab === tab);
    pointer = null; interaction.hover = null;
    gesture = null; interaction.marquee = null; interaction.box = null; suppressClick = false;
    if (tab === "factory") { resize(); floorSignature = ""; }
    if (tab === "recipes") recipeBook.refresh();
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
    if (waterSelecting) waterSelecting = null;
    else if (interaction.box || gesture) { interaction.box = null; interaction.marquee = null; gesture = null; }
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
    const count = element("span", "0"), button = action("", () => { inventorySelection = type; dismantledSelection = null; renderInventory(); }, "shop-card");
    const inventorySwatch = element("i", undefined, "machine-swatch"); inventorySwatch.style.backgroundColor = definition.color;
    button.dataset.machine = type;
    button.append(inventorySwatch, element("strong", definition.name), count); $("machineCards").append(button); machineCards.set(type, { button, count });
  }
  const shopEntries = Object.entries(D.machines).filter(([, definition]) => !definition.legacyOnly)
    .sort(([, a], [, b]) => (a.cost?.cash ?? Infinity) - (b.cost?.cash ?? Infinity));
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
    inventoryCategory = button.dataset.inventoryCategory; dismantledSelection = null; renderInventory();
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
    if (!waterSelecting && !interaction.tool && !interaction.group && (explicitBox || emptyTile(point))) {
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
    if (waterSelecting) {
      const target = factory.at.get(A.key(point.x, point.y));
      const index = target ? A.ports(target).filter((port) => port.role === "waterDropoff").findIndex((port) => port.x === point.x && port.y === point.y) : -1;
      const response = factory.addWaterDelivery(waterSelecting, target?.id, index);
      if (response.error) return notify(response.error);
      waterSelecting = null; inspectorSignature = ""; refresh(); return;
    }
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
      const { ids, turns, placing } = interaction.group;
      const response = placing ? factory.placeGroup(ids, point.x, point.y, turns) : factory.moveGroup(ids, point.x, point.y, turns);
      if (response.error) return notify(response.error);
      const placedIds = response.machines.map((machine) => machine.id);
      interaction.group = factory.hasGroupStock(placedIds) ? { ids: placedIds, turns: 0, placing: true } : null;
      select(placedIds);
    } else if (tool) {
      const response = tool.id ? factory.move(tool.id, point.x, point.y, tool.facing)
        : factory.place(tool.type, point.x, point.y, tool.facing, tool.repeat ? tool : null);
      if (response.error) return notify(response.error);
      if (!factory.state.stock[tool.type]) interaction.tool = null;
      else if (tool.id || tool.repeat) interaction.tool = { type: tool.type, facing: response.machine.facing, repeat: true,
        ...(response.machine.mode !== undefined ? { mode: response.machine.mode } : {}),
        ...(response.machine.stackSize !== undefined ? { stackSize: response.machine.stackSize } : {}) };
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
  function renderRuneOffering(machine) {
    const pedestal = D.machines[machine.type].runePedestal;
    const offering = factory.nextRune(pedestal, runeCategory);
    const title = $("runeOfferingTitle"), costs = $("runeOfferingCosts"), redeem = $("redeemRune");
    for (const tab of $("runeCategoryTabs").children) {
      tab.classList.toggle("active", tab.dataset.runeCategory === runeCategory);
      tab.setAttribute("aria-pressed", String(tab.dataset.runeCategory === runeCategory));
    }
    const message = pedestal === "major" ? "Major offering pending."
      : runeCategory === "activation" && factory.state.capitalUnlocked ? "Capital unlocked." : "All offerings completed.";
    text(title, offering?.name ?? message);
    const rows = offering ? [
      ...(offering.cash ? [["Cash", money(factory.state.cash), money(offering.cash)]] : []),
      ...Object.entries(offering.materials).map(([material, needed]) => [
        D.materials[material]?.name ?? D.runeIngredientNames[material], number(factory.state.inventory[material] ?? 0), number(needed),
      ]),
    ] : [];
    const signature = JSON.stringify(rows);
    if (costs.dataset.signature !== signature) {
      costs.dataset.signature = signature;
      costs.replaceChildren(...rows.map(([label, owned, needed]) => {
        const row = element("div", undefined, "cost-line");
        row.append(element("span", label), element("span", `${owned} / ${needed}`));
        return row;
      }));
    }
    redeem.hidden = !offering;
    const error = factory.runeCostError(offering);
    redeem.disabled = Boolean(error);
    text($("runeOfferingStatus"), offering ? error ?? "" : "");
  }
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
        if (machine.type === "primitive") panel.append(
          element("p", `Cash effect: +${money(factory.state.tuning.primitiveBonus)}`, "machine-effect"),
          element("p", `Upper Limit: ${money(factory.state.tuning.primitiveLimit)}`, "machine-effect"));
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
        controls.append(move, pickup, action("Recipes", () => viewRecipes(machine.type), "secondary"));
        panel.append(controls);
        if (definition.runePedestal) {
          const tabs = element("div", undefined, "row"); tabs.id = "runeCategoryTabs";
          tabs.setAttribute("aria-label", "Rune categories");
          for (const [id, name] of Object.entries(D.runeCategories)) {
            const tab = action(name, () => { runeCategory = id; renderRuneOffering(machine); }, "secondary");
            tab.dataset.runeCategory = id; tabs.append(tab);
          }
          const title = element("h3"); title.id = "runeOfferingTitle";
          const costs = element("div", undefined, "costs"); costs.id = "runeOfferingCosts";
          const status = element("p", "", "muted"); status.id = "runeOfferingStatus";
          const redeem = action("Redeem rune", () => redeemRune(machine, runeCategory)); redeem.id = "redeemRune";
          panel.append(tabs, title, costs, status, redeem);
        }
        const conveyorCount = A.conveyorUpgradeCost(machine.type);
        if (conveyorCount) {
          const detail = element("p", machine.conveyorUpgrade
            ? `Basic Conveyors installed: ${conveyorCount}. Picking up this machine returns them and restores the original conveyors.`
            : `Replace all ${conveyorCount} internal conveyor${conveyorCount === 1 ? "" : "s"} with Basic Conveyors. Originals stay with this machine; pickup returns the Basic Conveyors.`, "muted");
          panel.append(detail);
          if (!machine.conveyorUpgrade) {
            const upgrade = action(`Upgrade conveyors · ${conveyorCount} Basic`, () => {
              const response = factory.upgradeConveyors(machine.id);
              if (response.error) return notify(response.error);
              inspectorSignature = ""; refresh();
            }, "secondary");
            upgrade.id = "upgradeConveyors"; panel.append(upgrade);
          }
        }
        if (definition.crew) panel.append(element("p", `${definition.crew} crew assigned`));
        if (definition.dualPower) {
          const label = element("label", "Power source "), source = element("select");
          source.id = "powerSource"; source.setAttribute("aria-label", "Power source");
          for (const [value, name] of [["kinetic", "Heavy kinetic"], ["electric", "Electricity (40u)"]]) {
            const option = element("option", name); option.value = value; source.append(option);
          }
          source.value = machine.powerSource; label.append(source); panel.append(label);
          source.addEventListener("change", () => { const response = factory.setPowerSource(machine.id, source.value); if (response.error) source.value = machine.powerSource; result(response); });
        }
        if (definition.waterSource) {
          panel.append(element("p", "Delivers 0.5 Water every 5 seconds in schedule order. Dropoffs must be within the centered 10 by 10 area.", "muted"));
          const add = action("Add Water dropoff", () => { waterSelecting = machine.id; notify("Select a Water dropoff within range."); refresh(); }, "secondary");
          add.id = "addWaterDropoff"; panel.append(add);
          machine.waterSchedule.forEach((entry, index) => {
            const target = factory.byId.get(entry.targetId), row = element("div", undefined, "row");
            row.append(element("span", `${index + 1}. ${D.machines[target.type].name} (${target.x}, ${target.y}), dropoff ${entry.index + 1}${factory.waterDropoffInRange(machine, target, entry.index) ? "" : " · out of range"}`));
            const remove = action("Remove", () => { result(factory.removeWaterDelivery(machine.id, index)); inspectorSignature = ""; refresh(); }, "secondary");
            remove.id = `removeWaterDropoff${index}`; row.append(remove); panel.append(row);
          });
        }
        if (definition.waterCapacity) {
          const water = element("p"); water.id = "waterStatus";
          panel.append(water, element("p", "Schedule the blue Water dropoff from a nearby Well.", "muted"));
        }
        if (definition.heatCapacity) {
          const heat = element("p"); heat.id = "kilnHeat";
          const buffers = element("p"); buffers.id = "kilnBuffers";
          panel.append(heat, buffers, element("p", machine.type === "kiln"
            ? "Full batches only. Cold firing takes 12s and 96ku; a fully preheated batch takes 6s and 48ku. Amber arrow: Fuel. Pale arrow: Feed."
            : definition.oven ? `Uses 6ku per batch. Preheating moves up to ${number(definition.preheatGradeTransfer * 100)} percentage points from Unremarkable to Standard. Feed Raw Pasta through Input 1 and Chopped Leek through Input 2.`
            : machine.type === "preheater" ? `Uses 6ku to preheat 2 unfired Bricks or 1 unfired Pot in 3s. Moves up to ${number(definition.preheatGradeTransfer * 100)} percentage points from Unremarkable to Standard. Preheated cargo has an orange bar. Amber arrow: Fuel. Pale arrow: Feed.`
            : "Full batches only. Wood through Feed makes Charcoal without external heat; Wood through Fuel provides heat. Amber arrow: Fuel. Pale arrow: Feed. Copper smelting consumes 500ku per batch. Connect the output directly to an Ingot Molder.", "muted"));
          const recipe = element("p"); recipe.id = "furnaceRecipe"; panel.append(recipe);
        }
        if (machine.type === "potSpinner") {
          const buffers = element("p"); buffers.id = "spinnerBuffers";
          panel.append(buffers);
        }
        if (machine.type === "crudeGearBench") {
          const label = element("label", "Carving mode "), mode = element("select");
          mode.id = "carvingMode"; mode.setAttribute("aria-label", "Carving mode");
          for (const [id, recipe] of Object.entries(definition.recipes)) {
            const option = element("option", recipe.name); option.value = id; mode.append(option);
          }
          mode.value = machine.mode;
          mode.addEventListener("change", () => result(factory.setShapingMode(machine.id, mode.value)));
          label.append(mode); panel.append(label);
          const buffers = element("p"); buffers.id = "gearBuffers"; panel.append(buffers);
        }
        if (definition.pressModes && Object.keys(definition.pressModes).length > 1) {
          const label = element("label", "Press mode "), mode = element("select");
          mode.id = "pressMode"; mode.setAttribute("aria-label", "Press mode");
          for (const [id, recipe] of Object.entries(definition.pressModes)) {
            const option = element("option", recipe.name); option.value = id; mode.append(option);
          }
          mode.value = machine.mode;
          mode.addEventListener("change", () => {
            const response = factory.setPressMode(machine.id, mode.value);
            if (response.error) mode.value = machine.mode;
            else if (interaction.tool?.id === machine.id) interaction.tool.mode = machine.mode;
            result(response);
          });
          const buffers = element("p"); buffers.id = "pressBuffers";
          label.append(mode); panel.append(label, buffers,
            element("p", "Cycles take 4 seconds, or 2 seconds with an adjacent kinetic pair. Changing mode returns waiting ingredients to inventory; the current job finishes normally.", "muted"));
        }
        if (definition.molder) {
          const buffers = element("p"); buffers.id = "molderBuffers";
          panel.append(buffers, element("p", "One ingot per second, preserving the liquid metal's value. No Clay or other consumables. Cast Iron requires a Refractory Caster.", "muted"));
        }
        if (definition.formingModes) {
          if (Object.keys(definition.formingModes).length > 1) {
            const label = element("label", "Spool mode "), mode = element("select");
            mode.id = "formingMode"; mode.setAttribute("aria-label", "Spool mode");
            for (const [id, recipe] of Object.entries(definition.formingModes)) {
              const option = element("option", `${recipe.name} · ${recipe.input} Wire · ${recipe.seconds}s`);
              option.value = id; mode.append(option);
            }
            mode.value = machine.mode;
            mode.addEventListener("change", () => {
              const response = factory.setFormingMode(machine.id, mode.value);
              if (response.error) mode.value = machine.mode;
              else if (interaction.tool?.id === machine.id) interaction.tool.mode = machine.mode;
              result(response);
            });
            label.append(mode); panel.append(label,
              element("p", "Changing mode returns waiting Wire to inventory; the current job finishes normally.", "muted"));
          }
          const buffers = element("p"); buffers.id = "formingBuffers"; panel.append(buffers);
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
        if (definition.sourceModes || definition.batchModes) {
          const label = element("label", "Extraction mode "), mode = element("select");
          mode.id = "extractionMode"; mode.setAttribute("aria-label", "Extraction mode");
          for (const [id, name] of Object.entries(definition.sourceModes ?? definition.batchModes)) {
            const option = element("option", name); option.value = id; mode.append(option);
          }
          mode.value = machine.mode;
          mode.addEventListener("change", () => { const response = factory.setSourceMode(machine.id, mode.value); floorSignature = ""; result(response); });
          label.append(mode); panel.append(label);
        }
        if (A.collectorCapacity(machine)) {
          const contents = element("div", undefined, "basket-counts"); contents.id = "basketContents";
          const collectButton = action("Collect all", () => collect(machine.id)); collectButton.id = "collectBasket";
          collectButton.title = "Shift-click this collector to collect all, unless another object is selected.";
          panel.append(contents, collectButton, element("p", "Shortcut: Shift-click to collect all. If another building is selected, Shift-click adds this collector to the selection.", "muted"));
        }
      } else {
        panel.append(element("h2", "Factory"), element("p", "Open Inventory → Machines to place your two free Leek Planters, Basket and Sell Tube. Click trees to gather Wood."),
          element("p", "Shift-click empty ground to start two-tap box selection. Shift-click another building to add it to your selection. With no other building selected, Shift-click a Basket to collect all. Box select can start anywhere."),
          element("p", "Use Q/E or the visible Rotate buttons. Moving continues into copy placement while inventory can supply another machine or complete group. Cancel or right-click to stop."));
        const help = element("details", undefined, "opening-help"), list = element("ol");
        help.append(element("summary", "Getting started"));
        for (const line of ["Point the Planter’s edge output into the Basket. It grows one Leek every 8 seconds.", "A Fiber Extractor costs 30 Wood and 1 Leek, with no cash requirement. Chop trees for Wood and collect a Leek from your Basket.", "Put the Extractor between the Planter and Basket.", "Build manual Clay Pits for $5 and 100 Wood each. Point their output directly into the free Sell Tube to earn $0.25 per Clay.", "Five tree chops harvest 1–5 Wood, at most five chops per second.", "A Wood Carving Bench costs 25 Wood. Point a Logger into the Bench to carve gears for conveyors or plates for salad.", "Primitive Conveyors cost 10 Wood and 4 Wooden Gears. Machines with internal belts use purchased conveyors as components.", "Place the starter Wheel and build a Drive. Connect the Drive’s intake to a long Wheel edge to power the surrounding conveyors."]) list.append(element("li", line));
        help.append(list); panel.append(help);
      }
    }
    if (tree) for (const [index, marker] of [...$("chopCounter").children].entries()) marker.classList.toggle("done", index < factory.state.harvestProgress);
    if (machine) {
      text($("machineStatus"), factory.status(machine));
      if (D.machines[machine.type].runePedestal) renderRuneOffering(machine);
      if (D.machines[machine.type].waterCapacity) text($("waterStatus"), `Water: ${number(machine.water)} / ${number(factory.waterCapacity(machine))}`);
      if ($("upgradeConveyors")) $("upgradeConveyors").disabled = factory.state.stock.electricConveyor < A.conveyorUpgradeCost(machine.type);
      if (A.supportsOutputHistory(machine.type)) renderOutputHistory($("outputHistory"), machine);
      if (machine.type === "potSpinner") text($("spinnerBuffers"), `Waiting Clay: ${number(factory.total(machine, "input"))} / ${2 * factory.bulkFactor(machine)} · Finished pots: ${number(factory.total(machine, "output"))} / ${factory.bulkFactor(machine)}`);
      if (machine.type === "clayShaper") text($("shapingBuffers"), `Waiting Clay: ${number(factory.total(machine, "input"))} / ${number(D.machines.clayShaper.inputLimit * factory.bulkFactor(machine))} · Finished items: ${number(factory.total(machine, "output"))} / ${factory.bulkFactor(machine)}`);
      if (machine.type === "gradingBench") {
        const item = machine.job?.input ?? machine.input[0] ?? machine.output[0];
        const probabilities = item && A.gradeProbabilities(item);
        text($("gradingChances"), probabilities
          ? `${D.materials[item.material].name}: ${probabilities.map((chance, index) => `${D.grades[index].name} ${number(chance * 100)}%`).join(" · ")}`
          : "Waiting for an item to show its grade chances.");
      }
      if (D.machines[machine.type].heatCapacity) {
        const definition = D.machines[machine.type];
        const recipe = definition.recipes[machine.job?.recipe] ?? factory.furnaceRecipe(machine)
          ?? Object.values(definition.recipes).find(entry => entry.output === machine.output[0]?.material);
        text($("furnaceRecipe"), recipe
          ? `Recipe: ${recipe.name ?? D.materials[recipe.output].name} · ${recipe.seconds === 0 ? "Instant" : `${number(recipe.seconds)}s`}`
          : "Recipe: waiting for material");
        text($("kilnHeat"), `Heat: ${number(machine.heat)} / ${number(factory.heatCapacity(machine))}u`);
        text($("kilnBuffers"), `Waiting inputs: ${number(factory.total(machine, "input"))} · Finished products: ${number(factory.total(machine, "output"))}`);
      }
      if (machine.type === "crudeGearBench") text($("gearBuffers"), `Waiting Wood: ${number(factory.total(machine, "input"))} / ${D.machines.crudeGearBench.inputLimit * factory.bulkFactor(machine)} · Finished output: ${number(factory.total(machine, "output"))}`);
      if (D.machines[machine.type].pressModes && $("pressBuffers")) text($("pressBuffers"), `Waiting inputs: ${number(factory.total(machine, "input"))} / ${number(D.machines[machine.type].inputLimit * factory.bulkFactor(machine))} · Finished output: ${number(factory.total(machine, "output"))}`);
      if (D.machines[machine.type].molder) text($("molderBuffers"), `Waiting liquid: ${number(factory.total(machine, "input"))} / ${factory.bulkFactor(machine)} · Finished ingots: ${number(factory.total(machine, "output"))} / ${factory.bulkFactor(machine)}`);
      if (D.machines[machine.type].formingModes) {
        const recipe = D.machines[machine.type].formingModes[machine.mode];
        text($("formingBuffers"), `Waiting ${D.machines[machine.type].fluidInput ? "liquid" : "input"}: ${number(factory.total(machine, "input"))} / ${recipe.input * factory.bulkFactor(machine)} · Finished output: ${number(factory.total(machine, "output"))}`);
      }
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
    if (!cards.has(shopSelection) || factory.shopUnlockError(shopSelection)) {
      shopSelection = [...cards.keys()].find(type => !factory.shopUnlockError(type) && (category === "All" || D.machines[type].category === category)) ?? null;
    }
    for (const [type, entry] of cards) {
      entry.card.hidden = Boolean(factory.shopUnlockError(type)) || (category !== "All" && D.machines[type].category !== category);
      entry.card.classList.toggle("selected", type === shopSelection);
      const count = factory.state.stock[type] + factory.state.machines.filter((machine) => machine.type === type).length;
      text(entry.owned, `Owned: ${number(count)}`);
    }
    const panel = $("shopDetail");
    panel.hidden = !shopSelection;
    if (!shopSelection) return;
    const definition = D.machines[shopSelection];
    if (shopSignature !== shopSelection) {
      shopSignature = shopSelection; panel.replaceChildren(element("h2", definition.name), element("p", definition.description));
      appendMachineEffects(panel, definition);
      const defaultSize = A.size({ type: shopSelection, facing: definition.defaultFacing ?? "right" });
      panel.append(element("p", `${defaultSize.width}×${defaultSize.height}${definition.crew ? ` · ${definition.crew} crew` : ""}`, "muted"));
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
          else { notify("Borrowed unpriced equipment; no game price assigned."); refresh(); }
        }
      }); buy.id = "buyMachine";
      panel.append(buy, action("Place owned", () => build(shopSelection), "secondary"),
        action("Recipes & uses", () => viewRecipes(shopSelection), "secondary"));
      if (!definition.cost) panel.append(element("p", "This item's cost is unsettled. Borrowing is a test aid, not its actual recipe.", "muted"));
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
      entry.button.hidden = available === 0 || (inventoryCategory !== "All" && D.machines[type].category !== inventoryCategory);
      if (!entry.button.hidden) visible.push(type);
      text(entry.count, `Owned: ${number(total)} · available: ${number(available)}`);
    }
    if (!visible.includes(inventorySelection) && !(dismantledSelection && dismantledSelection === inventorySelection)) inventorySelection = visible[0] ?? null;
    for (const [type, entry] of machineCards) entry.button.classList.toggle("selected", type === inventorySelection);
    $("machineEmpty").hidden = visible.length > 0;
    const panel = $("machineDetail"); panel.hidden = !inventorySelection || factory.state.stock[inventorySelection] === 0;
    if (!inventorySelection) return;
    if (machineSignature !== inventorySelection) {
      machineSignature = inventorySelection;
      const definition = D.machines[inventorySelection], bounds = A.size({ type: inventorySelection, facing: definition.defaultFacing ?? "right" });
      panel.replaceChildren(element("h2", definition.name), element("p", definition.description), element("p", `${bounds.width}×${bounds.height}`, "muted"));
      appendMachineEffects(panel, definition);
      const owned = element("p"); owned.id = "inventoryOwned";
      const place = action("Place", () => build(inventorySelection)); place.id = "placeMachine";
      const type = inventorySelection;
      const dismantle = action("Dismantle", () => {
        const response = factory.dismantle(type);
        if (response.error) return notify(response.error);
        dismantledSelection = type;
        save(); refresh(); notify(Object.keys(response.materials).length || Object.keys(response.machines).length
          ? `Dismantled ${definition.name}. Resources returned; no cash refunded.` : `Dismantled ${definition.name}.`);
      }, "secondary"); dismantle.id = "dismantleMachine";
      const refund = element("p", "", "muted"); refund.id = "dismantleReturns";
      const contents = element("p", "", "muted"); contents.id = "dismantleContents";
      const limit = element("p", "", "muted"); limit.id = "dismantleLimit";
      panel.append(owned, place, dismantle, action("View in Shop", () => { shopSelection = inventorySelection; shopSignature = ""; setTab("shop"); }, "secondary"), refund, contents, limit);
    }
    const available = factory.state.stock[inventorySelection], placed = factory.state.machines.filter((machine) => machine.type === inventorySelection).length;
    text($("inventoryOwned"), `Owned: ${number(available + placed)} · available to place: ${number(available)}`);
    $("placeMachine").disabled = available < 1;
    const dismantleError = factory.dismantleError(inventorySelection);
    const refund = factory.dismantleRefund(inventorySelection);
    const returns = refund ? [
      ...Object.entries(refund.materials ?? {}).map(([id, quantity]) => `${number(quantity)} ${D.materials[id].name}`),
      ...Object.entries(refund.machines ?? {}).map(([id, quantity]) => `${number(quantity)} ${D.machines[id].name}`),
    ] : [];
    text($("dismantleReturns"), refund ? `Dismantle returns: ${returns.join(", ") || "no resources"}. No cash refund.` : "No construction recipe to recover.");
    $("dismantleMachine").disabled = Boolean(dismantleError);
    $("dismantleMachine").title = dismantleError ?? "Dismantle one unplaced machine.";
    text($("dismantleLimit"), dismantleError ?? "");
    const stored = factory.state.storedMachines.find((machine) => machine.type === inventorySelection);
    text($("dismantleContents"), stored && [...stored.input, ...stored.output, ...(stored.job?.inputs ?? (stored.job?.input ? [stored.job.input] : []))]
      .some((item) => D.materials[item.material]?.fluid) ? "Stored molten metal will be discarded." : "");
  }
  function refresh() {
    if (interaction.selectedIds.some((id) => !factory.byId.has(id))) {
      select(interaction.selectedIds.filter((id) => factory.byId.has(id)));
    }
    if (interaction.tool?.id && !factory.byId.has(interaction.tool.id)) interaction.tool = null;
    if (interaction.group?.ids.some((id) => !factory.byId.has(id))) interaction.group = null;
    if (interaction.tool?.repeat && !factory.state.stock[interaction.tool.type]) interaction.tool = null;
    if (interaction.group?.placing && !factory.hasGroupStock(interaction.group.ids)) interaction.group = null;
    text($("cash"), money(factory.state.cash)); text($("crew"), `${factory.availableCrew()} / ${factory.totalCrew()}`);
    const electricity = factory.electricity;
    text($("electricity"), `${number(electricity.demand)} / ${number(electricity.supply)}u${electricity.shortage ? " · Paused" : ""}`);
    $("electricity").classList.toggle("power-shortage", electricity.shortage);
    $("electricity").title = electricity.shortage ? "Demand exceeds supply. All electric machines are paused." : "Factory-wide electricity demand / supply";
    const hireCost = factory.crewHireCost();
    text($("hireCrew"), `Hire · ${Number.isFinite(hireCost) ? money(hireCost) : "—"}`);
    $("hireCrew").disabled = !factory.canHireCrew();
    text($("toolLabel"), waterSelecting ? "Select a Water dropoff in range" : interaction.box ? interaction.box.start ? "Tap the opposite corner" : interaction.box.contextual ? "Tap empty ground to box-select, or an object for its Shift action" : "Tap the first corner"
      : interaction.group ? `${interaction.group.placing ? "Placing" : "Moving"} ${interaction.group.ids.length} machines · Q/E rotates the group`
      : interaction.tool ? `${interaction.tool.id ? "Moving" : "Placing"} ${D.machines[interaction.tool.type].name} · ${interaction.tool.facing}` : "Select a machine or click a tree");
    $("cancel").disabled = !(waterSelecting || interaction.tool || interaction.group || interaction.box || interaction.selectedIds.length || interaction.tree);
    text($("cancel"), interaction.box ? "Cancel selection" : interaction.group || interaction.tool ? "Cancel" : "Clear selection");
    if (activeTab === "factory") renderInspector();
    if (activeTab === "shop") renderShop();
    if (activeTab === "inventory") renderInventory();
    $("playtestPanel").hidden = !factory.state.playtest.unlocked;
    for (const [id, elementId, label] of [
      ["resources", "cheatResources", "×10 resources"], ["storage", "cheatStorage", "×10 storage capacity"],
      ["machineSpeed", "cheatMachineSpeed", "×10 machine speed"], ["machineBulk", "cheatMachineBulk", "×10 machine bulk"], ["conveyorCapacity", "cheatConveyorCapacity", "×10 conveyor capacity"],
      ["conveyorSpeed", "cheatConveyorSpeed", "×5 conveyor speed"], ["cash", "cheatCash", "×10 sale cash"],
    ]) {
      const enabled = factory.state.playtest.toggles[id];
      text($(elementId), `${label}: ${enabled ? "On" : "Off"}`); $(elementId).setAttribute("aria-pressed", String(enabled));
    }
    renderHoverHistory();
  }
  const unlockPlaytest = () => {
    const response = factory.unlockPlaytest($("playtestCode").value);
    text($("playtestStatus"), response.error ?? "Playtest cheats unlocked for this save.");
    if (!response.error) { $("playtestCode").value = ""; save(); }
    refresh();
  };
  $("unlockPlaytest").addEventListener("click", unlockPlaytest);
  $("playtestCode").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); unlockPlaytest(); } });
  for (const [id, elementId] of [["resources", "cheatResources"], ["storage", "cheatStorage"], ["machineSpeed", "cheatMachineSpeed"], ["machineBulk", "cheatMachineBulk"],
    ["conveyorCapacity", "cheatConveyorCapacity"], ["conveyorSpeed", "cheatConveyorSpeed"], ["cash", "cheatCash"]]) {
    $(elementId).addEventListener("click", () => {
      const response = factory.setPlaytestCheat(id, !factory.state.playtest.toggles[id]);
      if (response.error) notify(response.error); else save();
      refresh();
    });
  }
  $("export").addEventListener("click", () => { $("saveText").value = storageFailed && protectedSave !== null ? protectedSave : factory.exportSave(); $("saveText").select(); save(); });
  $("import").addEventListener("click", () => {
    try { const replacement = A.Factory.importSave($("saveText").value);
      const previous = localStorage.getItem(D.saveKey); if (previous && previous !== $("saveText").value) backupBeforeMigration(previous);
      backupTerrainSave($("saveText").value, replacement); syncCapitalUnlock(replacement);
      factory = replacement; resetSimulationClock(); storageFailed = false; protectedSave = null; loadFailure = null;
      select([]); interaction.tool = null; interaction.group = null; interaction.box = null; interaction.marquee = null; gesture = null;
      inspectorSignature = ""; floorSignature = ""; itemSignature = ""; shopSignature = ""; machineSignature = "";
      dismantledSelection = null;
      save(); refresh(); notify(factory.terrainUpdated ? terrainNotice() : factory.recoveredForPlanterResize
        ? `Save imported. ${factory.recoveredForPlanterResize} overlapping machine(s) returned to inventory for the corrected footprints.`
        : factory.reorientedForFiberResize ? "Save imported. Fiber Extractor inputs and outputs now share the lower working tile." : "Factory save imported.");
    } catch (error) { notify(error.message); }
  });
  $("reset").addEventListener("click", () => {
    if (!window.confirm("Reset the factory game? Existing mining saves will not be changed.")) return;
    const replacement = new A.Factory();
    try {
      const previous = localStorage.getItem(D.saveKey); if (previous) backupBeforeMigration(previous);
      syncCapitalUnlock(replacement);
    }
    catch (error) { notify(`Could not back up the existing save, so it was not reset. ${error.message}`); return; }
    factory = replacement; storageFailed = false; protectedSave = null; loadFailure = null; select([]); interaction.tool = null; interaction.group = null; interaction.box = null; interaction.marquee = null; gesture = null;
    inspectorSignature = ""; floorSignature = ""; itemSignature = ""; shopSignature = ""; machineSignature = "";
    dismantledSelection = null;
    resetSimulationClock(); home(); save(); refresh();
  });
  window.addEventListener("resize", resize);
  window.addEventListener("storage", (event) => {
    if (event.key !== D.capitalSaveKey || event.newValue !== "1") return;
    factory.state.capitalUnlocked = true;
    refresh();
  });
  window.addEventListener("beforeunload", () => { advanceSimulation(performance.now()); save(); });
  document.addEventListener("visibilitychange", () => {
    const now = performance.now(); advanceSimulation(now); lastFrame = now;
    if (document.hidden) save(); else refresh();
  });
  setInterval(() => { if (document.hidden) advanceSimulation(performance.now()); }, 1000);
  new ResizeObserver(resize).observe($("viewport"));
  function frame(now) {
    const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.25) : 0; lastFrame = now;
    const changed = advanceSimulation(now);
    if (!document.hidden) {
      if (changed) refresh();
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
  if (storageFailed) notify(`The factory save could not be loaded or backed up. It has not been overwritten. Export retrieves the preserved save. ${loadFailure ?? ""}`);
  else if (factory.terrainUpdated) notify(terrainNotice());
  else if (factory.recoveredForPlanterResize) notify(`${factory.recoveredForPlanterResize} overlapping machine(s) returned to inventory for the corrected footprints. Their contents were recovered.`);
  else if (factory.reorientedForFiberResize) notify("Fiber Extractor layouts corrected; reconnect their working tile. Contents are preserved.");
  if (!storageFailed) save();
  requestAnimationFrame(frame);
}());
