const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("../noammo-simulation.js");

// Exercise the actual browser entry and event handlers without networking or browser automation.
// This is a DOM contract test, not a claim of live-browser visual verification.
function boot(saved, { width = 900, height = 600 } = {}) {
  const ids = new Map(), frames = [], windowEvents = new Map(), documentEvents = new Map(), storage = new Map();
  const rectangle = { left: 0, top: 0, width, height }, observers = [], renders = [];
  let writes = 0;
  if (saved !== undefined) storage.set(A.DATA.saveKey, saved);
  const drawing = {};
  for (const name of ["save", "restore", "clearRect", "fillRect", "strokeRect", "translate", "rotate", "scale", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillText", "setTransform"]) drawing[name] = () => {};
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.events = new Map();
      this.textContent = ""; this.hidden = false; this.disabled = false; this._value = "";
      const classes = new Set();
      this.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name), toggle: (name, value) => value ? classes.add(name) : classes.delete(name) };
    }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    get value() { return this._value || (this.tagName === "SELECT" ? this.children[0]?.value ?? "" : ""); }
    set value(value) { this._value = String(value); }
    get options() { return this.tagName === "SELECT" ? this.children : []; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(fn); }
    emit(type, event = {}) {
      if (type === "click" && this.disabled) return;
      for (const fn of this.events.get(type) ?? []) fn({ preventDefault() {}, target: this, ...event });
    }
    setAttribute(key, value) { this[key] = value; }
    getBoundingClientRect() {
      return ids.get("factory")?.hidden && ["viewport", "cargo"].includes(this.id)
        ? { ...rectangle, width: 0, height: 0 } : { ...rectangle };
    }
    getContext() { return drawing; }
    select() {}
  }
  const html = fs.readFileSync(path.join(__dirname, "..", "noammo.html"), "utf8");
  for (const [, tag, id] of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/g)) new Element(tag).id = id;
  const tabNames = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  const tabs = tabNames.map((name) => {
    const button = new Element("button"); button.dataset.tab = name; return button;
  });
  const inventoryTabs = ["machines", "items"].map((name) => {
    const button = new Element("button"); button.dataset.inventoryTab = name; return button;
  });
  const inventoryCategories = [...html.matchAll(/data-inventory-category="([^"]+)"/g)].map((match) => match[1]).map((name) => {
    const button = new Element("button"); button.dataset.inventoryCategory = name; return button;
  });
  const categories = ["All", "Cash", "Material", "Logistics"].map((name) => {
    const button = new Element("button"); button.dataset.category = name; return button;
  });
  const document = {
    hidden: false, activeElement: null, getElementById: (id) => ids.get(id),
    createElement: (tag) => new Element(tag), addEventListener: (type, fn) => documentEvents.set(type, fn),
    querySelectorAll(selector) {
      if (selector === ".screen") return tabNames.map((id) => ids.get(id));
      if (selector === "[data-tab]") return tabs;
      if (selector === "[data-inventory-tab]") return inventoryTabs;
      if (selector === "[data-inventory-category]") return inventoryCategories;
      if (selector === "[data-category]") return categories;
      throw new Error(`Unexpected selector: ${selector}`);
    },
  };
  const context = {
    document, performance: { now: () => 0 }, devicePixelRatio: 1,
    requestAnimationFrame: (fn) => frames.push(fn), ResizeObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    addEventListener: (type, fn) => windowEvents.set(type, fn), confirm: () => true,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem(key, value) { writes++; storage.set(key, value); } },
    console: { warn() {} },
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ["noammo-data.js", "noammo-simulation.js", "noammo-renderer.js", "noammo-ui.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", name), "utf8"), context, { filename: name });
    if (name === "noammo-renderer.js") for (const layer of ["drawFloor", "drawOverlay"]) {
      const draw = context.NoAmmoRenderer[layer];
      context.NoAmmoRenderer[layer] = (ctx, factory, camera, viewport, ...rest) => {
        renders.push({ layer, camera: { ...camera }, viewport: { ...viewport }, interaction: JSON.parse(JSON.stringify(rest[0] ?? {})) });
        return draw(ctx, factory, camera, viewport, ...rest);
      };
    }
  }
  return { ids, tabs, categories, inventoryTabs, inventoryCategories, storage, get writes() { return writes; },
    save: () => windowEvents.get("beforeunload")(),
    frame(now) { assert.ok(frames.length); frames.shift()(now); },
    view() { return renders.at(-1); },
    key(key, event = {}) { documentEvents.get("keydown")({ key, preventDefault() {}, ...event }); },
    keyUp(key) { documentEvents.get("keyup")({ key }); },
    blur() { windowEvents.get("blur")(); },
    releaseOn(element) { windowEvents.get("pointerup")({ target: element }); },
    resize(nextWidth, nextHeight) {
      rectangle.width = nextWidth; rectangle.height = nextHeight;
      windowEvents.get("resize")(); observers.forEach((fn) => fn());
    },
    state() { windowEvents.get("beforeunload")(); return JSON.parse(storage.get(A.DATA.saveKey)).state; } };
}

function screenPoint(x, y) {
  return { clientX: (x - A.DATA.config.columns / 2) * 32 + 452,
    clientY: (y - A.DATA.config.rows / 2) * 32 + 302 };
}

function shopCard(ui, type) {
  const card = ui.ids.get('shopCards').children.find(card => card.dataset.machine === type);
  assert.ok(card, `${type} has a Shop card`); return card;
}

test('shaping finished-item buffer is visible and its controls stay mounted while work overlaps blocked output', () => {
  const f = new A.Factory(A.createState(1)); f.state.stock.clayShaper = 1;
  const bench = f.place('clayShaper', 121, 121).machine, input = A.ports(bench)[0];
  f.receive(bench, A.cargo('clay', 2), input.x, input.y, input.direction, true);
  f.update(0.1); f.update(2);
  const ui = boot(f.exportSave()); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const mode = ui.ids.get('shapingMode'), buffer = ui.ids.get('shapingBuffers');
  assert.match(buffer.textContent, /Finished items: 1 \/ 1/);
  for (let now = 100; now <= 4000; now += 100) ui.frame(now);
  assert.equal(ui.ids.get('shapingMode'), mode); assert.equal(ui.ids.get('shapingBuffers'), buffer);
  assert.match(ui.ids.get('machineStatus').textContent, /blocked/i);
  const restored = ui.state().machines.find(m => m.type === 'clayShaper');
  assert.equal(restored.output.length, 1); assert.equal(restored.job.remaining, 0);
});

