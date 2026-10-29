const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { DATA: D, Factory, cargo, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine;
}
function setup(facing = 'right', type = 'graniteProcessor') {
  const f = new Factory(A.createState(1)); place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  return { f, m: place(f, type, 40, 40, facing) };
}
function feed(f, m, item, row = 0, consume = true) {
  const p = ports(m).filter(p => p.role === 'input')[row]; return f.receive(m, item, p.x, p.y, p.direction, consume);
}
function pass(f, m, item) {
  assert.equal(feed(f, m, item), item.quantity); f.update(2);
  const result = A.copy(m.lanes[0]); delete m.lanes[0]; return result;
}

test('Granite Processor exact construction cost, rules and atomic bulk purchases consume owned belts', () => {
  const cost = D.machines.graniteProcessor.cost;
  assert.deepEqual(cost, { cash: 25000, materials: { granite: 160, leekFiber: 80, wood: 20 }, machines: { belt: 2 } });
  assert.deepEqual(D.machines.graniteProcessor.cashEffect, { multiplier: 1.3, useLimit: 6, upperLimit: 500, baseValueRequired: 3.5 });
  assert.equal(D.machines.graniteProcessor.crew ?? 0, 0);
  function funded() {
    const f = new Factory(A.createState(1)); f.state.cash = cost.cash * 2; f.state.stock.belt = 4;
    for (const [material, amount] of Object.entries(cost.materials)) f.state.inventory[material] = amount * 2;
    return f;
  }
  for (const missing of ['cash', ...Object.keys(cost.materials), 'belt']) {
    const f = funded();
    if (missing === 'cash') f.state.cash -= 0.01;
    else if (missing === 'belt') f.state.stock.belt--;
    else f.state.inventory[missing]--;
    const before = f.exportSave(); assert.ok(f.buy('graniteProcessor', 2).error); assert.equal(f.exportSave(), before);
  }
  const f = funded();
  assert.equal(f.buy('graniteProcessor', 2).amount, 2);
  assert.equal(f.state.cash, 0); assert.equal(f.state.stock.belt, 0);
  for (const material of Object.keys(cost.materials)) assert.equal(f.state.inventory[material], 0);
});

for (const facing of D.directions) test(`Granite Processor ${facing}: two independent primitive lanes, kinetic coverage and two-second transit`, () => {
  const { f, m } = setup(facing);
  assert.equal(A.cells(m).length, 2); assert.equal(A.conveyorCells(m).length, 2);
  const outputs = ports(m).filter(p => p.role === 'output'), baskets = outputs.map(p => {
    const v = D.vectors[p.direction]; return place(f, 'basket', p.x + v.x, p.y + v.y);
  });
  assert.equal(feed(f, m, cargo('pot', 1, 100), 0), 1);
  assert.equal(feed(f, m, cargo('pot', 1, 200), 1), 1);
  f.update(1.9); assert.equal(baskets[0].contents.length, 0); f.update(0.1);
  near(baskets[0].contents[0].value, 130); near(baskets[1].contents[0].value, 260);
  assert.equal(baskets[1].contents[0].quantity, 1); assert.equal(f.availableCrew(), 9);
  const distant = place(f, 'graniteProcessor', 70, 70, facing);
  assert.equal(feed(f, distant, cargo('pot')), 0); assert.match(f.status(distant), /kinetic power/);
});

test('Cash eligibility is per unit below $500, without a lower bound or an output clamp', () => {
  const { f, m } = setup();
  for (const [input, output] of [[0.1, 0.13], [300, 390], [499.99, 649.987], [500, 500], [523.23, 523.23], [525, 525], [900, 900]]) {
    const result = pass(f, m, cargo('pot', 1, input));
    near(result.value, output); assert.equal(result.quantity, 1);
    assert.equal(result.upgrades.graniteProcessor, input < 500 ? 1 : undefined);
  }
  for (const material of ['clay', 'brick', 'wood', 'woodenGear', 'nativeCopper']) {
    const result = pass(f, m, cargo(material, Math.floor(D.config.beltWeight / D.materials[material].weight), 100));
    near(result.value, 100); assert.equal(result.upgrades.graniteProcessor, undefined);
  }
});

