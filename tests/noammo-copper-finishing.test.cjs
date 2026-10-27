const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../noammo-simulation.js');
const { DATA: D, Factory, cargo, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error); return result.machine;
}
function feed(f, m, item, consume = true) {
  const p = ports(m).find(p => p.role === 'input'); return f.receive(m, item, p.x, p.y, p.direction, consume);
}
function pass(f, m, item) {
  assert.equal(feed(f, m, item), item.quantity); f.update(2); const output = A.copy(m.lanes[0]); delete m.lanes[0]; return output;
}

test('Molder and Chimes have agreed atomic purchase costs, staffing and footprints', () => {
  const costs = {
    ingotMolder: { cash: 250000, materials: { brick: 40, clay: 20, leekFiber: 10 } },
    copperChimes: { cash: 1000000, materials: { leekFiber: 200, wood: 50, copperIngot: 10 }, machines: { belt: 1 } },
  };
  for (const [type, cost] of Object.entries(costs)) {
    assert.deepEqual(D.machines[type].cost, cost); assert.equal(A.createState(1).stock[type], 0);
    for (const missing of ['cash', ...Object.keys(cost.materials), ...Object.keys(cost.machines ?? {})]) {
      const f = new Factory(A.createState(1)); f.state.cash = cost.cash;
      Object.assign(f.state.inventory, cost.materials); Object.assign(f.state.stock, cost.machines ?? {});
      if (missing === 'cash') f.state.cash -= 0.01;
      else if (missing === 'belt') f.state.stock.belt = 0; else f.state.inventory[missing]--;
      const before = f.exportSave(); assert.ok(f.buy(type).error); assert.equal(f.exportSave(), before);
    }
    const f = new Factory(A.createState(1)); f.state.cash = cost.cash;
    Object.assign(f.state.inventory, cost.materials); Object.assign(f.state.stock, cost.machines ?? {});
    assert.equal(f.buy(type).amount, 1); assert.equal(f.state.cash, 0);
    const m = f.place(type, 40, 40).machine;
    assert.equal(A.cells(m).length, type === 'ingotMolder' ? 2 : 3);
    assert.equal(f.availableCrew(), type === 'ingotMolder' ? 9 : 10);
  }
  assert.deepEqual(A.size({ type: 'ingotMolder', facing: 'right' }), { width: 1, height: 2 });
  assert.deepEqual(ports({ type: 'ingotMolder', x: 0, y: 0, facing: 'right' }), ports({ type: 'fiber', x: 0, y: 0, facing: 'right' }));
});

for (const facing of D.directions) test(`Furnace → Molder ${facing}: direct liquid feed sustains 1 ingot/s in either construction order`, () => {
  for (const reversed of [false, true]) {
    const f = new Factory(A.createState(1)), furnace = place(f, 'primitiveFurnace', 40, 40, facing);
    f.setFurnaceMode(furnace.id, 'copper'); furnace.output = [cargo('moltenCopper', 4, 108.4)]; furnace.outputCooldown = 2;
    const output = ports(furnace).find(p => p.role === 'output'), v = D.vectors[output.direction];
    const local = ports({ type: 'ingotMolder', x: 0, y: 0, facing }).find(p => p.role === 'input');
    const m = place(f, 'ingotMolder', output.x + v.x - local.x, output.y + v.y - local.y, facing);
    const out = ports(m).find(p => p.role === 'output'), basket = place(f, 'basket', out.x + v.x, out.y + v.y);
    if (reversed) { f.state.machines.reverse(); f.rebuild(); }
    const inventory = A.copy(f.state.inventory);
    f.update(0.1); assert.ok(m.job); near(m.job.remaining, 1);
    for (let expected = 1; expected <= 4; expected++) {
      f.update(1); assert.equal(f.total(basket, 'contents'), expected, 'neither solid-output cooldown nor machine order throttles molding');
    }
    assert.equal(furnace.output.length, 0); assert.equal(m.job, null); assert.equal(m.input.length, 0);
    assert.equal(basket.contents[0].material, 'copperIngot'); near(basket.contents[0].value, 108.4);
    assert.deepEqual(f.state.inventory, inventory, 'no Clay or other inventory is consumed');
    assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
  }
});

