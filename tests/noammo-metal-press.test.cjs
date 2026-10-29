const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../noammo-simulation.js');
const D = A.DATA;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined);
  return result.machine;
}
function attach(f, intake, type = 'wheel') {
  const v = D.vectors[intake.direction], x = intake.x + v.x, y = intake.y + v.y;
  const candidates = [];
  for (const facing of D.directions) for (const output of A.ports({ type, x: 0, y: 0, facing })) {
    if (output.role !== 'kineticOutput' || output.direction !== A.opposite(intake.direction)) continue;
    const dx = x - output.x, dy = y - output.y;
    if (!f.placement(type, dx, dy, facing)) {
      const outlets = A.ports({ type, x: dx, y: dy, facing });
      const matches = f.state.machines.flatMap(A.ports).filter(p => p.role === 'kineticInput').filter(p => {
        const v = D.vectors[p.direction];
        return outlets.some(o => o.role === 'kineticOutput' && o.x === p.x + v.x && o.y === p.y + v.y && o.direction === A.opposite(p.direction));
      }).length;
      candidates.push({ x: dx, y: dy, facing, matches });
    }
  }
  candidates.sort((a, b) => b.matches - a.matches);
  if (candidates.length) { const p = candidates[0]; return place(f, type, p.x, p.y, p.facing); }
  assert.fail(`No space for ${type}`);
}
function setup(facing = 'right', heavy = true) {
  const f = new A.Factory(A.createState(1)), m = place(f, 'metalPress', 40, 40, facing);
  const inputs = A.ports(m).filter(p => p.role === 'kineticInput');
  const wheels = [attach(f, inputs[0], heavy ? 'heavyWheel' : 'wheel')];
  if (!heavy) wheels.push(attach(f, inputs[2]));
  return { f, m, wheels };
}
function feed(f, m, item) {
  const input = A.ports(m).find(p => p.role === 'input');
  return f.receive(m, item, input.x, input.y, input.direction, true);
}
function outlet(f, m, type = 'basket') {
  const p = A.ports(m).find(p => p.role === 'output'), v = D.vectors[p.direction];
  return place(f, type, p.x + v.x, p.y + v.y);
}

test('Press and Heavy Wheel costs enforce every ingredient atomically and dismantling recovers only construction parts', () => {
  const costs = {
    metalPress: { cash: 5e5, materials: { wood: 100, granite: 500, copperIngot: 50, woodenGear: 40 }, machines: { belt: 3 } },
    heavyWheel: { cash: 6e5, materials: { wood: 800, chert: 200, copperPlate: 50, copperGear: 15 } },
  };
  for (const [type, cost] of Object.entries(costs)) {
    assert.deepEqual(D.machines[type].cost, cost);
    const fund = () => {
      const f = new A.Factory(A.createState(1)); f.state.cash = cost.cash * 2;
      for (const [material, count] of Object.entries(cost.materials)) f.state.inventory[material] = count * 2;
      for (const [machine, count] of Object.entries(cost.machines ?? {})) f.state.stock[machine] = count * 2;
      return f;
    };
    for (const missing of ['cash', ...Object.keys(cost.materials), ...Object.keys(cost.machines ?? {})]) {
      const f = fund();
      if (missing === 'cash') f.state.cash -= 0.01;
      else if (missing in cost.materials) f.state.inventory[missing]--;
      else f.state.stock[missing]--;
      const before = f.exportSave(); assert.ok(f.buy(type, 2).error); assert.equal(f.exportSave(), before);
    }
    const f = fund(); assert.equal(f.buy(type, 2).amount, 2); near(f.state.cash, 0);
    const before = f.availableCrew(), m = f.place(type, 40, 40).machine;
    assert.ok(m); near(before - f.availableCrew(), type === 'heavyWheel' ? 2 : 0);
    f.pickup(m.id); assert.equal(f.dismantle(type).amount, 1); near(f.state.cash, 0);
    for (const [material, count] of Object.entries(cost.materials)) near(f.state.inventory[material], count);
    for (const [machine, count] of Object.entries(cost.machines ?? {})) near(f.state.stock[machine], count);
  }
});

