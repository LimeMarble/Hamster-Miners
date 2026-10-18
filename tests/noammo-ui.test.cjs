const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("../noammo-simulation.js");

// Exercise the actual browser entry and event handlers without networking or browser automation.
// This is a DOM contract test, not a claim of live-browser visual verification.
function boot(saved) {
  const ids = new Map(), frames = [], windowEvents = new Map(), storage = new Map();
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
    emit(type, event = {}) { for (const fn of this.events.get(type) ?? []) fn({ preventDefault() {}, ...event }); }
    setAttribute(key, value) { this[key] = value; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600 }; }
    getContext() { return drawing; }
    select() {}
  }
  const html = fs.readFileSync(path.join(__dirname, "..", "noammo.html"), "utf8");
  for (const [, tag, id] of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/g)) new Element(tag).id = id;
  const tabs = ["factory", "shop", "items", "recipes", "options"].map((name) => {
    const button = new Element("button"); button.dataset.tab = name; return button;
  });
  const categories = ["All", "Cash", "Material", "Logistics"].map((name) => {
    const button = new Element("button"); button.dataset.category = name; return button;
  });
  const document = {
    hidden: false, activeElement: null, getElementById: (id) => ids.get(id),
    createElement: (tag) => new Element(tag), addEventListener() {},
    querySelectorAll(selector) {
      if (selector === ".screen") return ["factory", "shop", "items", "recipes", "options"].map((id) => ids.get(id));
      if (selector === "[data-tab]") return tabs;
      if (selector === "[data-category]") return categories;
      throw new Error(`Unexpected selector: ${selector}`);
    },
  };
  const context = {
    document, performance: { now: () => 0 }, devicePixelRatio: 1,
    requestAnimationFrame: (fn) => frames.push(fn), ResizeObserver: class { observe() {} },
    addEventListener: (type, fn) => windowEvents.set(type, fn), confirm: () => true,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem(key, value) { writes++; storage.set(key, value); } },
    console: { warn() {} },
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ["noammo-data.js", "noammo-simulation.js", "noammo-renderer.js", "noammo-ui.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", name), "utf8"), context, { filename: name });
  }
  return { ids, tabs, categories, storage, get writes() { return writes; },
    save: () => windowEvents.get("beforeunload")(),
    frame(now) { assert.ok(frames.length); frames.shift()(now); },
    state() { windowEvents.get("beforeunload")(); return JSON.parse(storage.get(A.DATA.saveKey)).state; } };
}

test("opening browser scripts boot every tab without missing elements or runtime errors", () => {
  const ui = boot();
  assert.equal(ui.state().stock.basket, 1);
  for (const button of ui.tabs) {
    assert.doesNotThrow(() => button.emit("click"));
    assert.equal(ui.ids.get(button.dataset.tab).hidden, false);
    ui.frame(100); ui.frame(200);
  }
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

test("Shop categories filter actual cards rather than merely changing the selected tab", () => {
  const ui = boot(); ui.tabs.find((button) => button.dataset.tab === "shop").emit("click");
  ui.categories.find((button) => button.dataset.category === "Cash").emit("click");
  const cards = ui.ids.get("shopCards").children;
  const definitions = Object.values(A.DATA.machines);
  for (let i = 0; i < cards.length; i++) assert.equal(cards[i].hidden, definitions[i].category !== "Cash");
});

test("visible place/rotate/cancel controls create the correct footprint and preserve the old game save", () => {
  const ui = boot();
  ui.ids.get("palette").children[0].emit("click");
  ui.ids.get("rotateRight").emit("click");
  // Home camera is centered on x=125, with a 900px viewport at zoom=1.
  const click = { clientX: (121 - (125 - 900 / 64)) * 32 + 2, clientY: 5 * 32 + 2 };
  ui.ids.get("cargo").emit("click", click);
  const state = ui.state(); assert.equal(state.machines.length, 1);
  assert.equal(state.machines[0].type, "planter"); assert.equal(state.machines[0].facing, "down");
  assert.equal(state.machines[0].x, 121); assert.equal(state.machines[0].y, 5);
  assert.equal(ui.storage.has("hamster-miners-save"), false);
  assert.equal(ui.storage.size, 1);
});

test("Fiber placement uses the Molder-style vertical footprint, repeats it, and rotates normally", () => {
  const factory = new A.Factory(A.createState(1));
  factory.state.stock.fiber = 3;
  const ui = boot(factory.exportSave());
  ui.ids.get("palette").children[2].emit("click");
  assert.match(ui.ids.get("toolLabel").textContent, /right/);
  ui.ids.get("cargo").emit("click", { clientX: (121 - (125 - 900 / 64)) * 32 + 2, clientY: 162 });
  const first = ui.state().machines[0];
  assert.equal(first.type, "fiber"); assert.equal(first.facing, "right");
  assert.deepEqual(A.size(first), { width: 1, height: 2 });
  assert.deepEqual(A.ports(first), [
    { x: 121, y: 6, direction: "left", role: "input" },
    { x: 121, y: 6, direction: "right", role: "output" },
  ]);
  assert.match(ui.ids.get("toolLabel").textContent, /Placing.*right/);
  ui.ids.get("cargo").emit("click", { clientX: (124 - (125 - 900 / 64)) * 32 + 2, clientY: 162 });
  assert.equal(ui.state().machines[1].facing, "right");
  ui.ids.get("rotateRight").emit("click");
  ui.ids.get("cargo").emit("click", { clientX: (126 - (125 - 900 / 64)) * 32 + 2, clientY: 162 });
  const rotated = ui.state().machines[2];
  assert.equal(rotated.facing, "down");
  assert.deepEqual(A.size(rotated), { width: 2, height: 1 });
});

test("production does not remount the selected Basket's hauling controls", () => {
  const factory = new A.Factory(A.createState(1));
  const basket = factory.place("basket", 124, 6).machine;
  factory.place("planter", 121, 5);
  factory.state.stock.fiber = 1; factory.place("fiber", 128, 5);
  const ui = boot(factory.exportSave());
  ui.ids.get("cargo").emit("click", { clientX: (124 - (125 - 900 / 64)) * 32 + 2, clientY: 194 });
  const destination = ui.ids.get("haulDestination"), material = ui.ids.get("haulMaterial");
  assert.ok(destination); assert.ok(material);
  for (let now = 100; now < 5000; now += 100) ui.frame(now);
  assert.equal(ui.ids.get("haulDestination"), destination); assert.equal(ui.ids.get("haulMaterial"), material);
  assert.ok(ui.state().machines.find((machine) => machine.id === basket.id).contents.length);
});

test("unreadable saves survive startup, autosave, export and unload until an explicit reset", () => {
  const broken = "this is not a valid save", ui = boot(broken);
  for (let now = 100; now < 7000; now += 100) ui.frame(now);
  ui.ids.get("export").emit("click"); ui.save();
  assert.equal(ui.writes, 0); assert.equal(ui.storage.get(A.DATA.saveKey), broken);
  ui.ids.get("reset").emit("click");
  assert.ok(ui.writes > 0); assert.equal(ui.state().kind, A.DATA.saveKind);
});
