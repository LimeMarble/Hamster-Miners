const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { DATA: D, Factory, cargo, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
const profile = [0.2, 0.1, 0.4, 0.25, 0.05];
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function feed(f, m, item, consume = true) {
  const p = ports(m).find(p => p.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, consume);
}
function wheelFor(f, m, side = 0) {
  const p = ports(m).filter(p => p.role === 'kineticInput')[side], v = D.vectors[p.direction];
  for (const facing of D.directions) {
    const candidate = { type: 'wheel', x: 0, y: 0, facing };
    for (const out of ports(candidate).filter(out => out.direction === A.opposite(p.direction))) {
      const x = p.x + v.x - out.x, y = p.y + v.y - out.y;
      if (!f.placement('wheel', x, y, facing)) return place(f, 'wheel', x, y, facing);
    }
  }
  assert.fail('No valid Wheel connection');
}
function setup(facing = 'right', side = 0) {
  const f = new Factory(A.createState(1)), m = place(f, 'potSpinner', 40, 40, facing);
  const wheel = wheelFor(f, m, side); return { f, m, wheel };
}
function product(f, m) {
  feed(f, m, cargo('clay', 2)); f.update(0.1); f.update(12);
  return m.output[0];
}

test('Pot Spinner has the approved exact cost, no additional crew, and atomic multi-buy', () => {
  const f = new Factory(A.createState(1)), cost = D.machines.potSpinner.cost;
  assert.deepEqual(cost, { cash: 7500, materials: { wood: 150, brick: 60, granite: 30, leekFiber: 15 } });
  for (const missing of ['cash', ...Object.keys(cost.materials)]) {
    f.state.cash = 22500; Object.assign(f.state.inventory, { wood: 450, brick: 180, granite: 90, leekFiber: 45 });
    if (missing === 'cash') f.state.cash -= 0.01; else f.state.inventory[missing]--;
    const before = f.exportSave(); assert.ok(f.buy('potSpinner', 3).error); assert.equal(f.exportSave(), before);
  }
  f.state.cash = 22500; Object.assign(f.state.inventory, { wood: 450, brick: 180, granite: 90, leekFiber: 45 });
  assert.equal(f.buy('potSpinner', 3).amount, 3); near(f.state.cash, 0);
  for (const material of Object.keys(cost.materials)) near(f.state.inventory[material], 0);
  const m = f.place('potSpinner', 40, 40).machine;
  assert.equal(f.availableCrew(), 10); wheelFor(f, m); assert.equal(f.availableCrew(), 9);
});

for (const facing of D.directions) for (const side of [0, 1]) test(`Spinner ${facing}, kinetic intake ${side}: solid footprint, correct real ports and twelve-second production`, () => {
  const { f, m } = setup(facing, side);
  assert.equal(A.cells(m).length, 6);
  assert.deepEqual(A.size(m), ['right', 'left'].includes(facing) ? { width: 2, height: 3 } : { width: 3, height: 2 });
  const expected = [[0, 1, 'left', 'input'], [1, 1, 'right', 'output'], [0, 0, 'up', 'kineticInput'], [0, 2, 'down', 'kineticInput']]
    .map(([x, y, direction, role]) => {
      const p = A.rotatePoint(x, y, 2, 3, facing);
      return { x: 40 + p.x, y: 40 + p.y, direction: A.turn(direction, D.directions.indexOf(facing)), role };
    });
  assert.deepEqual(ports(m), expected); assert.equal(f.kineticHasWheel(m), true);
  const out = ports(m).find(p => p.role === 'output'), v = D.vectors[out.direction];
  const basket = place(f, 'basket', out.x + v.x, out.y + v.y);
  for (const p of ports(m).filter(p => p.role !== 'input')) assert.equal(f.receive(m, cargo('clay'), p.x, p.y, p.direction, true), 0);
  feed(f, m, cargo('clay', 1, 1.05)); f.update(5); assert.equal(m.job, null);
  feed(f, m, cargo('clay', 1, 2)); f.update(0.1); near(m.job.remaining, 12);
  const random = f.state.random; f.update(11.9); assert.equal(basket.contents.length, 0);
  f.update(0.1); const result = basket.contents[0];
  assert.equal(result.material, 'unfiredPot'); near(result.value, 6.1); assert.equal(result.quantity, 1);
  assert.deepEqual(result.gradeProfile, profile); assert.deepEqual(result.upgrades, {});
  assert.equal(f.state.random, random, 'manufacture does not roll a grade'); assert.equal(result.graded, undefined);
});

test('one Wheel powers two Spinners from opposite edges without blocking their material ports', () => {
  const f = new Factory(A.createState(1)), wheel = place(f, 'wheel', 39, 41);
  const top = place(f, 'potSpinner', 40, 38), bottom = place(f, 'potSpinner', 40, 43);
  for (const m of [top, bottom]) {
    assert.equal(f.kineticHasWheel(m), true);
    const input = ports(m).find(p => p.role === 'input'); assert.equal(f.at.has(A.key(input.x - 1, input.y)), false);
    feed(f, m, cargo('clay', 2));
  }
  f.update(0.1); f.update(12); assert.ok(top.output[0]); assert.ok(bottom.output[0]);
  assert.equal(f.availableCrew(), 9);
  f.pickup(wheel.id); assert.equal(f.kineticHasWheel(top), false); assert.equal(f.kineticHasWheel(bottom), false);
});

test('Drive coverage, short Wheel edges, gaps and wrong-facing connections do not replace a direct kinetic connection', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'potSpinner', 40, 40);
  place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  assert.equal(f.powered(40, 40), true); assert.equal(f.kineticHasWheel(m), false);
  feed(f, m, cargo('clay', 2)); f.update(60); assert.equal(m.job, null); assert.equal(m.output.length, 0);
  assert.match(f.status(m), /kinetic power/);
  const intake = ports(m).find(p => p.role === 'kineticInput');
  const wrong = place(f, 'wheel', intake.x, intake.y - 3, 'down');
  assert.equal(f.kineticHasWheel(m), false); f.pickup(wrong.id);
  const gap = place(f, 'wheel', intake.x, intake.y - 3);
  assert.equal(f.kineticHasWheel(m), false); f.pickup(gap.id);
  wheelFor(f, m); f.update(0.1); near(m.job.remaining, 12);
});

