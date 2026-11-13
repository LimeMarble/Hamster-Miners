const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const D = A.DATA;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine;
}
function setup(type) {
  const f = new A.Factory(A.createState(1)); f.unlockPlaytest('whereismyspill'); f.setPlaytestCheat('machineBulk', true);
  return { f, m: place(f, type, 80, 40) };
}
function feed(f, m, item, channel) {
  const p = A.ports(m).find(port => port.role === 'input' && (!channel || port.channel === channel));
  return f.receive(m, item, p.x, p.y, p.direction, true);
}
function attachHeavy(f, machine) {
  const intake = A.ports(machine).find(p => p.role === 'kineticInput'), vector = D.vectors[intake.direction], candidates = [];
  for (const facing of D.directions) for (const output of A.ports({ type: 'heavyWheel', x: 0, y: 0, facing })) {
    if (output.role !== 'kineticOutput' || output.direction !== A.opposite(intake.direction)) continue;
    const x = intake.x + vector.x - output.x, y = intake.y + vector.y - output.y;
    if (f.placement('heavyWheel', x, y, facing)) continue;
    const outputs = A.ports({ type: 'heavyWheel', x, y, facing });
    const matches = A.ports(machine).filter(p => p.role === 'kineticInput').filter(p => {
      const v = D.vectors[p.direction]; return outputs.some(o => o.role === 'kineticOutput' && o.x === p.x + v.x && o.y === p.y + v.y && o.direction === A.opposite(p.direction));
    }).length;
    candidates.push({ x, y, facing, matches });
  }
  candidates.sort((a, b) => b.matches - a.matches); assert.ok(candidates.length);
  const p = candidates[0]; return place(f, 'heavyWheel', p.x, p.y, p.facing);
}
function saved(f) { return A.Factory.importSave(f.exportSave()); }

test('bulk applies only to Material machines and ten Fiber recipes complete in one cycle', () => {
  const { f, m } = setup('fiber');
  assert.equal(f.bulkFactor(m), 10); assert.equal(f.bulkFactor({ type: 'gradingBench' }), 1);
  assert.equal(f.bulkFactor({ type: 'burnisher' }), 1); assert.equal(f.bulkFactor({ type: 'clayPit' }), 1);
  assert.equal(feed(f, m, A.cargo('leek', 4, 2)), 4); assert.equal(feed(f, m, A.cargo('leek', 6, 4)), 6);
  f.update(0.1); assert.equal(m.job.bulk, 10); near(m.job.input.value, 3.2);
  f.setPlaytestCheat('machineBulk', false); let loaded = saved(f); loaded.update(2.1);
  const output = loaded.byId.get(m.id).output[0]; assert.equal(output.material, 'leekFiber'); assert.equal(output.quantity, 20); near(output.value, 3.2);
  assert.equal(loaded.state.producedFiber, 20); assert.deepEqual(saved(loaded).state, loaded.state);
});

test('bulk Kiln consumes ten times the heat and material, retaining an in-flight batch after disabling', () => {
  const { f, m } = setup('kiln'); m.heat = 960000;
  assert.equal(feed(f, m, A.cargo('unfiredPot', 20, 3), 'material'), 20);
  f.update(0.1); assert.equal(m.job.bulk, 10); near(m.heat, 0); assert.equal(m.job.inputs[0].quantity, 20);
  f.setPlaytestCheat('machineBulk', false); const loaded = saved(f); loaded.update(12);
  const kiln = loaded.byId.get(m.id); assert.equal(kiln.output[0].material, 'pot'); assert.equal(kiln.output[0].quantity, 20);
  near(kiln.output[0].value, 12); assert.deepEqual(saved(loaded).state, loaded.state);
});