test('Manual Overflow Shop costs, stable side control, occupied-mode refusal and move previews use the real footprint', () => {
  const f = new A.Factory(A.createState(1));
  f.state.cash = 2; f.state.inventory.wood = 20; f.state.inventory.woodenGear = 2; f.state.stock.belt = 2;
  const ui = boot(f.exportSave()); ui.tabs.find(b => b.dataset.tab === 'shop').emit('click');
  shopCard(ui, 'manualOverflow').emit('click');
  assert.deepEqual(ui.ids.get('costs').children.map(row => row.children[1].textContent), ['$2 / $2', '20 / 20', '2 / 2', '2 / 2']);
  ui.ids.get('buyMachine').emit('click'); assert.equal(ui.state().stock.manualOverflow, 1);
  chooseMachine(ui, 'manualOverflow'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  ui.ids.get('cancel').emit('click'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const mode = ui.ids.get('overflowMode'); assert.equal(mode.value, 'up');
  assert.deepEqual(mode.children.map(option => [option.value, option.textContent]), [['up', 'Left'], ['down', 'Right']]);
  for (let now = 100; now <= 500; now += 100) ui.frame(now);
  assert.equal(ui.ids.get('overflowMode'), mode, 'simulation updates do not remount the selector');
  // The inactive lower hamster square accepts a separate Basket.
  chooseMachine(ui, 'basket'); ui.ids.get('cargo').emit('click', screenPoint(122, 123));
  ui.ids.get('cancel').emit('click'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const blocked = ui.ids.get('overflowMode'); blocked.value = 'down'; blocked.emit('change');
  assert.equal(blocked.value, 'up'); assert.match(ui.ids.get('notice').textContent, /must be clear/);
  ui.ids.get('cargo').emit('click', screenPoint(122, 123)); ui.ids.get('pickupMachine').emit('click');
  ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  ui.ids.get('overflowMode').value = 'down'; ui.ids.get('overflowMode').emit('change');
  assert.equal(ui.state().machines.find(m => m.type === 'manualOverflow').mode, 'down');
  ui.ids.get('moveMachine').emit('click'); ui.frame(600);
  assert.equal(ui.view().interaction.tool.mode, 'down');
  ui.ids.get('overflowMode').value = 'up'; ui.ids.get('overflowMode').emit('change'); ui.frame(700);
  assert.equal(ui.view().interaction.tool.mode, 'up', 'mode changes while moving update the preview too');
  ui.ids.get('cargo').emit('click', screenPoint(123, 121));
  const moved = ui.state().machines.find(m => m.type === 'manualOverflow');
  assert.equal(moved.mode, 'up'); assert.equal(moved.x, 123); assert.equal(A.cells(moved).length, 5);
});

test('Copper finishing Shop prices, effects and molder production controls use shared data and stay mounted', () => {
  const f = new A.Factory(A.createState(1)); f.state.cash = 125000;
  Object.assign(f.state.inventory, { brick: 40, clay: 20, leekFiber: 210, wood: 50, copperIngot: 10 }); f.state.stock.belt = 1;
  let ui = boot(f.exportSave()); ui.tabs.find(b => b.dataset.tab === 'shop').emit('click');
  for (const [type, expected] of [
    ['ingotMolder', ['$125k / $25k', '40 / 40', '20 / 20', '210 / 10']],
    ['copperChimes', ['$100k / $100k', '200 / 200', '50 / 50', '10 / 10', '1 / 1']],
  ]) {
    shopCard(ui, type).emit('click');
    assert.deepEqual(ui.ids.get('costs').children.map(row => row.children[1].textContent), expected);
    if (type === 'copperChimes') assert.deepEqual(ui.ids.get('shopDetail').children.filter(n => n.className === 'machine-effect').map(n => n.textContent),
      ['Cash effect: ×1.25', 'Use Limit: 1', 'Upper Limit: $5k']);
    ui.ids.get('buyMachine').emit('click'); assert.equal(ui.state().stock[type], 1);
  }
  f.state.stock.primitiveFurnace = 1; f.state.stock.ingotMolder = 1; f.state.stock.basket++;
  const furnace = f.place('primitiveFurnace', 121, 121).machine;
  f.setFurnaceMode(furnace.id, 'copper'); furnace.output = [A.cargo('moltenCopper', 4, 108.4)];
  f.place('ingotMolder', 123, 121); const basket = f.place('basket', 124, 122).machine;
  ui = boot(f.exportSave()); ui.ids.get('cargo').emit('click', screenPoint(123, 121));
  const buffers = ui.ids.get('molderBuffers'), move = ui.ids.get('moveMachine');
  assert.equal(buffers.textContent, 'Waiting liquid: 0 / 1 · Finished ingots: 0 / 1');
  for (let n = 1; n <= 45; n++) ui.frame(n * 100);
  assert.equal(ui.ids.get('molderBuffers'), buffers); assert.equal(ui.ids.get('moveMachine'), move);
  assert.equal(ui.state().machines.find(m => m.id === basket.id).contents[0].quantity, 4);
  assert.equal(ui.state().inventory.clay, 20, 'molding never consumes construction Clay');
});

test('furnace pickup clears the inspector and runtime contents for single and group selections', () => {
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  for (const type of Object.keys(A.DATA.machines).filter(type => A.DATA.machines[type].heatCapacity)) for (const group of [false, true]) {
    const f = new A.Factory(A.createState(1)); f.state.stock[type]++;
    const furnace = f.place(type, 121, 121).machine;
    furnace.heat = 240000; furnace.outputCooldown = 1.5;
    furnace.input.push(A.cargo(type === 'kiln' ? 'unfiredBrick' : 'nativeCopper'));
    furnace.output.push(A.cargo(type === 'kiln' ? 'pot' : 'moltenCopper', type === 'kiln' ? 2 : 4));
    if (type !== 'kiln') furnace.mode = 'copper';
    f.place('basket', 124, 122);
    const ui = boot(f.exportSave()), canvas = ui.ids.get('cargo'), panel = ui.ids.get('inspector');
    canvas.emit('click', screenPoint(121, 121)); ui.frame(100);
    assert.ok(descendants(panel).some(node => node.id === 'kilnHeat'));
    if (group) box(ui, [120, 120], [125, 123]);
    const pickup = ui.ids.get(group ? 'pickupGroup' : 'pickupMachine'); pickup.emit('click');
    for (const id of ['machineStatus', 'kilnHeat', 'kilnBuffers', 'furnaceMode', 'pickupMachine', 'pickupGroup']) {
      assert.equal(descendants(panel).some(node => node.id === id), false, `${type}: ${id} must leave the panel immediately`);
    }
    ui.frame(200);
    assert.deepEqual(ui.view().interaction.selectedIds, []);
    assert.equal(ui.view().interaction.selected, null);
    const state = ui.state(), stored = state.storedMachines.find(m => m.id === furnace.id);
    assert.equal(state.machines.some(m => m.id === furnace.id), false);
    assert.equal(stored.heat, 0); assert.equal(stored.outputCooldown, 0);
    assert.deepEqual(stored.input, []); assert.deepEqual(stored.output, []); assert.equal(stored.job, null);
    assert.equal(state.inventory[type === 'kiln' ? 'unfiredBrick' : 'nativeCopper'], 1);
    assert.equal(state.inventory.moltenCopper, 0);
    pickup.emit('click'); assert.deepEqual(ui.state().inventory, state.inventory, 'detached controls cannot refund contents twice');
    chooseMachine(ui, type); canvas.emit('click', screenPoint(126, 124));
    const replaced = ui.state().machines.find(m => m.id === furnace.id);
    assert.equal(replaced.heat, 0); assert.equal(replaced.output.length, 0); assert.equal(replaced.input.length, 0);
  }
});

test('Copper industry Shop costs and furnace mode, heat and buffers stay current without remounting controls', () => {
  const f = new A.Factory(A.createState(1)); f.state.cash = 325000;
  Object.assign(f.state.inventory, { granite: 200, chert: 50, woodenGear: 20, wood: 40, brick: 200, clay: 50 });
  const ui = boot(f.exportSave()); ui.tabs.find(b => b.dataset.tab === 'shop').emit('click');
  for (const [type, expected] of [
    ['copperDrill', ['$325k / $75k', '200 / 100', '50 / 50', '20 / 20', '40 / 40']],
    ['primitiveFurnace', ['$250k / $250k', '200 / 200', '100 / 100', '50 / 50']],
  ]) {
    shopCard(ui, type).emit('click');
    assert.deepEqual(ui.ids.get('costs').children.map(row => row.children[1].textContent), expected);
    ui.ids.get('buyMachine').emit('click'); assert.equal(ui.state().stock[type], 1);
  }
  chooseMachine(ui, 'primitiveFurnace'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  ui.ids.get('cancel').emit('click'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const mode = ui.ids.get('furnaceMode'), heat = ui.ids.get('kilnHeat'), move = ui.ids.get('moveMachine');
  assert.deepEqual(mode.children.map(o => [o.value, o.textContent]), [['charcoal', 'Charcoal · 12s'], ['copper', 'Copper smelting · 20s']]);
  assert.equal(heat.textContent, 'Heat: 0 / 1Mu');
  mode.value = 'copper'; mode.emit('change');
  for (let n = 1; n <= 30; n++) ui.frame(n * 100);
  assert.equal(ui.ids.get('furnaceMode'), mode); assert.equal(ui.ids.get('kilnHeat'), heat); assert.equal(ui.ids.get('moveMachine'), move);
  assert.equal(ui.state().machines.find(m => m.type === 'primitiveFurnace').mode, 'copper');
  move.emit('click'); ui.ids.get('rotateRight').emit('click'); ui.ids.get('cargo').emit('click', screenPoint(125, 121));
  assert.equal(ui.state().machines.find(m => m.type === 'primitiveFurnace').mode, 'copper');
});

function viewCenter(view) {
  return { x: view.camera.x + view.viewport.width / (64 * view.camera.zoom),
    y: view.camera.y + view.viewport.height / (64 * view.camera.zoom) };
}

test("startup and explicit imports enforce fixed terrain, back up the old save, and only pick machines up once", () => {
  const old = new A.Factory(A.createState(1));
  delete old.state.terrainVersion;
  old.state.trees = [{ id: "tree-1", x: 20, y: 20 }];
  old.place("planter", 121, 121);
  old.state.cash = 12; old.state.hiredCrew = 2;
  const raw = old.exportSave(), backupKey = `${A.DATA.saveKey}-before-fixed-terrain-${A.DATA.startingTerrain.version}`;
  const ui = boot(raw);
  assert.equal(ui.storage.get(backupKey), raw);
  assert.match(ui.ids.get("notice").textContent, /Fixed tree map applied.*1 placed machine/);
  assert.equal(ui.state().machines.length, 0); assert.equal(ui.state().cash, 12);
  assert.equal(ui.state().hiredCrew, 2); assert.equal(ui.state().trees.length, 36);
  chooseMachine(ui, "planter"); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.equal(ui.state().machines.length, 1);
  const current = ui.storage.get(A.DATA.saveKey);
  const refreshed = boot(current);
  assert.equal(refreshed.state().machines.length, 1);
  assert.equal(refreshed.storage.has(backupKey), false, "normal reload creates no new backup");
  old.state.cash = 13;
  ui.ids.get("saveText").value = old.exportSave(); ui.ids.get("import").emit("click");
  assert.equal(ui.state().machines.length, 0); assert.equal(ui.storage.get(backupKey), raw);
  assert.equal(ui.state().cash, 13, "later imports do not overwrite the first recovery backup");
  assert.match(ui.ids.get("notice").textContent, /Fixed tree map applied/);
  assert.equal(ui.storage.has("hamster-miners-save"), false);
});

function chooseMachine(ui, type) {
  ui.ids.get("openInventory").emit("click");
  ui.ids.get("machineCards").children.find((card) => card.dataset.machine === type).emit("click");
  ui.ids.get("placeMachine").emit("click");
}

test("Wheel placement starts rotated ninety degrees and Q/E still rotate normally", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.stock.wheel = 1;
  const ui = boot(factory.exportSave());
  chooseMachine(ui, "wheel"); ui.frame(100);
  assert.equal(ui.view().interaction.tool.facing, "down");
  assert.deepEqual(A.size(ui.view().interaction.tool), { width: 2, height: 3 });
  ui.key("q"); ui.frame(200);
  assert.equal(ui.view().interaction.tool.facing, "right");
  ui.key("e");
  ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  const wheel = ui.state().machines[0];
  assert.equal(wheel.facing, "down"); assert.deepEqual(A.size(wheel), { width: 2, height: 3 });
});

function bulkFixture() {
  const factory = new A.Factory(A.createState(1));
  const planter = factory.place("planter", 121, 121).machine;
  const basket = factory.place("basket", 124, 122).machine;
  factory.state.stock.fiber = 1;
  const fiber = factory.place("fiber", 125, 121).machine;
  return { ui: boot(factory.exportSave()), ids: [planter.id, basket.id, fiber.id] };
}

function box(ui, start = [121, 121], end = [125, 123]) {
  // Explicit selection may start on occupied tiles; contextual Shift may not.
  ui.ids.get("boxSelect").emit("click");
  ui.ids.get("cargo").emit("click", screenPoint(...start));
  ui.ids.get("cargo").emit("click", screenPoint(...end));
}

test("Inventory separates Machines and Items, with no default machine list on the factory floor", () => {
  const ui = boot();
  assert.ok(ui.tabs.some((button) => button.dataset.tab === "inventory"));
  assert.equal(ui.ids.has("palette"), false);
  const html = fs.readFileSync(path.join(__dirname, "..", "noammo.html"), "utf8");
  const factoryMarkup = html.split('<section id="factory"')[1].split('<section id="shop"')[0];
  assert.doesNotMatch(factoryMarkup, /id="machineCards"|Owned machines|build-panel/);
  ui.ids.get("openInventory").emit("click");
  assert.equal(ui.ids.get("inventory").hidden, false);
  assert.equal(ui.ids.get("machineInventory").hidden, false);
  assert.equal(ui.ids.get("itemInventory").hidden, true);
  const visible = ui.ids.get("machineCards").children.filter((card) => !card.hidden);
  assert.deepEqual(visible.map((card) => card.dataset.machine), ["planter", "basket", "sellTube"]);
  ui.inventoryTabs[1].emit("click");
  assert.equal(ui.ids.get("machineInventory").hidden, true);
  assert.equal(ui.ids.get("itemInventory").hidden, false);
  ui.tabs[0].emit("click"); ui.tabs.find((button) => button.dataset.tab === "inventory").emit("click");
  assert.equal(ui.ids.get("itemInventory").hidden, false, "the chosen sub-screen is retained");
});

test("machine cards filter, select stable details, and Place returns to the unchanged factory camera", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.stock.sellTube = 0;
  const ui = boot(factory.exportSave()); ui.frame(100);
  ui.ids.get("zoomIn").emit("click"); ui.frame(200);
  const before = ui.view().camera;
  ui.ids.get("openInventory").emit("click");
  ui.inventoryCategories.find((button) => button.dataset.inventoryCategory === "Logistics").emit("click");
  const cards = ui.ids.get("machineCards").children;
  assert.deepEqual(cards.filter((card) => !card.hidden).map((card) => card.dataset.machine), ["basket"]);
  const place = ui.ids.get("placeMachine"), owned = ui.ids.get("inventoryOwned");
  for (let now = 300; now < 900; now += 100) ui.frame(now);
  assert.equal(ui.ids.get("placeMachine"), place); assert.equal(ui.ids.get("inventoryOwned"), owned);
  assert.match(owned.textContent, /available to place: 1/);
  place.emit("click"); ui.frame(900);
  assert.equal(ui.ids.get("factory").hidden, false); assert.deepEqual(ui.view().camera, before);
  assert.match(ui.ids.get("toolLabel").textContent, /Placing Leek Basket/);
  ui.ids.get("cancel").emit("click");
  ui.ids.get("openInventory").emit("click");
  ui.inventoryCategories.find((button) => button.dataset.inventoryCategory === "Cash").emit("click");
  assert.equal(ui.ids.get("machineEmpty").hidden, false); assert.equal(ui.ids.get("machineDetail").hidden, true);
});

test("explicit two-tap selection moves and rotates a group, while Cancel preserves its original layout", () => {
  const { ui, ids } = bulkFixture();
  box(ui); ui.frame(100);
  assert.deepEqual(ui.view().interaction.selectedIds, ids);
  const original = ui.state().machines.map(({ id, x, y, facing }) => ({ id, x, y, facing }));
  ui.ids.get("moveGroup").emit("click");
  ui.ids.get("rotateRight").emit("click"); ui.ids.get("rotateLeft").emit("click");
  ui.ids.get("cancel").emit("click");
  assert.deepEqual(ui.state().machines.map(({ id, x, y, facing }) => ({ id, x, y, facing })), original);
  ui.ids.get("moveGroup").emit("click");
  ui.ids.get("rotateRight").emit("click");
  ui.ids.get("cargo").emit("pointermove", screenPoint(115, 125)); ui.frame(200);
  assert.equal(ui.view().interaction.group.turns, 1);
  ui.ids.get("cargo").emit("click", screenPoint(115, 125));
  const moved = ui.state().machines;
  assert.deepEqual(moved.map(({ x, y, facing }) => [x, y, facing]), [[115, 125, "down"], [116, 128, "down"], [116, 129, "down"]]);
  assert.deepEqual(moved.map((machine) => machine.id), ids);
  ui.ids.get("pickupGroup").emit("click");
  const state = ui.state(); assert.equal(state.machines.length, 0);
  for (const type of ["planter", "basket", "fiber"]) assert.equal(state.stock[type], 1);
});

test("box selection supports reversed corners, additive boxes, repeat/input guards and cancellation", () => {
  const { ui, ids } = bulkFixture();
  box(ui, [124, 122], [124, 122]); ui.frame(100);
  assert.deepEqual(ui.view().interaction.selectedIds, [ids[1]]);
  ui.key("Shift"); ui.ids.get("cargo").emit("click", screenPoint(125, 123));
  ui.key("Shift", { repeat: true }); ui.key("Shift");
  assert.match(ui.ids.get("toolLabel").textContent, /opposite corner/);
  ui.ids.get("cargo").emit("click", { ...screenPoint(121, 121), shiftKey: true }); ui.frame(200);
  assert.deepEqual(new Set(ui.view().interaction.selectedIds), new Set(ids));
  ui.ids.get("boxSelect").emit("click"); ui.ids.get("cargo").emit("click", screenPoint(120, 120));
  ui.key("Escape"); ui.frame(300);
  assert.equal(ui.view().interaction.box, null);
  assert.deepEqual(new Set(ui.view().interaction.selectedIds), new Set(ids));
  ui.key("Shift", { target: { tagName: "INPUT" } });
  assert.doesNotMatch(ui.ids.get("toolLabel").textContent, /first corner/);
});

function quickActionFixture(type = "basket") {
  const factory = new A.Factory(A.createState(1));
  const planter = factory.place("planter", 121, 121).machine;
  if (type !== "basket") factory.state.stock[type]++;
  const basket = factory.place(type, 124, 122).machine;
  factory.state.stock.basket++;
  const other = factory.place("basket", 127, 122).machine;
  basket.contents.push(A.cargo("wood", 3), A.cargo("leekFiber", 2));
  other.contents.push(A.cargo("wood", 4));
  return { ui: boot(factory.exportSave()), planter, basket, other };
}
function shiftClick(ui, x, y, tapOnly = false) {
  ui.key("Shift");
  ui.ids.get("cargo").emit("click", { ...screenPoint(x, y), shiftKey: !tapOnly });
}

test("Shift-click collects an unselected or currently selected resource collector once, without selling or selecting it", () => {
  for (const type of ["basket", "brickStorage"]) for (const selected of [false, true]) for (const tapOnly of [false, true]) {
    const { ui, basket } = quickActionFixture(type);
    if (selected) ui.ids.get("cargo").emit("click", screenPoint(124, 122));
    shiftClick(ui, 124, 122, tapOnly); ui.frame(100);
    let state = ui.state();
    assert.equal(state.inventory.wood, 3); assert.equal(state.inventory.leekFiber, 2);
    assert.equal(state.machines.find((m) => m.id === basket.id).contents.length, 0);
    assert.equal(state.cash, 0);
    assert.equal(ui.view().interaction.box, null);
    assert.deepEqual(ui.view().interaction.selectedIds, selected ? [basket.id] : []);
    shiftClick(ui, 124, 122, tapOnly);
    state = ui.state(); assert.equal(state.inventory.wood, 3); assert.equal(state.inventory.leekFiber, 2);
  }
});

test("Shift-click adds buildings to single/group selections and suppresses collector quick actions", () => {
  for (const selection of ["machine", "basket", "tree", "group"]) for (const tapOnly of [false, true]) {
    const { ui, planter, basket, other } = quickActionFixture(), canvas = ui.ids.get("cargo");
    if (selection === "machine") canvas.emit("click", screenPoint(121, 121));
    if (selection === "basket") canvas.emit("click", screenPoint(127, 122));
    if (selection === "tree") shiftClick(ui, 128, 129);
    if (selection === "group") box(ui, [120, 120], [125, 123]);
    shiftClick(ui, 124, 122, tapOnly); ui.frame(100);
    const state = ui.state();
    assert.deepEqual(state.inventory, A.createState(1).inventory, selection);
    assert.equal(state.machines.find((m) => m.id === basket.id).contents.length, 2);
    const expected = selection === "machine" || selection === "group" ? [planter.id, basket.id]
      : selection === "basket" ? [other.id, basket.id] : [basket.id];
    assert.deepEqual(ui.view().interaction.selectedIds, expected);
    assert.equal(ui.view().interaction.box, null);
    if (expected.length > 1) {
      assert.ok(ui.ids.get("moveGroup")); assert.ok(ui.ids.get("pickupGroup"));
      shiftClick(ui, 124, 122, tapOnly); ui.frame(200);
      assert.deepEqual(ui.view().interaction.selectedIds, expected, "already-selected members are not duplicated or removed");
      assert.equal(ui.state().inventory.wood, 0, "a group member cannot trigger its quick action");
    }
    canvas.emit("click", screenPoint(124, 122)); ui.frame(300);
    assert.deepEqual(ui.view().interaction.selectedIds, [basket.id], "plain click replaces the group");
    shiftClick(ui, 124, 122, tapOnly); assert.equal(ui.state().inventory.wood, 3, "a lone selected collector still permits collect");
  }
});

test("Shift on occupied tiles without a quick action selects rather than starting a box or chopping", () => {
  const { ui, planter, basket } = quickActionFixture();
  shiftClick(ui, 121, 121); ui.frame(100);
  assert.deepEqual(ui.view().interaction.selectedIds, [planter.id]);
  assert.equal(ui.view().interaction.box, null);
  ui.ids.get("cargo").emit("click", screenPoint(124, 122));
  shiftClick(ui, 121, 121); ui.frame(150);
  assert.deepEqual(ui.view().interaction.selectedIds, [basket.id, planter.id]);
  shiftClick(ui, 128, 129); ui.frame(200);
  assert.deepEqual(ui.view().interaction.selectedIds, []);
  assert.ok(ui.view().interaction.tree);
  assert.equal(ui.state().harvestProgress, 0, "tree has no defined Shift quick action");
  assert.equal(ui.view().interaction.box, null);
});

test("Shift starts boxes only on empty tiles, finishes on occupied corners, and never collects during explicit selection", () => {
  for (const held of [false, true]) {
    const { ui, basket, planter } = quickActionFixture(), canvas = ui.ids.get("cargo");
    if (!held) ui.key("Shift");
    canvas.emit("click", { ...screenPoint(120, 120), shiftKey: held }); ui.frame(100);
    assert.deepEqual(ui.view().interaction.box.start, { x: 120, y: 120 });
    canvas.emit("click", { ...screenPoint(124, 122), shiftKey: held }); ui.frame(200);
    assert.deepEqual(ui.view().interaction.selectedIds, [planter.id, basket.id]);
    assert.equal(ui.state().inventory.wood, 0);
    ui.ids.get("cancel").emit("click");
    box(ui, [124, 122], [124, 122]); ui.frame(300);
    assert.deepEqual(ui.view().interaction.selectedIds, [basket.id]);
    assert.equal(ui.state().inventory.wood, 0, "explicit Box select wins over quick actions");
    ui.ids.get("cancel").emit("click");
    ui.key("Shift"); ui.ids.get("boxSelect").emit("click");
    canvas.emit("click", { ...screenPoint(124, 122), shiftKey: true }); ui.frame(400);
    assert.ok(ui.view().interaction.box.start, "explicit button overrides a pending contextual Shift");
    assert.equal(ui.state().inventory.wood, 0);
  }
});

test("occupied Shift-click gestures do not turn into background marquee selection", () => {
  const { ui } = quickActionFixture(), canvas = ui.ids.get("cargo");
  const point = { ...screenPoint(124, 122), shiftKey: true };
  ui.key("Shift"); canvas.emit("pointerdown", point);
  canvas.emit("pointermove", { ...point, clientX: point.clientX + 10 });
  canvas.emit("pointerup", point); canvas.emit("click", point); ui.frame(100);
  assert.equal(ui.view().interaction.marquee, null); assert.equal(ui.view().interaction.box, null);
  assert.equal(ui.state().inventory.wood, 3);
});

test("placement and movement take priority over Shift quick actions, and shortcuts remain discoverable", () => {
  const { ui, basket } = quickActionFixture(), canvas = ui.ids.get("cargo");
  chooseMachine(ui, "sellTube");
  shiftClick(ui, 124, 122); ui.frame(100);
  assert.equal(ui.state().inventory.wood, 0); assert.ok(ui.view().interaction.tool);
  ui.ids.get("cancel").emit("click");
  canvas.emit("click", screenPoint(124, 122)); ui.ids.get("moveMachine").emit("click");
  shiftClick(ui, 126, 124); ui.frame(200);
  const moved = ui.state().machines.find((m) => m.id === basket.id);
  assert.deepEqual([moved.x, moved.y], [126, 124]);
  assert.equal(ui.view().interaction.tool, null);
  // Moving Baskets already collects contents under the normal move rules.
  assert.match(ui.ids.get("collectBasket").title, /Shift-click/);
  assert.ok(ui.ids.get("shortcutGuide"));
  const html = fs.readFileSync(path.join(__dirname, "..", "noammo.html"), "utf8");
  assert.match(html, /Shortcuts &amp; controls/);
  assert.match(html, /Shift-click empty ground/); assert.match(html, /add.*building.*selection/i);
});

test("intentional dragging selects a group but pointer jitter does not, and generated clicks are suppressed", () => {
  const { ui, ids } = bulkFixture(), canvas = ui.ids.get("cargo");
  canvas.emit("pointerdown", screenPoint(120, 120));
  canvas.emit("pointermove", screenPoint(126, 124));
  canvas.emit("pointerup", screenPoint(126, 124));
  canvas.emit("click", screenPoint(126, 124)); ui.frame(100);
  assert.deepEqual(ui.view().interaction.selectedIds, ids);
  const point = screenPoint(120, 120);
  canvas.emit("pointerdown", point); canvas.emit("pointermove", { ...point, clientX: point.clientX + 4 });
  canvas.emit("pointerup", point); canvas.emit("click", point); ui.frame(200);
  assert.deepEqual(ui.view().interaction.selectedIds, []);
});

test("releasing a selection over machine controls cannot select or move the background floor", () => {
  const { ui, ids } = bulkFixture(), canvas = ui.ids.get("cargo");
  canvas.emit("click", screenPoint(124, 122));
  canvas.emit("pointerdown", screenPoint(120, 120)); canvas.emit("pointermove", screenPoint(126, 124));
  ui.releaseOn(ui.ids.get("moveMachine")); ui.ids.get("moveMachine").emit("click"); ui.frame(100);
  assert.deepEqual(ui.view().interaction.selectedIds, [ids[1]]);
  assert.equal(ui.view().interaction.tool.id, ids[1]);
  assert.equal(ui.view().interaction.marquee, null);
  assert.deepEqual(ui.state().machines.map(({ x, y }) => [x, y]), [[121, 121], [124, 122], [125, 121]]);
  ui.ids.get("cancel").emit("click");
  ui.ids.get("boxSelect").emit("click"); canvas.emit("click", screenPoint(120, 120));
  ui.ids.get("moveMachine").emit("click"); ui.frame(200);
  assert.equal(ui.view().interaction.box, null, "Move overrides an unfinished box selection");
  canvas.emit("click", screenPoint(127, 125));
  const moved = ui.state().machines.find((machine) => machine.id === ids[1]);
  assert.deepEqual([moved.x, moved.y], [127, 125]);
});

test("refresh centres both axes, including when the viewport only becomes measurable later", () => {
  for (const [width, height] of [[900, 600], [430, 510], [0, 0]]) {
    const ui = boot(undefined, { width, height });
    ui.frame(100);
    if (!width) { assert.equal(ui.view(), undefined); ui.resize(900, 600); ui.frame(200); }
    assert.deepEqual(viewCenter(ui.view()), { x: 125, y: 125 });
    assert.equal(ui.view().camera.zoom, 1);
  }
});

test("pan and zoom survive every game tab, hidden resizes and repeated Factory visits", () => {
  const ui = boot();
  ui.frame(100);
  ui.ids.get("cargo").emit("pointermove", { clientX: 899, clientY: 599 });
  ui.frame(350); ui.frame(600);
  ui.ids.get("zoomIn").emit("click"); ui.frame(700);
  const before = ui.view();
  assert.notDeepEqual(viewCenter(before), { x: 125, y: 125 });
  assert.equal(before.camera.zoom, 1.1);
  let time = 800;
  for (const tab of ui.tabs.filter((button) => button.dataset.tab !== "factory")) {
    tab.emit("click");
    // These notifications happen while Factory has a zero-sized hidden box.
    ui.resize(900, 600); ui.frame(time); time += 100;
    ui.tabs[0].emit("click"); ui.frame(time); time += 100;
    assert.deepEqual(ui.view().camera, before.camera);
    ui.frame(time); time += 100;
    assert.deepEqual(ui.view().camera, before.camera, "a stale edge pointer cannot continue panning after a tab change");
  }
  ui.tabs[1].emit("click"); ui.resize(680, 480);
  ui.tabs[0].emit("click"); ui.frame(time);
  const after = ui.view();
  assert.deepEqual(viewCenter(after), viewCenter(before));
  assert.equal(after.camera.zoom, before.camera.zoom);
  ui.save();
  const reloaded = boot(ui.storage.get(A.DATA.saveKey)); reloaded.frame(100);
  assert.deepEqual(viewCenter(reloaded.view()), { x: 125, y: 125 });
  assert.equal(reloaded.view().camera.zoom, 1, "refresh starts fresh rather than restoring the last pan/zoom");
});

test("Home recentres the floor without discarding zoom", () => {
  const ui = boot(); ui.frame(100);
  ui.ids.get("zoomOut").emit("click");
  ui.ids.get("cargo").emit("pointermove", { clientX: 899, clientY: 599 }); ui.frame(350);
  ui.ids.get("cargo").emit("pointerleave");
  ui.ids.get("home").emit("click"); ui.frame(450);
  assert.deepEqual(viewCenter(ui.view()), { x: 125, y: 125 });
  assert.equal(ui.view().camera.zoom, 0.9);
});

test("opening browser scripts boot every tab without missing elements or runtime errors", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "noammo.html"), "utf8");
  assert.doesNotMatch(html, /250\s*(?:×|by|x)\s*250|36\s+inexhaustible\s+trees/i);
  const ui = boot();
  assert.equal(ui.state().stock.basket, 1);
  for (const button of ui.tabs) {
    assert.doesNotThrow(() => button.emit("click"));
    assert.equal(ui.ids.get(button.dataset.tab).hidden, false);
    ui.frame(100); ui.frame(200);
  }
});

