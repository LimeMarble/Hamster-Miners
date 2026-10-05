const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const material = (name, quantity = 1, extra = {}) => ({ kind: "material", material: name, quantity, ...extra });
const machine = (id, instanceId, column, row, orientation = "right", extra = {}) =>
  ({ ...game.MACHINE_LAYOUT[id], id, instanceId, column, row, orientation, ...extra });
const pipe = (id, column, row, orientation = "right", mode = "straight", extra = {}) =>
  machine("hotFluidPipe", id, column, row, orientation, { mode, ...extra });
function fresh(machines = [], overrides = {}) {
  const state = Object.assign(game.createInitialState(), { machines, tutorial: { stage: "complete", visible: false } }, overrides);
  game.__setState(state);
  return state;
}
function belt(owner, index = 0) {
  return { ...game.getInternalConveyorTiles(owner)[index], internalMachineId: owner.id,
    internalMachineInstanceId: owner.instanceId, internalIndex: index };
}
const liquid = (owner, name, quantity, extra = {}) => ({ kilnInstanceId: owner.instanceId,
  smelterInstanceId: owner.instanceId, material: name, quantity, ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function ticks(count, full = false) {
  for (let n = 0; n < count; n++) full ? game.update(0.1) : game.updateFactory(0.1);
}

test("cargo weights use per-unit quantities, including fractional gems and the agreed ammo bundles", () => {
  fresh();
  for (const [name, weight] of Object.entries({ ironIngot: 1, limestone: 1, wire: 0.2,
    contact: 0.3, silverCopperContact: 0.3, silverTinContact: 0.3, ironHeavyGear: 2,
    ironFineGear: 0.5, cutMalachite: 1, aggregate: 3 })) close(game.getCargoWeight(material(name, 10)), weight * 10);
  close(game.getCargoWeight(material("cutMalachite", 1)), 1);
  close(game.getCargoWeight(material("cutMalachite", 0.4)), 0.4);
  close(game.getCargoWeight(material("cutMalachite", 1.2)), 1.2);
  const ammo = { kind: "ammo", material: "leek", quantity: 10 };
  close(game.getCargoWeight(ammo), 1);
  close(game.getCargoWeight({ ...ammo, material: "lead", quantity: 25 }), 1.5);
  close(game.getCargoWeight({ ...ammo, material: "lead", quantity: 25, jacketMaterial: "nativeCopper" }), 2);
  close(game.getCargoWeight({ ...ammo, material: "lead", quantity: 25, casingMaterial: "bronze" }), 3);
  close(game.getCargoWeight({ ...ammo, material: "lead", type: "buckshot", quantity: 5, casingMaterial: "bronze" }), 3);
  assert.equal(game.getCargoWeight(material("wire", Infinity)), Infinity);
});

test("conveyors accept one stack within their weight limit and reject heavier newly placed cargo", () => {
  for (const [name, capacity, maximum] of [["wire", 5, 25], ["aggregate", 5, 1], ["aggregate", 30, 10]]) {
    const conveyor = { column: 5, row: 5, direction: "right", weightCapacity: capacity, item: null };
    fresh([], { placedConveyors: [conveyor] });
    assert.equal(game.getConveyorWeightCapacity(conveyor), capacity);
    assert.equal(game.placeItemOnConveyor(conveyor, material(name, maximum + 1)), false);
    assert.equal(game.placeItemOnConveyor(conveyor, material(name, maximum)), true);
    assert.equal(game.placeItemOnConveyor(conveyor, material(name, 1)), false);
  }
});

test("overweight saved cargo splits into whole items without losing value, tags, or its remainder", () => {
  for (const [name, quantity, capacity, maximum, weight] of [
    ["ironHeavyGear", 7, 5, 2, 4], ["aggregate", 10, 5, 1, 3], ["aggregate", 13, 30, 10, 30],
  ]) {
    const cargo = material(name, quantity, { tileProgress: 1, saleValueBase: 123,
      bronzeStampUses: 4, bronzePillarsUses: 1, annealedValueMultiplier: 1.7 });
    const source = { column: 5, row: 5, direction: "right", weightCapacity: capacity, item: cargo };
    const target = { column: 6, row: 5, direction: "right", weightCapacity: capacity, item: null };
    const state = fresh([], { placedConveyors: [source, target] });
    game.advanceConveyorItems(0);
    assert.equal(source.item.quantity, quantity - maximum);
    assert.equal(target.item.quantity, maximum);
    assert.equal(target.item.bronzeStampUses, 4);
    close(game.getItemSaleValue(target.item), 123 * 1.7);
    assert.equal(game.getCargoWeight(target.item), weight);
    let moved = target.item.quantity;
    for (let n = 0; n < quantity; n++) {
      target.item = null;
      if (source.item) source.item.tileProgress = 1;
      game.advanceConveyorItems(0);
      if (target.item) assert.ok(game.getCargoWeight(target.item) <= capacity);
      moved += target.item?.quantity ?? 0;
    }
    assert.equal(moved, quantity);
    assert.equal(source.item, null);
    assert.equal(Object.hasOwn(state, "extraConveyorItems"), false);
  }
});

test("partial departures do not let an upstream object overwrite the retained stack", () => {
  const upstream = { column: 4, row: 5, direction: "right", item: material("clay", 1, { tileProgress: 1 }) };
  const source = { column: 5, row: 5, direction: "right", item: material("ironHeavyGear", 5, { tileProgress: 1 }) };
  const destination = { column: 6, row: 5, direction: "right", item: null };
  fresh([], { placedConveyors: [upstream, source, destination] });
  game.advanceConveyorItems(0);
  assert.equal(upstream.item.material, "clay");
  assert.equal(source.item.quantity, 3);
  assert.equal(destination.item.quantity, 2);
});

test("fractional cargo keeps its fractional remainder when whole-item splitting is necessary", () => {
  const source = { column: 5, row: 5, direction: "right", item: material("cutMalachite", 13.2, { tileProgress: 1 }) };
  const destination = { column: 6, row: 5, direction: "right", item: null };
  fresh([], { placedConveyors: [source, destination] });
  game.advanceConveyorItems(0);
  assert.equal(destination.item.quantity, 5);
  close(source.item.quantity, 8.2);
  close(game.getCargoWeight(destination.item), 5);
  destination.item = null;
  source.item.tileProgress = 1;
  game.advanceConveyorItems(0);
  assert.equal(destination.item.quantity, 5);
  close(source.item.quantity, 3.2);
  destination.item = null;
  source.item.tileProgress = 1;
  game.advanceConveyorItems(0);
  close(destination.item.quantity, 3.2);
  close(game.getCargoWeight(destination.item), 3.2);
  assert.equal(source.item, null);
});

test("Contact Maker splits by whole recipes when its output gains weight", () => {
  const maker = machine("contactMaker", "contacts-weight", 5, 5);
  const wire = material("wire", 25, { tileProgress: 1, saleValueBase: 52 });
  const state = fresh([maker]);
  state.internalConveyorItems[`${maker.instanceId}:1`] = wire;
  state.contactMakerInputs[maker.instanceId] = { silver: 2.5, silverValue: 875 };
  game.advanceConveyorItems(0);
  const output = game.getConveyorItem(belt(maker, 2));
  assert.equal(output.quantity, 15);
  assert.equal(output.material, "contact");
  assert.equal(wire.quantity, 10);
  close(state.contactMakerInputs[maker.instanceId].silver, 1);
  close(game.getCargoWeight(output), 4.5);
});

test("coating and jacketing consume half a liquid unit per full bundle and preserve excess fluid", () => {
  const caster = machine("ammoShaper", "coating", 5, 5, "up");
  const kiln = machine("clayKiln", "coat-source", 4, 5);
  const state = fresh([caster, kiln]);
  state.mine.ammoShaperMode = "coated";
  state.internalConveyorItems[`${caster.instanceId}:1`] = material("leek", 3);
  state.moltenCopper.push(liquid(kiln, "lead", 2));
  assert.equal(game.startBulletCoreCasting(), true);
  close(state.moltenCopper[0].quantity, 0.5);
  const former = machine("jacketFormer", "jacketing", 5, 5, "up");
  state.machines = [former, kiln];
  game.__setState(state);
  state.internalConveyorItems[`${former.instanceId}:1`] = { kind: "ammo", material: "lead", quantity: 75, damage: 5 };
  state.moltenCopper = [liquid(kiln, "nativeCopper", 2)];
  assert.equal(game.startJacketFormerCoating(), true);
  close(state.moltenCopper[0].quantity, 0.5);
});

test("Aggregate Mixer has the approved cost, 4x3 footprint, two corner inputs and side output", () => {
  const mixer = machine("aggregateMixer", "mixer", 5, 5);
  const state = fresh([mixer]);
  assert.deepEqual(game.MACHINE_PURCHASES.aggregateMixer, {
    cash: 8e5, materials: { ironHeavyGear: 50, ironPlate: 100, ceramic: 50, wire: 150 },
  });
  assert.equal(game.getMachineOccupiedTiles(mixer).length, 12);
  assert.deepEqual(game.getInternalConveyorTiles(mixer).map(({ column, row }) => ({ column, row })), [{ column: 8, row: 6 }]);
  assert.equal(game.getBusyCrew(), 0);
  assert.equal(state.stockpile.aggregate, 0);
  for (const orientation of ["right", "up", "left", "down"]) {
    const rotated = { ...mixer, orientation };
    assert.equal(game.getInternalConveyorTiles(rotated).length, 1);
    assert.equal(game.getInternalConveyorTiles(rotated)[0].direction, orientation);
  }
});

test("both Mixer inputs accept either recipe material, stop at the recipe quantity and conserve overflow", () => {
  const mixer = machine("aggregateMixer", "mixer-cap", 5, 5);
  const source = { column: 4, row: 5, direction: "right", item: material("limestone", 5, { tileProgress: 1 }) };
  const state = fresh([mixer], { placedConveyors: [source] });
  state.aggregateMixerInputs[mixer.instanceId] = { limestone: 39, chert: 20 };
  assert.equal(game.canReceiveConveyorItem(material("chert", 1), 5, 7), false);
  assert.equal(game.canReceiveConveyorItem(material("ironIngot", 1), 5, 5), false);
  game.advanceConveyorItems(0);
  assert.equal(source.item.quantity, 4);
  assert.equal(state.aggregateMixerInputs[mixer.instanceId].limestone, 40);
  assert.equal(game.canAggregateMixerAcceptItem(mixer, material("limestone")), false);
});

test("Mixer takes ten seconds, emits all ten Aggregate in capacity-safe stacks and waits while blocked", () => {
  const mixer = machine("aggregateMixer", "mixer-cycle", 5, 5);
  const state = fresh([mixer]);
  game.receiveAggregateMixerItem(mixer, material("limestone", 40));
  game.receiveAggregateMixerItem(mixer, material("chert", 20));
  game.updateAggregateMixers(0);
  assert.equal(state.aggregateMixerJobs[mixer.instanceId].secondsRemaining, 10);
  game.updateAggregateMixers(9.9);
  assert.equal(game.getConveyorItem(belt(mixer)), null);
  game.updateAggregateMixers(0.1);
  assert.equal(game.getConveyorItem(belt(mixer)).quantity, 1);
  assert.equal(game.getCargoWeight(game.getConveyorItem(belt(mixer))), 3);
  assert.equal(state.aggregateMixerOutputs[mixer.instanceId], 9);
  state.aggregateMixerInputs[mixer.instanceId] = { limestone: 40, chert: 20 };
  game.updateAggregateMixers(50);
  assert.equal(state.aggregateMixerJobs[mixer.instanceId], undefined);
  for (let released = 2; released <= 10; released++) {
    state.internalConveyorItems[`${mixer.instanceId}:0`] = null;
    game.updateAggregateMixers(0);
    assert.equal(game.getConveyorItem(belt(mixer)).quantity, 1);
    assert.equal(state.aggregateMixerOutputs[mixer.instanceId], 10 - released);
    assert.equal(state.aggregateMixerJobs[mixer.instanceId], undefined);
  }
  assert.equal(state.aggregateMixerOutputs[mixer.instanceId], 0);
  state.internalConveyorItems[`${mixer.instanceId}:0`] = null;
  game.updateAggregateMixers(0);
  assert.equal(state.aggregateMixerJobs[mixer.instanceId].secondsRemaining, 10);
});

test("Mixer jobs and buffers are per-instance and survive save and movement", () => {
  const first = machine("aggregateMixer", "mixer-one", 5, 5);
  const second = machine("aggregateMixer", "mixer-two", 20, 5);
  const state = fresh([first, second]);
  game.receiveAggregateMixerItem(first, material("limestone", 40));
  game.receiveAggregateMixerItem(first, material("chert", 20));
  game.updateAggregateMixers(0);
  game.updateAggregateMixers(3);
  assert.equal(state.aggregateMixerJobs[second.instanceId], undefined);
  const restored = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  close(restored.aggregateMixerJobs[first.instanceId].secondsRemaining, 7);
  game.__setState(restored);
  game.pickUpSelectedFactoryEntity({ type: "machine", id: first.id, instanceId: first.instanceId }, true);
  game.placeMachine("aggregateMixer", 10, 12);
  assert.equal(restored.machines.find((item) => item.instanceId === first.instanceId).column, 10);
  close(restored.aggregateMixerJobs[first.instanceId].secondsRemaining, 7);
});

test("Hot Fluid Pipe is one Logistics item with all six forms and the approved price", () => {
  fresh();
  assert.deepEqual(game.MACHINE_PURCHASES.hotFluidPipe, {
    cash: 2.5e4, materials: { ceramic: 2, ironIngot: 2, tinIngot: 1, aggregate: 5 },
  });
  assert.equal(game.getMachineCategory("hotFluidPipe"), "logistics");
  assert.deepEqual(Object.keys(game.HOT_FLUID_PIPE_MODES), ["straight", "leftJunction", "rightJunction", "fourWayJunction", "turn", "cap"]);
  const forms = { straight: ["right"], leftJunction: ["right", "up"], rightJunction: ["right", "down"],
    fourWayJunction: ["right", "up", "down"], turn: ["up"], cap: [] };
  for (const [mode, expected] of Object.entries(forms)) assert.deepEqual(game.getHotFluidPipeOutputDirections(pipe("mode", 5, 5, "right", mode)), expected);
  assert.deepEqual(game.getHotFluidPipeOutputDirections(pipe("turn", 5, 5, "right", "turn", { turnSide: "right" })), ["down"]);
  assert.deepEqual(game.getHotFluidPipeOutputDirections(pipe("rotate", 5, 5, "up", "leftJunction")), ["up", "left"]);
});

test("one open outlet stops the whole connected network, caps seal it and separate networks keep running", () => {
  const root = pipe("root", 5, 5, "right", "leftJunction");
  const straight = pipe("forward", 6, 5);
  const end = pipe("end", 7, 5, "right", "cap");
  const sealed = pipe("separate", 15, 5, "right", "cap");
  const state = fresh([root, straight, end, sealed]);
  let network = game.getHotFluidPipeNetwork();
  assert.equal(network.nodes.get(root.instanceId).sealed, false);
  assert.equal(network.nodes.get(straight.instanceId).sealed, false);
  assert.equal(network.nodes.get(sealed.instanceId).sealed, true);
  state.machines.push(pipe("top-cap", 5, 4, "up", "cap"));
  game.__setState(state);
  network = game.getHotFluidPipeNetwork();
  assert.equal(network.nodes.get(root.instanceId).sealed, true);
  assert.equal(network.nodes.get(straight.instanceId).sealed, true);
});

test("pipes carry liquid identity, upgraded value and tags from smelter to a refractory caster", () => {
  const kiln = machine("clayKiln", "pipe-kiln", 4, 4);
  const conduit = pipe("pipe", 5, 5);
  const caster = machine("refractoryCaster", "pipe-caster", 6, 4);
  const state = fresh([kiln, conduit, caster]);
  state.moltenCopper.push(liquid(kiln, "silver", 4, { sourceValue: 313, sourceValueIsEffective: true,
    sourceMaterial: "silverIngot", cashUpgraderEligibility: { bronzeStampUses: 6, bronzePillarsUses: 1 } }));
  assert.equal(game.getHotFluidPipeNetwork().nodes.get(conduit.instanceId).sealed, true);
  game.updateHotFluidPipes(1);
  game.startMolderJob();
  const job = state.molderJobs[0];
  assert.equal(job.quantity, 4);
  assert.equal(job.material, "silver");
  assert.equal(job.sourceValue, 313);
  game.updateCrewOperatedMachines(2);
  const output = game.getConveyorItem(belt(caster));
  assert.equal(output.material, "silverIngot");
  assert.equal(output.quantity, 4);
  assert.equal(game.getItemSaleValue(output), 313);
  assert.equal(output.bronzeStampUses, 6);
  assert.equal(output.bronzePillarsUses, 1);
});

test("pipe throughput caps total outgoing fluid weight at thirty per second", () => {
  const first = pipe("rate-first", 5, 5);
  const second = pipe("rate-second", 6, 5);
  const caster = machine("refractoryCaster", "rate-caster", 7, 4);
  const state = fresh([first, second, caster]);
  state.moltenCopper.push(liquid(first, "iron", 100));
  game.updateHotFluidPipes(0.1);
  const transferred = state.moltenCopper.filter((entry) => entry.smelterInstanceId === second.instanceId);
  close(transferred.reduce((sum, entry) => sum + entry.quantity, 0), 3);
  close(state.moltenCopper.find((entry) => entry.smelterInstanceId === first.instanceId).quantity, 97);
  assert.equal(game.getAvailableLiquidQuantity(transferred[0], caster), 3);
});

test("junctions skip blocked/capped exits and preserve fluid instead of leaking or changing metal", () => {
  const root = pipe("split-root", 5, 5, "right", "leftJunction");
  const cap = pipe("closed-forward", 6, 5, "right", "cap");
  const turn = pipe("split-turn", 5, 4, "up", "turn", { turnSide: "right" });
  const caster = machine("refractoryCaster", "split-caster", 6, 3);
  const state = fresh([root, cap, turn, caster]);
  assert.equal(game.getHotFluidPipeNetwork().nodes.get(root.instanceId).sealed, true);
  state.moltenCopper.push(liquid(root, "bronze", 6, { sourceValue: 22, sourceValueIsEffective: true }));
  game.updateHotFluidPipes(0.1);
  assert.equal(state.moltenCopper.some((entry) => entry.smelterInstanceId === cap.instanceId), false);
  close(state.moltenCopper.filter((entry) => entry.material === "bronze").reduce((sum, entry) => sum + entry.quantity, 0), 6);
  assert.equal(state.moltenCopper.find((entry) => entry.smelterInstanceId === turn.instanceId).sourceValue, 22);
});

test("pipe mode, bend, liquid contents and unique ownership survive moving and save/load", () => {
  const conduit = pipe("save-pipe", 5, 5, "down", "turn", { turnSide: "right" });
  const state = fresh([conduit]);
  state.moltenCopper.push(liquid(conduit, "bronze", 2, { sourceValue: 99 }));
  game.pickUpSelectedFactoryEntity({ type: "machine", id: conduit.id, instanceId: conduit.instanceId }, true);
  game.placeMachine("hotFluidPipe", 10, 10);
  const restored = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  const saved = restored.machines.find((item) => item.instanceId === conduit.instanceId);
  assert.equal(saved.mode, "turn");
  assert.equal(saved.turnSide, "right");
  assert.equal(saved.orientation, "down");
  assert.equal(restored.moltenCopper[0].smelterInstanceId, saved.instanceId);
  assert.equal(restored.moltenCopper[0].material, "bronze");
  assert.equal(restored.moltenCopper[0].quantity, 2);
});

test("network topology is cached, rebuilt after mode changes and has no distance limit", () => {
  const pipes = Array.from({ length: 15 }, (_, n) => pipe(`long-${n}`, n + 5, 10));
  const caster = machine("refractoryCaster", "long-caster", 20, 9);
  fresh([...pipes, caster]);
  const network = game.getHotFluidPipeNetwork();
  assert.equal(network.nodes.get(pipes[0].instanceId).sealed, true);
  assert.strictEqual(game.getHotFluidPipeNetwork(), network);
  game.switchHotFluidPipeMode(pipes[7], "leftJunction");
  assert.notStrictEqual(game.getHotFluidPipeNetwork(), network);
  assert.equal(game.getHotFluidPipeNetwork().nodes.get(pipes[0].instanceId).sealed, false);
});

test("old saves get new material/machine defaults and both machines are exposed in Shop and Inventory", () => {
  const restored = game.hydrateSavedState({ machines: [], stockpile: {}, mine: {} });
  assert.equal(restored.stockpile.aggregate, 0);
  assert.equal(restored.machineInventory.aggregateMixer, 0);
  assert.equal(restored.machineInventory.hotFluidPipe, 0);
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const id of ["aggregateMixer", "hotFluidPipe"]) {
    assert.equal((html.match(new RegExp(`data-shop-machine="${id}"`, "g")) ?? []).length, 1);
    assert.equal((html.match(new RegExp(`data-inventory-machine="${id}"`, "g")) ?? []).length, 1);
  }
  assert.ok(game.CRAFTING_RECIPES.some((recipe) => recipe.name === "Aggregate"));
});

test("Stacker splits a heavy configured batch and releases its final remainder without new input", () => {
  const stacker = machine("stacker", "heavy-stacker", 5, 5, "right", { stackSize: 3 });
  const output = { column: 6, row: 5, direction: "right", item: null };
  const state = fresh([stacker], { placedConveyors: [output] });
  const cargo = material("ironHeavyGear", 3, { saleValueBase: 88, bronzePillarsUses: 1 });
  state.stackerBuffers[stacker.instanceId] = { item: cargo, itemKey: "heavy", quantity: 3 };
  game.emitStackerOutputs(1);
  assert.equal(output.item.quantity, 2);
  assert.equal(output.item.saleValueBase, 88);
  assert.equal(state.stackerBuffers[stacker.instanceId].quantity, 1);
  game.emitStackerOutputs(1);
  assert.equal(state.stackerBuffers[stacker.instanceId].quantity, 1);
  const restored = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  game.__setState(restored);
  restored.placedConveyors[0].item = null;
  game.emitStackerOutputs(1);
  assert.equal(restored.placedConveyors[0].item.quantity, 1);
  assert.equal(restored.placedConveyors[0].item.bronzePillarsUses, 1);
  assert.equal(restored.stackerBuffers[stacker.instanceId], undefined);
});

test("legacy oversized caster and ceramic output buffers drain without losing their remainders", () => {
  const caster = machine("refractoryCaster", "large-output", 5, 5);
  const furnace = machine("miniElectricArcFurnace", "large-ceramic", 10, 5);
  const outlet = game.getMachinePort(furnace, "liquidOutput");
  const output = { column: outlet.column + 1, row: outlet.row, direction: "right", item: null };
  const state = fresh([caster, furnace], { placedConveyors: [output] });
  state.molderOutputBuffers[caster.instanceId] = material("silverIngot", 7, { saleValueBase: 313, bronzeStampUses: 6 });
  state.arcFurnaceOutputBuffers[furnace.instanceId] = material("ceramic", 7);
  game.flushMolderOutputs();
  game.flushArcFurnaceOutputs();
  assert.equal(game.getConveyorItem(belt(caster)).quantity, 5);
  assert.equal(state.molderOutputBuffers[caster.instanceId].quantity, 2);
  assert.equal(output.item.quantity, 5);
  assert.equal(state.arcFurnaceOutputBuffers[furnace.instanceId].quantity, 2);
  state.internalConveyorItems[`${caster.instanceId}:0`] = null;
  output.item = null;
  game.flushMolderOutputs();
  game.flushArcFurnaceOutputs();
  assert.equal(game.getConveyorItem(belt(caster)).quantity, 2);
  assert.equal(game.getConveyorItem(belt(caster)).bronzeStampUses, 6);
  assert.equal(output.item.quantity, 2);
  assert.equal(state.molderOutputBuffers[caster.instanceId], undefined);
  assert.equal(state.arcFurnaceOutputBuffers[furnace.instanceId], undefined);
});

test("Casing Machine shares pipe credit across fluid records and spends only the required unit", () => {
  const casing = machine("casingMachine", "pipe-casing", 5, 5, "up", { mode: "buckshot" });
  const conduit = pipe("casing-feed", 4, 6);
  const state = fresh([casing, conduit]);
  const ammo = { kind: "ammo", material: "lead", jacketMaterial: "nativeCopper", quantity: 25,
    damage: 10, tileProgress: 1 };
  state.internalConveyorItems[`${casing.instanceId}:1`] = ammo;
  state.moltenCopper.push(liquid(conduit, "bronze", 0.3), liquid(conduit, "bronze", 9.7));
  conduit.pipeFlowCredit = 0.5;
  game.advanceConveyorItems(0);
  assert.equal(game.getConveyorItem(belt(casing, 2)), null);
  close(state.moltenCopper.reduce((sum, entry) => sum + entry.quantity, 0), 10);
  conduit.pipeFlowCredit = 1;
  close(game.getCasingMachineAvailableLiquid(casing).quantity, 1);
  ammo.tileProgress = 1;
  game.advanceConveyorItems(0);
  assert.equal(game.getConveyorItem(belt(casing, 2)).quantity, 5);
  close(state.moltenCopper.reduce((sum, entry) => sum + entry.quantity, 0), 9);
  close(conduit.pipeFlowCredit, 0);
});

test("fluid arrival updates Casing status without remounting its mode controls", () => {
  const casing = machine("casingMachine", "stable-controls", 5, 5, "up");
  const conduit = pipe("stable-feed", 4, 6);
  const state = fresh([casing, conduit]);
  state.moltenCopper.push(liquid(conduit, "bronze", 3));
  const before = game.getFactoryMachineProgressState(casing);
  state.moltenCopper[0].quantity += 0.3;
  conduit.pipeFlowCredit = 1.2;
  assert.equal(game.getFactoryMachineProgressState(casing), before);
});

test("both side liquid inputs remain usable when the first connected pipe is empty", () => {
  for (const id of ["ammoShaper", "jacketFormer"]) {
    const caster = machine(id, `both-${id}`, 5, 5, "up");
    const inputs = game.getMachinePorts(caster, "liquidInputs");
    const makeFeed = (port, id) => {
      const vector = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[port.direction];
      return pipe(id, port.column - vector[0], port.row - vector[1], port.direction);
    };
    const first = makeFeed(inputs[0], "empty-feed");
    const second = makeFeed(inputs[1], "working-feed");
    const state = fresh([caster, first, second]);
    state.mine.ammoShaperMode = "coated";
    state.internalConveyorItems[`${caster.instanceId}:1`] = id === "ammoShaper"
      ? material("leek") : { kind: "ammo", material: "lead", quantity: 25, damage: 5 };
    state.moltenCopper.push(liquid(second, id === "ammoShaper" ? "lead" : "nativeCopper", 2));
    second.pipeFlowCredit = 1;
    assert.equal(id === "ammoShaper" ? game.startBulletCoreCasting() : game.startJacketFormerCoating(), true);
    close(state.moltenCopper[0].quantity, 1.5);
  }
});

test("a full pipe exit is skipped while an alternative sealed branch keeps flowing", () => {
  const root = pipe("blocked-root", 5, 5, "right", "leftJunction");
  const full = pipe("full-exit", 6, 5);
  const firstCaster = machine("refractoryCaster", "blocked-end", 7, 4);
  const upper = pipe("upper-exit", 5, 4, "up");
  const bend = pipe("upper-bend", 5, 3, "up", "turn", { turnSide: "right" });
  const secondCaster = machine("refractoryCaster", "working-end", 6, 2);
  const state = fresh([root, full, firstCaster, upper, bend, secondCaster]);
  state.moltenCopper.push(liquid(root, "iron", 5), liquid(full, "iron", 30));
  game.updateHotFluidPipes(0.1);
  close(state.moltenCopper.find((entry) => entry.smelterInstanceId === full.instanceId).quantity, 30);
  close(state.moltenCopper.filter((entry) => [upper.instanceId, bend.instanceId].includes(entry.smelterInstanceId))
    .reduce((sum, entry) => sum + entry.quantity, 0), 3);
  close(state.moltenCopper.find((entry) => entry.smelterInstanceId === root.instanceId).quantity, 2);
});

test("an open outlet stops fluid transfers and consumption without destroying stored liquid", () => {
  const root = pipe("leaking-root", 5, 5, "right", "leftJunction");
  const caster = machine("refractoryCaster", "leaking-end", 6, 4);
  const state = fresh([root, caster]);
  state.moltenCopper.push(liquid(root, "silver", 4, { sourceValue: 313 }));
  root.pipeFlowCredit = 30;
  game.updateHotFluidPipes(1);
  assert.equal(game.startMolderJob(), false);
  assert.equal(state.moltenCopper[0].quantity, 4);
  assert.equal(state.moltenCopper[0].sourceValue, 313);
  assert.equal(root.pipeFlowCredit, 0);
});
