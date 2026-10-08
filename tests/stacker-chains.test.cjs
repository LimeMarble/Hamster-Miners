const assert = require("node:assert/strict");
const test = require("node:test");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const vectors = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
function stacker(instanceId, column, row, orientation = "right", stackSize = 3) {
  return { ...game.MACHINE_LAYOUT.stacker, id: "stacker", instanceId, column, row, orientation, stackSize };
}
function fresh(machines, belts = []) {
  const state = Object.assign(game.createInitialState(), { machines, placedConveyors: belts });
  game.__setState(state);
  return state;
}
function cargo(quantity = 3, extra = {}) {
  return { kind: "material", material: "bronzePlate", quantity, saleValueBase: 178,
    bronzeStampUses: 2, bronzePillarsUses: 1, annealed: true, ...extra };
}
function feed(machine, item = cargo()) {
  assert.equal(game.receiveConveyorItem(item, machine.column, machine.row), true);
}
function buffered(state, machine) { return state.stackerBuffers[machine.instanceId]?.quantity ?? 0; }

test("Stacker sustains one stack per second through an unblocked belt in real factory ticks", () => {
  for (const [orientation, [dx, dy]] of Object.entries(vectors)) for (const stackSize of [1, 3])
    for (const beltFed of [false, true]) {
    const source = stacker("sustained", 10, 10, orientation, stackSize);
    const outlet = { column: 10 + dx, row: 10 + dy, direction: orientation, item: null };
    const input = { column: 10 - dx, row: 10 - dy, direction: orientation, item: null };
    const storage = { ...game.MACHINE_LAYOUT.materialStorage, id: "materialStorage", instanceId: "sink",
      column: 10 + 2 * dx - (dx < 0 ? 3 : 0), row: 10 + 2 * dy - (dy < 0 ? 3 : 0) };
    const state = fresh([source, storage], beltFed ? [input, outlet] : [outlet]);
    state.stockpile.bronzePlate = 0;
    const emittedAt = [];
    let previous = 0, supplied = 0;
    for (let tick = 1; tick <= 60; tick++) {
      if (beltFed) {
        if (!input.item) {
          assert.equal(game.placeItemOnConveyor(input, cargo(stackSize, { tileProgress: 0 })), true);
          supplied += stackSize;
        }
      } else if (game.canReceiveConveyorItem(cargo(stackSize), source.column, source.row)) {
        feed(source, cargo(stackSize));
        supplied += stackSize;
      }
      game.updateFactory(0.1);
      const departed = state.stockpile.bronzePlate + (outlet.item?.quantity ?? 0);
      assert.equal(departed + buffered(state, source) + (input.item?.quantity ?? 0), supplied);
      assert.ok(buffered(state, source) <= 5, "the timing fix cannot overfill the Stacker");
      if (departed > previous) emittedAt.push(tick);
      previous = departed;
    }
    assert.deepEqual(emittedAt, beltFed ? [20, 30, 40, 50, 60] : [10, 20, 30, 40, 50, 60],
      `${orientation}, ${stackSize} items per stack, beltFed=${beltFed}`);
    assert.equal(previous, (beltFed ? 5 : 6) * stackSize);
  }
});

test("adjacent Stacker chains sustain belt cadence regardless of machine order", () => {
  for (const reverse of [false, true]) {
    const source = stacker("stream-source", 10, 10), target = stacker("stream-target", 11, 10);
    const outlet = { column: 12, row: 10, direction: "right", item: null };
    const storage = { ...game.MACHINE_LAYOUT.materialStorage, id: "materialStorage", instanceId: "chain-sink",
      column: 13, row: 10 };
    const state = fresh(reverse ? [target, source, storage] : [source, target, storage], [outlet]);
    state.stockpile.bronzePlate = 0;
    const emittedAt = [];
    let previous = 0;
    for (let tick = 1; tick <= 60; tick++) {
      if (game.canReceiveConveyorItem(cargo(3), source.column, source.row)) feed(source);
      game.updateFactory(0.1);
      const departed = state.stockpile.bronzePlate + (outlet.item?.quantity ?? 0);
      if (departed > previous) emittedAt.push(tick);
      previous = departed;
    }
    assert.deepEqual(emittedAt, [20, 30, 40, 50, 60], `reverse=${reverse}`);
  }
});

test("Stacker hands its batch directly to an adjacent Stacker after normal belt transit", () => {
  const source = stacker("source", 10, 10), target = stacker("target", 11, 10);
  const state = fresh([source, target]);
  const original = cargo(5);
  feed(source, original);
  game.emitStackerOutputs(0.99);
  assert.equal(buffered(state, target), 0);
  game.emitStackerOutputs(0.01);
  assert.equal(buffered(state, source), 2);
  assert.equal(buffered(state, target), 3);
  const received = state.stackerBuffers[target.instanceId].item;
  assert.deepEqual(received, { ...original, quantity: 3, tileProgress: 0 });
  assert.notEqual(received, original);
  feed(source, cargo(1));
  assert.equal(game.canReceiveConveyorItem(cargo(1), source.column, source.row), false);
  game.emitStackerOutputs(1);
  assert.equal(buffered(state, source) + buffered(state, target), 6);
});

