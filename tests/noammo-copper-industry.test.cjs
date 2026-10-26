const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { DATA: D, Factory, cargo, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined, result.error); return result.machine;
}
function feed(f, m, material, quantity, index = 0, value = D.materials[material].value, consume = true) {
  const p = ports(m).filter(p => p.role === 'input')[index];
  return f.receive(m, cargo(material, quantity, value), p.x, p.y, p.direction, consume);
}
function wheelFor(f, m) {
  const input = ports(m).find(p => p.role === 'kineticInput'), v = D.vectors[input.direction];
  for (const facing of D.directions) for (const p of ports({ type: 'wheel', x: 0, y: 0, facing })) {
    if (p.direction !== A.opposite(input.direction)) continue;
    const x = input.x + v.x - p.x, y = input.y + v.y - p.y;
    if (!f.placement('wheel', x, y, facing)) return place(f, 'wheel', x, y, facing);
  }
  assert.fail('No room for wheel');
}
function fixture(mode = 'charcoal', facing = 'right') {
  const f = new Factory(A.createState(1)), m = place(f, 'primitiveFurnace', 40, 40, facing);
  assert.equal(f.setFurnaceMode(m.id, mode).error, undefined); return { f, m };
}

test('Copper industry purchases consume exact agreed costs atomically, with no free stock', () => {
  const costs = {
    copperDrill: { cash: 75000, materials: { granite: 100, chert: 50, woodenGear: 20, wood: 40 } },
    primitiveFurnace: { cash: 250000, materials: { brick: 200, granite: 100, clay: 50 } },
  };
  for (const [type, cost] of Object.entries(costs)) {
    assert.deepEqual(D.machines[type].cost, cost);
    assert.equal(A.createState(1).stock[type], 0);
    for (const missing of ['cash', ...Object.keys(cost.materials)]) {
      const f = new Factory(A.createState(1)); f.state.cash = cost.cash;
      Object.assign(f.state.inventory, cost.materials);
      if (missing === 'cash') f.state.cash -= 0.01; else f.state.inventory[missing]--;
      const before = f.exportSave(); assert.ok(f.buy(type).error); assert.equal(f.exportSave(), before);
    }
    const f = new Factory(A.createState(1)); f.state.cash = cost.cash * 2;
    for (const [material, quantity] of Object.entries(cost.materials)) f.state.inventory[material] = quantity * 2;
    assert.equal(f.buy(type, 2).amount, 2); assert.equal(f.state.cash, 0);
    for (const material of Object.keys(cost.materials)) assert.equal(f.state.inventory[material], 0);
    const m = f.place(type, 40, 40).machine; assert.equal(A.cells(m).length, 6);
    assert.equal(A.conveyorCells(m).length, 0);
    assert.equal(f.availableCrew(), type === 'primitiveFurnace' ? 8 : 10);
  }
});

for (const facing of D.directions) test(`Copper Drill ${facing}: direct kinetic input, exact 15-second cycle, bounded centered output`, () => {
  const f = new Factory(A.createState(1)), m = place(f, 'copperDrill', 40, 40, facing);
  f.update(60); assert.equal(m.timer, 0); assert.equal(m.output.length, 0);
  const wheel = wheelFor(f, m); assert.equal(f.kineticHasWheel(m), true);
  f.update(14.9); assert.equal(m.output.length, 0); f.update(0.1);
  assert.equal(f.total(m, 'output'), 1); assert.equal(m.output[0].material, 'nativeCopper'); near(m.output[0].value, 1.5);
  f.update(60); near(m.timer, 0); assert.equal(f.total(m, 'output'), 1, 'blocked drills do not bank cycles');
  f.pickup(wheel.id); f.update(60); near(m.timer, 0);
  const output = ports(m).find(p => p.role === 'output'); assert.equal(output.span, 2);
  const v = D.vectors[output.direction], p = { x: -v.y, y: v.x };
  const positions = [-0.5, 0.5].map(d => ({ x: Math.round(output.x + v.x + p.x * d), y: Math.round(output.y + v.y + p.y * d) }));
  const tube = place(f, 'sellTube', Math.min(...positions.map(p => p.x)) - (v.x < 0 ? 1 : 0),
    Math.min(...positions.map(p => p.y)) - (v.y < 0 ? 1 : 0));
  f.update(0.1); near(f.state.cash, 1.5); assert.equal(m.output.length, 0);
  wheelFor(f, m); f.update(15); near(f.state.cash, 3);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
  f.pickup(tube.id);
});