test('Molder only accepts its liquid port, assembles fractional liquid to one unit, and preserves weighted value', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'ingotMolder', 40, 40);
  const before = f.exportSave(); near(feed(f, m, cargo('moltenCopper', 100), false), 1); assert.equal(f.exportSave(), before);
  for (const material of ['nativeCopper', 'copperIngot', 'clay', 'wood']) assert.equal(feed(f, m, cargo(material)), 0);
  assert.equal(f.receive(m, cargo('moltenCopper'), 40, 40, 'left', true), 0);
  near(feed(f, m, cargo('moltenCopper', 0.25, 100)), 0.25); f.update(3); assert.equal(m.job, null);
  near(feed(f, m, cargo('moltenCopper', 2, 200)), 0.75); assert.equal(feed(f, m, cargo('moltenCopper')), 0);
  f.update(0.1); near(m.job.remaining, 1); f.update(0.9); assert.equal(m.output.length, 0); f.update(0.1);
  assert.equal(f.total(m, 'output'), 1); near(m.output[0].value, 175);
  assert.equal(m.output[0].material, 'copperIngot'); assert.equal(D.materials.copperIngot.value, 6);
});

test('Blocked molder holds one pending, one working and one finished unit; pickup retains liquid and never leaks tile state', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'ingotMolder', 40, 40);
  feed(f, m, cargo('moltenCopper', 1, 12)); f.update(0.1);
  feed(f, m, cargo('moltenCopper', 1, 24)); f.update(1);
  feed(f, m, cargo('moltenCopper', 1, 36)); f.update(60);
  assert.equal(m.output.length, 1); assert.equal(m.job.remaining, 0); assert.equal(f.total(m, 'input'), 1);
  const before = f.exportSave(); assert.equal(feed(f, m, cargo('moltenCopper', 100)), 0); assert.equal(f.exportSave(), before);
  assert.equal(f.move(m.id, 50, 40, 'down').error, undefined);
  const fresh = place(f, 'ingotMolder', 40, 40); assert.equal(fresh.input.length, 0); assert.equal(fresh.job, null);
  const live = A.copy({ input: m.input, job: m.job }); f.pickup(m.id);
  assert.equal(f.state.inventory.copperIngot, 1); assert.equal(f.state.inventory.moltenCopper, 0);
  let loaded = Factory.importSave(f.exportSave());
  const restored = loaded.place('ingotMolder', 60, 40).machine;
  assert.equal(restored.id, m.id); assert.deepEqual({ input: restored.input, job: restored.job }, live);
  const basket = place(loaded, 'basket', 61, 41); loaded.update(2);
  assert.equal(loaded.total(basket, 'contents'), 2); near(basket.contents.reduce((sum, item) => sum + item.value * item.quantity, 0), 60);
  loaded.pickup(restored.id); assert.equal(loaded.state.inventory.copperIngot, 1);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test('Molding uses declared material mappings and excludes refractory-only Cast Iron without a copper-only shortcut', () => {
  const data = JSON.parse(JSON.stringify(D));
  Object.assign(data.materials, {
    moltenTestMetal: { name: 'Test liquid', value: 34, weight: 1, fluid: true, moldsTo: 'testIngot' },
    testIngot: { name: 'Test ingot', value: 34, weight: 1 },
    moltenCastIron: { name: 'Molten Cast Iron', value: 12, weight: 1, fluid: true, moldsTo: 'castIron', requiresRefractoryCaster: true },
    castIron: { name: 'Cast Iron', value: 12, weight: 1, requiresRefractoryCaster: true },
    unsupportedFluid: { name: 'Unmoldable fluid', value: 0, weight: 1, fluid: true },
  });
  const sandbox = { module: { exports: {} }, require: () => data };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../noammo-simulation.js'), 'utf8'), sandbox);
  const other = sandbox.module.exports, f = new other.Factory(other.createState(1));
  f.state.stock.ingotMolder = 1; const m = f.place('ingotMolder', 40, 40).machine, p = other.ports(m)[0];
  for (const material of ['moltenCastIron', 'unsupportedFluid']) assert.equal(f.receive(m, other.cargo(material), p.x, p.y, p.direction, true), 0);
  assert.equal(f.receive(m, other.cargo('moltenTestMetal', 1, 250), p.x, p.y, p.direction, true), 1);
  f.update(0.1); f.update(1); assert.equal(m.output[0].material, 'testIngot'); near(m.output[0].value, 250);
  assert.equal(other.Factory.importSave(f.exportSave()).state.machines[0].output[0].material, 'testIngot');
});

