const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../noammo-simulation.js');
const Q = A.quality;
const { attachKineticWheel } = require('./helpers/noammo-centered.cjs');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ~ ${b}`);
function clay(w = 4, p = 4, quantity = 2, value = .25) {
  return { ...A.cargo('clay', quantity, value), quality: { workability: w, purity: p } };
}
function shape(item, spun = false) {
  const pot = A.blendGradeRepairs(A.cargo('unfiredPot', 1, item.value * 4), [item]);
  return spun ? Q.spin(pot) : pot;
}
const fire = item => A.blendGradeRepairs(A.cargo('pot', item.quantity, item.value * 4), [item]);
function place(f, type, x = 40, y = 40, facing = 'right') {
  f.state.stock[type]++;
  const result = f.place(type, x, y, facing); assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function feed(f, m, item, channel) {
  const p = A.ports(m).find(p => channel ? p.channel === channel : p.role === 'input');
  return f.receive(m, item, p.x, p.y, p.direction, true);
}

test('clay draws use the agreed probability intervals and independent per-batch source stats', () => {
  for (const [roll, expected] of [[0, 2], [.0499, 2], [.05, 3], [.1999, 3], [.20, 4], [.5999, 4], [.60, 5], [.8499, 5], [.85, 6], [.9999, 6]]) assert.equal(Q.draw(roll), expected);
  const f = new A.Factory(A.createState(1)), pit = place(f, 'clayPit'); attachKineticWheel(f, pit);
  f.update(A.DATA.machines.clayPit.cycle);
  assert.equal(f.total(pit, 'output'), A.DATA.machines.clayPit.sourceQuantity);
  const expected = []; let random = 1;
  for (let i = 0; i < 1; i++) {
    const values = [];
    for (let j = 0; j < 2; j++) { random = (Math.imul(1664525, random) + 1013904223) >>> 0; values.push(Q.draw(random / 4294967296)); }
    expected.push({ workability: values[0], purity: values[1] });
  }
  assert.deepEqual(pit.output.map(item => item.quality), expected);
  assert.equal(f.state.random, random);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state, f.state);
});

test('two independent source stats enumerate the expected workability-weighted raw clay grades', () => {
  const totals = {};
  for (const [w, a] of Q.distribution) for (const [p, b] of Q.distribution) {
    const letter = Q.grade(Q.score(clay(w, p))).name; totals[letter] = (totals[letter] ?? 0) + a * b;
  }
  near(Object.values(totals).reduce((a,b) => a+b), 1);
  near(Q.score(clay(4, 4)), 40); near(Q.score(clay(6, 2)), 52);
});

test('all agreed hand-shaped, spun, burnished and fired reference scores match exactly', () => {
  for (const [w, plain, spun, plainBurn, spunBurn, plainFired, spunFired] of [[4,33.4,53,38.4,58,54,66],[6,48.1,77.5,53.1,82.5,68,86]]) {
    const a = shape(clay(w,w)), b = shape(clay(w,w), true);
    near(Q.score(a),plain); near(Q.score(b),spun);
    Q.burnish(a); Q.burnish(b); near(Q.score(a),plainBurn); near(Q.score(b),spunBurn);
    a.preheated = b.preheated = true;
    near(Q.score(fire(a)),plainFired); near(Q.score(fire(b)),spunFired);
  }
});

test('spinning replaces properties and burnishing reaches its bounded target without repeat gains', () => {
  const item = shape(clay()); Q.spin(item); const spun = A.copy(item); Q.spin(item); assert.deepEqual(item, spun);
  Q.burnish(item); const finished = A.copy(item); Q.burnish(item); assert.deepEqual(item, finished);
  const mixed = A.combineCargo([finished, shape(clay(), true)]); Q.burnish(mixed); near(mixed.quality.smoothness, 7);
  const future = shape(clay(10,10),true); Q.burnish(future); near(future.quality.smoothness, 8.5);
});

test('preheating changes no immediate properties or score and prevents exactly two integrity loss', () => {
  const f = new A.Factory(A.createState(1)), item = shape(clay(), true);
  const prepared = f.preheatCargo(item, A.DATA.machines.primitiveOven);
  assert.deepEqual(prepared.quality,item.quality); near(Q.score(prepared),Q.score(item));
  near(fire(item).quality.integrity,2); near(fire(prepared).quality.integrity,4);
  near(Q.score(fire(prepared))-Q.score(fire(item)),8);
  const weak = shape(clay(2,2)); assert.equal(fire(weak).quality.integrity,0); assert.equal(fire(weak).quantity,1);
  const mixed = A.blendGradeRepairs(A.cargo('pot',2), [item,prepared]); near(mixed.quality.integrity,3);
});

test('all ordinary clay combinations stay below S through the agreed pre-paint pottery route', () => {
  for (const [w] of Q.distribution) for (const [p] of Q.distribution) {
    const pot = shape(clay(w,p),true); Q.burnish(pot); pot.preheated = true;
    assert.ok(Q.score(pot)<101); assert.ok(Q.score(fire(pot))<101);
  }
  const earth = shape(clay(10,10),true); assert.ok(Q.score(earth)>=101);
});

test('grade letters use integer bands while interpolation preserves fractional score', () => {
  for (const [score,letter,multiplier] of [[0,'F',1],[29,'F',1],[30,'E',1.1],[44,'E',1.4],[45,'D',1.5],[59,'D',1.8],[60,'C',2],[74,'C',3],[75,'B',4],[89,'B',8],[90,'A',10],[100,'A',50],[101,'S',100],[125,'S',1e5],[149,'S',1e8],[150,'T',1e10],[160,'T',1e11]]) {
    assert.equal(Q.grade(score).name,letter); near(Q.grade(score).multiplier,multiplier);
  }
  assert.equal(Q.grade(100.9).name,'A'); assert.equal(Q.grade(149.9).name,'S');
  near(Q.grade(33.4).multiplier,1.1*(1.4/1.1)**(3.4/14));
  near(Q.grade(155).multiplier,10**10.5);
});

test('assessment is deterministic and separate from cash, survives transformations and never compounds', () => {
  const item = shape(clay(),true), state = {random:123};
  const assessed = A.gradeStack(state,item); assert.equal(state.random,123); near(assessed.value,item.value);
  assert.equal(assessed.qualityAssessed,true); near(Q.saleValue(assessed),item.value*Q.grade(Q.score(item)).multiplier);
  assert.deepEqual(A.gradeStack(state,assessed),assessed);
  Q.burnish(assessed); assessed.preheated=true; const fired=fire(assessed);
  assert.equal(fired.qualityAssessed,true); near(Q.saleValue(fired),fired.value*Q.grade(Q.score(fired)).multiplier);
  const f=new A.Factory(A.createState(1)); near(f.sell([fired]),Q.saleValue(fired));
});

test('mixing averages properties by quantity and never spreads assessment to untreated cargo', () => {
  const a=A.gradeStack({random:1},clay(6,5,1)),b=clay(2,3,3);
  const result=A.combineCargo([a,b]); near(result.quality.workability,3); near(result.quality.purity,3.5);
  assert.equal(result.qualityAssessed,undefined); assert.equal(Boolean(result.graded),false);
  const assessed=A.gradeStack({random:1},result); assert.equal(assessed.qualityAssessed,true);
});

test('cash history survives shaping, firing and painting; score-to-brick transfer materializes assessment once', () => {
  const input=A.gradeStack({random:1},clay(4,4)); input.materialHistory={'leekDuster:clay:cash':true};
  const pot=shape(input,true); pot.preheated=true; const fired=fire(pot);
  const painted=A.blendGradeRepairs(A.cargo('paintedPot',1,fired.value*3),[fired]);
  assert.deepEqual(painted.quality,fired.quality); near(Q.score(painted),Q.score(fired));
  assert.equal(painted.materialHistory['leekDuster:clay:cash'],true);
  input.gradeRepairs={brickSeal:1};
  const brick=A.blendGradeRepairs(A.cargo('unfiredBrick',2,input.value),[input]);
  near(brick.value,Q.saleValue(input)); assert.equal(brick.quality,undefined); assert.equal(brick.graded,true);
});

test('inventory collection removes quality and assessment and cargo defaults never reroll', () => {
  const f=new A.Factory(A.createState(1)),basket=place(f,'basket');
  const high=A.gradeStack(f.state,clay(6,6,1)); basket.contents.push(high); f.collect(basket.id);
  assert.equal(f.state.inventory.clay,1); assert.equal(basket.contents.length,0);
  const random=f.state.random;
  for(let i=0;i<5;i++) { const output=A.cargo('clay'); assert.deepEqual(output.quality,{workability:2,purity:2}); assert.equal(output.graded,undefined); }
  assert.equal(f.state.random,random);
  for(const material of Q.materials) assert.deepEqual(A.cargo(material).quality,Q.defaults(material));
});

test('real spinning and burnishing machines apply formulas and save their running quality inputs', () => {
  const f=new A.Factory(A.createState(1)),spinner=place(f,'potSpinner'); attachKineticWheel(f,spinner);
  feed(f,spinner,clay()); f.update(.1);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).byId.get(spinner.id).job.input.quality,{workability:4,purity:4});
  f.update(8); near(Q.score(spinner.output[0]),53);
  const burnisher=place(f,'burnisher',60,40); attachKineticWheel(f,burnisher);
  feed(f,burnisher,A.copy(spinner.output[0])); f.update(.1); f.update(15);
  near(Q.score(burnisher.output[0]),58);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state,f.state);
});

test('real grader assesses without reroll and real painting preserves fired properties', () => {
  const f=new A.Factory(A.createState(1)),grader=place(f,'gradingBench');
  const item=shape(clay(),true); Q.burnish(item); item.preheated=true; const fired=fire(item);
  feed(f,grader,fired); const random=f.state.random; f.update(1.1);
  assert.equal(f.state.random,random); assert.equal(grader.output[0].qualityAssessed,true);
  const painter=place(f,'paintingBench',60,40); painter.water=.5;
  feed(f,painter,A.copy(grader.output[0]),'pot'); feed(f,painter,A.cargo('malachitePebble'),'malachite');
  f.update(6.2);
  assert.deepEqual(painter.output[0].quality,fired.quality); near(painter.output[0].value,fired.value*3);
});

test('invalid property metadata is rejected while old graded values migrate without another multiplier', () => {
  const f=new A.Factory(A.createState(1)),basket=place(f,'basket'); const item=A.cargo('pot');
  basket.contents=[item]; const save=JSON.parse(f.exportSave()); save.state.machines.find(m=>m.id===basket.id).contents[0].quality.purity=11;
  assert.throws(()=>A.Factory.importSave(JSON.stringify(save)),/cargo/i);
  const old=JSON.parse(f.exportSave()); delete old.state.propertyQualityVersion;
  const cargo=old.state.machines.find(m=>m.id===basket.id).contents[0]; delete cargo.quality; cargo.graded=true; cargo.value=123;
  const loaded=A.Factory.importSave(JSON.stringify(old)), restored=loaded.byId.get(basket.id).contents[0];
  near(Q.saleValue(restored),123); near(A.gradeStack(loaded.state,restored).value,123);
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state,loaded.state);
});

test('assessed cargo uses effective cash for upgrader limits and exact additive bonuses', () => {
  function pass(type, item) {
    const f=new A.Factory(A.createState(1)); place(f,'wheel',20,20); place(f,'drive',21,22,'up');
    if(A.DATA.machines[type].electricPower) { place(f,'heavyWheel',39,42); place(f,'kineticGenerator',40,40,'down'); }
    const machine=place(f,type,23,24); if(A.DATA.machines[type].requiresKinetic) attachKineticWheel(f,machine);
    feed(f,machine,item); f.update(1.1);
    return Object.values(machine.lanes)[0];
  }
  function assessed(value) { return A.gradeStack({random:1},clay(4,6,1,value)); }
  let item=assessed(.3); near(Q.saleValue(item),.42);
  let result=pass('primitive',item); near(Q.saleValue(result),.52);
  item=assessed(.4); result=pass('primitive',item); near(Q.saleValue(result),.56); assert.equal(result.upgrades.primitive,undefined);
  item=assessed(1); result=pass('pebblePile',item); near(Q.saleValue(result),1.55);
  item=assessed(1.2); result=pass('pebblePile',item); near(Q.saleValue(result),1.68); assert.equal(result.upgrades.pebblePile,undefined);
  const painted=A.cargo('paintedPot',1,350); painted.quality={workability:4,purity:4,integrity:4,regularity:4,smoothness:4};
  item=A.gradeStack({random:1},painted); const before=Q.saleValue(item); assert.ok(before>=500);
  result=pass('orangeMetal',item); near(Q.saleValue(result),before+1000);
});

test('real Kiln preserves per-input preheat quality while mixed batches retain cold firing time', () => {
  const f=new A.Factory(A.createState(1)), kiln=place(f,'kiln'); kiln.heat=250000;
  const cold=shape(clay(),true), warm={...A.copy(cold),preheated:true};
  feed(f,kiln,cold,'material'); feed(f,kiln,warm,'material'); f.update(.1);
  near(kiln.job.remaining,8); f.update(8);
  assert.equal(kiln.output.length,2);
  assert.deepEqual(kiln.output.map(item=>item.quality.integrity),[2,4]);
  assert.deepEqual(A.Factory.importSave(f.exportSave()).state,f.state);
});
