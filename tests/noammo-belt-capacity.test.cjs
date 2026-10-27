const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function place(f, type, x, y, facing = 'right') { f.state.stock[type]++; return f.place(type, x, y, facing).machine; }
function legacy(type = 'belt', material = 'clay', quantity = 5) {
  const f = new A.Factory(A.createState(1)); const m = place(f, type, 40, 40);
  const item = A.cargo(material, quantity, 17); item.graded = true; item.upgrades = { saved: true };
  m.lanes[0] = { ...item, progress: 0.3 };
  const p = JSON.parse(f.exportSave()); delete p.state.beltCapacityVersion;
  return { saved: JSON.stringify(p), id: m.id };
}
test('primitive belts reject overweight stacks intact and accept legal fractional quantities', () => {
  assert.equal(A.DATA.config.beltWeight, 2);
  const f = new A.Factory(A.createState(1));
  place(f, 'wheel', 38, 44); f.state.stock.drive++; f.place('drive', 39, 42, 'down');
  const m = place(f, 'belt', 40, 40);
  for (const [material, offered, expected] of [['clay', 5, 0], ['pot', 2, 0], ['clay', 2, 2], ['pot', 1, 1], ['chert', 0.1, 0.1]]) {
    assert.equal(f.receive(m, A.cargo(material, offered), 40, 40, 'left', true), expected);
    assert.equal(m.lanes[0]?.quantity ?? 0, expected); delete m.lanes[0];
  }
});

test('thermal outputs retain one-product unloading every two seconds in every orientation', () => {
  for (const facing of A.DATA.directions) for (const [type, material, quantity, chunk] of [
    ['kiln', 'brick', 4, 1], ['kiln', 'pot', 2, 1], ['primitiveFurnace', 'charcoal', 2, 1],
  ]) {
    const f = new A.Factory(A.createState(1));
    place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
    const source = place(f, type, 40, 40, facing);
    const output = A.ports(source).find(p => p.role === 'output'), v = A.DATA.vectors[output.direction];
    const belt = place(f, 'belt', output.x + v.x, output.y + v.y, facing);
    const basket = place(f, 'basket', output.x + 2 * v.x, output.y + 2 * v.y);
    const item = A.cargo(material, quantity, 17); item.graded = true; item.upgrades = { saved: 3 };
    source.output.push(item);
    f.update(0.1);
    assert.equal(belt.lanes[0].quantity, chunk);
    assert.equal(f.total(source, 'output'), quantity - chunk);
    assert.equal(source.outputCooldown, 2);
    assert.equal(belt.lanes[0].value, 17); assert.equal(belt.lanes[0].graded, true);
    assert.deepEqual(belt.lanes[0].upgrades, { saved: 3 });
    assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
    f.update(1.9); assert.equal(f.total(basket, 'contents'), 0);
    f.update(0.1); assert.equal(f.total(basket, 'contents'), chunk);
    assert.equal(f.total(source, 'output'), quantity - 2 * chunk);
    if (quantity > chunk) {
      assert.equal(belt.lanes[0].quantity, chunk);
      f.update((quantity - 1) * 2);
    }
    assert.equal(f.total(basket, 'contents'), quantity);
    assert.equal(basket.contents[0].value, 17);
  }
});

test('kiln output cadence stays unchanged for machine conveyors and cannot bank bursts', () => {
  const f = new A.Factory(A.createState(1));
  place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  const kiln = place(f, 'kiln', 40, 40), seal = place(f, 'brickSeal', 42, 41);
  kiln.output.push(A.cargo('brick', 4)); seal.lanes[0] = { ...A.cargo('wood', 2), progress: 1 };
  f.update(30); assert.equal(f.total(kiln, 'output'), 4);
  delete seal.lanes[0]; f.update(0.1);
  assert.equal(seal.lanes[0].quantity, 1); assert.equal(f.total(kiln, 'output'), 3);
  delete seal.lanes[0]; f.update(1.9); assert.equal(seal.lanes[0], undefined);
  f.update(0.1); assert.equal(seal.lanes[0].quantity, 1); assert.equal(f.total(kiln, 'output'), 2);
});

test('generic machine outputs wait intact for a belt carrying the entire stack', () => {
  const data = JSON.parse(JSON.stringify(A.DATA));
  data.materials.testKettle = { name: 'Test Kettle', value: 100, weight: 1.5 };
  data.machines.testIndustrialBelt = { ...data.machines.belt, beltWeight: 30 };
  const sandbox = { module: { exports: {} }, require: () => data };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../noammo-simulation.js'), 'utf8'), sandbox);
  const api = sandbox.module.exports, f = new api.Factory(api.createState(1));
  place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  const source = place(f, 'gradingBench', 40, 40), output = api.ports(source).find(p => p.role === 'output');
  const belt = place(f, 'belt', output.x + 1, output.y);
  const kettles = api.cargo('testKettle', 2, 321); kettles.graded = true;
  source.output.push(kettles);
  const before = JSON.stringify(source.output);
  f.update(4); assert.equal(JSON.stringify(source.output), before); assert.equal(belt.lanes[0], undefined);
  f.pickup(belt.id);
  const industrial = place(f, 'testIndustrialBelt', output.x + 1, output.y);
  f.update(0.1); assert.equal(source.output.length, 0);
  assert.equal(industrial.lanes[0].quantity, 2); assert.equal(industrial.lanes[0].value, 321);
  assert.equal(industrial.lanes[0].graded, true);
  assert.deepEqual(JSON.parse(api.Factory.importSave(f.exportSave()).exportSave()), JSON.parse(f.exportSave()));
});