test("crew hiring updates cash, available/total crew and the next price immediately across every tab and reload", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.cash = 10.5;
  const ui = boot(factory.exportSave()), hire = ui.ids.get("hireCrew");
  assert.equal(hire.textContent, "Hire · $5"); assert.equal(hire.disabled, false);
  hire.emit("click");
  assert.equal(ui.state().cash, 5.5); assert.equal(ui.state().hiredCrew, 1);
  assert.equal(ui.ids.get("crew").textContent, "11 / 11"); assert.equal(hire.textContent, "Hire · $5.5");
  for (const tab of ui.tabs) { tab.emit("click"); ui.frame(100); assert.equal(ui.ids.get("hireCrew"), hire); }
  hire.emit("click");
  assert.equal(ui.state().cash, 0); assert.equal(ui.state().hiredCrew, 2);
  assert.equal(ui.ids.get("crew").textContent, "12 / 12");
  assert.equal(hire.textContent, "Hire · $6.05"); assert.equal(hire.disabled, true);
  hire.emit("click"); assert.equal(ui.state().hiredCrew, 2);
  const loaded = boot(ui.storage.get(A.DATA.saveKey));
  assert.equal(loaded.ids.get("crew").textContent, "12 / 12"); assert.equal(loaded.ids.get("hireCrew").textContent, "Hire · $6.05");
});

