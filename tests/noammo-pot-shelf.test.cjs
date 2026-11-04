const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const D = A.DATA;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine;
}
function setup(facing = 'right') {
  const f = new A.Factory(A.createState(1)); place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  return { f, shelf: place(f, 'potShelf', 40, 40, facing) };
}
function pass(f, shelf, item) {
  const input = A.ports(shelf).find(p => p.role === 'input');
  assert.equal(f.receive(shelf, item, input.x, input.y, input.direction, true), item.quantity);
  f.update(4); const result = A.copy(shelf.lanes[1]); delete shelf.lanes[1]; return result;
}
test('Pot Shelf has the requested cost and one $200 application with a $1.50 base requirement', () => {
  assert.deepEqual(D.machines.potShelf.cost, { cash: 1200000, materials: { plank: 100, paintedPot: 10, copperPlate: 5, leekCoil: 20 }, machines: { belt: 2 } });
  assert.deepEqual(D.machines.potShelf.cashEffect, { bonus: 200, useLimit: 1, upperLimit: 1e50, baseValueRequired: 1.5 });
  const { f, shelf } = setup();
  let item = pass(f, shelf, A.cargo('copperOre', 1, 1.5)); near(item.value, 201.5);
  assert.equal(item.upgrades.potShelf, 1); item = pass(f, shelf, item); near(item.value, 201.5);
  item = pass(f, shelf, A.cargo('nativeCopper', 1, 100)); near(item.value, 100); assert.equal(item.upgrades.potShelf, undefined);
  item = pass(f, shelf, A.cargo('pot', 1, 1e50)); assert.equal(item.upgrades.potShelf, undefined);
});
test('Pot Shelf purchase consumes all materials and both unplaced conveyors atomically', () => {
  const f = new A.Factory(A.createState(1)), cost = D.machines.potShelf.cost;
  f.state.cash = cost.cash; Object.assign(f.state.inventory, cost.materials); f.state.stock.belt = 1;
  const before = f.exportSave(); assert.ok(f.buy('potShelf').error); assert.equal(f.exportSave(), before);
  f.state.stock.belt++; assert.equal(f.buy('potShelf').amount, 1);
  assert.equal(f.state.cash, 0); assert.equal(f.state.stock.belt, 0);
  for (const material of Object.keys(cost.materials)) assert.equal(f.state.inventory[material], 0);
});
test('old saves receive empty Pot Shelf and Leek Coil stock', () => {
  const f = new A.Factory(A.createState(1)), save = JSON.parse(f.exportSave());
  delete save.state.potShelfVersion; delete save.state.stock.potShelf; delete save.state.inventory.leekCoil;
  const loaded = A.Factory.importSave(JSON.stringify(save));
  assert.equal(loaded.state.stock.potShelf, 0); assert.equal(loaded.state.inventory.leekCoil, 0);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
});
for (const facing of D.directions) test(`Pot Shelf ${facing}: two consecutive conveyor tiles and one upgrade point`, () => {
  const { f, shelf } = setup(facing), out = A.ports(shelf).find(p => p.role === 'output'), v = D.vectors[out.direction];
  const basket = place(f, 'basket', out.x + v.x, out.y + v.y);
  const input = A.ports(shelf).find(p => p.role === 'input');
  assert.equal(A.cells(shelf).length, 4); assert.equal(A.conveyorCells(shelf).length, 2);
  assert.equal(f.receive(shelf, A.cargo('pot', 1, 10), input.x, input.y, input.direction, true), 1);
  f.update(4); near(basket.contents[0].value, 210); assert.equal(basket.contents[0].upgrades.potShelf, 1);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