for (const facing of D.directions) test(`Primitive Furnace ${facing}: 4 Wood → 2 Charcoal in exactly 12 seconds, zero external heat`, () => {
  const { f, m } = fixture('charcoal', facing);
  const before = f.exportSave(); assert.equal(feed(f, m, 'wood', 100, 0, 0.1, false), 4); assert.equal(f.exportSave(), before);
  assert.equal(feed(f, m, 'wood', 3), 3); f.update(30); assert.equal(m.job, null);
  assert.equal(feed(f, m, 'wood', 100, 1), 1); assert.equal(feed(f, m, 'wood', 1), 0);
  f.update(0.1); assert.equal(m.job.remaining, 12); assert.equal(m.heat, 0);
  f.update(11.9); assert.equal(m.output.length, 0); f.update(0.1);
  assert.equal(f.total(m, 'output'), 2); near(m.output[0].value, 0.2); assert.equal(m.heat, 0);
  assert.equal(D.materials.charcoal.heat, 240000);
  const output = ports(m).find(p => p.role === 'output'), v = D.vectors[output.direction];
  const basket = place(f, 'basket', output.x + v.x, output.y + v.y);
  f.update(0.1); assert.equal(f.total(basket, 'contents'), 1); f.update(2); assert.equal(f.total(basket, 'contents'), 2);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Copper smelting needs a full batch and 500ku; output conserves upgraded values and resets cash tags', () => {
  const { f, m } = fixture('copper'), input = ports(m)[0];
  const upgraded = { ...cargo('nativeCopper', 1, 27.1), upgrades: { primitiveShack: 1, brickSeal: 9 } };
  assert.equal(f.receive(m, upgraded, input.x, input.y, input.direction, true), 1);
  assert.equal(feed(f, m, 'nativeCopper', 3, 1), 3);
  assert.equal(feed(f, m, 'charcoal', 2), 2); f.update(30); assert.equal(m.job, null); near(m.heat, 480000);
  assert.equal(feed(f, m, 'wood', 1, 1), 1); f.update(0.1); near(m.heat, 10000); assert.equal(m.job.remaining, 20);
  f.update(19.9); assert.equal(m.output.length, 0); f.update(0.1);
  assert.equal(f.total(m, 'output'), 4); assert.equal(m.output[0].material, 'moltenCopper');
  near(m.output[0].value, 31.6); assert.deepEqual(m.output[0].upgrades, {});
  const basket = place(f, 'basket', 42, 41); f.update(10);
  assert.equal(basket.contents.length, 0, 'molten metal never goes into a solid collector');
  assert.equal(f.sell([m.output[0]]), 0); assert.equal(f.state.cash, 0);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Blocked smelting is bounded to finished, active and pending batches; mode changes preserve work and refund pending ingredients once', () => {
  const { f, m } = fixture('copper');
  feed(f, m, 'wood', 33); near(m.heat, 990000); assert.equal(feed(f, m, 'wood', 1), 0);
  feed(f, m, 'nativeCopper', 4); f.update(0.1); feed(f, m, 'wood', 17); near(m.heat, 1000000);
  feed(f, m, 'nativeCopper', 4); f.update(20); feed(f, m, 'nativeCopper', 4); f.update(60);
  assert.equal(m.job.remaining, 0); assert.equal(f.total(m, 'output'), 4); assert.equal(f.total(m, 'input'), 4);
  const snapshot = f.exportSave(); assert.equal(feed(f, m, 'nativeCopper', 100), 0); assert.equal(f.exportSave(), snapshot);
  const heat = m.heat; f.setFurnaceMode(m.id, 'charcoal');
  assert.equal(f.state.inventory.nativeCopper, 4); assert.equal(m.job.recipe, 'copper'); near(m.heat, heat);
  feed(f, m, 'wood', 4); f.setFurnaceMode(m.id, 'copper'); assert.equal(f.state.inventory.wood, 4);
  f.setFurnaceMode(m.id, 'copper'); assert.equal(f.state.inventory.wood, 4);
  assert.equal(f.move(m.id, 50, 40, 'down').error, undefined);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
  const id = m.id; f.pickup(id); assert.equal(f.state.inventory.nativeCopper, 8);
  assert.equal(f.state.inventory.moltenCopper, 0); assert.equal(f.state.storedMachines[0].output[0].quantity, 4);
  const restored = f.place('primitiveFurnace', 60, 40).machine; assert.equal(restored.id, id);
  assert.equal(restored.mode, 'copper'); assert.equal(restored.output[0].quantity, 4); near(restored.heat, heat);
  const fresh = place(f, 'primitiveFurnace', 50, 40); assert.equal(fresh.heat, 0); assert.equal(fresh.output.length, 0);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Legacy heat rescales once, new content defaults to zero, and malformed furnace states reject', () => {
  const f = new Factory(A.createState(1)), kiln = place(f, 'kiln', 40, 40), stored = place(f, 'kiln', 50, 40);
  f.pickup(stored.id); const old = JSON.parse(f.exportSave());
  delete old.state.heatScaleVersion; delete old.state.copperIndustryVersion;
  old.state.machines[0].heat = 120; old.state.storedMachines[0].heat = 80;
  for (const type of ['copperDrill', 'primitiveFurnace']) delete old.state.stock[type];
  for (const material of ['charcoal', 'moltenCopper']) delete old.state.inventory[material];
  const migrated = Factory.importSave(JSON.stringify(old)); near(migrated.byId.get(kiln.id).heat, 120000);
  near(migrated.state.storedMachines[0].heat, 80000); assert.equal(migrated.state.stock.copperDrill, 0);
  assert.deepEqual(Factory.importSave(migrated.exportSave()).state, migrated.state);
  const { f: other, m } = fixture('copper');
  for (const mutate of [
    s => { s.machines[0].mode = 'bogus'; }, s => { s.machines[0].heat = 1000001; },
    s => { s.machines[0].input = [cargo('nativeCopper', 5)]; },
    s => { s.machines[0].input = [cargo('wood', 4)]; },
    s => { s.machines[0].output = [cargo('moltenCopper', 5)]; },
    s => { s.inventory.moltenCopper = 1; },
    s => { s.machines[0].job = { recipe: 'copper', inputs: [cargo('wood', 4)], remaining: 20 }; },
  ]) {
    const bad = JSON.parse(other.exportSave()); mutate(bad.state); assert.throws(() => Factory.importSave(JSON.stringify(bad)), /Invalid/);
  }
  assert.equal(m.heat, 0);
});

test('Real Copper Drill → centered front-priority belts → Primitive Furnace produces retained molten Copper', () => {
  const f = new Factory(A.createState(1)), drill = place(f, 'copperDrill', 40, 40);
  const wheel = wheelFor(f, drill);
  place(f, 'belt', 43, 40, 'down'); place(f, 'belt', 43, 41);
  const m = place(f, 'primitiveFurnace', 44, 40); f.setFurnaceMode(m.id, 'copper');
  let drive;
  for (const p of ports(wheel).filter(p => p.role === 'kineticOutput')) {
    const facing = A.opposite(p.direction), v = D.vectors[p.direction];
    const local = ports({ type: 'drive', x: 0, y: 0, facing })[0];
    const x = p.x + v.x - local.x, y = p.y + v.y - local.y;
    if (!f.placement('drive', x, y, facing)) { drive = place(f, 'drive', x, y, facing); break; }
  }
  assert.ok(drive); assert.equal(f.powered(43, 40), true); assert.equal(f.powered(43, 41), true);
  feed(f, m, 'charcoal', 3); f.update(60); f.update(30);
  assert.equal(f.total(m, 'output'), 4); near(m.output[0].value, 6); near(m.heat, 220000);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});