test("the Hire button enables when factory income reaches its cost without remounting", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.cash = 4.9;
  factory.place("planter", 121, 121); factory.place("sellTube", 124, 121);
  const ui = boot(factory.exportSave()), hire = ui.ids.get("hireCrew");
  assert.equal(hire.disabled, true);
  for (let now = 100; now <= 8500; now += 100) ui.frame(now);
  assert.equal(ui.ids.get("hireCrew"), hire); assert.equal(hire.disabled, false);
  hire.emit("click"); assert.equal(ui.state().hiredCrew, 1);
});

test("Shop buy handler, quantities, material affordability and owned feedback use the real simulation", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.cash = 0; factory.state.inventory.leek = 1; factory.state.inventory.wood = 30;
  const ui = boot(factory.exportSave()); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  const amount = ui.ids.get("quantity"); amount.value = "2"; amount.emit("input");
  assert.equal(ui.ids.get("buyMachine").disabled, true);
  amount.value = "1"; amount.emit("input"); assert.equal(ui.ids.get("buyMachine").disabled, false);
  ui.ids.get("buyMachine").emit("click");
  assert.equal(ui.state().cash, 0); assert.equal(ui.state().inventory.leek, 0); assert.equal(ui.state().inventory.wood, 0); assert.equal(ui.state().stock.fiber, 1);
  assert.match(ui.ids.get("shopOwned").textContent, /Owned: 1/);
  assert.equal(ui.ids.get("buyMachine").disabled, true);
  for (const bad of ["0", "1.5", "10000", ""]) { amount.value = bad; amount.emit("input"); assert.equal(ui.ids.get("buyMachine").disabled, true); }
});