test('thermal solid unloading follows receiving conveyor speed, while molten output uses fluid input capacity', () => {
  for (const seconds of [0.5, 3]) {
    const data = JSON.parse(JSON.stringify(A.DATA));
    data.machines.testBelt = { ...data.machines.belt, beltSeconds: seconds };
    const sandbox = { module: { exports: {} }, require: () => data };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../noammo-simulation.js'), 'utf8'), sandbox);
    const api = sandbox.module.exports, f = new api.Factory(api.createState(1));
    place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
    const kiln = place(f, 'kiln', 40, 40), belt = place(f, 'testBelt', 42, 41);
    const basket = place(f, 'basket', 43, 41);
    kiln.output.push(api.cargo('brick', 4, 17));
    f.update(0.1); assert.equal(belt.lanes[0].quantity, 1); assert.equal(kiln.outputCooldown, seconds);
    assert.deepEqual(JSON.parse(api.Factory.importSave(f.exportSave()).exportSave()), JSON.parse(f.exportSave()));
    f.update(seconds - 0.1); assert.equal(f.total(basket, 'contents'), 0);
    f.update(0.1); assert.equal(f.total(basket, 'contents'), 1);
    f.update(3 * seconds); assert.equal(f.total(basket, 'contents'), 4);
    assert.equal(kiln.output.length, 0); assert.equal(basket.contents[0].value, 17);
    const furnace = place(f, 'primitiveFurnace', 50, 40), molder = place(f, 'ingotMolder', 52, 40);
    furnace.mode = 'copper'; furnace.output.push(api.cargo('moltenCopper', 4)); furnace.outputCooldown = 2;
    f.update(0.1);
    assert.equal(f.total(furnace, 'output'), 3);
    assert.equal(molder.job.input.quantity, 1, 'fluid transfer bypasses solid unloading cooldowns and belt limits');
  }
});
test('older five-weight stacks split and retain exact quantity, cash, metadata and paced transit across reloads', () => {
  for (const [type, material, quantity] of [['belt', 'clay', 5], ['primitiveBridge', 'pot', 2], ['primitive', 'clay', 4.5]]) {
    const { saved, id } = legacy(type, material, quantity), f = A.Factory.importSave(saved), m = f.byId.get(id);
    assert.equal(m.lanes[0].quantity * A.DATA.materials[material].weight <= 2, true);
    assert.equal(m.lanes[0].quantity + m.beltRemainders[0].quantity, quantity);
    const reloaded = A.Factory.importSave(f.exportSave()); assert.deepEqual(reloaded.state, f.state);
    f.pickup(m.id); assert.equal(f.state.inventory[material], quantity);
    f.place(type, 40, 40); f.pickup(m.id); assert.equal(f.state.inventory[material], quantity);
  }
  const { saved, id } = legacy(), f = A.Factory.importSave(saved), m = f.byId.get(id);
  place(f, 'wheel', 38, 44); f.state.stock.drive++; f.place('drive', 39, 42, 'down');
  const basket = place(f, 'basket', 41, 40);
  f.update(1.4); assert.equal(f.total(basket, 'contents'), 2); assert.equal(m.lanes[0].quantity, 2);
  assert.equal(f.receive(m, A.cargo('wood'), 40, 40, 'left', true), 0);
  f.update(1.9); assert.equal(f.total(basket, 'contents'), 2); f.update(0.1); assert.equal(f.total(basket, 'contents'), 4);
  f.update(2); assert.equal(f.total(basket, 'contents'), 5); assert.equal(m.beltRemainders, undefined);
  assert.equal(basket.contents[0].value, 17); assert.equal(basket.contents[0].graded, true);
  assert.deepEqual(basket.contents[0].upgrades, { saved: true });
});
test('migration permits mid-pass upgrader saves and does not repeat or lose per-portion upgrades', () => {
  const { saved, id } = legacy('primitive'), f = A.Factory.importSave(saved);
  place(f, 'wheel', 38, 44); f.state.stock.drive++; f.place('drive', 39, 42, 'down');
  const m = f.byId.get(id); m.lanes[0].value = 0.1; m.beltRemainders[0].value = 0.1;
  f.update(0.4); assert.equal(m.lanes[0].value, 0.2);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  const basket = place(f, 'basket', 41, 40); f.update(6);
  assert.equal(f.total(basket, 'contents'), 5); assert.equal(basket.contents[0].value, 0.2);
});
test('current saves cannot import overweight cargo or malformed legacy remainder records', () => {
  const { saved, id } = legacy(), f = A.Factory.importSave(saved);
  for (const change of [m => { m.lanes[0].quantity = 3; }, m => { m.beltRemainders[0].quantity = 6; },
    m => { m.beltRemainders['00'] = A.cargo('clay'); }, m => { m.beltRemainders[0].progress = 0.1; }]) {
    const p = JSON.parse(f.exportSave()); change(p.state.machines.find(m => m.id === id));
    assert.throws(() => A.Factory.importSave(JSON.stringify(p)));
  }
});

test('older zero-value Wood receives the economy correction in both the active portion and saved remainder', () => {
  const { saved, id } = legacy('belt', 'wood', 5), p = JSON.parse(saved);
  p.state.machines.find(m => m.id === id).lanes[0].value = 0; delete p.state.openingEconomyVersion;
  const f = A.Factory.importSave(JSON.stringify(p)), m = f.byId.get(id);
  assert.equal(m.lanes[0].value, A.DATA.materials.wood.value);
  assert.equal(m.beltRemainders[0].value, A.DATA.materials.wood.value);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
