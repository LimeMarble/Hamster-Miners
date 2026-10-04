const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");

function press(instanceId = "gear-test", column = 10, row = 10, orientation = "right") {
  return { ...game.MACHINE_LAYOUT.gearPress, id: "gearPress", instanceId, column, row, orientation };
}

function fresh(machines, overrides = {}) {
  const state = Object.assign(game.createInitialState(), { machines }, overrides);
  game.__setState(state);
  return state;
}

function belt(machine, index) {
  return {
    ...game.getInternalConveyorTiles(machine)[index],
    internalMachineId: "gearPress",
    internalMachineInstanceId: machine.instanceId,
    internalIndex: index,
  };
}

function plate(material = "ironPlate", quantity = 1, value = 0) {
  return { kind: "material", material, quantity, saleValueBase: value, baseValue: value };
}

function clearOutput(state, machine) {
  const output = game.getConveyorItem(belt(machine, 1));
  state.internalConveyorItems[`${machine.instanceId}:1`] = null;
  return output;
}

function ticks(count) {
  for (let index = 0; index < count; index += 1) game.updateFactory(0.1);
}

test("Gear Press costs the approved resources, has no crew, and defaults to Heavy Gear mode", () => {
  const machine = press();
  const state = fresh([machine]);
  assert.deepEqual(game.MACHINE_PURCHASES.gearPress, {
    cash: 4e5, materials: { ironIngot: 100, ironPlate: 50, wire: 100 },
  });
  assert.equal(game.getMachineCategory("gearPress"), "material");
  assert.equal(game.getGearPressMode(machine), "heavy");
  assert.equal(state.machineInventory.gearPress, 0);
  assert.equal(game.getBusyCrew(), 0);
  for (const material of Object.keys(game.GEAR_DEFINITIONS)) assert.equal(state.stockpile[material], 0);
  state.cash = 4e5;
  Object.assign(state.stockpile, { ironIngot: 100, ironPlate: 50, wire: 100 });
  assert.equal(game.canAffordMachinePurchase("gearPress"), true);
  game.purchaseMachine("gearPress");
  assert.equal(state.machineInventory.gearPress, 1);
  assert.equal(state.cash, 0);
  assert.equal(state.stockpile.ironIngot, 0);
  assert.equal(state.stockpile.ironPlate, 0);
  assert.equal(state.stockpile.wire, 0);
  assert.equal(game.canAffordMachinePurchase("gearPress"), false);
});

test("Gear Press copies Metal Press collision bounds and conveyor layout in every orientation", () => {
  for (const orientation of ["right", "down", "left", "up"]) {
    const machine = press("layout", 10, 10, orientation);
    const metalPress = { ...game.MACHINE_LAYOUT.metalPress, id: "metalPress", instanceId: "metal", column: 10, row: 10, orientation };
    assert.deepEqual(game.getMachineOccupiedTiles(machine), game.getMachineOccupiedTiles(metalPress));
    const layout = (item) => game.getInternalConveyorTiles(item).map(({ column, row, direction, speed }) => ({ column, row, direction, speed }));
    assert.deepEqual(layout(machine), layout(metalPress));
    assert.equal(game.getInternalConveyorTiles(machine).length, 2);
  }
});

test("Heavy Gear mode combines consecutive matching plates and sums their effective values", () => {
  const machine = press();
  const state = fresh([machine]);
  assert.equal(game.receiveGearPressInput(machine, plate("silverPlate", 1, 40)), true);
  assert.equal(game.getConveyorItem(belt(machine, 1)), null);
  assert.equal(state.gearPressInputs[machine.instanceId].quantity, 1);
  const second = { ...plate("silverPlate", 1, 60), annealedValueMultiplier: 1.7, bronzeStampUses: 6, bronzePillarsUses: 1 };
  assert.equal(game.receiveGearPressInput(machine, second), true);
  const output = game.getConveyorItem(belt(machine, 1));
  assert.equal(output.material, "silverHeavyGear");
  assert.equal(output.quantity, 1);
  assert.equal(game.getItemSaleValue(output), 142);
  assert.equal(output.baseValue, 100);
  assert.equal(output.annealedValueMultiplier, 1);
  assert.equal(output.bronzeStampUses, undefined);
  assert.equal(output.bronzePillarsUses, undefined);
  assert.equal(state.gearPressInputs[machine.instanceId], undefined);
});

test("Fine Gear mode splits each plate's effective value across two gears", () => {
  const machine = press();
  fresh([machine]);
  assert.equal(game.switchGearPressMode(machine, "fine"), true);
  assert.equal(game.receiveGearPressInput(machine, { ...plate("copperPlate", 3, 10), annealedValueMultiplier: 1.7 }), true);
  const output = game.getConveyorItem(belt(machine, 1));
  assert.equal(output.material, "copperFineGear");
  assert.equal(output.quantity, 6);
  assert.equal(game.getItemSaleValue(output), 8.5);
  assert.equal(game.getItemSaleValue(output) * output.quantity, 51);
  assert.equal(output.baseValue, 5);
  assert.equal(game.getFactoryMaterialVisualKind(output.material), "gear");
});

