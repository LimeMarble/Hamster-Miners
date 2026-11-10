const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { buildCatalog } = require('../noammo-recipes.js');
const D = A.DATA;

test('recipe index agrees with the actual crafting and thermal recipe resolvers for every supported material and mode', () => {
  const index = buildCatalog(D), f = new A.Factory(A.createState(1));
  const before = f.exportSave();
  for (const [id, definition] of Object.entries(D.machines)) {
    if (definition.craftInput || definition.molder || definition.pressModes || definition.formingModes) {
      const modes = Object.keys(definition.recipes ?? definition.pressModes ?? definition.formingModes ?? { default: 0 });
      for (const mode of modes) for (const material of Object.keys(D.materials)) {
        const m = { type: id, mode, input: [A.cargo(material)] };
        // Craft-input recipes accept only their specified feed at intake.
        if (definition.craftInput && material !== definition.craftInput) continue;
        const live = f.craftRecipe(m);
        const listed = index.recipes.find(r => r.machine === `machine:${id}` && r.inputs[0].key === `item:${material}`
          && r.id.startsWith(`${id}:${definition.molder ? material : mode}`));
        if (!live) { assert.equal(listed, undefined); continue; }
        assert.ok(listed, `${id}/${mode}/${material} is discoverable`);
        assert.equal(listed.inputs[0].quantity, live.input);
        assert.deepEqual(listed.outputs, [{ key: `item:${live.output}`, quantity: live.outputQuantity ?? 1 }]);
        assert.equal(listed.seconds, live.seconds); assert.equal(listed.valueMultiplier, live.valueMultiplier);
      }
    }
    if (definition.heatCapacity) for (const [mode, recipe] of Object.entries(definition.recipes)) {
      const input = recipe.inputs ? Object.keys(recipe.inputs).map(material => A.cargo(material)) : [A.cargo(recipe.material ?? mode)];
      const live = f.furnaceRecipe({ type: id, input });
      const listed = index.recipes.find(r => r.id === `${id}:${mode}`);
      assert.equal(listed.heat ?? listed.seconds * listed.heatPerSecond, live.heat ?? live.seconds * (live.heatPerSecond ?? definition.heatPerSecond));
      assert.equal(listed.outputs[0].quantity, live.outputQuantity ?? live.input);
    }
  }
  for (const recipe of index.recipes) {
    assert.ok(index.entries.has(recipe.machine)); assert.ok(Number.isFinite(recipe.seconds) && recipe.seconds >= 0);
    for (const part of [...recipe.inputs, ...recipe.outputs]) { assert.ok(index.entries.has(part.key)); assert.ok(part.quantity > 0); }
    recipe.inputs.forEach(part => assert.ok(index.consumers.get(part.key).includes(recipe)));
    recipe.outputs.forEach(part => assert.ok(index.producers.get(part.key).includes(recipe)));
  }
  assert.equal(f.exportSave(), before, 'browsing is read-only');
});

test('sources include multi-output extraction while production uses and machine construction remain distinct', () => {
  const index = buildCatalog(D);
  for (const material of ['soil', 'chert']) {
    const source = index.producers.get(`item:${material}`).find(r => r.machine === 'machine:pebbleSifter');
    assert.deepEqual(source.outputs, [{ key: 'item:soil', quantity: 0.1 }, { key: 'item:chert', quantity: 0.1 }]);
    assert.equal(source.seconds, 2);
  }
  assert.ok(index.producers.get('item:moltenCopper').some(r => r.machine === 'machine:primitiveFurnace'));
  assert.deepEqual(index.consumers.get('item:moltenCopper').map(r => r.machine).sort(), ['machine:extruder', 'machine:ingotMolder']);
  assert.equal(index.consumers.has('item:copperGear'), false, 'construction ingredients are not production feed');
  assert.ok(index.constructionUses.get('item:woodenGear').some(use => use.machine === 'machine:heavyWheel' && use.quantity === 25));
  assert.deepEqual(index.constructionUses.get('machine:belt').find(use => use.machine === 'machine:primitiveBridge'), { machine: 'machine:primitiveBridge', quantity: 4 });
  assert.equal(index.consumers.has('item:charcoal'), false, 'burning fuel is not an ore-smelting ingredient');
});

test('new materials and machine names are picked up from definitions, with substring search and machine filtering', () => {
  const data = JSON.parse(JSON.stringify(D));
  data.materials.testLiquid = { name: 'Test Liquid', fluid: true, moldsTo: 'testIngot', extrudesTo: 'testWire' };
  data.materials.testIngot = { name: 'Test Ingot', pressesTo: 'testPlate' };
  data.materials.testPlate = { name: 'Test Plate', gearsTo: 'testGear' };
  data.materials.testGear = { name: 'Test Gear' };
  data.materials.testWire = { name: 'Test Wire', coilsTo: 'testCoil' };
  data.materials.testCoil = { name: 'Test Coil' };
  data.materials.blockedLiquid = { name: 'Blocked Liquid', fluid: true, moldsTo: 'testIngot', requiresRefractoryCaster: true };
  for (const id of ['miniArc', 'industrialArc']) data.machines[id] = { name: id === 'miniArc' ? 'Mini Arc Furnace' : 'Industrial Arc Furnace' };
  const index = buildCatalog(data);
  assert.deepEqual(index.search(' aRc ', 'machine').map(entry => entry.name), ['Industrial Arc Furnace', 'Mini Arc Furnace']);
  assert.equal(index.search('Copper Plate')[0].key, 'item:copperPlate');
  assert.equal(index.search('there is no such material').length, 0);
  for (const [input, machine] of [['testLiquid', 'ingotMolder'], ['testLiquid', 'extruder'], ['testIngot', 'metalPress'], ['testPlate', 'metalPress'], ['testWire', 'windingSpool']]) {
    assert.ok(index.consumers.get(`item:${input}`).some(r => r.machine === `machine:${machine}`));
  }
  assert.equal(index.consumers.has('item:blockedLiquid'), false);
  const related = index.search('', 'item', 'windingSpool').map(entry => entry.key);
  assert.ok(related.includes('item:copperWire')); assert.ok(related.includes('item:copperWinding')); assert.ok(related.includes('item:wood'));
  assert.ok(!related.includes('item:soil'));
});
