const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

function element(initial = {}) {
  const listeners = new Map();
  const node = {
    hidden: false,
    disabled: false,
    textContent: "",
    ...initial,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, properties = {}) {
      const event = {
        target: node,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        ...properties,
      };
      for (const listener of listeners.get(type) ?? []) listener(event);
      return event;
    },
  };
  return node;
}

const cancelButton = element();
const rotateButton = element();
const help = element();
const controls = element({ hidden: true });
controls.contains = (node) => [controls, cancelButton, rotateButton, help].includes(node);
const dom = {
  "#factoryInteractionControls": controls,
  "#factoryInteractionHelp": help,
  "#cancelFactoryInteractionButton": cancelButton,
  "#rotateFactoryInteractionButton": rotateButton,
};
global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: (selector) => dom[selector] ?? null, querySelectorAll: () => [] };
const game = require("../game.js");
game.bindFactoryInteractionControls();

function machine(id, instanceId, column, row) {
  return { ...game.MACHINE_LAYOUT[id], id, instanceId, column, row, orientation: "right" };
}
function fresh(machines = [], placedConveyors = []) {
  game.cancelFactoryInteraction();
  game.__setFactorySelection([]);
  const state = Object.assign(game.createInitialState(), {
    machines,
    placedConveyors,
    tutorial: { stage: "complete", visible: false, starterConveyorRemoved: true },
  });
  game.__setState(state);
  game.__setActiveViewForTests("factory");
  controls.hidden = true;
  delete controls.getBoundingClientRect;
  return state;
}
function pointer(column, row, properties = {}) {
  const x = column * 32 + 16, y = row * 32 + 16;
  return { worldX: x, worldY: y, x, y, button: 0,
    event: { clientX: x, clientY: y, target: {}, shiftKey: false }, ...properties };
}
function tap(column, row, properties = {}) {
  const event = pointer(column, row, properties);
  game.handleFactoryGridPointerDown(event);
  game.handleFactoryGridPointerUp(event);
}
function key(key, properties = {}) {
  const event = { key, repeat: false, target: {}, prevented: false,
    preventDefault() { this.prevented = true; }, ...properties };
  game.handleFactoryKeyDown(event);
  return event;
}
function descriptor(m) {
  return { type: "machine", id: m.id, instanceId: m.instanceId };
}

test("Shift starts two-tap box selection, including corners on machines, without held clicks", () => {
  const first = machine("leekDuster", "tap-first", 10, 5);
  const second = machine("leekDuster", "tap-second", 13, 6);
  const conveyor = { column: 12, row: 5, direction: "right", item: null };
  fresh([first, second], [conveyor]);
  assert.equal(key("Shift").prevented, true);
  assert.match(game.getFactoryInteractionControlState().help, /first corner/);
  tap(10, 5);
  assert.equal(game.__getFactorySelection().length, 0);
  assert.match(game.getFactoryInteractionControlState().help, /opposite corner/);
  game.handleFactoryGridPointerMove(pointer(13, 6));
  assert.equal(game.__getFactorySelection().length, 0);
  tap(13, 6);
  assert.equal(game.__getFactorySelection().length, 3);
  assert.equal(game.getFactoryInteractionControlState().cancelLabel, "Clear selection");
  assert.equal(game.beginGroupMove(), true);
  tap(20, 10);
  assert.deepEqual([first.column, first.row, second.column, second.row], [20, 10, 23, 11]);
  assert.deepEqual([conveyor.column, conveyor.row], [22, 10]);
});

test("two-tap selection accepts reversed corners and one-tile boxes", () => {
  const first = machine("leekDuster", "reverse-first", 10, 5);
  const second = machine("leekDuster", "reverse-second", 13, 6);
  fresh([first, second]);
  key("Shift");
  tap(14, 7);
  tap(9, 4);
  assert.equal(game.__getFactorySelection().length, 2);
  key("Shift");
  tap(10, 5);
  tap(10, 5);
  assert.deepEqual(game.__getFactorySelection(), [descriptor(first)]);
});

test("holding Shift on a corner adds a box without toggling existing selected pieces", () => {
  const first = machine("leekDuster", "add-first", 10, 5);
  const second = machine("leekDuster", "add-second", 13, 6);
  fresh([first, second]);
  game.__setFactorySelection([descriptor(first)]);
  key("Shift");
  tap(12, 5);
  tap(14, 7, { shiftKey: true });
  assert.equal(game.__getFactorySelection().length, 2);
  assert.ok(game.__getFactorySelection().some((entity) => entity.instanceId === first.instanceId));
});

