const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
function place(f, type, x, y, facing = 'right') { f.state.stock[type]++; return f.place(type, x, y, facing).machine; }
function legacy(type = 'belt', material = 'clay', quantity = 5) {
  const f = new A.Factory(A.createState(1)); const m = place(f, type, 40, 40);
  const item = A.cargo(material, quantity, 17); item.graded = true; item.upgrades = { saved: true };
  m.lanes[0] = { ...item, progress: 0.3 };
  const p = JSON.parse(f.exportSave()); delete p.state.beltCapacityVersion;
  return { saved: JSON.stringify(p), id: m.id };
}
test('primitive belts have two weight capacity and split whole items without rounding up fractional amounts', () => {
  assert.equal(A.DATA.config.beltWeight, 2);
  const f = new A.Factory(A.createState(1));
  place(f, 'wheel', 38, 44); f.state.stock.drive++; f.place('drive', 39, 42, 'down');
  const m = place(f, 'belt', 40, 40);
  for (const [material, offered, expected] of [['clay', 5, 2], ['pot', 2, 1], ['chert', 0.1, 0.1]]) {
    assert.equal(f.receive(m, A.cargo(material, offered), 40, 40, 'left', true), expected);
    assert.equal(m.lanes[0].quantity, expected); delete m.lanes[0];
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
