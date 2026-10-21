const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const { DATA: D, Factory, createState } = A;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
function place(factory, type, x = 40, y = 40, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error); return result.machine;
}
function setup(facing = "right", receiver = true) {
  const factory = new Factory(createState(1)), bench = place(factory, "gradingBench", 40, 40, facing);
  const output = A.ports(bench).find((point) => point.role === "output"), v = D.vectors[output.direction];
  const basket = receiver ? place(factory, "basket", output.x + v.x, output.y + v.y) : null;
  return { factory, bench, basket };
}
function feed(factory, bench, item, consume = true) {
  const input = A.ports(bench).find((point) => point.role === "input");
  return factory.receive(bench, item, input.x, input.y, input.direction, consume);
}
function rolled(item, seed) { return A.gradeStack({ random: seed }, item); }

test("Grading Bench costs $1.25k, 100 Wood, 50 Fiber and 10 Chert without a free grant", () => {
  assert.deepEqual(D.machines.gradingBench.cost, { cash: 1250, materials: { wood: 100, leekFiber: 50, chert: 10 } });
  const factory = new Factory(createState(1));
  assert.equal(factory.state.stock.gradingBench, 0);
  const requirements = { wood: 100, leekFiber: 50, chert: 10 };
  for (const missing of ["cash", ...Object.keys(requirements)]) {
    factory.state.cash = 1250; Object.assign(factory.state.inventory, requirements);
    if (missing === "cash") factory.state.cash--; else factory.state.inventory[missing]--;
    const before = factory.exportSave();
    assert.ok(factory.buy("gradingBench").error); assert.equal(factory.exportSave(), before);
  }
  factory.state.cash = 2500; Object.assign(factory.state.inventory, { wood: 200, leekFiber: 100, chert: 20 });
  assert.equal(factory.buy("gradingBench", 2).amount, 2);
  assert.equal(factory.state.stock.gradingBench, 2); assert.equal(factory.state.cash, 0);
  for (const material of Object.keys(requirements)) assert.equal(factory.state.inventory[material], 0);
  factory.place("gradingBench", 40, 40); assert.equal(factory.availableCrew(), 9);
});

test("grade tables, sale multipliers and independent Brick Seal repairs match the agreed chances", () => {
  assert.deepEqual(D.grades.map(({ multiplier }) => multiplier), [0.75, 1.5, 2.5, 8]);
  for (const material of ["clay", "unfiredBrick", "unfiredPot", "brick", "pot"]) {
    const item = A.cargo(material);
    assert.deepEqual(A.gradeProbabilities(item), [0.2, 0.6, 0.2, 0]);
    item.gradeRepairs = { brickSeal: 4 };
    const chances = A.gradeProbabilities(item);
    near(chances[0], 0); near(chances[1], 0.8); near(chances[2], 0.2);
    near(chances.reduce((sum, chance, i) => sum + chance * D.grades[i].multiplier, 0), 1.7);
  }
  assert.deepEqual(A.gradeProbabilities(A.cargo("chert")), [0, 1, 0, 0]);
  for (const material of ["soil", "wood", "leek", "leekFiber"]) assert.equal(A.gradeProbabilities(A.cargo(material)), null);
});

test("one roll grades the entire incoming stack, modifies actual rather than base value, and never rolls Remarkable unaided", () => {
  for (const [seed, multiplier] of [[2000, 0.75], [0, 1.5], [1500, 2.5]]) {
    const input = A.cargo("brick", 5, 7), before = A.copy(input), state = { random: seed };
    const result = A.gradeStack(state, input);
    assert.equal(result.graded, true); assert.equal(A.gradeLabel(result), "Graded");
    assert.equal(Object.hasOwn(result, "grading"), false);
    near(result.value, 7 * multiplier); assert.equal(result.quantity, 5);
    assert.equal(state.random, (Math.imul(1664525, seed) + 1013904223) >>> 0);
    assert.deepEqual(input, before); assert.equal(D.materials.brick.value, 1);
    const random = state.random;
    assert.deepEqual(A.gradeStack(state, result), result); assert.equal(state.random, random);
  }
  const repaired = A.cargo("brick"); repaired.gradeRepairs = { brickSeal: 4 };
  near(rolled(repaired, 2000).value, repaired.value * 1.5);
  for (let seed = 0; seed < 3000; seed += 17) assert.ok(rolled(A.cargo("clay"), seed).value <= 0.25 * 2.5);
});

