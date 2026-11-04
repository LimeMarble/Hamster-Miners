const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const D = A.DATA;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine;
}
function connectHeavy(f, m) {
  const intake = A.ports(m).find(p => p.role === 'kineticInput'), v = D.vectors[intake.direction];
  for (const facing of D.directions) for (const out of A.ports({ type: 'heavyWheel', x: 0, y: 0, facing })) {
    if (out.role !== 'kineticOutput' || out.direction !== A.opposite(intake.direction)) continue;
    const x = intake.x + v.x - out.x, y = intake.y + v.y - out.y;
    if (f.placement('heavyWheel', x, y, facing)) continue;
    const points = A.ports({ type: 'heavyWheel', x, y, facing });
    if (A.ports(m).filter(p => p.role === 'kineticInput').every(p => {
      const d = D.vectors[p.direction];
      return points.some(o => o.role === 'kineticOutput' && o.x === p.x + d.x && o.y === p.y + d.y && o.direction === A.opposite(p.direction));
    })) return place(f, 'heavyWheel', x, y, facing);
  }
  assert.fail('No matching Heavy Wheel placement');
}
function feed(f, m, quantity, value) {
  const input = A.ports(m).find(p => p.role === 'input');
  return f.receive(m, A.cargo('wood', quantity, value), input.x, input.y, input.direction, true);
}
test('Sawmill combines wood and produces six planks at the averaged per-item value on heavy kinetic', () => {
  const f = new A.Factory(A.createState(1)), m = place(f, 'sawmill', 80, 40);
  connectHeavy(f, m); assert.equal(m.powerSource, 'kinetic'); assert.equal(f.dualPowered(m), true);
  assert.equal(feed(f, m, 1, 3), 1); f.update(4); assert.equal(m.job, null);
  assert.equal(feed(f, m, 1, 9), 1); f.update(2); assert.ok(m.job);
  f.update(5.9); assert.equal(m.output.length, 0); f.update(0.1);
  const plank = m.lanes[1] ?? m.output[0]; assert.equal(plank.material, 'plank'); near(plank.quantity, 6); near(plank.value, 6);
  near(plank.quantity * D.materials.plank.weight, 2);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
test('electric toggle draws 40u, processes in three seconds and pauses on shortage', () => {
  const f = new A.Factory(A.createState(1));
  const wheel = place(f, 'heavyWheel', 39, 42); place(f, 'kineticGenerator', 40, 40, 'down');
  const m = place(f, 'sawmill', 80, 40); f.setPowerSource(m.id, 'electric');
  assert.equal(f.electricity.demand, 40); assert.equal(f.electricity.supply, 100);
  assert.equal(feed(f, m, 2, 2), 2); f.update(2); assert.ok(m.job);
  f.pickup(wheel.id); f.update(5); near(m.job.remaining, 6);
  assert.equal(f.place('heavyWheel', wheel.x, wheel.y, wheel.facing).error, undefined);
  f.update(3); const plank = m.lanes[1] ?? m.output[0]; assert.equal(plank.material, 'plank'); near(plank.value, 2);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});
test('old saves acquire empty sawmill and plank inventories', () => {
  const f = new A.Factory(A.createState(1)), saved = JSON.parse(f.exportSave());
  delete saved.state.sawmillVersion; delete saved.state.stock.sawmill; delete saved.state.inventory.plank;
  const loaded = A.Factory.importSave(JSON.stringify(saved));
  assert.equal(loaded.state.stock.sawmill, 0); assert.equal(loaded.state.inventory.plank, 0);
});
