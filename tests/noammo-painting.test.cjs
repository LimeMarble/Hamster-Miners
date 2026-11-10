const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { attachKineticWheel } = require('./helpers/noammo-centered.cjs');

function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function feed(f, machine, material, item = A.cargo(material)) {
  const port = A.ports(machine).find(p => p.channel === (material === 'pot' ? 'pot' : 'malachite'));
  return f.receive(machine, item, port.x, port.y, port.direction, true);
}

test('Sifter modes retain separate Soil and Chert outlet positions and preserve pending output on mode changes', () => {
  const f = new A.Factory(A.createState(1)), sifter = place(f, 'pebbleSifterII', 40, 40);
  attachKineticWheel(f, sifter);
  assert.equal(sifter.mode, 'chert'); f.update(2);
  assert.deepEqual(sifter.output.map(i => [i.material, i.quantity]), [['soil', 0.4], ['chert', 0.2]]);
  assert.equal(f.setSourceMode(sifter.id, 'soil').error, undefined);
  const top = place(f, 'basket', 43, 40), bottom = place(f, 'basket', 43, 41);
  f.update(0.1);
  assert.equal(top.contents[0].material, 'soil'); assert.equal(bottom.contents[0].material, 'chert');
  f.update(2);
  assert.equal(top.contents[0].quantity, 0.8); assert.equal(bottom.contents.find(i => i.material === 'soil').quantity, 0.4);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('Malachite focus rolls exactly once per production cycle and has 20% success', () => {
  for (const [seed, expected] of [[1, false], [2000, true]]) {
    const f = new A.Factory(A.createState(seed)), sifter = place(f, 'pebbleSifterII', 40, 40);
    attachKineticWheel(f, sifter); f.setSourceMode(sifter.id, 'malachite'); f.update(2);
    assert.equal(sifter.output.some(i => i.material === 'malachitePebble'), expected);
    assert.equal(sifter.output[0].material, 'soil');
    const afterRoll = f.state.random; f.update(20);
    assert.equal(f.state.random, afterRoll, 'blocked output must not reroll');
  }
});

test('Painting Bench uses the specified sparse footprint, inputs and one crew in every rotation', () => {
  const cost = { cash: 12000, materials: { wood: 50, granite: 20, leekFiber: 20, malachitePebble: 1 } };
  assert.deepEqual(A.DATA.machines.paintingBench.cost, cost);
  for (const facing of A.DATA.directions) {
    const f = new A.Factory(A.createState(1)), bench = place(f, 'paintingBench', 40, 40, facing);
    assert.equal(A.cells(bench).length, 5); assert.equal(f.availableCrew(), 19);
    const points = A.ports(bench);
    assert.equal(points.filter(p => p.role === 'waterDropoff').length, 1);
    for (const [x, y, direction, role, channel] of [[0, 0, 'left', 'input', 'pot'], [1, 0, 'right', 'output'], [1, 2, 'down', 'input', 'malachite']]) {
      const p = A.rotatePoint(x, y, 2, 3, facing), expected = A.turn(direction, A.DATA.directions.indexOf(facing));
      assert.ok(points.some(point => point.x === 40 + p.x && point.y === 40 + p.y && point.direction === expected && point.role === role && point.channel === channel));
    }
  }
});

test('a scheduled Well supplies Water, painting triples Pot value and ignores Pebble value', () => {
  const f = new A.Factory(A.createState(1)), well = place(f, 'well', 40, 40), bench = place(f, 'paintingBench', 45, 40);
  assert.equal(f.addWaterDelivery(well.id, bench.id, 0).error, undefined);
  assert.equal(f.availableCrew(), 18);
  const pot = A.cargo('pot', 1, 42); pot.upgrades.primitive = 9;
  pot.gradeProfile = [0.2, 0.1, 0, 0.595, 0.105, 0];
  const pebble = A.cargo('malachitePebble', 1, 999); pebble.upgrades.primitive = 4;
  assert.equal(feed(f, bench, 'pot', pot), 1); assert.equal(feed(f, bench, 'malachitePebble', pebble), 1);
  f.update(4.9); assert.equal(bench.job, null); assert.equal(bench.water, 0);
  f.update(0.1); assert.ok(bench.job); assert.equal(bench.water, 0.4);
  f.update(6); assert.equal(bench.output.length, 1);
  const result = bench.output[0];
  assert.equal(result.material, 'paintedPot'); assert.equal(result.value, 126);
  assert.equal(A.DATA.materials.paintedPot.value, 12); assert.deepEqual(result.upgrades, {});
  assert.deepEqual(A.gradeProbabilities(result), pot.gradeProfile);
  assert.ok(Math.abs(bench.water - 0.5) < 1e-8);
});

test('Well schedule survives moves and saves, and pickup releases its worker without duplicating inputs', () => {
  let f = new A.Factory(A.createState(1)), well = place(f, 'well', 40, 40), bench = place(f, 'paintingBench', 45, 40);
  f.addWaterDelivery(well.id, bench.id, 0); feed(f, bench, 'pot'); feed(f, bench, 'malachitePebble');
  f.update(5.1); assert.ok(bench.job); f.update(2);
  assert.equal(f.move(well.id, 55, 40, 'down').error, undefined);
  f = A.Factory.importSave(f.exportSave()); well = f.byId.get(well.id); bench = f.byId.get(bench.id);
  assert.deepEqual(well.waterSchedule, [{ targetId: bench.id, index: 0 }]); assert.equal(f.availableCrew(), 18);
  f.pickup(well.id); assert.equal(f.availableCrew(), 19);
  f.pickup(bench.id); assert.equal(f.state.inventory.pot, 1); assert.equal(f.state.inventory.malachitePebble, 1);
  assert.equal(f.availableCrew(), 20);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('one Well alternates two continuously running Painting Benches', () => {
  const f = new A.Factory(A.createState(1)), well = place(f, 'well', 40, 40);
  const benches = [place(f, 'paintingBench', 37, 40), place(f, 'paintingBench', 44, 40)];
  const baskets = [place(f, 'basket', 39, 40), place(f, 'basket', 46, 40)];
  for (const bench of benches) assert.equal(f.addWaterDelivery(well.id, bench.id, 0).error, undefined);
  assert.equal(f.availableCrew(), 17);
  for (let i = 0; i < 1250; i++) {
    for (const bench of benches) { feed(f, bench, 'pot'); feed(f, bench, 'malachitePebble'); }
    f.update(0.1);
  }
  for (const basket of baskets) assert.ok(f.total(basket, 'contents') >= 19);
});

test('Well schedules reject invalid or duplicate dropoffs and malformed saves', () => {
  const f = new A.Factory(A.createState(1)), well = place(f, 'well', 40, 40), bench = place(f, 'paintingBench', 45, 40);
  assert.ok(f.addWaterDelivery(well.id, bench.id, 2).error);
  assert.equal(f.addWaterDelivery(well.id, bench.id, 0).error, undefined);
  assert.ok(f.addWaterDelivery(well.id, bench.id, 0).error);
  const save = JSON.parse(f.exportSave()), storedWell = save.state.machines.find(m => m.id === well.id);
  storedWell.waterSchedule[0].targetId = 'missing';
  assert.throws(() => A.Factory.importSave(JSON.stringify(save)), /Well schedule/);
});

test('old saves receive no free new machines or materials', () => {
  const f = new A.Factory(A.createState(1)), old = JSON.parse(f.exportSave());
  delete old.state.paintingVersion;
  for (const type of ['well', 'paintingBench']) delete old.state.stock[type];
  for (const type of ['malachitePebble', 'paintedPot']) delete old.state.inventory[type];
  const state = A.Factory.importSave(JSON.stringify(old)).state;
  for (const type of ['well', 'paintingBench']) assert.equal(state.stock[type], 0);
  for (const type of ['malachitePebble', 'paintedPot']) assert.equal(state.inventory[type], 0);
});