test("normal taps do not start a box; ordinary dragging still works", () => {
  const first = machine("leekDuster", "drag-first", 10, 5);
  const second = machine("leekDuster", "drag-second", 13, 6);
  fresh([first, second]);
  tap(10, 5);
  assert.deepEqual(game.__getFactorySelection(), [descriptor(first)]);
  tap(9, 4);
  assert.equal(game.getFactoryInteractionControlState().visible, false);
  game.handleFactoryGridPointerDown(pointer(9, 4));
  game.handleFactoryGridPointerMove(pointer(14, 7));
  game.handleFactoryGridPointerUp(pointer(14, 7));
  assert.equal(game.__getFactorySelection().length, 2);
});

test("Shift-drag still completes on release and adds to the existing selection", () => {
  const first = machine("leekDuster", "shift-drag-first", 10, 5);
  const second = machine("leekDuster", "shift-drag-second", 13, 6);
  fresh([first, second]);
  game.__setFactorySelection([descriptor(first)]);
  key("Shift");
  game.handleFactoryGridPointerDown(pointer(12, 5, { shiftKey: true }));
  game.handleFactoryGridPointerMove(pointer(14, 7, { shiftKey: true }));
  game.handleFactoryGridPointerUp(pointer(14, 7, { shiftKey: true }));
  assert.equal(game.__getFactorySelection().length, 2);
  assert.equal(game.getFactoryInteractionControlState().cancelLabel, "Clear selection");
});

test("Shift repeats do not reset the first corner and unrelated keys/inputs do not arm a box", () => {
  const first = machine("leekDuster", "repeat-first", 10, 5);
  fresh([first]);
  for (const target of [{ tagName: "INPUT" }, { tagName: "SELECT" }, { tagName: "TEXTAREA" }, { isContentEditable: true }]) {
    key("Shift", { target });
    assert.equal(game.getFactoryInteractionControlState().visible, false);
  }
  for (const modifier of ["ctrlKey", "altKey", "metaKey"]) {
    key("Shift", { [modifier]: true });
    assert.equal(game.getFactoryInteractionControlState().visible, false);
  }
  game.__setActiveViewForTests("mine");
  assert.equal(key("Shift").prevented, false);
  game.__setActiveViewForTests("factory");
  key("Shift");
  tap(9, 4);
  key("Shift", { repeat: true });
  key("Shift");
  assert.match(game.getFactoryInteractionControlState().help, /opposite corner/);
  tap(11, 6);
  assert.deepEqual(game.__getFactorySelection(), [descriptor(first)]);
});

test("Cancel and Escape discard an unfinished box while retaining the prior selection", () => {
  const first = machine("leekDuster", "cancel-box", 10, 5);
  const state = fresh([first]);
  game.__setFactorySelection([descriptor(first)]);
  key("Shift");
  tap(9, 4);
  game.renderFactoryInteractionControls();
  assert.equal(controls.hidden, false);
  assert.equal(cancelButton.textContent, "Cancel selection");
  assert.equal(rotateButton.disabled, true);
  const event = cancelButton.dispatch("pointerdown");
  assert.equal(event.stopped, true);
  assert.equal(event.prevented, true);
  assert.equal(game.getFactoryInteractionControlState().cancelLabel, "Clear selection");
  assert.deepEqual(game.__getFactorySelection(), [descriptor(first)]);
  assert.strictEqual(state.machines[0], first);
  key("Shift");
  assert.equal(key("Escape").prevented, true);
  assert.equal(game.getFactoryInteractionControlState().cancelLabel, "Clear selection");
});

test("right-click cancels an unfinished tap box without picking up the underlying machine", () => {
  const first = machine("leekDuster", "right-cancel", 10, 5);
  const state = fresh([first]);
  key("Shift");
  tap(9, 4);
  tap(10, 5, { button: 2 });
  assert.equal(state.machines.length, 1);
  assert.equal(state.machineInventory.leekDuster, 0);
  assert.equal(game.getFactoryInteractionControlState().visible, false);
});

