const assert = require("node:assert/strict");
const test = require("node:test");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
function maker(instanceId = "maker", orientation = "right") {
  return { ...game.MACHINE_LAYOUT.contactMaker, id: "contactMaker", instanceId, column: 10, row: 10, orientation };
}
function fresh(machines) {
  const state = Object.assign(game.createInitialState(), { machines, placedConveyors: [],
    tutorial: { stage: "complete", visible: false } });
  game.__setState(state);
  return state;
}
const ingot = (material = "silverIngot") => ({ kind: "material", material, quantity: 1, saleValueBase: 313 });

test("Contact Maker flips its one active ingot input in every orientation without changing its wire lane", () => {
  const expected = {
    right: [{ column: 11, row: 12, direction: "up" }, { column: 11, row: 10, direction: "down" }],
    up: [{ column: 12, row: 12, direction: "left" }, { column: 10, row: 12, direction: "right" }],
    down: [{ column: 10, row: 11, direction: "right" }, { column: 12, row: 11, direction: "left" }],
    left: [{ column: 12, row: 10, direction: "down" }, { column: 12, row: 12, direction: "up" }],
  };
  for (const [orientation, ports] of Object.entries(expected)) {
    const machine = maker("maker", orientation);
    fresh([machine]);
    const lanes = game.getInternalConveyorTiles(machine);
    for (let flipped = 0; flipped < 2; flipped++) {
      assert.deepEqual(game.getMachinePort(machine, "silverInput"), ports[flipped]);
      assert.equal(game.canReceiveConveyorItem(ingot(), ports[flipped].column, ports[flipped].row), true);
      assert.equal(game.canReceiveConveyorItem(ingot(), ports[1 - flipped].column, ports[1 - flipped].row), false);
      assert.deepEqual(game.getInternalConveyorTiles(machine), lanes);
      assert.equal(game.flipContactMakerInput(machine), true);
    }
    assert.equal(machine.metalInputFlipped, false);
  }
  assert.deepEqual(game.MACHINE_LAYOUT.contactMaker.silverInput, { column: 1, row: 2, direction: "up" });
});

test("flipping is per-instance and preserves buffered ingots, wire cargo and value", () => {
  const first = maker("first"), second = { ...maker("second"), column: 20 };
  const state = fresh([first, second]);
  const port = game.getMachinePort(first, "silverInput");
  assert.equal(game.receiveConveyorItem(ingot(), port.column, port.row), true);
  const wireBelt = game.getConveyorAt(11, 11);
  const wire = { kind: "material", material: "wire", quantity: 5, saleValueBase: 53.6 };
  game.placeItemOnConveyor(wireBelt, wire);
  const buffer = JSON.parse(JSON.stringify(state.contactMakerInputs));
  game.flipContactMakerInput(first);
  assert.deepEqual(state.contactMakerInputs, buffer);
  assert.equal(game.getConveyorItem(wireBelt), wire);
  assert.equal(second.metalInputFlipped, false);
  assert.equal(game.canItemLeaveConveyor(wireBelt, wire), true);
  const contacts = game.transformItemLeavingConveyor(wireBelt, wire);
  assert.equal(contacts.material, "contact");
  assert.equal(contacts.quantity, 5);
  assert.ok(Math.abs(game.getItemSaleValue(contacts) - 169.8) < 1e-10);
  assert.equal(state.contactMakerInputs[first.instanceId].silver, 0.5);
});

test("belts feed Silver and both Contact Alloy Ingots through the flipped side input", () => {
  for (const [material, product, multiplier] of [
    ["silverIngot", "contact", 2],
    ["copperContactAlloyIngot", "silverCopperContact", 3],
    ["tinContactAlloyIngot", "silverTinContact", 3],
  ]) {
    const machine = maker();
    const state = fresh([machine]);
    game.flipContactMakerInput(machine);
    const belt = { column: 11, row: 9, direction: "down", item: ingot(material) };
    state.placedConveyors.push(belt);
    game.__setState(state);
    game.advanceConveyorItems(1);
    assert.equal(belt.item, null);
    const process = game.getConveyorAt(11, 11);
    game.placeItemOnConveyor(process, { kind: "material", material: "wire", quantity: 5, saleValueBase: 53.6 });
    game.advanceConveyorItems(2);
    const output = game.getConveyorItem(game.getConveyorAt(12, 11));
    assert.equal(output.material, product);
    assert.equal(output.quantity, 5);
    assert.ok(Math.abs(game.getItemSaleValue(output) - (268 + 313 * 0.5) * multiplier / 5) < 1e-10);
  }
});

test("old saves retain the original input; flipped settings survive placed and inventory save hydration", () => {
  const placed = maker(), stored = maker("stored", "up");
  const state = fresh([placed]);
  delete placed.metalInputFlipped;
  state.machineInventoryInstances = [stored];
  stored.metalInputFlipped = true;
  let hydrated = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  assert.equal(hydrated.machines[0].metalInputFlipped, false);
  assert.equal(hydrated.machineInventoryInstances[0].metalInputFlipped, true);
  placed.metalInputFlipped = true;
  hydrated = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  assert.equal(hydrated.machines[0].metalInputFlipped, true);
  assert.deepEqual(game.getMachinePort(hydrated.machines[0], "silverInput"), { column: 11, row: 10, direction: "down" });
});

test("flipped input survives movement, pickup, refresh and replacement", () => {
  const machine = maker();
  const other = { ...maker("other"), column: 16 };
  const state = fresh([machine, other]);
  game.flipContactMakerInput(machine);
  const selection = { type: "machine", id: machine.id, instanceId: machine.instanceId };
  game.__setFactorySelection([selection, { type: "machine", id: other.id, instanceId: other.instanceId }]);
  assert.equal(game.beginGroupMove(), true);
  assert.equal(game.completeGroupMove(20, 15), true);
  assert.equal(machine.metalInputFlipped, true);
  assert.deepEqual(game.getMachinePort(machine, "silverInput"), { column: 21, row: 15, direction: "down" });
  game.pickUpSelectedFactoryEntity(selection, true);
  const reloaded = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  game.__setState(reloaded);
  assert.equal(reloaded.machineInventoryInstances[0].metalInputFlipped, true);
  game.placeMachine("contactMaker", 30, 15);
  const replaced = reloaded.machines.find((candidate) => candidate.instanceId === machine.instanceId);
  assert.ok(replaced);
  assert.equal(replaced.metalInputFlipped, true);
});

test("input flip rejects unrelated machines", () => {
  fresh([]);
  assert.equal(game.flipContactMakerInput(null), false);
  const other = { id: "miniElectricArcFurnace" };
  assert.equal(game.flipContactMakerInput(other), false);
  assert.equal(other.metalInputFlipped, undefined);
});
