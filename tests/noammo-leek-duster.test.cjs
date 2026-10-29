const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { attachKineticWheel } = require('./helpers/noammo-centered.cjs');
const { DATA: D, Factory, cargo, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
const chances = (item, expected) => A.gradeProbabilities(item).forEach((value, i) => near(value, expected[i]));
const mean = item => A.gradeProbabilities(item).reduce((sum, chance, i) => sum + chance * D.grades[i].multiplier, 0);
function place(f, type, x = 40, y = 40, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing); assert.equal(result.error, undefined, result.error); return result.machine;
}
function feed(f, m, item) {
  const p = ports(m).find(p => p.role === 'input' && (!p.channel || p.channel === 'material')); return f.receive(m, item, p.x, p.y, p.direction, true);
}
function setup(facing = 'right', side = 0) {
  const f = new Factory(A.createState(1)), m = place(f, 'leekDuster', 40, 40, facing);
  const p = ports(m).filter(p => p.role === 'kineticInput')[side], v = D.vectors[p.direction];
  const out = ports({ type: 'wheel', x: 0, y: 0, facing }).find(out => out.direction === A.opposite(p.direction));
  const wheel = place(f, 'wheel', p.x + v.x - out.x, p.y + v.y - out.y, facing);
  return { f, m, wheel };
}
function dust(f, m, item) {
  assert.equal(feed(f, m, item), item.quantity);
  for (let i = 0; i < 60; i++) f.update(0.1);
  const result = A.copy(m.lanes[2]); assert.ok(result); delete m.lanes[2]; return result;
}
function fire(f, item, type = 'kiln') {
  const m = place(f, type, 60, 40);
  m.heat = D.machines[type].heatCapacity;
  assert.equal(feed(f, m, item), item.quantity); f.update(0.1);
  assert.ok(m.job); f.update(type === 'kiln' ? 8 : 20);
  return { m, result: A.copy(m.output[0]) };
}

test('Duster exact cost is atomic, consumes three owned belts and grants no stock to old saves', () => {
  const cost = { cash: 1200, materials: { wood: 120, woodenGear: 12, leekFiber: 50, leek: 16 }, machines: { belt: 3 } };
  assert.deepEqual(D.machines.leekDuster.cost, cost); assert.equal(D.machines.leekDuster.crew ?? 0, 0);
  for (const missing of ['cash', ...Object.keys(cost.materials), 'belt']) {
    const f = new Factory(A.createState(1)); f.state.cash = 2400;
    for (const [type, count] of Object.entries(cost.materials)) f.state.inventory[type] = count * 2;
    f.state.stock.belt = 6;
    if (missing === 'cash') f.state.cash -= 0.01;
    else if (missing === 'belt') f.state.stock.belt--; else f.state.inventory[missing]--;
    const before = f.exportSave(); assert.ok(f.buy('leekDuster', 2).error); assert.equal(f.exportSave(), before);
  }
  const f = new Factory(A.createState(1)); f.state.cash = 1200; Object.assign(f.state.inventory, cost.materials); f.state.stock.belt = 3;
  assert.equal(f.buy('leekDuster').amount, 1); assert.equal(f.state.cash, 0); assert.equal(f.state.stock.belt, 0);
  const old = JSON.parse(new Factory(A.createState(1)).exportSave()); delete old.state.leekDusterVersion; delete old.state.stock.leekDuster;
  assert.equal(Factory.importSave(JSON.stringify(old)).state.stock.leekDuster, 0);
});

test('Duster uses both rotated center intakes, needs direct power and has a single upgrade point with six-second transit', () => {
  for (const facing of D.directions) for (const side of [0, 1]) {
    const { f, m, wheel } = setup(facing, side);
    assert.equal(A.cells(m).length, 3); assert.equal(A.conveyorCells(m).length, 3);
    assert.equal(f.kineticHasWheel(m), true); assert.equal(f.powered(40, 40), false);
    const out = ports(m).find(p => p.role === 'output'), v = D.vectors[out.direction];
    const collector = place(f, 'basket', out.x + v.x, out.y + v.y);
    assert.equal(feed(f, m, cargo('clay', 2, 100)), 2);
    for (let i = 0; i < 59; i++) f.update(0.1);
    assert.equal(collector.contents.length, 0); f.update(0.1);
    near(collector.contents[0].value, 165); assert.equal(collector.contents[0].quantity, 2);
    f.pickup(wheel.id); assert.equal(feed(f, m, cargo('clay')), 0); assert.match(f.status(m), /Waiting for kinetic power/);
    place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
    assert.equal(feed(f, m, cargo('clay')), 0, 'area power cannot replace direct power');
  }
});

