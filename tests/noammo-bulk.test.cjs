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

test('repeat group placement consumes complete sets, keeps rotated settings and never copies source cargo', () => {
  const f = new Factory(createState(1));
  const first = place(f, 'primitiveStacker', 40, 40), second = place(f, 'primitiveStacker', 42, 40);
  const overflow = place(f, 'manualOverflow', 44, 40); f.setStackSize(first.id, 2); f.setOverflowMode(overflow.id, 'down');
  first.lanes[0] = { ...cargo('wood', 2), progress: 0.4 };
  overflow.job = { input: cargo('clay'), remaining: 1 };
  const stored = place(f, 'manualOverflow', 60, 40); f.pickup(stored.id);
  const ids = [first.id, second.id, overflow.id];
  f.moveGroup(ids, 80, 80, 1);
  f.state.stock.primitiveStacker = 1; f.state.stock.manualOverflow = 2;
  let before = f.exportSave(); assert.equal(f.hasGroupStock(ids), false);
  assert.ok(f.placeGroup(ids, 80, 90).error); assert.equal(f.exportSave(), before);
  f.state.stock.primitiveStacker = 5;
  before = f.exportSave(); assert.ok(f.placeGroup(ids, 80, 80).error); assert.equal(f.exportSave(), before, 'copies cannot ignore the originals as move previews do');
  const originals = JSON.stringify(ids.map(id => f.byId.get(id)));
  const plan = f.groupPlan(ids, 80, 90, 1, true); assert.equal(plan.error, null);
  const copied = f.placeGroup(ids, 80, 90, 1).machines; assert.equal(copied.length, 3);
  assert.deepEqual(copied.map(m => [m.type, m.x, m.y, m.facing, m.mode, m.stackSize]), plan.machines.map(m => [m.type, m.x, m.y, m.facing, m.mode, m.stackSize]));
  assert.equal(copied[2].id, stored.id); assert.equal(copied[2].mode, 'down', 'the copied setting overrides the stored instance setting');
  for (const machine of copied) {
    assert.equal(ids.includes(machine.id), false); assert.deepEqual(machine.lanes, {}); assert.equal(machine.job, null);
  }
  assert.equal(f.hasGroupStock(copied.map(m => m.id)), true);
  const last = f.placeGroup(copied.map(m => m.id), 90, 90, -1).machines;
  assert.equal(last.length, 3); assert.equal(f.state.stock.primitiveStacker, 1); assert.equal(f.hasGroupStock(last.map(m => m.id)), false);
  before = f.exportSave(); assert.ok(f.placeGroup(last.map(m => m.id), 100, 90).error); assert.equal(f.exportSave(), before);
  assert.equal(JSON.stringify(ids.map(id => f.byId.get(id))), originals);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('repeat group placement checks combined crew before placing any member', () => {
  const f = new Factory(createState(1)), a = place(f, 'fiber', 40, 40), b = place(f, 'fiber', 42, 40);
  const extras = [];
  for (let i = 0; i < 7; i++) extras.push(place(f, 'fiber', 44 + 2 * i, 40));
  f.state.stock.fiber = 2; assert.equal(f.availableCrew(), 1);
  const before = f.exportSave(); assert.match(f.placeGroup([a.id, b.id], 80, 80).error, /hamsters/);
  assert.equal(f.exportSave(), before);
  f.pickup(extras[0].id); assert.equal(f.placeGroup([a.id, b.id], 80, 80).machines.length, 2);
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
