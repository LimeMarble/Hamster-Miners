const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { DATA: D, Factory, cargo, ports } = A;
function place(f, type, x = 40, y = 40, facing = 'right') {
  f.state.stock[type]++; const result = f.place(type, x, y, facing); assert.equal(result.error, undefined); return result.machine;
}
function powered(type) {
  const f = new Factory(A.createState(1)); place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  const m = place(f, type); if (D.machines[type].requiresKinetic) require('./helpers/noammo-centered.cjs').attachKineticWheel(f, m); return { f, m };
}
function feed(f, m, item) {
  const p = ports(m).find(p => p.role === 'input'); return f.receive(m, item, p.x, p.y, p.direction, true);
}

for (const type of Object.keys(D.machines).filter(type => A.supportsOutputHistory(type) && type !== 'gradingBench')) {
  test(`${type}: history has only the latest five processed values, newest first, including unchanged capped passes`, () => {
    const { f, m } = powered(type), expected = [];
    for (let i = 0; i < 7; i++) {
      const item = cargo('brick', 2, 2500 + i); // Above every early upgrader ceiling.
      assert.equal(feed(f, m, item), 2); f.update(6);
      const result = Object.values(m.lanes)[0]; assert.ok(result);
      expected.unshift({ value: result.value, quantity: 2, grade: null }); expected.length = Math.min(5, expected.length);
      assert.deepEqual(f.recentOutputs(m.id), expected);
      f.update(60); assert.deepEqual(f.recentOutputs(m.id), expected, 'blocked cargo is not recorded per tick');
      m.lanes = {};
    }
    const copy = f.recentOutputs(m.id); copy[0].value = 0; assert.notEqual(f.recentOutputs(m.id)[0].value, 0);
  });
}

test('Upgrader records actual post-effect unit value and quantity, not input value or a rounded cash total', () => {
  const { f, m } = powered('brickSeal');
  feed(f, m, cargo('brick', 2, 4.12345)); f.update(1);
  assert.deepEqual(f.recentOutputs(m.id), [{ value: 5.37345, quantity: 2, grade: null }]);
  const snapshot = f.recentOutputs(m.id); m.lanes[0].value = 500; assert.deepEqual(f.recentOutputs(m.id), snapshot);
});

test('Histories are per-instance, follow movement, clear on pickup/replacement and never contaminate saves or cargo', () => {
  const { f, m } = powered('leekInfuser'), second = place(f, 'leekInfuser', 43, 40);
  feed(f, m, cargo('clay', 1, 0.25)); feed(f, second, cargo('clay', 1, 1)); f.update(1);
  assert.equal(f.recentOutputs(m.id)[0].value, 0.65); assert.equal(f.recentOutputs(second.id)[0].value, 1.4);
  const before = f.recentOutputs(m.id); f.move(m.id, 45, 40, 'down'); assert.deepEqual(f.recentOutputs(m.id), before);
  const restored = Factory.importSave(f.exportSave()); assert.deepEqual(restored.state, f.state);
  assert.deepEqual(restored.recentOutputs(m.id), []); assert.doesNotMatch(f.exportSave(), /outputHistories|recentOutputs/);
  f.pickup(m.id); assert.deepEqual(f.recentOutputs(m.id), []);
  const replacement = f.place('leekInfuser', 40, 40).machine; assert.deepEqual(f.recentOutputs(replacement.id), []);
  assert.equal(f.recentOutputs(second.id).length, 1);
});

test('Grading logs each actual rolled grade and post-grade value without a second RNG roll or persistent grade category', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'gradingBench'), collector = place(f, 'basket', 42, 41);
  const expected = [];
  for (const [seed, grade, multiplier] of [[2000, 'Poor', 0.75], [0, 'Unremarkable', 1], [500, 'Standard', 1.5], [1000, 'Fine', 2.5], [1500, 'Remarkable', 8], [1900, 'Exceptional', 40], [500, 'Standard', 1.5]]) {
    f.state.random = seed;
    const input = { ...cargo('pot', 2, 120), gradeProfile: [0.2, 0.1, 0.3, 0.1, 0.25, 0.05] };
    const reference = { random: seed }; A.gradeStack(reference, input);
    assert.equal(feed(f, m, input), 2); f.update(4.1);
    expected.unshift({ value: 120 * multiplier, quantity: 2, grade }); expected.length = Math.min(5, expected.length);
    assert.deepEqual(f.recentOutputs(m.id), expected); assert.equal(f.state.random, reference.random);
    assert.equal(collector.contents.at(-1).grade, undefined); assert.equal(collector.contents.at(-1).graded, true);
  }
});

test('Blocked grading logs once; already-graded stacks retain value and explicitly say Already graded', () => {
  const f = new Factory(A.createState(1900)), m = place(f, 'gradingBench');
  const input = { ...cargo('pot', 1, 120), gradeProfile: [0.2, 0.1, 0.3, 0.1, 0.25, 0.05] };
  feed(f, m, input); f.update(2.1); const history = f.recentOutputs(m.id);
  assert.deepEqual(history, [{ value: 4800, quantity: 1, grade: 'Exceptional' }]);
  const random = f.state.random; f.update(60); assert.deepEqual(f.recentOutputs(m.id), history); assert.equal(f.state.random, random);
  m.output = []; feed(f, m, { ...cargo('pot', 1, 777), graded: true }); f.update(2.1);
  assert.deepEqual(f.recentOutputs(m.id)[0], { value: 777, quantity: 1, grade: 'Already graded' }); assert.equal(f.state.random, random);
});

test('Unpowered work and non-upgrader belts do not invent output history', () => {
  const f = new Factory(A.createState(1)), m = place(f, 'brickSeal');
  assert.equal(feed(f, m, cargo('pot')), 0); f.update(60); assert.deepEqual(f.recentOutputs(m.id), []);
  const belt = place(f, 'belt', 45, 40); f.recordOutput(belt, cargo('wood')); assert.deepEqual(f.recentOutputs(belt.id), []);
});