test("real Clay Pit → Grading Bench → Basket works through the sparse working cell in every rotation", () => {
  for (const facing of D.directions) {
    const { factory, bench, basket } = setup(facing);
    const input = A.ports(bench).find((point) => point.role === "input"), v = D.vectors[input.direction];
    require('./helpers/noammo-centered.cjs').attachPitFeed(factory, input, facing);
    factory.update(17.1);
    near(factory.total(basket, "contents"), 1);
    assert.equal(basket.contents[0].material, "clay"); assert.equal(basket.contents[0].graded, true);
    near(basket.contents[0].value, 0.375);
  }
});

test("grading time scales with total weight, including Pot stacks and fractional Chert; intake is bounded and previews do not roll", () => {
  for (const [item, duration] of [[A.cargo("brick", 3), 3], [A.cargo("pot", 2), 4], [A.cargo("chert", 0.1), 0.1]]) {
    const { factory, bench, basket } = setup();
    const before = factory.exportSave(); assert.equal(feed(factory, bench, item, false), item.quantity);
    assert.equal(factory.exportSave(), before);
    feed(factory, bench, item); factory.update(0.1);
    near(bench.job.remaining, duration);
    factory.update(duration - 0.01); assert.equal(basket.contents.length, 0);
    factory.update(0.01); near(factory.total(basket, "contents"), item.quantity);
  }
  const { factory, bench } = setup("right", false);
  for (const material of ["soil", "wood", "leek", "leekFiber"]) assert.equal(feed(factory, bench, A.cargo(material)), 0);
  assert.equal(feed(factory, bench, A.cargo("pot", 100)), 2);
  assert.equal(feed(factory, bench, A.cargo("pot")), 0);
  factory.update(0.1); assert.equal(feed(factory, bench, A.cargo("brick", 100)), 5);
  factory.update(20); const random = factory.state.random;
  assert.equal(factory.total(bench, "output"), 2); assert.equal(factory.total(bench, "input"), 5);
  factory.update(60); assert.equal(factory.state.random, random, "blocked output never regrades");
});

test("combining stacks sums quantities, averages actual value and repairs, and keeps maximum uses", () => {
  const poor = rolled(A.cargo("clay", 1, 10), 2000), fine = rolled(A.cargo("clay", 3, 10), 1500);
  poor.gradeRepairs = { brickSeal: 0 }; fine.gradeRepairs = { brickSeal: 4 };
  poor.upgrades.brickSeal = 0; fine.upgrades.brickSeal = 9;
  const before = JSON.stringify([poor, fine]), combined = A.combineCargo([poor, fine]);
  assert.equal(combined.quantity, 4); near(combined.value, (7.5 + 25 * 3) / 4);
  near(combined.gradeRepairs.brickSeal, 3); assert.equal(combined.upgrades.brickSeal, 9);
  assert.equal(combined.graded, true); assert.equal(Object.hasOwn(combined, "grading"), false);
  near(combined.value * combined.quantity, poor.value * poor.quantity + fine.value * fine.quantity);
  assert.equal(JSON.stringify([poor, fine]), before);
  const { factory, bench, basket } = setup();
  feed(factory, bench, combined); factory.update(4.1);
  near(basket.contents[0].value, combined.value); assert.equal(factory.state.random, 1);
  assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
  assert.throws(() => A.combineCargo([poor, A.cargo("brick")]), /same material/);
});

test("graded plus ungraded becomes one graded object with averaged cash and no further roll", () => {
  const remarkable = { ...A.cargo("brick", 1, 8), graded: true };
  const combined = A.combineCargo([remarkable, A.cargo("brick", 1, 1)]);
  near(combined.value, 4.5); assert.equal(combined.quantity, 2); assert.equal(combined.graded, true);
  const state = { random: 2000 };
  assert.deepEqual(A.gradeStack(state, combined), combined); assert.equal(state.random, 2000);
  const ungraded = A.combineCargo([A.cargo("brick"), A.cargo("brick", 2)]);
  assert.equal(Boolean(ungraded.graded), false); near(rolled(ungraded, 2000).value, 0.75);
});

