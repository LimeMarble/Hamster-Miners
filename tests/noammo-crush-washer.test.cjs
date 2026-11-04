const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../noammo-simulation.js');
const D = A.DATA;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined); return result.machine;
}
function attach(f, machine, intake, type) {
  const v = D.vectors[intake.direction], candidates = [];
  for (const facing of D.directions) for (const out of A.ports({ type, x: 0, y: 0, facing })) {
    if (out.role !== 'kineticOutput' || out.direction !== A.opposite(intake.direction)) continue;
    const x = intake.x + v.x - out.x, y = intake.y + v.y - out.y;
    if (f.placement(type, x, y, facing)) continue;
    const outputs = A.ports({ type, x, y, facing });
    const matches = A.ports(machine).filter(p => p.role === 'kineticInput').filter(p => {
      const d = D.vectors[p.direction]; return outputs.some(o => o.role === 'kineticOutput' && o.x === p.x + d.x && o.y === p.y + d.y && o.direction === A.opposite(p.direction));
    }).length;
    candidates.push({ x, y, facing, matches });
  }
  candidates.sort((a, b) => b.matches - a.matches); assert.ok(candidates.length);
  const c = candidates[0]; return place(f, type, c.x, c.y, c.facing);
}
function feed(f, m, item) {
  const p = A.ports(m).find(entry => entry.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, true);
}
test('Crush-Washer averages matching rock, consumes Water, and boosts each surviving ore by three', () => {
  for (const heavy of [false, true]) {
    const f = new A.Factory(A.createState(1)), m = place(f, 'oreCrushWasher', 80, 40);
    const intakes = A.ports(m).filter(p => p.role === 'kineticInput');
    attach(f, m, intakes[0], heavy ? 'heavyWheel' : 'wheel');
    if (!heavy) attach(f, m, intakes[2], 'wheel');
    near(f.pressPower(m).speed, heavy ? 1.5 : 1);
    assert.equal(feed(f, m, A.cargo('nativeCopper', 3, 3)), 3);
    assert.equal(feed(f, m, A.cargo('nativeCopper', 3, 6)), 3);
    assert.equal(feed(f, m, A.cargo('chert', 1)), 0);
    f.update(2); assert.equal(m.job, null); m.water = 1; f.update(0.1);
    assert.ok(m.job); near(m.water, 0); f.update(heavy ? 8 : 12);
    const product = m.output[0]; assert.equal(product.material, 'copperOre'); near(product.quantity, 4); near(product.value, 13.5);
    assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  }
});
test('Well cycles dropoffs every five seconds, spills overflow, and stops serving moved targets outside range', () => {
  const f = new A.Factory(A.createState(1)), well = place(f, 'well', 40, 40);
  const first = place(f, 'paintingBench', 36, 40), second = place(f, 'paintingBench', 44, 40);
  assert.equal(f.addWaterDelivery(well.id, first.id, 0).error, undefined);
  assert.equal(f.addWaterDelivery(well.id, second.id, 0).error, undefined);
  first.water = 0.4; f.update(5); near(first.water, 0.5); near(second.water, 0);
  f.update(5); near(second.water, 0.5); assert.equal(well.waterNext, 0);
  assert.equal(f.move(first.id, 30, 40, 'right').error, undefined); first.water = 0;
  f.update(5); near(first.water, 0); assert.equal(well.waterNext, 1);
  f.pickup(second.id); assert.deepEqual(well.waterSchedule, [{ targetId: first.id, index: 0 }]);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
test('scheduled Water and heavy kinetic wash Native Copper for direct Furnace smelting', () => {
  const f = new A.Factory(A.createState(1)), washer = place(f, 'oreCrushWasher', 80, 40);
  const well = place(f, 'well', 77, 40), furnace = place(f, 'primitiveFurnace', 84, 40);
  attach(f, washer, A.ports(washer).find(p => p.role === 'kineticInput'), 'heavyWheel');
  assert.equal(f.addWaterDelivery(well.id, washer.id, 0).error, undefined);
  assert.equal(f.addWaterDelivery(well.id, washer.id, 1).error, undefined);
  assert.equal(feed(f, washer, A.cargo('nativeCopper', 6)), 6);
  const fuel = A.ports(furnace).find(p => p.channel === 'fuel');
  assert.equal(f.receive(furnace, A.cargo('wood', 17), fuel.x, fuel.y, fuel.direction, true), 17);
  f.update(40); assert.equal(furnace.output[0].material, 'moltenCopper');
  near(furnace.output[0].quantity, 4); near(furnace.output[0].value, 6);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
test('washed ore splits into conveyor-sized stacks without losing the remainder', () => {
  const f = new A.Factory(A.createState(1)), washer = place(f, 'oreCrushWasher', 80, 40);
  attach(f, washer, A.ports(washer).find(p => p.role === 'kineticInput'), 'heavyWheel');
  const belt = place(f, 'belt', 84, 41);
  place(f, 'wheel', 90, 40); place(f, 'drive', 91, 38, 'down');
  assert.equal(f.powered(belt.x, belt.y), true);
  washer.water = 1; feed(f, washer, A.cargo('nativeCopper', 6)); f.update(8.2);
  assert.equal(belt.lanes[0].material, 'copperOre'); near(belt.lanes[0].quantity, 2);
  near(washer.output[0].quantity, 2);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
test('washing recipes can define different yields for different materials', () => {
  const data = A.copy(D);
  data.materials.testHematite = { name: 'Test Hematite', value: 1, weight: 1, washesTo: 'copperOre', washProfile: { input: 6, outputQuantity: 3, valueMultiplier: 1 } };
  const context = vm.createContext({ NoAmmoData: data });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'noammo-simulation.js'), 'utf8'), context);
  const api = context.NoAmmo, f = new api.Factory(api.createState(1)), washer = place(f, 'oreCrushWasher', 80, 40);
  const recipe = f.craftRecipe(washer, api.cargo('testHematite'));
  assert.equal(recipe.input, 6); assert.equal(recipe.outputQuantity, 3); assert.equal(recipe.valueMultiplier, 1);
});
test('old Copper and old Well assignments migrate once without losing saved cargo', () => {
  const f = new A.Factory(A.createState(1)), well = place(f, 'well', 40, 40);
  const bench = place(f, 'paintingBench', 44, 40), furnace = place(f, 'primitiveFurnace', 50, 40);
  furnace.input = [A.cargo('nativeCopper', 2, 9)];
  const saved = JSON.parse(f.exportSave()); delete saved.state.copperWashVersion;
  saved.state.inventory.nativeCopper = 7; delete saved.state.inventory.copperOre; delete saved.state.stock.oreCrushWasher;
  const oldBench = saved.state.machines.find(m => m.id === bench.id); oldBench.waterSourceId = well.id; oldBench.waterCarriers = 1;
  const loaded = A.Factory.importSave(JSON.stringify(saved));
  assert.equal(loaded.state.inventory.copperOre, 7); assert.equal(loaded.state.inventory.nativeCopper, 0);
  assert.equal(loaded.byId.get(furnace.id).input[0].material, 'copperOre'); near(loaded.byId.get(furnace.id).input[0].value, 9);
  assert.deepEqual(loaded.byId.get(well.id).waterSchedule, [{ targetId: bench.id, index: 0 }]);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
});
test('old Copper Drill with blocked output migrates and can unload its existing Copper Ore', () => {
  const f = new A.Factory(A.createState(1)), drill = place(f, 'copperDrill', 40, 40);
  drill.output = [A.cargo('nativeCopper', 1, 7.5)];
  const saved = JSON.parse(f.exportSave()); delete saved.state.copperWashVersion;
  delete saved.state.inventory.copperOre; delete saved.state.stock.oreCrushWasher;
  const loaded = A.Factory.importSave(JSON.stringify(saved)), restored = loaded.byId.get(drill.id);
  assert.equal(restored.output[0].material, 'copperOre'); near(restored.output[0].value, 7.5);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
  const output = A.ports(restored).find(port => port.role === 'output');
  place(loaded, 'sellTube', output.x + 1, output.y - 0.5);
  loaded.update(0.1); assert.equal(restored.output.length, 0); near(loaded.state.cash, 7.5);
});
test('pre-hiring saves migrate without making the hired crew count invalid', () => {
  const f = new A.Factory(A.createState(1)), saved = JSON.parse(f.exportSave());
  delete saved.state.copperWashVersion; delete saved.state.hiredCrew;
  delete saved.state.inventory.copperOre; delete saved.state.stock.oreCrushWasher;
  const loaded = A.Factory.importSave(JSON.stringify(saved));
  assert.equal(loaded.state.hiredCrew, 0); assert.equal(loaded.availableCrew(), D.config.startingCrew);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
});
