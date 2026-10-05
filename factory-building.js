"use strict";

// Factory placement, purchase actions, machine jobs, and group interactions.

function getTutorialStage() {
  return state.tutorial.stage;
}

function isFactoryGridTile(column, row) {
  return column >= 0
    && column < FACTORY_COLUMNS
    && row >= FACTORY_GRID_START_ROW
    && row < FACTORY_GRID_START_ROW + FACTORY_ROWS;
}

function isTileInsideMachine(column, row, machine) {
  return getMachineOccupiedTiles(machine).some((tile) => (
    tile.column === column && tile.row === row
  ));
}

function isBuildableFactoryTile(column, row, excludedMachines = [], excludedConveyors = []) {
  const excludedMachineSet = new Set(Array.isArray(excludedMachines) ? excludedMachines : [excludedMachines]);
  const excludedConveyorSet = new Set(Array.isArray(excludedConveyors) ? excludedConveyors : [excludedConveyors]);
  const placedConveyor = getPlacedConveyor(column, row);
  if (!isFactoryGridTile(column, row)
    || (placedConveyor && !excludedConveyorSet.has(placedConveyor))) {
    return false;
  }

  return !state.machines.some((machine) => (
    !excludedMachineSet.has(machine) && isTileInsideMachine(column, row, machine)
  ))
    && !getActiveFixedConveyors().some((conveyor) => (
      !excludedConveyorSet.has(conveyor)
        && conveyor.column === column
        && conveyor.row === row
    ));
}

function getTutorialPlacementRequirement() {
  if (getTutorialStage() === "factoryPlaceFirst") {
    return STARTER_ROUTE_CONVEYORS[0];
  }

  if (getTutorialStage() === "factoryPlaceSecond") {
    return STARTER_ROUTE_CONVEYORS[1];
  }

  return null;
}

function isInitialTutorialRouteInProgress() {
  return state.tutorial.visible && [
    "intro",
    "factoryRoute",
    "inventorySelect",
    "factoryPlaceFirst",
    "factoryPlaceSecond",
  ].includes(getTutorialStage());
}

function isMachineFootprintBuildable(
  machine,
  column,
  row,
  orientation = machine.orientation,
  excludedMachine = null,
  excludedMachines = [],
  excludedConveyors = [],
) {
  const excludedMachineSet = new Set([
    ...(Array.isArray(excludedMachines) ? excludedMachines : [excludedMachines]),
    ...(excludedMachine ? [excludedMachine] : []),
  ]);
  const excludedConveyorSet = new Set(Array.isArray(excludedConveyors) ? excludedConveyors : [excludedConveyors]);
  const candidate = { ...machine, column, row, orientation };
  for (const { column: tileColumn, row: tileRow } of getMachineOccupiedTiles(candidate)) {
    if (!isFactoryGridTile(tileColumn, tileRow)
      || !isBuildableFactoryTile(
        tileColumn,
        tileRow,
        [...excludedMachineSet],
        [...excludedConveyorSet],
      )) {
      return false;
    }
  }

  if (candidate.upgradeOrigin) {
    const upgradeTile = getMachineUpgradeTile(candidate);
    if (!isFactoryGridTile(upgradeTile.column, upgradeTile.row)) {
      return false;
    }
  }

  return true;
}

function getMachineDisplayName(machineId) {
  return {
    conveyor: "Conveyor",
    planter: "Leek Planter",
    ammoShaper: "Bullet Core Caster",
    jacketFormer: "Jacket Former",
    materialStorage: "Material Storage",
    sellTube: "Sell Tube",
    graphiteLacedSellTube: "Graphite-Laced Sell Tube",
    leekDuster: "Leek Duster",
    primitiveUpgrader: "Primitive Upgrader",
    rockShack: "Rock Shack",
    clayKiln: "Clay Kiln",
    ingotMolder: "Ingot Molder",
    refractoryCaster: "Refractory Caster",
    graphiteCopperAnnealer: "Granite-Copper Annealer",
    graniteProcessor: "Granite Processor",
    bronzeStamp: "Bronze Stamp",
    bronzePillars: "Bronze Pillars",
    extruder: "Extruder",
    leekFiberExtractor: "Leek Fiber Extractor",
    contactMaker: "Contact Maker",
    miniElectricArcFurnace: "Mini Electric Arc Furnace",
    metalPress: "Metal Press",
    gearPress: "Gear Press",
    aggregateMixer: "Aggregate Mixer",
    hotFluidPipe: "Hot Fluid Pipe",
    stacker: "Stacker",
    splitter: "Splitter",
    casingMachine: "Casing Machine",
    quartzWheelCutter: "Quartz Wheel Cutter",
    gunDeposit: "Gun Deposit",
    gun: "Rapidfire Gun Mk. 0",
  }[machineId] ?? machineId;
}

function createMachineInstanceId(machineId) {
  let instanceId;
  do {
    instanceId = `${machineId}-${state.nextMachineInstanceId}`;
    state.nextMachineInstanceId += 1;
  } while (state.machines.some((machine) => machine.instanceId === instanceId)
    || state.machineInventoryInstances.some((machine) => machine.instanceId === instanceId)
    || state.moltenCopper.some((liquidMetal) => (
      getMoltenMetalOwnerInstanceId(liquidMetal) === instanceId
    )));
  return instanceId;
}

