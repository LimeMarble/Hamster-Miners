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
  const inventoryCategories = ["All", "Cash", "Material", "Ammo", "Logistics"].map((name) => {
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

function bulkFixture() {
  const factory = new A.Factory(A.createState(1));
  const planter = factory.place("planter", 121, 121).machine;
  const basket = factory.place("basket", 124, 122).machine;
  factory.state.stock.fiber = 1;
  const fiber = factory.place("fiber", 125, 121).machine;
  return { ui: boot(factory.exportSave()), ids: [planter.id, basket.id, fiber.id] };
}

function box(ui, start = [121, 121], end = [125, 123]) {
  ui.key("Shift");
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
  const ui = boot(); ui.frame(100);
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
  ui.inventoryCategories.find((button) => button.dataset.inventoryCategory === "Ammo").emit("click");
  assert.equal(ui.ids.get("machineEmpty").hidden, false); assert.equal(ui.ids.get("machineDetail").hidden, true);
});

test("Shift two-tap selection moves and rotates a group, while Cancel preserves its original layout", () => {
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
  for (let now = 100; now <= 2300; now += 100) ui.frame(now);
  assert.equal(ui.ids.get("hireCrew"), hire); assert.equal(hire.disabled, false);
  hire.emit("click"); assert.equal(ui.state().hiredCrew, 1);
});

test("Shop buy handler, quantities, material affordability and owned feedback use the real simulation", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.cash = 1; factory.state.inventory.leek = 10;
  const ui = boot(factory.exportSave()); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  const amount = ui.ids.get("quantity"); amount.value = "2"; amount.emit("input");
  assert.equal(ui.ids.get("buyMachine").disabled, true);
  amount.value = "1"; amount.emit("input"); assert.equal(ui.ids.get("buyMachine").disabled, false);
  ui.ids.get("buyMachine").emit("click");
  assert.equal(ui.state().cash, 0); assert.equal(ui.state().inventory.leek, 0); assert.equal(ui.state().stock.fiber, 1);
  assert.match(ui.ids.get("shopOwned").textContent, /Owned: 1/);
  assert.equal(ui.ids.get("buyMachine").disabled, true);
  for (const bad of ["0", "1.5", "10000", ""]) { amount.value = bad; amount.emit("input"); assert.equal(ui.ids.get("buyMachine").disabled, true); }
});

test("Shop material costs scale with quantity and enforce Sell Tube and Primitive Conveyor prices", () => {
  for (const [type, material, required, cash] of [["sellTube", "brick", 200, 250], ["belt", "wood", 20, 1]]) for (const owned of [required - 1, required]) {
    const factory = new A.Factory(A.createState(1)); factory.state.cash = cash; factory.state.inventory[material] = owned;
    const initialStock = factory.state.stock[type];
    const ui = boot(factory.exportSave()); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
    ui.ids.get("shopCards").children[Object.keys(A.DATA.machines).indexOf(type)].emit("click");
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

test("Items exposes Wood's $0.10 sale and hides it again when sold", () => {
  const factory = new A.Factory(A.createState(1)); factory.state.inventory.wood = 10;
  const ui = boot(factory.exportSave()); ui.ids.get("openInventory").emit("click"); ui.inventoryTabs[1].emit("click");
  const wood = ui.ids.get("itemCards").children[0];
  assert.ok(wood.children.some((child) => child.textContent === "$0.1 each from inventory"));
  wood.children.find((child) => child.textContent === "Sell all").emit("click");
  assert.equal(ui.state().cash, 1); assert.equal(ui.state().inventory.wood, 0);
  assert.match(ui.ids.get("itemCards").children[0].textContent, /Inventory is empty/);
});

test("Shop categories filter actual cards rather than merely changing the selected tab", () => {
  const ui = boot(); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  ui.categories.find((button) => button.dataset.category === "Cash").emit("click");
  const cards = ui.ids.get("shopCards").children;
  const definitions = Object.values(A.DATA.machines);
  for (let i = 0; i < cards.length; i++) assert.equal(cards[i].hidden, definitions[i].category !== "Cash");
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
  for (let now = 100; now < 5000; now += 100) ui.frame(now);
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

test("unreadable saves survive startup, autosave, export and unload until an explicit reset", () => {
  const broken = "this is not a valid save", ui = boot(broken);
  for (let now = 100; now < 7000; now += 100) ui.frame(now);
  ui.ids.get("export").emit("click"); ui.save();
  assert.equal(ui.writes, 0); assert.equal(ui.storage.get(A.DATA.saveKey), broken);
  ui.ids.get("reset").emit("click");
  assert.ok(ui.writes > 0); assert.equal(ui.state().kind, A.DATA.saveKind);
});
