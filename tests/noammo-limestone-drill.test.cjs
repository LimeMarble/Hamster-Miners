const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');

function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error);
  return result.machine;
}

function setup() {
  const f = new A.Factory(A.createState(1));
  const drill = place(f, 'limestoneDrill', 60, 40);
  const wheel = place(f, 'heavyWheel', 57, 40, 'down');
  return { f, wheel, drill };
}

test('limestone drill ports rotate together and use the agreed cost and power', () => {
  const def = A.DATA.machines.limestoneDrill;
  assert.equal(A.DATA.materials.zincOre.weight, 0.8);
  assert.deepEqual(def.cost, { cash: 2100000, materials: { granite: 200, wood: 100, copperPlate: 30, copperGear: 10 } });
  assert.equal(def.requiresHeavyKinetic, true);
  for (const [facing, directions] of Object.entries({ right: ['up', 'right', 'down'], down: ['right', 'down', 'left'], left: ['down', 'left', 'up'], up: ['left', 'up', 'right'] })) {
    const f = new A.Factory(A.createState(1));
    const drill = place(f, 'limestoneDrill', 60, 40, facing);
    assert.deepEqual(A.ports(drill).filter(p => p.role === 'output').map(p => p.direction), directions);
    assert.equal(A.ports(drill).find(p => p.role === 'kineticInput').direction, A.opposite(facing));
  }
});

test('outputs remain independent, retain one batch, and discard further excess', () => {
  const { f, drill } = setup();
  const limestone = place(f, 'basket', 63, 41);
  const zinc = place(f, 'basket', 61, 39);
  const corundum = place(f, 'basket', 61, 43);
  limestone.contents.push(A.cargo('limestone', 100));
  f.update(50); f.update(25);
  assert.equal(f.total(limestone, 'contents'), 100);
  assert.equal(f.total(zinc, 'contents'), 3);
  assert.equal(f.total(corundum, 'contents'), 1.5);
  assert.deepEqual(drill.output.map(item => [item.material, item.quantity]), [['limestone', 4]]);
  assert.match(f.status(drill), /Extracting/);
  limestone.contents = [];
  f.update(0.1);
  assert.equal(f.total(limestone, 'contents'), 4);
  assert.equal(drill.output.length, 0);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('Limestone Drill pauses without heavy kinetic and resumes without banking time', () => {
  const { f, wheel, drill } = setup();
  assert.deepEqual(f.electricity, { supply: 0, demand: 0, shortage: false });
  f.update(10);
  f.pickup(wheel.id);
  const basic = place(f, 'wheel', 58, 40, 'down');
  assert.equal(f.kineticConnections.get(drill.id)[0].wheel.id, basic.id);
  assert.match(f.status(drill), /Heavy Hamster Wheel/);
  f.update(60);
  assert.ok(Math.abs(drill.timer - 10) < 1e-6);
  assert.equal(drill.output.length, 0);
  f.pickup(basic.id);
  place(f, 'heavyWheel', 57, 40, 'down');
  f.update(15);
  assert.deepEqual(drill.output.map(item => [item.material, item.quantity]), [['limestone', 4], ['zincOre', 1], ['corundum', 0.5]]);
});

test('older saves gain empty Limestone Drill stock and Zinc Ore inventory', () => {
  const f = new A.Factory(A.createState(1)), payload = JSON.parse(f.exportSave());
  delete payload.state.limestoneDrillVersion;
  delete payload.state.stock.limestoneDrill;
  delete payload.state.inventory.zincOre;
  const loaded = A.Factory.importSave(JSON.stringify(payload));
  assert.equal(loaded.state.stock.limestoneDrill, 0);
  assert.equal(loaded.state.inventory.zincOre, 0);
});