test("Clay Pit purchases show material-only costs, update ownership, place, and expose collected Clay in Items", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.inventory.wood = 100;
  const basket = factory.place("basket", 124, 122).machine;
  basket.contents.push(A.cargo("clay", 3));
  const ui = boot(factory.exportSave()); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  ui.ids.get("shopCards").children.find((card) => card.children.some((node) => node.textContent === "Clay Pit")).emit("click");
  assert.equal(ui.ids.get("buyMachine").disabled, false);
  assert.equal(ui.ids.get("costs").children[1].children[1].textContent, "100 / 100");
  ui.ids.get("buyMachine").emit("click"); assert.equal(ui.state().stock.clayPit, 1); assert.equal(ui.state().cash, 0);
  chooseMachine(ui, "clayPit"); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.equal(ui.state().machines.find((machine) => machine.type === "clayPit").facing, "right");
  ui.ids.get("cancel").emit("click"); shiftClick(ui, 124, 122); shiftClick(ui, 124, 122);
  assert.equal(ui.state().inventory.clay, 3);
  ui.ids.get("openInventory").emit("click"); ui.inventoryTabs[1].emit("click");
  const clay = ui.ids.get("itemCards").children.find((card) => card.children.some((node) => node.textContent === "Clay"));
  assert.ok(clay); clay.children.find((node) => node.textContent === "Sell all").emit("click");
  assert.equal(ui.state().cash, 0.75); assert.equal(ui.state().inventory.clay, 0);
});

test("Brick Storage Shop, inventory placement, collection and stable hauling controls use real handlers", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.cash = 400; factory.state.inventory.brick = 200; factory.state.inventory.clay = 30;
  const basket = factory.place("basket", 128, 124).machine;
  const ui = boot(factory.exportSave());
  ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  ui.categories.find((button) => button.dataset.category === "Logistics").emit("click");
  const card = shopCard(ui, 'brickStorage');
  assert.equal(card.hidden, false); card.emit("click");
  ui.ids.get("quantity").value = "2"; ui.ids.get("quantity").emit("input");
  assert.equal(ui.ids.get("costs").children[0].children[1].textContent, "$400 / $400");
  assert.equal(ui.ids.get("costs").children[1].children[1].textContent, "200 / 200");
  assert.equal(ui.ids.get("costs").children[2].children[1].textContent, "30 / 30");
  ui.ids.get("buyMachine").emit("click");
  assert.equal(ui.state().stock.brickStorage, 2);
  chooseMachine(ui, "brickStorage"); ui.ids.get("cargo").emit("click", screenPoint(123, 122));
  ui.ids.get("cancel").emit("click"); ui.ids.get("cargo").emit("click", screenPoint(123, 122));
  assert.equal(ui.state().stock.brickStorage, 1);
  const storage = ui.state().machines.find((machine) => machine.type === "brickStorage");
  assert.ok(ui.ids.get("haulDestination").options.some((option) => option.value === basket.id));
  const controls = ui.ids.get("haulDestination"); ui.frame(100); ui.frame(300);
  assert.equal(ui.ids.get("haulDestination"), controls);
  const loaded = new A.Factory(ui.state());
  loaded.byId.get(storage.id).contents.push(A.cargo("clay", 600));
  const refreshed = boot(loaded.exportSave());
  refreshed.ids.get("cargo").emit("click", screenPoint(123, 122));
  assert.equal(refreshed.ids.get("basketContents").children[0].children[1].textContent, "600");
  refreshed.ids.get("collectBasket").emit("click");
  assert.equal(refreshed.state().inventory.clay, 600);
  assert.equal(refreshed.state().cash, 0);
  assert.equal(refreshed.ids.get("collectBasket").disabled, true);
});

test("Shop material costs scale with quantity and enforce Sell Tube and Primitive Conveyor prices", () => {
  for (const [type, material, required, cash] of [["sellTube", "brick", 200, 250], ["belt", "wood", 10, 1]]) for (const owned of [required - 1, required]) {
    const factory = new A.Factory(A.createState(1)); factory.state.cash = cash; factory.state.inventory[material] = owned;
    if (type === "belt") factory.state.inventory.woodenGear = 4;
    const initialStock = factory.state.stock[type];
    const ui = boot(factory.exportSave()); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
    shopCard(ui, type).emit('click');
    assert.equal(ui.ids.get("buyMachine").textContent, "Buy");
    assert.equal(ui.ids.get("costs").children[1].children[0].textContent, A.DATA.materials[material].name);
    assert.equal(ui.ids.get("costs").children[1].children[1].textContent, `${owned} / ${required}`);
    assert.equal(ui.ids.get("buyMachine").disabled, owned < required);
    const quantity = ui.ids.get("quantity"); quantity.value = "2"; quantity.emit("input");
    assert.equal(ui.ids.get("costs").children[1].children[1].textContent, `${owned} / ${required * 2}`);
    assert.equal(ui.ids.get("buyMachine").disabled, true);
    if (owned === required) {
      quantity.value = "1"; quantity.emit("input"); ui.ids.get("buyMachine").emit("click");
      assert.equal(ui.state().cash, 0); assert.equal(ui.state().inventory[material], 0); assert.equal(ui.state().stock[type], initialStock + 1);
    }
  }
});

test("Grading Bench Shop, inventory, live probabilities and graded collector labels use stable real controls", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.cash = 1250; Object.assign(factory.state.inventory, { wood: 100, leekFiber: 50, chert: 10 });
  const basket = factory.place("basket", 123, 122).machine;
  basket.contents.push(A.gradeStack({ random: 1500 }, A.cargo("brick", 1, 10)));
  const ui = boot(factory.exportSave()); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  shopCard(ui, 'gradingBench').emit('click');
  assert.equal(ui.ids.get("buyMachine").disabled, false);
  assert.deepEqual(ui.ids.get("costs").children.map((row) => row.children[1].textContent), ["$1.25k / $1.25k", "100 / 100", "50 / 50", "10 / 10"]);
  ui.ids.get("buyMachine").emit("click"); chooseMachine(ui, "gradingBench");
  ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  ui.ids.get("cancel").emit("click"); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.match(ui.ids.get("gradingChances").textContent, /Clay: Poor 20%.*Standard 60%.*Fine 20%/);
  const chance = ui.ids.get("gradingChances"); ui.frame(100); ui.frame(400);
  assert.equal(ui.ids.get("gradingChances"), chance);
  assert.match(ui.ids.get("machineStatus").textContent, /Waiting for Clay/);
  ui.ids.get("cargo").emit("click", screenPoint(123, 122));
  assert.equal(ui.ids.get("basketContents").children[0].children[0].textContent, "Bricks · Graded");
  assert.equal(ui.state().machines.find((machine) => machine.type === "gradingBench").input.length, 0);
  const html = fs.readFileSync(path.join(__dirname, "..", "noammo.html"), "utf8");
  assert.doesNotMatch(html, /Grades and their sale multipliers will only apply once grading is introduced/);
  assert.doesNotMatch(html, /Previously graded portions/);
  assert.match(html, /If any input is graded, the whole stack is graded and cannot roll again/);
});

test("Bridge Shop costs include unplaced conveyor stock and multi-buy updates all needed amounts", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.cash = 20; factory.state.inventory.wood = 100; factory.state.stock.belt = 7;
  const ui = boot(factory.exportSave()); ui.tabs.find(b => b.dataset.tab === "shop").emit("click");
  shopCard(ui, 'primitiveBridge').emit('click');
  ui.ids.get("quantity").value = "2"; ui.ids.get("quantity").emit("input");
  assert.deepEqual(ui.ids.get("costs").children.map(row => row.children[1].textContent), ["$20 / $20", "7 / 8"]);
  assert.equal(ui.ids.get("buyMachine").disabled, true);
  ui.ids.get("quantity").value = "1"; ui.ids.get("quantity").emit("input");
  assert.equal(ui.ids.get("buyMachine").disabled, false); ui.ids.get("buyMachine").emit("click");
  assert.equal(ui.state().stock.belt, 3); assert.equal(ui.state().stock.primitiveBridge, 1);
});