test("Gear Press supports both recipes for every existing plate metal without mixing materials", () => {
  const definitions = Object.entries(game.GEAR_DEFINITIONS);
  assert.equal(definitions.length, 12);
  for (const [material, definition] of definitions) {
    const machine = press();
    fresh([machine]);
    game.switchGearPressMode(machine, definition.mode);
    const inputQuantity = definition.mode === "heavy" ? 2 : 1;
    game.receiveGearPressInput(machine, plate(definition.plateMaterial, inputQuantity, 7));
    const output = game.getConveyorItem(belt(machine, 1));
    assert.equal(output.material, material);
    assert.equal(output.quantity, definition.mode === "heavy" ? 1 : 2);
    assert.equal(game.getItemSaleValue(output) * output.quantity, inputQuantity * 7);
    assert.equal(definition.weight, definition.mode === "heavy" ? 2 : 0.5);
  }
  const machine = press();
  fresh([machine]);
  game.receiveGearPressInput(machine, plate("ironPlate"));
  assert.equal(game.canGearPressAcceptInput(machine, plate("copperPlate")), false);
  assert.equal(game.canGearPressAcceptInput(machine, { kind: "material", material: "ironIngot", quantity: 1 }), false);
  assert.equal(game.canGearPressAcceptInput(machine, { kind: "ammo", material: "copperPlate", quantity: 2 }), false);
  assert.equal(game.canGearPressAcceptInput(machine, plate("ironPlate", 0.5)), false);
  assert.equal(game.canGearPressAcceptInput(machine, plate("ironPlate", Infinity)), false);
});

test("odd plate stacks conserve quantity and value across Heavy Gear cycles", () => {
  const machine = press();
  const state = fresh([machine]);
  game.receiveGearPressInput(machine, plate("copperPlate", 3, 30));
  const first = clearOutput(state, machine);
  assert.equal(first.quantity, 1);
  assert.equal(game.getItemSaleValue(first), 60);
  assert.deepEqual(state.gearPressInputs[machine.instanceId], {
    material: "copperPlate", quantity: 1, totalValue: 30, totalBaseValue: 30,
  });
  game.receiveGearPressInput(machine, plate("copperPlate", 1, 10));
  const second = clearOutput(state, machine);
  assert.equal(game.getItemSaleValue(second), 40);
  assert.equal(game.getItemSaleValue(first) + game.getItemSaleValue(second), 100);
  assert.equal(state.gearPressInputs[machine.instanceId], undefined);
});

test("mode changes preserve pending plates and never reprocess finished gears", () => {
  const machine = press();
  const state = fresh([machine]);
  game.receiveGearPressInput(machine, plate("bronzePlate", 1, 12));
  assert.equal(game.switchGearPressMode(machine, "invalid"), false);
  game.switchGearPressMode(machine, "fine");
  game.updateFactory(0);
  const finished = game.getConveyorItem(belt(machine, 1));
  assert.equal(finished.material, "bronzeFineGear");
  assert.equal(finished.quantity, 2);
  assert.equal(game.getItemSaleValue(finished), 6);
  game.switchGearPressMode(machine, "heavy");
  ticks(50);
  assert.equal(game.getConveyorItem(belt(machine, 1)), finished);
  assert.equal(finished.material, "bronzeFineGear");
  assert.equal(state.gearPressInputs[machine.instanceId], undefined);
});

test("real conveyor flow waits for the pair and emits on the transformer, not an extra tile", () => {
  const machine = press();
  const state = fresh([machine], { placedConveyors: [{ column: 12, row: 11, direction: "right", item: null }] });
  game.placeItemOnConveyor(belt(machine, 0), plate());
  ticks(20);
  assert.equal(game.getConveyorItem(belt(machine, 0)), null);
  assert.equal(state.gearPressInputs[machine.instanceId].quantity, 1);
  game.placeItemOnConveyor(belt(machine, 0), plate());
  ticks(20);
  assert.equal(game.getConveyorItem(belt(machine, 1)).material, "ironHeavyGear");
  assert.equal(game.getConveyorItem(state.placedConveyors[0]), null);
  ticks(20);
  assert.equal(game.getConveyorItem(belt(machine, 1)), null);
  assert.equal(game.getConveyorItem(state.placedConveyors[0]).material, "ironHeavyGear");
});