test('Six uses are shared across instances, with blockage, grade modifiers and other tags preserved', () => {
  const { f, m } = setup(), second = place(f, 'graniteProcessor', 43, 40);
  let item = { ...cargo('pot', 1, 1), graded: true, gradeRepairs: { brickSeal: 4 }, upgrades: { brickSeal: 9, primitiveShack: 1 } };
  for (let i = 0; i < 20; i++) item = pass(f, i % 2 ? second : m, item);
  near(item.value, 1.3 ** 6); assert.equal(item.upgrades.graniteProcessor, 6);
  assert.equal(item.graded, true); assert.equal(item.gradeRepairs.brickSeal, 4); assert.equal(item.upgrades.brickSeal, 9);
  assert.equal(feed(f, m, cargo('pot', 1, 100)), 1); f.update(1);
  const before = A.copy(m.lanes[0]), history = f.recentOutputs(m.id); f.update(60);
  near(m.lanes[0].value, before.value); assert.equal(m.lanes[0].upgrades.graniteProcessor, 1);
  assert.deepEqual(f.recentOutputs(m.id), history);
});

test('Old saves gain zero Processor stock only; running use counts move and save with cargo, malformed counts reject', () => {
  const { f, m } = setup(), old = JSON.parse(f.exportSave());
  old.state.machines = old.state.machines.filter(machine => machine.id !== m.id);
  delete old.state.graniteProcessorVersion; delete old.state.stock.graniteProcessor;
  const migrated = Factory.importSave(JSON.stringify(old)); assert.equal(migrated.state.stock.graniteProcessor, 0);
  assert.deepEqual(Factory.importSave(migrated.exportSave()).state, migrated.state);
  feed(f, m, cargo('pot', 1, 10)); f.update(1); f.move(m.id, 45, 40, 'down');
  const loaded = Factory.importSave(f.exportSave()), restored = loaded.byId.get(m.id);
  near(restored.lanes[0].value, 13); assert.equal(restored.lanes[0].upgrades.graniteProcessor, 1);
  loaded.update(5); near(restored.lanes[0].value, 13);
  for (const invalid of [7, 13, -1, 0.5, true]) {
    m.lanes[0].upgrades.graniteProcessor = invalid;
    assert.throws(() => Factory.importSave(f.exportSave()), /Invalid cargo/);
  }
});

test('Pebble Pile has the specified atomic cost, no crew, and the Brick Seal footprint in every orientation', () => {
  assert.deepEqual(D.machines.pebblePile.cost, { cash: 2000, materials: { chert: 20, leekFiber: 30 }, machines: { belt: 1 } });
  assert.deepEqual(D.machines.pebblePile.cashEffect, { bonus: 4, useLimit: 5, baseValueRequired: 0.5 });
  assert.equal(A.createState(1).stock.pebblePile, 0);
  for (const missing of ['cash', 'chert', 'leekFiber', 'belt', null]) {
    const f = new Factory(A.createState(1)); f.state.cash = 4000; f.state.inventory.chert = 40; f.state.inventory.leekFiber = 60; f.state.stock.belt = 2;
    if (missing === 'cash') f.state.cash -= 0.01;
    else if (missing === 'belt') f.state.stock.belt--;
    else if (missing) f.state.inventory[missing]--;
    const before = f.exportSave(), result = f.buy('pebblePile', 2);
    if (missing) { assert.ok(result.error); assert.equal(f.exportSave(), before); }
    else { assert.equal(result.amount, 2); assert.equal(f.state.cash, 0); assert.equal(f.state.stock.belt, 0); assert.equal(f.state.stock.pebblePile, 2); }
  }
  for (const facing of D.directions) {
    const { f, m } = setup(facing, 'pebblePile'), reference = { ...m, type: 'brickSeal' };
    assert.deepEqual(A.cells(m), A.cells(reference)); assert.deepEqual(A.ports(m), A.ports(reference));
    assert.equal(A.conveyorCells(m).length, 1); assert.equal(f.availableCrew(), 9);
    assert.equal(feed(f, m, cargo('brick', 2, 100)), 2); f.update(1); f.update(20);
    near(m.lanes[0].value, 104); assert.equal(m.lanes[0].quantity, 2); assert.equal(m.lanes[0].upgrades.pebblePile, 1);
  }
});

