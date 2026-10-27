const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { Factory, DATA: D, cargo, ports } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error); return result.machine;
}
function setup(mode = 'up', facing = 'right') {
  const f = new Factory(A.createState(1));
  place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  const m = place(f, 'manualOverflow', 40, 40, facing);
  assert.equal(f.setOverflowMode(m.id, mode).error, undefined);
  return { f, m };
}
function outlet(f, m, manual) {
  const p = ports(m).find(p => p.role === 'output' && Boolean(p.mode) === manual), v = D.vectors[p.direction];
  return place(f, 'basket', p.x + v.x, p.y + v.y);
}
function feed(f, m, item, consume = true) {
  const p = ports(m).find(p => p.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, consume);
}
function block(m) { m.lanes[1] = { ...cargo('wood'), progress: 1 }; }

test('Manual Overflow exact purchase price, one crew, atomic purchases and both modes reserve five cells', () => {
  const f = new Factory(A.createState(1)), d = D.machines.manualOverflow;
  assert.deepEqual(d.cost, { cash: 2, materials: { wood: 20, woodenGear: 2 }, machines: { belt: 2 } });
  assert.equal(d.crew, 1); assert.equal(d.manualTransferSeconds, 2);
  f.state.cash = 4; Object.assign(f.state.inventory, { wood: 40, woodenGear: 4 }); f.state.stock.belt = 3;
  const before = f.exportSave(); assert.ok(f.buy('manualOverflow', 2).error); assert.equal(f.exportSave(), before);
  f.state.stock.belt++; assert.equal(f.buy('manualOverflow', 2).amount, 2);
  assert.equal(f.state.cash, 0); assert.equal(f.state.inventory.wood, 0); assert.equal(f.state.stock.belt, 0);
  const m = f.place('manualOverflow', 40, 40).machine;
  assert.equal(f.availableCrew(), D.config.startingCrew - 1);
  assert.deepEqual(A.cells(m), d.modeFootprints.up.map(([x, y]) => ({ x: x + 40, y: y + 40 })));
  f.setOverflowMode(m.id, 'down');
  assert.deepEqual(A.cells(m), d.modeFootprints.down.map(([x, y]) => ({ x: x + 40, y: y + 40 })));
});

for (const mode of ['up', 'down']) for (const facing of D.directions) {
  test(`Overflow ${mode}/${facing}: normal route wins at belt cadence, no hand pickup of departing output`, () => {
    const { f, m } = setup(mode, facing), normal = outlet(f, m, false), diverted = outlet(f, m, true);
    for (let i = 0; i < 8; i++) {
      assert.equal(feed(f, m, cargo('clay')), 1); f.update(2);
      assert.equal(m.job, null); assert.equal(diverted.contents.length, 0);
      if (i) near(f.total(normal, 'contents'), i);
    }
    f.update(2); near(f.total(normal, 'contents'), 8);
    assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
  });
  test(`Overflow ${mode}/${facing}: blocked stack uses exactly two seconds, bounded storage and unchanged metadata`, () => {
    const { f, m } = setup(mode, facing), diverted = outlet(f, m, true); block(m);
    const item = cargo('brick', 2, 17); item.upgrades = { brickSeal: 9, other: true };
    item.gradeRepairs = { brickSeal: 4 }; item.graded = true;
    const source = A.copy(item), before = f.exportSave();
    assert.equal(feed(f, m, item, false), 2); assert.equal(f.exportSave(), before);
    assert.equal(feed(f, m, item), 2); f.update(1.9); assert.equal(m.job, null);
    f.update(0.1); near(m.job.remaining, 2); assert.equal(diverted.contents.length, 0);
    f.update(1.9); assert.equal(diverted.contents.length, 0); f.update(0.1);
    assert.equal(m.job, null); const result = diverted.contents[0];
    for (const field of ['material', 'quantity', 'value', 'upgrades', 'graded', 'gradeRepairs']) assert.deepEqual(result[field], item[field]);
    assert.deepEqual(item, source); assert.equal(m.lanes[1].material, 'wood');
    diverted.contents = [cargo('clay', 100)];
    feed(f, m, cargo('brick', 2)); f.update(4); near(m.job.remaining, 0);
    feed(f, m, cargo('wood', 2)); assert.equal(feed(f, m, cargo('wood')), 0);
    f.update(20); near(m.job.input.quantity, 2); near(m.lanes[0].quantity, 2);
    assert.match(f.status(m), /blocked/i);
    diverted.contents = []; f.update(0.1); near(f.total(diverted, 'contents'), 2);
    assert.ok(m.job); near(m.job.remaining, 2);
    f.update(1.9); near(f.total(diverted, 'contents'), 2); f.update(0.1); near(f.total(diverted, 'contents'), 4);
  });
  test(`Overflow ${mode}/${facing}: inactive hamster tile is free, switching is atomic and rotated movement keeps mode`, () => {
    const { f, m } = setup(mode, facing), other = mode === 'up' ? 'down' : 'up';
    const newCell = A.cells({ ...m, mode: other }).find(p => !A.cells(m).some(q => q.x === p.x && q.y === p.y));
    const occupant = place(f, 'basket', newCell.x, newCell.y), before = f.exportSave();
    assert.ok(f.setOverflowMode(m.id, other).error); assert.equal(f.exportSave(), before);
    assert.equal(f.setOverflowMode(occupant.id, other).error, 'Invalid overflow mode.');
    f.pickup(occupant.id); assert.equal(f.setOverflowMode(m.id, other).error, undefined);
    assert.equal(f.at.get(A.key(newCell.x, newCell.y)).id, m.id);
    assert.equal(f.move(m.id, 50, 40, A.turn(facing, 1)).error, undefined);
    assert.equal(m.mode, other); const cells = A.cells(m);
    const plan = f.groupPlan([m.id], 55, 40, 1); assert.equal(plan.error, null); assert.equal(plan.machines[0].mode, other);
    assert.equal(f.moveGroup([m.id], 55, 40, 1).error, undefined); assert.equal(A.cells(m).length, cells.length);
    assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
    const point = A.cells({ ...m, mode }).find(p => !A.cells(m).some(q => q.x === p.x && q.y === p.y));
    place(f, 'basket', point.x, point.y); f.pickup(m.id);
    assert.equal(f.place('manualOverflow', m.x, m.y, m.facing).machine.mode, other);
  });
}

