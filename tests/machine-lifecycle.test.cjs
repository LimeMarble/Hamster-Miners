const assert = require("node:assert/strict");
const test = require("node:test");
const { ORIENTATIONS, machine, drawingScene, drawingGraphics, freshFactory, renderFloor, assertOldVisualsRemain } =
  require("./helpers/factory-rendering.cjs");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const selection = (owner) => ({ type: "machine", id: owner.id, instanceId: owner.instanceId });
const snapshot = (state) => game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
const transforms = (owners) => owners.map(({ id, instanceId, column, row, orientation }) =>
  ({ id, instanceId, column, row, orientation }));

test("all movable buildings keep the live floor and cargo rendering after placement, Move and pickup", () => {
  for (const [id] of Object.entries(game.MACHINE_LAYOUT).filter(([, entry]) => entry.movable)) {
    const variants = id === "hotFluidPipe"
      ? [...Object.keys(game.HOT_FLUID_PIPE_MODES).map((mode) => ({ mode, turnSide: "left" })),
        { mode: "turn", turnSide: "right" }]
      : [{}];
    for (const variant of variants) for (const orientation of ORIENTATIONS) {
      const context = `${id} ${variant.mode ?? "default"} ${variant.turnSide ?? ""} ${orientation}`;
      const first = { ...machine(game, id, `live-${id}`, 25, 6, orientation), ...variant };
      const state = freshFactory(game);
      state.machineInventory[id] = 1;
      state.machineInventoryInstances.push(first);
      const rendering = drawingScene(), overlay = drawingGraphics();
      const marker = state.placedConveyors[0];
      state.placedConveyors.push({ column: marker.column + 1, row: marker.row, direction: "right", item: null });
      marker.item = { kind: "material", material: "clay", quantity: 2, tileProgress: 0 };
      game.__setFactorySceneForTests(rendering.scene, overlay);
      const redraw = (action) => {
        const previous = rendering.floors.length;
        assert.doesNotThrow(action, context);
        assert.equal(rendering.floors.length, previous + 1, `${context}: action must complete a floor redraw`);
        const current = rendering.floors.at(-1);
        assert.equal(current.texture.baked, true);
        assert.equal(current.layer.children[0], current.texture);
        assert.equal(current.layer.destroyed, false);
        marker.item.tileProgress = 0;
        for (let tick = 0; tick < 2; tick++) {
          const previousProgress = marker.item.tileProgress;
          assert.doesNotThrow(() => game.update(0.1), `${context}: the simulation must keep running`);
          const progress = marker.item.tileProgress;
          assert.ok(progress > previousProgress, `${context}: unrelated cargo must keep moving`);
          const clears = overlay.clears;
          assert.doesNotThrow(() => game.renderMachineOverlay(), `${context}: cargo rendering must keep running`);
          assert.equal(overlay.clears, clears + 1);
          assert.ok(overlay.calls.some(({ name, args }) => name === "fillEllipse"
            && args[0] === (marker.column + 0.5 + progress) * 32
            && args[1] === (marker.row + 0.5) * 32), `${context}: unrelated cargo must visibly advance`);
          assert.equal(rendering.floors.length, previous + 1, "cargo redraws must not rebuild the static floor");
        }
      };
      try {
        redraw(() => game.refreshMachineStaticLayer());
        for (const tile of [{ column: 25, row: 6 }, { column: 2, row: 6 }]) {
          game.__setFactoryPreviewForTests(id, orientation, tile);
          assert.doesNotThrow(() => game.renderMachineOverlay(), `${context}: valid and blocked previews must render`);
        }
        redraw(() => game.placeMachine(id, 25, 6));
        assert.ok(state.machines.some(({ instanceId }) => instanceId === first.instanceId));
        if (id === "hotFluidPipe") {
          assert.ok(rendering.graphics.calls.some(({ name, args }) => name === "lineStyle" && args[0] === 18),
            "pipe walls must remain legible at factory zoom levels");
        }
        redraw(() => game.pickUpSelectedFactoryEntity(selection(first), true));
        redraw(() => game.placeMachine(id, 31, 6));
        redraw(() => game.pickUpSelectedFactoryEntity(selection(first)));
        assert.equal(state.machines.some(({ instanceId }) => instanceId === first.instanceId), false);
        // Newly bought machines use a different placement path from stored ones.
        state.machineInventoryInstances = [];
        redraw(() => game.placeMachine(id, 25, 6));
        const purchased = state.machines.find((owner) => owner.id === id && owner.column === 25 && owner.row === 6);
        assert.ok(purchased, `${context}: a fresh purchase must actually be placed`);
        assert.notEqual(purchased.instanceId, first.instanceId);
        redraw(() => game.pickUpSelectedFactoryEntity(selection(purchased)));
      } finally {
        game.__setFactorySceneForTests(null, null);
        game.__setFactoryPreviewForTests(null, "right", null);
      }
    }
  }
});

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