test("a blocked Gear Press stops intake without accumulating hidden plates", () => {
  const machine = press();
  const blocked = { column: 12, row: 11, direction: "right", item: plate("ironPlate") };
  const state = fresh([machine], { placedConveyors: [blocked] });
  game.receiveGearPressInput(machine, plate("ironPlate", 3, 20));
  const waiting = plate("ironPlate", 3, 40);
  game.placeItemOnConveyor(belt(machine, 0), waiting);
  assert.equal(game.receiveGearPressInput(machine, plate("ironPlate", 3, 50)), false);
  ticks(100);
  assert.equal(game.getConveyorItem(belt(machine, 0)), waiting);
  assert.equal(waiting.quantity, 3);
  assert.equal(state.gearPressInputs[machine.instanceId].quantity, 1);
  assert.equal(game.getItemSaleValue(game.getConveyorItem(belt(machine, 1))), 40);
  blocked.item = null;
  ticks(20);
  assert.equal(game.getConveyorItem(belt(machine, 0)), null);
  assert.equal(game.getConveyorItem(belt(machine, 1)).quantity, 2);
  assert.equal(state.gearPressInputs[machine.instanceId], undefined);
});

test("Fine Gear inputs progress while the previous gear stack traverses its output", () => {
  const machine = press();
  const state = fresh([machine], { placedConveyors: [{ column: 12, row: 11, direction: "right", item: null }] });
  machine.mode = "fine";
  game.placeItemOnConveyor(belt(machine, 0), plate());
  ticks(20);
  game.placeItemOnConveyor(belt(machine, 0), plate());
  ticks(1);
  assert.ok(game.getConveyorItem(belt(machine, 0)).tileProgress > 0);
  ticks(19);
  assert.equal(game.getConveyorItem(belt(machine, 0)), null);
  assert.equal(game.getConveyorItem(belt(machine, 1)).quantity, 2);
  assert.equal(game.getConveyorItem(state.placedConveyors[0]).quantity, 2);
});

test("Gear Press instances keep their modes, materials, values, and blocking independent", () => {
  const first = press("first");
  const second = press("second", 20, 10);
  const state = fresh([first, second]);
  second.mode = "fine";
  game.receiveGearPressInput(first, plate("copperPlate", 1, 30));
  game.receiveGearPressInput(second, plate("silverPlate", 3, 50));
  assert.equal(state.gearPressInputs.first.quantity, 1);
  assert.equal(state.gearPressInputs.second, undefined);
  assert.equal(game.getConveyorItem(belt(second, 1)).material, "silverFineGear");
  game.receiveGearPressInput(first, plate("copperPlate", 1, 10));
  assert.equal(game.getItemSaleValue(game.getConveyorItem(belt(first, 1))), 40);
  assert.equal(game.getItemSaleValue(game.getConveyorItem(belt(second, 1))), 25);
});

test("old saves gain safe gear defaults; mode and partial input survive moving and refresh", () => {
  const machine = press("saved-press", 10, 10, "up");
  const state = fresh([machine]);
  game.receiveGearPressInput(machine, plate("silverPlate", 1, 50));
  game.switchGearPressMode(machine, "fine");
  game.pickUpSelectedFactoryEntity({ type: "machine", id: machine.id, instanceId: machine.instanceId }, true);
  const reloaded = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.machineInventoryInstances[0].mode, "fine");
  assert.equal(reloaded.gearPressInputs[machine.instanceId].totalValue, 50);
  game.__setState(reloaded);
  game.placeMachine("gearPress", 30, 15);
  const restored = reloaded.machines[0];
  assert.equal(restored.instanceId, machine.instanceId);
  assert.equal(restored.orientation, "up");
  assert.equal(restored.mode, "fine");
  game.updateFactory(0);
  assert.equal(game.getItemSaleValue(game.getConveyorItem(belt(restored, 1))), 25);
  const oldSave = game.createInitialState();
  delete oldSave.gearPressInputs;
  delete oldSave.machineInventory.gearPress;
  for (const material of Object.keys(game.GEAR_DEFINITIONS)) delete oldSave.stockpile[material];
  oldSave.machines = [press()];
  delete oldSave.machines[0].mode;
  const hydrated = game.hydrateSavedState(oldSave);
  assert.equal(hydrated.machines[0].mode, "heavy");
  assert.deepEqual(hydrated.gearPressInputs, {});
  assert.equal(hydrated.stockpile.ironHeavyGear, 0);
  assert.equal(hydrated.machineInventory.gearPress, 0);
});

