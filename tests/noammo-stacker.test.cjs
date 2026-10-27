const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { attachKineticWheel } = require('./helpers/noammo-centered.cjs');
const { Factory, cargo, DATA: D, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error); return result.machine;
}
function setup() {
  const f = new Factory(A.createState(1));
  place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  return f;
}
function feed(f, m, item, side = 0, consume = true) {
  const p = ports(m).filter(p => p.role === 'input')[side];
  return f.receive(m, item, p.x, p.y, p.direction, consume);
}

test('Primitive Stacker has the old 1×1 Splitter footprint, exact cost, zero crew and bounded typed size', () => {
  const f = setup(), d = D.machines.primitiveStacker;
  assert.deepEqual(d.cost, { cash: 3000, materials: { wood: 80, chert: 50, granite: 80 }, machines: { belt: 1 } });
  assert.equal(d.crew ?? 0, 0);
  f.state.cash = 3000; Object.assign(f.state.inventory, d.cost.materials); f.state.stock.belt = 1;
  f.state.inventory.granite--;
  const before = f.exportSave(); assert.ok(f.buy('primitiveStacker').error); assert.equal(f.exportSave(), before);
  f.state.inventory.granite++;
  assert.equal(f.buy('primitiveStacker').amount, 1); assert.equal(f.state.cash, 0);
  const m = f.place('primitiveStacker', 40, 40).machine;
  assert.equal(A.cells(m).length, 1); assert.deepEqual(A.size(m), { width: 1, height: 1 });
  assert.equal(m.stackSize, 1);
  for (const invalid of ['', '1.5', 1.5, 'no', 0, 3, Infinity, null, true, '2e0']) {
    assert.ok(f.setStackSize(m.id, invalid).error); assert.equal(m.stackSize, 1);
  }
  assert.equal(f.setStackSize(m.id, '2').error, undefined); assert.equal(m.stackSize, 2);
});

for (const facing of D.directions) test(`Stacker ${facing}: three inputs, facing output, limited homogeneous buffer`, () => {
  const f = setup(), m = place(f, 'primitiveStacker', 40, 40, facing);
  f.setStackSize(m.id, 2);
  const inputs = ports(m).filter(p => p.role === 'input');
  assert.equal(inputs.length, 3); assert.ok(inputs.every(p => p.direction !== facing));
  assert.equal(ports(m).find(p => p.role === 'output').direction, facing);
  assert.equal(f.receive(m, cargo('clay'), m.x, m.y, facing, true), 0);
  for (let side = 0; side < 3; side++) {
    assert.equal(feed(f, m, cargo('clay'), side), 1);
    assert.equal(feed(f, m, cargo('wood'), side), 0);
    const before = f.exportSave(); assert.equal(feed(f, m, cargo('clay', 5), side, false), 1);
    assert.equal(f.exportSave(), before, 'probes are read-only');
    assert.equal(feed(f, m, cargo('clay', 5), side), 1);
    f.update(20); assert.equal(m.lanes[0].quantity, 2);
    assert.equal(feed(f, m, cargo('clay'), side), 0);
    delete m.lanes[0];
  }
  const unpowered = place(f, 'primitiveStacker', 80, 80, facing);
  assert.equal(feed(f, unpowered, cargo('clay')), 0);
});

test('Stacker averages graded cash and repairs, keeps maximum uses and unions tags without upgrading again', () => {
  const f = setup(), m = place(f, 'primitiveStacker', 40, 40); f.setStackSize(m.id, 2);
  const a = cargo('clay', 1, 8), b = cargo('clay', 1, 2);
  a.graded = true; a.upgrades = { brickSeal: 9, foo: true }; a.gradeRepairs = { brickSeal: 4 };
  b.upgrades = { primitiveShack: 1, foo: false };
  feed(f, m, a); feed(f, m, b);
  const combined = m.lanes[0]; near(combined.value, 5); near(combined.quantity, 2);
  assert.equal(combined.graded, true); assert.equal(combined.gradeRepairs.brickSeal, 2);
  assert.deepEqual(combined.upgrades, { brickSeal: 9, foo: true, primitiveShack: 1 });
  assert.equal(a.quantity, 1); assert.equal(a.value, 8); assert.equal(b.value, 2);
  const basket = place(f, 'basket', 41, 40);
  f.update(1.9); assert.equal(basket.contents.length, 0); f.update(0.1);
  near(basket.contents[0].value * basket.contents[0].quantity, 10);
  assert.deepEqual(basket.contents[0].upgrades, combined.upgrades);
});

test('fractional Sifter cargo accumulates to a whole size without floating-point stalls or losses', () => {
  const f = setup(), m = place(f, 'primitiveStacker', 40, 40); f.setStackSize(m.id, 2);
  const basket = place(f, 'basket', 41, 40);
  for (let i = 0; i < 19; i++) { near(feed(f, m, cargo('chert', 0.1)), 0.1); f.update(2); }
  assert.equal(basket.contents.length, 0); near(m.lanes[0].quantity, 1.9);
  near(feed(f, m, cargo('chert', 0.1)), 0.1); f.update(2);
  near(basket.contents[0].quantity, 2); assert.equal(m.lanes[0], undefined);
});