test("stack histories take the union and per-upgrader maximum, never the average or sum", () => {
  const a = A.cargo("brick", 1, 1024), b = A.cargo("brick", 1, 1), c = A.cargo("brick", 3, 5);
  a.upgrades = { doubler: 10, onlyA: true, shared: false, brickSeal: 9 };
  b.upgrades = { doubler: 0, onlyB: true, shared: true };
  c.upgrades = { doubler: 4, onlyC: true, shared: false, brickSeal: 7 };
  const before = A.copy([a, b, c]), mixed = A.combineCargo([a, b]);
  near(mixed.value, 512.5); assert.equal(mixed.upgrades.doubler, 10);
  assert.equal(Math.max(0, 10 - mixed.upgrades.doubler), 0, "mixing cannot unlock another x32");
  const combined = A.combineCargo([a, b, c]);
  assert.deepEqual(combined.upgrades, { doubler: 10, onlyA: true, shared: true, brickSeal: 9, onlyB: true, onlyC: true });
  assert.equal(combined.quantity, 5); near(combined.value * 5, 1024 + 1 + 15);
  const nested = A.combineCargo([A.combineCargo([a, b]), c]);
  assert.deepEqual(nested, combined); assert.deepEqual([a, b, c], before);
  const disjoint = ["A", "B", "C"].map((tag) => ({ ...A.cargo("brick"), upgrades: { [tag]: 10 } }));
  assert.deepEqual(A.combineCargo(disjoint).upgrades, { A: 10, B: 10, C: 10 });
});

test("fractional quantities average values and untreated quality modifiers without rounding use counts", () => {
  const a = { ...A.cargo("chert", 0.1, 3), upgrades: { test: 4 } };
  const b = { ...A.cargo("chert", 0.3, 1), upgrades: { test: 1 } };
  const result = A.combineCargo([a, b]);
  near(result.quantity, 0.4); near(result.value, 1.5); assert.equal(result.upgrades.test, 4);
  const repaired = { ...A.cargo("clay", 1), gradeRepairs: { brickSeal: 4 } };
  near(A.combineCargo([repaired, A.cargo("clay", 3)]).gradeRepairs.brickSeal, 1);
});

test("integer-capacity belt splitting copies all stack properties and preserves the fractional remainder", () => {
  const factory = new Factory(createState(1));
  place(factory, "wheel", 20, 20); place(factory, "drive", 21, 22, "up");
  const belt = place(factory, "belt", 23, 24);
  const source = { ...A.cargo("brick", 8.5, 12.75), graded: true,
    upgrades: { brickSeal: 9, primitive: 5, oneOff: true }, gradeRepairs: { brickSeal: 2.5 } };
  const before = A.copy(source);
  const accepted = factory.receive(belt, source, belt.x, belt.y, "left", true);
  assert.equal(accepted, 5); assert.deepEqual(source, before, "receive leaves source accounting to its caller");
  source.quantity -= accepted;
  const first = A.copy(belt.lanes[0]); delete belt.lanes[0];
  assert.equal(factory.receive(belt, source, belt.x, belt.y, "left", true), 3.5);
  const second = belt.lanes[0];
  for (const piece of [first, second]) {
    assert.equal(piece.graded, true); assert.equal(piece.value, before.value);
    assert.deepEqual(piece.upgrades, before.upgrades); assert.deepEqual(piece.gradeRepairs, before.gradeRepairs);
    assert.notEqual(piece.upgrades, source.upgrades); assert.notEqual(piece.gradeRepairs, source.gradeRepairs);
  }
  near(first.quantity * first.value + second.quantity * second.value, before.quantity * before.value);
  const recombined = A.combineCargo([first, second]);
  near(recombined.quantity, before.quantity); near(recombined.value, before.value);
  assert.deepEqual(recombined.upgrades, before.upgrades); assert.equal(recombined.graded, true);
  const loaded = Factory.importSave(factory.exportSave());
  assert.deepEqual(loaded.byId.get(belt.id).lanes[0], second);
});

test("cash upgrades affect averaged actual value without changing the graded flag or refunding maximum uses", () => {
  const factory = new Factory(createState(1));
  place(factory, "wheel", 20, 20); place(factory, "drive", 21, 22, "up");
  const primitive = place(factory, "primitive", 23, 24), seal = place(factory, "brickSeal", 25, 24);
  const mixed = A.combineCargo([rolled(A.cargo("brick", 1, 0.2), 2000), rolled(A.cargo("brick", 1, 0.2), 1500)]);
  const input = A.ports(primitive)[0]; factory.receive(primitive, mixed, input.x, input.y, input.direction, true);
  factory.update(1); const afterPrimitive = primitive.lanes[0];
  near(afterPrimitive.value, mixed.value + 0.1);
  assert.equal(afterPrimitive.graded, true);
  const one = rolled(A.cargo("brick"), 2000), two = rolled(A.cargo("brick"), 2000);
  one.upgrades.brickSeal = 8; two.upgrades.brickSeal = 9;
  const averaged = A.combineCargo([one, two]); assert.equal(averaged.upgrades.brickSeal, 9);
  const intake = A.ports(seal)[0]; factory.receive(seal, averaged, intake.x, intake.y, intake.direction, true);
  factory.update(30); assert.equal(seal.lanes[0].upgrades.brickSeal, 9);
  near(seal.lanes[0].value, 0.75); assert.equal(seal.lanes[0].graded, true);
  assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
});

