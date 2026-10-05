const assert = require("node:assert/strict");
const test = require("node:test");
const { ORIENTATIONS, machine, drawingScene, freshFactory, renderFloor,
  assertOldVisualsRemain, labelsForMachine, assertMachineVisible, assertBeltDrawn } =
  require("./helpers/factory-rendering.cjs");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");

// Iterate the catalogue, not a hand-maintained list. New definitions get the
// same safety checks automatically, including valid and blocked previews.
for (const [id, definition] of Object.entries(game.MACHINE_LAYOUT)) {
  if (!definition.movable) {
    test(`${id}: the fixed display remains visible through complete redraws`, () => {
      const state = freshFactory(game);
      const owner = state.machines.find((entry) => entry.id === id);
      const before = renderFloor(game);
      assert.ok(labelsForMachine(before, owner).length > 0);
      assertOldVisualsRemain(before, renderFloor(game));
    });
    continue;
  }
  test(`${id}: placement preserves the rest of the factory in every orientation`, () => {
    for (const orientation of ORIENTATIONS) {
      const state = freshFactory(game);
      const before = renderFloor(game);
      const first = machine(game, id, `render-${id}-first`, 25, 6, orientation);
      state.machines.push(first);
      if (Object.hasOwn(game.MACHINE_PURCHASES, id)) {
        state.machines.push(machine(game, id, `render-${id}-second`, 35, 16, orientation));
      }
      const after = renderFloor(game);
      assertOldVisualsRemain(before, after);
      for (const owner of state.machines.filter(({ instanceId }) => instanceId.startsWith("render-"))) {
        assertMachineVisible(after, owner);
        // If this type displays a label, repeat purchases need independent
        // labels too. Pipes intentionally use symbols rather than text.
        assert.equal(labelsForMachine(after, owner).length, labelsForMachine(after, first).length);
      }
      for (const valid of [true, false]) {
        const preview = drawingScene();
        const stateBefore = JSON.stringify(state);
        assert.doesNotThrow(() => game.drawMachinePreviewConveyors(preview.graphics, first, valid));
        assert.equal(JSON.stringify(state), stateBefore);
        for (const port of game.getInternalConveyorTiles(first)) assertBeltDrawn(preview.graphics, port);
        for (const port of game.getMachinePorts(first, "materialInputs")) {
          assertBeltDrawn(preview.graphics, port);
          assertBeltDrawn(after.graphics, port);
        }
      }
    }
  });

  test(`${id}: moving and removing an instance preserves unrelated visuals`, () => {
    for (const orientation of ORIENTATIONS) {
      const first = machine(game, id, `redraw-${id}-first`, 25, 6, orientation);
      const second = Object.hasOwn(game.MACHINE_PURCHASES, id)
        ? machine(game, id, `redraw-${id}-second`, 35, 16, orientation) : null;
      const state = freshFactory(game, second ? [second] : []);
      const before = renderFloor(game);
      state.machines.push(first);
      const placed = renderFloor(game);
      const labelCount = labelsForMachine(placed, first).length;
      assertOldVisualsRemain(before, placed);
      first.column = 31;
      first.orientation = ORIENTATIONS[(ORIENTATIONS.indexOf(orientation) + 1) % ORIENTATIONS.length];
      const moved = renderFloor(game);
      assertOldVisualsRemain(before, moved);
      assertMachineVisible(moved, first);
      assert.equal(labelsForMachine(moved, first).length, labelCount);
      assert.equal(labelsForMachine(moved, { ...first, column: 25, orientation }).length, 0,
        "no label should remain on the old footprint");
      state.machines = state.machines.filter((owner) => owner !== first);
      const removed = renderFloor(game);
      assertOldVisualsRemain(before, removed);
      assert.equal(labelsForMachine(removed, first).length, 0, "pickup must remove the instance's labels");
    }
  });
}

test("the complete machine catalogue can share a redraw without throwing", () => {
  // Pack non-overlapping machines beside the reference factory rather than
  // stacking their footprints on top of one another to obtain a smoke test.
  let column = 20, row = 5, rowHeight = 0;
  const owners = [];
  for (const [id, definition] of Object.entries(game.MACHINE_LAYOUT).filter(([, entry]) => entry.movable)) {
    if (column + definition.width > game.FACTORY_COLUMNS) {
      column = 20;
      row += rowHeight + 1;
      rowHeight = 0;
    }
    owners.push(machine(game, id, `catalogue-${id}`, column, row));
    column += definition.width + 1;
    rowHeight = Math.max(rowHeight, definition.height);
  }
  const state = freshFactory(game, owners);
  const occupied = state.machines.flatMap((owner) => game.getMachineOccupiedTiles(owner)
    .map(({ column, row }) => `${column},${row}`));
  assert.equal(new Set(occupied).size, occupied.length, "the smoke factory must not overlap machines");
  renderFloor(game);
});