test("single and bulk pickups recover leftover plates and keep Gear Press configuration", () => {
  for (const bulk of [false, true]) {
    const first = press("pickup-first");
    const second = press("pickup-second", 20, 10);
    const state = fresh(bulk ? [first, second] : [first]);
    game.receiveGearPressInput(first, plate("ironPlate", 1));
    if (bulk) game.receiveGearPressInput(second, plate("copperPlate", 1));
    game.switchGearPressMode(first, "fine");
    const selections = (bulk ? [first, second] : [first]).map((machine) => ({
      type: "machine", id: machine.id, instanceId: machine.instanceId,
    }));
    if (bulk) {
      game.__setFactorySelection(selections);
      game.pickUpSelectedFactoryEntities();
    } else game.pickUpSelectedFactoryEntity(selections[0]);
    assert.equal(state.stockpile.ironPlate, 1);
    assert.equal(state.stockpile.copperPlate, bulk ? 1 : 0);
    assert.deepEqual(state.gearPressInputs, {});
    assert.equal(state.machineInventoryInstances[0].mode, "fine");
  }
});

test("gears can sell, enter storage, and resume at their unupgraded value on storage output", () => {
  const machine = press();
  const tube = { ...game.MACHINE_LAYOUT.sellTube, id: "sellTube", instanceId: "sell-gears", column: 20, row: 10 };
  const state = fresh([machine, tube]);
  game.receiveGearPressInput(machine, plate("silverPlate", 2, 50));
  const gear = clearOutput(state, machine);
  assert.equal(game.receiveConveyorItem(gear, 20, 10), true);
  assert.equal(state.cash, 100);
  assert.equal(game.getSaleValue("silverHeavyGear"), 68);
  assert.equal(game.getSaleValue("silverFineGear"), 17);
  assert.equal(game.getSaleValue("copperHeavyGear"), 4);
  assert.equal(game.getSaleValue("copperFineGear"), 1);
  const storage = { ...game.MACHINE_LAYOUT.materialStorage, id: "materialStorage", instanceId: "store-gears", column: 30, row: 10 };
  state.machines.push(storage);
  assert.equal(game.receiveConveyorItem({ kind: "material", material: "copperFineGear", quantity: 4, saleValueBase: 99 }, 30, 10), true);
  assert.equal(state.stockpile.copperFineGear, 4);
});

test("Gear Press controls do not redraw on conveyor animation ticks", () => {
  const machine = press();
  fresh([machine]);
  game.receiveGearPressInput(machine, plate("silverPlate", 2, 50));
  const signature = game.getFactoryMachineProgressState(machine);
  game.getConveyorItem(belt(machine, 1)).tileProgress = 0.5;
  assert.equal(game.getFactoryMachineProgressState(machine), signature);
  game.switchGearPressMode(machine, "fine");
  assert.notEqual(game.getFactoryMachineProgressState(machine), signature);
});

test("Metal Press can feed Gear Press directly and both gear modes preserve sale value end to end", () => {
  for (const mode of ["heavy", "fine"]) {
    const metalPress = { ...game.MACHINE_LAYOUT.metalPress, id: "metalPress", instanceId: "plate-maker", column: 7, row: 10 };
    const machine = press("gear-maker", 9, 10);
    machine.mode = mode;
    const tube = { ...game.MACHINE_LAYOUT.sellTube, id: "sellTube", instanceId: "sell-gears", column: 12, row: 10 };
    const state = fresh([metalPress, machine, tube], {
      placedConveyors: [{ column: 11, row: 11, direction: "right", item: null }],
    });
    const input = {
      ...game.getInternalConveyorTiles(metalPress)[0],
      internalMachineId: "metalPress", internalMachineInstanceId: metalPress.instanceId, internalIndex: 0,
    };
    game.placeItemOnConveyor(input, {
      kind: "material", material: "copperIngot", quantity: 2,
      saleValueBase: 5, baseValue: 2, annealedValueMultiplier: 1.7,
    });
    ticks(120);
    assert.equal(state.cash, 17, `the ${mode} production line must sell the completed gears`);
    assert.equal(state.gearPressInputs[machine.instanceId], undefined);
  }
});

test("Gear Press Shop, Inventory, recipes, and per-instance visuals are wired up", () => {
  const markup = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const id of ["gearPressInventoryCount", "selectGearPressButton", "buyGearPressButton"]) {
    assert.equal((markup.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1);
  }
  const shopCard = markup.match(/<article[^>]+data-shop-machine="gearPress"[\s\S]*?<\/article>/)[0];
  assert.equal((shopCard.match(/<article/g) ?? []).length, 1);
  assert.doesNotMatch(shopCard, /ceramic/i);
  assert.match(markup, /data-inventory-machine="gearPress"/);
  const names = game.CRAFTING_RECIPES.map(({ name }) => name);
  assert.ok(names.includes("Heavy Gears"));
  assert.ok(names.includes("Fine Gears"));
  const source = fs.readFileSync(path.join(__dirname, "..", "game-ui.js"), "utf8");
  assert.match(source, /getMachines\("gearPress"\)\.slice\(1\)/);
  assert.match(source, /getMachines\("gearPress"\)\.forEach/);
  assert.match(source, /switchGearPressMode\(machine, value\)/);
});