test("direct chains require one cycle per Stacker in all orientations and either instance order", () => {
  for (const [orientation, [dx, dy]] of Object.entries(vectors)) {
    for (const reverseOrder of [false, true]) {
      const source = stacker("source", 10, 10, orientation), target = stacker("target", 10 + dx, 10 + dy, orientation);
      const belt = { column: 10 + 2 * dx, row: 10 + 2 * dy, direction: orientation, item: null };
      const state = fresh(reverseOrder ? [target, source] : [source, target], [belt]);
      feed(source);
      game.emitStackerOutputs(1);
      assert.equal(belt.item, null, "freshly handed-off cargo cannot also leave its next Stacker");
      assert.equal(buffered(state, target), 3);
      game.emitStackerOutputs(0.99);
      assert.equal(belt.item, null);
      game.emitStackerOutputs(0.01);
      assert.equal(belt.item?.quantity, 3, orientation);
      assert.equal(belt.item.saleValueBase, 178);
      assert.equal(belt.item.bronzePillarsUses, 1);
      assert.equal(buffered(state, source) + buffered(state, target), 0);
    }
  }
});

test("adjacent Stackers accept side entries but reject entry through their output face", () => {
  for (const orientation of ["up", "down", "left"]) {
    const source = stacker("source", 10, 10), target = stacker("target", 11, 10, orientation);
    const state = fresh([source, target]);
    feed(source);
    game.emitStackerOutputs(1);
    assert.equal(buffered(state, source), orientation === "left" ? 3 : 0);
    assert.equal(buffered(state, target), orientation === "left" ? 0 : 3);
  }
});

test("saved ceramic-line Stackers hand off into a partly filled perpendicular Stacker", () => {
  const source = stacker("stacker-108", 14, 29, "down");
  const target = stacker("stacker-107", 14, 30, "right");
  const outlet = { column: 15, row: 30, direction: "right", item: null };
  const state = fresh([target, source], [outlet]);
  const clay = { kind: "material", material: "clay", quantity: 3, saleValueBase: 0 };
  state.stackerBuffers = {
    "stacker-108": { item: { ...clay }, itemKey: "material|clay|||||normal|0|0", quantity: 3 },
    "stacker-107": { item: { ...clay, quantity: 1 }, itemKey: "material|clay|||||normal|0|0", quantity: 1 },
  };
  game.emitStackerOutputs(1);
  assert.equal(buffered(state, source), 0);
  assert.equal(buffered(state, target), 4);
  assert.equal(outlet.item, null);
  game.emitStackerOutputs(1);
  assert.equal(outlet.item.quantity, 3);
  assert.equal(buffered(state, target), 1);
});

test("a full blocked downstream Stacker blocks upstream intake and preserves all cargo", () => {
  const source = stacker("source", 10, 10), target = stacker("target", 11, 10);
  const belt = { column: 12, row: 10, direction: "right", item: cargo(1, { material: "clay" }) };
  const state = fresh([source, target], [belt]);
  feed(target);
  feed(source);
  const blockedOutput = belt.item;
  assert.equal(game.canReceiveConveyorItem(cargo(1), source.column, source.row), false);
  game.emitStackerOutputs(100);
  assert.equal(buffered(state, source), 3);
  assert.equal(buffered(state, target), 3);
  assert.equal(belt.item, blockedOutput);
  belt.item = null;
  assert.equal(game.canReceiveConveyorItem(cargo(1), source.column, source.row), true);
  game.emitStackerOutputs();
  assert.equal(buffered(state, source) + buffered(state, target) + belt.item.quantity, 6);
  assert.ok(game.getCargoWeight(state.stackerBuffers[target.instanceId].item) <= 5);
});

test("an incoming stack can wait at the entrance without overflowing a truly blocked Stacker", () => {
  const machine = stacker("waiting-input", 10, 10);
  const input = { column: 9, row: 10, direction: "right", item: cargo(3, { tileProgress: 0 }) };
  const outlet = { column: 11, row: 10, direction: "right", item: cargo(1, { material: "clay" }) };
  const state = fresh([machine], [input, outlet]);
  feed(machine);
  for (let tick = 0; tick < 15; tick++) game.updateFactory(0.1);
  assert.equal(buffered(state, machine), 3);
  assert.equal(input.item.quantity, 3);
  assert.equal(input.item.tileProgress, 1);
  assert.equal(outlet.item.material, "clay");
  outlet.item = null;
  game.updateFactory(0.1);
  assert.equal(outlet.item.quantity, 3);
  assert.equal(input.item, null);
  assert.equal(buffered(state, machine), 3);
  assert.equal(state.stackerBuffers[machine.instanceId].outputProgress ?? 0, 0,
    "an arriving batch cannot inherit the elapsed time of the batch that just left");
});

