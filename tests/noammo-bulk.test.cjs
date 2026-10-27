const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const { Factory, createState, cargo } = A;

function place(factory, type, x, y, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined);
  return result.machine;
}
const positions = (machines) => machines.map(({ id, x, y, facing }) => ({ id, x, y, facing }));

test("box selection intersects real footprints, accepts reversed/single-tile boxes and excludes trees", () => {
  const factory = new Factory(createState(1));
  const fiber = place(factory, "fiber", 40, 40), basket = place(factory, "basket", 43, 42);
  assert.deepEqual(factory.selectBox({ x: 43, y: 42 }, { x: 40, y: 41 }), [fiber.id, basket.id]);
  assert.deepEqual(factory.selectBox({ x: 40, y: 41 }, { x: 40, y: 41 }), [fiber.id]);
  const tree = factory.state.trees[0];
  assert.deepEqual(factory.selectBox(tree, { x: tree.x + 2, y: tree.y + 2 }), []);
});

test("bulk turns rotate complete footprints and facing, with opposite turns exactly reversing", () => {
  const factory = new Factory(createState(1));
  const fiber = place(factory, "fiber", 40, 40), basket = place(factory, "basket", 43, 42);
  const ids = [fiber.id, basket.id], original = positions([fiber, basket]);
  for (const [turns, expected] of [
    [1, [[81, 80, "down"], [80, 83, "down"]]],
    [-1, [[80, 83, "up"], [82, 80, "up"]]],
  ]) {
    const before = factory.exportSave(), plan = factory.groupPlan(ids, 80, 80, turns);
    assert.equal(plan.error, null); assert.equal(factory.exportSave(), before, "preview is read-only");
    assert.deepEqual(plan.machines.map(({ x, y, facing }) => [x, y, facing]), expected);
    assert.equal(factory.moveGroup(ids, 80, 80, turns).error, undefined);
    assert.equal(factory.moveGroup(ids, 40, 40, -turns).error, undefined);
    assert.deepEqual(positions([fiber, basket]), original);
    assert.equal(factory.byId.get(fiber.id), fiber, "instances are retained");
  }
});

test("every ordinary machine supports bulk movement in all facings with contents and identity intact", () => {
  for (const type of Object.keys(A.DATA.machines).filter((type) => type !== "logger")) for (const facing of A.DATA.directions) {
    const factory = new Factory(createState(1));
    const machine = place(factory, type, 40, 40, facing), other = place(factory, "basket", 46, 44);
    if (type === "fiber") machine.output.push(cargo("leekFiber", 2, 0.7));
    if (type === "basket") machine.contents.push(cargo("leek", 3));
    const output = JSON.stringify(machine.output), stock = { ...factory.state.stock };
    assert.equal(factory.moveGroup([machine.id, other.id], 80, 80, 1).error, undefined, `${type}/${facing}`);
    assert.equal(factory.byId.get(machine.id), machine);
    assert.equal(machine.facing, A.turn(facing, 1));
    assert.equal(JSON.stringify(machine.output), output);
    assert.deepEqual(factory.state.stock, stock);
    assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
  }
});

test("invalid bulk placement changes no positions, buffers, Basket contents, cash or inventory", () => {
  const factory = new Factory(createState(1));
  const fiber = place(factory, "fiber", 40, 40), basket = place(factory, "basket", 43, 42);
  place(factory, "basket", 51, 50);
  fiber.output.push(cargo("leekFiber", 2, 0.7)); basket.contents.push(cargo("leek", 3));
  const before = factory.exportSave(), ids = [fiber.id, basket.id];
  const tree = factory.state.trees[0];
  for (const [x, y, turn] of [[50, 50, 1], [249, 249, 0], [tree.x, tree.y, 0]]) {
    assert.ok(factory.moveGroup(ids, x, y, turn).error);
    assert.equal(factory.exportSave(), before);
  }
  assert.ok(factory.moveGroup([...ids, "missing"], 60, 60).error);
  assert.equal(factory.exportSave(), before);
  // Original positions belonging to the group must not block one another.
  assert.equal(factory.moveGroup(ids, 40, 40).error, undefined);
  assert.equal(factory.state.inventory.leek, 3, "successful moves follow the existing Basket collection rule");
});

test("bulk pickup recovers all machine buffers and collector contents exactly once", () => {
  const factory = new Factory(createState(1));
  const fiber = place(factory, "fiber", 40, 40), basket = place(factory, "basket", 43, 42), belt = place(factory, "belt", 45, 42);
  fiber.output.push(cargo("leekFiber", 2, 0.7)); fiber.input.push(cargo("leek"));
  basket.contents.push(cargo("leek", 3)); belt.lanes[0] = cargo("wood", 5);
  factory.update(0.1);
  const ids = [fiber.id, basket.id, belt.id];
  assert.equal(factory.pickupGroup([...ids, fiber.id]).amount, 3);
  assert.equal(factory.state.inventory.leek, 4);
  assert.equal(factory.state.inventory.leekFiber, 2); assert.equal(factory.state.inventory.wood, 5);
  assert.equal(factory.state.machines.length, 0);
  const saved = factory.exportSave(); assert.ok(factory.pickupGroup(ids).error); assert.equal(factory.exportSave(), saved);
  assert.deepEqual(Factory.importSave(saved).state, factory.state);
});

test("bulk movement still respects the Logger's physical tree-edge rule", () => {
  const factory = new Factory(createState(1)), tree = factory.state.trees[0];
  const logger = place(factory, "logger", tree.x, tree.y + 1, "left");
  const saved = factory.exportSave();
  assert.ok(factory.moveGroup([logger.id], 40, 40).error);
  assert.equal(factory.exportSave(), saved);
});
