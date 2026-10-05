const assert = require("node:assert/strict");
const test = require("node:test");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const vectors = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
function machine(id, instanceId, column, row, orientation = "right", extra = {}) {
  return { ...game.MACHINE_LAYOUT[id], id, instanceId, column, row, orientation, ...extra };
}
function fresh(machines, placedConveyors = [], extra = {}) {
  const state = Object.assign(game.createInitialState(), { machines, placedConveyors, crew: { total: 20 }, ...extra });
  game.__setState(state);
  return state;
}
function cargo(material, quantity = 3) { return { kind: "material", material, quantity, tileProgress: 0 }; }
function primary(furnace) { return game.getInternalConveyorTiles(furnace).find(b => b.arcFurnaceSlot === "primary"); }

test("Splitter feeds the furnace's primary input in every orientation and skips full inputs", () => {
  for (const [orientation, [dx, dy]] of Object.entries(vectors)) {
    const furnace = machine("miniElectricArcFurnace", "furnace", 10, 10, orientation);
    const port = primary(furnace);
    // The Splitter's forward output points toward this furnace.
    const splitter = machine("splitter", "splitter", port.column - dx, port.row - dy, orientation);
    const input = { column: splitter.column - dx, row: splitter.row - dy, direction: orientation, item: cargo("clay") };
    const sideDirection = Object.keys(vectors).find(d => vectors[d][0] * dx + vectors[d][1] * dy === 0);
    const [sx, sy] = vectors[sideDirection];
    const bypass = { column: splitter.column + sx, row: splitter.row + sy, direction: sideDirection, item: null };
    const state = fresh([furnace, splitter], [input, bypass]);
    game.advanceConveyorItems(1);
    assert.equal(input.item, null, orientation);
    game.advanceConveyorItems(1);
    assert.equal(state.arcFurnaceInputs.furnace.primary[0].quantity, 3, orientation);
    input.item = cargo("clay");
    game.advanceConveyorItems(1);
    assert.equal(bypass.item?.quantity, 3, orientation);
    assert.equal(state.arcFurnaceInputs.furnace.primary[0].quantity, 3);
  }
});

test("saved bottom-row side Splitter feeds Clay and Hematite without substituting materials", () => {
  for (const material of ["clay", "hematite"]) {
    const furnace = machine("miniElectricArcFurnace", "miniElectricArcFurnace-93", 18, 27, "up");
    const splitter = machine("splitter", "splitter-97", 19, 30, "right", { splitterNextOutputIndex: 1 });
    const input = { column: 18, row: 30, direction: "right", item: cargo(material) };
    const state = fresh([furnace, splitter], [input]);
    game.advanceConveyorItems(1);
    game.advanceConveyorItems(1);
    assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary[0].material, material);
    assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary[0].quantity, 3);
    game.updateCrewOperatedMachines(0);
    assert.equal(state.arcFurnaceJobs[0].material, material === "clay" ? "ceramic" : "iron");
    assert.equal(state.arcFurnaceJobs[0].secondsRemaining, 4);
  }
});

test("Ceramic output enters an adjacent Stacker in every rotation without skipping its transit timer", () => {
  for (const [orientation, [dx, dy]] of Object.entries(vectors)) {
    const furnace = machine("miniElectricArcFurnace", "furnace", 10, 10, orientation);
    const port = game.getMachinePort(furnace, "liquidOutput");
    const stacker = machine("stacker", "stacker", port.column + dx, port.row + dy, orientation, { stackSize: 1 });
    const belt = { column: stacker.column + dx, row: stacker.row + dy, direction: orientation, item: null };
    const state = fresh([furnace, stacker], [belt]);
    game.receiveConveyorItem(cargo("clay", 2), primary(furnace).column, primary(furnace).row);
    game.updateCrewOperatedMachines(0);
    game.updateCrewOperatedMachines(4);
    assert.equal(state.stackerBuffers.stacker?.quantity, 1, orientation);
    assert.equal(state.arcFurnaceOutputBuffers.furnace, undefined);
    game.emitStackerOutputs(0.99);
    assert.equal(belt.item, null);
    game.emitStackerOutputs(0.01);
    assert.equal(belt.item?.material, "ceramic");
    assert.equal(belt.item.quantity, 1);
  }
});

test("queued Ceramic respects Stacker blocking, direction, and capacity without losing a remainder", () => {
  const furnace = machine("miniElectricArcFurnace", "furnace", 18, 27, "up");
  const stacker = machine("stacker", "stacker", 19, 26, "left", { stackSize: 3 });
  const belt = { column: 18, row: 26, direction: "left", item: cargo("hematite", 1) };
  const state = fresh([furnace, stacker], [belt]);
  game.receiveConveyorItem(cargo("ceramic", 3), 19, 26);
  state.arcFurnaceOutputBuffers.furnace = cargo("ceramic", 7);
  game.flushArcFurnaceOutputs();
  assert.equal(state.arcFurnaceOutputBuffers.furnace.quantity, 7);
  assert.equal(state.stackerBuffers.stacker.quantity, 3);
  belt.item = null;
  game.flushArcFurnaceOutputs();
  assert.equal(state.stackerBuffers.stacker.quantity, 5);
  assert.equal(state.arcFurnaceOutputBuffers.furnace.quantity, 5);
  game.emitStackerOutputs(1);
  assert.equal(belt.item.quantity, 3);
  game.flushArcFurnaceOutputs();
  assert.equal(state.stackerBuffers.stacker.quantity, 5);
  assert.equal(state.arcFurnaceOutputBuffers.furnace.quantity, 2);
  assert.equal(belt.item.quantity + state.stackerBuffers.stacker.quantity
    + state.arcFurnaceOutputBuffers.furnace.quantity, 10);

  const reversed = machine("stacker", "reversed", 19, 26, "down");
  const reverseState = fresh([furnace, reversed]);
  reverseState.arcFurnaceOutputBuffers.furnace = cargo("ceramic", 1);
  game.flushArcFurnaceOutputs();
  assert.equal(reverseState.stackerBuffers.reversed, undefined);
  assert.equal(reverseState.arcFurnaceOutputBuffers.furnace.quantity, 1);
});

