const assert = require("node:assert/strict");
const test = require("node:test");
const { ORIENTATIONS, machine, freshFactory, renderFloor, assertOldVisualsRemain } =
  require("./helpers/factory-rendering.cjs");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const selection = (owner) => ({ type: "machine", id: owner.id, instanceId: owner.instanceId });
const snapshot = (state) => game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
const transforms = (owners) => owners.map(({ id, instanceId, column, row, orientation }) =>
  ({ id, instanceId, column, row, orientation }));

for (const [id, definition] of Object.entries(game.MACHINE_LAYOUT)) {
  if (!definition.movable) continue;
  test(`${id}: actual move, placement, rotation, save and pickup preserve instance ownership`, () => {
    for (const orientation of ORIENTATIONS) {
      const first = machine(game, id, `lifecycle-${id}-first`, 25, 6, orientation);
      const second = machine(game, id, `lifecycle-${id}-second`, 35, 16, orientation);
      let state = freshFactory(game, [second]);
      const unrelated = transforms(state.machines);
      const before = renderFloor(game);
      state.machines.push(first);
      game.__setFactorySelection([selection(first)]);
      game.rotateSelectedBuild("clockwise");
      assert.equal(first.orientation, ORIENTATIONS[(ORIENTATIONS.indexOf(orientation) + 1) % 4]);
      assertOldVisualsRemain(before, renderFloor(game));
      game.rotateSelectedBuild("counterclockwise");
      assert.equal(first.orientation, orientation);
      assert.equal(second.orientation, orientation);

      // All machine belts use the same per-instance lane storage. Moving must
      // retain that ownership even when cargo would prevent ordinary rotation.
      const lane = game.getFactoryConveyors().find(({ conveyor }) =>
        conveyor.internalMachineInstanceId === first.instanceId)?.conveyor;
      if (lane) assert.equal(game.placeItemOnConveyor(lane,
        { kind: "material", material: "clay", quantity: 1, saleValueBase: 7 }), true);
      const secondLane = game.getFactoryConveyors().find(({ conveyor }) =>
        conveyor.internalMachineInstanceId === second.instanceId)?.conveyor;
      if (secondLane) assert.equal(game.placeItemOnConveyor(secondLane,
        { kind: "material", material: "clay", quantity: 2, saleValueBase: 19 }), true);
      const ownedCargo = structuredClone(state.internalConveyorItems);
      game.pickUpSelectedFactoryEntity(selection(first), true);
      assert.equal(state.machines.some(({ instanceId }) => instanceId === first.instanceId), false);
      assert.equal(state.machineInventory[id], 1);
      assert.equal(state.machineInventoryInstances.find(({ instanceId }) => instanceId === first.instanceId).orientation, orientation);
      assert.deepEqual(state.internalConveyorItems, ownedCargo);
      game.placeMachine(id, 31, 6);
      let moved = state.machines.find(({ instanceId }) => instanceId === first.instanceId);
      assert.ok(moved, "placement must restore the original instance rather than create a new ID");
      assert.equal(moved.column, 31);
      assert.equal(moved.orientation, orientation);
      assert.equal(state.machineInventory[id], 0);
      assert.deepEqual(state.internalConveyorItems, ownedCargo);
      assertOldVisualsRemain(before, renderFloor(game));
      state = snapshot(state);
      game.__setState(state);
      moved = state.machines.find(({ instanceId }) => instanceId === first.instanceId);
      assert.ok(moved);
      assert.equal(moved.orientation, orientation);
      assert.equal(moved.mode, first.mode);
      assert.deepEqual(state.internalConveyorItems, ownedCargo);
      assert.equal(new Set(state.machines.map(({ instanceId }) => instanceId)).size, state.machines.length);
      assertOldVisualsRemain(before, renderFloor(game));

      const storedClay = state.stockpile.clay;
      game.pickUpSelectedFactoryEntity(selection(moved));
      assert.equal(state.machines.some(({ instanceId }) => instanceId === first.instanceId), false);
      assert.equal(state.machineInventory[id], 1);
      assert.ok(Object.keys(state.internalConveyorItems).filter((key) => key.startsWith(`${first.instanceId}:`))
        .every((key) => state.internalConveyorItems[key] === null), "pickup must clear the former lane's cargo");
      assert.equal(state.stockpile.clay, storedClay + (lane ? 1 : 0), "pickup must recover material quantity");
      for (const [key, cargo] of Object.entries(ownedCargo).filter(([key]) => key.startsWith(`${second.instanceId}:`))) {
        assert.deepEqual(state.internalConveyorItems[key], cargo, "another instance's cargo must not be recovered or changed");
      }
      assert.deepEqual(transforms(state.machines), unrelated, "other instances must remain unchanged");
      assertOldVisualsRemain(before, renderFloor(game));
    }
  });
}