test('Copper Chimes has one shared 1.25 use, an incoming $5k cap, per-item eligibility and no output clamp', () => {
  const f = new Factory(A.createState(1)); place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  const m = place(f, 'copperChimes', 40, 40), other = place(f, 'copperChimes', 43, 40);
  assert.deepEqual(D.machines.copperChimes.cashEffect, { multiplier: 1.25, useLimit: 1, upperLimit: 5000 });
  for (const [value, expected] of [[1600, 2000], [4000, 5000], [4999, 6248.75], [5000, 5000], [6000, 6000]]) {
    let item = { ...cargo('copperIngot', 2, value), upgrades: { primitiveShack: 1 }, graded: true };
    item = pass(f, m, item); near(item.value, expected); assert.equal(item.quantity, 2); assert.equal(item.graded, true);
    assert.equal(item.upgrades.primitiveShack, 1); assert.equal(item.upgrades.copperChimes, value < 5000 ? 1 : undefined);
    item = pass(f, other, item); near(item.value, expected);
  }
  const unpowered = place(f, 'copperChimes', 80, 80); assert.equal(feed(f, unpowered, cargo('copperIngot')), 0);
  assert.equal(feed(f, m, cargo('soil')), 1); f.update(2); assert.equal(m.lanes[0].upgrades.copperChimes, undefined);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Actual copper smelting → molding → powered Chimes → collection preserves value and yields usable construction ingots', () => {
  const f = new Factory(A.createState(1)), furnace = place(f, 'primitiveFurnace', 40, 40);
  f.setFurnaceMode(furnace.id, 'copper'); place(f, 'ingotMolder', 42, 40);
  place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down'); place(f, 'copperChimes', 43, 40);
  const basket = place(f, 'basket', 44, 41); f.state.inventory.clay = 100;
  feed(f, furnace, cargo('wood', 17)); feed(f, furnace, { ...cargo('nativeCopper', 4, 27.1), upgrades: { primitiveShack: 1, brickSeal: 9 } });
  // Chimes' primitive conveyor releases one ingot every two seconds.
  f.update(0.1); f.update(30);
  assert.equal(f.total(basket, 'contents'), 4); near(basket.contents[0].value, 135.5);
  assert.deepEqual(basket.contents[0].upgrades, { copperChimes: 1 }); near(furnace.heat, 10000);
  assert.equal(f.state.inventory.clay, 100); assert.equal(f.collect(basket.id), 4); assert.equal(f.state.inventory.copperIngot, 4);
  near(f.sellInventory('copperIngot', 4), 24);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Finishing migration gives zero stock; malformed molder input, finished buffers and jobs reject', () => {
  const f = new Factory(A.createState(1)), legacy = JSON.parse(f.exportSave());
  delete legacy.state.copperFinishingVersion; delete legacy.state.stock.ingotMolder; delete legacy.state.stock.copperChimes; delete legacy.state.inventory.copperIngot;
  const loaded = Factory.importSave(JSON.stringify(legacy));
  assert.equal(loaded.state.stock.ingotMolder, 0); assert.equal(loaded.state.stock.copperChimes, 0); assert.equal(loaded.state.inventory.copperIngot, 0);
  const m = place(f, 'ingotMolder', 40, 40);
  for (const mutate of [
    s => { s.machines[0].input = [cargo('moltenCopper', 2)]; },
    s => { s.machines[0].input = [cargo('wood')]; },
    s => { s.machines[0].output = [cargo('copperIngot', 2)]; },
    s => { s.machines[0].output = [cargo('moltenCopper')]; },
    s => { s.machines[0].job = { input: cargo('moltenCopper'), remaining: 1.01 }; },
    s => { s.machines[0].job = { input: cargo('moltenCopper', 2), remaining: 1 }; },
  ]) {
    const bad = JSON.parse(f.exportSave()); mutate(bad.state); assert.throws(() => Factory.importSave(JSON.stringify(bad)), /Invalid|Liquid/);
  }
  assert.equal(m.job, null);
});
