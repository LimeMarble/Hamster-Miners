const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { attachKineticWheel } = require('./helpers/noammo-centered.cjs');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') { f.state.stock[type]++; const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine; }
function enabled(f, id) { assert.equal(f.setPlaytestCheat(id, true).error, undefined); }
function feed(f, m, item) { const p = A.ports(m).find(p => p.role === 'input'); return f.receive(m, item, p.x, p.y, p.direction, true); }
function factory() { const f = new A.Factory(A.createState(1)); assert.equal(f.unlockPlaytest('whereismyspill').unlocked, true); return f; }

test('the code unlocks independent off-by-default toggles and old saves migrate safely', () => {
  const f = new A.Factory(A.createState(1)); assert.ok(f.unlockPlaytest('wrong').error);
  assert.ok(f.setPlaytestCheat('resources', true).error); assert.equal(f.unlockPlaytest(' WHEREISMYSPILL ').unlocked, true);
  assert.ok(Object.values(f.state.playtest.toggles).every(value => value === false));
  enabled(f, 'resources'); assert.equal(A.Factory.importSave(f.exportSave()).state.playtest.toggles.resources, true);
  const old = JSON.parse(new A.Factory(A.createState(1)).exportSave()); delete old.state.playtest; delete old.state.playtestVersion;
  const loaded = A.Factory.importSave(JSON.stringify(old)); assert.equal(loaded.state.playtest.unlocked, false);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
  const previous = JSON.parse(f.exportSave()); previous.state.playtestVersion = 1;
  delete previous.state.playtest.toggles.machineBulk; delete previous.state.playtest.used.machineBulk;
  const migrated = A.Factory.importSave(JSON.stringify(previous));
  assert.equal(migrated.state.playtest.toggles.resources, true); assert.equal(migrated.state.playtest.toggles.machineBulk, false);
});

test('resource and machine speed boosts work independently and preserve buffered output after disabling', () => {
  const f = factory(), pit = place(f, 'clayPit', 40, 40);
  attachKineticWheel(f, pit);
  enabled(f, 'resources'); f.update(12); near(pit.output[0].quantity, 30);
  f.setPlaytestCheat('resources', false);
  assert.equal(A.Factory.importSave(f.exportSave()).byId.get(pit.id).output[0].quantity, 30);
  pit.output = []; enabled(f, 'machineSpeed'); f.update(1.2); near(pit.output[0].quantity, 3);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('resource boost applies to each Sifter drop and machine speed accelerates scheduled Well deliveries', () => {
  const f = new A.Factory(A.createState(2000)); f.unlockPlaytest('whereismyspill');
  const sifter = place(f, 'pebbleSifterII', 40, 40); attachKineticWheel(f, sifter);
  f.setSourceMode(sifter.id, 'malachite'); enabled(f, 'resources'); f.update(4);
  assert.deepEqual(sifter.output.map(item => [item.material, item.quantity]), [['chert', 5], ['malachitePebble', 10]]);
  const well = place(f, 'well', 70, 40), bench = place(f, 'paintingBench', 74, 40);
  assert.equal(f.addWaterDelivery(well.id, bench.id, 0).error, undefined);
  enabled(f, 'machineSpeed'); f.update(0.5); near(bench.water, 0.5);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('resource boost scales each multi-output drill batch and survives disabling with pending output', () => {
  const f = factory(); place(f, 'heavyWheel', 77, 40, 'down');
  const drill = place(f, 'limestoneDrill', 80, 40); enabled(f, 'resources'); f.update(25);
  assert.deepEqual(drill.output.map(item => [item.material, item.quantity]), [['limestone', 40], ['zincOre', 10], ['corundum', 5]]);
  f.setPlaytestCheat('resources', false); const loaded = A.Factory.importSave(f.exportSave());
  assert.deepEqual(loaded.byId.get(drill.id).output, drill.output);
});

test('storage boost holds ten times capacity and safely retains excess when disabled', () => {
  const f = factory(), basket = place(f, 'basket', 40, 40); enabled(f, 'storage');
  assert.equal(f.receive(basket, A.cargo('wood', 750), basket.x, basket.y, null, true), 750); assert.equal(f.collectorCapacity(basket), 1000);
  f.setPlaytestCheat('storage', false); assert.equal(f.collectorCapacity(basket), 100);
  assert.equal(f.receive(basket, A.cargo('wood', 1), basket.x, basket.y, null, true), 0);
  const loaded = A.Factory.importSave(f.exportSave()); assert.equal(loaded.collect(basket.id), 750);
});

test('conveyor capacity boost and disabling split an in-flight stack without losing cargo', () => {
  const f = factory(), belt = place(f, 'belt', 40, 40), basket = place(f, 'basket', 41, 40);
  f.powered = () => true; enabled(f, 'conveyorCapacity');
  assert.equal(feed(f, belt, A.cargo('wood', 20, 3)), 20);
  assert.equal(f.setPlaytestCheat('conveyorCapacity', false).error, undefined);
  assert.equal(belt.lanes[0].quantity, 2); assert.equal(belt.beltRemainders[0].quantity, 18);
  let loaded = A.Factory.importSave(f.exportSave()); loaded.powered = () => true; loaded.update(25);
  assert.equal(loaded.total(loaded.byId.get(basket.id), 'contents'), 20); near(loaded.byId.get(basket.id).contents[0].value, 3);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test('conveyor speed and sale boosts are separate and do not change cargo value', () => {
  const f = factory(), belt = place(f, 'belt', 40, 40), basket = place(f, 'basket', 41, 40); f.powered = () => true;
  enabled(f, 'conveyorSpeed'); assert.equal(feed(f, belt, A.cargo('wood', 1, 3)), 1);
  f.update(0.39); assert.equal(basket.contents.length, 0); f.update(0.01); near(basket.contents[0].value, 3);
  enabled(f, 'cash'); const item = A.cargo('copperOre', 2, 7); near(f.sell([item]), 140); near(item.value, 7); near(f.state.cash, 140);
});

test('kiln output remains saveable and drains normally after changing machine speed', () => {
  const f = factory(), kiln = place(f, 'kiln', 40, 40); place(f, 'belt', 42, 41); const basket = place(f, 'basket', 43, 41);
  f.powered = () => true; enabled(f, 'machineSpeed'); kiln.heat = 96000;
  const input = A.ports(kiln).find(p => p.channel === 'material');
  assert.equal(f.receive(kiln, A.cargo('unfiredBrick', 4), input.x, input.y, input.direction, true), 4);
  f.update(1.4); assert.ok(kiln.outputCooldown > 0); assert.ok(kiln.outputCooldown <= 2);
  f.setPlaytestCheat('machineSpeed', false);
  const loaded = A.Factory.importSave(f.exportSave()); loaded.powered = () => true; loaded.update(6);
  assert.equal(loaded.total(loaded.byId.get(basket.id), 'contents'), 4);
});
