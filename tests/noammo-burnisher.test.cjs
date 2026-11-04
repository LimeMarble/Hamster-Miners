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
function attachWheel(f, m, side) {
  const input = A.ports(m).filter(p => p.role === 'kineticInput')[side];
  const v = D.vectors[input.direction];
  for (const facing of D.directions) for (const output of A.ports({ type: 'wheel', x: 0, y: 0, facing })) {
    if (output.direction !== A.opposite(input.direction)) continue;
    const x = input.x + v.x - output.x, y = input.y + v.y - output.y;
    if (!f.placement('wheel', x, y, facing)) return place(f, 'wheel', x, y, facing);
  }
  assert.fail('No valid Wheel connection');
}
function feed(f, m, item) {
  const p = A.ports(m).find(p => p.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, true);
}

test('Burnisher costs the proposed materials, occupies four cells and uses one crew', () => {
  assert.deepEqual(D.machines.burnisher.cost, { cash: 5000, materials: { wood: 100, chert: 40, woodenGear: 10, leekFiber: 15 } });
  for (const facing of D.directions) {
    const f = new A.Factory(A.createState(1)), m = place(f, 'burnisher', 40, 40, facing);
    assert.equal(A.cells(m).length, 4); assert.equal(f.availableCrew(), 9);
    assert.equal(A.ports(m).filter(p => p.role === 'kineticInput').length, 2);
  }
});

test('either kinetic intake powers a fifteen-second cycle in every orientation', () => {
  for (const facing of D.directions) for (const side of [0, 1]) {
    const f = new A.Factory(A.createState(1)), m = place(f, 'burnisher', 40, 40, facing);
    const wheel = attachWheel(f, m, side);
    assert.equal(f.kineticHasWheel(m), true);
    const item = A.cargo('unfiredPot', 1, 12); item.upgrades.primitive = 2;
    assert.equal(feed(f, m, item), 1); f.update(0.1);
    f.update(5); assert.ok(m.job.remaining > 9.9 && m.job.remaining < 10.1);
    f.pickup(wheel.id); const remaining = m.job.remaining;
    f.update(20); assert.equal(m.job.remaining, remaining);
    attachWheel(f, m, side); f.update(10);
    assert.equal(m.output.length, 1); assert.equal(m.output[0].material, 'unfiredPot');
    assert.equal(m.output[0].value, 12); assert.equal(m.output[0].upgrades.primitive, 2);
  }
});

test('Burnisher progress and older stock survive save loading', () => {
  const f = new A.Factory(A.createState(1)), m = place(f, 'burnisher', 40, 40);
  attachWheel(f, m, 0); feed(f, m, A.cargo('unfiredPot')); f.update(0.1); f.update(4);
  const loaded = A.Factory.importSave(f.exportSave());
  assert.equal(loaded.byId.get(m.id).job.remaining, m.job.remaining);
  const old = JSON.parse(new A.Factory(A.createState(1)).exportSave());
  delete old.state.burnisherVersion; delete old.state.stock.burnisher;
  assert.equal(A.Factory.importSave(JSON.stringify(old)).state.stock.burnisher, 0);
});

test('burnishing marks an unfired Pot without changing its grade chances', () => {
  const f = new A.Factory(A.createState(1)), m = place(f, 'burnisher', 40, 40);
  attachWheel(f, m, 0);
  const item = A.cargo('unfiredPot'); item.gradeProfile = [0.2, 0.1, 0.4, 0.25, 0.05, 0];
  assert.equal(feed(f, m, item), 1); f.update(0.1); f.update(15);
  assert.equal(m.output[0].burnished, true);
  assert.deepEqual(A.gradeProbabilities(m.output[0]), item.gradeProfile);
  const saved = A.Factory.importSave(f.exportSave());
  assert.equal(saved.byId.get(m.id).output[0].burnished, true);
});

test('Burnisher accepts unfired Pots but rejects Clay and fired Pots', () => {
  const f = new A.Factory(A.createState(1)), m = place(f, 'burnisher', 40, 40);
  attachWheel(f, m, 0);
  assert.equal(feed(f, m, A.cargo('clay')), 0);
  assert.equal(feed(f, m, A.cargo('pot')), 0);
  assert.equal(feed(f, m, A.cargo('unfiredPot')), 1);
});

test('Burnisher to Preheater to Kiln carries the deferred treatment through direct transfers', () => {
  const f = new A.Factory(A.createState(1)), burnisher = place(f, 'burnisher', 40, 40);
  attachWheel(f, burnisher, 0);
  const preheater = place(f, 'preheater', 43, 39), kiln = place(f, 'kiln', 45, 39);
  preheater.heat = 12000; kiln.heat = 48000;
  for (let i = 0; i < 2; i++) {
    const item = A.cargo('unfiredPot', 1, 7);
    item.gradeProfile = [0.2, 0.1, 0.4, 0.25, 0.05, 0];
    assert.equal(feed(f, burnisher, item), 1);
    f.update(0.1); f.update(15); f.update(3.1);
  }
  assert.ok(kiln.job); assert.equal(kiln.heat, 0);
  assert.ok(kiln.job.inputs.every(item => item.burnished && item.preheated));
  f.update(6);
  const fired = kiln.output[0]; assert.equal(fired.value, 28);
  for (const [i, expected] of [0.2, 0, 0, 0.675, 0.125, 0].entries()) {
    assert.ok(Math.abs(A.gradeProbabilities(fired)[i] - expected) < 1e-8);
  }
});
