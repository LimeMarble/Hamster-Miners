const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const D = A.DATA;
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function setup() {
  const f = new A.Factory(A.createState(1));
  const wheel = place(f, 'heavyWheel', 39, 42);
  const generator = place(f, 'kineticGenerator', 40, 40, 'down');
  assert.equal(f.kineticConnections.get(generator.id).length, 2);
  return { f, wheel, generator };
}
function feed(f, m, item) {
  const p = A.ports(m).find(p => p.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, true);
}
test('paired kinetic inputs supply a shared budget and shortages pause and resume all electric cargo', () => {
  const { f, wheel } = setup();
  const orange = place(f, 'orangeMetal', 70, 40);
  const belt = place(f, 'electricConveyor', 72, 41);
  assert.deepEqual(f.electricity, { supply: 100, demand: 9, shortage: false });
  assert.equal(feed(f, orange, A.cargo('copperIngot', 1, 500)), 1);
  f.update(0.4); assert.ok(orange.lanes[0].progress > 0);
  const before = orange.lanes[0].progress;
  f.pickup(wheel.id); assert.equal(f.electricity.shortage, true);
  f.update(2); assert.equal(orange.lanes[0].progress, before); assert.equal(f.conveyorPowered(belt, belt.x, belt.y), false);
  place(f, 'heavyWheel', 39, 42); f.update(0.6);
  assert.equal(orange.lanes[0].value, 1500); assert.equal(orange.lanes[0].upgrades.orangeMetal, 1);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  for (let i = 0; i < 12; i++) place(f, 'orangeMetal', 80, 20 + i * 4);
  assert.equal(f.electricity.demand, 105); assert.equal(f.electricity.shortage, true);
});
test('one Heavy Wheel can power generators on both edges', () => {
  const { f } = setup();
  const second = place(f, 'kineticGenerator', 40, 45, 'up');
  assert.equal(f.kineticConnections.get(second.id).length, 2);
  assert.equal(f.electricity.supply, 200);
});
test('Orange Metal applies only in its base and incoming range, and repeats until the cap', () => {
  const { f } = setup(), orange = place(f, 'orangeMetal', 70, 40);
  function pass(item) {
    assert.equal(feed(f, orange, item), item.quantity); f.update(1);
    const result = A.copy(orange.lanes[0]); delete orange.lanes[0]; return result;
  }
  assert.equal(pass(A.cargo('copperIngot', 1, 499)).value, 499);
  assert.equal(pass(A.cargo('pot', 1, 500)).value, 500);
  assert.equal(pass(A.cargo('copperIngot', 1, 6000)).value, 6000);
  let item = A.cargo('copperIngot', 1, 500);
  for (let i = 0; i < 6; i++) item = pass(item);
  assert.equal(item.value, 6500); assert.equal(item.upgrades.orangeMetal, 6);
  assert.equal(pass(item).value, 6500);
});
test('electric conveyor moves one whole stack per second at weight 5 and preserves primitive timing', () => {
  const { f } = setup(), belt = place(f, 'electricConveyor', 70, 40);
  assert.equal(feed(f, belt, A.cargo('copperWire', 26)), 0);
  assert.equal(feed(f, belt, A.cargo('copperWire', 20)), 20);
  f.update(0.5); assert.ok(Math.abs(belt.lanes[0].progress - 0.5) < 1e-8);
  f.update(0.5); assert.ok(Math.abs(belt.lanes[0].progress - 1) < 1e-8);
  assert.equal(D.machines.electricConveyor.beltSeconds, 1);
  assert.equal(D.machines.belt.beltSeconds ?? D.config.beltSeconds, 2);
  assert.equal(D.machines.electricConveyor.beltWeight, 5);
  delete belt.lanes[0];
  const primitive = place(f, 'belt', 71, 40), basket = place(f, 'basket', 72, 40);
  f.powered = () => true;
  assert.equal(feed(f, belt, A.cargo('copperIngot')), 1);
  f.update(1); assert.ok(primitive.lanes[0]); assert.equal(basket.contents.length, 0);
  f.update(1); assert.ok(primitive.lanes[0]); assert.equal(basket.contents.length, 0);
  f.update(1); assert.equal(basket.contents[0].material, 'copperIngot');
});
test('older saves receive empty stock for the three new machines', () => {
  const f = new A.Factory(A.createState(1)), payload = JSON.parse(f.exportSave());
  delete payload.state.electricityVersion;
  for (const type of ['kineticGenerator', 'electricConveyor', 'orangeMetal']) delete payload.state.stock[type];
  const loaded = A.Factory.importSave(JSON.stringify(payload));
  for (const type of ['kineticGenerator', 'electricConveyor', 'orangeMetal']) assert.equal(loaded.state.stock[type], 0);
});