test('power loss pauses work and bounded Clay intake preserves oversized overflow, including behind blocked output', () => {
  const { f, m, wheel } = setup();
  const input = cargo('clay', 100), before = f.exportSave();
  assert.equal(feed(f, m, input, false), 2); assert.equal(f.exportSave(), before);
  assert.equal(feed(f, m, cargo('wood')), 0); assert.equal(feed(f, m, cargo('clay', 0.5)), 0);
  assert.equal(feed(f, m, input), 2); input.quantity -= 2;
  assert.equal(feed(f, m, input), 0); assert.equal(input.quantity, 98);
  f.update(0.1); assert.equal(feed(f, m, input), 2); f.update(5);
  const remaining = m.job.remaining; f.pickup(wheel.id); f.update(60);
  near(m.job.remaining, remaining); assert.equal(m.input[0].quantity, 2); assert.equal(feed(f, m, input), 0);
  wheelFor(f, m); f.update(remaining);
  assert.equal(m.output.length, 1); assert.equal(m.job, null); assert.equal(m.input[0].quantity, 2);
  f.update(60); assert.equal(m.output.length, 1); assert.equal(feed(f, m, input), 0);
  const basket = place(f, 'basket', 42, 41); f.update(0.1);
  assert.equal(basket.contents[0].quantity, 1); near(m.job.remaining, 12);
  f.update(11.9); assert.equal(basket.contents[0].quantity, 1); f.update(0.1); near(basket.contents[0].quantity, 2);
});