test('bulk Painting Bench uses ten Pots, Pebbles and Water and emits ten painted Pots', () => {
  const { f, m } = setup('paintingBench'); m.water = 1;
  assert.equal(feed(f, m, A.cargo('pot', 10, 5), 'pot'), 10);
  assert.equal(feed(f, m, A.cargo('malachitePebble', 10, 900), 'malachite'), 10);
  f.update(0.1); assert.equal(m.job.bulk, 10); near(m.water, 0); f.setPlaytestCheat('machineBulk', false);
  const loaded = saved(f); loaded.update(6); const output = loaded.byId.get(m.id).output[0];
  assert.equal(output.material, 'paintedPot'); assert.equal(output.quantity, 10); near(output.value, 15);
  assert.deepEqual(saved(loaded).state, loaded.state);
});

test('bulk Ore Crush-Washer consumes sixty rock and ten Water for forty Ore in one cycle', () => {
  const { f, m } = setup('oreCrushWasher'); attachHeavy(f, m); m.water = 10;
  assert.equal(feed(f, m, A.cargo('nativeCopper', 60)), 60); f.update(0.1);
  assert.equal(m.job.bulk, 10); near(m.water, 0); f.setPlaytestCheat('machineBulk', false);
  const loaded = saved(f); loaded.update(8); const output = loaded.byId.get(m.id).output[0];
  assert.equal(output.material, 'copperOre'); assert.equal(output.quantity, 40); near(output.value, 1.5);
  assert.deepEqual(saved(loaded).state, loaded.state);
});

test('bulk Ingot Molder consumes ten liquid units and outputs ten Ingots per cycle', () => {
  const { f, m } = setup('ingotMolder');
  assert.equal(feed(f, m, A.cargo('moltenCopper', 10, 6)), 10); f.update(0.1);
  assert.equal(m.job.bulk, 10); f.setPlaytestCheat('machineBulk', false);
  const loaded = saved(f); loaded.update(1.1); const output = loaded.byId.get(m.id).output[0];
  assert.equal(output.material, 'copperIngot'); assert.equal(output.quantity, 10); near(output.value, 6);
  assert.deepEqual(saved(loaded).state, loaded.state);
});

test('bulk Clay Shaping Bench and Pot Spinner process ten recipes without changing grade rules', () => {
  for (const type of ['clayShaper', 'potSpinner']) {
    const { f, m } = setup(type); if (type === 'potSpinner') attachHeavy(f, m);
    const amount = type === 'potSpinner' ? 20 : 10;
    assert.equal(feed(f, m, A.cargo('clay', amount, 4)), amount); f.update(0.1); assert.equal(m.job.bulk, 10);
    f.setPlaytestCheat('machineBulk', false); const loaded = saved(f); loaded.update(type === 'potSpinner' ? 8 : 2);
    const output = loaded.byId.get(m.id).output[0]; assert.equal(output.quantity, 10);
    assert.equal(output.material, type === 'potSpinner' ? 'unfiredPot' : 'unfiredBrick');
    near(output.value, type === 'potSpinner' ? 16 : 4);
    assert.deepEqual(saved(loaded).state, loaded.state);
  }
});

test('bulk Spool and Extruder scale both input and output, preserving per-item value', () => {
  for (const type of ['windingSpool', 'extruder']) {
    const { f, m } = setup(type); attachHeavy(f, m);
    const input = type === 'extruder' ? A.cargo('moltenCopper', 40, 6) : A.cargo('leekFiber', 10, 2);
    assert.equal(feed(f, m, input), input.quantity); f.update(0.1); assert.equal(m.job.bulk, 10);
    f.setPlaytestCheat('machineBulk', false); const loaded = saved(f); loaded.update(type === 'extruder' ? 8 : 1);
    const output = loaded.byId.get(m.id).output[0]; assert.equal(output.material, type === 'extruder' ? 'copperWire' : 'leekCoil');
    assert.equal(output.quantity, type === 'extruder' ? 200 : 10); near(output.value, type === 'extruder' ? 1.2 : 2);
    assert.deepEqual(saved(loaded).state, loaded.state);
  }
});