test('Duster cash and grade effects independently remember every material through processing and stack unions', () => {
  const { f, m } = setup();
  let item = dust(f, m, { ...cargo('clay', 1, 200), upgrades: { primitive: 3 } });
  near(item.value, 200); chances(item, [0, 0.5, 0.45, 0.05, 0, 0]);
  assert.equal(item.materialHistory['leekDuster:clay:cash'], undefined);
  const before = A.gradeProbabilities(item); item.value = 100; item = dust(f, m, item);
  near(item.value, 165); assert.deepEqual(A.gradeProbabilities(item), before);
  const again = dust(f, m, item); near(again.value, 165); assert.deepEqual(again.materialHistory, item.materialHistory);
  const changed = { ...item, material: 'unfiredBrick', value: 10, upgrades: {} };
  const treated = dust(f, m, changed); near(treated.value, 16.5);
  const returned = dust(f, m, { ...treated, material: 'clay', value: 10, upgrades: {} }); near(returned.value, 10);
  const mixed = A.combineCargo([item, cargo('clay', 1, 10)]);
  const actual = A.gradeProbabilities(item), ordinary = D.gradeTables.clay;
  chances(mixed, actual.map((value, i) => (value + ordinary[i]) / 2));
  const mixedAgain = dust(f, m, mixed); near(mixedAgain.value, mixed.value); assert.deepEqual(A.gradeProbabilities(mixedAgain), A.gradeProbabilities(mixed));
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('pre-dusted copper smelts one tier higher, keeps history through molding and does not receive another shift', () => {
  const { f, m } = setup(); const ore = dust(f, m, cargo('nativeCopper', 2, 10));
  chances(ore, [0, 0.5, 0.425, 0.075, 0, 0]);
  const { m: furnace, result } = fire(f, { ...ore, quantity: 4 }, 'primitiveFurnace', 'copper');
  chances(result, [0, 0, 0.5, 0.425, 0.075, 0]); near(mean(result), 2.4125); near(result.value, 66);
  const molder = place(f, 'ingotMolder', 62, 40); f.update(0.1); f.update(1);
  const ingot = molder.output[0]; assert.ok(ingot); chances(ingot, A.gradeProbabilities(result));
  assert.equal(ingot.materialHistory['leekDuster:nativeCopper:grade'], true);
  assert.equal(ingot.value, result.value); assert.equal(furnace.output[0].material, 'moltenCopper');
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Duster treatments survive shaping and Spinner profiles; firing promotes 40% and stops at Remarkable', () => {
  for (const spun of [false, true]) {
    const { f, m } = setup();
    const clay = dust(f, m, { ...cargo('clay', 2, 10), gradeRepairs: { brickSeal: 4 } });
    const shaper = place(f, spun ? 'potSpinner' : 'clayShaper', 50, 40);
    if (spun) attachKineticWheel(f, shaper); else f.setShapingMode(shaper.id, 'pot');
    assert.equal(feed(f, shaper, clay), 2); f.update(0.1); f.update(spun ? 8 : 4);
    const unfired = shaper.output[0]; assert.ok(unfired);
    const { result, m: kiln } = fire(f, { ...unfired, quantity: 2 });
    chances(result, spun ? [0, 0.09, 0.33, 0.39, 0.19, 0] : [0, 0.24, 0.49, 0.25, 0.02, 0]);
    near(mean(result), spun ? 3.08 : 1.76); assert.equal(f.state.random, 1, 'quality treatment never rolls RNG');
    assert.equal(feed(f, kiln, result), 0, 'fired ceramic cannot be fired again');
    const graded = A.gradeStack({ random: 1900 }, result); const random = { random: 99 };
    assert.deepEqual(A.gradeStack(random, graded), graded); assert.equal(random.random, 99);
    assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
  }
});

test('six-grade migration covers old profiles and baked cash, and invalid treatment/history data is rejected', () => {
  const { f, m } = setup();
  m.lanes[0] = { ...cargo('pot', 1, 1234), gradeProfile: [0.2, 0.1, 0.4, 0.25, 0.05], gradeRepairs: { brickSeal: 4 } };
  m.lanes[1] = { ...cargo('pot', 1, 999), graded: true, gradeProfile: [0.2, 0.1, 0.4, 0.25, 0.05] };
  const old = JSON.parse(f.exportSave()); delete old.state.gradeEvolutionVersion;
  const loaded = Factory.importSave(JSON.stringify(old));
  near(mean(loaded.byId.get(m.id).lanes[0]), 2.695); near(loaded.byId.get(m.id).lanes[0].value, 1234);
  const graded = loaded.byId.get(m.id).lanes[1]; near(graded.value, 999); assert.equal(graded.graded, true);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  for (const metadata of [{ gradeTreatment: [[1]] }, { materialHistory: { 'leekDuster:clay:grade': 0.5 } },
    { materialHistory: { 'leekDuster:unknown:cash': true } }, { gradeRepairApplied: 1 },
    { gradeProfile: [0.2, 0.1, 0.4, 0.25, 0.05] }]) {
    const invalid = JSON.parse(loaded.exportSave()); invalid.state.machines.find(machine => machine.id === m.id).lanes[0] = { ...cargo('clay'), ...metadata };
    assert.throws(() => Factory.importSave(JSON.stringify(invalid)), /Invalid cargo/);
  }
});
