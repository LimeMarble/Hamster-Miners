const test = require('node:test');
const assert = require('node:assert/strict');
const { Factory, createState, DATA: D, cargo } = require('../noammo-simulation.js');
const { buildCatalog } = require('../noammo-recipes.js');

test('planters and Minor Rune are absent from new games and recipe references', () => {
  const state = createState(1), catalog = JSON.stringify(buildCatalog(D));
  for (const type of ['planter', 'wheatPlanter', 'applePlanter', 'sugarCanePlanter', 'minorRunePedestal']) {
    assert.equal(D.machines[type], undefined);
    assert.equal(state.stock[type], undefined);
    assert.equal(catalog.includes(`machine:${type}"`), false);
  }
  assert.equal(D.minorRunes, undefined);
  assert.equal(state.minorRunes, undefined);
  assert.equal(state.capitalUnlocked, undefined);
  assert.equal(D.capitalSaveKey, undefined);
});

test('former rune machines buy normally at their existing construction prices without offerings', () => {
  for (const type of ['manualSplitter', 'primitiveBridge', 'primitiveStacker', 'primitiveOven', 'kiln', 'primitiveFurnace']) {
    const factory = new Factory(createState(1)), cost = D.machines[type].cost;
    for (const [id, material] of Object.entries(D.materials)) if (!material.fluid) factory.state.inventory[id] = 10000;
    for (const id of Object.keys(D.machines)) factory.state.stock[id] = 10000;
    factory.state.cash = cost.cash + 42;
    const before = structuredClone(factory.state);
    assert.equal(factory.shopUnlockError(type), null, type);
    assert.equal(factory.buy(type).amount, 1, type);
    assert.equal(factory.state.cash, 42);
    assert.equal(factory.state.stock[type], before.stock[type] + 1);
    for (const [id, count] of Object.entries(cost.materials)) assert.equal(factory.state.inventory[id], before.inventory[id] - count);
    for (const [id, count] of Object.entries(cost.machines ?? {})) assert.equal(factory.state.stock[id], before.stock[id] - count);
  }
});

test('old planters and Minor Rune instances retire once, recovering cargo and removing obsolete unlocks', () => {
  const factory = new Factory(createState(1));
  const old = JSON.parse(factory.exportSave()), state = old.state;
  state.stock.planter = 2;
  state.stock.wheatPlanter = 1;
  state.stock.minorRunePedestal = 1;
  state.minorRunes = { harvest: 1, motion: 2, transmutation: 3 };
  state.capitalUnlocked = true;
  state.starterPlantersVersion = 1;
  state.machines.push({ id: `machine-${state.nextId++}`, type: 'planter', output: [cargo('leek', 2)] });
  state.storedMachines.push({ id: `machine-${state.nextId++}`, type: 'wheatPlanter', output: [cargo('wheat', 3)] });
  const loaded = Factory.importSave(JSON.stringify(old));
  assert.equal(loaded.state.machines.length, 0);
  assert.equal(loaded.state.storedMachines.length, 0);
  assert.equal(loaded.state.inventory.leek, 2);
  assert.equal(loaded.state.inventory.wheat, 3);
  for (const key of ['minorRunes', 'capitalUnlocked', 'starterPlantersVersion']) assert.equal(loaded.state[key], undefined);
  for (const key of ['planter', 'wheatPlanter', 'minorRunePedestal']) assert.equal(loaded.state.stock[key], undefined);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test('retired Wheat water deliveries are removed without disturbing retained schedules', () => {
  const factory = new Factory(createState(1));
  factory.state.stock.well = 1; factory.state.stock.rinseBench = 1;
  const well = factory.place('well', 40, 40).machine;
  const rinse = factory.place('rinseBench', 42, 41).machine;
  assert.equal(factory.addWaterDelivery(well.id, rinse.id, 0).error, undefined);
  const old = JSON.parse(factory.exportSave()), state = old.state;
  const wheatId = `machine-${state.nextId++}`;
  state.machines.push({ id: wheatId, type: 'wheatPlanter', output: [] });
  state.stock.wheatPlanter = 0;
  const oldWell = state.machines.find(machine => machine.id === well.id);
  oldWell.waterSchedule.unshift({ targetId: wheatId, index: 0 });
  oldWell.waterNext = 1;
  const loaded = Factory.importSave(JSON.stringify(old));
  assert.deepEqual(loaded.byId.get(well.id).waterSchedule, [{ targetId: rinse.id, index: 0 }]);
  assert.equal(loaded.byId.get(well.id).waterNext, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});
