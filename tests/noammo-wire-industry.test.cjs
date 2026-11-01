const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../noammo-simulation.js');
const D = A.DATA;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
function place(f, type, x = 40, y = 40, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function attach(f, m, type = 'heavyWheel', side = 'up') {
  const intake = A.ports(m).find(p => p.role === 'kineticInput' && p.direction === A.turn(side, D.directions.indexOf(m.facing)));
  const v = D.vectors[intake.direction];
  const output = A.ports({ type, x: 0, y: 0, facing: m.facing }).find(p => p.role === 'kineticOutput' && p.direction === A.opposite(intake.direction));
  return place(f, type, intake.x + v.x - output.x, intake.y + v.y - output.y, m.facing);
}
function setup(type, facing = 'right') {
  const f = new A.Factory(A.createState(1)), m = place(f, type, 40, 40, facing), wheel = attach(f, m);
  assert.equal(f.kineticHasWheel(m), true); return { f, m, wheel };
}
function feed(f, m, item, consume = true) {
  const p = A.ports(m).find(p => p.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, consume);
}
function collector(f, m) {
  const out = A.ports(m).find(p => p.role === 'output'), v = D.vectors[out.direction];
  return place(f, 'basket', out.x + v.x, out.y + v.y);
}

test('Graphite Drill, Extruder and Spool charge their full costs atomically and start with no free stock', () => {
  const costs = {
    graphiteDrill: { cash: 220000, materials: { granite: 200, wood: 50, copperPlate: 20, copperGear: 8 } },
    extruder: { cash: 1500000, materials: { granite: 250, copperPlate: 60, copperGear: 10, graphite: 10 } },
    windingSpool: { cash: 2700000, materials: { wood: 500, chert: 100, copperPlate: 20, copperGear: 20 } },
  };
  for (const [type, cost] of Object.entries(costs)) {
    assert.deepEqual(D.machines[type].cost, cost); assert.equal(A.createState(1).stock[type], 0);
    for (const missing of ['cash', ...Object.keys(cost.materials)]) {
      const f = new A.Factory(A.createState(1)); f.state.cash = cost.cash; Object.assign(f.state.inventory, cost.materials);
      if (missing === 'cash') f.state.cash -= 1; else f.state.inventory[missing]--;
      const before = f.exportSave(); assert.ok(f.buy(type).error); assert.equal(f.exportSave(), before);
    }
    const f = new A.Factory(A.createState(1)); f.state.cash = cost.cash; Object.assign(f.state.inventory, cost.materials);
    assert.equal(f.buy(type).amount, 1); assert.equal(f.state.cash, 0);
    const m = f.place(type, 40, 40).machine; assert.ok(m);
    assert.equal(f.availableCrew(), type === 'extruder' ? 9 : 10);
  }
});

test('All rotations preserve the footprints and require two kinetic connections; power loss pauses work', () => {
  for (const type of ['graphiteDrill', 'extruder', 'windingSpool']) for (const facing of D.directions) {
    const f = new A.Factory(A.createState(1)), m = place(f, type, 40, 40, facing);
    assert.equal(A.cells(m).length, { graphiteDrill: 8, extruder: 6, windingSpool: 4 }[type]);
    assert.equal(A.conveyorCells(m).length, 0, 'no invented internal belts');
    assert.equal(f.kineticHasWheel(m), false);
    if (type === 'extruder') feed(f, m, A.cargo('moltenCopper'));
    if (type === 'windingSpool') feed(f, m, A.cargo('copperWire'));
    const basic = attach(f, m, 'wheel'); assert.equal(f.kineticConnections.get(m.id).length, 1);
    f.update(1); assert.equal(f.kineticHasWheel(m), false); assert.equal(m.job, null); near(m.timer, 0);
    f.pickup(basic.id); const heavy = attach(f, m);
    assert.equal(f.kineticConnections.get(m.id).length, 2); f.update(1);
    const progress = type === 'graphiteDrill' ? m.timer : m.job.remaining;
    f.pickup(heavy.id); f.update(10);
    near(type === 'graphiteDrill' ? m.timer : m.job.remaining, progress);
    attach(f, m); assert.equal(f.kineticHasWheel(m), true);
    assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  }
});

test('Graphite Drill makes exactly one per 40s and reuses centered front-priority output without extra capacity', () => {
  for (const facing of D.directions) {
    const { f, m } = setup('graphiteDrill', facing);
    f.update(39.9); assert.equal(m.output.length, 0); f.update(0.1);
    assert.equal(f.total(m, 'output'), 1); assert.equal(m.output[0].material, 'graphite');
    f.update(60); assert.equal(f.total(m, 'output'), 1); near(m.timer, 0);
    const p = A.ports(m).find(p => p.role === 'output'), v = D.vectors[p.direction], cross = { x: -v.y, y: v.x };
    const x = p.x + v.x, y = p.y + v.y;
    const back = place(f, 'belt', Math.round(x - cross.x * 0.5), Math.round(y - cross.y * 0.5), A.turn(facing, 1));
    f.update(0.1); assert.equal(f.total(m, 'output'), 1, 'one receiving tile cannot support centered cargo');
    const front = place(f, 'belt', Math.round(x + cross.x * 0.5), Math.round(y + cross.y * 0.5), facing);
    f.powered = (px, py) => px === front.x && py === front.y;
    f.update(0.1); assert.equal(m.output.length, 0);
    assert.equal(front.lanes[0].material, 'graphite'); assert.deepEqual(back.lanes, {});
    near(front.lanes[0].quantity, 1); near(front.lanes[0].value, 4);
    assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  }
});

test('Extrusion has a bounded liquid buffer and preserves value, grade treatments and persistent memory across its 8s batch', () => {
  const { f, m } = setup('extruder');
  const input = { ...A.cargo('moltenCopper', 4, 108.4), upgrades: { primitiveShack: 1 },
    materialHistory: { 'leekDuster:nativeCopper:cash': true, 'leekDuster:nativeCopper:grade': true },
    gradeProfile: [0, 0, 0.3, 0.4, 0.3, 0] };
  const before = f.exportSave(); near(feed(f, m, input, false), 1); assert.equal(f.exportSave(), before);
  for (const material of ['copperIngot', 'nativeCopper', 'wood', 'clay']) assert.equal(feed(f, m, A.cargo(material)), 0);
  near(feed(f, m, input), 1); f.update(0.1); near(m.job.remaining, 8);
  near(feed(f, m, input), 1); assert.equal(feed(f, m, input), 0);
  f.update(7.9); assert.equal(m.output.length, 0); f.update(0.1);
  const output = m.output[0]; assert.equal(output.material, 'copperWire'); near(output.quantity, 5);
  near(output.value * output.quantity, 108.4); near(output.quantity * D.materials.copperWire.weight, 1);
  assert.deepEqual(output.upgrades, {}); assert.deepEqual(output.materialHistory, input.materialHistory);
  assert.deepEqual(output.gradeProfile, input.gradeProfile);
  near(D.materials.copperWire.value * 5, D.materials.moltenCopper.value);
  f.update(60); assert.equal(m.output.length, 1); assert.equal(m.job.remaining, 0);
  near(feed(f, m, input), 1); assert.equal(feed(f, m, input), 0);
  const pending = A.copy({ input: m.input, job: m.job });
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  assert.equal(f.move(m.id, 60, 40, 'up').error, undefined); f.pickup(m.id);
  near(f.state.inventory.copperWire, 5); near(f.state.inventory.moltenCopper, 0);
  const restored = f.place('extruder', 70, 40).machine;
  assert.deepEqual({ input: restored.input, job: restored.job }, pending);
  const fresh = place(f, 'extruder', 60, 40); assert.equal(fresh.input.length, 0); assert.equal(fresh.job, null);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('Spool combines ten fractional/stacked Wire for a value-preserving Winding, with safe mode changes and fixed timers', () => {
  const { f, m } = setup('windingSpool'), basket = collector(f, m);
  assert.equal(f.setFormingMode(m.id, 'winding').error, undefined);
  near(feed(f, m, A.cargo('copperWire', 2.5, 10)), 2.5); f.update(1); assert.equal(m.job, null);
  near(feed(f, m, { ...A.cargo('copperWire', 20, 30), materialHistory: { 'leekDuster:copperWire:cash': true } }), 7.5);
  assert.equal(feed(f, m, A.cargo('copperWire')), 0); f.update(0.1); near(m.job.remaining, 8);
  assert.equal(feed(f, m, A.cargo('copperWire', 10, 50)), 10);
  assert.equal(f.setFormingMode(m.id, 'coil').error, undefined); assert.equal(m.job.mode, 'winding');
  near(f.state.inventory.copperWire, 10); assert.equal(m.input.length, 0);
  assert.equal(feed(f, m, A.cargo('copperWire', 5, 15)), 1, 'coil mode only buffers one recipe');
  f.update(7.9); assert.equal(basket.contents.length, 0); f.update(0.1);
  const winding = basket.contents[0]; assert.equal(winding.material, 'copperWinding'); near(winding.value, 250);
  near(winding.quantity, 1); assert.deepEqual(winding.upgrades, {});
  assert.equal(winding.materialHistory['leekDuster:copperWire:cash'], true);
  near(m.job.remaining, 3); f.update(2.9); assert.equal(f.total(basket, 'contents'), 1); f.update(0.1);
  const coil = basket.contents.find(item => item.material === 'copperCoil'); near(coil.value, 15); near(coil.quantity, 1);
  near(D.materials.copperWinding.weight, D.materials.copperWire.weight * 10);
  near(D.materials.copperWinding.value, D.materials.copperWire.value * 10);
  assert.ok(f.setFormingMode(m.id, 'not-a-mode').error);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('Furnace feeds Extruder directly in all rotations and either machine order; fluids never enter belts or collectors', () => {
  for (const facing of D.directions) for (const reversed of [false, true]) {
    const f = new A.Factory(A.createState(1)), furnace = place(f, 'primitiveFurnace', 40, 40, facing);
    const p = A.ports(furnace).find(p => p.role === 'output'), v = D.vectors[p.direction];
    const local = A.ports({ type: 'extruder', x: 0, y: 0, facing }).find(p => p.role === 'input');
    const m = place(f, 'extruder', p.x + v.x - local.x, p.y + v.y - local.y, facing); attach(f, m);
    const basket = collector(f, m); furnace.output = [A.cargo('moltenCopper', 4, 100)]; furnace.outputCooldown = 2;
    assert.equal(f.receive(basket, A.cargo('moltenCopper'), basket.x, basket.y, 'left', true), 0);
    if (reversed) { f.state.machines.reverse(); f.rebuild(); }
    f.update(0.1); assert.ok(m.job); near(m.job.remaining, 8);
    for (let i = 1; i <= 4; i++) { f.update(8); near(f.total(basket, 'contents'), i * 5); }
    near(basket.contents.reduce((sum, item) => sum + item.value * item.quantity, 0), 400);
    assert.equal(furnace.output.length, 0); assert.equal(m.input.length, 0); assert.equal(m.job, null);
    assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  }
  // A direct Coil intake consumes one Wire at a time, leaving a valid partial
  // Extruder output batch. Saving midway must not reject or replace it.
  const { f, m } = setup('extruder');
  feed(f, m, A.cargo('moltenCopper', 1, 100)); f.update(0.1); f.update(8);
  const spool = place(f, 'windingSpool', 43, 40);
  f.update(0.1); near(m.output[0].quantity, 4); near(f.total(spool, 'input'), 1);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('Opposite-facing Extruder and Spool share the two sides of one Heavy Wheel', () => {
  const { f, m, wheel } = setup('extruder', 'down');
  const local = A.ports({ type: 'windingSpool', x: 0, y: 0, facing: 'up' }).find(p => p.role === 'kineticInput');
  const v = D.vectors[local.direction];
  const candidates = A.ports(wheel).filter(p => p.role === 'kineticOutput' && p.direction === A.opposite(local.direction))
    .map(p => ({ type: 'windingSpool', x: p.x - v.x - local.x, y: p.y - v.y - local.y, facing: 'up' }));
  const aligned = candidates.find(candidate => A.ports(candidate).filter(p => p.role === 'kineticInput').every(p => {
    const step = D.vectors[p.direction];
    return A.ports(wheel).some(out => out.role === 'kineticOutput' && out.direction === A.opposite(p.direction)
      && out.x === p.x + step.x && out.y === p.y + step.y);
  }));
  assert.ok(aligned); const spool = place(f, 'windingSpool', aligned.x, aligned.y, aligned.facing);
  assert.equal(f.kineticHasWheel(m), true); assert.equal(f.kineticHasWheel(spool), true);
  assert.equal(f.state.machines.filter(item => item.type === 'heavyWheel').length, 1);
  feed(f, m, A.cargo('moltenCopper')); feed(f, spool, A.cargo('copperWire')); f.update(0.1);
  near(m.job.remaining, 8); near(spool.job.remaining, 3);
});

test('Material mappings support later metals without Copper-specific forming code', () => {
  const data = A.copy(D);
  Object.assign(data.materials, {
    testLiquid: { name: 'Liquid', value: 40, weight: 2, fluid: true, extrudesTo: 'testWire' },
    testWire: { name: 'Wire', value: 8, weight: 0.4, coilsTo: 'testCoil', windsTo: 'testWinding' },
    testCoil: { name: 'Coil', value: 8, weight: 0.4 }, testWinding: { name: 'Winding', value: 80, weight: 4 },
  });
  const sandbox = { module: { exports: {} }, require: () => data };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../noammo-simulation.js'), 'utf8'), sandbox);
  const B = sandbox.module.exports, f = new B.Factory(B.createState(1));
  f.state.stock.extruder = 1; const m = f.place('extruder', 40, 40).machine;
  f.state.stock.heavyWheel = 1; f.place('heavyWheel', 40, 37);
  const p = B.ports(m).find(p => p.role === 'input');
  near(f.receive(m, B.cargo('testLiquid', 1, 175), p.x, p.y, p.direction, true), 1);
  f.update(0.1); f.update(8); assert.equal(m.output[0].material, 'testWire'); near(m.output[0].value, 35);
  assert.equal(B.Factory.importSave(f.exportSave()).state.machines[0].output[0].quantity, 5);
});

test('Old saves acquire empty new inventory entries; malformed forming modes, liquids and oversized buffers reject', () => {
  const f = new A.Factory(A.createState(1)), legacy = JSON.parse(f.exportSave());
  delete legacy.state.wireIndustryVersion;
  for (const type of ['graphiteDrill', 'extruder', 'windingSpool']) delete legacy.state.stock[type];
  for (const material of ['graphite', 'copperWire', 'copperCoil', 'copperWinding']) delete legacy.state.inventory[material];
  const loaded = A.Factory.importSave(JSON.stringify(legacy));
  for (const type of ['graphiteDrill', 'extruder', 'windingSpool']) assert.equal(loaded.state.stock[type], 0);
  assert.equal(loaded.state.inventory.graphite, 0);
  place(f, 'extruder');
  for (const mutate of [
    m => { m.mode = 'unknown'; },
    m => { m.input = [A.cargo('moltenCopper', 2)]; },
    m => { m.input = [A.cargo('copperIngot')]; },
    m => { m.output = [A.cargo('copperWire', 6)]; },
    m => { m.output = [A.cargo('moltenCopper')]; },
    m => { m.job = { input: A.cargo('moltenCopper'), mode: 'wire', remaining: 8.1 }; },
    m => { m.job = { input: A.cargo('moltenCopper', 2), mode: 'wire', remaining: 1 }; },
  ]) {
    const bad = JSON.parse(f.exportSave()); mutate(bad.state.machines[0]);
    assert.throws(() => A.Factory.importSave(JSON.stringify(bad)), /Invalid|Liquid/);
  }
  const spool = place(f, 'windingSpool', 60, 40);
  for (const mutate of [
    m => { m.mode = 'wire'; },
    m => { m.input = [A.cargo('copperWire', 2)]; },
    m => { m.input = [A.cargo('moltenCopper')]; },
    m => { m.output = [A.cargo('copperWinding', 2)]; },
    m => { m.job = { input: A.cargo('copperWire', 9), mode: 'winding', remaining: 1 }; },
  ]) {
    const bad = JSON.parse(f.exportSave()); mutate(bad.state.machines.find(m => m.id === spool.id));
    assert.throws(() => A.Factory.importSave(JSON.stringify(bad)), /Invalid|Liquid/);
  }
});
