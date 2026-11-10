const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("../noammo-simulation.js");
const { DATA: D, Factory, cargo, ports, cells } = A;

function place(factory, type, x, y, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function setup(api = A) {
  const factory = new api.Factory(api.createState(1));
  place(factory, "wheel", 38, 44);
  const drive = place(factory, "drive", 39, 42, "down"); assert.equal(factory.driveHasWheel(drive), true);
  const seal = place(factory, "brickSeal", 40, 40);
  return { factory, seal };
}
function pass(factory, seal, item) {
  const input = ports(seal)[0];
  assert.equal(factory.receive(seal, item, input.x, input.y, input.direction, true), item.quantity);
  factory.update(D.config.beltSeconds);
  const result = A.copy(seal.lanes[0]);
  delete seal.lanes[0];
  return result;
}
function repeat(factory, seal, item, count) {
  for (let index = 0; index < count; index++) item = pass(factory, seal, item);
  return item;
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`); }
function receive(factory, machine, item) {
  const input = ports(machine).find((point) => point.role === "input"
    && (!point.channel || point.channel === (D.materials[item.material].heat ? "fuel" : "material")));
  return factory.receive(machine, item, input.x, input.y, input.direction, true);
}

test("Brick Seal costs $200 and 35 fired Bricks, needs no crew, and exactly copies Rock Shack's one upper conveyor footprint", () => {
  assert.deepEqual(D.machines.brickSeal.cost, { cash: 200, materials: { brick: 35 }, machines: { belt: 1 } });
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "game-data.js"), "utf8") + "\nglobalThis.layout = MACHINE_LAYOUT.rockShack;", context);
  const layout = context.layout;
  assert.equal(D.machines.brickSeal.width, layout.width); assert.equal(D.machines.brickSeal.height, layout.height);
  assert.equal(layout.internalConveyors.length, 1);
  const factory = new Factory(A.createState(1)); factory.state.cash = 200; factory.state.inventory.brick = 34; factory.state.stock.belt = 1;
  assert.ok(factory.buy("brickSeal").error); assert.equal(factory.state.cash, 200);
  factory.state.inventory.brick = 35; factory.state.cash = 199.99;
  assert.ok(factory.buy("brickSeal").error); assert.equal(factory.state.inventory.brick, 35);
  factory.state.cash = 200;
  factory.state.inventory.brick = 35; assert.equal(factory.buy("brickSeal").amount, 1);
  assert.equal(factory.state.inventory.brick, 0); assert.equal(factory.state.cash, 0);
  const seal = factory.place("brickSeal", 40, 40).machine;
  assert.equal(factory.availableCrew(), 20);
  assert.deepEqual(ports(seal).map((point) => [point.x - 40, point.y - 40]), [[layout.internalConveyors[0].column, layout.internalConveyors[0].row], [0, 0]]);
});

test("Cash uses are shared across Seal instances, capped at five, and preserve quantity", () => {
  const { factory, seal } = setup(), other = place(factory, "brickSeal", 42, 42);
  let item = cargo("brick", 2, 1);
  for (let index = 0; index < 12; index++) item = pass(factory, index % 2 ? other : seal, item);
  near(item.value, 1 + 3.6 * 5); assert.equal(item.upgrades.brickSeal, 5); assert.equal(item.quantity, 2);
  assert.equal(item.gradeRepairs, undefined);
});

test("Brick Seal applies all five uses above the old cash ceiling and preserves spent uses from saves", () => {
  const { factory, seal } = setup();
  const item = repeat(factory, seal, cargo("brick", 1, 100), 12);
  near(item.value, 118); assert.equal(item.upgrades.brickSeal, 5);
  const oldCargo = { ...cargo("brick", 1, 20), upgrades: { brickSeal: 9 } };
  seal.lanes[0] = oldCargo;
  const loaded = Factory.importSave(factory.exportSave());
  assert.deepEqual(loaded.byId.get(seal.id).lanes[0], oldCargo);
  delete loaded.byId.get(seal.id).lanes[0];
  const passed = pass(loaded, loaded.byId.get(seal.id), oldCargo);
  assert.equal(passed.value, 20); assert.equal(passed.upgrades.brickSeal, 9);
});

test("Eligibility uses declared base value, not current value, material family, ore/ingot labels or stack total", () => {
  const { factory, seal } = setup();
  for (const material of ["wood", "leek", "leekFiber", "clay", "unfiredBrick"]) {
    const item = pass(factory, seal, cargo(material, 1, 5));
    assert.equal(item.value, 5); assert.equal(item.upgrades.brickSeal, undefined);
    assert.equal(item.gradeRepairs, undefined);
  }
  const fixture = A.copy(D);
  fixture.materials.testMetal = { name: "Test Metal", value: 0.5, weight: 1, color: "#999" };
  const context = vm.createContext({ NoAmmoData: fixture });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "noammo-simulation.js"), "utf8"), context);
  const { factory: metalFactory, seal: metalSeal } = setup(context.NoAmmo);
  const item = pass(metalFactory, metalSeal, context.NoAmmo.cargo("testMetal", 2, 2));
  near(item.value, 5.6); assert.equal(item.upgrades.brickSeal, 1); assert.equal(item.gradeRepairs, undefined);
});

test("Brick Seal does not add quality repairs, including when legacy repairs are present", () => {
  const { factory, seal } = setup();
  let item = cargo("clay", 1, 100); item.upgrades.brickSeal = 9;
  item.gradeRepairs = { brickSeal: 2 };
  for (let index = 1; index <= 8; index++) {
    item = pass(factory, seal, item);
    assert.equal(item.gradeRepairs.brickSeal, 2);
    assert.equal(item.value, 100); assert.equal(item.upgrades.brickSeal, 9);
  }
});

test("Blocked/unpowered Seals cannot repeatedly upgrade cargo or silently become two-lane machines", () => {
  const { factory, seal } = setup();
  assert.equal(factory.receive(seal, cargo("brick"), 40, 41, "left", true), 0);
  assert.equal(factory.receive(seal, cargo("brick"), 40, 40, "right", true), 0);
  receive(factory, seal, cargo("brick", 1, 1)); factory.update(1);
  near(seal.lanes[0].value, 4.6); assert.equal(seal.lanes[0].gradeRepairs, undefined);
  for (let index = 0; index < 3; index++) factory.update(30);
  near(seal.lanes[0].value, 4.6); assert.equal(seal.lanes[0].gradeRepairs, undefined);
  assert.equal(receive(factory, seal, cargo("brick")), 0);
  const distant = place(factory, "brickSeal", 70, 70);
  assert.equal(receive(factory, distant, cargo("brick")), 0);
});

test("Actual Seal conveyor routes feed a Basket in all orientations, leaving the body inactive", () => {
  for (const facing of D.directions) {
    const { factory } = setup();
    const seal = place(factory, "brickSeal", 42, 40, facing), output = ports(seal)[1], v = D.vectors[facing];
    const basket = place(factory, "basket", output.x + v.x, output.y + v.y);
    receive(factory, seal, cargo("brick", 1, 4.2));
    factory.update(1.9); assert.equal(basket.contents.length, 0);
    factory.update(0.1); assert.equal(factory.total(basket, "contents"), 1);
    near(basket.contents[0].value, 7.8); assert.equal(basket.contents[0].gradeRepairs, undefined);
    assert.equal(cells(seal).length, 2);
    assert.equal(Factory.importSave(factory.exportSave()).byId.get(seal.id).facing, facing);
  }
});

test("Repair follows Clay through shaping and firing, but new material cash tags reset", () => {
  const { factory, seal } = setup();
  const clay = repeat(factory, seal, cargo("clay", 2, 1.05), 4); clay.gradeRepairs = { brickSeal: 4 };
  const bench = place(factory, "clayShaper", 50, 50); factory.setShapingMode(bench.id, "pot");
  receive(factory, bench, clay); factory.update(0.1); factory.update(4);
  const unfired = bench.output[0]; near(unfired.value, 4.2); assert.equal(unfired.gradeRepairs.brickSeal, 4);
  assert.deepEqual(unfired.upgrades, {});
  const sealed = pass(factory, seal, unfired); assert.equal(sealed.upgrades.brickSeal, 1);
  const kiln = place(factory, "kiln", 60, 50);
  receive(factory, kiln, cargo("wood", 4)); receive(factory, kiln, { ...sealed, quantity: 2 });
  factory.update(0.1); factory.update(12);
  const fired = kiln.output[0]; near(fired.value, (4.2 + 3.6) * 4);
  assert.equal(fired.gradeRepairs.brickSeal, 4); assert.deepEqual(fired.upgrades, {});
});

test("Mixed Clay repair levels average per ingredient quantity, including untouched inputs and partly consumed stacks", () => {
  const { factory, seal } = setup(), bench = place(factory, "clayShaper", 50, 50);
  factory.setShapingMode(bench.id, "pot");
  const repaired = repeat(factory, seal, cargo("clay", 1, 9), 4); repaired.gradeRepairs = { brickSeal: 4 };
  receive(factory, bench, repaired); receive(factory, bench, cargo("clay", 1, 0.25));
  factory.update(0.1); factory.update(4);
  assert.equal(bench.output[0].gradeRepairs.brickSeal, 2);
  near(bench.output[0].value, (9 + 0.25) * 2, "repair weights are not cash weights");
  const partial = pass(factory, seal, bench.output[0]);
  assert.equal(partial.gradeRepairs.brickSeal, 2, "new passes do not add repairs");
  const brickBench = place(factory, "clayShaper", 55, 50);
  receive(factory, brickBench, { ...repaired, quantity: 2 }); factory.update(0.1); factory.update(2);
  assert.equal(brickBench.output[0].gradeRepairs.brickSeal, 4);
  assert.equal(brickBench.job.input.quantity, 1); assert.equal(brickBench.job.input.gradeRepairs.brickSeal, 4);
  near(brickBench.job.remaining, 2); assert.equal(factory.total(brickBench, "input"), 0);
});

test("Quantity-blending helper computes 4:1 and 9:1 averages without using cash value or material type count", () => {
  const a = cargo("clay", 4, 1), b = cargo("wood", 1, 1e9); a.gradeRepairs = { brickSeal: 4 };
  let output = A.blendGradeRepairs(cargo("pot"), [a, b]);
  near(output.gradeRepairs.brickSeal, 3.2);
  a.quantity = 9; output = A.blendGradeRepairs(cargo("pot"), [a, b]); near(output.gradeRepairs.brickSeal, 3.6);
  b.gradeRepairs = { brickSeal: 2 }; output = A.blendGradeRepairs(cargo("pot"), [a, b]); near(output.gradeRepairs.brickSeal, 3.8);
  for (const count of [7, 11, 13, 29, 100]) {
    const ingredients = Array.from({ length: count }, () => ({ ...cargo("clay"), gradeRepairs: { brickSeal: 4 } }));
    output = A.blendGradeRepairs(cargo("pot"), ingredients);
    assert.ok(output.gradeRepairs.brickSeal <= 4, "floating-point accumulation cannot break saved repair caps");
  }
});

test("Baskets keep differently repaired cargo separate through save/load", () => {
  const { factory, seal } = setup(), basket = place(factory, "basket", 50, 40);
  const a = cargo("clay"), b = cargo("clay"); a.gradeRepairs = { brickSeal: 4 }; b.gradeRepairs = { brickSeal: 2 };
  factory.receive(basket, a, 50, 40, null, true); factory.receive(basket, b, 50, 40, null, true);
  assert.equal(basket.contents.length, 2, "same cash/material does not imply the same repair history");
  assert.deepEqual(Factory.importSave(factory.exportSave()).byId.get(basket.id).contents, basket.contents);
});

test("Saved/moved mid-pass cargo upgrades once, grade repair survives serialization, and replacement never inherits old cargo", () => {
  let { factory, seal } = setup();
  receive(factory, seal, cargo("brick", 1, 1)); factory.update(1);
  factory.move(seal.id, 42, 42, "down"); factory = Factory.importSave(factory.exportSave()); seal = factory.byId.get(seal.id);
  factory.update(30); assert.equal(seal.lanes[0].upgrades.brickSeal, 1); assert.equal(seal.lanes[0].gradeRepairs, undefined);
  const id = seal.id; factory.pickup(id); assert.equal(factory.state.inventory.brick, 1);
  seal = factory.place("brickSeal", 40, 40).machine;
  assert.equal(seal.id, id); assert.deepEqual(seal.lanes, {});
  factory.update(5); assert.deepEqual(seal.lanes, {});
  const legacy = JSON.parse(factory.exportSave()); delete legacy.state.stock.brickSeal;
  delete legacy.state.brickSealVersion; legacy.state.machines = []; legacy.state.storedMachines = [];
  const loaded = Factory.importSave(JSON.stringify(legacy)); assert.equal(loaded.state.stock.brickSeal, 0);
});

test("Invalid repair data and invalid cash-use tags cannot be imported or accepted as cargo", () => {
  const { factory, seal } = setup();
  for (const gradeRepairs of [null, [], { brickSeal: -1 }, { brickSeal: 4.1 }, { unknown: 2 }]) {
    const item = { ...cargo("brick"), gradeRepairs };
    assert.equal(receive(factory, seal, item), 0);
    seal.lanes[0] = item;
    assert.throws(() => Factory.importSave(factory.exportSave()), /Invalid cargo/);
    delete seal.lanes[0];
  }
  for (const uses of [-1, 1.5, NaN, Infinity, 10]) {
    const item = cargo("brick"); item.upgrades.brickSeal = uses;
    assert.equal(receive(factory, seal, item), 0);
  }
});