test("graded Clay retains its averaged quality and value through actual shaping and firing, without another grading bonus", () => {
  const factory = new Factory(createState(1)), shaper = place(factory, "clayShaper"); factory.setShapingMode(shaper.id, "pot");
  const input = A.ports(shaper)[0];
  const poor = rolled(A.cargo("clay", 1, 10), 2000), fine = rolled(A.cargo("clay", 1, 10), 1500);
  factory.receive(shaper, poor, input.x, input.y, input.direction, true);
  factory.receive(shaper, fine, input.x, input.y, input.direction, true);
  factory.update(4.1); near(shaper.output[0].value, (7.5 + 25) * 2);
  assert.equal(shaper.output[0].graded, true); assert.deepEqual(shaper.output[0].upgrades, {});
  const kiln = place(factory, "kiln", 50, 40), intake = A.ports(kiln)[0];
  factory.receive(kiln, A.cargo("wood", 8), intake.x, intake.y, intake.direction, true);
  factory.receive(kiln, { ...A.copy(shaper.output[0]), quantity: 2 }, intake.x, intake.y, intake.direction, true);
  factory.update(8.1); near(kiln.output[0].value, 260); assert.equal(kiln.output[0].graded, true);
  near(rolled(kiln.output[0], 1500).value, 260);
  assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
});

test("grading work, RNG and quality follow independent instances through moves, blocked saves and pickup", () => {
  const { factory, bench } = setup("right", false), other = place(factory, "gradingBench", 46, 40);
  feed(factory, bench, A.cargo("brick", 3, 10)); factory.update(1.1);
  near(bench.job.remaining, 2); assert.equal(other.job, null);
  factory.move(bench.id, 50, 40, "down");
  const loaded = Factory.importSave(factory.exportSave()); loaded.update(2);
  const output = loaded.byId.get(bench.id).output[0], value = output.value, random = loaded.state.random;
  loaded.update(60); near(loaded.byId.get(bench.id).output[0].value, value); assert.equal(loaded.state.random, random);
  loaded.pickup(bench.id); assert.equal(loaded.state.inventory.brick, 3);
  assert.equal(loaded.pickup(bench.id), false);
  const replacement = loaded.place("gradingBench", 40, 40).machine;
  assert.equal(replacement.output.length, 0); assert.equal(replacement.job, null);
  feed(loaded, replacement, A.cargo("clay", 2)); loaded.update(0.5);
  loaded.pickup(replacement.id); assert.equal(loaded.state.inventory.clay, 2);
});

test("hauling resets cash to base but preserves the graded flag; collector contents stay separate until deliberately stacked", () => {
  const { factory, bench, basket } = setup();
  const fine = rolled(A.cargo("brick", 2, 10), 1500);
  factory.receive(basket, fine, basket.x, basket.y, "left", true);
  factory.receive(basket, A.cargo("brick", 1, 25), basket.x, basket.y, "left", true);
  assert.equal(basket.contents.length, 2);
  const route = factory.addRoute(basket.id, bench.id, "brick").route; factory.update(0.1);
  assert.equal(route.item.graded, true); near(route.item.value, D.materials.brick.value);
  assert.deepEqual(rolled(route.item, 1500), route.item);
  assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
});