test('Press kinetic connections rotate, require two dedicated inputs and cap adjacent-pair speed at 2x', () => {
  for (const facing of D.directions) for (const heavy of [false, true]) {
    const { f, m, wheels } = setup(facing, heavy);
    assert.equal(A.cells(m).length, 9); assert.equal(A.conveyorCells(m).length, 3);
    assert.equal(A.ports(m).filter(p => p.role === 'kineticInput').length, 4);
    assert.equal(A.cells(wheels[0]).length, heavy ? 12 : 6);
    assert.equal(f.pressPower(m).connections, 2); assert.equal(f.pressPower(m).speed, heavy ? 2 : 1);
    const output = outlet(f, m); assert.equal(feed(f, m, A.cargo('copperIngot', 1, 100)), 1);
    f.update(2); assert.ok(m.job); near(m.job.remaining, 4);
    f.update(heavy ? 1.9 : 3.9); assert.equal(m.output.length, 0); assert.equal(Object.keys(m.lanes).length, 0);
    f.update(0.1); assert.equal(m.job, null);
    f.update(4.2); near(output.contents[0].value, 150); near(output.contents[0].quantity, 1);
    assert.equal(output.contents[0].material, 'copperPlate');
    assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
  }
  const { f, m } = setup();
  attach(f, A.ports(m).filter(p => p.role === 'kineticInput')[2], 'heavyWheel');
  assert.deepEqual(f.pressPower(m), { connections: 4, speed: 2 });
  assert.equal(feed(f, m, A.cargo('moltenCopper')), 0); assert.equal(feed(f, m, A.cargo('clay')), 0);
  const s = setup(); assert.equal(feed(s.f, s.m, A.cargo('copperIngot', 2)), 2);
  s.f.update(2); assert.equal(s.m.job.input.quantity, 1); near(s.f.total(s.m, 'input'), 1);
  s.f.update(0.5); const remaining = s.m.job.remaining;
  const wheel = s.wheels[0]; s.f.pickup(wheel.id); s.f.update(5); near(s.m.job.remaining, remaining);
  assert.equal(s.f.place('heavyWheel', wheel.x, wheel.y, wheel.facing).error, undefined);
  s.f.update(1.5); assert.equal(s.m.lanes[1].quantity, 1); assert.equal(s.m.job.input.quantity, 1);
  const basic = setup('right', false); basic.f.pickup(basic.wheels[0].id);
  assert.deepEqual(basic.f.pressPower(basic.m), { connections: 1, speed: 0 });
  assert.equal(feed(basic.f, basic.m, A.cargo('copperIngot')), 0);
});

test('a Basic Wheel connected to two Presses contributes to neither, independent of machine order; Heavy Wheels can serve both sides', () => {
  const f = new A.Factory(A.createState(1));
  const lower = place(f, 'metalPress', 40, 40), upper = place(f, 'metalPress', 40, 35);
  const shared = place(f, 'wheel', 39, 38);
  attach(f, A.ports(lower).filter(p => p.role === 'kineticInput')[2]);
  attach(f, A.ports(upper).filter(p => p.role === 'kineticInput')[0]);
  for (const press of [lower, upper]) assert.deepEqual(f.pressPower(press), { connections: 1, speed: 0 });
  f.state.machines.reverse(); f.rebuild();
  for (const press of [lower, upper]) assert.deepEqual(f.pressPower(press), { connections: 1, speed: 0 });
  f.pickup(upper.id); assert.deepEqual(f.pressPower(lower), { connections: 2, speed: 1 });
  const top = A.ports(shared).find(p => p.role === 'kineticOutput' && p.direction === 'up');
  const drive = place(f, 'drive', top.x, top.y - 2, 'down');
  assert.equal(f.driveHasWheel(drive), true); assert.deepEqual(f.pressPower(lower), { connections: 1, speed: 0 });
  f.pickup(drive.id); assert.equal(f.pressPower(lower).speed, 1);

  const h = new A.Factory(A.createState(1)), wheel = place(h, 'heavyWheel', 39, 40);
  const a = place(h, 'metalPress', 40, 37), b = place(h, 'metalPress', 40, 43);
  for (const press of [a, b]) assert.deepEqual(h.pressPower(press), { connections: 2, speed: 2 });
  h.pickup(wheel.id); for (const press of [a, b]) assert.equal(h.pressPower(press).speed, 0);
});