test("Rock Drill mode selector remains mounted during production and persists through refresh and movement", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.stock.primitiveRockDrill = 1;
  const drill = factory.place("primitiveRockDrill", 121, 121).machine;
  const ui = boot(factory.exportSave()); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  const mode = ui.ids.get("extractionMode"); assert.ok(mode);
  assert.deepEqual(mode.children.map(option => option.textContent), ["Chert", "Granite"]);
  mode.value = "granite"; mode.emit("change"); ui.frame(100); ui.frame(400);
  assert.equal(ui.ids.get("extractionMode"), mode);
  assert.equal(ui.state().machines.find(m => m.id === drill.id).mode, "granite");
  const reloaded = boot(JSON.stringify({ kind: A.DATA.saveKind, version: A.DATA.saveVersion, state: ui.state() }));
  reloaded.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.equal(reloaded.ids.get("extractionMode").value, "granite");
});

test("Infuser and Shack details display their exact cash effects without inventing optional limits", () => {
  const ui = boot(); ui.tabs.find(b => b.dataset.tab === "shop").emit("click");
  for (const [type, expected] of [["leekInfuser", ["Cash effect: +$0.4", "Upper Limit: $2"]],
    ["primitiveShack", ["Cash effect: ×2", "Use Limit: 1", "Upper Limit: $2.5k", "Base Value Required: $1.2"]]]) {
    shopCard(ui, type).emit('click');
    assert.deepEqual(ui.ids.get("shopDetail").children.filter(n => n.className === "machine-effect").map(n => n.textContent), expected);
  }
});

test("Sifter Shop costs, repeat placement and sellable Chert versus unsellable Soil use actual UI handlers", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.cash = 1400;
  Object.assign(factory.state.inventory, { wood: 300, brick: 60, leekFiber: 100, chert: 0.3, soil: 0.3 });
  const ui = boot(factory.exportSave());
  ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  ui.categories.find((button) => button.dataset.category === "Material").emit("click");
  const card = shopCard(ui, 'pebbleSifter');
  assert.equal(card.hidden, false); card.emit("click");
  ui.ids.get("quantity").value = "2"; ui.ids.get("quantity").emit("input");
  assert.deepEqual(ui.ids.get("costs").children.map((row) => row.children[1].textContent), ["$1.4k / $1.4k", "300 / 300", "60 / 60", "100 / 100"]);
  ui.ids.get("buyMachine").emit("click");
  assert.equal(ui.state().stock.pebbleSifter, 2);
  chooseMachine(ui, "pebbleSifter"); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.equal(ui.state().stock.pebbleSifter, 1);
  ui.ids.get("cargo").emit("click", screenPoint(126, 121));
  assert.equal(ui.state().machines.filter((machine) => machine.type === "pebbleSifter").length, 2);
  ui.ids.get("openInventory").emit("click"); ui.inventoryTabs[1].emit("click");
  const cards = ui.ids.get("itemCards").children;
  const soil = cards.find((entry) => entry.children.some((node) => node.textContent === "Soil"));
  const chert = cards.find((entry) => entry.children.some((node) => node.textContent === "Chert"));
  assert.ok(soil); assert.ok(chert);
  assert.equal(soil.children.some((node) => node.tagName === "BUTTON"), false);
  chert.children.find((node) => node.textContent === "Sell all").emit("click");
  assert.ok(Math.abs(ui.state().cash - 0.03) < 1e-8);
  assert.equal(ui.state().inventory.soil, 0.3);
});

test("Items exposes Wood's $0.10 sale and hides it again when sold", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.inventory.wood = 10;
  const ui = boot(factory.exportSave()); ui.ids.get("openInventory").emit("click"); ui.inventoryTabs[1].emit("click");
  const wood = ui.ids.get("itemCards").children[0];
  assert.ok(wood.children.some((child) => child.textContent === "$0.1 each from inventory"));
  wood.children.find((child) => child.textContent === "Sell all").emit("click");
  assert.equal(ui.state().cash, 1); assert.equal(ui.state().inventory.wood, 0);
  assert.match(ui.ids.get("itemCards").children[0].textContent, /Inventory is empty/);
});

test("Clay Bench Shop cost, one-crew placement, sparse hitbox and stable mode selector use the actual browser handlers", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.cash = 20; factory.state.inventory.wood = 50; factory.state.inventory.leekFiber = 5;
  const ui = boot(factory.exportSave());
  ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  shopCard(ui, 'clayShaper').emit('click');
  assert.equal(ui.ids.get("costs").children.length, 3, "Cash, Wood and Fiber only");
  assert.equal(ui.ids.get("buyMachine").disabled, false); ui.ids.get("buyMachine").emit("click");
  chooseMachine(ui, "clayShaper");
  ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  let state = ui.state(), bench = state.machines.find((machine) => machine.type === "clayShaper");
  assert.equal(bench.mode, "brick"); assert.equal(ui.ids.get("crew").textContent, "9 / 10");
  const selector = ui.ids.get("shapingMode");
  assert.deepEqual(selector.options.map((option) => option.value), ["brick", "pot"]);
  selector.value = "pot"; selector.emit("change");
  for (let frame = 1; frame <= 20; frame++) ui.frame(frame * 100);
  assert.equal(ui.ids.get("shapingMode"), selector, "simulation ticks must not rebuild the selector");
  state = ui.state(); bench = state.machines.find((machine) => machine.type === "clayShaper");
  assert.equal(bench.mode, "pot");
  ui.ids.get("cargo").emit("click", screenPoint(121, 122)); ui.frame(2100);
  assert.deepEqual(ui.view().interaction.selectedIds, [], "empty lower-left cell is not a hidden machine hitbox");
  const reloaded = boot(ui.storage.get(A.DATA.saveKey));
  reloaded.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.equal(reloaded.ids.get("shapingMode").value, "pot");
});

test("Shop cards sort by cash price and categories preserve that order while filtering actual cards", () => {
  const ui = boot(); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  const cards = ui.ids.get("shopCards").children;
  const prices = cards.map(card => A.DATA.machines[card.dataset.machine].cost.cash);
  assert.equal(prices[0], 0);
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i - 1] <= prices[i], 'cash prices ascend');
  const free = cards.filter(card => A.DATA.machines[card.dataset.machine].cost.cash === 0).map(card => card.dataset.machine);
  assert.deepEqual(free, Object.keys(A.DATA.machines).filter(type => A.DATA.machines[type].cost.cash === 0), 'equal prices retain their existing order');
  const initial = [...cards];
  for (const button of ui.categories) {
    button.emit('click');
    assert.deepEqual(ui.ids.get('shopCards').children, initial, 'category changes do not rebuild or reorder cards');
    for (const card of cards) assert.equal(card.hidden, button.dataset.category !== 'All' && A.DATA.machines[card.dataset.machine].category !== button.dataset.category);
  }
});

test("Brick Seal exposes its effect fields, purchase cost and repeat placement without remounting controls", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.cash = 230; factory.state.inventory.brick = 70; factory.state.stock.belt = 2;
  const ui = boot(factory.exportSave());
  ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  shopCard(ui, 'brickSeal').emit('click');
  const effects = ui.ids.get("shopDetail").children.filter((node) => node.className === "machine-effect");
  assert.deepEqual(effects.slice(0, 4).map((node) => node.textContent), [
    "Cash effect: +$1.25", "Use Limit: 9", "Upper Limit: $15", "Base Value Required: $0.5",
  ]);
  assert.match(effects[4].textContent, /5 percentage points/);
  ui.ids.get("quantity").value = "2"; ui.ids.get("quantity").emit("input");
  assert.equal(ui.ids.get("costs").children[0].children[1].textContent, "$230 / $230");
  assert.equal(ui.ids.get("costs").children[1].children[1].textContent, "70 / 70");
  assert.equal(ui.ids.get("buyMachine").disabled, false); ui.ids.get("buyMachine").emit("click");
  assert.equal(ui.state().stock.brickSeal, 2); assert.equal(ui.state().inventory.brick, 0); assert.equal(ui.state().cash, 0);
  chooseMachine(ui, "brickSeal");
  assert.ok(ui.ids.get("machineDetail").children.some((node) => node.textContent === "Use Limit: 9"));
  ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.equal(ui.state().stock.brickSeal, 1);
  ui.ids.get("cargo").emit("click", screenPoint(123, 121));
  const machines = ui.state().machines.filter((machine) => machine.type === "brickSeal");
  assert.equal(machines.length, 2); assert.notEqual(machines[0].id, machines[1].id);
  assert.equal(ui.ids.get("crew").textContent, "10 / 10");
  const move = ui.ids.get("moveMachine");
  for (let frame = 1; frame <= 20; frame++) ui.frame(frame * 100);
  assert.equal(ui.ids.get("moveMachine"), move);
});

test("Kiln purchase, fuel/status updates, rotated moves and pickup use stable real UI controls", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.cash = 30;
  Object.assign(factory.state.inventory, { unfiredBrick: 50, clay: 10, leekFiber: 14 });
  let ui = boot(factory.exportSave());
  ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  shopCard(ui, 'kiln').emit('click');
  assert.equal(ui.ids.get("costs").children.length, 4);
  assert.equal(ui.ids.get("buyMachine").disabled, true);
  factory.state.inventory.leekFiber = 15;
  assert.equal(factory.buy("kiln").amount, 1);
  const kiln = factory.place("kiln", 121, 121).machine;
  const [input] = A.ports(kiln);
  factory.receive(kiln, A.cargo("wood", 2), input.x, input.y, input.direction, true);
  factory.receive(kiln, A.cargo("unfiredBrick", 4, 1.05), input.x, input.y, input.direction, true);
  ui = boot(factory.exportSave());
  ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  const heat = ui.ids.get("kilnHeat"), buffers = ui.ids.get("kilnBuffers"), move = ui.ids.get("moveMachine");
  assert.equal(ui.ids.get("crew").textContent, "8 / 10"); assert.equal(heat.textContent, "Heat: 60k / 250ku");
  for (let frame = 1; frame <= 90; frame++) ui.frame(frame * 100);
  assert.equal(ui.ids.get("kilnHeat"), heat); assert.equal(ui.ids.get("kilnBuffers"), buffers);
  assert.equal(ui.ids.get("moveMachine"), move, "production must not remount the control buttons");
  assert.equal(heat.textContent, "Heat: 20k / 250ku");
  assert.equal(buffers.textContent, "Waiting inputs: 0 · Finished products: 4");
  move.emit("click"); ui.ids.get("rotateRight").emit("click");
  ui.ids.get("cargo").emit("click", screenPoint(125, 120));
  const moved = ui.state().machines.find((machine) => machine.id === kiln.id);
  assert.equal(moved.facing, "down"); assert.equal(moved.heat, 20000); assert.equal(moved.output[0].quantity, 4);
  ui.ids.get("pickupMachine").emit("click");
  assert.equal(ui.state().inventory.brick, 4); assert.equal(ui.ids.get("crew").textContent, "10 / 10");
  ui.ids.get("openInventory").emit("click"); ui.inventoryTabs[1].emit("click");
  const bricks = ui.ids.get("itemCards").children.find((card) => card.children.some((node) => node.textContent === "Bricks"));
  assert.ok(bricks.children.some((node) => node.textContent === "$1 each from inventory"));
  bricks.children.find((node) => node.textContent === "Sell all").emit("click");
  assert.equal(ui.state().cash, 4); assert.equal(ui.state().inventory.brick, 0);
});

