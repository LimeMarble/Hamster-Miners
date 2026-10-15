const assert = require("node:assert/strict");
const test = require("node:test");
const loadGame = require("./load-game.cjs");

function fixture() {
  function node(parent = null) {
    return { parent, hidden: false, listeners: new Map(),
      contains(target) { for (let n = target; n; n = n.parent) if (n === this) return true; return false; },
      addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
      },
    };
  }
  const controls = node(), interaction = node(), grid = node(), canvas = node(grid);
  canvas.width = 1000; canvas.height = 500;
  canvas.getBoundingClientRect = () => ({ left: 100, top: 100, width: 500, height: 250 });
  grid.querySelector = (selector) => selector === "canvas" ? canvas : null;
  const button = node(controls), corner = node(controls), rotate = node(interaction);
  controls.getBoundingClientRect = () => ({ left: 110, right: 180, top: 110, bottom: 180 });
  interaction.getBoundingClientRect = () => ({ left: 300, right: 380, top: 110, bottom: 180 });
  const document = node();
  const dom = { "#machineControls": controls, "#factoryInteractionControls": interaction, "#machineGrid": grid };
  document.querySelector = (selector) => dom[selector] ?? null;
  document.querySelectorAll = () => [];
  global.document = document;
  global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  const game = loadGame();
  function machine(instanceId, column, row) {
    return { ...game.MACHINE_LAYOUT.leekDuster, id: "leekDuster", instanceId, column, row, orientation: "right" };
  }
  const first = machine("selected-first", 10, 5), second = machine("selected-second", 13, 6);
  const background = machine("background-machine", 20, 10);
  const state = Object.assign(game.createInitialState(), { machines: [first, second, background],
    placedConveyors: [], tutorial: { stage: "complete", visible: false } });
  game.__setState(state);
  game.__setActiveViewForTests("factory");
  game.bindFactoryOverlayInputGuards();
  const descriptor = (m) => ({ type: "machine", id: m.id, instanceId: m.instanceId });
  function event(type, target = canvas, x = 500, y = 350, extra = {}) {
    const e = { type, target, clientX: x, clientY: y, stopped: false, prevented: false,
      stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...extra };
    for (const listener of document.listeners.get(type) ?? []) listener(e);
    return e;
  }
  function pointer(column, row, e, extra = {}) {
    return { worldX: column * 32 + 16, worldY: row * 32 + 16, x: 800, y: 500,
      button: 0, event: e, ...extra };
  }
  function tap(column, row, target = canvas, x = 500, y = 350) {
    game.handleFactoryGridPointerDown(pointer(column, row, event("pointerdown", target, x, y)));
    game.handleFactoryGridPointerUp(pointer(column, row, event("pointerup", target, x, y)));
  }
  return { game, state, controls, interaction, grid, canvas, button, corner, rotate, first, second,
    background, descriptor, event, pointer, tap, document };
}

test("single and multiple selection panels block child controls, panel padding and canvas hit-test fallbacks", () => {
  for (const multiple of [false, true]) {
    const f = fixture();
    const selection = [f.descriptor(f.first), ...(multiple ? [f.descriptor(f.second)] : [])];
    f.game.__setFactorySelection(selection);
    for (const [target, x, y] of [
      [f.button, 140, 140], [f.corner, 140, 140], [f.controls, 140, 140],
      [f.canvas, 140, 140], [f.rotate, 330, 140], [f.interaction, 330, 140],
    ]) {
      f.tap(20, 10, target, x, y);
      assert.deepEqual(f.game.__getFactorySelection(), selection);
      assert.equal(f.state.machines.length, 3);
    }
  }
});

test("queued events remain blocked after control nodes detach and the panel hides", () => {
  const f = fixture();
  const selection = [f.descriptor(f.first)];
  f.game.__setFactorySelection(selection);
  const down = f.event("pointerdown", f.button, 140, 140);
  f.button.parent = null;
  f.controls.hidden = true;
  f.interaction.hidden = true;
  f.game.handleFactoryGridPointerDown(f.pointer(20, 10, down));
  assert.deepEqual(f.game.__getFactorySelection(), selection);
  for (const type of ["mousedown", "pointerup", "mouseup", "click"]) {
    const e = f.event(type, f.canvas, 140, 140);
    assert.equal(e.stopped, type === "mousedown" || type === "click",
      "releases must reset Phaser's held-button state, but cannot act on the grid");
    assert.equal(f.game.shouldFinalizeFactoryMarquee(f.pointer(20, 10, e)), false);
    f.game.handleFactoryGridPointerDown(f.pointer(20, 10, e));
    assert.deepEqual(f.game.__getFactorySelection(), selection);
  }
  f.tap(20, 10);
  assert.deepEqual(f.game.__getFactorySelection(), [f.descriptor(f.background)], "the next real canvas click works");
});