test("direct handoffs do not merge incompatible materials, upgrade tags or ammo damage", () => {
  for (const different of [cargo(1, { material: "silverPlate" }), cargo(1, { bronzeStampUses: 3 }),
    { kind: "ammo", material: "lead", type: "rapidfire", damage: 5, quantity: 1 }]) {
    const source = stacker("source", 10, 10), target = stacker("target", 11, 10);
    const state = fresh([source, target]);
    feed(source);
    feed(target, different);
    game.emitStackerOutputs(1);
    assert.equal(buffered(state, source), 3);
    assert.equal(buffered(state, target), 1);
  }
  const source = stacker("ammo-source", 10, 10), target = stacker("ammo-target", 11, 10);
  const state = fresh([source, target]);
  feed(source, { kind: "ammo", type: "rapidfire", material: "lead", quantity: 3, damage: 8.5 });
  feed(target, { kind: "ammo", type: "rapidfire", material: "lead", quantity: 1, damage: 5 });
  game.emitStackerOutputs(1);
  assert.equal(buffered(state, source), 3);
  assert.equal(state.stackerBuffers[target.instanceId].item.damage, 5);
});

test("a closed, full Stacker loop blocks without recursive overflow, loss or duplication", () => {
  const machines = [stacker("right", 10, 10, "right"), stacker("down", 11, 10, "down"),
    stacker("left", 11, 11, "left"), stacker("up", 10, 11, "up")];
  const state = fresh(machines);
  machines.forEach((machine) => feed(machine));
  machines.forEach((machine) => assert.equal(game.canReceiveConveyorItem(cargo(1), machine.column, machine.row), false));
  for (let i = 0; i < 5; i++) game.emitStackerOutputs(1);
  assert.deepEqual(machines.map((machine) => buffered(state, machine)), [3, 3, 3, 3]);
});

test("ordinary Stackers have normal conveyor weight capacity for intake, buffering and output", () => {
  const machine = stacker("capacity", 10, 10);
  const belt = { column: 11, row: 10, direction: "right", weightCapacity: 30, item: null };
  const state = fresh([machine], [belt]);
  assert.equal(game.canReceiveConveyorItem(cargo(6), 10, 10), false);
  feed(machine, cargo(5));
  assert.equal(game.canReceiveConveyorItem(cargo(1), 10, 10), false);
  game.emitStackerOutputs(1);
  assert.equal(belt.item.quantity, 3);
  assert.equal(buffered(state, machine), 2);
});

test("an industrial-capacity input belt splits oversized cargo before a normal Stacker", () => {
  const machine = stacker("input-capacity", 10, 10);
  const input = { column: 9, row: 10, direction: "right", weightCapacity: 30, item: cargo(12) };
  const state = fresh([machine], [input]);
  game.advanceConveyorItems(1);
  assert.equal(buffered(state, machine), 5);
  assert.equal(input.item.quantity, 7);
  assert.equal(input.item.saleValueBase, 178);
  assert.equal(input.item.bronzeStampUses, 2);
});

test("a count that exceeds weight capacity emits a smaller whole-item batch instead of deadlocking", () => {
  const machine = stacker("heavy-count", 10, 10);
  const belt = { column: 11, row: 10, direction: "right", item: null };
  fresh([machine], [belt]);
  assert.equal(game.canReceiveConveyorItem(cargo(3, { material: "ironHeavyGear" }), 10, 10), false);
  feed(machine, cargo(2, { material: "ironHeavyGear" }));
  game.emitStackerOutputs(1);
  assert.equal(belt.item.quantity, 2);
  assert.equal(game.getCargoWeight(belt.item), 4);
});

test("legacy oversized heavy buffers drain through chained Stackers without losing the final remainder", () => {
  const source = stacker("legacy-source", 10, 10), target = stacker("legacy-target", 11, 10);
  const belt = { column: 12, row: 10, direction: "right", item: null };
  let state = fresh([source, target], [belt]);
  feed(source, cargo(2, { material: "ironHeavyGear" }));
  const buffer = state.stackerBuffers[source.instanceId];
  buffer.quantity = buffer.item.quantity = 3;
  game.emitStackerOutputs(1);
  assert.equal(buffered(state, source), 1);
  assert.equal(buffered(state, target), 2);
  game.emitStackerOutputs(1);
  assert.equal(belt.item.quantity, 2);
  assert.equal(buffered(state, source), 0);
  assert.equal(buffered(state, target), 1, "the ready remainder can enter as the downstream batch leaves");
  state = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  game.__setState(state);
  state.placedConveyors[0].item = null;
  game.emitStackerOutputs(1);
  assert.equal(buffered(state, source), 0);
  assert.equal(buffered(state, target), 1);
  // The receiving Stacker still respects its own configured count.
  state.machines.find(({ instanceId }) => instanceId === target.instanceId).stackSize = 1;
  game.emitStackerOutputs(1);
  assert.equal(state.placedConveyors[0].item.quantity, 1);
  assert.equal(state.placedConveyors[0].item.saleValueBase, 178);
  assert.equal(state.placedConveyors[0].item.bronzeStampUses, 2);
});