test('spun profiles, independent Seal repairs and the Exceptional tier match their agreed probabilities and means', () => {
  const { f, m } = setup(); const pot = product(f, m);
  assert.deepEqual(A.gradeProbabilities(pot), profile);
  const average = item => A.gradeProbabilities(item).reduce((sum, chance, i) => sum + chance * D.grades[i].multiplier, 0);
  near(average(pot), 5.3);
  pot.gradeRepairs = { brickSeal: 4 };
  const chances = A.gradeProbabilities(pot);
  for (const [i, expected] of [0, 0.3, 0.4, 0.25, 0.05].entries()) near(chances[i], expected);
  near(average(pot), 5.45); assert.equal(D.grades[4].name, 'Exceptional'); assert.equal(D.grades[4].multiplier, 40);
  for (const [seed, multiplier] of [[2000, 0.75], [0, 1.5], [500, 2.5], [1500, 8], [1900, 40]]) {
    const input = { ...cargo('pot', 2, 10), gradeProfile: profile }, state = { random: seed };
    const graded = A.gradeStack(state, input); near(graded.value, 10 * multiplier);
    assert.equal(graded.graded, true); assert.equal(graded.quantity, 2);
    const random = state.random; assert.deepEqual(A.gradeStack(state, graded), graded); assert.equal(state.random, random);
  }
});

test('three continuously fed Spinners produce thirty pots in two minutes, matching one Kiln firing cycle per eight seconds', () => {
  const f = new Factory(A.createState(1)), machines = [], baskets = [];
  for (const x of [40, 50, 60]) {
    const m = place(f, 'potSpinner', x, 40); wheelFor(f, m);
    machines.push(m); baskets.push(place(f, 'basket', x + 2, 41));
  }
  for (let tick = 0; tick < 1201; tick++) {
    for (const m of machines) feed(f, m, cargo('clay', 2));
    f.update(0.1);
    if (tick === 119) for (const basket of baskets) near(f.total(basket, 'contents'), 0);
    if (tick === 120) for (const basket of baskets) near(f.total(basket, 'contents'), 1);
  }
  for (const basket of baskets) near(f.total(basket, 'contents'), 10);
  near(baskets.reduce((sum, b) => sum + f.total(b, 'contents'), 0) / 120, 2 / D.machines.kiln.recipes.unfiredPot.seconds);
});

test('Seal treatment before spinning is averaged across the two Clay inputs and survives firing', () => {
  const { f, m } = setup();
  feed(f, m, { ...cargo('clay', 1, 2), gradeRepairs: { brickSeal: 4 }, upgrades: { brickSeal: 9 } });
  feed(f, m, cargo('clay', 1, 3)); f.update(0.1); f.update(12);
  const pot = m.output[0]; near(pot.value, 10); near(pot.gradeRepairs.brickSeal, 2); assert.deepEqual(pot.upgrades, {});
  const kiln = place(f, 'kiln', 50, 40); kiln.heat = 80000;
  const input = ports(kiln).find(p => p.role === 'input');
  f.receive(kiln, pot, input.x, input.y, input.direction, true);
  f.receive(kiln, cargo('unfiredPot', 1, 1), input.x, input.y, input.direction, true);
  f.update(0.1); f.update(8);
  assert.equal(kiln.output[0].material, 'pot'); near(kiln.output[0].value, 40);
  assert.deepEqual(kiln.output[0].gradeProfile, profile); near(kiln.output[0].gradeRepairs.brickSeal, 2);
  assert.equal(kiln.output[1].gradeProfile, undefined, 'ordinary pots do not inherit neighboring spun quality');
});