test("visible place/rotate/cancel controls create the correct footprint and preserve the old game save", () => {
  const ui = boot(new A.Factory(A.createState(1)).exportSave());
  chooseMachine(ui, "planter");
  ui.ids.get("rotateRight").emit("click");
  const click = screenPoint(121, 121);
  ui.ids.get("cargo").emit("click", click);
  const state = ui.state(); assert.equal(state.machines.length, 1);
  assert.equal(state.machines[0].type, "planter"); assert.equal(state.machines[0].facing, "down");
  assert.equal(state.machines[0].x, 121); assert.equal(state.machines[0].y, 121);
  assert.equal(ui.storage.has("hamster-miners-save"), false);
  assert.equal(ui.storage.size, 1);
});

test("Fiber placement uses the Molder-style vertical footprint, repeats it, and rotates normally", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.stock.fiber = 3;
  const ui = boot(factory.exportSave());
  chooseMachine(ui, "fiber");
  assert.match(ui.ids.get("toolLabel").textContent, /right/);
  ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  const first = ui.state().machines[0];
  assert.equal(first.type, "fiber"); assert.equal(first.facing, "right");
  assert.deepEqual(A.size(first), { width: 1, height: 2 });
  assert.deepEqual(A.ports(first), [
    { x: 121, y: 122, direction: "left", role: "input" },
    { x: 121, y: 122, direction: "right", role: "output" },
  ]);
  assert.match(ui.ids.get("toolLabel").textContent, /Placing.*right/);
  ui.ids.get("cargo").emit("click", screenPoint(124, 121));
  assert.equal(ui.state().machines[1].facing, "right");
  ui.ids.get("rotateRight").emit("click");
  ui.ids.get("cargo").emit("click", screenPoint(126, 121));
  const rotated = ui.state().machines[2];
  assert.equal(rotated.facing, "down");
  assert.deepEqual(A.size(rotated), { width: 2, height: 1 });
});

test("production does not remount the selected Basket's hauling controls", () => {
  const factory = new A.Factory(A.createState(1));
  const basket = factory.place("basket", 124, 122).machine;
  factory.place("planter", 121, 121);
  factory.state.stock.fiber = 1; factory.place("fiber", 128, 121);
  const ui = boot(factory.exportSave());
  ui.ids.get("cargo").emit("click", screenPoint(124, 122));
  const destination = ui.ids.get("haulDestination"), material = ui.ids.get("haulMaterial");
  assert.ok(destination); assert.ok(material);
  for (let now = 100; now < 10000; now += 100) ui.frame(now);
  assert.equal(ui.ids.get("haulDestination"), destination); assert.equal(ui.ids.get("haulMaterial"), material);
  assert.ok(ui.state().machines.find((machine) => machine.id === basket.id).contents.length);
  assert.equal(ui.ids.has("sellBasket"), false, "Baskets have no sale control");
  assert.doesNotMatch(A.DATA.machines.basket.description, /sell/i);
  const cash = ui.state().cash;
  ui.ids.get("collectBasket").emit("click");
  assert.equal(ui.state().cash, cash);
  assert.ok(ui.state().inventory.leek > 0);
  assert.equal(ui.ids.get("haulDestination"), destination);
});

test("Pot Spinner purchase exposes chances and exact scaled costs, filters correctly and supports repeat rotated placement", () => {
  const f = new A.Factory(A.createState(1)); f.state.cash = 5000;
  Object.assign(f.state.inventory, { wood: 300, brick: 120, granite: 60, leekFiber: 30 });
  const ui = boot(f.exportSave()); ui.tabs.find(b => b.dataset.tab === "shop").emit("click");
  const card = shopCard(ui, 'potSpinner');
  ui.categories.find(b => b.dataset.category === "Material").emit("click"); assert.equal(card.hidden, false); card.emit("click");
  assert.ok(ui.ids.get("shopDetail").children.some(n => /Poor 20%.*Standard 10%.*Fine 40%.*Remarkable 25%.*Exceptional 5%/.test(n.textContent)));
  ui.ids.get("quantity").value = "2"; ui.ids.get("quantity").emit("input");
  assert.deepEqual(ui.ids.get("costs").children.map(r => r.children[1].textContent), ["$5k / $5k", "300 / 300", "120 / 120", "60 / 60", "30 / 30"]);
  ui.ids.get("buyMachine").emit("click"); assert.equal(ui.state().stock.potSpinner, 2); assert.equal(ui.state().cash, 0);
  chooseMachine(ui, "potSpinner"); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  ui.ids.get("rotateRight").emit("click"); ui.ids.get("cargo").emit("click", screenPoint(125, 121));
  const machines = ui.state().machines; assert.equal(machines.length, 2);
  assert.deepEqual(A.size(machines[0]), { width: 2, height: 3 }); assert.deepEqual(A.size(machines[1]), { width: 3, height: 2 });
  assert.equal(machines[0].type, "potSpinner"); assert.notEqual(machines[0].id, machines[1].id);
});

test("Pot Spinner live controls stay mounted throughout a job and reflect bounded buffers", () => {
  const f = new A.Factory(A.createState(1));
  for (const [type, x, y] of [["potSpinner", 121, 121], ["wheel", 120, 124], ["basket", 123, 122]]) {
    f.state.stock[type]++; f.place(type, x, y, "right");
  }
  const m = f.state.machines[0], p = A.ports(m).find(p => p.role === "input");
  f.receive(m, A.cargo("clay", 2), p.x, p.y, p.direction, true); f.update(0.1);
  const ui = boot(f.exportSave()); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  const status = ui.ids.get("machineStatus"), buffers = ui.ids.get("spinnerBuffers"), move = ui.ids.get("moveMachine");
  assert.match(status.textContent, /Processing/); assert.match(buffers.textContent, /Waiting Clay: 0 \/ 2/);
  for (let now = 100; now <= 13000; now += 100) ui.frame(now);
  assert.equal(ui.ids.get("machineStatus"), status); assert.equal(ui.ids.get("spinnerBuffers"), buffers); assert.equal(ui.ids.get("moveMachine"), move);
  assert.match(status.textContent, /Waiting for 2 Clay/);
  const pot = ui.state().machines.find(m => m.type === "basket").contents[0];
  assert.deepEqual(pot.gradeProfile, [0.2, 0.1, 0.4, 0.25, 0.05]);
  assert.equal(ui.state().random, 1);
});

test("Primitive Stacker uses a stable typed size control, validates limits, and preserves unfinished typing", () => {
  const f = new A.Factory(A.createState(1)); f.state.stock.primitiveStacker = 1;
  const machine = f.place("primitiveStacker", 121, 121).machine;
  const ui = boot(f.exportSave()); ui.ids.get("cargo").emit("click", screenPoint(121, 121));
  const input = ui.ids.get("stackSize");
  assert.equal(input.tagName, "INPUT"); assert.equal(input.type, "number");
  assert.equal(input.min, "1"); assert.equal(input.max, "2"); assert.equal(input.step, "1");
  input.value = "2"; input.emit("change");
  assert.equal(ui.state().machines.find(m => m.id === machine.id).stackSize, 2);
  assert.equal(ui.ids.get("stackSize"), input);
  input.value = "";
  for (let now = 100; now < 2000; now += 100) ui.frame(now);
  assert.equal(input.value, "", "ticks do not overwrite an unfinished edit");
  for (const invalid of ["", "3", "1.5", "-1", "nonsense"]) {
    input.value = invalid; input.emit("change");
    assert.equal(input.value, "2"); assert.equal(ui.state().machines[0].stackSize, 2);
    assert.equal(ui.ids.get("stackSize"), input);
  }
  input.value = "1"; input.emit("change");
  assert.equal(ui.state().machines[0].stackSize, 1);
  const reloaded = boot(JSON.stringify({ kind: A.DATA.saveKind, version: 1, state: ui.state() }));
  reloaded.ids.get("cargo").emit("click", screenPoint(121, 121));
  assert.equal(reloaded.ids.get("stackSize").value, "1");
});

