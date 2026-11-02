const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error); return result.machine;
}
function feed(f, machine, item) {
  const p = A.ports(machine).find(point => point.role === 'input');
  return f.receive(machine, item, p.x, p.y, p.direction, true);
}
test('whole-machine upgrades consume Basic Conveyors atomically and refund on pickup without releasing originals', () => {
  const f = new A.Factory(A.createState(1)), shack = place(f, 'primitiveShack', 40, 40);
  assert.equal(A.conveyorUpgradeCost('primitiveShack'), 6);
  assert.equal(A.conveyorUpgradeCost('copperChimes'), 1);
  assert.equal(A.conveyorUpgradeCost('orangeMetal'), 0);
  f.state.stock.electricConveyor = 5;
  const before = f.exportSave(); assert.ok(f.upgradeConveyors(shack.id).error); assert.equal(f.exportSave(), before);
  f.state.stock.electricConveyor = 6;
  assert.equal(f.upgradeConveyors(shack.id).amount, 6);
  assert.equal(f.state.stock.electricConveyor, 0); assert.equal(f.state.stock.belt, 0);
  assert.equal(f.electricity.demand, 6); assert.ok(f.upgradeConveyors(shack.id).error);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  assert.equal(f.move(shack.id, 50, 40, 'down').error, undefined);
  assert.equal(shack.conveyorUpgrade, 'electricConveyor');
  f.pickup(shack.id); assert.equal(f.state.stock.electricConveyor, 6); assert.equal(f.state.stock.belt, 0);
  assert.equal(f.electricity.demand, 0); assert.equal(f.state.storedMachines.find(m => m.id === shack.id).conveyorUpgrade, undefined);
  assert.equal(f.dismantle('primitiveShack').machines.belt, 6); assert.equal(f.state.stock.belt, 6);
  assert.equal(f.state.stock.electricConveyor, 6); assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
test('upgraded Duster conveyors use electricity while treatment independently requires kinetic power', () => {
  const f = new A.Factory(A.createState(1));
  place(f, 'heavyWheel', 39, 42); place(f, 'kineticGenerator', 40, 40, 'down');
  const duster = place(f, 'leekDuster', 60, 40); f.state.stock.electricConveyor = 3;
  assert.equal(f.upgradeConveyors(duster.id).amount, 3); assert.equal(f.electricity.demand, 3);
  assert.equal(feed(f, duster, A.cargo('nativeCopper', 1, 10)), 1);
  f.update(3); const untreated = A.copy(duster.lanes[2]);
  assert.equal(untreated.value, 10); assert.equal(untreated.materialHistory, undefined);
  delete duster.lanes[2]; place(f, 'wheel', 60, 38);
  assert.equal(f.kineticHasWheel(duster), true);
  assert.equal(feed(f, duster, untreated), 1); f.update(3);
  assert.equal(duster.lanes[2].value, 16.5);
  assert.equal(duster.lanes[2].materialHistory['leekDuster:nativeCopper:cash'], true);
});
test('upgraded Chimes transports a weight-five stack in one second and pauses on electrical shortage', () => {
  const f = new A.Factory(A.createState(1));
  const wheel = place(f, 'heavyWheel', 39, 42); place(f, 'kineticGenerator', 40, 40, 'down');
  const chimes = place(f, 'copperChimes', 60, 40); f.state.stock.electricConveyor = 1;
  f.upgradeConveyors(chimes.id); assert.equal(feed(f, chimes, A.cargo('copperIngot', 5, 20)), 5);
  f.update(0.4); assert.ok(Math.abs(chimes.lanes[0].progress - 0.4) < 1e-8);
  f.pickup(wheel.id); f.update(2); assert.ok(Math.abs(chimes.lanes[0].progress - 0.4) < 1e-8);
  place(f, 'heavyWheel', 39, 42); f.update(0.6);
  assert.ok(chimes.lanes[0].progress > 0.99); assert.equal(chimes.lanes[0].value, 25);
});
test('upgraded machines reject corrupt or inventory-stored upgrade records', () => {
  const f = new A.Factory(A.createState(1)), machine = place(f, 'copperChimes', 40, 40);
  f.state.stock.electricConveyor = 1; f.upgradeConveyors(machine.id);
  const payload = JSON.parse(f.exportSave()); payload.state.machines[0].conveyorUpgrade = 'unknown';
  assert.throws(() => A.Factory.importSave(JSON.stringify(payload)), /Invalid conveyor upgrade/);
  const stored = JSON.parse(f.exportSave()); stored.state.storedMachines.push(stored.state.machines.pop());
  stored.state.stock.copperChimes = 1;
  assert.throws(() => A.Factory.importSave(JSON.stringify(stored)), /Invalid conveyor upgrade/);
});
