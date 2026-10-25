const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const R = require('../noammo-renderer.js');
const { Factory, DATA: D, cargo, ports } = A;
function place(f, type, x = 40, y = 40, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine;
}
function feed(f, m, item, consume = true) {
  const p = ports(m).find(p => p.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, consume);
}
function advance(f, seconds) {
  for (let time = 0; time < seconds - 1e-8; time += 0.1) f.update(Math.min(0.1, seconds - time));
}

test('Gear Bench has a cash-free 25 Wood price, one crew, and no gear/conveyor/power dependency', () => {
  const f = new Factory(A.createState(1)), d = D.machines.crudeGearBench;
  assert.deepEqual(d.cost, { cash: 0, materials: { wood: 25 } });
  f.state.inventory.wood = 24;
  const before = f.exportSave(); assert.ok(f.buy('crudeGearBench').error); assert.equal(f.exportSave(), before);
  f.state.inventory.wood = 25; assert.equal(f.buy('crudeGearBench').amount, 1);
  const m = f.place('crudeGearBench', 40, 40).machine;
  assert.equal(f.availableCrew(), 9); assert.equal(f.state.cash, 0);
  assert.deepEqual(A.conveyorCells(m), []); assert.equal(d.requiresKinetic, undefined);
  f.pickup(m.id); assert.equal(f.availableCrew(), 10);
});

for (const facing of D.directions) test(`Gear Bench ${facing}: two vertical reference cells, shared lower working tile and twelve-second output`, () => {
  const f = new Factory(A.createState(1)), m = place(f, 'crudeGearBench', 40, 40, facing);
  const expected = [[0, 0], [0, 1]].map(([x, y]) => {
    const p = A.rotatePoint(x, y, 1, 2, facing); return { x: 40 + p.x, y: 40 + p.y };
  });
  assert.deepEqual(new Set(A.cells(m).map(p => A.key(p.x, p.y))), new Set(expected.map(p => A.key(p.x, p.y))));
  const [input, output] = ports(m);
  assert.deepEqual({ x: input.x, y: input.y }, expected[1]);
  assert.deepEqual({ x: output.x, y: output.y }, expected[1]);
  assert.equal(input.direction, A.opposite(facing)); assert.equal(output.direction, facing);
  const v = D.vectors[output.direction], basket = place(f, 'basket', output.x + v.x, output.y + v.y);
  assert.equal(f.receive(m, cargo('wood'), expected[0].x, expected[0].y, input.direction, true), 0);
  assert.equal(f.receive(m, cargo('wood'), output.x, output.y, output.direction, true), 0);
  feed(f, m, cargo('wood', 1, 0.1)); f.update(10); assert.equal(m.job, null);
  feed(f, m, cargo('wood', 1, 0.3)); f.update(0.1); assert.equal(m.job.remaining, 12);
  f.update(11.9); assert.equal(basket.contents.length, 0); f.update(0.1);
  assert.equal(basket.contents[0].material, 'woodenGear');
  assert.equal(basket.contents[0].quantity, 1); assert.equal(basket.contents[0].value, 0.4);
  assert.equal(D.materials.woodenGear.weight, 2 * D.materials.wood.weight);
  assert.equal(D.materials.woodenGear.value, 2 * D.materials.wood.value);
});

test('Gear intake is bounded to two waiting Wood, rejects fractions/materials and probes without mutation', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'crudeGearBench');
  const before = f.exportSave(); assert.equal(feed(f, m, cargo('wood', 100), false), 2); assert.equal(f.exportSave(), before);
  for (const item of [cargo('clay'), cargo('woodenGear'), cargo('wood', 0.5)]) assert.equal(feed(f, m, item), 0);
  assert.equal(feed(f, m, cargo('wood', 100)), 2); assert.equal(feed(f, m, cargo('wood')), 0);
  f.update(0.1); assert.equal(feed(f, m, cargo('wood', 100)), 2);
  advance(f, 60); assert.equal(m.output.length, 1); assert.equal(f.total(m, 'input'), 2); assert.equal(m.job, null);
  assert.equal(feed(f, m, cargo('wood', 100)), 0);
  const basket = place(f, 'basket', 41, 41); f.update(0.1);
  assert.equal(f.total(basket, 'contents'), 1); assert.equal(m.job.remaining, 12);
  f.update(12); assert.equal(f.total(basket, 'contents'), 2);
});

test('Gear Bench sustains five gears per minute without powered belts', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'crudeGearBench'), basket = place(f, 'basket', 41, 41);
  feed(f, m, cargo('wood', 2)); f.update(0.1);
  for (let tick = 0; tick < 600; tick++) { feed(f, m, cargo('wood', 2)); f.update(0.1); }
  assert.equal(f.total(basket, 'contents'), 5);
});

