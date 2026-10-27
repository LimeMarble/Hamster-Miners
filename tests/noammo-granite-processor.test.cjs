const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { DATA: D, Factory, cargo, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine;
}
function setup(facing = 'right') {
  const f = new Factory(A.createState(1)); place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  return { f, m: place(f, 'graniteProcessor', 40, 40, facing) };
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
  assert.deepEqual(cost, { cash: 105000, materials: { granite: 300 }, machines: { belt: 2 } });
  assert.deepEqual(D.machines.graniteProcessor.cashEffect, { multiplier: 1.3, useLimit: 12, upperLimit: 500, baseValueRequired: 3.5 });
  assert.equal(D.machines.graniteProcessor.crew ?? 0, 0);
  for (const missing of ['cash', 'granite', 'belt']) {
    const f = new Factory(A.createState(1)); f.state.cash = 210000; f.state.inventory.granite = 600; f.state.stock.belt = 4;
    if (missing === 'cash') f.state.cash -= 0.01;
    if (missing === 'granite') f.state.inventory.granite--;
    if (missing === 'belt') f.state.stock.belt--;
    const before = f.exportSave(); assert.ok(f.buy('graniteProcessor', 2).error); assert.equal(f.exportSave(), before);
  }
  const f = new Factory(A.createState(1)); f.state.cash = 210000; f.state.inventory.granite = 600; f.state.stock.belt = 4;
  assert.equal(f.buy('graniteProcessor', 2).amount, 2);
  assert.equal(f.state.cash, 0); assert.equal(f.state.inventory.granite, 0); assert.equal(f.state.stock.belt, 0);
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

test('Twelve uses are shared across instances, with blockage, grade modifiers and other tags preserved', () => {
  const { f, m } = setup(), second = place(f, 'graniteProcessor', 43, 40);
  let item = { ...cargo('pot', 1, 1), graded: true, gradeRepairs: { brickSeal: 4 }, upgrades: { brickSeal: 9, primitiveShack: 1 } };
  for (let i = 0; i < 20; i++) item = pass(f, i % 2 ? second : m, item);
  near(item.value, 1.3 ** 12); assert.equal(item.upgrades.graniteProcessor, 12);
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
  for (const invalid of [13, -1, 0.5, true]) {
    m.lanes[0].upgrades.graniteProcessor = invalid;
    assert.throws(() => Factory.importSave(f.exportSave()), /Invalid cargo/);
  }
});