function placeMachine(machineId, column, row) {
  const definition = MACHINE_LAYOUT[machineId];
  if (!definition || state.machineInventory[machineId] <= 0
    || !isMachineFootprintBuildable(definition, column, row, selectedBuildOrientation)) {
    return;
  }

  state.machineInventory[machineId] -= 1;
  const storedInstanceIndex = state.machineInventoryInstances.findIndex((machine) => (
    machine.id === machineId
  ));
  const storedInstance = storedInstanceIndex >= 0
    ? state.machineInventoryInstances.splice(storedInstanceIndex, 1)[0]
    : null;
  state.machines.push(storedInstance
    ? {
      ...storedInstance,
      column,
      row,
      orientation: selectedBuildOrientation,
    }
    : {
      id: machineId,
      instanceId: createMachineInstanceId(machineId),
      ...definition,
      column,
      row,
      orientation: selectedBuildOrientation,
    });
  if (machineId === "hotFluidPipe" && !storedInstance) {
    Object.assign(state.machines.at(-1), { mode: selectedPipePlacementMode, turnSide: selectedPipeTurnSide });
  }
  invalidateFactoryConveyorCache();
  selectedBuildTool = state.machineInventory[machineId] > 0 ? machineId : null;
  hoveredFactoryTile = null;
  if (machineId === "leekDuster" && getTutorialStage() === "placeDuster") {
    state.tutorial.stage = "saleSetup";
  } else if (machineId === "sellTube" && getTutorialStage() === "saleSetup") {
    state.tutorial.stage = "saleRoute";
  }
  addLog(`Placed ${getMachineDisplayName(machineId)}.`);
  refreshMachineStaticLayer();
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function placeConveyor(column, row) {
  if (!isBuildableFactoryTile(column, row) || state.machineInventory.conveyor <= 0) {
    return;
  }

  const tutorialRequirement = getTutorialPlacementRequirement();
  if (tutorialRequirement) {
    if (column !== tutorialRequirement.column || row !== tutorialRequirement.row) {
      addLog("Tutorial: place the conveyor on the highlighted tile first.");
      render();
      return;
    }

    if (selectedBuildOrientation !== tutorialRequirement.direction) {
      addLog(`Tutorial: rotate the conveyor to face ${tutorialRequirement.direction} before placing it.`);
      render();
      return;
    }
  }

  state.placedConveyors.push({ column, row, direction: selectedBuildOrientation, item: null });
  invalidateFactoryConveyorCache();
  state.machineInventory.conveyor -= 1;
  hoveredFactoryTile = null;
  addLog(`Placed a ${selectedBuildOrientation}-facing conveyor.`);

  if (getTutorialStage() === "factoryPlaceFirst") {
    state.tutorial.stage = "factoryPlaceSecond";
  } else if (getTutorialStage() === "factoryPlaceSecond") {
    selectedBuildTool = null;
    state.tutorial.stage = "mineReturn";
  } else if (getTutorialStage() === "saleRoute" && hasStorageSellRoute()) {
    state.tutorial.stage = "saleFilter";
  }

  refreshMachineStaticLayer();
  saveGame();
  render();
}

function selectConveyorForPlacement() {
  if (state.tutorial.visible && ["intro", "factoryRoute"].includes(getTutorialStage())) {
    addLog("Tutorial: follow the current instruction before selecting a machine.");
    render();
    return;
  }

  if (state.machineInventory.conveyor <= 0) {
    addLog("No free conveyors remain. Buy more conveyors in the Shop.");
    render();
    return;
  }

  selectedBuildTool = "conveyor";
  factorySelectionDrag = null;
  factoryTapSelection = null;
  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  selectedBuildOrientation = "right";
  hoveredFactoryTile = null;
  if (getTutorialStage() === "inventorySelect") {
    state.tutorial.stage = "factoryPlaceFirst";
  }
  addLog("Placement selected: conveyor. It begins facing east.");
  setActiveView("factory");
}

function selectMachineForPlacement(machineId) {
  if (isInitialTutorialRouteInProgress()) {
    addLog("Finish the initial conveyor route before placing other machinery.");
    render();
    return;
  }

  if ((state.machineInventory[machineId] ?? 0) <= 0) {
    return;
  }

  selectedBuildTool = machineId;
  factorySelectionDrag = null;
  factoryTapSelection = null;
  selectedBuildOrientation = state.machineInventoryInstances.find((machine) => (
    machine.id === machineId
  ))?.orientation ?? MACHINE_LAYOUT[machineId].orientation ?? "right";
  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  hoveredFactoryTile = null;
  addLog(`Placement selected: ${getMachineDisplayName(machineId)}.`);
  setActiveView("factory");
}

function getValidShopPurchaseQuantity(quantity) {
  if (typeof quantity !== "number" && typeof quantity !== "string") {
    return null;
  }
  if (typeof quantity === "string" && quantity.trim() === "") {
    return null;
  }
  const parsedQuantity = Number(quantity);
  return Number.isSafeInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= 9999
    ? parsedQuantity
    : null;
}

function getMachinePurchaseCost(machineId, quantity = 1) {
  const cost = MACHINE_PURCHASES[machineId];
  const purchaseQuantity = getValidShopPurchaseQuantity(quantity);
  if (!cost || purchaseQuantity === null) {
    return null;
  }

  return {
    cash: cost.cash * purchaseQuantity,
    materials: Object.fromEntries(Object.entries(cost.materials).map(([material, amount]) => (
      [material, amount * purchaseQuantity]
    ))),
  };
}

function canAffordMachinePurchase(machineId, quantity = 1) {
  const totalCost = getMachinePurchaseCost(machineId, quantity);
  if (!totalCost || state.cash < totalCost.cash) {
    return false;
  }

  return Object.entries(totalCost.materials).every(([material, amount]) => (
    (state.stockpile[material] ?? 0) >= amount
  ));
}

function getDrillDps() {
  return (DRILL_UPGRADES[state.drill.upgradeId]?.dps ?? CONFIG.drillDamagePerSecond)
    * (isPlaytestCheatEnabled("drillDpsX10") ? 10 : 1);
}

function isPlaytestCheatEnabled(cheatId) {
  return Boolean(state.cheatPanelUnlocked && state.playtestCheats?.[cheatId] === true);
}

function getMaterialYieldMultiplier() {
  return isPlaytestCheatEnabled("materialYieldX10") ? 10 : 1;
}

function getProcessingSpeedMultiplier() {
  return isPlaytestCheatEnabled("productionSpeedX5") ? 5 : 1;
}

function getPlaytestSellValueMultiplier() {
  return isPlaytestCheatEnabled("sellValueX10") ? 10 : 1;
}

function getHigherDrillUpgradeId(firstUpgradeId, secondUpgradeId) {
  const firstRank = Object.keys(DRILL_UPGRADES).indexOf(firstUpgradeId);
  const secondRank = Object.keys(DRILL_UPGRADES).indexOf(secondUpgradeId);
  return secondRank > firstRank ? secondUpgradeId : firstUpgradeId;
}

function canAffordDrillUpgrade(upgradeId) {
  const upgrade = DRILL_UPGRADES[upgradeId];
  return Boolean(upgrade
    && upgradeId !== state.drill.upgradeId
    && (!upgrade.requires || upgrade.requires === state.drill.upgradeId)
    && state.cash >= upgrade.cash
    && (state.diamondFragments ?? 0) >= (upgrade.requiredDiamondFragments ?? 0));
}

function getNextDrillUpgrade() {
  return Object.values(DRILL_UPGRADES).find((upgrade) => (
    upgrade.requires === state.drill.upgradeId
  )) ?? null;
}

function purchaseDrillUpgrade(upgradeId) {
  const upgrade = DRILL_UPGRADES[upgradeId];
  if (!upgrade || !canAffordDrillUpgrade(upgradeId)) {
    addLog(`Not enough cash to purchase ${upgrade?.label ?? "that drill upgrade"}.`);
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return false;
  }

  state.cash -= upgrade.cash;
  if (upgrade.requiredDiamondFragments) {
    state.diamondFragments -= upgrade.requiredDiamondFragments;
  }
  state.drill.upgradeId = upgradeId;
  Object.values(state.mine.tunnelProgress).forEach((progress) => {
    if (isSaveRecord(progress) && isSaveRecord(progress.drill)) {
      progress.drill.upgradeId = getHigherDrillUpgradeId(progress.drill.upgradeId, upgradeId);
    }
  });
  addLog(`${upgrade.label} installed. Drill output is now ${upgrade.dps} DPS.`);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function purchaseMachine(machineId, quantity = 1) {
  const cost = MACHINE_PURCHASES[machineId];
  const purchaseQuantity = getValidShopPurchaseQuantity(quantity);
  const totalCost = getMachinePurchaseCost(machineId, quantity);
  if (!cost || purchaseQuantity === null || !totalCost) {
    return false;
  }
  if (!canAffordMachinePurchase(machineId, purchaseQuantity)) {
    addLog(`Not enough materials to build ${getMachineDisplayName(machineId)}.`);
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return false;
  }

  state.cash -= totalCost.cash;
  Object.entries(totalCost.materials).forEach(([material, amount]) => {
    state.stockpile[material] -= amount;
  });
  state.machineInventory[machineId] += purchaseQuantity;
  if (machineId === "leekDuster" && getTutorialStage() === "buildDuster") {
    state.tutorial.stage = "placeDuster";
  }
  const purchaseSummary = purchaseQuantity === 1
    ? `${getMachineDisplayName(machineId)} built and moved to Machine Inventory.`
    : `${formatNumber(purchaseQuantity)} × ${getMachineDisplayName(machineId)} built and moved to Machine Inventory.`;
  addLog(purchaseSummary);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function getKilnInputMaterial() {
  return state.kilnInputs[0]?.material ?? null;
}

function startKilnJobs() {
  let started = 0;
  while (getAvailableCrew() >= 2) {
    const pendingInput = state.kilnInputs.find((kilnInput) => (
      !state.kilnJobs.some((job) => job.kilnInstanceId === kilnInput.kilnInstanceId)
        && !state.moltenCopper.some((liquidMetal) => (
          getMoltenMetalOwnerInstanceId(liquidMetal) === kilnInput.kilnInstanceId
        ))
    ));
    const material = pendingInput?.material ?? null;
    const kiln = pendingInput?.kilnInstanceId
      ? getMachineByInstanceId(pendingInput.kilnInstanceId)
      : null;
    if (!kiln || !material) {
      break;
    }

    state.kilnInputs = state.kilnInputs.filter((kilnInput) => kilnInput !== pendingInput);
    state.kilnJobs.push({
      kilnInstanceId: kiln.instanceId,
      material,
      sourceMaterial: pendingInput.sourceMaterial ?? material,
      cashUpgraderEligibility: pendingInput.cashUpgraderEligibility ?? {},
      sourceValue: pendingInput.sourceValue ?? MINIMUM_SALE_VALUES[material] ?? 0,
      sourceValueIsEffective: pendingInput.sourceValueIsEffective === true,
      quantity: pendingInput.quantity ?? 1,
      secondsRemaining: CONFIG.clayKilnProcessSeconds,
    });
    addLog(`Clay Kiln began smelting one ${MATERIAL_LABELS[material]} with 2 crew.`);
    started += 1;
  }
  return started;
}

function completeKilnJob(job) {
  if (!job) {
    return;
  }

  queueMoltenMetalOutput({
    kilnInstanceId: job.kilnInstanceId,
    smelterInstanceId: job.kilnInstanceId,
    material: getSmeltedLiquidMaterial(job.material),
    sourceMaterial: job.sourceMaterial ?? job.material,
    cashUpgraderEligibility: job.cashUpgraderEligibility ?? {},
    sourceValue: job.sourceValue,
    sourceValueIsEffective: job.sourceValueIsEffective === true,
    quantity: job.quantity ?? 1,
  });
  addLog(`Clay Kiln produced liquid ${MATERIAL_LABELS[getSmeltedLiquidMaterial(job.material)] ?? job.material}. Connect it to an adjacent Ingot Molder, Refractory Caster, Bullet Core Caster, Jacket Former, or Casing Machine.`);
}

function startArcFurnaceJobs() {
  let started = false;
  getMachines("miniElectricArcFurnace").forEach((furnace) => {
    if (state.arcFurnaceJobs.some((job) => job.furnaceInstanceId === furnace.instanceId)
      || state.arcFurnaceOutputBuffers[furnace.instanceId]
      || getAvailableCrew() < 1) {
      return;
    }

    const recipe = getArcFurnaceRecipe(furnace);
    if (!recipe?.outputMaterial) {
      return;
    }

    const cycleOutputQuantity = recipe.outputQuantity ?? 1;
    const outputCapacity = cycleOutputQuantity * 2;
    const bufferedLiquidQuantity = state.moltenCopper.reduce((total, liquidMetal) => (
      getMoltenMetalOwnerInstanceId(liquidMetal) === furnace.instanceId
        ? total + Math.max(0, Number(liquidMetal.quantity ?? 1) || 0)
        : total
    ), 0);
    const projectedLiquidQuantity = bufferedLiquidQuantity + cycleOutputQuantity;
    const capacityTolerance = Number.EPSILON
      * Math.max(1, Math.abs(projectedLiquidQuantity), Math.abs(outputCapacity))
      * 16;
    if (projectedLiquidQuantity > outputCapacity + capacityTolerance) {
      return;
    }

    if (recipe.consume) {
      recipe.consume();
    }
    state.arcFurnaceJobs.push({
      furnaceInstanceId: furnace.instanceId,
      material: recipe.outputMaterial,
      sourceMaterial: recipe.sourceMaterial,
      cashUpgraderEligibility: recipe.cashUpgraderEligibility,
      quantity: recipe.outputQuantity,
      sourceValue: recipe.outputValue,
      sourceValueIsEffective: true,
      inputCount: recipe.inputCount,
      secondsRemaining: recipe.inputCount * 2,
    });
    addLog(recipe.name
      ? `Mini Electric Arc Furnace began the ${recipe.name} recipe: ${recipe.description}.`
      : recipe.inputCount === 2
        ? `Mini Electric Arc Furnace began firing 2 ${MATERIAL_LABELS[recipe.inputMaterial]} → 1 ${MATERIAL_LABELS[recipe.outputMaterial]}.`
        : "Mini Electric Arc Furnace began smelting one metal input.");
    started = true;
  });
  return started;
}

function completeArcFurnaceJob(job) {
  if (!job) {
    return;
  }

  if (job.material === "ceramic") {
    const outputItem = {
      kind: "material",
      material: "ceramic",
      quantity: job.quantity ?? 1,
      dusted: false,
      tileProgress: 0,
    };
    const furnace = getMachineByInstanceId(job.furnaceInstanceId);
    const outputConveyor = furnace ? getArcFurnaceSolidOutputConveyor(furnace) : null;
    if (!outputConveyor || getConveyorItem(outputConveyor) || !placeItemOnConveyor(outputConveyor, outputItem)) {
      state.arcFurnaceOutputBuffers[job.furnaceInstanceId] = outputItem;
      state.arcFurnaceJobs = state.arcFurnaceJobs.filter((candidate) => candidate !== job);
      addLog("Mini Electric Arc Furnace finished Ceramic; its solid output is waiting for a conveyor.");
      return;
    }

    state.arcFurnaceJobs = state.arcFurnaceJobs.filter((candidate) => candidate !== job);
    addLog("Mini Electric Arc Furnace produced Ceramic.");
    return;
  }

  queueMoltenMetalOutput({
    kilnInstanceId: job.furnaceInstanceId,
    smelterInstanceId: job.furnaceInstanceId,
    material: job.material,
    sourceMaterial: job.sourceMaterial,
    cashUpgraderEligibility: job.cashUpgraderEligibility ?? {},
    quantity: job.quantity ?? 1,
    sourceValue: job.sourceValue,
    sourceValueIsEffective: true,
  });
  state.arcFurnaceJobs = state.arcFurnaceJobs.filter((candidate) => candidate !== job);
  addLog(`Mini Electric Arc Furnace produced ${formatNumber(job.quantity ?? 1)} liquid ${MATERIAL_LABELS[job.material]}.`);
}

function startBulletCoreCasting() {
  if (state.mine.ammoShaperMode !== "coated") {
    return false;
  }

  let started = false;
  getMachines("ammoShaper").forEach((caster) => {
    const processConveyor = getInternalConveyor(
      caster,
      getMachineProcessLaneIndex(caster),
    );
    const link = getBulletCoreCasterKilnLink(caster);
    const processItem = processConveyor ? getConveyorItem(processConveyor) : null;
    if (!link
      || !processItem
      || processItem.kind !== "material"
      || processItem.material !== "leek"
      || processItem.metalMaterial) {
      return;
    }

    const liquidMetalIndex = findMoltenCopperIndex(link.kiln.instanceId);
    if (liquidMetalIndex < 0) {
      return;
    }

    const liquidMetal = state.moltenCopper[liquidMetalIndex];
    if (!canBulletCoreCasterAcceptItem({
      kind: "liquidMetal",
      material: liquidMetal.material,
    })) {
      return;
    }

    const requiredQuantity = Math.max(0, Number(processItem.quantity ?? 1) || 0) * AMMO_COATING_LIQUID_PER_BUNDLE;
    const availableQuantity = getAvailableLiquidQuantity(liquidMetal, caster);
    if (requiredQuantity <= 0 || availableQuantity + 1e-9 < requiredQuantity) {
      return;
    }

    const remainingQuantity = availableQuantity - requiredQuantity;
    spendLiquidFlowCredit(liquidMetal, requiredQuantity);
    if (remainingQuantity > 1e-9) {
      liquidMetal.quantity = Number(liquidMetal.quantity ?? 1) - requiredQuantity;
    } else {
      if (subtractQuantity(liquidMetal, requiredQuantity, 1) === 0) state.moltenCopper.splice(liquidMetalIndex, 1);
    }

    processItem.metalMaterial = liquidMetal.material;
    processItem.kilnInstanceId = getMoltenMetalOwnerInstanceId(liquidMetal);
    addLog(`Bullet Core Caster reinforced ${formatNumber(requiredQuantity)} leek core${requiredQuantity === 1 ? "" : "s"} with liquid ${MATERIAL_LABELS[liquidMetal.material]}.`);
    started = true;
  });
  return started;
}

function startJacketFormerCoating() {
  let started = false;
  getMachines("jacketFormer").forEach((jacketFormer) => {
    const processConveyor = getInternalConveyor(
      jacketFormer,
      getMachineProcessLaneIndex(jacketFormer),
    );
    const link = getJacketFormerKilnLink(jacketFormer);
    const processItem = processConveyor ? getConveyorItem(processConveyor) : null;
    if (!processItem
      || processItem.kind !== "ammo"
      || processItem.jacketMaterial
      || !link) {
      return;
    }

    const liquidMetalIndex = findMoltenCopperIndex(link.kiln.instanceId);
    if (liquidMetalIndex < 0 || state.moltenCopper[liquidMetalIndex].material !== "nativeCopper") {
      return;
    }

    const liquidMetal = state.moltenCopper[liquidMetalIndex];
    const required = Number(processItem.quantity) / AMMO_ROUNDS_PER_MINERAL * AMMO_JACKET_LIQUID_PER_BUNDLE;
    if (!Number.isFinite(required) || required <= 0 || !hasAtLeastQuantity(getAvailableLiquidQuantity(liquidMetal, jacketFormer), required)) return;
    spendLiquidFlowCredit(liquidMetal, required);
    if (subtractQuantity(liquidMetal, required, 1) === 0) state.moltenCopper.splice(liquidMetalIndex, 1);
    processItem.jacketMaterial = liquidMetal.material;
    processItem.jacketKilnInstanceId = liquidMetal.kilnInstanceId;
    addLog(`Jacket Former is holding ${formatNumber(processItem.quantity)} cores for a Native copper jacket.`);
    started = true;
  });
  return started;
}

function startMolderJob() {
  let started = false;
  const castingMachines = [
    ...getMachines("ingotMolder"),
    ...getMachines("refractoryCaster"),
  ];
  castingMachines.forEach((molder) => {
    const isRefractoryCaster = molder.id === "refractoryCaster";
    const crewRequired = isRefractoryCaster ? 0 : 1;
    const maximumBatchQuantity = isRefractoryCaster ? 4 : 1;
    const secondsPerBatch = isRefractoryCaster ? 2 : CONFIG.ingotMolderProcessSeconds;
    const inputPortName = isRefractoryCaster ? "liquidInput" : "liquidInputOutput";
    const outputConveyor = getInternalConveyor(molder, 0);
    if (state.molderJobs.some((job) => job.molderInstanceId === molder.instanceId)
      || state.molderOutputBuffers[molder.instanceId]
      || getAvailableCrew() < crewRequired) {
      return;
    }

    const link = getMolderKilnLink(molder, inputPortName);
    if (!link || !outputConveyor) {
      return;
    }

    const moltenCopperIndex = findMoltenCopperIndex(link.kiln.instanceId);
    if (moltenCopperIndex < 0) {
      return;
    }

    const moltenCopper = state.moltenCopper[moltenCopperIndex];
    if (!MOLDER_METAL_ORES.includes(moltenCopper.material)) {
      return;
    }
    const needsClayMold = !isRefractoryCaster && moltenCopper.material === "iron";
    const bufferedClay = state.molderClayBuffers[molder.instanceId] ?? 0;
    if (needsClayMold && !hasAtLeastQuantity(bufferedClay, 1)) {
      return;
    }

    const availableQuantity = Math.max(0, Math.floor(getAvailableLiquidQuantity(moltenCopper, molder) + 1e-9));
    const batchQuantity = Math.min(maximumBatchQuantity, availableQuantity);
    if (batchQuantity < 1 || !hasAtLeastQuantity(moltenCopper.quantity ?? 1, batchQuantity)) {
      return;
    }
    const sourceValue = moltenCopper.sourceValue;
    const sourceValueIsEffective = moltenCopper.sourceValueIsEffective === true;
    state.molderJobs.push({
      molderInstanceId: molder.instanceId,
      kilnInstanceId: moltenCopper.kilnInstanceId,
      material: moltenCopper.material,
      sourceMaterial: moltenCopper.sourceMaterial ?? moltenCopper.material,
      cashUpgraderEligibility: moltenCopper.cashUpgraderEligibility ?? {},
      sourceValue,
      sourceValueIsEffective,
      quantity: batchQuantity,
      crewRequired,
      secondsRemaining: secondsPerBatch,
    });
    if (needsClayMold) {
      const remainingClay = bufferedClay - 1;
      const tolerance = Number.EPSILON * Math.max(1, Math.abs(bufferedClay)) * 16;
      state.molderClayBuffers[molder.instanceId] = Math.abs(remainingClay) <= tolerance
        ? 0
        : remainingClay;
    }
    spendLiquidFlowCredit(moltenCopper, batchQuantity);
    if (subtractQuantity(moltenCopper, batchQuantity, 1) === 0) {
      state.moltenCopper.splice(moltenCopperIndex, 1);
    }
    addLog(isRefractoryCaster
      ? `Refractory Caster began molding ${formatNumber(batchQuantity)} ${MATERIAL_LABELS[moltenCopper.material]} Ingots.`
      : `Ingot Molder began shaping one ${MATERIAL_LABELS[moltenCopper.material]} ingot ${needsClayMold ? "with one Clay mold" : "with its reusable mold"} and 1 crew.`);
    started = true;
  });
  return started;
}

function completeMolderJob(job) {
  if (!job) {
    return;
  }

  const molder = getMachineByInstanceId(job.molderInstanceId);
  const machineName = getMachineDisplayName(molder?.id ?? "ingotMolder");
  const outputConveyor = molder ? getInternalConveyor(molder, 0) : null;
  const outputMaterial = job.material === "nativeCopper"
    ? "copperIngot"
    : job.material === "silver"
      ? "silverIngot"
      : job.material === "tin"
        ? "tinIngot"
        : job.material === "zinc"
          ? "zincIngot"
        : job.material === "bronze"
          ? "bronzeIngot"
          : job.material === "iron"
            ? "ironIngot"
          : job.material === "copperContactAlloy"
              ? "copperContactAlloyIngot"
              : job.material === "tinContactAlloy"
                ? "tinContactAlloyIngot"
            : job.material === "ceramic"
              ? "ceramic"
      : "brittleCopperIngot";
  const outputItem = {
    kind: "material",
    material: outputMaterial,
    quantity: job.quantity ?? 1,
    dusted: false,
    saleValueBase: (job.sourceValue ?? MINIMUM_SALE_VALUES[job.material] ?? 0)
      * (job.sourceValueIsEffective === true ? 1 : 4),
    freshMoldedAt: Date.now(),
  };
  outputItem.baseValue = outputItem.saleValueBase;
  restoreCashUpgraderEligibilityForSameProduct(
    outputItem,
    job.sourceMaterial,
    job.cashUpgraderEligibility,
  );
  if (!outputConveyor || !placeItemOnConveyor(outputConveyor, outputItem)) {
    state.molderOutputBuffers[job.molderInstanceId] = outputItem;
    state.molderJobs = state.molderJobs.filter((candidate) => candidate !== job);
    addLog(`${MATERIAL_LABELS[outputMaterial]} finished and is waiting for the ${machineName} output lane.`);
    return;
  }

  addLog(`${MATERIAL_LABELS[outputMaterial]} finished and entered the ${machineName} output lane.`);
  state.molderJobs = state.molderJobs.filter((candidate) => candidate !== job);
}

function flushMolderOutputs() {
  Object.entries(state.molderOutputBuffers).forEach(([molderInstanceId, item]) => {
    const molder = getMachineByInstanceId(molderInstanceId);
    const outputConveyor = molder ? getInternalConveyor(molder, 0) : null;
    const emitted = emitCapacitySafeCargo(outputConveyor, item);
    if (!emitted) {
      return;
    }
    if (subtractQuantity(item, emitted, 1) === 0) delete state.molderOutputBuffers[molderInstanceId];
    addLog(`${MATERIAL_LABELS[item.material]} left the ${getMachineDisplayName(molder.id)} output buffer.`);
  });
}

function getFactoryEntityAt(column, row) {
  // Older saves could contain a placed conveyor on a tile now covered by a
  // machine footprint. It still routes cargo, so let the explicit placed
  // object win hit-testing too; otherwise the machine captures every click
  // and the legacy conveyor becomes impossible to move or recover.
  const conveyor = getPlacedConveyor(column, row);
  if (conveyor) {
    return { type: "conveyor", column, row };
  }

  if (getTutorialStage() === "complete" && getActiveFixedConveyors().some((candidate) => (
    candidate.column === column && candidate.row === row
  ))) {
    return { type: "conveyor", column, row };
  }

  const machine = state.machines.find((candidate) => isTileInsideMachine(column, row, candidate));
  if (machine) {
    return { type: "machine", id: machine.id, instanceId: machine.instanceId };
  }

  return null;
}

function getFactoryEntitySelectionKey(entity) {
  if (!entity) {
    return "";
  }
  return entity.type === "machine"
    ? `machine:${entity.instanceId}`
    : `conveyor:${entity.column}:${entity.row}`;
}

function getSelectableFactoryEntities() {
  return [
    ...state.machines
      .filter((machine) => machine.movable)
      .map((machine) => ({
        type: "machine",
        id: machine.id,
        instanceId: machine.instanceId,
      })),
    ...state.placedConveyors.map((conveyor) => ({
      type: "conveyor",
      column: conveyor.column,
      row: conveyor.row,
    })),
    ...(getTutorialStage() === "complete"
      ? getActiveFixedConveyors().map((conveyor) => ({
        type: "conveyor",
        column: conveyor.column,
        row: conveyor.row,
      }))
      : []),
  ];
}

function resolveFactoryEntity(entity) {
  if (entity?.type === "machine") {
    return getMachineByInstanceId(entity.instanceId);
  }
  if (entity?.type === "conveyor") {
    return getFactorySelectableConveyor(entity.column, entity.row);
  }
  return null;
}

function getSelectedFactoryEntityRecords() {
  return selectedFactoryEntities
    .map((entity) => ({ descriptor: entity, object: resolveFactoryEntity(entity) }))
    .filter(({ object }) => Boolean(object));
}

function getFactoryEntityOccupiedCoordinates(entity, object = resolveFactoryEntity(entity)) {
  if (!object) {
    return [];
  }
  if (entity.type === "conveyor") {
    return [{ column: object.column, row: object.row }];
  }
  return getMachineOccupiedTiles(object);
}

function beginFactoryTapSelection() {
  if (activeView !== "factory" || selectedBuildTool || groupMoveState || factoryTapSelection) {
    return false;
  }

  factorySelectionDrag = null;
  factoryTapSelection = { startTile: null, currentTile: null, additive: false };
  hoveredFactoryTile = null;
  if (!IS_NODE_TEST_ENVIRONMENT) {
    renderFactoryMachineControls();
    renderMachineOverlay();
  }
  return true;
}

function cancelFactoryInteraction() {
  if (selectedBuildTool) {
    cancelFactoryPlacement();
  } else if (factoryTapSelection || factorySelectionDrag) {
    factoryTapSelection = null;
    factorySelectionDrag = null;
    hoveredFactoryTile = null;
    if (!IS_NODE_TEST_ENVIRONMENT) {
      renderFactoryMachineControls();
      renderMachineOverlay();
    }
  } else {
    clearFactorySelection();
  }
}

function selectFactoryEntity(entity, additive = false) {
  factorySelectionDrag = null;
  factoryTapSelection = null;
  selectedBuildTool = null;
  groupMoveState = null;
  if (entity?.type !== "machine" || entity.id !== "materialStorage") {
    selectedStorageOutputKey = null;
  }
  if (!entity) {
    selectedFactoryEntities = [];
    selectedFactoryEntity = null;
  } else if (additive) {
    const key = getFactoryEntitySelectionKey(entity);
    const existingIndex = selectedFactoryEntities.findIndex((candidate) => (
      getFactoryEntitySelectionKey(candidate) === key
    ));
    if (existingIndex >= 0) {
      selectedFactoryEntities.splice(existingIndex, 1);
    } else {
      selectedFactoryEntities.push(entity);
    }
    selectedFactoryEntity = selectedFactoryEntities.length === 1
      ? selectedFactoryEntities[0]
      : null;
  } else {
    selectedFactoryEntities = [entity];
    selectedFactoryEntity = entity;
  }
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function clearFactorySelection() {
  if (!selectedFactoryEntity && selectedFactoryEntities.length === 0 && !groupMoveState
    && !factoryTapSelection && !factorySelectionDrag) {
    return;
  }

  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  factorySelectionDrag = null;
  factoryTapSelection = null;
  selectedStorageOutputKey = null;
  hoveredFactoryTile = null;
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function cancelFactoryPlacement() {
  if (!selectedBuildTool) {
    return;
  }

  selectedBuildTool = null;
  factorySelectionDrag = null;
  factoryTapSelection = null;
  hoveredFactoryTile = null;
  addLog("Placement selection cancelled.");
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function rebuildMachineScene() {
  invalidateFactoryConveyorCache();
  clearConveyorItems();
  clearStorageOutputLabels();
  clearConveyorItemLabels();
  lastFactoryOverlaySignature = null;
  machineGame?.destroy(true);
  elements.machineGrid?.replaceChildren();
  factoryPointerInside = false;
  machineGame = null;
  machineScene = null;
  machineOverlay = null;
  machineStaticLayer = null;
  gunNameText = null;
  gunAmmoText = null;
  factoryCrewText = null;
  machineSceneUnavailable = false;
}

function refreshMachineStaticLayer() {
  invalidateFactoryConveyorCache();
  if (!machineScene) {
    return;
  }

  machineStaticLayer?.destroy(true);
  machineStaticLayer = null;
  gunNameText = null;
  gunAmmoText = null;
  factoryCrewText = null;
  lastFactoryOverlaySignature = null;
  drawMachineFloor(machineScene);
  renderMachineOverlay();
}

function recoverFactoryItem(item) {
  if (item.kind === "material") {
    state.stockpile[item.material] = (state.stockpile[item.material] ?? 0) + item.quantity;
    return `${formatNumber(item.quantity)} ${MATERIAL_LABELS[item.material]}`;
  }

  if (item.kind === "ammo") {
    addAmmo(item.quantity, item.material, item.type, item.damage, item.annealed === true, {
      casingMaterial: item.casingMaterial,
      jacketMaterial: item.jacketMaterial,
      coreMaterial: item.coreMaterial,
    });
    return `${formatNumber(item.quantity)} ${MATERIAL_LABELS[item.material]} rounds`;
  }

  if (item.kind === "liquidMetal") {
    queueMoltenMetalOutput({
      kilnInstanceId: item.kilnInstanceId,
      smelterInstanceId: item.smelterInstanceId ?? item.kilnInstanceId,
      material: item.material,
      sourceMaterial: item.sourceMaterial ?? item.material,
      cashUpgraderEligibility: item.cashUpgraderEligibility ?? {},
      sourceValue: item.sourceValue,
      sourceValueIsEffective: item.sourceValueIsEffective === true,
      quantity: item.quantity ?? 1,
    });
    return `liquid ${MATERIAL_LABELS[item.material] ?? item.material ?? "metal"}`;
  }

  return "cargo";
}

function recoverMolderClayBuffer(molder) {
  const quantity = Number(state.molderClayBuffers[molder.instanceId]) || 0;
  if (quantity <= 0) {
    return null;
  }

  state.stockpile.clay += quantity;
  delete state.molderClayBuffers[molder.instanceId];
  return `${formatNumber(quantity)} Clay`;
}

function recoverGearPressInput(press) {
  const pending = state.gearPressInputs[press.instanceId];
  if (!pending) {
    return null;
  }
  delete state.gearPressInputs[press.instanceId];
  return recoverFactoryItem({ kind: "material", material: pending.material, quantity: pending.quantity });
}

function recoverFactoryEntityCargo(entity) {
  const entityTileKeys = new Set(getFactoryEntityTileKeys(entity));
  const recovered = [];
  if (entity.type === "machine" && entity.id === "aggregateMixer") {
    recoverAggregateMixerContents(getMachineByInstanceId(entity.instanceId));
  }
  getFactoryConveyors().forEach(({ conveyor }) => {
    if (!entityTileKeys.has(getFactoryTileKey(conveyor.column, conveyor.row))) {
      return;
    }

    const item = getConveyorItem(conveyor);
    if (!item) {
      return;
    }

    setConveyorItem(conveyor, null);
    recovered.push(recoverFactoryItem(item));
  });
  if (entity.type === "machine" && entity.id === "ingotMolder") {
    const recoveredClay = recoverMolderClayBuffer(getMachineByInstanceId(entity.instanceId));
    if (recoveredClay) {
      recovered.push(recoveredClay);
    }
  }
  if (entity.type === "machine" && entity.id === "gearPress") {
    const recoveredPlates = recoverGearPressInput(getMachineByInstanceId(entity.instanceId));
    if (recoveredPlates) {
      recovered.push(recoveredPlates);
    }
  }
  return recovered;
}

function getFactoryGroupOrigin(records) {
  const coordinates = records.flatMap(({ descriptor, object }) => (
    getFactoryEntityOccupiedCoordinates(descriptor, object)
  ));
  const columns = coordinates.map(({ column }) => column);
  const rows = coordinates.map(({ row }) => row);
  const column = Math.min(...columns);
  const row = Math.min(...rows);
  return {
    column,
    row,
    width: Math.max(...columns) - column + 1,
    height: Math.max(...rows) - row + 1,
  };
}

function getFactoryGroupMoveSignature() {
  if (!groupMoveState) {
    return "";
  }

  const entityTransforms = groupMoveState.entities.map((entity) => (
    `${getFactoryEntitySelectionKey(entity.descriptor)}:${entity.offsetColumn},${entity.offsetRow}`
      + `:${entity.width}x${entity.height}:${entity.orientation ?? ""}:${entity.direction ?? ""}`
  )).join("|");
  return `${groupMoveState.width}x${groupMoveState.height}:${entityTransforms}`;
}

function getFactoryGroupPlacementPlan(anchorColumn, anchorRow) {
  if (!groupMoveState) {
    return [];
  }

  return groupMoveState.entities.map((entity) => ({
    ...entity,
    column: anchorColumn + entity.offsetColumn,
    row: anchorRow + entity.offsetRow,
    orientation: entity.orientation,
    direction: entity.direction,
  }));
}

function isFactoryGroupPlacementBuildable(anchorColumn, anchorRow) {
  const plan = getFactoryGroupPlacementPlan(anchorColumn, anchorRow);
  if (plan.length === 0) {
    return false;
  }

  const selectedMachines = plan
    .filter(({ descriptor }) => descriptor.type === "machine")
    .map(({ object }) => object);
  const selectedConveyors = plan
    .filter(({ descriptor }) => descriptor.type === "conveyor")
    .map(({ object }) => object);
  const targetTiles = new Set();

  for (const entry of plan) {
    const candidate = entry.descriptor.type === "machine"
      ? {
        ...entry.object,
        column: entry.column,
        row: entry.row,
        orientation: entry.orientation,
      }
      : { column: entry.column, row: entry.row, direction: entry.direction };
    const occupiedTiles = entry.descriptor.type === "machine"
      ? getMachineOccupiedTiles(candidate)
      : [candidate];
    for (const tile of occupiedTiles) {
      if (!isFactoryGridTile(tile.column, tile.row)) {
        return false;
      }
      const key = getFactoryTileKey(tile.column, tile.row);
      if (targetTiles.has(key)) {
        return false;
      }
      targetTiles.add(key);
    }

    const valid = entry.descriptor.type === "machine"
      ? isMachineFootprintBuildable(
        entry.object,
        entry.column,
        entry.row,
        entry.orientation,
        null,
        selectedMachines,
        selectedConveyors,
      )
      : isBuildableFactoryTile(
        entry.column,
        entry.row,
        selectedMachines,
        selectedConveyors,
      );
    if (!valid) {
      return false;
    }
  }

  return true;
}

function beginGroupMove() {
  const records = getSelectedFactoryEntityRecords();
  if (records.length < 2) {
    return false;
  }

  factorySelectionDrag = null;
  factoryTapSelection = null;
  const origin = getFactoryGroupOrigin(records);
  groupMoveState = {
    originColumn: origin.column,
    originRow: origin.row,
    width: origin.width,
    height: origin.height,
    entities: records.map(({ descriptor, object }) => ({
      descriptor: { ...descriptor },
      object,
      offsetColumn: object.column - origin.column,
      offsetRow: object.row - origin.row,
      width: descriptor.type === "machine" ? getMachineFootprintSize(object).width : 1,
      height: descriptor.type === "machine" ? getMachineFootprintSize(object).height : 1,
      orientation: descriptor.type === "machine" ? object.orientation ?? "right" : null,
      direction: descriptor.type === "conveyor" ? object.direction ?? "right" : null,
    })),
  };
  selectedFactoryEntity = null;
  selectedBuildTool = null;
  hoveredFactoryTile = { column: origin.column, row: origin.row };
  addLog(`Ready to move ${records.length} selected factory pieces.`);
  if (!IS_NODE_TEST_ENVIRONMENT) {
    renderFactoryMachineControls();
    renderMachineOverlay();
  }
  return true;
}

function rotateFactoryGroup(direction) {
  if (!groupMoveState || !["clockwise", "counterclockwise"].includes(direction)) {
    return false;
  }

  const clockwise = direction === "clockwise";
  const oldGroupWidth = groupMoveState.width;
  const oldGroupHeight = groupMoveState.height;
  const rotationOrientation = clockwise ? "down" : "up";

  groupMoveState.entities.forEach((entity) => {
    const oldColumn = entity.offsetColumn;
    const oldRow = entity.offsetRow;
    const oldWidth = entity.width;
    const oldHeight = entity.height;

    if (clockwise) {
      entity.offsetColumn = oldGroupHeight - oldRow - oldHeight;
      entity.offsetRow = oldColumn;
    } else {
      entity.offsetColumn = oldRow;
      entity.offsetRow = oldGroupWidth - oldColumn - oldWidth;
    }

    entity.width = oldHeight;
    entity.height = oldWidth;
    if (entity.descriptor.type === "machine") {
      entity.orientation = rotateMachineDirection(entity.orientation, rotationOrientation);
    } else {
      entity.direction = rotateMachineDirection(entity.direction, rotationOrientation);
    }
  });

  groupMoveState.width = oldGroupHeight;
  groupMoveState.height = oldGroupWidth;
  return true;
}

function completeGroupMove(anchorColumn, anchorRow) {
  if (!groupMoveState) {
    return false;
  }
  if (!isFactoryGroupPlacementBuildable(anchorColumn, anchorRow)) {
    addLog("That group position is blocked or outside the factory floor.");
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return false;
  }

  const plan = getFactoryGroupPlacementPlan(anchorColumn, anchorRow);
  plan.forEach((entry) => {
    if (entry.descriptor.type === "machine") {
      entry.object.column = entry.column;
      entry.object.row = entry.row;
      entry.object.orientation = entry.orientation;
      return;
    }

    const conveyor = entry.object;
    if (isFixedConveyor(conveyor)) {
      const oldItem = state.fixedConveyorItems[getFactoryTileKey(conveyor.column, conveyor.row)] ?? null;
      delete state.fixedConveyorItems[getFactoryTileKey(conveyor.column, conveyor.row)];
      state.tutorial.starterConveyorRemoved = true;
      state.placedConveyors.push({
        column: entry.column,
        row: entry.row,
        direction: entry.direction,
        item: oldItem,
      });
      return;
    }

    conveyor.column = entry.column;
    conveyor.row = entry.row;
    conveyor.direction = entry.direction;
  });

  selectedFactoryEntities = plan.map(({ descriptor, column, row }) => (
    descriptor.type === "machine"
      ? { ...descriptor }
      : { type: "conveyor", column, row }
  ));
  selectedFactoryEntity = null;
  groupMoveState = null;
  hoveredFactoryTile = null;
  invalidateFactoryConveyorCache();
  refreshMachineStaticLayer();
  addLog(`Moved ${plan.length} factory pieces.`);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function canPickUpSelectedFactoryEntities(records = getSelectedFactoryEntityRecords()) {
  if (records.length === 0 || records.some(({ descriptor, object }) => (
    descriptor.type === "machine" ? !canPickUpMachine(object) : !object
  ))) {
    return false;
  }

  const selectedStorageCount = records.filter(({ descriptor }) => (
    descriptor.type === "machine" && descriptor.id === "materialStorage"
  )).length;
  return selectedStorageCount === 0 || getStorageCount() - selectedStorageCount >= 1;
}

function recoverFactoryEntitiesCargo(records) {
  const selectedTileKeys = new Set(records.flatMap(({ descriptor, object }) => (
    getFactoryEntityOccupiedCoordinates(descriptor, object).map(({ column, row }) => (
      getFactoryTileKey(column, row)
    ))
  )));
  const recovered = [];
  getFactoryConveyors().forEach(({ conveyor }) => {
    if (!selectedTileKeys.has(getFactoryTileKey(conveyor.column, conveyor.row))) {
      return;
    }

    const item = getConveyorItem(conveyor);
    if (!item) {
      return;
    }

    releaseDusterForItem(item);
    setConveyorItem(conveyor, null);
    recovered.push(recoverFactoryItem(item));
  });
  records
    .filter(({ descriptor }) => descriptor.type === "machine" && descriptor.id === "ingotMolder")
    .forEach(({ object }) => {
      const recoveredClay = recoverMolderClayBuffer(object);
      if (recoveredClay) {
        recovered.push(recoveredClay);
      }
    });
  records
    .filter(({ descriptor }) => descriptor.type === "machine" && descriptor.id === "gearPress")
    .forEach(({ object }) => {
      const recoveredPlates = recoverGearPressInput(object);
      if (recoveredPlates) {
        recovered.push(recoveredPlates);
      }
    });
  records.filter(({ descriptor }) => descriptor.type === "machine" && descriptor.id === "aggregateMixer")
    .forEach(({ object }) => recoverAggregateMixerContents(object));
  return recovered;
}

function pickUpSelectedFactoryEntities() {
  factorySelectionDrag = null;
  factoryTapSelection = null;
  const records = getSelectedFactoryEntityRecords();
  if (records.length < 2) {
    pickUpSelectedFactoryEntity(selectedFactoryEntity);
    return;
  }
  if (!canPickUpSelectedFactoryEntities(records)) {
    addLog("That selection includes a fixed piece or would remove the last Material Storage.");
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return;
  }

  const recoveredCargo = recoverFactoryEntitiesCargo(records);
  const machines = new Set(records
    .filter(({ descriptor }) => descriptor.type === "machine")
    .map(({ object }) => object));
  const placedConveyors = new Set(records
    .filter(({ descriptor, object }) => descriptor.type === "conveyor" && !isFixedConveyor(object))
    .map(({ object }) => object));
  const includesFixedConveyor = records.some(({ descriptor, object }) => (
    descriptor.type === "conveyor" && isFixedConveyor(object)
  ));

  state.machines = state.machines.filter((machine) => !machines.has(machine));
  state.placedConveyors = state.placedConveyors.filter((conveyor) => !placedConveyors.has(conveyor));
  if (includesFixedConveyor) {
    state.tutorial.starterConveyorRemoved = true;
  }
  records.forEach(({ descriptor, object }) => {
    if (descriptor.type === "machine") {
      state.machineInventory[descriptor.id] += 1;
      state.machineInventoryInstances.push({ ...object });
    } else {
      state.machineInventory.conveyor += 1;
    }
  });

  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  selectedStorageOutputKey = null;
  invalidateFactoryConveyorCache();
  refreshMachineStaticLayer();
  addLog(`Returned ${records.length} selected factory pieces to inventory.`);
  if (recoveredCargo.length > 0) {
    addLog(`Recovered ${recoveredCargo.join(" and ")} from the selection.`);
  }
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function moveSelectedFactoryEntities() {
  factorySelectionDrag = null;
  factoryTapSelection = null;
  if (groupMoveState) {
    if (hoveredFactoryTile) {
      completeGroupMove(hoveredFactoryTile.column, hoveredFactoryTile.row);
    }
    return;
  }
  if (selectedFactoryEntities.length > 1) {
    beginGroupMove();
    return;
  }
  pickUpSelectedFactoryEntity(selectedFactoryEntity, true);
}

function pickUpSelectedFactoryEntity(entity = selectedFactoryEntity, moveForPlacement = false) {
  factorySelectionDrag = null;
  factoryTapSelection = null;
  const selectedMachine = entity?.type === "machine"
    ? getMachineByInstanceId(entity.instanceId)
    : null;
  const entityHasCargo = isFactoryEntityInTransit(entity);
  if (!entity || (selectedMachine && !canPickUpMachine(selectedMachine))) {
    if (entity) {
      addLog("This factory piece cannot be picked up.");
      render();
    }
    return;
  }

  let recoveredCargo = [];

  if (entity.type === "conveyor") {
    const { column, row } = entity;
    const conveyor = getFactorySelectableConveyor(column, row);
    if (!conveyor) {
      return;
    }
    if (!moveForPlacement) {
      recoveredCargo = recoverFactoryEntityCargo(entity);
    }
    if (isFixedConveyor(conveyor)) {
      state.tutorial.starterConveyorRemoved = true;
    } else {
      state.placedConveyors = state.placedConveyors.filter((candidate) => candidate !== conveyor);
    }
    invalidateFactoryConveyorCache();
    state.machineInventory.conveyor += 1;
    selectedBuildTool = moveForPlacement ? "conveyor" : null;
    selectedBuildOrientation = conveyor.direction;
    selectedFactoryEntity = null;
    selectedFactoryEntities = [];
    groupMoveState = null;
    addLog(moveForPlacement ? "Conveyor is ready to place." : "Conveyor returned to inventory.");
    if (recoveredCargo.length > 0) {
      addLog(`Recovered ${recoveredCargo.join(" and ")} from the conveyor.`);
    }
    refreshMachineStaticLayer();
    saveGame();
    render();
    return;
  }

  const machine = getMachineByInstanceId(entity.instanceId);
  if (!machine?.movable) {
    addLog(`${getMachineDisplayName(entity.id)} cannot be moved.`);
    render();
    return;
  }
  if (machine.id === "materialStorage" && getStorageCount() <= 1) {
    addLog("Material Storage cannot be withdrawn: at least one storage unit must remain placed.");
    render();
    return;
  }

  if (!moveForPlacement) {
    recoveredCargo = recoverFactoryEntityCargo(entity);
  }

  state.machines = state.machines.filter((candidate) => candidate !== machine);
  invalidateFactoryConveyorCache();
  state.machineInventory[machine.id] += 1;
  state.machineInventoryInstances.push({ ...machine });
  selectedBuildTool = moveForPlacement ? machine.id : null;
  selectedBuildOrientation = machine.orientation ?? "right";
  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  addLog(moveForPlacement
    ? `${getMachineDisplayName(machine.id)} is ready to place.`
    : `${getMachineDisplayName(machine.id)} returned to inventory.`);
  if (recoveredCargo.length > 0) {
    addLog(`Recovered ${recoveredCargo.join(" and ")} from ${getMachineDisplayName(machine.id)}.`);
  }
  refreshMachineStaticLayer();
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function rotateSelectedBuild(direction) {
  if (activeView !== "factory") {
    return;
  }

  if (groupMoveState) {
    if (!rotateFactoryGroup(direction)) {
      return;
    }
    addLog(`Rotated selected group ${direction}.`);
    if (!IS_NODE_TEST_ENVIRONMENT) {
      renderFactoryMachineControls();
      renderMachineOverlay();
    }
    return;
  }

  const currentOrientation = selectedFactoryEntity?.type === "machine"
    ? getMachineByInstanceId(selectedFactoryEntity.instanceId)?.orientation
    : selectedFactoryEntity?.type === "conveyor"
      ? getPlacedConveyor(selectedFactoryEntity.column, selectedFactoryEntity.row)?.direction
      : selectedBuildOrientation;
  if (!currentOrientation) {
    return;
  }

  const currentIndex = CONVEYOR_ORIENTATIONS.indexOf(currentOrientation);
  const offset = direction === "clockwise" ? 1 : -1;
  const nextIndex = (currentIndex + offset + CONVEYOR_ORIENTATIONS.length) % CONVEYOR_ORIENTATIONS.length;
  const nextOrientation = CONVEYOR_ORIENTATIONS[nextIndex];
  if (selectedFactoryEntity?.type === "machine") {
    const machine = getMachineByInstanceId(selectedFactoryEntity.instanceId);
    if (!machine?.movable || isMachineBusy(machine) || isFactoryEntityInTransit(selectedFactoryEntity)) {
      if (isFactoryEntityInTransit(selectedFactoryEntity)) {
        addLog("Wait for the item on this factory piece to move on before rotating it.");
        render();
      }
      return;
    }
    if (!isMachineFootprintBuildable(machine, machine.column, machine.row, nextOrientation, machine)) {
      addLog(`${getMachineDisplayName(machine.id)} cannot rotate there: another machine or conveyor blocks its footprint.`);
      render();
      return;
    }
    machine.orientation = nextOrientation;
    invalidateFactoryConveyorCache();
    refreshMachineStaticLayer();
    addLog(`${getMachineDisplayName(machine.id)} now faces ${nextOrientation}.`);
  } else if (selectedFactoryEntity?.type === "conveyor") {
    const conveyor = getPlacedConveyor(selectedFactoryEntity.column, selectedFactoryEntity.row);
    if (!conveyor || isFactoryEntityInTransit(selectedFactoryEntity)) {
      if (conveyor) {
        addLog("Wait for the item on this conveyor to move on before rotating it.");
        render();
      }
      return;
    }
    conveyor.direction = nextOrientation;
    invalidateFactoryConveyorCache();
    refreshMachineStaticLayer();
    addLog(`Selected conveyor now faces ${nextOrientation}.`);
  } else if (selectedBuildTool) {
    selectedBuildOrientation = nextOrientation;
    addLog(`Selected ${selectedBuildTool} now faces ${nextOrientation}.`);
  } else {
    return;
  }
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    renderFactoryMachineControls();
    renderMachineOverlay();
    renderAmmoMaker();
  }
}