test("Gear Bench can be bought and placed from Inventory, with live stable buffers and saved two-tile geometry", () => {
  const f = new A.Factory(A.createState(1)); f.state.inventory.wood = 25;
  const ui = boot(f.exportSave()); ui.tabs.find(b => b.dataset.tab === 'shop').emit('click');
  shopCard(ui, 'crudeGearBench').emit('click');
  assert.deepEqual(ui.ids.get('costs').children.map(row => row.children[1].textContent), ['$0 / $0', '25 / 25']);
  assert.equal(ui.ids.get('buyMachine').disabled, false); ui.ids.get('buyMachine').emit('click');
  assert.equal(ui.state().stock.crudeGearBench, 1); assert.equal(ui.state().inventory.wood, 0);
  chooseMachine(ui, 'crudeGearBench'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  ui.ids.get('cancel').emit('click'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const m = ui.state().machines.find(m => m.type === 'crudeGearBench');
  assert.deepEqual(A.size(m), { width: 1, height: 2 }); assert.equal(ui.state().cash, 0);
  const buffer = ui.ids.get('gearBuffers'); assert.match(buffer.textContent, /Waiting Wood: 0 \/ 2/);
  for (let now = 100; now < 1500; now += 100) ui.frame(now);
  assert.equal(ui.ids.get('gearBuffers'), buffer);
  const restored = boot(JSON.stringify({ kind: A.DATA.saveKind, version: 1, state: ui.state() }));
  restored.ids.get('cargo').emit('click', screenPoint(121, 121));
  assert.match(restored.ids.get('machineStatus').textContent, /2 Wood/);
});

test("Conveyor Shop independently checks gears and machine purchases check scaled belt components", () => {
  for (const [type, component, required] of [['belt', 'woodenGear', 4], ['brickSeal', 'belt', 1]]) {
    const f = new A.Factory(A.createState(1)), cost = A.DATA.machines[type].cost;
    f.state.cash = cost.cash * 2;
    for (const [id, qty] of Object.entries(cost.materials)) f.state.inventory[id] = qty * 2;
    for (const [id, qty] of Object.entries(cost.machines ?? {})) f.state.stock[id] = qty * 2;
    const owned = component === 'belt' ? f.state.stock : f.state.inventory;
    owned[component] = required;
    const ui = boot(f.exportSave()); ui.tabs.find(b => b.dataset.tab === 'shop').emit('click');
    shopCard(ui, type).emit('click');
    assert.equal(ui.ids.get('buyMachine').disabled, false);
    ui.ids.get('quantity').value = '2'; ui.ids.get('quantity').emit('input');
    assert.equal(ui.ids.get('buyMachine').disabled, true);
    assert.equal(ui.ids.get('costs').children.at(-1).children[1].textContent, `${required} / ${required * 2}`);
    ui.ids.get('quantity').value = '1'; ui.ids.get('quantity').emit('input'); ui.ids.get('buyMachine').emit('click');
    const state = ui.state(); assert.equal((component === 'belt' ? state.stock : state.inventory)[component], 0);
  }
});

test("noammo removes debug upgrade controls and Ammo navigation without breaking import, reset or saved effects", () => {
  const f = new A.Factory(A.createState(1)); f.state.stock.primitive = 1;
  f.state.tuning = { primitiveBonus: 0.23, primitiveLimit: 7 };
  f.place('primitive', 121, 121);
  const saved = f.exportSave(), ui = boot(saved);
  assert.deepEqual(ui.inventoryCategories.map(button => button.dataset.inventoryCategory), ['All', 'Cash', 'Material', 'Logistics']);
  for (const id of ['primitiveBonus', 'primitiveLimit', 'applyTuning']) assert.equal(ui.ids.has(id), false);
  ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const copy = ui.ids.get('inspector').children.map(node => node.textContent).join(' ');
  assert.match(copy, /Cash effect: \+\$0.23/); assert.doesNotMatch(copy, /TEST|Adjustable|not final|not yet set/);
  ui.tabs.find(b => b.dataset.tab === 'options').emit('click');
  ui.ids.get('saveText').value = saved; ui.ids.get('import').emit('click');
  assert.deepEqual(ui.state().tuning, f.state.tuning);
  ui.ids.get('reset').emit('click'); assert.equal(ui.state().machines.length, 0);
  const html = fs.readFileSync(path.join(__dirname, '..', 'noammo.html'), 'utf8');
  assert.doesNotMatch(html, /Unsettled balance|Apply test values|primitiveBonus|data-inventory-category="Ammo"/);
});

test("selected upgrader and Shift-hover share live output history, preserve controls and keep shortcuts independent", () => {
  const f = new A.Factory(A.createState(1));
  for (const [type, x, y, facing] of [['wheel', 119, 125, 'right'], ['drive', 120, 123, 'down'], ['primitive', 121, 121, 'right']]) {
    f.state.stock[type]++; assert.ok(f.place(type, x, y, facing).machine);
  }
  const m = f.state.machines.find(m => m.type === 'primitive');
  m.lanes[0] = { ...A.cargo('wood', 2, 0.1), progress: 0.49 };
  const ui = boot(f.exportSave()); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const list = ui.ids.get('outputHistory'), move = ui.ids.get('moveMachine');
  assert.equal(list.children[0].textContent, 'No processed output yet.');
  ui.frame(100); ui.frame(200);
  assert.equal(list.children[0].textContent, '$0.4 total · 2 × $0.2');
  assert.equal(ui.ids.get('moveMachine'), move); assert.equal(ui.ids.get('outputHistory'), list);
  const row = list.children[0];
  for (let now = 300; now < 4000; now += 100) ui.frame(now);
  assert.equal(list.children.length, 1); assert.equal(list.children[0], row, 'unchanged histories do not redraw');
  const selected = ui.state().machines.map(m => m.id);
  ui.ids.get('cargo').emit('pointermove', { ...screenPoint(121, 121), shiftKey: false });
  assert.equal(ui.ids.get('historyTooltip').hidden, true);
  ui.key('Shift'); assert.equal(ui.ids.get('historyTooltip').hidden, false);
  assert.equal(ui.ids.get('hoverOutputHistory').children[0].textContent, row.textContent);
  assert.deepEqual(ui.state().machines.map(m => m.id), selected);
  ui.keyUp('Shift'); assert.equal(ui.ids.get('historyTooltip').hidden, true);
  ui.ids.get('cargo').emit('pointermove', { ...screenPoint(121, 121), shiftKey: true });
  assert.equal(ui.ids.get('historyTooltip').hidden, false);
  ui.ids.get('cargo').emit('pointerleave'); assert.equal(ui.ids.get('historyTooltip').hidden, true);
  ui.ids.get('cargo').emit('pointermove', { ...screenPoint(121, 121), shiftKey: true }); ui.blur();
  assert.equal(ui.ids.get('historyTooltip').hidden, true);
  ui.ids.get('cargo').emit('pointermove', { ...screenPoint(121, 121), shiftKey: true });
  ui.tabs.find(b => b.dataset.tab === 'shop').emit('click'); assert.equal(ui.ids.get('historyTooltip').hidden, true);
});

test("Grading history shows the actual Exceptional roll and $3k value in both views without rerolling", () => {
  const f = new A.Factory(A.createState(1900)); f.state.stock.gradingBench = 1;
  const m = f.place('gradingBench', 121, 121).machine;
  m.job = { input: { ...A.cargo('pot', 1, 120), gradeProfile: [0.2, 0.1, 0.4, 0.25, 0.05] }, remaining: 0.1 };
  const reference = { random: 1900 }; A.gradeStack(reference, m.job.input);
  const ui = boot(f.exportSave()); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  const list = ui.ids.get('outputHistory'); ui.frame(100); ui.frame(200);
  assert.equal(list.children[0].textContent, 'Exceptional · $3k'); assert.equal(ui.state().random, reference.random);
  ui.ids.get('cargo').emit('pointermove', { ...screenPoint(121, 121), shiftKey: true });
  assert.equal(ui.ids.get('hoverOutputHistory').children[0].textContent, 'Exceptional · $3k');
  assert.match(ui.ids.get('historyTooltipTitle').textContent, /Grading Bench/);
  const row = list.children[0]; for (let now = 300; now <= 3000; now += 100) ui.frame(now);
  assert.equal(list.children[0], row); assert.equal(ui.state().random, reference.random);
  ui.ids.get('cancel').emit('click'); ui.ids.get('moveMachine').emit('click');
  assert.equal(ui.ids.get('historyTooltip').hidden, true, 'placement suppresses hover tooltips');
});

test("Granite Processor Shop scales Granite and conveyor components, filters Cash and exposes all rules on selection", () => {
  const f = new A.Factory(A.createState(1)); f.state.cash = 70000; f.state.inventory.granite = 600; f.state.stock.belt = 3;
  const ui = boot(f.exportSave()); ui.tabs.find(b => b.dataset.tab === 'shop').emit('click');
  const card = shopCard(ui, 'graniteProcessor');
  ui.categories.find(b => b.dataset.category === 'Material').emit('click'); assert.equal(card.hidden, true);
  ui.categories.find(b => b.dataset.category === 'Cash').emit('click'); assert.equal(card.hidden, false); card.emit('click');
  const expected = ['Cash effect: ×1.3', 'Use Limit: 12', 'Upper Limit: $500', 'Base Value Required: $3.5'];
  assert.deepEqual(ui.ids.get('shopDetail').children.filter(n => n.className === 'machine-effect').map(n => n.textContent), expected);
  ui.ids.get('quantity').value = '2'; ui.ids.get('quantity').emit('input');
  assert.deepEqual(ui.ids.get('costs').children.map(row => row.children[1].textContent), ['$70k / $70k', '600 / 600', '3 / 4']);
  assert.equal(ui.ids.get('buyMachine').disabled, true);
  ui.ids.get('quantity').value = '1'; ui.ids.get('quantity').emit('input'); ui.ids.get('buyMachine').emit('click');
  assert.equal(ui.state().stock.belt, 1); assert.equal(ui.state().stock.graniteProcessor, 1);
  chooseMachine(ui, 'graniteProcessor'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  ui.ids.get('cancel').emit('click'); ui.ids.get('cargo').emit('click', screenPoint(121, 121));
  assert.deepEqual(ui.ids.get('inspector').children.filter(n => n.className === 'machine-effect').map(n => n.textContent), expected);
  assert.equal(ui.ids.get('outputHistory').children[0].textContent, 'No processed output yet.');
});

test("unreadable saves survive startup, autosave, export and unload until an explicit reset", () => {
  const broken = "this is not a valid save", ui = boot(broken);
  for (let now = 100; now < 7000; now += 100) ui.frame(now);
  ui.ids.get("export").emit("click"); ui.save();
  assert.equal(ui.writes, 0); assert.equal(ui.storage.get(A.DATA.saveKey), broken);
  ui.ids.get("reset").emit("click");
  assert.ok(ui.writes > 0); assert.equal(ui.state().kind, A.DATA.saveKind);
});