test('bulk Preheater consumes ten times the fuel and preserves all treated material', () => {
  const { f, m } = setup('preheater'); m.heat = 60000;
  assert.equal(feed(f, m, A.cargo('unfiredPot', 10), 'material'), 10); f.update(0.1);
  assert.equal(m.job.bulk, 10); near(m.heat, 0); f.setPlaytestCheat('machineBulk', false);
  const loaded = saved(f); loaded.update(3); const output = loaded.byId.get(m.id).output[0];
  assert.equal(output.quantity, 10); assert.equal(output.preheated, true); assert.deepEqual(saved(loaded).state, loaded.state);
});

test('bulk Sawmill processes twenty Wood and keeps sixty Planks safe when both boosts turn off', () => {
  const { f, m } = setup('sawmill'); attachHeavy(f, m); f.setPlaytestCheat('conveyorCapacity', true);
  assert.equal(feed(f, m, A.cargo('wood', 20, 4)), 20); f.update(2.1); assert.equal(m.job.bulk, 10);
  f.setPlaytestCheat('machineBulk', false); f.update(6); assert.equal(m.lanes[1].quantity, 60); near(m.lanes[1].value, 4);
  assert.equal(f.setPlaytestCheat('conveyorCapacity', false).error, undefined);
  assert.equal(m.lanes[1].quantity, 6); assert.equal(m.beltRemainders[1].quantity, 54);
  assert.deepEqual(saved(f).state, f.state);
});

test('bulk Metal Press transforms ten Ingots in one cycle without changing their per-item value multiplier', () => {
  const { f, m } = setup('metalPress'); attachHeavy(f, m); f.setPlaytestCheat('conveyorCapacity', true);
  assert.equal(feed(f, m, A.cargo('copperIngot', 10, 4)), 10); f.update(2.1); assert.equal(m.job.bulk, 10);
  f.setPlaytestCheat('machineBulk', false); f.update(2);
  assert.equal(m.lanes[1].material, 'copperPlate'); assert.equal(m.lanes[1].quantity, 10); near(m.lanes[1].value, 6);
  assert.deepEqual(saved(f).state, f.state);
});

test('turning bulk off retains queued inputs and extra Water while normal batches resume', () => {
  const { f, m } = setup('kiln'); m.heat = 960000;
  assert.equal(feed(f, m, { ...A.cargo('unfiredPot', 2), preheated: true }, 'material'), 2);
  assert.equal(feed(f, m, A.cargo('unfiredPot', 18), 'material'), 18);
  f.setPlaytestCheat('machineBulk', false); f.update(0.1);
  assert.equal(m.job.bulk, undefined); assert.equal(m.job.remaining, 4); assert.equal(f.total(m, 'input'), 18);
  near(m.heat, 912000); assert.deepEqual(saved(f).state, f.state);

  const other = setup('paintingBench'), bench = other.m, well = place(other.f, 'well', 77, 40);
  bench.water = 4.5; assert.equal(other.f.addWaterDelivery(well.id, bench.id, 0).error, undefined);
  other.f.setPlaytestCheat('machineBulk', false); other.f.update(5); near(bench.water, 4.5);
  assert.deepEqual(saved(other.f).state, other.f.state);
});

test('bulk Kiln output splits across normal conveyors and remains saveable while draining', () => {
  const { f, m } = setup('kiln'); m.heat = 960000;
  assert.equal(feed(f, m, A.cargo('unfiredBrick', 40, 2), 'material'), 40); f.update(0.1);
  f.setPlaytestCheat('machineBulk', false); f.update(12); assert.equal(m.output[0].quantity, 40);
  place(f, 'belt', 82, 41); const basket = place(f, 'basket', 83, 41); f.powered = () => true;
  f.update(2.1); assert.equal(f.total(basket, 'contents'), 4); assert.equal(f.total(m, 'output'), 32);
  const loaded = saved(f); loaded.powered = () => true; loaded.update(45);
  assert.equal(loaded.total(loaded.byId.get(basket.id), 'contents'), 40);
  near(loaded.byId.get(basket.id).contents[0].value, 8); assert.deepEqual(saved(loaded).state, loaded.state);
});