test("old saves gain only the Bench stock field; invalid grades and oversized grading buffers are rejected", () => {
  const old = JSON.parse(new Factory(createState(1)).exportSave());
  delete old.state.gradingVersion; delete old.state.stock.gradingBench;
  const loaded = Factory.importSave(JSON.stringify(old)); assert.equal(loaded.state.stock.gradingBench, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  for (const metadata of [{ graded: null }, { graded: 1 }, { graded: "Fine" }, { graded: {} },
    { grading: null }, { grading: { shares: [0, 0, 1, 0, 0], values: [0, 0, 1, 0, 0] } }]) {
    const { factory, bench } = setup("right", false), invalid = { ...A.cargo("brick"), ...metadata };
    assert.equal(feed(factory, bench, invalid), 0);
    bench.input.push(invalid); assert.throws(() => Factory.importSave(factory.exportSave()), /Invalid cargo/);
  }
  const { factory, bench } = setup("right", false);
  bench.input.push(A.cargo("brick", 6)); assert.throws(() => Factory.importSave(factory.exportSave()), /Grading Bench/);
});

test("legacy graded portions migrate everywhere without changing cash, quantities, repairs, RNG or running work", () => {
  const factory = new Factory(createState(123));
  const collector = place(factory, "basket", 40, 40), bench = place(factory, "gradingBench", 44, 40);
  const belt = place(factory, "belt", 48, 40), shaper = place(factory, "clayShaper", 50, 40);
  const kiln = place(factory, "kiln", 54, 40), stored = place(factory, "basket", 60, 40);
  factory.pickup(stored.id);
  const legacy = (material, quantity = 1) => ({ ...A.cargo(material, quantity, 7),
    upgrades: { brickSeal: 6.75, primitive: 2.25 }, gradeRepairs: { brickSeal: 2.5 },
    grading: { shares: [0.5, 0, 0, 0.5, 0], values: [2, 0, 0, 5, 0] } });
  collector.contents.push(legacy("brick"));
  bench.input.push(legacy("brick")); bench.job = { input: legacy("brick"), remaining: 0.5 };
  belt.lanes[0] = legacy("brick");
  shaper.input.push(legacy("clay")); shaper.output.push(legacy("unfiredBrick"));
  kiln.job = { recipe: "unfiredBrick", inputs: [legacy("unfiredBrick", 4)], remaining: 5 };
  factory.state.storedMachines.find((machine) => machine.id === stored.id).contents.push(legacy("brick"));
  const route = factory.addRoute(collector.id, bench.id, "brick").route;
  route.item = legacy("brick"); route.phase = "loaded"; route.remaining = 1; route.duration = 1;
  factory.state.gradingVersion = 1;
  const serialized = factory.exportSave(), loaded = Factory.importSave(serialized);
  assert.equal(factory.exportSave(), serialized, "import does not mutate its source");
  assert.equal(loaded.state.gradingVersion, 2); assert.equal(loaded.state.random, 123);
  assert.equal(loaded.byId.get(bench.id).job.remaining, 0.5); assert.equal(loaded.byId.get(kiln.id).job.remaining, 5);
  const migrated = [loaded.byId.get(collector.id).contents[0], loaded.byId.get(bench.id).input[0],
    loaded.byId.get(bench.id).job.input, loaded.byId.get(belt.id).lanes[0], loaded.byId.get(shaper.id).input[0],
    loaded.byId.get(shaper.id).output[0], loaded.byId.get(kiln.id).job.inputs[0],
    loaded.state.storedMachines.find((machine) => machine.id === stored.id).contents[0], loaded.state.routes[0].item];
  for (const item of migrated) {
    assert.equal(item.graded, true); assert.equal(item.grading, undefined); assert.equal(item.value, 7);
    assert.deepEqual(item.upgrades, { brickSeal: 7, primitive: 3 });
    assert.deepEqual(item.gradeRepairs, { brickSeal: 2.5 });
    const state = { random: 123 }; assert.deepEqual(A.gradeStack(state, item), item); assert.equal(state.random, 123);
  }
  assert.equal(migrated[6].quantity, 4);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state, "migration is applied once");
});

test("legacy wholly ungraded cargo stays rollable and corrupt legacy grading is not silently accepted", () => {
  const { factory, bench } = setup("right", false);
  factory.state.gradingVersion = 1;
  bench.input.push({ ...A.cargo("brick"), grading: { shares: [1, 0, 0, 0, 0], values: [1, 0, 0, 0, 0] } });
  const loaded = Factory.importSave(factory.exportSave()), input = loaded.byId.get(bench.id).input[0];
  assert.equal(Boolean(input.graded), false); near(rolled(input, 1500).value, 2.5);
  for (const grading of [null, {}, { shares: [1], values: [1] },
    { shares: [0, 0, 2, 0, 0], values: [0, 0, 1, 0, 0] },
    { shares: [0, 0, 1, 0, 0], values: [0, 0, 99, 0, 0] }]) {
    bench.input[0].grading = grading;
    assert.throws(() => Factory.importSave(factory.exportSave()), /Invalid cargo/);
  }
});

test("Grading Bench has exactly the Clay Shaping Bench's occupied cells and ports in every rotation", () => {
  for (const facing of D.directions) {
    const grader = { type: "gradingBench", x: 40, y: 40, facing };
    const shaper = { ...grader, type: "clayShaper" };
    assert.deepEqual(A.cells(grader), A.cells(shaper));
    assert.deepEqual(A.ports(grader), A.ports(shaper));
    assert.equal(A.cells(grader).length, 3);
  }
});