test("single and group Move gestures never place pieces underneath their controls", () => {
  for (const multiple of [false, true]) {
    const f = fixture();
    f.game.__setFactorySelection([f.descriptor(f.first), ...(multiple ? [f.descriptor(f.second)] : [])]);
    const down = f.event("pointerdown", f.button, 140, 140);
    f.game.moveSelectedFactoryEntities();
    assert.equal(f.game.getFactoryInteractionControlState().cancelLabel, multiple ? "Cancel move" : "Cancel placement");
    f.controls.hidden = true;
    f.game.handleFactoryGridPointerDown(f.pointer(25, 15, down));
    f.game.handleFactoryGridPointerDown(f.pointer(25, 15, f.event("mousedown", f.canvas, 140, 140)));
    f.game.handleFactoryGridPointerUp(f.pointer(25, 15, f.event("pointerup", f.canvas, 140, 140)));
    assert.deepEqual([f.first.column, f.first.row, f.second.column, f.second.row], [10, 5, 13, 6]);
    assert.equal(f.state.machines.some((m) => m.instanceId === f.first.instanceId), multiple);
    f.tap(25, 15);
    const placed = f.state.machines.find((m) => m.instanceId === f.first.instanceId);
    assert.deepEqual([placed.column, placed.row], [25, 15]);
    assert.deepEqual([f.second.column, f.second.row], multiple ? [28, 16] : [13, 6]);
  }
});

test("overlay hover and release cannot extend or finish a canvas marquee", () => {
  const f = fixture();
  f.game.__setFactorySelection([f.descriptor(f.background)]);
  f.game.handleFactoryGridPointerDown(f.pointer(9, 4, f.event("pointerdown")));
  f.game.handleFactoryGridPointerMove(f.pointer(14, 7, { target: f.canvas, clientX: 510, clientY: 370 }));
  f.game.handleFactoryGridPointerMove(f.pointer(21, 11, { target: f.button, clientX: 140, clientY: 140 }));
  f.game.handleFactoryGridPointerUp(f.pointer(21, 11, f.event("pointerup", f.canvas, 140, 140)));
  assert.deepEqual(f.game.__getFactorySelection(), [f.descriptor(f.background)]);
  f.tap(10, 5);
  assert.deepEqual(f.game.__getFactorySelection(), [f.descriptor(f.first)]);
});

test("overlay clicks cannot anchor or complete two-tap selection", () => {
  const f = fixture();
  assert.equal(f.game.beginFactoryTapSelection(), true);
  f.tap(20, 10, f.button, 140, 140);
  assert.match(f.game.getFactoryInteractionControlState().help, /first corner/);
  f.tap(9, 4);
  f.tap(20, 10, f.rotate, 330, 140);
  assert.match(f.game.getFactoryInteractionControlState().help, /opposite corner/);
  f.tap(14, 7);
  assert.deepEqual(f.game.__getFactorySelection(), [f.descriptor(f.first), f.descriptor(f.second)]);
});

test("fallback pointer positions account for CSS canvas scaling and touch coordinates", () => {
  const f = fixture();
  assert.equal(f.game.shouldFinalizeFactoryMarquee({ x: 50, y: 50 }), false);
  assert.equal(f.game.shouldFinalizeFactoryMarquee({ x: 800, y: 400 }), true);
  assert.equal(f.game.shouldFinalizeFactoryMarquee({ event: { target: f.canvas,
    changedTouches: [{ clientX: 140, clientY: 140 }] } }), false);
  f.controls.hidden = true;
  assert.equal(f.game.shouldFinalizeFactoryMarquee({ x: 50, y: 50 }), true);
  const removed = { target: {}, composedPath: () => [f.controls] };
  assert.equal(f.game.shouldFinalizeFactoryMarquee({ event: removed }), false);
});

test("overlay roots stop bubbling without suppressing native select, button or scroll behaviour", () => {
  const f = fixture();
  f.game.bindFactoryOverlayInputGuards();
  assert.equal(f.document.listeners.get("pointerdown").length, 1);
  for (const root of [f.controls, f.interaction]) {
    for (const type of ["pointerdown", "mousedown", "click", "wheel", "touchstart"]) {
      const e = { stopped: false, prevented: false,
        stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
      for (const listener of root.listeners.get(type) ?? []) listener(e);
      assert.equal(e.stopped, true, type);
      assert.equal(e.prevented, false, type);
    }
  }
});

test("overlay releases reach the input engine without finishing a grid selection", () => {
  const f = fixture();
  f.event("pointerdown", f.button, 140, 140);
  for (const type of ["pointerup", "mouseup", "touchend", "pointercancel", "touchcancel"]) {
    const e = f.event(type, f.button, 140, 140);
    for (const listener of f.controls.listeners.get(type) ?? []) listener(e);
    assert.equal(e.stopped, false, type);
    assert.equal(f.game.shouldFinalizeFactoryMarquee({ event: e }), false);
  }
});