test('adjacent Stackers use one cargo object and two-second transit per machine, regardless of placement order', () => {
  for (const reverse of [false, true]) {
    const f = setup();
    const machines = (reverse ? [42, 41, 40] : [40, 41, 42]).map(x => place(f, 'primitiveStacker', x, 40));
    const [first, second, third] = [40, 41, 42].map(x => machines.find(m => m.x === x));
    const basket = place(f, 'basket', 43, 40);
    feed(f, first, cargo('clay', 2)); // default size 1 only accepts one
    f.update(2); assert.equal(first.lanes[0], undefined); assert.ok(second.lanes[0]); assert.equal(third.lanes[0], undefined);
    f.update(1.9); assert.equal(third.lanes[0], undefined); f.update(0.1); assert.ok(third.lanes[0]);
    f.update(1.9); assert.equal(basket.contents.length, 0); f.update(0.1); near(basket.contents[0].quantity, 1);
  }
});

test('Stacker outputs at primitive belt cadence without seeing its own moving output or banking blocked bursts', () => {
  const f = setup(), m = place(f, 'primitiveStacker', 40, 40), belt = place(f, 'belt', 41, 40);
  const basket = place(f, 'basket', 42, 40);
  for (let i = 0; i < 10; i++) { assert.equal(feed(f, m, cargo('clay')), 1); f.update(2); }
  near(basket.contents[0].quantity, 9); near(belt.lanes[0].quantity, 1);
  f.pickup(basket.id); f.update(20);
  feed(f, m, cargo('clay')); f.update(20);
  assert.equal(feed(f, m, cargo('clay')), 0);
  place(f, 'basket', 42, 40); f.update(0.1);
  assert.equal(m.lanes[0], undefined); feed(f, m, cargo('clay'));
  f.update(1.8); assert.ok(m.lanes[0]); f.update(0.2); assert.equal(m.lanes[0], undefined);
});

test('occupied Stacker chains maintain belt cadence in either construction order', () => {
  for (const reverse of [false, true]) {
    const f = setup();
    const machines = (reverse ? [42, 41, 40] : [40, 41, 42]).map(x => place(f, 'primitiveStacker', x, 40));
    const first = machines.find(m => m.x === 40), basket = place(f, 'basket', 43, 40);
    for (let i = 0; i < 12; i++) {
      assert.equal(feed(f, first, cargo('clay')), 1); f.update(2);
      if (i >= 2) near(basket.contents[0].quantity, i - 1);
    }
  }
});

test('centered Rock Drill output can merge onto a Stacker in the front-priority position', () => {
  const f = new Factory(A.createState(1)), drill = place(f, 'primitiveRockDrill', 38, 39);
  attachKineticWheel(f, drill); place(f, 'drive', 39, 43, 'up');
  const back = place(f, 'belt', 41, 39, 'down'), m = place(f, 'primitiveStacker', 41, 40);
  const basket = place(f, 'basket', 42, 40); f.setStackSize(m.id, 2);
  f.update(6.9); assert.equal(basket.contents.length, 0); assert.equal(back.lanes[0], undefined);
  f.update(0.1); near(basket.contents[0].quantity, 2); assert.equal(drill.output.length, 0);
  assert.equal(basket.contents[0].material, 'chert');
});

test('settings, partial cargo, progress and metadata survive movement, saves and pickup once', () => {
  const f = setup(), m = place(f, 'primitiveStacker', 40, 40); f.setStackSize(m.id, 2);
  feed(f, m, cargo('brick', 2, 123)); f.update(0.7);
  const old = A.copy(m.lanes[0]); f.move(m.id, 41, 40, 'down');
  assert.deepEqual(m.lanes[0], old);
  const restored = Factory.importSave(f.exportSave()), r = restored.byId.get(m.id);
  assert.deepEqual(r, m);
  restored.setStackSize(r.id, 1); // never delete the extra buffered item
  const basket = place(restored, 'basket', 41, 41);
  restored.update(1.3); near(basket.contents[0].quantity, 1); near(r.lanes[0].quantity, 1);
  restored.update(1.9); near(basket.contents[0].quantity, 1); restored.update(0.1); near(basket.contents[0].quantity, 2);
  feed(restored, r, cargo('chert', 0.1)); restored.pickup(r.id);
  near(restored.state.inventory.chert, 0.1);
  const replaced = restored.place('primitiveStacker', 40, 40).machine;
  assert.equal(replaced.id, r.id); assert.equal(replaced.stackSize, 1); assert.deepEqual(replaced.lanes, {});
  restored.pickup(replaced.id); near(restored.state.inventory.chert, 0.1);
});

test('existing saves gain only zero Stacker stock; malformed sizes and excessive buffers are rejected', () => {
  const f = setup(), payload = JSON.parse(f.exportSave());
  delete payload.state.primitiveStackerVersion; delete payload.state.stock.primitiveStacker;
  const restored = Factory.importSave(JSON.stringify(payload));
  assert.equal(restored.state.stock.primitiveStacker, 0); assert.equal(restored.state.primitiveStackerVersion, 1);
  const m = place(f, 'primitiveStacker', 40, 40); f.setStackSize(m.id, 2); feed(f, m, cargo('clay', 2));
  for (const alter of [p => { p.state.machines.at(-1).stackSize = 3; },
    p => { p.state.machines.at(-1).lanes[0].quantity = 3; },
    p => { p.state.machines.at(-1).lanes['00'] = cargo('wood'); },
    p => { delete p.state.stock.primitiveStacker; }]) {
    const p = JSON.parse(f.exportSave()); alter(p); assert.throws(() => Factory.importSave(JSON.stringify(p)));
  }
});