test('Press combines consecutive Plates, preserves value/quality and stays bounded through blockage, modes, moves and saves', () => {
  const { f, m, wheels } = setup(); f.setPressMode(m.id, 'gear');
  const a = { ...A.cargo('copperPlate', 1, 10), upgrades: { graniteProcessor: 6 }, graded: true,
    gradeProfile: [0, 1, 0, 0, 0, 0], materialHistory: { 'leekDuster:copperPlate:cash': true } };
  const b = { ...A.cargo('copperPlate', 1, 20), gradeProfile: [0, 0, 0, 1, 0, 0] };
  assert.equal(feed(f, m, a), 1); f.update(5); assert.equal(m.job, null); near(f.total(m, 'input'), 1);
  assert.equal(feed(f, m, b), 1); f.update(2); assert.ok(m.job); f.update(2);
  const product = m.lanes[1]; assert.equal(product.material, 'copperGear'); near(product.value, 30);
  assert.equal(product.graded, true); assert.deepEqual(product.upgrades, {});
  assert.deepEqual(product.gradeProfile, [0, 0.5, 0, 0.5, 0, 0]);
  assert.equal(product.materialHistory['leekDuster:copperPlate:cash'], true);
  near(D.materials.copperGear.weight, D.materials.copperPlate.weight);
  f.update(2.1);
  for (let i = 0; i < 300; i++) { feed(f, m, A.cargo('copperPlate', 2)); f.update(0.1); }
  near(f.total(m, 'input'), 2); assert.equal(m.output.length, 1); assert.equal(m.job.remaining, 0);
  const blocked = f.exportSave(); f.update(10); assert.equal(f.total(m, 'input'), 2);
  const loaded = A.Factory.importSave(blocked), restored = loaded.byId.get(m.id);
  assert.deepEqual(restored, m); loaded.move(m.id, 60, 40, 'down');
  const paused = A.copy(restored.job); loaded.update(5); assert.deepEqual(restored.job, paused);
  loaded.setPressMode(m.id, 'plate'); assert.equal(restored.mode, 'plate'); near(loaded.state.inventory.copperPlate, 4);
  assert.deepEqual(restored.job, paused, 'running Gear cycle keeps its recipe');
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
  const remaining = [...restored.output, ...Object.values(restored.lanes), ...A.copy(restored.job ? [restored.job.input] : [])]
    .reduce((sum, item) => { sum[item.material] = (sum[item.material] ?? 0) + item.quantity; return sum; }, {});
  loaded.pickup(restored.id);
  for (const [material, amount] of Object.entries(remaining)) near(loaded.state.inventory[material], (material === 'copperPlate' ? 4 : 0) + amount);
  const replaced = loaded.place('metalPress', 70, 40).machine;
  assert.equal(replaced.mode, 'plate'); assert.equal(replaced.job, null); assert.deepEqual(replaced.input, []);
  assert.deepEqual(replaced.output, []); assert.deepEqual(replaced.lanes, {});
  f.pickup(wheels[0].id); assert.equal(f.kineticHasWheel(m), false);
});

test('old saves gain empty new inventories once, and malformed Press buffers/jobs are rejected', () => {
  const old = new A.Factory(A.createState(1)), payload = JSON.parse(old.exportSave());
  delete payload.state.metalPressVersion;
  for (const type of ['metalPress', 'heavyWheel']) delete payload.state.stock[type];
  for (const type of ['copperPlate', 'copperGear']) delete payload.state.inventory[type];
  const loaded = A.Factory.importSave(JSON.stringify(payload));
  for (const type of ['metalPress', 'heavyWheel']) assert.equal(loaded.state.stock[type], 0);
  for (const type of ['copperPlate', 'copperGear']) assert.equal(loaded.state.inventory[type], 0);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
  const { f, m } = setup();
  for (const alter of [
    p => { p.mode = 'fine'; }, p => { p.input = [A.cargo('clay')]; },
    p => { p.input = [A.cargo('copperIngot', 3)]; }, p => { p.output = [A.cargo('copperPlate', 2)]; },
    p => { p.job = { input: A.cargo('copperIngot'), mode: 'gear', remaining: 4 }; },
    p => { p.job = { input: A.cargo('copperIngot'), mode: 'plate', remaining: 5 }; },
  ]) {
    const save = JSON.parse(f.exportSave()); alter(save.state.machines.find(p => p.id === m.id));
    assert.throws(() => A.Factory.importSave(JSON.stringify(save)), /Press/);
  }
});

test('Press recipes follow material mappings instead of hardcoding Copper', () => {
  const data = A.copy(D);
  data.materials.testIngot = { ...data.materials.copperIngot, value: 20, weight: 1.4, pressesTo: 'testPlate' };
  data.materials.testPlate = { ...data.materials.copperPlate, value: 30, weight: 1.4, gearsTo: 'testGear' };
  data.materials.testGear = { ...data.materials.copperGear, value: 60, weight: 1.4 };
  const context = vm.createContext({ NoAmmoData: data });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'noammo-simulation.js'), 'utf8'), context);
  const api = context.NoAmmo, f = new api.Factory(api.createState(1));
  const m = place(f, 'metalPress', 40, 40); attach(f, A.ports(m).find(p => p.role === 'kineticInput'), 'heavyWheel');
  assert.equal(feed(f, m, api.cargo('testIngot', 1, 100)), 1); f.update(4);
  assert.equal(m.lanes[1].material, 'testPlate'); near(m.lanes[1].value, 150);
  f.setPressMode(m.id, 'gear');
  assert.equal(feed(f, m, api.cargo('testPlate', 1, 100)), 1); f.update(2.1);
  assert.equal(feed(f, m, api.cargo('testPlate', 1, 200)), 1); f.update(4.1);
  assert.equal(m.lanes[1].material, 'testGear'); near(m.lanes[1].value, 300);
  assert.equal(f.craftRecipe(m, api.cargo('copperPlate')).input, 2);
});
