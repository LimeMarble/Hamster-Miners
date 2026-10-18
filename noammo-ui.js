(function () {
  "use strict";
  const A = window.NoAmmo, D = A.DATA, R = window.NoAmmoRenderer;
  const $ = (id) => document.getElementById(id);
  let factory, storageFailed = false;
  try { const save = localStorage.getItem(D.saveKey); factory = save ? A.Factory.importSave(save) : new A.Factory(); }
  catch (error) { factory = new A.Factory(); storageFailed = true; console.warn("Prototype save not loaded:", error); }
  const camera = { x: 115, y: 0, zoom: 1 }, viewport = { width: 0, height: 0 };
  const interaction = { selected: null, tree: null, tool: null, hover: null };
  let activeTab = "factory", category = "All", shopSelection = "fiber", inspectorSignature = "", floorSignature = "";
  let shopSignature = "", itemSignature = "", pointer = null, toastTime = 0, lastFrame = 0, accumulator = 0, saveElapsed = 0;
  let overlaySignature = "";
  const floor = $("floor").getContext("2d"), overlay = $("cargo").getContext("2d");
  const palette = new Map(), cards = new Map();
  const suffices = ["", "k", "M", "B", "T", "Qd", "Qn", "Sx", "Sp", "Oc", "No", "Dc"];
  function number(value) {
    if (!Number.isFinite(value)) return "0";
    if (value === 0) return "0";
    const tier = Math.max(0, Math.floor(Math.log10(Math.abs(value)) / 3));
    if (tier >= suffices.length) return value.toExponential(2);
    return `${Number((value / 1000 ** tier).toPrecision(3))}${suffices[tier]}`;
  }
  const money = (value) => `$${number(value)}`;
  function text(element, value) { if (element && element.textContent !== value) element.textContent = value; }
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
    pointer = null;
    if (tab === "factory") { resize(); floorSignature = ""; }
    refresh();
  }
  function bounds() {
    const width = viewport.width / (R.TILE * camera.zoom), height = viewport.height / (R.TILE * camera.zoom);
    camera.x = Math.max(-3, Math.min(D.config.columns + 3 - width, camera.x));
    camera.y = Math.max(-3, Math.min(D.config.rows + 3 - height, camera.y));
  }
  function resize() {
    const rect = $("viewport").getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    viewport.width = rect.width; viewport.height = rect.height;
    const resolution = Math.min(2, window.devicePixelRatio || 1);
    for (const canvas of [$("floor"), $("cargo")]) {
      canvas.width = Math.round(rect.width * resolution); canvas.height = Math.round(rect.height * resolution);
      canvas.getContext("2d").setTransform(resolution, 0, 0, resolution, 0, 0);
    }
    bounds(); floorSignature = "";
  }
  function home() { camera.x = 125 - viewport.width / (R.TILE * camera.zoom * 2); camera.y = 0; bounds(); floorSignature = ""; }
  function zoom(change, anchor) {
    const next = Math.max(0.5, Math.min(2, Math.round((camera.zoom + change) * 10) / 10));
    const p = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 };
    camera.x += p.x / R.TILE * (1 / camera.zoom - 1 / next);
    camera.y += p.y / R.TILE * (1 / camera.zoom - 1 / next);
    camera.zoom = next; bounds(); text($("zoomLabel"), `${Math.round(next * 100)}%`); floorSignature = "";
  }
  function build(type) {
    if (!(factory.state.stock[type] > 0)) { shopSelection = type; shopSignature = ""; setTab("shop"); return; }
    interaction.tool = { type, facing: D.machines[type].defaultFacing ?? "right" }; interaction.selected = null; interaction.tree = null;
    setTab("factory"); inspectorSignature = ""; refresh();
  }
  function cancel() { interaction.tool = null; refresh(); }
  function rotate(count) {
    if (interaction.tool) interaction.tool.facing = A.turn(interaction.tool.facing, count);
    else {
      const machine = factory.byId.get(interaction.selected);
      if (machine) result(factory.move(machine.id, machine.x, machine.y, A.turn(machine.facing, count)));
    }
    refresh();
  }
  for (const [type, definition] of Object.entries(D.machines)) {
    const count = element("b", "0"), button = action("", () => build(type), "build-card");
    button.append(element("span", definition.name), count); $("palette").append(button); palette.set(type, { button, count });
    const card = action("", () => { shopSelection = type; shopSignature = ""; refresh(); }, "shop-card");
    const swatch = element("i", undefined, "machine-swatch"); swatch.style.backgroundColor = definition.color;
    const owned = element("span", "Owned: 0"), bottom = element("small"); bottom.append(swatch, owned);
    card.append(element("strong", definition.name), element("span", definition.cost ? money(definition.cost.cash) : "Cost unset", "muted"), bottom);
    $("shopCards").append(card); cards.set(type, { card, owned });
  }
  for (const button of document.querySelectorAll("[data-tab]")) button.addEventListener("click", () => setTab(button.dataset.tab));
  for (const button of document.querySelectorAll("[data-category]")) button.addEventListener("click", () => {
    category = button.dataset.category;
    for (const other of document.querySelectorAll("[data-category]")) other.classList.toggle("active", other === button);
    refresh();
  });
  $("openShop").addEventListener("click", () => setTab("shop"));
  $("rotateLeft").addEventListener("click", () => rotate(-1)); $("rotateRight").addEventListener("click", () => rotate(1));
  $("cancel").addEventListener("click", cancel); $("home").addEventListener("click", home);
  $("zoomIn").addEventListener("click", () => zoom(0.1)); $("zoomOut").addEventListener("click", () => zoom(-0.1));
  function position(event) {
    const rect = $("cargo").getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function tile(point) { return { x: Math.floor(camera.x + point.x / (R.TILE * camera.zoom)), y: Math.floor(camera.y + point.y / (R.TILE * camera.zoom)) }; }
  $("cargo").addEventListener("pointermove", (event) => { pointer = position(event); interaction.hover = tile(pointer); });
  $("cargo").addEventListener("pointerleave", () => { pointer = null; interaction.hover = null; });
  $("cargo").addEventListener("contextmenu", (event) => { event.preventDefault(); cancel(); });
  $("cargo").addEventListener("click", (event) => {
    const point = tile(position(event)), tool = interaction.tool;
    if (tool) {
      const response = tool.id ? factory.move(tool.id, point.x, point.y, tool.facing) : factory.place(tool.type, point.x, point.y, tool.facing);
      if (response.error) return notify(response.error);
      if (tool.id || !factory.state.stock[tool.type]) interaction.tool = null;
      interaction.selected = response.machine.id; interaction.tree = null;
    } else {
      const machine = factory.at.get(A.key(point.x, point.y)), tree = factory.treeAt.get(A.key(point.x, point.y));
      interaction.selected = machine?.id ?? null; interaction.tree = machine ? null : tree?.id ?? null;
      if (interaction.tree) chop(interaction.tree);
    }
    inspectorSignature = ""; refresh();
  });
  $("cargo").addEventListener("wheel", (event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 0.1 : -0.1, position(event)); }, { passive: false });
  function chop(id) { const response = factory.chop(id); if (response.wood) notify(`+${response.wood} Wood`); refresh(); }
  document.addEventListener("keydown", (event) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (event.key === "Escape") cancel();
    if (activeTab !== "factory") return;
    if (event.key.toLowerCase() === "q") rotate(-1);
    if (event.key.toLowerCase() === "e") rotate(1);
  });
  function renderInspector() {
    const machine = factory.byId.get(interaction.selected), tree = factory.state.trees.find((entry) => entry.id === interaction.tree);
    const signature = `${machine?.id ?? ""}:${tree?.id ?? ""}:${factory.layoutVersion}:${factory.state.routes.map((route) => route.id).join(",")}:${Boolean(interaction.tool)}`;
    if (signature !== inspectorSignature) {
      inspectorSignature = signature; const panel = $("inspector"); panel.replaceChildren();
      if (tree) {
        panel.append(element("h2", "Woodland tree"), element("p", "Inexhaustible. Five chops harvest 1–5 Wood. The five-clicks/second cap is shared across every tree."));
        const counter = element("div", undefined, "tree-chops"); counter.id = "chopCounter";
        for (let i = 0; i < 5; i++) counter.append(element("i"));
        panel.append(counter, action("Chop tree", () => chop(tree.id)), element("p", "Loggers go inside the four middle edge tiles and face outward."));
      } else if (machine) {
        const definition = D.machines[machine.type];
        const status = element("p", "", "status"); status.id = "machineStatus";
        panel.append(element("h2", definition.name), status, element("p", definition.description));
        const controls = element("div", undefined, "row");
        controls.append(action("Move", () => { interaction.tool = { type: machine.type, id: machine.id, facing: machine.facing }; refresh(); }),
          action("Pick up", () => { factory.pickup(machine.id); interaction.selected = null; interaction.tool = null; refresh(); }, "secondary"));
        panel.append(controls);
        if (definition.crew) panel.append(element("p", `${definition.crew} crew assigned`));
        if (machine.type === "basket") {
          const contents = element("div", undefined, "basket-counts"); contents.id = "basketContents";
          const collect = action("Collect all", () => { const count = factory.collect(machine.id); notify(`Collected ${number(count)} items.`); refresh(); }); collect.id = "collectBasket";
          const sell = action("Sell eligible contents", () => { notify(`Sold for ${money(factory.sellBasket(machine.id))}.`); refresh(); }); sell.id = "sellBasket";
          panel.append(contents, collect, sell, element("hr"), element("h3", "Hauling hamster"));
          const destinations = element("select"); destinations.id = "haulDestination"; destinations.setAttribute("aria-label", "Hauling destination");
          for (const destination of factory.state.machines.filter((entry) => entry.id !== machine.id
            && (["basket", "sellTube", "belt"].includes(entry.type) || A.ports(entry).some((point) => point.role === "input")))) {
            const option = element("option", `${D.machines[destination.type].name} · #${destination.id.split("-").pop()}`); option.value = destination.id; destinations.append(option);
          }
          const material = element("select"); material.id = "haulMaterial"; material.setAttribute("aria-label", "Hauling material");
          for (const [id, label] of [["any", "Any material"], ...Object.entries(D.materials).map(([id, entry]) => [id, entry.name])]) {
            const option = element("option", label); option.value = id; material.append(option);
          }
          const assign = action("Assign one hamster", () => result(factory.addRoute(machine.id, destinations.value, material.value)));
          assign.disabled = !destinations.options.length;
          panel.append(destinations, material, assign, element("p", "Carries one item. Loaded travel: 0.5s/tile/weight; return: 0.5s/tile. Withdrawn cargo is stale."));
        }
        for (const route of factory.state.routes.filter((entry) => entry.source === machine.id || entry.destination === machine.id)) {
          const line = element("div", undefined, "route"), status = element("span"); status.id = `status-${route.id}`;
          line.append(status, action("Unassign", () => { factory.removeRoute(route.id); refresh(); }, "secondary")); panel.append(line);
        }
        if (machine.type === "primitive") panel.append(element("p", `TEST effect: +${money(factory.state.tuning.primitiveBonus)} below ${money(factory.state.tuning.primitiveLimit)}. Adjustable in Options; not final balance.`));
      } else panel.append(element("h2", "Opening factory"), element("p", "Place the free Leek Planter and Basket from the left panel. Click the nearby tree to gather Wood."), element("p", "Use Q/E or the visible Rotate buttons. Placement continues while you still own that machine. Cancel or right-click to stop."));
    }
    if (tree) for (const [index, marker] of [...$("chopCounter").children].entries()) marker.classList.toggle("done", index < factory.state.harvestProgress);
    if (machine) {
      text($("machineStatus"), factory.status(machine));
      if (machine.type === "basket") {
        const totals = new Map();
        for (const item of machine.contents) totals.set(item.material, (totals.get(item.material) ?? 0) + item.quantity);
        const signature = JSON.stringify([...totals]);
        if ($("basketContents").dataset.signature !== signature) {
          $("basketContents").dataset.signature = signature; $("basketContents").replaceChildren();
          for (const [material, quantity] of totals) { const line = element("div"); line.append(element("span", D.materials[material].name), element("strong", number(quantity))); $("basketContents").append(line); }
        }
        $("collectBasket").disabled = machine.contents.length === 0;
        $("sellBasket").disabled = !machine.contents.some((item) => D.materials[item.material].value !== null);
      }
      for (const route of factory.state.routes) text($(`status-${route.id}`), `#${route.id.split("-").pop()}: ${route.phase === "pickup" ? "Waiting for cargo" : route.phase === "return" ? "Returning" : `Carrying ${D.materials[route.item.material].name}`} `);
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
      if (shopSelection === "planter") panel.append(element("p", "Resource droppers are free for this prototype.", "muted"));
    }
    const count = factory.state.stock[shopSelection], total = count + factory.state.machines.filter((machine) => machine.type === shopSelection).length;
    text($("shopOwned"), `Owned: ${number(total)} · available to place: ${number(count)}`);
    const amount = Number($("quantity").value), valid = Number.isInteger(amount) && amount >= 1 && amount <= 9999;
    const entries = definition.cost ? [["Cash", factory.state.cash, definition.cost.cash], ...Object.entries(definition.cost.materials).map(([id, needed]) => [D.materials[id].name, factory.state.inventory[id], needed])] : [];
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
  function refresh() {
    text($("cash"), money(factory.state.cash)); text($("crew"), `${factory.availableCrew()} / ${D.config.startingCrew}`);
    for (const [type, entry] of palette) {
      text(entry.count, number(factory.state.stock[type]));
      entry.button.classList.toggle("selected", interaction.tool?.type === type);
    }
    text($("toolLabel"), interaction.tool ? `${interaction.tool.id ? "Moving" : "Placing"} ${D.machines[interaction.tool.type].name} · ${interaction.tool.facing}` : "Select a machine or click a tree");
    $("cancel").disabled = !interaction.tool;
    if (activeTab === "factory") renderInspector();
    if (activeTab === "shop") renderShop();
    if (activeTab === "items") renderItems();
  }
  $("export").addEventListener("click", () => { $("saveText").value = factory.exportSave(); $("saveText").select(); save(); });
  $("import").addEventListener("click", () => {
    try { const replacement = A.Factory.importSave($("saveText").value); factory = replacement; storageFailed = false;
      interaction.selected = null; interaction.tool = null; interaction.tree = null; inspectorSignature = ""; floorSignature = ""; itemSignature = ""; shopSignature = "";
      $("primitiveBonus").value = factory.state.tuning.primitiveBonus; $("primitiveLimit").value = factory.state.tuning.primitiveLimit;
      save(); refresh(); notify(factory.recoveredForPlanterResize
        ? `Save imported. ${factory.recoveredForPlanterResize} overlapping machine(s) returned to inventory for the corrected footprints.`
        : factory.reorientedForFiberResize ? "Save imported. Old Fiber Extractors now point down; reconnect their lower outputs." : "Prototype save imported.");
    } catch (error) { notify(error.message); }
  });
  $("reset").addEventListener("click", () => {
    if (!window.confirm("Reset only this opening prototype? Existing mining saves will not be changed.")) return;
    factory = new A.Factory(); storageFailed = false; interaction.selected = null; interaction.tool = null; interaction.tree = null;
    inspectorSignature = ""; floorSignature = ""; itemSignature = ""; shopSignature = "";
    $("primitiveBonus").value = factory.state.tuning.primitiveBonus; $("primitiveLimit").value = factory.state.tuning.primitiveLimit;
    home(); save(); refresh();
  });
  $("primitiveBonus").value = factory.state.tuning.primitiveBonus; $("primitiveLimit").value = factory.state.tuning.primitiveLimit;
  $("applyTuning").addEventListener("click", () => {
    const bonus = Number($("primitiveBonus").value), limit = Number($("primitiveLimit").value);
    if (!Number.isFinite(bonus) || !Number.isFinite(limit) || bonus < 0 || limit < 0) return notify("Enter finite, nonnegative test values.");
    factory.state.tuning = { primitiveBonus: bonus, primitiveLimit: limit }; inspectorSignature = ""; save(); refresh(); notify("Primitive test values updated.");
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
        }
        const signature = `${factory.layoutVersion}:${camera.x}:${camera.y}:${camera.zoom}:${viewport.width}:${viewport.height}`;
        if (floorSignature !== signature) { floorSignature = signature; R.drawFloor(floor, factory, camera, viewport); }
        const cargoSignature = `${signature}:${factory.state.seconds}:${interaction.selected}:${interaction.tree}:${JSON.stringify(interaction.tool)}:${JSON.stringify(interaction.hover)}`;
        if (overlaySignature !== cargoSignature) { overlaySignature = cargoSignature; R.drawOverlay(overlay, factory, camera, viewport, interaction); }
      }
    }
    if (toastTime && now >= toastTime) { $("notice").classList.remove("visible"); toastTime = 0; }
    requestAnimationFrame(frame);
  }
  resize(); home(); refresh();
  if (storageFailed) notify("A saved prototype could not be loaded. It has not been overwritten; export or import a valid save before continuing.");
  else if (factory.recoveredForPlanterResize) notify(`${factory.recoveredForPlanterResize} overlapping machine(s) returned to inventory for the corrected footprints. Their contents were recovered.`);
  else if (factory.reorientedForFiberResize) notify("Old Fiber Extractors now point down. Reconnect their lower outputs; contents are preserved.");
  if (!storageFailed) save();
  requestAnimationFrame(frame);
}());
