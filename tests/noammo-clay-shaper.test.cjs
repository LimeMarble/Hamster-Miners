const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const R = require("../noammo-renderer.js");
const { DATA: D, Factory, createState, cells, ports, cargo } = A;

function place(factory, type, x, y, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined);
  return result.machine;
}
function feed(factory, machine, quantity = 1, value = 0.25, material = "clay", consume = true) {
  const input = ports(machine).find((point) => point.role === "input");
  return factory.receive(machine, cargo(material, quantity, value), input.x, input.y, input.direction, consume);
}
function advance(factory, seconds) {
  while (seconds > 1e-8) { const step = Math.min(30, seconds); factory.update(step); seconds -= step; }
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`); }

test("Clay Shaping Bench costs no Clay, assigns one crew, and never grants itself for free", () => {
  assert.deepEqual(D.machines.clayShaper.cost, { cash: 20, materials: { wood: 50, leekFiber: 5 } });
  const factory = new Factory(createState(1));
  factory.state.cash = 19.99; factory.state.inventory.wood = 50; factory.state.inventory.leekFiber = 5;
  assert.ok(factory.buy("clayShaper").error);
  factory.state.cash = 20; factory.state.inventory.leekFiber = 4;
  assert.ok(factory.buy("clayShaper").error);
  factory.state.inventory.leekFiber = 5;
  assert.equal(factory.buy("clayShaper").amount, 1);
  assert.equal(factory.state.inventory.clay, 0);
  const machine = factory.place("clayShaper", 40, 40).machine;
  assert.equal(machine.mode, "brick"); assert.equal(factory.availableCrew(), 9);
  factory.pickup(machine.id); assert.equal(factory.availableCrew(), 10);
  factory.state.hiredCrew = 0;
  for (let i = 0; i < 10; i++) place(factory, "fiber", 50 + i * 2, 50);
  assert.match(factory.place("clayShaper", 40, 40).error, /hamsters/);
});

for (const facing of D.directions) test(`Clay shaping ${facing}: sparse footprint, shared working cell and real Pit → Bench → Basket routing`, () => {
  const factory = new Factory(createState(1)), bench = place(factory, "clayShaper", 40, 40, facing);
  const expected = [[0, 0], [1, 0], [1, 1]].map(([x, y]) => {
    const point = A.rotatePoint(x, y, 2, 2, facing);
    return { x: 40 + point.x, y: 40 + point.y };
  });
  assert.deepEqual(cells(bench), expected);
  const blank = A.rotatePoint(0, 1, 2, 2, facing);
  blank.x += 40; blank.y += 40;
  assert.equal(factory.at.has(A.key(blank.x, blank.y)), false);
  assert.deepEqual(factory.selectBox(blank, blank), []);
  const [input, output] = ports(bench), v = D.vectors[facing];
  assert.deepEqual([input.x, input.y], [output.x, output.y]);
  assert.equal(input.direction, A.opposite(facing)); assert.equal(output.direction, facing);
  require('./helpers/noammo-centered.cjs').attachPitFeed(factory, input, facing);
  const basket = place(factory, "basket", output.x + v.x, output.y + v.y);
  assert.equal(factory.receive(bench, cargo("clay"), input.x, input.y, facing, true), 0);
  for (const cell of cells(bench).filter((point) => point.x !== input.x || point.y !== input.y)) {
    assert.equal(factory.receive(bench, cargo("clay"), cell.x, cell.y, input.direction, true), 0);
  }
  advance(factory, 55);
  assert.equal(factory.total(basket, "contents"), 4);
  assert.equal(basket.contents[0].material, "unfiredBrick");
  assert.deepEqual(bench.lanes, {}, "no hidden conveyor or kinetic requirement");
  assert.equal(Factory.importSave(factory.exportSave()).byId.get(bench.id).facing, facing);
});

test("Bricks take exactly 2 seconds and retain upgraded Clay value, without reusing cash tags", () => {
  const factory = new Factory(createState(1)), bench = place(factory, "clayShaper", 40, 40);
  const input = ports(bench)[0], item = cargo("clay", 1, 1.05); item.upgrades.primitive = 8;
  assert.equal(factory.receive(bench, item, input.x, input.y, input.direction, true), 1);
  factory.update(0.1); assert.equal(bench.job.remaining, 2);
  factory.update(1.9); assert.equal(bench.output.length, 0);
  factory.update(0.1); assert.equal(bench.job, null);
  assert.deepEqual(bench.output[0], cargo("unfiredBrick", 1, 1.05));
  assert.equal(D.materials.unfiredBrick.value, 0.25);
});

test("Pots combine two consecutive Clay inputs, take 4 seconds and double their summed actual value", () => {
  const factory = new Factory(createState(1)), bench = place(factory, "clayShaper", 40, 40);
  factory.setShapingMode(bench.id, "pot");
  assert.equal(feed(factory, bench, 0.5), 0);
  assert.equal(feed(factory, bench, 1, 1.05), 1);
  factory.update(10); assert.equal(bench.job, null); assert.equal(bench.output.length, 0);
  assert.equal(feed(factory, bench, 1, 2), 1);
  factory.update(0.1); assert.equal(bench.job.remaining, 4);
  factory.update(3.9); assert.equal(bench.output.length, 0);
  factory.update(0.1);
  near(bench.output[0].value, 6.1);
  assert.equal(bench.output[0].quantity, 1); assert.equal(bench.output[0].material, "unfiredPot");
  assert.equal(D.materials.unfiredPot.value, 1); assert.equal(D.materials.unfiredPot.weight, 2);
  assert.equal(feed(factory, bench, 2, 1.05), 2);
  const basket = place(factory, "basket", 42, 41);
  factory.update(0.1); factory.update(4);
  near(basket.contents[1].value, 4.2);
});

test("Bench intake previews are read-only and blocked output cannot drain endless Clay", () => {
  const factory = new Factory(createState(1)), bench = place(factory, "clayShaper", 40, 40);
  factory.setShapingMode(bench.id, "pot");
  const before = factory.exportSave();
  assert.equal(feed(factory, bench, 100, 1.05, "clay", false), 2);
  assert.equal(factory.exportSave(), before);
  assert.equal(feed(factory, bench, 100, 0.1, "wood"), 0);
  assert.equal(feed(factory, bench, 100, 1.05), 2);
  assert.equal(feed(factory, bench), 0);
  factory.update(0.1);
  assert.equal(feed(factory, bench, 100, 0.5), 2);
  advance(factory, 120);
  assert.equal(bench.output.length, 1); assert.equal(bench.output[0].quantity, 1);
  near(bench.output[0].value, 4.2);
  assert.equal(factory.total(bench, "input"), 0); assert.equal(bench.job.remaining, 0);
  assert.equal(feed(factory, bench, 100), 2);
  assert.equal(factory.total(bench, "input"), 2);
  assert.equal(feed(factory, bench, 100), 0);
  const basket = place(factory, "basket", 42, 41);
  factory.update(0.1); assert.equal(bench.job.remaining, 4);
  factory.update(4);
  assert.equal(factory.total(basket, "contents"), 3);
  near(basket.contents[1].value, 2);
});

test("Both modes sustain 0.5 Clay/s without a blocked exit or an extra output cycle", () => {
  for (const mode of ["brick", "pot"]) {
    const factory = new Factory(createState(1)), bench = place(factory, "clayShaper", 40, 40);
    const basket = place(factory, "basket", 42, 41), recipe = D.machines.clayShaper.recipes[mode];
    factory.setShapingMode(bench.id, mode);
    feed(factory, bench, recipe.input); factory.update(0.1);
    for (let cycle = 0; cycle < 10; cycle++) {
      assert.equal(feed(factory, bench, recipe.input), recipe.input);
      factory.update(recipe.seconds);
      assert.equal(factory.total(basket, "contents"), cycle + 1);
      near(bench.job.remaining, recipe.seconds);
    }
  }
});

for (const mode of ['brick', 'pot']) test(`${mode}: a real output conveyor does not add a simulation tick to each shaping cycle`, () => {
  for (const downstreamFirst of [false, true]) {
    const factory = new Factory(createState(1));
    place(factory, 'wheel', 38, 44); place(factory, 'drive', 39, 42, 'down');
    if (downstreamFirst) place(factory, 'belt', 42, 41);
    const bench = place(factory, 'clayShaper', 40, 40);
    if (!downstreamFirst) place(factory, 'belt', 42, 41);
    const basket = place(factory, 'basket', 43, 41), recipe = D.machines.clayShaper.recipes[mode];
    factory.setShapingMode(bench.id, mode); feed(factory, bench, recipe.input); factory.update(0.1);
    for (let cycle = 0; cycle < 15; cycle++) {
      assert.equal(feed(factory, bench, recipe.input), recipe.input);
      factory.update(recipe.seconds);
      assert.equal(factory.total(basket, 'contents'), cycle, 'no cumulative output delay');
      near(bench.job.remaining, recipe.seconds);
    }
    factory.update(2); assert.equal(factory.total(basket, 'contents'), 15);
  }
});

test('Clay arriving from a real conveyor can start shaping on that same tick', () => {
  const factory = new Factory(createState(1));
  place(factory, 'wheel', 38, 44); place(factory, 'drive', 39, 42, 'down');
  const inlet = place(factory, 'belt', 40, 41), bench = place(factory, 'clayShaper', 40, 40);
  assert.equal(factory.receive(inlet, cargo('clay', 2), 40, 41, 'left', true), 2);
  factory.update(2); near(bench.job.remaining, 2); assert.equal(factory.total(bench, 'input'), 1);
});

test('one finished-item buffer overlaps work, remains bounded and survives mode changes, moves, reload and pickup', () => {
  const factory = new Factory(createState(1)), bench = place(factory, 'clayShaper', 40, 40);
  assert.equal(D.machines.clayShaper.outputBuffer, 1);
  feed(factory, bench, 2, 3); factory.update(0.1); factory.update(2);
  assert.equal(bench.output.length, 1); near(bench.output[0].value, 3); near(bench.job.remaining, 2);
  factory.setShapingMode(bench.id, 'pot'); feed(factory, bench, 2, 7);
  advance(factory, 60);
  assert.equal(bench.output.length, 1); near(bench.job.remaining, 0); assert.equal(bench.job.mode, 'brick');
  assert.equal(factory.total(bench, 'input'), 2); assert.equal(feed(factory, bench), 0);
  assert.match(factory.status(bench), /blocked/i);
  const before = A.copy(bench); factory.move(bench.id, 45, 40, 'down');
  const loaded = Factory.importSave(factory.exportSave()), restored = loaded.byId.get(bench.id);
  for (const field of ['job', 'input', 'output', 'mode']) assert.deepEqual(restored[field], before[field]);
  loaded.pickup(restored.id); assert.equal(loaded.state.inventory.clay, 3); assert.equal(loaded.state.inventory.unfiredBrick, 1);
  const replacement = loaded.place('clayShaper', 40, 40).machine;
  assert.equal(replacement.mode, 'pot'); assert.equal(replacement.job, null); assert.equal(replacement.output.length, 0);
  loaded.pickup(replacement.id); assert.equal(loaded.state.inventory.clay, 3);
  const invalid = JSON.parse(factory.exportSave()); invalid.state.machines[0].output.push(cargo('unfiredBrick'));
  assert.throws(() => Factory.importSave(JSON.stringify(invalid)), /Invalid/);
});

test("Bench instances, modes and jobs survive moves and saves; mode changes preserve the running recipe", () => {
  let factory = new Factory(createState(1));
  const first = place(factory, "clayShaper", 40, 40), second = place(factory, "clayShaper", 50, 40);
  factory.setShapingMode(first.id, "pot"); feed(factory, first, 2, 1.05); feed(factory, second, 1, 0.75);
  factory.update(0.1); factory.update(1);
  factory.setShapingMode(first.id, "brick"); factory.setShapingMode(second.id, "pot");
  assert.ok(factory.setShapingMode(first.id, "__proto__").error);
  assert.equal(factory.moveGroup([first.id, second.id], 70, 70, 1).error, undefined);
  factory = Factory.importSave(factory.exportSave());
  const loadedFirst = factory.byId.get(first.id), loadedSecond = factory.byId.get(second.id);
  assert.equal(loadedFirst.mode, "brick"); assert.equal(loadedFirst.job.mode, "pot");
  assert.equal(loadedSecond.mode, "pot"); assert.equal(loadedSecond.job.mode, "brick");
  factory.update(3);
  assert.equal(loadedFirst.output[0].material, "unfiredPot"); near(loadedFirst.output[0].value, 4.2);
  assert.equal(loadedSecond.output[0].material, "unfiredBrick"); near(loadedSecond.output[0].value, 0.75);
  assert.equal(factory.total(loadedFirst, "input"), 0);
});

test("Pickup conserves pending Clay, unfinished job inputs and products exactly once, never contaminating replaced tiles", () => {
  const factory = new Factory(createState(1)), bench = place(factory, "clayShaper", 40, 40);
  factory.setShapingMode(bench.id, "pot"); feed(factory, bench, 2, 1.05); factory.update(0.1); feed(factory, bench, 2);
  assert.equal(factory.pickup(bench.id), true);
  assert.equal(factory.state.inventory.clay, 4); assert.equal(factory.state.inventory.unfiredPot, 0);
  const replacement = factory.place("clayShaper", 40, 40).machine;
  assert.equal(replacement.id, bench.id); assert.equal(replacement.mode, "pot");
  factory.update(10); assert.equal(replacement.output.length, 0);
  feed(factory, replacement, 2); factory.update(0.1); factory.update(4);
  factory.pickup(replacement.id);
  assert.equal(factory.state.inventory.unfiredPot, 1); assert.equal(factory.state.inventory.clay, 4);
  assert.equal(factory.pickup(replacement.id), false);
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.state.inventory.unfiredPot, 1);
});

test("Older saves gain only the new shaping keys; malformed current buffers, recipes and inventory are rejected", () => {
  const factory = new Factory(createState(1)); factory.state.cash = 21;
  const old = JSON.parse(factory.exportSave());
  delete old.state.clayShapingVersion; delete old.state.stock.clayShaper;
  delete old.state.inventory.unfiredBrick; delete old.state.inventory.unfiredPot;
  const loaded = Factory.importSave(JSON.stringify(old));
  assert.equal(loaded.state.cash, 21); assert.equal(loaded.state.stock.clayShaper, 0);
  assert.equal(loaded.state.inventory.unfiredBrick, 0); assert.equal(loaded.state.inventory.unfiredPot, 0);
  const bench = place(factory, "clayShaper", 40, 40);
  for (const mutate of [
    (state) => { delete state.inventory.unfiredPot; },
    (state) => { state.stock.clayShaper = -1; },
    (state) => { state.machines[0].mode = "invalid"; },
    (state) => { state.machines[0].input = [cargo("clay", 3)]; },
    (state) => { state.machines[0].input = [cargo("wood")]; },
    (state) => { state.machines[0].input = [cargo("clay", 0.5)]; },
    (state) => { state.machines[0].output = [cargo("unfiredPot", 2)]; },
    (state) => { state.machines[0].job = { input: cargo("clay", 2), mode: "brick", remaining: 1 }; },
  ]) {
    const bad = JSON.parse(factory.exportSave()); mutate(bad.state);
    assert.throws(() => Factory.importSave(JSON.stringify(bad)), /Invalid/);
  }
  assert.equal(bench.input.length, 0);
});

test("Sparse machine floor, selection, previews and group previews never fill the empty tile in any rotation", () => {
  for (const facing of D.directions) {
    const factory = new Factory(createState(1)), bench = place(factory, "clayShaper", 40, 40, facing);
    const calls = [];
    const context = new Proxy({}, { get: (object, name) => object[name] ?? ((...args) => calls.push([name, ...args])) });
    const camera = { x: 38, y: 38, zoom: 1 }, viewport = { width: 400, height: 400 };
    R.drawFloor(context, factory, camera, viewport);
    const floorBoxes = calls.filter(([name, , , w, h]) => name === "fillRect" && w === 28 && h === 28);
    assert.equal(floorBoxes.length, 0, "the machine is one continuous outline, not three inset boxes");
    calls.length = 0;
    R.drawOverlay(context, factory, camera, viewport, { selected: bench.id, tool: { type: "clayShaper", facing }, hover: { x: 40, y: 40 } });
    assert.equal(calls.filter(([name, , , w, h]) => name === "strokeRect" && w === 62 && h === 62).length, 0);
    assert.equal(calls.filter(([name, , , w, h]) => name === "fillRect" && w === 32 && h === 32).length, 0);
    assert.ok(calls.some(([name]) => name === "closePath"), "selection and preview follow the occupied outline");
  }
});