test('Independent Gear Bench jobs follow moves/saves, recover once on pickup, and never leak into replacements', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'crudeGearBench'), second = place(f, 'crudeGearBench', 50, 40);
  feed(f, m, cargo('wood', 2, 1)); feed(f, second, cargo('wood', 2, 2)); f.update(0.1); f.update(3);
  feed(f, m, cargo('wood', 2)); assert.equal(f.move(m.id, 60, 40, 'up').error, undefined);
  const loaded = Factory.importSave(f.exportSave()); loaded.update(9);
  assert.equal(loaded.byId.get(m.id).output[0].value, 2); assert.equal(loaded.byId.get(second.id).output[0].value, 4);
  loaded.pickup(m.id); assert.equal(loaded.state.inventory.woodenGear, 1); assert.equal(loaded.state.inventory.wood, 2);
  loaded.pickup(m.id); assert.equal(loaded.state.inventory.woodenGear, 1); assert.equal(loaded.state.stock.crudeGearBench, 1);
  const replacement = loaded.place('crudeGearBench', 40, 40).machine;
  assert.equal(replacement.job, null); assert.equal(replacement.input.length, 0); assert.equal(replacement.output.length, 0);
});

test('Older saves gain only zero Gear stock/inventory; malformed current fields, wrong recipes and excessive buffers are rejected', () => {
  const f = new Factory(A.createState(1)), old = JSON.parse(f.exportSave());
  delete old.state.crudeGearBenchVersion; delete old.state.stock.crudeGearBench; delete old.state.inventory.woodenGear;
  const loaded = Factory.importSave(JSON.stringify(old));
  assert.equal(loaded.state.stock.crudeGearBench, 0); assert.equal(loaded.state.inventory.woodenGear, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  const m = place(f, 'crudeGearBench');
  for (const items of [[cargo('wood', 3)], [cargo('clay')], [cargo('wood', 0.5)]]) {
    m.input = items; assert.throws(() => Factory.importSave(f.exportSave()), /Gear Bench/);
  }
  m.input = []; m.mode = 'pot'; assert.throws(() => Factory.importSave(f.exportSave()), /Gear Bench/);
  m.mode = 'gear'; delete f.state.inventory.woodenGear; assert.throws(() => Factory.importSave(f.exportSave()));
});

test('Every actual internal belt requires an owned conveyor and deducts old Wood without negative costs', () => {
  const oldWood = { primitive: 50, brickSeal: 0, leekInfuser: 0, primitiveShack: 1000, primitiveBridge: 50, primitiveStacker: 100, graniteProcessor: 0 };
  for (const [type, d] of Object.entries(D.machines)) {
    if (!d.conveyors || type === 'belt') continue;
    const count = type === 'primitiveBridge' ? 4 : d.conveyors.length;
    assert.equal(d.cost.machines.belt, count, type);
    if (Object.hasOwn(oldWood, type)) assert.equal(d.cost.materials.wood ?? 0, Math.max(0, oldWood[type] - 20 * d.conveyors.length), type);
    assert.ok((d.cost.materials.wood ?? 0) >= 0, type);
    const f = new Factory(A.createState(1));
    f.state.cash = d.cost.cash * 2; Object.assign(f.state.inventory, Object.fromEntries(Object.entries(d.cost.materials).map(([id, qty]) => [id, qty * 2])));
    f.state.stock.belt = count * 2 - 1;
    const before = f.exportSave(); assert.ok(f.buy(type, 2).error); assert.equal(f.exportSave(), before);
    f.state.stock.belt++; assert.equal(f.buy(type, 2).amount, 2); assert.equal(f.state.stock.belt, 0);
  }
  assert.deepEqual(D.machines.belt.cost, { cash: 1, materials: { wood: 10, woodenGear: 4 } });
  assert.equal(D.machines.clayPit.cost.machines, undefined); assert.equal(D.machines.primitiveRockDrill.cost.machines, undefined);
  assert.equal(D.machines.crudeGearBench.cost.machines, undefined);
});

test('Pit and Drill are plain boxes with centered outlets, not hidden belt visuals, in every rotation', () => {
  for (const type of ['clayPit', 'primitiveRockDrill']) for (const facing of D.directions) {
    const f = new Factory(A.createState(1)), m = place(f, type, 40, 40, facing), rectangles = [];
    assert.deepEqual(A.conveyorCells(m), []); assert.equal(ports(m)[0].span, 2);
    const ctx = new Proxy({}, { get: (_, method) => (...args) => { if (method === 'fillRect') rectangles.push(args); }, set: () => true });
    R.drawFloor(ctx, f, { x: 38, y: 38, zoom: 1 }, { width: 320, height: 320 });
    assert.equal(rectangles.some(r => r[2] === 24 && r[3] === 18), false);
  }
});