test("furnace replacement on another furnace's former tile does not inherit its inputs or output", () => {
  const first = machine("miniElectricArcFurnace", "first", 10, 10);
  const second = machine("miniElectricArcFurnace", "second", 20, 10);
  let state = fresh([first, second]);
  game.receiveConveyorItem(cargo("clay", 2), 10, 11);
  game.receiveConveyorItem(cargo("hematite", 2), 20, 11);
  state.arcFurnaceOutputBuffers.first = cargo("ceramic", 1);
  first.column = 20;
  second.column = 10;
  state = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  game.__setState(state);
  const replacement = state.machines.find(m => m.instanceId === "second");
  game.updateCrewOperatedMachines(0);
  assert.equal(state.arcFurnaceJobs.find(j => j.furnaceInstanceId === replacement.instanceId).material, "iron");
  assert.equal(state.arcFurnaceOutputBuffers.second, undefined);
  assert.equal(state.arcFurnaceInputs.first.primary[0].material, "clay");
  assert.equal(state.arcFurnaceOutputBuffers.first.material, "ceramic");
});

test("single and bulk pickups recover hidden furnace inputs and completed Ceramic before replacement", () => {
  for (const bulk of [false, true]) {
    const furnace = machine("miniElectricArcFurnace", "old-ceramic", 18, 27, "up");
    const untouched = machine("miniElectricArcFurnace", "untouched", 30, 20);
    const input = { column: 18, row: 30, direction: "right", item: null };
    const state = fresh([furnace, untouched], [input]);
    game.receiveConveyorItem(cargo("clay", 4), primary(furnace).column, primary(furnace).row);
    game.receiveConveyorItem(cargo("clay", 2), primary(untouched).column, primary(untouched).row);
    state.arcFurnaceOutputBuffers[furnace.instanceId] = cargo("ceramic", 1);
    const clayBefore = state.stockpile.clay;
    const ceramicBefore = state.stockpile.ceramic;
    const selected = { type: "machine", id: furnace.id, instanceId: furnace.instanceId, column: 18, row: 27 };
    if (bulk) {
      game.__setFactorySelection([selected, { type: "conveyor", column: 18, row: 30 }]);
      game.pickUpSelectedFactoryEntities();
    } else {
      game.pickUpSelectedFactoryEntity(selected);
    }
    assert.equal(state.stockpile.clay, clayBefore + 4);
    assert.equal(state.stockpile.ceramic, ceramicBefore + 1);
    assert.equal(state.arcFurnaceInputs[furnace.instanceId], undefined);
    assert.equal(state.arcFurnaceOutputBuffers[furnace.instanceId], undefined);
    assert.equal(state.arcFurnaceInputs.untouched.primary[0].quantity, 2);
    game.placeMachine("miniElectricArcFurnace", 18, 27);
    const replaced = state.machines.find(m => m.instanceId === furnace.instanceId);
    const port = primary(replaced);
    assert.equal(game.receiveConveyorItem(cargo("hematite", 2), port.column, port.row), true);
    assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary[0].material, "hematite");
  }
});

test("Move preserves furnace contents with its instance instead of recovering them", () => {
  const furnace = machine("miniElectricArcFurnace", "moved", 18, 27, "up");
  const state = fresh([furnace]);
  game.receiveConveyorItem(cargo("clay", 4), primary(furnace).column, primary(furnace).row);
  state.arcFurnaceOutputBuffers.moved = cargo("ceramic", 1);
  game.pickUpSelectedFactoryEntity({ type: "machine", id: furnace.id, instanceId: furnace.instanceId }, true);
  game.placeMachine("miniElectricArcFurnace", 30, 20);
  assert.equal(state.arcFurnaceInputs.moved.primary[0].quantity, 4);
  assert.equal(state.arcFurnaceOutputBuffers.moved.quantity, 1);
});

test("pickup recovers every alloy input slot and repeated replacement never resurrects buffers", () => {
  const furnace = machine("miniElectricArcFurnace", "alloy", 18, 20, "right", { mode: "copperContactAlloy" });
  const state = fresh([furnace]);
  for (const [slot, material, quantity] of [["primary", "silverIngot", 4],
    ["secondary", "copperIngot", 1], ["tertiary", "copperIngot", 1]]) {
    const port = game.getInternalConveyorTiles(furnace).find(b => b.arcFurnaceSlot === slot);
    assert.equal(game.receiveConveyorItem(cargo(material, quantity), port.column, port.row), true);
  }
  const beforeSilver = state.stockpile.silverIngot;
  const beforeCopper = state.stockpile.copperIngot;
  const selection = { type: "machine", id: furnace.id, instanceId: furnace.instanceId };
  game.pickUpSelectedFactoryEntity(selection);
  assert.equal(state.stockpile.silverIngot, beforeSilver + 4);
  assert.equal(state.stockpile.copperIngot, beforeCopper + 2);
  for (let i = 0; i < 3; i++) {
    game.placeMachine("miniElectricArcFurnace", 18, 20);
    assert.equal(state.machines[0].mode, "copperContactAlloy");
    assert.equal(state.arcFurnaceInputs.alloy, undefined);
    game.pickUpSelectedFactoryEntity(selection);
  }
  assert.equal(state.stockpile.silverIngot, beforeSilver + 4);
  assert.equal(state.stockpile.copperIngot, beforeCopper + 2);
});
