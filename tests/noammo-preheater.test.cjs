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
function feed(f, machine, item, channel = 'material') {
  const p = A.ports(machine).find(p => p.channel === channel);
  return f.receive(machine, item, p.x, p.y, p.direction, true);
}

test('Preheater has the approved 2x2 footprint, cost and one crew', () => {
  assert.deepEqual(D.machines.preheater.cost, { cash: 1500, materials: { brick: 60, clay: 30 } });
  for (const facing of D.directions) {
    const f = new A.Factory(A.createState(1));
    const preheater = place(f, 'preheater', 40, 40, facing);
    assert.equal(A.cells(preheater).length, 4);
    assert.equal(f.availableCrew(), 19);
    assert.equal(A.ports(preheater).filter(p => p.channel === 'fuel').length, 1);
    assert.equal(A.ports(preheater).filter(p => p.channel === 'material').length, 1);
  }
});

test('preheating preserves value and quality and lets a full Kiln batch fire in six seconds', () => {
  for (const [material, quantity] of [['unfiredBrick', 2], ['unfiredPot', 1]]) {
    const f = new A.Factory(A.createState(1));
    const preheater = place(f, 'preheater', 40, 40), kiln = place(f, 'kiln', 42, 40);
    assert.equal(feed(f, preheater, A.cargo('wood'), 'fuel'), 1);
    assert.equal(feed(f, kiln, A.cargo('wood', 2), 'fuel'), 2);
    const item = A.cargo(material, quantity, 7); item.upgrades.primitive = 2;
    assert.equal(feed(f, preheater, item), quantity);
    f.update(0.1); assert.equal(preheater.heat, 24000);
    f.update(3); assert.equal(f.total(kiln, 'input'), quantity);
    assert.equal(kiln.input[0].preheated, true); assert.equal(kiln.input[0].value, 7);
    assert.equal(kiln.input[0].upgrades.primitive, 2);
    assert.equal(feed(f, preheater, item), quantity);
    f.update(3.1); assert.ok(kiln.job);
    assert.ok(kiln.job.remaining > 5.8); assert.equal(kiln.heat, 12000);
    f.update(6); assert.ok(kiln.output.length);
    assert.equal(kiln.output[0].preheated, undefined);
    assert.equal(kiln.output[0].value, 28);
  }
});

test('Preheater directly unloads mixed-value output without a cooldown and respects storage space', () => {
  const f = new A.Factory(A.createState(1));
  const preheater = place(f, 'preheater', 40, 40);
  preheater.heat = 6000;
  feed(f, preheater, A.cargo('unfiredBrick', 1, 3));
  feed(f, preheater, A.cargo('unfiredBrick', 1, 7));
  f.update(0.1); f.update(3);
  const storage = place(f, 'brickStorage', 42, 40);
  storage.contents = [A.cargo('clay', 599)];
  preheater.outputCooldown = 2;
  const loaded = A.Factory.importSave(f.exportSave());
  loaded.update(0.1);
  const heater = loaded.byId.get(preheater.id), container = loaded.byId.get(storage.id);
  assert.equal(loaded.total(container, 'contents'), 600);
  assert.equal(heater.output.length, 1);
  assert.equal(heater.output[0].value, 7);
  assert.equal(heater.output[0].preheated, true);
  loaded.collect(storage.id); loaded.update(0.1);
  assert.equal(heater.output.length, 0);
  assert.equal(container.contents[0].value, 7);
  assert.equal(container.contents[0].preheated, true);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test('unheated or mixed Kiln batches require twelve seconds and 96ku', () => {
  for (const mixed of [false, true]) {
    const f = new A.Factory(A.createState(1)), kiln = place(f, 'kiln', 40, 40);
    kiln.heat = 96000;
    const cold = A.cargo('unfiredPot'), hot = A.cargo('unfiredPot');
    if (mixed) hot.preheated = true;
    assert.equal(feed(f, kiln, cold), 1); assert.equal(feed(f, kiln, hot), 1);
    f.update(0.1); assert.equal(kiln.heat, 0); assert.equal(kiln.job.remaining, 12);
  }
});

test('preheated cargo and legacy saves survive loading', () => {
  const f = new A.Factory(A.createState(1)), preheater = place(f, 'preheater', 40, 40);
  preheater.heat = 6000; feed(f, preheater, A.cargo('unfiredPot'));
  f.update(0.1); f.update(3);
  const loaded = A.Factory.importSave(f.exportSave());
  assert.equal(loaded.byId.get(preheater.id).output[0].preheated, true);
  const old = JSON.parse(new A.Factory(A.createState(1)).exportSave());
  delete old.state.preheaterVersion; delete old.state.stock.preheater;
  assert.equal(A.Factory.importSave(JSON.stringify(old)).state.stock.preheater, 0);
});

test('preheating improves Unremarkable before firing resolves the burnished Standard chance', () => {
  const f = new A.Factory(A.createState(1));
  const preheater = place(f, 'preheater', 40, 40), kiln = place(f, 'kiln', 50, 40);
  preheater.heat = 6000; kiln.heat = 48000;
  const input = A.cargo('unfiredPot'); input.burnished = true;
  assert.deepEqual(A.gradeProbabilities(input), [0.2, 0.6, 0.2, 0, 0, 0]);
  assert.equal(feed(f, preheater, input), 1); f.update(0.1); f.update(3);
  const output = preheater.output[0];
  assert.equal(output.burnished, true); assert.equal(output.preheated, true);
  for (const [index, expected] of [0.2, 0.1, 0.7, 0, 0, 0].entries()) assert.ok(Math.abs(A.gradeProbabilities(output)[index] - expected) < 1e-8);
  assert.equal(feed(f, kiln, { ...output, quantity: 2 }), 2); f.update(0.1); f.update(6);
  const fired = kiln.output[0];
  for (const [index, expected] of [0.2, 0.1, 0, 0.595, 0.105, 0].entries()) assert.ok(Math.abs(A.gradeProbabilities(fired)[index] - expected) < 1e-8);
  assert.equal(fired.burnished, undefined); assert.equal(fired.preheated, undefined);
});

test('firing an unburnished Pot preserves its grade chances and preheating never rerolls graded cargo', () => {
  const f = new A.Factory(A.createState(1));
  const preheater = place(f, 'preheater', 40, 40), kiln = place(f, 'kiln', 50, 40);
  preheater.heat = 6000; kiln.heat = 48000;
  const input = A.cargo('unfiredPot'); input.graded = true;
  assert.equal(feed(f, preheater, input), 1); f.update(0.1); f.update(3);
  const output = preheater.output[0];
  assert.equal(output.graded, true); assert.deepEqual(A.gradeProbabilities(output), A.gradeProbabilities(input));
  assert.equal(feed(f, kiln, { ...output, quantity: 2 }), 2); f.update(0.1); f.update(6);
  assert.equal(kiln.output[0].graded, true);
  assert.deepEqual(A.gradeProbabilities(kiln.output[0]), A.gradeProbabilities(input));
});