test('two-second transfer is independent of stack weight and continues without conveyor power once picked up', () => {
  for (const [material, quantity] of [['chert', 0.1], ['clay', 2], ['pot', 1]]) {
    const { f, m } = setup(), basket = outlet(f, m, true); block(m);
    feed(f, m, cargo(material, quantity)); f.update(2); near(m.job.remaining, 2);
    f.pickup(f.state.machines.find(m => m.type === 'wheel').id);
    f.update(1.9); assert.equal(basket.contents.length, 0); f.update(0.1); near(f.total(basket, 'contents'), quantity);
  }
});

test('continuous overflow maintains exactly one carried stack per two seconds without an extra output tick', () => {
  const { f, m } = setup(), basket = outlet(f, m, true); block(m);
  for (let i = 0; i < 12; i++) {
    assert.equal(feed(f, m, cargo('clay', 2)), 2); f.update(2);
    near(f.total(basket, 'contents'), i * 2); near(m.job.remaining, 2);
  }
  f.update(2); near(f.total(basket, 'contents'), 24);
});

test('normal conveyor and adjacent Overflow chains release downstream first in either construction order', () => {
  for (const targetType of ['belt', 'manualOverflow']) for (const reverse of [false, true]) {
    const { f, m } = setup();
    const next = targetType === 'belt' ? place(f, targetType, 42, 41) : place(f, targetType, 42, 40);
    const normal = targetType === 'belt' ? place(f, 'basket', 43, 41) : outlet(f, next, false);
    const diverted = outlet(f, m, true);
    if (reverse) { f.state.machines.reverse(); f.rebuild(); }
    for (let i = 0; i < 12; i++) {
      assert.equal(feed(f, m, cargo('clay')), 1); f.update(2);
      assert.equal(m.job, null); assert.equal(diverted.contents.length, 0);
    }
    f.update(6); near(f.total(normal, 'contents'), 12);
  }
});

test('overflow into a real Kiln respects its limited full-batch input and preserves leftovers', () => {
  const { f, m } = setup(); block(m);
  const kiln = place(f, 'kiln', 39, 38, 'up'); kiln.heat = 100000;
  for (let i = 0; i < 2; i++) { assert.equal(feed(f, m, cargo('unfiredBrick', 2)), 2); f.update(4.1); }
  f.update(0.1); assert.equal(kiln.job.recipe, 'unfiredBrick');
  near(kiln.job.inputs.reduce((sum, item) => sum + item.quantity, 0), 4); near(kiln.heat, 20000);
});

test('independent instances, carrying saves, mode changes and pickup recover each stack once', () => {
  const { f, m } = setup(); block(m); feed(f, m, cargo('clay', 2, 12)); f.update(2.7);
  const second = place(f, 'manualOverflow', 45, 40); assert.equal(second.job, null);
  const before = A.copy(m.job); f.setOverflowMode(m.id, 'down');
  assert.deepEqual(m.job, before); f.move(m.id, 41, 40, 'right');
  const loaded = Factory.importSave(f.exportSave()), restored = loaded.byId.get(m.id);
  assert.deepEqual(restored.job, before); assert.equal(restored.mode, 'down');
  const basket = outlet(loaded, restored, true); loaded.update(1.3); near(basket.contents[0].value, 12);
  feed(loaded, restored, cargo('clay', 2)); loaded.update(2);
  const clay = loaded.state.inventory.clay, wood = loaded.state.inventory.wood;
  loaded.pickup(restored.id); near(loaded.state.inventory.clay - clay, 2); near(loaded.state.inventory.wood - wood, 1);
  assert.equal(loaded.place('manualOverflow', 40, 40).machine.job, null);
  loaded.pickup(restored.id); near(loaded.state.inventory.clay - clay, 2);
});

test('old saves receive only zero Overflow stock, and malformed current modes, jobs and lanes reject', () => {
  const { f, m } = setup(); block(m); feed(f, m, cargo('clay')); f.update(2);
  const p = JSON.parse(f.exportSave()); delete p.state.manualOverflowVersion; delete p.state.stock.manualOverflow;
  // A true older save cannot already contain the newly added machine.
  p.state.machines = p.state.machines.filter(entry => entry.type !== 'manualOverflow');
  const old = Factory.importSave(JSON.stringify(p)); assert.equal(old.state.stock.manualOverflow, 0);
  for (const change of [m => { m.mode = 'left'; }, m => { m.job.remaining = 2.1; },
    m => { m.job.remaining = -1; }, m => { m.job.input.quantity = 3; },
    m => { m.lanes['00'] = cargo('wood'); }]) {
    const invalid = JSON.parse(f.exportSave()); change(invalid.state.machines.find(entry => entry.id === m.id));
    assert.throws(() => Factory.importSave(JSON.stringify(invalid)));
  }
});
