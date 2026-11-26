const test = require('node:test');
const assert = require('node:assert/strict');
const {DATA:D, Factory, createState, cargo, ports} = require('../noammo-simulation.js');
const {attachKineticWheel} = require('./helpers/noammo-centered.cjs');
function place(f, type, x, y, facing='up') { f.state.stock[type]++; const result=f.place(type,x,y,facing); assert.equal(result.error,undefined); return result.machine; }
test('stripper processes wood into separate specified outputs and preserves wood value', () => {
 const f=new Factory(createState(1)), m=place(f,'woodStripper',40,40);
 assert.deepEqual(ports(m).map(p=>[p.x-40,p.y-40,p.direction,p.role,p.material]), [[0,0,'up','output','strippedWood'],[0,1,'down','input',undefined],[1,1,'right','output','leekFiber']]);
 assert.equal(f.receive(m,cargo('wood',1,0.4),40,41,'down',true),1);
 f.update(0.1); f.update(2);
 assert.deepEqual(m.output.map(i=>[i.material,i.quantity,i.value]),[['strippedWood',1,0.4],['leekFiber',6,0.05]]);
 const loaded=Factory.importSave(f.exportSave()); assert.equal(loaded.byId.get(m.id).output.length,2);
});
test('rope spinner requires wheel and doubles total fiber value', () => {
 const f=new Factory(createState(1)), m=place(f,'ropeSpinner',40,40,'right');
 const input=ports(m).find(p=>p.role==='input'); assert.equal(f.receive(m,cargo('leekFiber',3),input.x,input.y,input.direction,true),3);
 f.update(5); assert.equal(m.output.length,0);
 attachKineticWheel(f,m); f.update(0.1); f.update(4); assert.equal(m.output[0].material,'rope'); assert.ok(Math.abs(m.output[0].value-0.3)<1e-8); assert.equal(D.materials.rope.weight,.15);
});
test('wood bench accepts stripped wood for gears without accepting it for plates', () => {
 const f=new Factory(createState(1)), m=place(f,'crudeGearBench',40,40,'right'), p=ports(m).find(p=>p.role==='input');
 assert.equal(f.receive(m,cargo('strippedWood',1,.4),p.x,p.y,p.direction,true),1); f.update(.1); f.update(6);
 assert.equal(m.output[0].material,'woodenGear'); assert.equal(m.output[0].value,.8);
 m.output=[]; m.mode='plate'; assert.equal(f.receive(m,cargo('strippedWood'),p.x,p.y,p.direction,true),0);
});
test('a fresh free Sell Pile funds the first Stripper from Wood', () => {
 const f=new Factory(createState(1));
 assert.equal(f.state.stock.logger,1); assert.equal(f.state.stock.sellTube,1);
 const pile=f.place('sellTube',40,40,'right').machine;
 assert.equal(f.receive(pile,cargo('wood',50),40,40,null,true),50); assert.ok(Math.abs(f.state.cash-5)<1e-8);
 f.state.inventory.wood=10; f.state.inventory.chert=1;
 assert.equal(f.buy('woodStripper').amount,1); assert.equal(f.state.cash,0);
});
test('preexisting saves gain new inventories and a starting Logger without duplication', () => {
 const f=new Factory(createState(1)); const old=JSON.parse(f.exportSave());
 delete old.state.woodStripperVersion; delete old.state.inventory.rope; delete old.state.inventory.strippedWood;
 delete old.state.stock.ropeSpinner; delete old.state.stock.woodStripper; old.state.stock.logger=0;
 const loaded=Factory.importSave(JSON.stringify(old)); assert.equal(loaded.state.stock.logger,1);
 assert.equal(loaded.state.inventory.rope,0); assert.equal(loaded.state.stock.woodStripper,0);
 assert.equal(Factory.importSave(loaded.exportSave()).state.stock.logger,1);
});

test('Rope Spinner uses the requested ports and construction components', () => {
 const f=new Factory(createState(1)), m=place(f,'ropeSpinner',40,40,'right');
 assert.deepEqual(ports(m).map(p=>[p.x-40,p.y-40,p.direction,p.role]), [[0,0,'left','kineticInput'],[1,0,'down','input'],[1,0,'up','output']]);
 assert.deepEqual(D.machines.ropeSpinner.cost, {cash:10,materials:{wood:20,woodenGear:5},machines:{belt:1}});
});
