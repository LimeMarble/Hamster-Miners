const assert = require("node:assert/strict");
const test = require("node:test");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const vectors = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
function machine(id, instanceId, column, row, orientation = "right") {
  return { ...game.MACHINE_LAYOUT[id], id, instanceId, column, row, orientation };
}
function fresh(machines, placedConveyors = [], extra = {}) {
  const state = Object.assign(game.createInitialState(), { machines, placedConveyors, ...extra });
  game.__setState(state);
  return state;
}
function clay(quantity = 1) { return { kind: "material", material: "clay", quantity, tileProgress: 0 }; }
function limit() {
  const capacity = game.CONFIG.ingotMolderClayCapacity;
  assert.ok(Number.isInteger(capacity) && capacity > 0, "the Clay input needs an explicit finite capacity");
  return capacity;
}
function port(molder) { return game.getMachinePort(molder, "clayInput"); }
function receive(molder, item) {
  const input = port(molder);
  return game.receiveConveyorItem(item, input.column, input.row);
}

test("Ingot Molder stops Clay intake at its capacity even with a blocked output", () => {
  const capacity = limit();
  const molder = machine("ingotMolder", "molder", 10, 10);
  const state = fresh([molder]);
  state.molderOutputBuffers.molder = { kind: "material", material: "ironIngot", quantity: 1 };
  for (let i = 0; i < capacity; i++) assert.equal(receive(molder, clay()), true);
  for (let i = 0; i < 20; i++) assert.equal(receive(molder, clay()), false);
  assert.equal(state.molderClayBuffers.molder, capacity);
  assert.equal(game.canReceiveConveyorItem(clay(), port(molder).column, port(molder).row), false);
});

test("Clay intake rejects an oversized direct stack and invalid cargo without changing its buffer", () => {
  const capacity = limit();
  const molder = machine("ingotMolder", "molder", 10, 10);
  const state = fresh([molder]);
  for (const item of [clay(capacity + 1), clay(Infinity), clay(NaN), clay(0), clay(-1),
    { ...clay(), material: "hematite" }, { ...clay(), kind: "ammo" }]) {
    assert.equal(receive(molder, item), false);
  }
  assert.equal(state.molderClayBuffers.molder, undefined);
});

test("Clay stacks split to available buffer space in every rotation and keep overflow on their belt", () => {
  const capacity = limit();
  for (const orientation of Object.keys(vectors)) {
    const molder = machine("ingotMolder", "molder", 10, 10, orientation);
    const input = port(molder);
    const [dx, dy] = vectors[input.direction];
    const belt = { column: input.column - dx, row: input.row - dy, direction: input.direction,
      weightCapacity: 30, item: clay(capacity + 3) };
    const state = fresh([molder], [belt]);
    game.advanceConveyorItems(1);
    assert.equal(state.molderClayBuffers.molder, capacity, orientation);
    assert.equal(belt.item.quantity, 3, orientation);
    for (let i = 0; i < 5; i++) game.advanceConveyorItems(1);
    assert.equal(state.molderClayBuffers.molder, capacity);
    assert.equal(belt.item.quantity, 3);
    assert.equal(belt.item.material, "clay");
  }
});

test("consuming one Iron mold reopens exactly one Clay slot without accelerating molding", () => {
  const capacity = limit();
  const furnace = machine("miniElectricArcFurnace", "furnace", 7, 10);
  const molder = machine("ingotMolder", "molder", 10, 10);
  const input = port(molder);
  const belt = { column: input.column, row: input.row - 1, direction: "down", item: clay(3) };
  const state = fresh([furnace, molder], [belt], { crew: { total: 1 },
    molderClayBuffers: { molder: capacity }, moltenCopper: [{ smelterInstanceId: "furnace",
      kilnInstanceId: "furnace", material: "iron", quantity: 1 }] });
  game.startMolderJob();
  assert.equal(state.molderClayBuffers.molder, capacity - 1);
  assert.equal(state.molderJobs.length, 1);
  assert.equal(state.molderJobs[0].secondsRemaining, 1);
  game.advanceConveyorItems(1);
  assert.equal(state.molderClayBuffers.molder, capacity);
  assert.equal(belt.item.quantity, 2);
  game.advanceConveyorItems(1);
  assert.equal(belt.item.quantity, 2);
});

test("legacy oversized Clay buffers return excess to storage once on save hydration", () => {
  const capacity = limit();
  const molder = machine("ingotMolder", "molder", 10, 10);
  const state = fresh([molder], [], { molderClayBuffers: { molder: capacity + 57 } });
  const before = state.stockpile.clay;
  const restored = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.molderClayBuffers.molder, capacity);
  assert.equal(restored.stockpile.clay, before + 57);
  const again = game.hydrateSavedState(JSON.parse(JSON.stringify(restored)));
  assert.equal(again.stockpile.clay, before + 57);
  assert.equal(again.molderClayBuffers.molder, capacity);
});

test("Clay limits are per instance and full buffers remain limited after movement and refresh", () => {
  const capacity = limit();
  const first = machine("ingotMolder", "first", 10, 10);
  const second = machine("ingotMolder", "second", 15, 10);
  let state = fresh([first, second]);
  assert.equal(receive(first, clay(capacity)), true);
  assert.equal(receive(second, clay()), true);
  game.pickUpSelectedFactoryEntity({ type: "machine", id: first.id, instanceId: first.instanceId }, true);
  game.placeMachine("ingotMolder", 20, 10);
  state = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  game.__setState(state);
  assert.equal(state.molderClayBuffers.first, capacity);
  assert.equal(state.molderClayBuffers.second, 1);
  assert.equal(receive(state.machines.find(m => m.instanceId === "first"), clay()), false);
  const before = state.stockpile.clay;
  game.pickUpSelectedFactoryEntity({ type: "machine", id: first.id, instanceId: first.instanceId });
  assert.equal(state.stockpile.clay, before + capacity);
  assert.equal(state.molderClayBuffers.first, undefined);
});