test("factory overlay buttons never anchor/complete a box or select the tile behind them", () => {
  const first = machine("leekDuster", "overlay-first", 10, 5);
  fresh([first]);
  key("Shift");
  game.renderFactoryInteractionControls();
  game.handleFactoryGridPointerDown(pointer(9, 4, { event: { target: rotateButton } }));
  assert.match(game.getFactoryInteractionControlState().help, /first corner/);
  tap(9, 4);
  game.handleFactoryGridPointerDown(pointer(11, 6, { event: { target: cancelButton } }));
  assert.match(game.getFactoryInteractionControlState().help, /opposite corner/);
  assert.equal(game.__getFactorySelection().length, 0);
  controls.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100 });
  game.handleFactoryGridPointerDown(pointer(11, 6, { event: { target: {}, clientX: 50, clientY: 50 } }));
  assert.equal(game.__getFactorySelection().length, 0);
  delete controls.getBoundingClientRect;
  tap(11, 6);
  assert.deepEqual(game.__getFactorySelection(), [descriptor(first)]);
  controls.hidden = true;
  assert.equal(game.shouldFinalizeFactoryMarquee({ event: { target: cancelButton } }), false);
});

test("Cancel move leaves original group positions, orientations and cargo unchanged", () => {
  const first = machine("leekDuster", "cancel-group-first", 10, 5);
  const second = machine("leekDuster", "cancel-group-second", 13, 6);
  const state = fresh([first, second]);
  const cargo = { kind: "material", material: "copper", quantity: 1 };
  state.internalConveyorItems[`${first.instanceId}:0`] = cargo;
  game.__setFactorySelection([descriptor(first), descriptor(second)]);
  assert.equal(game.beginGroupMove(), true);
  game.renderFactoryInteractionControls();
  assert.equal(cancelButton.textContent, "Cancel move");
  assert.equal(rotateButton.disabled, false);
  rotateButton.dispatch("pointerdown");
  cancelButton.dispatch("pointerdown");
  assert.deepEqual([first.column, first.row, second.column, second.row], [10, 5, 13, 6]);
  assert.equal(first.orientation, "right");
  assert.strictEqual(state.internalConveyorItems[`${first.instanceId}:0`], cargo);
  assert.equal(state.machineInventory.leekDuster, 0);
  assert.equal(game.getFactoryInteractionControlState().visible, false);
});

test("Rotate turns a pending machine clockwise and Cancel keeps it safely in inventory", () => {
  const first = machine("leekDuster", "placement-cancel", 10, 5);
  const state = fresh([first]);
  game.pickUpSelectedFactoryEntity(descriptor(first), true);
  assert.equal(state.machines.length, 0);
  assert.equal(state.machineInventory.leekDuster, 1);
  assert.equal(game.beginFactoryTapSelection(), false);
  game.renderFactoryInteractionControls();
  assert.equal(cancelButton.textContent, "Cancel placement");
  assert.equal(rotateButton.disabled, false);
  rotateButton.dispatch("pointerdown");
  tap(20, 10);
  assert.equal(state.machines[0].orientation, "down");
  assert.equal(state.machines[0].instanceId, first.instanceId);
  game.pickUpSelectedFactoryEntity(descriptor(state.machines[0]), true);
  game.renderFactoryInteractionControls();
  cancelButton.dispatch("pointerdown");
  assert.equal(state.machineInventory.leekDuster, 1);
  assert.equal(state.machineInventoryInstances[0].instanceId, first.instanceId);
  assert.equal(game.getFactoryInteractionControlState().visible, false);
  tap(21, 10);
  assert.equal(state.machines.length, 0);
});

test("Rotate supports selected belts, and keyboard activation shares the same Cancel action", () => {
  const conveyor = { column: 10, row: 5, direction: "right", item: null };
  fresh([], [conveyor]);
  tap(10, 5);
  game.renderFactoryInteractionControls();
  rotateButton.dispatch("pointerdown");
  assert.equal(conveyor.direction, "down");
  game.renderFactoryInteractionControls();
  cancelButton.dispatch("keydown", { key: "Enter" });
  assert.equal(game.__getFactorySelection().length, 0);
});

test("unchanged factory ticks do not rewrite or recreate tap-control buttons", () => {
  fresh();
  key("Shift");
  game.renderFactoryInteractionControls();
  const original = Object.getOwnPropertyDescriptor(help, "textContent");
  let text = help.textContent, writes = 0;
  Object.defineProperty(help, "textContent", { configurable: true,
    get: () => text, set: (value) => { text = value; writes++; } });
  for (let n = 0; n < 10; n++) game.renderFactoryInteractionControls();
  assert.equal(writes, 0);
  tap(10, 5);
  game.renderFactoryInteractionControls();
  assert.equal(writes, 1);
  Object.defineProperty(help, "textContent", { ...original, value: text });
});

test("tap controls are connected to real browser keyboard and pointer handlers", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  const markup = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(source, /document\.addEventListener\("keydown", handleFactoryKeyDown\)/);
  assert.match(source, /bindFactoryInteractionControls\(\)/);
  for (const id of Object.keys(dom).map((selector) => selector.slice(1))) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
});
