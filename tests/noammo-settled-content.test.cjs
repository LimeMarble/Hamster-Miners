const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const { DATA: D, Factory, cargo, ports, conveyorCells } = A;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
function place(f, type, x, y, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function powered() {
  const f = new Factory(A.createState(1));
  place(f, 'wheel', 38, 44); place(f, 'drive', 39, 42, 'down');
  assert.equal(f.powered(40, 40), true); return f;
}
function feed(f, machine, item, row = 0) {
  const input = ports(machine).filter(p => p.role === 'input')[row];
  return f.receive(machine, item, input.x, input.y, input.direction, true);
}
function pass(f, machine, item) {
  assert.equal(feed(f, machine, item), item.quantity); f.update(2);
  const result = A.copy(machine.lanes[0]); delete machine.lanes[0]; return result;
}
function pair(f, source, directions) {
  const out = ports(source)[0], v = D.vectors[out.direction], p = { x: -v.y, y: v.x };
  return [-0.5, 0.5].map((offset, i) => place(f, 'belt', Math.round(out.x + v.x + p.x * offset),
    Math.round(out.y + v.y + p.y * offset), directions?.[i] ?? source.facing));
}

test('settled construction prices, zero crew, stone base values and Copper base value are exact', () => {
  assert.deepEqual(D.machines.leekInfuser.cost, { cash: 20, materials: { leek: 20, leekFiber: 15 } });
  assert.deepEqual(D.machines.primitiveShack.cost, { cash: 5000, materials: { wood: 1000, leekFiber: 200, chert: 50, pot: 20 } });
  assert.deepEqual(D.machines.primitiveRockDrill.cost, { cash: 5000, materials: { chert: 40, wood: 50 } });
  assert.deepEqual(D.machines.primitiveBridge.cost, { cash: 10, materials: { wood: 50 }, machines: { belt: 4 } });
  for (const material of ['chert', 'granite', 'limestone']) assert.equal(D.materials[material].value, 0.1);
  assert.equal(D.materials.corundum.value, 1); assert.equal(D.materials.nativeCopper.value, 1.5);
  for (const type of ['leekInfuser', 'primitiveShack', 'primitiveBridge', 'primitiveRockDrill']) {
    assert.equal(D.machines[type].crew ?? 0, 0);
    const f = new Factory(A.createState(1)), cost = D.machines[type].cost;
    f.state.cash = cost.cash; Object.assign(f.state.inventory, cost.materials);
    Object.assign(f.state.stock, cost.machines ?? {});
    const before = f.exportSave(); f.state.cash -= 0.01;
    assert.ok(f.buy(type).error); f.state.cash += 0.01; assert.equal(f.exportSave(), before);
    assert.equal(f.buy(type).amount, 1); assert.equal(f.state.cash, 0);
    for (const material of Object.keys(cost.materials)) near(f.state.inventory[material], 0);
  }
});

test('Bridge multi-buy requires unplaced conveyors and consumes picked-up conveyor instances exactly once', () => {
  const f = new Factory(A.createState(1)); f.state.cash = 20; f.state.inventory.wood = 100;
  const conveyor = place(f, 'belt', 40, 40); f.state.stock.belt = 7;
  assert.ok(f.buy('primitiveBridge', 2).error, 'placed conveyors are not purchase ingredients');
  f.pickup(conveyor.id); assert.equal(f.state.stock.belt, 8);
  assert.equal(f.buy('primitiveBridge', 2).amount, 2); assert.equal(f.state.stock.belt, 0);
  assert.equal(f.state.storedMachines.some(m => m.id === conveyor.id), false);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Leek Infuser replaces Primitive with +$0.40 below $2, without consuming ingredients or mutating stacks', () => {
  const f = powered(), infuser = place(f, 'leekInfuser', 40, 40), before = A.copy(f.state.inventory);
  let item = cargo('clay', 5); item.graded = true; item.gradeRepairs = { brickSeal: 2 };
  for (let i = 0; i < 10; i++) item = pass(f, infuser, item);
  near(item.value, 2.25); assert.equal(item.upgrades.leekInfuser, 5);
  assert.equal(item.quantity, 5); assert.equal(item.graded, true); assert.equal(item.gradeRepairs.brickSeal, 2);
  assert.deepEqual(f.state.inventory, before);
  assert.equal(pass(f, infuser, cargo('brick', 1, 2)).value, 2);
  assert.equal(pass(f, infuser, cargo('soil')).upgrades.leekInfuser, undefined);
  const distant = place(f, 'leekInfuser', 80, 80); assert.equal(feed(f, distant, cargo('brick')), 0);
});

test('Brick Seal is additive, capped by incoming $15, and $9 reaches $15.25 in five uses', () => {
  const f = powered(), seal = place(f, 'brickSeal', 40, 40);
  let item = cargo('unfiredPot', 2, 9);
  for (let i = 0; i < 12; i++) item = pass(f, seal, item);
  near(item.value, 15.25); assert.equal(item.upgrades.brickSeal, 5); assert.equal(item.gradeRepairs.brickSeal, 4);
});

for (const facing of D.directions) test(`Shack ${facing}: six real belt cells, independent rows, one x2 use and six-second transit`, () => {
  const f = powered(), shack = place(f, 'primitiveShack', 40, 38, facing);
  assert.equal(A.cells(shack).length, 12); assert.equal(conveyorCells(shack).length, 6);
  const outputs = ports(shack).filter(p => p.role === 'output'), baskets = outputs.map(out => {
    const v = D.vectors[out.direction]; return place(f, 'basket', out.x + v.x, out.y + v.y);
  });
  assert.equal(feed(f, shack, cargo('pot', 1, 61), 0), 1);
  assert.equal(feed(f, shack, cargo('nativeCopper', 3, 2.3), 1), 3);
  f.update(5.9); assert.equal(baskets[0].contents.length, 0); f.update(0.1);
  near(baskets[0].contents[0].value, 122); near(baskets[1].contents[0].value, 4.6);
  assert.equal(baskets[0].contents[0].upgrades.primitiveShack, 1);
  assert.equal(feed(f, shack, baskets[0].contents[0]), 1); f.update(6);
  assert.equal(baskets[0].contents[0].value, 122, 'crossing several cells or another pass cannot repeat the effect');
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Shack uses declared base >=$1.20, not family, stack value or rounded current value', () => {
  const f = powered(), shack = place(f, 'primitiveShack', 40, 38);
  for (const material of ['clay', 'brick', 'unfiredPot', 'leek', 'wood', 'corundum']) {
    feed(f, shack, cargo(material, 1, 50)); f.update(6);
    const item = shack.lanes[2]; assert.equal(item.value, 50); assert.equal(item.upgrades.primitiveShack, undefined);
    delete shack.lanes[2];
  }
  feed(f, shack, cargo('pot', 1, 100)); f.update(6); assert.equal(shack.lanes[2].value, 100);
  const blocked = A.copy(shack.lanes[2]); f.update(60); assert.deepEqual(shack.lanes[2], blocked);
  assert.equal(f.receive(shack, cargo('pot'), shack.x, shack.y, 'left', true), 0, 'body is not a conveyor');
});

for (const facing of D.directions) for (const type of ['clayPit', 'primitiveRockDrill']) {
  test(`${type} ${facing}: true midpoint and strict single/mismatched/opposing conveyor blockage`, () => {
    const f = powered(), source = place(f, type, 40, 38, facing), out = ports(source)[0];
    assert.equal(ports(source).length, 1); assert.equal(out.span, 2);
    assert.equal(Number.isInteger(out.x) !== Number.isInteger(out.y), true);
    const belts = pair(f, source); source.output.push(cargo(type === 'clayPit' ? 'clay' : 'chert'));
    f.pickup(belts[1].id); f.update(0.1); assert.equal(source.output.length, 1);
    f.place('belt', belts[1].x, belts[1].y, A.opposite(facing)); f.update(0.1);
    assert.equal(source.output.length, 1);
    f.move(belts[0].id, belts[0].x, belts[0].y, A.turn(facing, 1));
    f.move(belts[1].id, belts[1].x, belts[1].y, A.turn(facing, -1));
    f.update(0.1); assert.equal(source.output.length, 1, 'conveyors pointing at each other have no front');
  });
  test(`${type} ${facing}: downstream front priority is rotation-independent`, () => {
    const f = powered(), source = place(f, type, 40, 38, facing);
    const belts = pair(f, source, [A.turn(facing, 1), facing]);
    source.output.push(cargo(type === 'clayPit' ? 'clay' : 'chert'));
    f.update(0.1); assert.equal(source.output.length, 0);
    assert.equal(belts[0].lanes[0], undefined); assert.equal(belts[1].lanes[0].lateral, undefined);
    assert.equal(belts[1].lanes[0].quantity, 1);
  });
}

test('same-facing parallel conveyors share one centered object and reserve both lanes without duplication', () => {
  const f = powered(), source = place(f, 'primitiveRockDrill', 40, 38), belts = pair(f, source);
  const next = [place(f, 'belt', 44, 38), place(f, 'belt', 44, 39)];
  const tube = place(f, 'sellTube', 45, 38);
  source.output.push(cargo('chert', 2, 3)); f.update(0.1);
  assert.equal(Object.keys(belts[0].lanes).length + Object.keys(belts[1].lanes).length, 1);
  assert.equal(belts[0].lanes[0].lateral, 0.5);
  assert.equal(f.receive(belts[1], cargo('wood'), belts[1].x, belts[1].y, 'left', true), 0, 'secondary footprint is reserved');
  f.update(2); assert.equal(next[0].lanes[0].lateral, 0.5);
  f.update(2); near(f.state.cash, 6); assert.equal(f.state.soldItems, 2);
  assert.equal(Object.keys(next[0].lanes).length + Object.keys(next[1].lanes).length, 0);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
  assert.equal(tube.type, 'sellTube');
});

test('centered probes are read-only, blocked secondary lanes stop intake, and missing support pauses existing cargo safely', () => {
  const f = powered(), source = place(f, 'clayPit', 40, 38), belts = pair(f, source);
  const out = ports(source)[0], v = D.vectors[out.direction], point = { x: out.x + v.x, y: out.y + v.y };
  const before = f.exportSave(); assert.equal(f.receiveCentered(cargo('clay'), point, 'right', false), 1);
  assert.equal(f.exportSave(), before);
  belts[1].lanes[0] = cargo('wood'); source.output.push(cargo('clay')); f.update(0.1);
  assert.equal(source.output.length, 1); delete belts[1].lanes[0]; f.update(0.1);
  const item = belts[0].lanes[0]; f.pickup(belts[1].id); f.update(20);
  near(item.progress, 0); assert.equal(belts[0].lanes[0], item);
  assert.deepEqual(Factory.importSave(f.exportSave()).state, f.state);
});

test('Rock Drill selection, five-second batches, bounded blockage and timers survive independent moves and reloads', () => {
  let f = powered(), drill = place(f, 'primitiveRockDrill', 40, 38), other = place(f, 'primitiveRockDrill', 45, 38);
  assert.equal(A.cells(drill).length, 6); assert.equal(drill.mode, 'chert'); assert.equal(ports(drill).length, 1);
  f.update(4.9); assert.equal(drill.output.length, 0); f.update(0.1);
  assert.equal(drill.output[0].quantity, 2); assert.equal(drill.output[0].material, 'chert');
  f.update(60); assert.equal(f.total(drill, 'output'), 2); near(drill.timer, 0);
  assert.ok(f.setSourceMode(drill.id, 'limestone').error); f.setSourceMode(drill.id, 'granite');
  assert.equal(other.mode, 'chert'); f.move(drill.id, 70, 70, 'up');
  f = Factory.importSave(f.exportSave()); drill = f.byId.get(drill.id); assert.equal(drill.mode, 'granite');
  assert.equal(drill.output[0].material, 'chert', 'mode changes do not rewrite waiting products');
  f.pickup(drill.id); assert.equal(f.state.inventory.chert, 2); drill = f.place('primitiveRockDrill', 40, 38).machine;
  assert.equal(drill.mode, 'granite'); f.update(5); assert.equal(drill.output[0].material, 'granite');
});

for (const facing of D.directions) test(`Bridge ${facing}: independent crossing cargo, six-second upper transit and save/group lifecycle`, () => {
  const f = powered(), bridge = place(f, 'primitiveBridge', 40, 38, facing), tiles = conveyorCells(bridge);
  const lower = place(f, 'belt', tiles[1].x, tiles[1].y, A.turn(facing, 1));
  const v = D.vectors[facing], w = D.vectors[lower.facing];
  const topBasket = place(f, 'basket', tiles[2].x + v.x, tiles[2].y + v.y);
  const lowBasket = place(f, 'basket', lower.x + w.x, lower.y + w.y);
  assert.equal(feed(f, bridge, cargo('wood', 2, 7)), 2);
  assert.equal(f.receive(lower, cargo('brick', 1, 9), lower.x, lower.y, A.opposite(lower.facing), true), 1);
  f.update(2); assert.equal(lowBasket.contents[0].material, 'brick'); assert.equal(topBasket.contents.length, 0);
  assert.equal(bridge.lanes[1].material, 'wood');
  const saved = Factory.importSave(f.exportSave()); assert.deepEqual(saved.state, f.state);
  saved.update(4); assert.equal(saved.byId.get(topBasket.id).contents[0].value, 7);
  assert.equal(saved.byId.get(lowBasket.id).contents[0].value, 9);
  assert.equal(saved.moveGroup([bridge.id, lower.id], 70, 70, 1).error, undefined);
  assert.deepEqual(Factory.importSave(saved.exportSave()).state, saved.state);
  saved.pickup(bridge.id); assert.ok(saved.byId.has(lower.id));
});

test('only bridge middles share ordinary belts, in either placement order; all other overlaps reject atomically', () => {
  for (const order of [false, true]) {
    const f = powered();
    if (order) place(f, 'belt', 41, 38);
    const bridge = place(f, 'primitiveBridge', 40, 38);
    if (!order) place(f, 'belt', 41, 38);
    for (const [type, x, y] of [['basket', 41, 38], ['leekInfuser', 41, 38], ['belt', 40, 38], ['belt', 42, 38], ['primitiveBridge', 41, 38]]) {
      assert.ok(f.placement(type, x, y, 'right'));
    }
    const before = f.exportSave(); assert.ok(f.move(bridge.id, 41, 38, 'down').error);
    assert.equal(f.exportSave(), before);
    assert.deepEqual(Factory.importSave(before).state, f.state);
  }
});

test('old saves get new content defaults once; malformed new tags, modes, buffers and centered offsets reject', () => {
  const f = new Factory(A.createState(1)), old = JSON.parse(f.exportSave()); delete old.state.settledContentVersion;
  for (const type of ['leekInfuser', 'primitiveShack', 'primitiveBridge', 'primitiveRockDrill']) delete old.state.stock[type];
  for (const material of ['granite', 'limestone', 'corundum', 'nativeCopper']) delete old.state.inventory[material];
  const loaded = Factory.importSave(JSON.stringify(old)); assert.equal(loaded.state.stock.primitiveShack, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  const belt = place(f, 'belt', 40, 40);
  for (const item of [{ ...cargo('brick'), lateral: 1 }, { ...cargo('pot'), upgrades: { primitiveShack: 2 } }]) {
    belt.lanes[0] = item; assert.throws(() => Factory.importSave(f.exportSave()), /cargo/);
  }
  delete belt.lanes[0]; const drill = place(f, 'primitiveRockDrill', 45, 40);
  drill.mode = 'limestone'; assert.throws(() => Factory.importSave(f.exportSave()), /Rock Drill/);
  drill.mode = 'chert'; drill.output.push(cargo('chert', 3)); assert.throws(() => Factory.importSave(f.exportSave()), /Rock Drill/);
});