test('Pebble Pile adds per-unit cash five times across instances, has no cash cap and preserves other cargo properties', () => {
  const { f, m } = setup('right', 'pebblePile'), second = place(f, 'pebblePile', 43, 40);
  let item = { ...cargo('brick', 2, 1000000), graded: true, gradeRepairs: { brickSeal: 4 }, upgrades: { brickSeal: 9, primitiveShack: 1 } };
  for (let i = 0; i < 8; i++) item = pass(f, i % 2 ? second : m, item);
  near(item.value, 1000020); assert.equal(item.quantity, 2); assert.equal(item.upgrades.pebblePile, 5);
  assert.equal(item.graded, true); assert.equal(item.gradeRepairs.brickSeal, 4); assert.equal(item.upgrades.brickSeal, 9);
  for (const material of ['clay', 'unfiredBrick', 'wood', 'chert', 'leekFiber', 'soil']) {
    const result = pass(f, m, cargo(material, 1, 1000000)); near(result.value, 1000000); assert.equal(result.upgrades.pebblePile, undefined);
  }
  const distant = place(f, 'pebblePile', 70, 70); assert.equal(feed(f, distant, cargo('brick')), 0);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('old Processor tags migrate to the six-use limit throughout cargo without changing value or granting Pebble Piles', () => {
  const { f, m } = setup();
  const item = (material, uses, quantity = 1) => ({ ...cargo(material, quantity, uses * 10), upgrades: { graniteProcessor: uses } });
  m.lanes[0] = { ...item('pot', 12), progress: 0.3 }; m.lanes[1] = item('pot', 5);
  m.beltRemainders = { 0: item('pot', 8) };
  const basket = place(f, 'basket', 44, 40); basket.contents.push(item('copperIngot', 9));
  const bench = place(f, 'gradingBench', 46, 40); bench.input.push(item('pot', 10));
  bench.job = { input: item('pot', 11), remaining: 1 };
  const outputBench = place(f, 'gradingBench', 48, 40); outputBench.output.push({ ...item('pot', 7), graded: true });
  const stored = place(f, 'basket', 50, 40); f.pickup(stored.id);
  f.state.storedMachines.find(entry => entry.id === stored.id).contents.push(item('copperIngot', 12));
  const old = JSON.parse(f.exportSave()); old.state.graniteProcessorVersion = 1;
  delete old.state.pebblePileVersion; delete old.state.stock.pebblePile;
  const raw = JSON.stringify(old), loaded = Factory.importSave(raw), processor = loaded.byId.get(m.id);
  assert.equal(JSON.stringify(old), raw); assert.equal(loaded.state.stock.pebblePile, 0); assert.equal(loaded.state.graniteProcessorVersion, 2);
  const migrated = [processor.lanes[0], processor.beltRemainders[0], loaded.byId.get(basket.id).contents[0],
    loaded.byId.get(bench.id).input[0], loaded.byId.get(bench.id).job.input, loaded.byId.get(outputBench.id).output[0],
    loaded.state.storedMachines.find(entry => entry.id === stored.id).contents[0]];
  for (const [index, value] of [120, 80, 90, 100, 110, 70, 120].entries()) {
    assert.equal(migrated[index].upgrades.graniteProcessor, 6); assert.equal(migrated[index].value, value);
  }
  assert.equal(processor.lanes[1].upgrades.graniteProcessor, 5);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  loaded.update(1); assert.equal(processor.lanes[0].value, 120, 'spent eligibility is not refunded');
  const invalid = JSON.parse(raw); invalid.state.machines.find(machine => machine.id === m.id).lanes[0].upgrades.graniteProcessor = 13;
  assert.throws(() => Factory.importSave(JSON.stringify(invalid)), /Invalid/);
});