test("a Stacker cannot release again without elapsed time, even with an always-cleared outlet", () => {
  const machine = stacker("rate", 10, 10, "right", 1);
  const belt = { column: 11, row: 10, direction: "right", item: null };
  const state = fresh([machine], [belt]);
  feed(machine, cargo(5));
  game.emitStackerOutputs(1);
  assert.equal(belt.item.quantity, 1);
  belt.item = null;
  for (let i = 0; i < 100; i++) game.emitStackerOutputs();
  assert.equal(belt.item, null);
  assert.equal(buffered(state, machine), 4);
  game.emitStackerOutputs(0.99);
  assert.equal(belt.item, null);
  game.emitStackerOutputs(0.01);
  assert.equal(belt.item.quantity, 1);
});

test("blocked time and large deltas do not bank a burst of Stacker output", () => {
  const machine = stacker("bank", 10, 10, "right", 1);
  const belt = { column: 11, row: 10, direction: "right", item: cargo(1, { material: "clay" }) };
  const state = fresh([machine], [belt]);
  feed(machine, cargo(5));
  game.emitStackerOutputs(1000);
  belt.item = null;
  game.emitStackerOutputs();
  assert.equal(belt.item.quantity, 1);
  belt.item = null;
  game.emitStackerOutputs();
  assert.equal(belt.item, null);
  assert.equal(buffered(state, machine), 4);
});

test("Stacker timers are independent, survive refresh, and follow the conveyor speed cheat", () => {
  const first = stacker("first", 10, 10), second = stacker("second", 10, 12);
  const outlets = [10, 12].map((row) => ({ column: 11, row, direction: "right", item: null }));
  let state = fresh([first, second], outlets);
  feed(first);
  game.emitStackerOutputs(0.5);
  feed(second);
  game.emitStackerOutputs(0.5);
  assert.equal(outlets[0].item.quantity, 3);
  assert.equal(outlets[1].item, null);
  state = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  game.__setState(state);
  game.emitStackerOutputs(0.49);
  assert.equal(state.placedConveyors[1].item, null);
  game.emitStackerOutputs(0.01);
  assert.equal(state.placedConveyors[1].item.quantity, 3);
  state.placedConveyors[1].item = null;
  feed(state.machines.find(({ instanceId }) => instanceId === second.instanceId));
  state.cheatPanelUnlocked = true;
  state.playtestCheats.productionSpeedX5 = true;
  const seconds = game.getConveyorSecondsPerTile(state.placedConveyors[1]);
  assert.equal(seconds, 0.2);
  game.emitStackerOutputs(0.19);
  assert.equal(state.placedConveyors[1].item, null);
  game.emitStackerOutputs(0.01);
  assert.equal(state.placedConveyors[1].item.quantity, 3);
});

test("factory updates do not credit a newly received Stacker batch with time before its arrival", () => {
  const machine = stacker("arrival", 10, 10);
  const input = { column: 9, row: 10, direction: "right", item: cargo(3, { tileProgress: 1 }) };
  const output = { column: 11, row: 10, direction: "right", item: null };
  const state = fresh([machine], [input, output]);
  game.updateFactory(0.1);
  assert.equal(buffered(state, machine), 3);
  assert.equal(state.stackerBuffers[machine.instanceId].outputProgress ?? 0, 0);
  game.updateFactory(0.9);
  assert.equal(output.item, null);
  game.updateFactory(0.1);
  assert.equal(output.item.quantity, 3);
});

test("Stacker controls do not remount as their timer and cargo count change", () => {
  const machine = stacker("controls", 10, 10);
  const output = { column: 11, row: 10, direction: "right", item: null };
  fresh([machine], [output]);
  const before = game.getFactoryMachineProgressState(machine);
  feed(machine);
  game.emitStackerOutputs(0.5);
  assert.equal(game.getFactoryMachineProgressState(machine), before);
  game.emitStackerOutputs(0.5);
  assert.equal(game.getFactoryMachineProgressState(machine), before);
  machine.stackSize = 2;
  assert.notEqual(game.getFactoryMachineProgressState(machine), before);
});