test('stacked profiles average with ordinary pots; legal portions and saves retain that distribution, and graded mixing cannot reroll', () => {
  const a = { ...cargo('pot', 1, 10), gradeProfile: profile, gradeRepairs: { brickSeal: 4 }, upgrades: { A: 9 } };
  const b = { ...cargo('pot', 3, 2), upgrades: { B: 7 } };
  const mixed = A.combineCargo([a, b]);
  near(mixed.value, 4); assert.deepEqual(mixed.upgrades, { A: 9, B: 7 }); near(mixed.gradeRepairs.brickSeal, 1);
  for (const [i, expected] of [0.2, 0.475, 0.25, 0.0625, 0.0125].entries()) near(mixed.gradeProfile[i], expected);
  const graded = A.combineCargo([{ ...a, graded: true }, b]); assert.equal(graded.graded, true);
  const state = { random: 99 }; A.gradeStack(state, graded); assert.equal(state.random, 99);
  const f = new Factory(A.createState(1)); place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  const belt = place(f, 'belt', 40, 40); assert.equal(f.receive(belt, mixed, 40, 40, 'left', true), 0);
  assert.equal(f.receive(belt, { ...mixed, quantity: 1 }, 40, 40, 'left', true), 1);
  assert.deepEqual(belt.lanes[0].gradeProfile, mixed.gradeProfile); near(belt.lanes[0].value, 4);
  const basket = place(f, 'basket', 43, 40);
  f.receive(basket, a, 43, 40, 'left', true); f.receive(basket, { ...a, gradeProfile: undefined }, 43, 40, 'left', true);
  assert.equal(basket.contents.length, 2, 'different pre-roll profiles are not silently coalesced');
  assert.deepEqual(basket.contents[0].gradeProfile, profile);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('a real Spinner → Kiln → belt → Grading Bench → Basket line grades spun pots without early RNG or extra cash', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'potSpinner', 40, 40);
  place(f, 'wheel', 39, 43); place(f, 'drive', 40, 45, 'up');
  const kiln = place(f, 'kiln', 42, 41); kiln.heat = 240000;
  place(f, 'belt', 44, 42); place(f, 'gradingBench', 44, 41);
  const basket = place(f, 'basket', 46, 42);
  for (let i = 0; i < 450; i++) { feed(f, m, cargo('clay', 2, 2)); f.update(0.1); if (i < 300) assert.equal(f.state.random, 1); }
  near(f.total(basket, 'contents'), 2); near(basket.contents[0].value, 48); near(basket.contents[1].value, 80);
  for (const item of basket.contents) { assert.equal(item.graded, true); assert.deepEqual(item.gradeProfile, profile); }
  assert.equal(f.state.cash, 0); assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('moves and saves preserve per-instance jobs, profiles and timers; pickup recovers material only once', () => {
  const { f, m } = setup(), other = place(f, 'potSpinner', 50, 40);
  feed(f, m, cargo('clay', 2, 2)); f.update(0.1); f.update(3); feed(f, m, cargo('clay'));
  const job = A.copy(m.job); f.move(m.id, 60, 40, 'down');
  assert.deepEqual(m.job, job); assert.equal(other.job, null);
  const restored = Factory.importSave(f.exportSave()), r = restored.byId.get(m.id);
  assert.deepEqual(r, m); restored.update(20); assert.deepEqual(r.job, job, 'moved machine pauses away from Wheel');
  restored.pickup(r.id); near(restored.state.inventory.clay, 3);
  const replaced = restored.place('potSpinner', 70, 40).machine; assert.equal(replaced.id, r.id);
  assert.equal(replaced.job, null); assert.deepEqual(replaced.input, []); assert.deepEqual(replaced.output, []);
  restored.pickup(replaced.id); near(restored.state.inventory.clay, 3);
});

test('Spinner stock migration is one-time and invalid profiles or overfull buffers are rejected', () => {
  const f = new Factory(A.createState(1)), old = JSON.parse(f.exportSave());
  delete old.state.potSpinnerVersion; delete old.state.stock.potSpinner;
  const loaded = Factory.importSave(JSON.stringify(old)); assert.equal(loaded.state.stock.potSpinner, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  const m = place(f, 'potSpinner', 40, 40);
  for (const invalid of [[1], [0.2, 0.1, 0.4, 0.25, 0.5], [0.2, -0.1, 0.6, 0.25, 0.05], 'Fine', null]) {
    m.output = [{ ...cargo('unfiredPot'), gradeProfile: invalid }];
    assert.throws(() => Factory.importSave(f.exportSave()), /Invalid cargo/);
  }
  m.output = []; m.input = [cargo('clay', 3)]; assert.throws(() => Factory.importSave(f.exportSave()), /Pot Spinner/);
  m.input = []; m.mode = 'brick'; assert.throws(() => Factory.importSave(f.exportSave()), /Pot Spinner/);
});
