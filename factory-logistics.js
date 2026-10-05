"use strict";

// Cargo, storage, smelting recipes, item transformations, and value routing.

function createDeposit({ cell, type }, index, yieldMultiplier = 1) {
  const definition = RESOURCE_DEFINITIONS[type];

  return {
    id: `deposit-${index + 1}`,
    cell,
    type,
    segmentsRemaining: definition.segments,
    segmentsTotal: definition.segments,
    currentSegmentHitPoints: definition.hitPointsPerSegment,
    hitPointsPerSegment: definition.hitPointsPerSegment,
    yield: definition.yield * yieldMultiplier,
  };
}

function getActiveDeposits() {
  return state.deposits.filter((deposit) => deposit.segmentsRemaining > 0);
}

function getRealityShield() {
  return state.mine.realityShield;
}

function hasDiamondTippedDrill() {
  return state.drill.upgradeId === "diamondTipped";
}

function getRealityShieldDps() {
  if (hasDiamondTippedDrill() || getRealityShield().temporaryBattle) {
    return DRILL_UPGRADES.diamondTipped.dps
      * (isPlaytestCheatEnabled("drillDpsX10") ? 10 : 1);
  }
  return getDrillDps();
}

function createRealityShieldWave() {
  const shieldColumns = CONFIG.realityShieldColumns;
  const shieldRows = CONFIG.realityShieldRows;
  const cells = Array.from(
    { length: shieldColumns * shieldRows },
    (_, cell) => cell,
  ).filter((cell) => {
    const column = cell % shieldColumns;
    const row = Math.floor(cell / shieldColumns);
    return column > 0
      && column < shieldColumns - 1
      && row > 0
      && row < shieldRows - 1;
  });

  // Keep targets away from the edge while making each refresh visually distinct.
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cells[index], cells[swapIndex]] = [cells[swapIndex], cells[index]];
  }

  return Array.from({ length: CONFIG.realityShieldWaveSize }, (_, index) => ({
    id: `reality-shield-${Date.now()}-${index}`,
    cell: cells[index % cells.length],
    type: REALITY_SHIELD_CROSSHAIR_TYPE,
    rotation: Math.floor(Math.random() * 360),
    deathRotation: (Math.random() < 0.5 ? -1 : 1) * (720 + Math.floor(Math.random() * 721)),
  }));
}

function getDepositById(depositId) {
  return state.deposits.find((deposit) => deposit.id === depositId) ?? null;
}

function getTargetDeposit() {
  if (getRealityShield()?.active) {
    const selectedShieldOre = getRealityShield().ores.find((ore) => (
      ore.id === state.selectedDepositId && !ore.defeatedAt
    ));
    return selectedShieldOre ?? null;
  }

  const selected = getDepositById(state.selectedDepositId);
  if (selected?.segmentsRemaining > 0) {
    return selected;
  }

  return getActiveDeposits()[0] ?? null;
}

function getRemainingDepositHitPoints(deposit) {
  if (!deposit || deposit.segmentsRemaining <= 0) {
    return 0;
  }

  return (deposit.segmentsRemaining - 1) * deposit.hitPointsPerSegment + deposit.currentSegmentHitPoints;
}

function getGunScheduleForTunnel(tunnel = getCurrentTunnel()) {
  return normalizeGunSchedule(state.mine.gunSchedulesByTunnel?.[tunnel]);
}

function getGunScheduleRuntime(tunnel = getCurrentTunnel()) {
  if (!state.mine.gunScheduleRuntimeByTunnel) {
    state.mine.gunScheduleRuntimeByTunnel = normalizeGunScheduleRuntimeMap();
  }
  if (!state.mine.gunScheduleRuntimeByTunnel[tunnel]) {
    state.mine.gunScheduleRuntimeByTunnel[tunnel] = { stepIndex: 0, shotsFired: 0 };
  }
  return state.mine.gunScheduleRuntimeByTunnel[tunnel];
}

function isGunScheduleActive(tunnel = getCurrentTunnel()) {
  return Boolean(
    state.mine.gunSchedulingUnlocked
      && !getRealityShield()?.active
      && state.mine.gunScheduleEnabledByTunnel?.[tunnel]
      && getGunScheduleForTunnel(tunnel).length > 0,
  );
}

function getScheduledGun(tunnel = getCurrentTunnel()) {
  if (!isGunScheduleActive(tunnel)) {
    return null;
  }

  const schedule = getGunScheduleForTunnel(tunnel);
  const runtime = getGunScheduleRuntime(tunnel);
  const step = schedule[runtime.stepIndex % schedule.length];
  if (step?.gun === "buckshot" && !state.mine.buckshotGunPurchased) {
    return "rapidfire";
  }
  return step?.gun ?? "rapidfire";
}

function resetGunScheduleProgress(tunnel = getCurrentTunnel()) {
  const runtime = getGunScheduleRuntime(tunnel);
  runtime.stepIndex = 0;
  runtime.shotsFired = 0;
}

function advanceGunScheduleAfterShot() {
  const tunnel = getCurrentTunnel();
  if (!isGunScheduleActive(tunnel)) {
    return;
  }

  const schedule = getGunScheduleForTunnel(tunnel);
  const runtime = getGunScheduleRuntime(tunnel);
  const step = schedule[runtime.stepIndex % schedule.length];
  runtime.shotsFired += 1;
  if (runtime.shotsFired >= step.shots) {
    runtime.stepIndex = (runtime.stepIndex + 1) % schedule.length;
    runtime.shotsFired = 0;
  }
}

function getSelectedGun() {
  return getScheduledGun() ?? (state.mine?.selectedGun === "buckshot" && state.mine.buckshotGunPurchased
    ? "buckshot"
    : "rapidfire");
}

function getSelectedGunAmmoType() {
  return getSelectedGun() === "buckshot" ? "buckshot" : "rapidfire";
}

function getGunDisplayName(gunId = getSelectedGun()) {
  if (gunId === "buckshot") {
    return "Buckshot Gun";
  }
  return state.mine?.rapidfireGunMk1Purchased
    ? "Rapidfire Gun Mk. 1"
    : "Rapidfire Gun Mk. 0";
}

function getFactoryGunDisplayLabel(gunId = getSelectedGun()) {
  return gunId === "buckshot"
    ? "BUCKSHOT\nGUN"
    : state.mine?.rapidfireGunMk1Purchased
      ? "RAPIDFIRE\nGUN MK. 1"
      : "RAPIDFIRE\nGUN MK. 0";
}

function getFactoryGunDisplayColor(gunId = getSelectedGun()) {
  return gunId === "buckshot" ? "#ffd39e" : "#edf5bd";
}

function getFactoryAmmoReadyLabel(stack = getSelectedAmmoStack()) {
  return `${formatNumber(stack?.count ?? 0)} ready`;
}

function getSelectedGunFireRate() {
  return getSelectedGun() === "buckshot"
    ? BUCKSHOT_FIRE_PER_SECOND
    : CONFIG.autoFirePerSecond;
}

function getTotalAmmo() {
  const type = getSelectedGunAmmoType();
  return state.ammoStacks
    .filter((stack) => (stack.type ?? "rapidfire") === type && canFireAmmoStack(stack))
    .reduce((total, stack) => total + stack.count, 0);
}

function getPlacedConveyor(column, row) {
  return state.placedConveyors.find(
    (conveyor) => conveyor.column === column && conveyor.row === row,
  ) ?? null;
}

function getActiveFixedConveyors() {
  return FIXED_CONVEYORS.filter((conveyor) => (
    !(state.tutorial.starterConveyorRemoved
      && conveyor === FIXED_CONVEYORS[0])
  ));
}

function getFactorySelectableConveyor(column, row) {
  return getPlacedConveyor(column, row)
    ?? getActiveFixedConveyors().find((conveyor) => conveyor.column === column && conveyor.row === row)
    ?? null;
}

function getMachine(machineId) {
  return state.machines.find((machine) => machine.id === machineId) ?? null;
}

function getMachines(machineId) {
  return state.machines.filter((machine) => machine.id === machineId);
}

function getSellTubeMachines() {
  return state.machines.filter((machine) => SELL_TUBE_MACHINE_IDS.includes(machine.id));
}

function getSellTubeValueMultiplier(sellTube) {
  return SELL_TUBE_VALUE_MULTIPLIERS[sellTube?.id] ?? 1;
}

function getMachineByInstanceId(instanceId) {
  return state.machines.find((machine) => machine.instanceId === instanceId) ?? null;
}

function getStorageCount() {
  return state.machines.filter((machine) => machine.id === "materialStorage").length;
}

function getStorageOutputPorts(storage) {
  if (!storage) {
    return [];
  }

  const size = getMachineFootprintSize(storage);
  const ports = [];
  const addPort = (column, row, direction) => {
    if (isFactoryGridTile(column, row)) {
      ports.push({ number: ports.length + 1, column, row, direction });
    }
  };

  for (let offset = 0; offset < size.width; offset += 1) {
    addPort(storage.column + offset, storage.row - 1, "up");
  }
  for (let offset = 0; offset < size.height; offset += 1) {
    addPort(storage.column + size.width, storage.row + offset, "right");
  }
  for (let offset = size.width - 1; offset >= 0; offset -= 1) {
    addPort(storage.column + offset, storage.row + size.height, "down");
  }
  for (let offset = size.height - 1; offset >= 0; offset -= 1) {
    addPort(storage.column - 1, storage.row + offset, "left");
  }

  return ports;
}

function getStorageOutputKey(storage, port) {
  return `${storage.column},${storage.row}:${port.number}`;
}

function getStorageOutputFilter(storage, port) {
  return state.storageOutputFilters[getStorageOutputKey(storage, port)] ?? [];
}

function isStorageOutputActive(storage, port) {
  const conveyor = getPlacedConveyor(port.column, port.row);
  return conveyor?.direction === port.direction;
}

function getActiveStorageOutputPorts(storage) {
  return getStorageOutputPorts(storage).filter((port) => isStorageOutputActive(storage, port));
}

function getStorageOutputDisplayNumber(storage, port) {
  return getActiveStorageOutputPorts(storage).findIndex((candidate) => (
    candidate.number === port.number
  )) + 1;
}

function toggleStorageOutputFilter(storage, port, material) {
  const key = getStorageOutputKey(storage, port);
  const enabled = new Set(getStorageOutputFilter(storage, port));
  if (enabled.has(material)) {
    enabled.delete(material);
  } else {
    enabled.add(material);
  }
  state.storageOutputFilters[key] = Array.from(enabled);
  if (
    getTutorialStage() === "saleFilter"
    && material === "copper"
    && enabled.has(material)
    && getDusterForRoute(getStorageSellRoute(storage, port), material)
  ) {
    state.tutorial.stage = "sellWait";
  }
  addLog(`Storage output ${getStorageOutputDisplayNumber(storage, port)} now ${enabled.has(material) ? "allows" : "blocks"} ${MATERIAL_LABELS[material]}.`);
  render();
}

function getFactoryCargoInTransit() {
  return getFactoryConveyors().filter(({ conveyor }) => (
    getConveyorItem(conveyor) !== null
  )).length;
}

function getFactoryTileKey(column, row) {
  return `${column},${row}`;
}

function getFactoryEntityTileKeys(entity) {
  if (!entity) {
    return [];
  }

  if (entity.type === "conveyor") {
    return [getFactoryTileKey(entity.column, entity.row)];
  }

  const machine = entity.type === "machine" ? getMachineByInstanceId(entity.instanceId) : null;
  if (!machine) {
    return [];
  }

  return getMachineOccupiedTiles(machine).map(({ column, row }) => (
    getFactoryTileKey(column, row)
  ));
}

function getFactoryConveyors() {
  if (factoryConveyorCache) {
    return factoryConveyorCache;
  }

  factoryConveyorCache = [
    ...state.placedConveyors.map((conveyor) => ({ conveyor, kind: "placed" })),
    ...getActiveFixedConveyors().map((conveyor) => ({ conveyor, kind: "fixed" })),
    ...state.machines.flatMap((machine) => (
      getInternalConveyorTiles(machine).map((conveyor, index) => ({
        conveyor: {
          ...conveyor,
          internalMachineId: machine.id,
          internalMachineInstanceId: machine.instanceId,
          internalIndex: index,
        },
        kind: "internal",
      }))
    )),
  ];
  factoryConveyorByIdentity = new Map(factoryConveyorCache.map(({ conveyor }) => [
    getConveyorIdentity(conveyor),
    conveyor,
  ]));
  factoryConveyorByTile = new Map(factoryConveyorCache.map(({ conveyor }) => [
    getFactoryTileKey(conveyor.column, conveyor.row),
    conveyor,
  ]));
  return factoryConveyorCache;
}

function invalidateFactoryConveyorCache() {
  fluidPipeNetworkCache = null;
  factoryConveyorCache = null;
  factoryConveyorByIdentity = null;
  factoryConveyorByTile = null;
}

function getActiveFactoryConveyorItems() {
  getFactoryConveyors();
  const activeItems = [];

  state.placedConveyors.forEach((conveyor) => {
    if (conveyor.item) {
      activeItems.push({ conveyor, item: conveyor.item });
    }
  });

  getActiveFixedConveyors().forEach((conveyor) => {
    const item = state.fixedConveyorItems[getFactoryTileKey(conveyor.column, conveyor.row)];
    if (item) {
      activeItems.push({ conveyor, item });
    }
  });

  Object.entries(state.internalConveyorItems).forEach(([key, item]) => {
    if (!item) {
      return;
    }
    const conveyor = factoryConveyorByIdentity?.get(`internal:${key}`);
    if (conveyor) {
      activeItems.push({ conveyor, item });
    }
  });

  return activeItems;
}

function isFixedConveyor(conveyor) {
  return FIXED_CONVEYORS.includes(conveyor);
}

function isInternalConveyor(conveyor) {
  return Boolean(conveyor?.internalMachineId);
}

function getInternalConveyorKey(conveyor) {
  return `${conveyor.internalMachineInstanceId ?? conveyor.internalMachineId}:${conveyor.internalIndex}`;
}

function getInternalConveyor(machine, index) {
  const conveyor = getInternalConveyorTiles(machine)[index];
  return conveyor ? {
    ...conveyor,
    internalMachineId: machine.id,
    internalMachineInstanceId: machine.instanceId,
    internalIndex: index,
  } : null;
}

function getConveyorItem(conveyor) {
  if (!conveyor) {
    return null;
  }

  if (isInternalConveyor(conveyor)) {
    return state.internalConveyorItems[getInternalConveyorKey(conveyor)] ?? null;
  }

  if (isFixedConveyor(conveyor)) {
    return state.fixedConveyorItems[getFactoryTileKey(conveyor.column, conveyor.row)] ?? null;
  }

  return conveyor.item ?? null;
}

function setConveyorItem(conveyor, item) {
  if (!conveyor) {
    return;
  }

  if (isInternalConveyor(conveyor)) {
    state.internalConveyorItems[getInternalConveyorKey(conveyor)] = item;
    return;
  }

  if (isFixedConveyor(conveyor)) {
    state.fixedConveyorItems[getFactoryTileKey(conveyor.column, conveyor.row)] = item;
    return;
  }

  conveyor.item = item;
}

function isFactoryEntityInTransit(entity) {
  const entityTileKeys = getFactoryEntityTileKeys(entity);
  return entityTileKeys.some((tileKey) => (
    getFactoryConveyors().some(({ conveyor }) => (
      getConveyorItem(conveyor) !== null
        && getFactoryTileKey(conveyor.column, conveyor.row) === tileKey
    ))
  ));
}

function getMachineFootprintSize(machine) {
  const orientation = machine.orientation ?? "right";
  return orientation === "up" || orientation === "down"
    ? { width: machine.height, height: machine.width }
    : { width: machine.width, height: machine.height };
}

function getMachineOccupiedTiles(machine) {
  if (!machine) {
    return [];
  }

  const localTiles = Array.isArray(machine.occupiedTiles)
    ? machine.occupiedTiles
    : Array.from({ length: machine.height }, (_, row) => (
      Array.from({ length: machine.width }, (_, column) => ({ column, row }))
    )).flat();
  return localTiles.map(({ column, row }) => (
    rotateMachineCoordinate(machine, column, row)
  ));
}

function getMachinePort(machine, propertyName) {
  let port = machine?.[propertyName];
  if (!port) {
    return null;
  }

  if (machine.id === "contactMaker" && propertyName === "silverInput"
    && machine.metalInputFlipped === true) {
    port = { ...port, row: machine.height - 1 - port.row,
      direction: getOppositeDirection(port.direction) };
  }

  return {
    ...rotateMachineCoordinate(machine, port.column, port.row),
    direction: port.direction
      ? rotateMachineDirection(port.direction, machine.orientation)
      : null,
  };
}

function getMachinePorts(machine, propertyName) {
  return (machine?.[propertyName] ?? []).map((port) => ({
    ...rotateMachineCoordinate(machine, port.column, port.row),
    direction: port.direction
      ? rotateMachineDirection(port.direction, machine.orientation)
      : null,
  }));
}

function getKilnInputAt(column, row) {
  return getMachines("clayKiln").map((kiln) => ({
    kiln,
    input: getMachinePort(kiln, "input"),
  })).find(({ input }) => (
    input?.column === column && input?.row === row
  )) ?? null;
}

function getMachineUpgradeTile(machine) {
  const origin = getMachinePort(machine, "upgradeOrigin");
  if (!origin) {
    return null;
  }

  const direction = DIRECTION_VECTORS[machine.orientation ?? "right"];
  return {
    column: origin.column + direction.column,
    row: origin.row + direction.row,
  };
}

function getMolderKilnLink(molder = getMachine("ingotMolder"), portName = "liquidInputOutput") {
  const molderPort = getMachinePort(molder, portName);
  if (!molderPort || !molderPort.direction) {
    return null;
  }

  const link = getAdjacentFluidSourceLinks([molderPort])[0];
  return link ? { kiln: link.source, kilnOutput: link.output, molderPort } : null;
}

function getArcFurnaceInputAt(column, row) {
  for (const furnace of getMachines("miniElectricArcFurnace")) {
    const input = getInternalConveyorTiles(furnace).find((conveyor) => (
      conveyor.arcFurnaceSlot
        && conveyor.column === column
        && conveyor.row === row
    ));
    if (input) {
      return { furnace, slot: input.arcFurnaceSlot, input };
    }
  }
  return null;
}

function getArcFurnaceInputForConveyor(conveyor) {
  if (!isInternalConveyor(conveyor) || conveyor.internalMachineId !== "miniElectricArcFurnace") {
    return null;
  }

  const input = getInternalConveyorTiles(getInternalConveyorMachine(conveyor))[
    conveyor.internalIndex
  ];
  return input?.arcFurnaceSlot
    ? { furnace: getInternalConveyorMachine(conveyor), slot: input.arcFurnaceSlot, input }
    : null;
}

function getArcFurnaceInputState(furnace) {
  const existing = state.arcFurnaceInputs[furnace.instanceId];
  if (existing && Array.isArray(existing.primary)
    && Array.isArray(existing.secondary)
    && Array.isArray(existing.tertiary)) {
    return existing;
  }

  const inputState = { primary: [], secondary: [], tertiary: [] };
  state.arcFurnaceInputs[furnace.instanceId] = inputState;
  return inputState;
}

function getArcFurnaceInputQuantity(furnace, slot) {
  return getArcFurnaceInputState(furnace)[slot]
    .reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);
}

function getArcFurnaceInputCapacity(furnace, slot) {
  const recipe = getArcFurnaceRecipeDefinition(furnace);
  if (!recipe) {
    if (slot !== "primary") {
      return 0;
    }
    return getArcFurnaceInputState(furnace).primary.some((item) => ARC_FURNACE_ORE_INPUTS.includes(item.material))
      ? 2
      : 1;
  }
  return recipe.slots[slot]?.quantity ?? 0;
}

function isCopperAlloyInput(material) {
  return ["copper", "nativeCopper", "copperIngot", "brittleCopperIngot"].includes(material);
}

function isTinAlloyInput(material) {
  return material === "tin" || material === "tinIngot";
}

function isSilverAlloyInput(material) {
  return material === "silver" || material === "silverIngot";
}

function isSmeltableMetalInput(material) {
  return KILN_INPUT_MATERIALS.includes(material)
    || SMELTABLE_INGOT_MATERIALS.includes(material)
    || ARC_FURNACE_ORE_INPUTS.includes(material);
}

const ARC_FURNACE_RECIPES = Object.freeze({
  alloy2: Object.freeze({
    name: "Bronze",
    description: "5 Copper + 1 Tin → 6 liquid Bronze",
    outputMaterial: "bronze",
    outputQuantity: 6,
    inputCount: 6,
    ingredients: Object.freeze([
      Object.freeze({ quantity: 5, slots: Object.freeze(["primary"]), materials: isCopperAlloyInput }),
      Object.freeze({ quantity: 1, slots: Object.freeze(["secondary", "tertiary"]), materials: isTinAlloyInput }),
    ]),
    slots: Object.freeze({
      primary: Object.freeze({ quantity: 5, materials: isCopperAlloyInput }),
      secondary: Object.freeze({ quantity: 1, materials: isTinAlloyInput }),
      tertiary: Object.freeze({ quantity: 1, materials: isTinAlloyInput }),
    }),
  }),
  copperContactAlloy: Object.freeze({
    name: "Copper Contact Alloy",
    description: "4 Silver + 1 Copper → 5 liquid Copper Contact Alloy",
    outputMaterial: "copperContactAlloy",
    outputQuantity: 5,
    inputCount: 5,
    ingredients: Object.freeze([
      Object.freeze({ quantity: 4, slots: Object.freeze(["primary"]), materials: isSilverAlloyInput }),
      Object.freeze({ quantity: 1, slots: Object.freeze(["secondary", "tertiary"]), materials: isCopperAlloyInput }),
    ]),
    slots: Object.freeze({
      primary: Object.freeze({ quantity: 4, materials: isSilverAlloyInput }),
      secondary: Object.freeze({ quantity: 1, materials: isCopperAlloyInput }),
      tertiary: Object.freeze({ quantity: 1, materials: isCopperAlloyInput }),
    }),
  }),
  tinContactAlloy: Object.freeze({
    name: "Tin Contact Alloy",
    description: "9 Silver + 1 Tin → 10 liquid Tin Contact Alloy",
    outputMaterial: "tinContactAlloy",
    outputQuantity: 10,
    inputCount: 10,
    ingredients: Object.freeze([
      Object.freeze({ quantity: 9, slots: Object.freeze(["primary"]), materials: isSilverAlloyInput }),
      Object.freeze({ quantity: 1, slots: Object.freeze(["secondary", "tertiary"]), materials: isTinAlloyInput }),
    ]),
    slots: Object.freeze({
      primary: Object.freeze({ quantity: 9, materials: isSilverAlloyInput }),
      secondary: Object.freeze({ quantity: 1, materials: isTinAlloyInput }),
      tertiary: Object.freeze({ quantity: 1, materials: isTinAlloyInput }),
    }),
  }),
});

const ARC_FURNACE_RECIPE_OPTIONS = Object.freeze([
  Object.freeze({
    value: "smelting",
    label: "Single smelting",
    description: "one metal input; Hematite and Clay use two inputs",
  }),
  ...Object.entries(ARC_FURNACE_RECIPES).map(([value, recipe]) => Object.freeze({
    value,
    label: recipe.name,
    description: recipe.description,
  })),
]);

const CRAFTING_RECIPES = Object.freeze([
  Object.freeze({
    category: "Material processing",
    machine: "Aggregate Mixer",
    name: "Aggregate",
    input: "40 Limestone + 20 Chert",
    output: "10 Aggregate",
    note: "Takes 10 seconds. No crew required.",
  }),
  Object.freeze({
    category: "Leek processing",
    name: "Leek Fiber",
    machine: "Leek Fiber Extractor",
    input: "1 Leek",
    output: "1 Leek Fiber",
    note: "No crew required.",
  }),
  Object.freeze({
    category: "Metal forming",
    name: "Copper Wire",
    machine: "Extruder · Wire mode",
    input: "1 Copper Ingot",
    output: "5 Copper Wires",
    note: "Copper only. Each wire receives 50% of the incoming ingot’s current value.",
  }),
  Object.freeze({
    category: "Electrical assembly",
    name: "Silver Contacts",
    machine: "Contact Maker",
    input: "5 Copper Wires + 0.5 Silver Ingots",
    output: "5 Silver Contacts",
    note: "Uses the ×2 contact value multiplier; base value is $8.8.",
  }),
  Object.freeze({
    category: "Electrical assembly",
    name: "Silver-Copper Contacts",
    machine: "Contact Maker",
    input: "5 Copper Wires + 0.5 Copper Contact Alloy Ingots",
    output: "5 Silver-Copper Contacts",
    note: "Uses the ×3 contact-alloy value multiplier.",
  }),
  Object.freeze({
    category: "Electrical assembly",
    name: "Silver-Tin Contacts",
    machine: "Contact Maker",
    input: "5 Copper Wires + 0.5 Tin Contact Alloy Ingots",
    output: "5 Silver-Tin Contacts",
    note: "Uses the ×3 contact-alloy value multiplier.",
  }),
  Object.freeze({
    category: "Ammunition",
    name: "Leek Rapidfire Rounds",
    machine: "Bullet Core Caster · Basic mode",
    input: "1 Leek",
    output: "10 Leek rounds",
    note: "1 damage per round.",
  }),
  Object.freeze({
    category: "Ammunition",
    name: "Mineral-Coated Rapidfire Rounds",
    machine: "Bullet Core Caster · Coated mode",
    input: "1 Leek + 0.5 liquid Malachite or Lead",
    output: "25 coated rounds",
    note: "Malachite deals 3 damage; Lead deals 5 damage.",
  }),
  Object.freeze({
    category: "Ammunition",
    name: "Copper-Jacketed Rounds",
    machine: "Jacket Former",
    input: "25 mineral-core rounds + 0.5 liquid Native copper",
    output: "25 Copper-jacketed rounds",
    note: "Damage follows the core × jacket formula raised to the 0.85 power. The jacket is held until liquid Native copper arrives.",
  }),
  Object.freeze({
    category: "Ammunition",
    name: "Buckshot Rounds",
    machine: "Casing Machine",
    input: "25 jacketed rounds + 1 liquid Bronze, Brass, or Steel",
    output: "5 Buckshot rounds",
    note: "The Buckshot Gun fires one round per second and scatters 10 hits across active ore segments, with no more than 2 pellets landing on one ore.",
  }),
  Object.freeze({
    category: "Low-temperature smelting",
    name: "Liquid Metal",
    machine: "Clay Kiln",
    input: "1 supported low-melting ore or ingot",
    output: "1 liquid metal",
    note: "Uses 2 crew and takes 5 seconds. The liquid output feeds an Ingot Molder, Refractory Caster, or Bullet Core Caster.",
  }),
  Object.freeze({
    category: "High-temperature firing",
    name: "Liquid Iron",
    machine: "Mini Electric Arc Furnace · Single smelting",
    input: "2 Hematite ore",
    output: "1 liquid Iron",
    note: "Uses 1 crew and takes 4 seconds.",
  }),
  Object.freeze({
    category: "High-temperature firing",
    name: "Ceramic",
    machine: "Mini Electric Arc Furnace · Single smelting",
    input: "2 Clay",
    output: "1 Ceramic",
    note: "Uses 1 crew and takes 4 seconds. The fired solid leaves through the furnace output; no Ingot Molder is required.",
  }),
  Object.freeze({
    category: "Alloy smelting",
    name: "Bronze",
    machine: "Mini Electric Arc Furnace · manual recipe selection",
    input: "5 Copper + 1 Tin",
    output: "6 liquid Bronze",
    note: "Uses 1 crew and takes 12 seconds; the existing Ingot Molder casts it into Bronze Ingots.",
  }),
  Object.freeze({
    category: "Alloy smelting",
    name: "Copper Contact Alloy",
    machine: "Mini Electric Arc Furnace · manual recipe selection",
    input: "4 Silver + 1 Copper",
    output: "5 liquid Copper Contact Alloy",
    note: "Uses 1 crew and takes 10 seconds; the Ingot Molder casts it into Copper Contact Alloy Ingots.",
  }),
  Object.freeze({
    category: "Alloy smelting",
    name: "Tin Contact Alloy",
    machine: "Mini Electric Arc Furnace · manual recipe selection",
    input: "9 Silver + 1 Tin",
    output: "10 liquid Tin Contact Alloy",
    note: "Uses 1 crew and takes 20 seconds; the Ingot Molder casts it into Tin Contact Alloy Ingots.",
  }),
  Object.freeze({
    category: "Casting",
    name: "Metal Ingots",
    machine: "Ingot Molder",
    input: "1 supported liquid metal or alloy",
    output: "1 matching ingot",
    note: "Uses 1 crew and takes 1 second.",
  }),
  Object.freeze({
    category: "Casting",
    name: "High-throughput Metal Ingots",
    machine: "Refractory Caster",
    input: "4 units of one supported liquid metal",
    output: "4 matching ingots",
    note: "Uses no crew and takes 2 seconds per batch.",
  }),
  Object.freeze({
    category: "Metal forming",
    name: "Metal Plates",
    machine: "Metal Press",
    input: "1 supported metal ingot",
    output: "1 matching metal plate",
    note: "No crew required; the ingot’s value is preserved.",
  }),
  Object.freeze({
    category: "Gem cutting",
    name: "Cut Malachite",
    machine: "Quartz Wheel Cutter",
    input: "1 Malachite Ore",
    output: "0.4 Cut Malachite",
    note: "Each Cut Malachite has ×250 of the input’s current per-item value and ×250 base value. Cut Malachite cannot receive a Leek Duster pass; dust the ore first if desired.",
  }),
  Object.freeze({
    category: "Metal forming",
    name: "Heavy Gears",
    machine: "Gear Press · Heavy Gear mode",
    input: "2 matching metal plates",
    output: "1 matching Heavy Gear",
    note: "No crew required; total input value is preserved.",
  }),
  Object.freeze({
    category: "Metal forming",
    name: "Fine Gears",
    machine: "Gear Press · Fine Gear mode",
    input: "1 metal plate",
    output: "2 matching Fine Gears",
    note: "No crew required; total input value is split between the two gears.",
  }),
]);

function normalizeArcFurnaceMode(mode) {
  if (mode === "alloy" || mode === "alloy2") {
    return "alloy2";
  }
  if (mode === "alloy3") {
    // The old empty 3-input setting had no recipe; default it to a usable path.
    return "smelting";
  }
  return ["smelting", "alloy2", "copperContactAlloy", "tinContactAlloy"].includes(mode)
    ? mode
    : "smelting";
}

function getArcFurnaceMode(furnace) {
  return normalizeArcFurnaceMode(furnace?.mode);
}

function switchArcFurnaceMode(furnace, mode) {
  if (!furnace || furnace.id !== "miniElectricArcFurnace"
    || !ARC_FURNACE_RECIPE_OPTIONS.some((option) => option.value === mode)) {
    return false;
  }

  const previousMode = getArcFurnaceMode(furnace);
  if (previousMode === mode) {
    return false;
  }

  const inputState = getArcFurnaceInputState(furnace);
  const discardedInputQuantity = Object.values(inputState).flat().reduce(
    (total, item) => total + Math.max(0, Number(item.quantity ?? 1) || 0),
    0,
  );
  const discardedLiquidQuantity = state.moltenCopper
    .filter((liquidMetal) => (
      getMoltenMetalOwnerInstanceId(liquidMetal) === furnace.instanceId
    ))
    .reduce((total, liquidMetal) => (
      total + Math.max(0, Number(liquidMetal.quantity ?? 1) || 0)
    ), 0);
  const cancelledJobCount = state.arcFurnaceJobs.filter((job) => (
    job.furnaceInstanceId === furnace.instanceId
  )).length;

  state.arcFurnaceInputs[furnace.instanceId] = {
    primary: [],
    secondary: [],
    tertiary: [],
  };
  state.arcFurnaceJobs = state.arcFurnaceJobs.filter((job) => (
    job.furnaceInstanceId !== furnace.instanceId
  ));
  state.moltenCopper = state.moltenCopper.filter((liquidMetal) => (
    getMoltenMetalOwnerInstanceId(liquidMetal) !== furnace.instanceId
  ));
  furnace.mode = mode;

  const losses = [];
  if (discardedInputQuantity > 0) {
    losses.push(`${formatQuantity(discardedInputQuantity)} buffered input`);
  }
  if (discardedLiquidQuantity > 0) {
    losses.push(`${formatQuantity(discardedLiquidQuantity)} liquid metal`);
  }
  if (cancelledJobCount > 0) {
    losses.push("the in-progress batch");
  }
  const recipeLabel = ARC_FURNACE_RECIPE_OPTIONS.find((option) => option.value === mode)?.label;
  addLog(`Mini Electric Arc Furnace selected ${recipeLabel ?? "Single smelting"} recipe${losses.length > 0
    ? `; lost ${losses.join(", ")}`
    : "."}`);
  return true;
}

function getArcFurnaceRecipeDefinition(furnace) {
  return ARC_FURNACE_RECIPES[getArcFurnaceMode(furnace)] ?? null;
}

function canArcFurnaceAcceptInput(furnace, slot, item) {
  if (!furnace || item?.kind !== "material" || !Number.isFinite(item.quantity) || item.quantity < 1) {
    return false;
  }

  const recipe = getArcFurnaceRecipeDefinition(furnace);
  const mode = getArcFurnaceMode(furnace);
  if (mode !== "smelting" && !recipe) {
    return false;
  }
  if (recipe) {
    const slotRecipe = recipe.slots[slot];
    return Boolean(slotRecipe)
      && slotRecipe.materials(item.material)
      && getArcFurnaceInputQuantity(furnace, slot) < getArcFurnaceInputCapacity(furnace, slot);
  }

  return slot === "primary"
    && isSmeltableMetalInput(item.material)
    && (getArcFurnaceInputState(furnace).primary.length === 0
      || getArcFurnaceInputState(furnace).primary.every(({ material }) => material === item.material))
    && getArcFurnaceInputQuantity(furnace, "primary")
      < getArcFurnaceInputCapacity(furnace, "primary");
}

function getSmeltedLiquidMaterial(material) {
  return {
    copper: "copper",
    nativeCopper: "nativeCopper",
    lead: "lead",
    silver: "silver",
    tin: "tin",
    zinc: "zinc",
    hematite: "iron",
    clay: "ceramic",
    copperIngot: "nativeCopper",
    brittleCopperIngot: "copper",
    silverIngot: "silver",
    copperContactAlloyIngot: "copperContactAlloy",
    tinContactAlloyIngot: "tinContactAlloy",
    tinIngot: "tin",
    zincIngot: "zinc",
    bronzeIngot: "bronze",
    ironIngot: "iron",
  }[material] ?? null;
}

function getEffectiveSmeltingValue(item) {
  const value = getItemSaleValue(item);
  return ORE_CHUNK_MATERIALS.includes(item.material) ? value * 4 : value;
}

function getArcFurnaceInputFamily(material) {
  if (isCopperAlloyInput(material)) {
    return "copper";
  }
  if (isTinAlloyInput(material)) {
    return "tin";
  }
  return material;
}

function getArcFurnaceInputValueUnits(item) {
  if (Array.isArray(item.arcValueUnits)) {
    return item.arcValueUnits.slice();
  }
  return Array.from(
    { length: Math.max(0, Number(item.quantity) || 0) },
    () => getEffectiveSmeltingValue(item),
  );
}

function takeArcFurnaceInputUnits(inputState, slot, quantity) {
  let remaining = quantity;
  let totalValue = 0;
  const items = inputState[slot];

  while (remaining > 0 && items.length > 0) {
    const item = items[0];
    const available = Math.max(0, Number(item.quantity) || 0);
    const taken = Math.min(remaining, available);
    const valueUnits = getArcFurnaceInputValueUnits(item);
    totalValue += valueUnits.splice(0, taken).reduce((sum, value) => sum + value, 0);
    item.quantity -= taken;
    item.arcValueUnits = valueUnits;
    remaining -= taken;
    if (item.quantity <= 0) {
      items.shift();
    }
  }

  return totalValue;
}

function takeArcFurnaceInputUnitsAcrossSlots(inputState, slots, quantity) {
  let remaining = quantity;
  let totalValue = 0;
  slots.forEach((slot) => {
    if (remaining > 0) {
      const available = inputState[slot].reduce(
        (total, item) => total + Math.max(0, Number(item.quantity) || 0),
        0,
      );
      const taken = Math.min(remaining, available);
      const value = takeArcFurnaceInputUnits(inputState, slot, taken);
      totalValue += value;
      remaining -= taken;
    }
  });
  return totalValue;
}

function getArcFurnaceInputValueAcrossSlots(inputState, slots, quantity) {
  let remaining = quantity;
  let totalValue = 0;
  slots.forEach((slot) => {
    inputState[slot].forEach((item) => {
      if (remaining <= 0) {
        return;
      }
      const taken = Math.min(remaining, Math.max(0, Number(item.quantity) || 0));
      totalValue += getArcFurnaceInputValueUnits(item)
        .slice(0, taken)
        .reduce((sum, value) => sum + value, 0);
      remaining -= taken;
    });
  });
  return totalValue;
}

function getArcFurnaceRecipe(furnace) {
  const inputState = getArcFurnaceInputState(furnace);
  const recipe = getArcFurnaceRecipeDefinition(furnace);
  if (getArcFurnaceMode(furnace) === "smelting") {
    const item = inputState.primary[0];
    const inputCount = ARC_FURNACE_ORE_INPUTS.includes(item?.material) ? 2 : 1;
    if (!item || item.quantity < inputCount) {
      return null;
    }
    const inputValues = getArcFurnaceInputValueUnits(item).slice(0, inputCount);
    return {
      inputCount,
      inputMaterial: item.material,
      sourceMaterial: item.material,
      cashUpgraderEligibility: getCashUpgraderEligibilityTags(item),
      outputMaterial: getSmeltedLiquidMaterial(item.material),
      outputQuantity: 1,
      outputValue: inputValues.reduce((sum, value) => sum + value, 0) / inputCount,
      consume: () => takeArcFurnaceInputUnits(inputState, "primary", inputCount),
    };
  }

  if (!recipe) {
    return null;
  }

  const hasAllIngredients = recipe.ingredients.every((ingredient) => {
    const available = ingredient.slots.reduce(
      (total, slot) => total + getArcFurnaceInputQuantity(furnace, slot),
      0,
    );
    const bufferedItems = ingredient.slots.flatMap((slot) => inputState[slot]);
    return available >= ingredient.quantity
      && bufferedItems.every((item) => ingredient.materials(item.material));
  });
  if (!hasAllIngredients) {
    return null;
  }

  return {
    name: recipe.name,
    description: recipe.description,
    inputCount: recipe.inputCount,
    outputMaterial: recipe.outputMaterial,
    outputQuantity: recipe.outputQuantity,
    outputValue: recipe.ingredients.reduce((total, ingredient) => (
      total + getArcFurnaceInputValueAcrossSlots(
        inputState,
        ingredient.slots,
        ingredient.quantity,
      )
    ), 0) / recipe.inputCount,
    consume: () => {
      recipe.ingredients.forEach((ingredient) => {
        takeArcFurnaceInputUnitsAcrossSlots(inputState, ingredient.slots, ingredient.quantity);
      });
    },
  };
}

function isMolderLinkedToKiln(molder = getMachine("ingotMolder")) {
  return Boolean(getMolderKilnLink(molder));
}

function hasAtLeastQuantity(quantity, required) {
  const available = Number(quantity);
  if (!Number.isFinite(available) || !Number.isFinite(required)) {
    return false;
  }
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(available), Math.abs(required)) * 16;
  return available + tolerance >= required;
}

function subtractQuantity(item, quantity, fallbackQuantity = 0) {
  const available = Number(item.quantity ?? fallbackQuantity) || 0;
  const remainder = available - quantity;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(available), Math.abs(quantity)) * 16;
  item.quantity = Math.abs(remainder) <= tolerance ? 0 : remainder;
  return item.quantity;
}

function getArcFurnaceSolidOutputConveyor(furnace) {
  const outlet = getMachinePort(furnace, "liquidOutput");
  if (!outlet?.direction) {
    return null;
  }

  const vector = DIRECTION_VECTORS[outlet.direction];
  const conveyor = getConveyorAt(
    outlet.column + vector.column,
    outlet.row + vector.row,
  );
  return canConveyorFeedInto(outlet, conveyor) ? conveyor : null;
}

function emitArcFurnaceSolidOutput(furnace, item) {
  if (!furnace) return 0;
  const outlet = getMachinePort(furnace, "liquidOutput");
  if (!outlet?.direction) return 0;
  const vector = DIRECTION_VECTORS[outlet.direction];
  const column = outlet.column + vector.column;
  const row = outlet.row + vector.row;
  const stacker = getStackerAt(column, row);
  if (!stacker) return emitCapacitySafeCargo(getArcFurnaceSolidOutputConveyor(furnace), item);
  if (!canStackerReceiveFromConveyor(stacker, outlet)) return 0;

  const buffer = getStackerBuffer(stacker);
  const occupiedWeight = buffer ? getCargoWeight({ ...buffer.item, quantity: buffer.quantity }) : 0;
  const maximum = (getConveyorWeightCapacity(getStackerConveyor(stacker)) - occupiedWeight)
    / getCargoUnitWeight(item);
  const quantity = item.quantity <= maximum + 1e-9 ? item.quantity : Math.floor(maximum + 1e-9);
  if (!(quantity > 0)) return 0;
  const packet = { ...item, quantity, tileProgress: 0 };
  // Use the real buffer, not a phantom belt on the Stacker's tile. Its own
  // output still pays normal transit time and obeys downstream blockage.
  return receiveConveyorItem(packet, column, row) ? quantity : 0;
}

function flushArcFurnaceOutputs() {
  Object.entries(state.arcFurnaceOutputBuffers).forEach(([furnaceInstanceId, item]) => {
    const furnace = getMachineByInstanceId(furnaceInstanceId);
    const emitted = emitArcFurnaceSolidOutput(furnace, item);
    if (!emitted) {
      return;
    }
    if (subtractQuantity(item, emitted, 1) === 0) delete state.arcFurnaceOutputBuffers[furnaceInstanceId];
    addLog(`Mini Electric Arc Furnace released ${MATERIAL_LABELS[item.material] ?? item.material}.`);
  });
}

function findMoltenCopperIndex(kilnInstanceId) {
  const ownerEntries = state.moltenCopper.filter((liquidMetal) => (
    getMoltenMetalOwnerInstanceId(liquidMetal) === kilnInstanceId
  ));
  if (ownerEntries.length === 0) {
    return -1;
  }

  const activeKilnJob = state.kilnJobs.find((job) => job.kilnInstanceId === kilnInstanceId);
  const activeFurnaceJob = state.arcFurnaceJobs.find((job) => job.furnaceInstanceId === kilnInstanceId);
  const inProgressMaterial = activeKilnJob
    ? getSmeltedLiquidMaterial(activeKilnJob.material)
    : activeFurnaceJob?.material ?? null;
  const selectedMaterial = inProgressMaterial
    && ownerEntries.some((liquidMetal) => liquidMetal.material === inProgressMaterial)
    ? inProgressMaterial
    : ownerEntries.at(-1).material;

  // A physical smelter cannot hold two liquid products at once. Resolve any
  // malformed runtime queue in favour of its active batch or newest output.
  state.moltenCopper = state.moltenCopper.filter((liquidMetal) => (
    getMoltenMetalOwnerInstanceId(liquidMetal) !== kilnInstanceId
      || liquidMetal.material === selectedMaterial
  ));
  return state.moltenCopper.findIndex((liquidMetal) => (
    getMoltenMetalOwnerInstanceId(liquidMetal) === kilnInstanceId
      && liquidMetal.material === selectedMaterial
  ));
}

function queueMoltenMetalOutput(liquidMetal) {
  const ownerInstanceId = getMoltenMetalOwnerInstanceId(liquidMetal);
  if (!ownerInstanceId) {
    return false;
  }

  state.moltenCopper = state.moltenCopper.filter((queuedLiquid) => (
    getMoltenMetalOwnerInstanceId(queuedLiquid) !== ownerInstanceId
      || queuedLiquid.material === liquidMetal.material
  ));
  state.moltenCopper.push({
    ...liquidMetal,
    kilnInstanceId: ownerInstanceId,
    smelterInstanceId: ownerInstanceId,
  });
  return true;
}

function getBulletCoreCasterKilnLink(caster = getMachine("ammoShaper")) {
  if (!caster) {
    return null;
  }

  const casterInputs = getMachinePorts(caster, "liquidInputs");
  const link = getReadyFluidSourceLink(getAdjacentFluidSourceLinks(casterInputs), caster);
  return link ? { kiln: link.source, kilnOutput: link.output, casterInput: link.input } : null;
}

function getJacketFormerKilnLink(jacketFormer = getMachine("jacketFormer")) {
  if (!jacketFormer) {
    return null;
  }

  const jacketFormerInputs = getMachinePorts(jacketFormer, "liquidInputs");
  const link = getReadyFluidSourceLink(getAdjacentFluidSourceLinks(jacketFormerInputs), jacketFormer);
  return link ? { kiln: link.source, kilnOutput: link.output, jacketFormerInput: link.input } : null;
}

function getCasingMachineSmelterLinks(casingMachine = getMachine("casingMachine")) {
  if (!casingMachine) {
    return [];
  }

  const casingInputs = getMachinePorts(casingMachine, "liquidInputs");
  return getAdjacentFluidSourceLinks(casingInputs).map((link) => ({
    smelter: link.source, smelterOutput: link.output, casingInput: link.input,
  }));
}

function getCasingMachineSmelterLink(casingMachine = getMachine("casingMachine")) {
  return getCasingMachineSmelterLinks(casingMachine)[0] ?? null;
}

function isBulletCoreCasterLinkedToKiln() {
  return Boolean(getBulletCoreCasterKilnLink());
}

function getBusyCrew() {
  return (state.dusterJob ? 1 : 0)
    + (state.kilnJobs.length * 2)
    + state.molderJobs.reduce((total, job) => total + (job.crewRequired ?? 1), 0)
    + state.arcFurnaceJobs.length;
}

function getHiredCrewCount() {
  return Math.max(0, (state.crew.total ?? CONFIG.startingCrew) - CONFIG.startingCrew);
}

function getCrewHireCost() {
  return CONFIG.crewHireBaseCost * (CONFIG.crewHireCostMultiplier ** getHiredCrewCount());
}

function canAffordCrewHire() {
  return state.cash >= getCrewHireCost();
}

function hireCrew() {
  const cost = getCrewHireCost();
  if (state.cash < cost) {
    addLog(`Not enough cash to hire another crew hamster. Next hire costs ${formatCash(cost)}.`);
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return false;
  }

  state.cash -= cost;
  state.crew.total += 1;
  addLog(`Hired one crew hamster for ${formatCash(cost)}.`);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function getAvailableCrew() {
  return Math.max(0, state.crew.total - getBusyCrew());
}

function isMachineBusy(machine) {
  return (machine?.id === "leekDuster" && Boolean(state.dusterJob))
    || (machine?.id === "clayKiln" && Boolean(
      state.kilnInputs.some((kilnInput) => kilnInput.kilnInstanceId === machine.instanceId)
      || state.kilnJobs.some((job) => job.kilnInstanceId === machine.instanceId)
      || state.moltenCopper.some((liquidMetal) => (
        getMoltenMetalOwnerInstanceId(liquidMetal) === machine.instanceId
      )),
    ))
    || (["ingotMolder", "refractoryCaster"].includes(machine?.id) && state.molderJobs.some((job) => (
      job.molderInstanceId === machine.instanceId
    )))
    || (machine?.id === "miniElectricArcFurnace" && (
      state.arcFurnaceJobs.some((job) => job.furnaceInstanceId === machine.instanceId)
      || state.moltenCopper.some((liquidMetal) => (
        getMoltenMetalOwnerInstanceId(liquidMetal) === machine.instanceId
      ))
      || Object.values(state.arcFurnaceInputs[machine.instanceId] ?? {})
        .some((items) => Array.isArray(items) && items.length > 0)
    ));
}

function canPickUpMachine(machine) {
  return Boolean(machine?.movable)
    && !(machine.id === "materialStorage" && getStorageCount() <= 1);
}

function hasStarterAmmoRoute() {
  return STARTER_ROUTE_CONVEYORS.every((required) => {
    const placed = getPlacedConveyor(required.column, required.row);
    return placed?.direction === required.direction;
  });
}

function getPlanterAmmoRoute() {
  const planter = getMachine("planter");
  const shaper = getMachine("ammoShaper");
  const jacketFormer = getMachine("jacketFormer");
  if (!planter || !shaper) {
    return null;
  }

  const planterLanes = getInternalConveyorTiles(planter);
  const shaperLanes = getInternalConveyorTiles(shaper);
  const output = planterLanes.at(-1);
  const input = shaperLanes[0];
  if (!output || !input) {
    return null;
  }

  const firstStep = DIRECTION_VECTORS[output.direction];
  let column = output.column + firstStep.column;
  let row = output.row + firstStep.row;
  const route = [];
  const visited = new Set();

  while (route.length <= FACTORY_COLUMNS * FACTORY_ROWS) {
    const conveyor = getPlacedConveyor(column, row);
    if (!conveyor) {
      return null;
    }
    const key = `${column},${row}`;
    if (visited.has(key)) {
      return null;
    }
    visited.add(key);
    route.push(conveyor);

    const vector = DIRECTION_VECTORS[conveyor.direction];
    column += vector.column;
    row += vector.row;
    if (column === input.column && row === input.row) {
      return route;
    }
  }

  return null;
}

function hasPlanterAmmoRoute() {
  return getPlanterAmmoRoute() !== null;
}

function getPlanterStorageRoute() {
  const planter = getMachine("planter");
  if (!planter) {
    return null;
  }

  const output = getInternalConveyorTiles(planter).at(-1);
  if (!output) {
    return null;
  }
  const firstStep = DIRECTION_VECTORS[output.direction];
  let column = output.column + firstStep.column;
  let row = output.row + firstStep.row;
  const route = [];
  const visited = new Set();

  while (route.length <= FACTORY_COLUMNS * FACTORY_ROWS) {
    const conveyor = getConveyorAt(column, row);
    if (!conveyor) {
      return null;
    }
    const key = `${column},${row}`;
    if (visited.has(key)) {
      return null;
    }
    visited.add(key);
    route.push(conveyor);

    const direction = DIRECTION_VECTORS[conveyor.direction];
    column += direction.column;
    row += direction.row;
    const storage = state.machines.find((machine) => (
      machine.id === "materialStorage" && isTileInsideMachine(column, row, machine)
    ));
    if (storage) {
      return { route, storageInput: { column, row } };
    }
  }

  return null;
}

function hasPlanterStorageRoute() {
  return getPlanterStorageRoute() !== null;
}

function getConveyorAt(column, row) {
  getFactoryConveyors();
  return factoryConveyorByTile?.get(getFactoryTileKey(column, row)) ?? null;
}

function getOppositeDirection(direction) {
  return {
    up: "down",
    right: "left",
    down: "up",
    left: "right",
  }[direction];
}

function getConveyorOutputPosition(conveyor) {
  const vector = DIRECTION_VECTORS[conveyor.direction];
  return {
    column: conveyor.column + vector.column,
    row: conveyor.row + vector.row,
  };
}

function canConveyorFeedInto(source, destination) {
  if (!source || !destination) {
    return false;
  }

  // A conveyor may continue straight or turn left/right. Only a belt that
  // immediately points back at its source is incompatible.
  return destination.direction !== getOppositeDirection(source.direction);
}

function getConveyorSpeed(conveyor) {
  return Math.max(
    0.1,
    (conveyor.speed ?? CONFIG.defaultConveyorSpeed) * getProcessingSpeedMultiplier(),
  );
}

function getConveyorSecondsPerTile(conveyor) {
  return CONFIG.secondsPerTileAtConveyorSpeedOne / getConveyorSpeed(conveyor);
}

function getMachineOutputConnection(machine) {
  const output = getInternalConveyorTiles(machine).at(-1);
  if (!output) {
    return null;
  }

  const outputPosition = getConveyorOutputPosition(output);
  const conveyor = getConveyorAt(outputPosition.column, outputPosition.row);
  return canConveyorFeedInto(output, conveyor) ? { output, conveyor } : null;
}

function hasMachineOutputConnection(machineId) {
  const machine = getMachine(machineId);
  return Boolean(machine && getMachineOutputConnection(machine));
}

function markItemForDuster(item, column, row) {
  if (item.kind !== "material"
    || item.dusted
    || DUSTER_INELIGIBLE_MATERIALS.includes(item.material)
    || !isSellableMaterial(item.material, item)) {
    return;
  }

  const hasDusterAtTile = getMachines("leekDuster").some((duster) => {
    const upgradeTile = getMachineUpgradeTile(duster);
    return upgradeTile && upgradeTile.column === column && upgradeTile.row === row;
  });
  if (hasDusterAtTile && getAvailableCrew() >= 1) {
    item.saleValueBase = getSaleValue(
      item.material,
      false,
      item.saleValueBonus,
      item.annealedValueMultiplier ?? 1,
      item.saleValueBase ?? null,
    ) * DUSTER_SELL_MULTIPLIER;
    item.annealedValueMultiplier = 1;
    item.dusted = true;
    item.dusterAssigned = true;
    state.dusterJob = { material: item.material, source: "conveyor" };
  }
}

function releaseDusterForItem(item) {
  if (item?.dusterAssigned && state.dusterJob?.source === "conveyor") {
    state.dusterJob = null;
    item.dusterAssigned = false;
  }
}

function markItemForRockShack(item, column, row) {
  if (item.kind !== "material" || !isSellableMaterial(item.material, item)) {
    return;
  }

  getMachines("rockShack").forEach((rockShack) => {
    const upgradeConveyor = getInternalConveyor(rockShack, 0);
    if (upgradeConveyor && upgradeConveyor.column === column && upgradeConveyor.row === row) {
      item.saleValueBonus = (item.saleValueBonus ?? 0) + ROCK_SHACK_VALUE_BONUS;
    }
  });
}

function placeItemOnConveyor(conveyor, item) {
  if (!conveyor || getConveyorItem(conveyor) || !canConveyorCarryItem(conveyor, item)) {
    return false;
  }

  item.tileProgress = 0;
  setConveyorItem(conveyor, item);
  markItemForDuster(item, conveyor.column, conveyor.row);
  markItemForRockShack(item, conveyor.column, conveyor.row);
  return true;
}

function isMachineInputTile(machine, column, row) {
  const input = getInternalConveyorTiles(machine).at(0);
  return Boolean(input) && input.column === column && input.row === row;
}

function canReceiveConveyorItem(item, column, row) {
  if (item?.kind === "material" && !isObtainableMaterial(item.material)) {
    return false;
  }
  const mixer = getAggregateMixerInputAt(column, row);
  if (mixer) return canAggregateMixerAcceptItem(mixer, item);

  const storage = state.machines.find((machine) => (
    machine.id === "materialStorage" && isTileInsideMachine(column, row, machine)
  ));
  if (storage && item.kind === "material") {
    return true;
  }

  const molderClayInput = getIngotMolderClayInputAt(column, row);
  if (molderClayInput) {
    return canIngotMolderAcceptClay(molderClayInput.molder, item);
  }

  const arcFurnaceInput = getArcFurnaceInputAt(column, row);
  if (arcFurnaceInput && canArcFurnaceAcceptInput(
    arcFurnaceInput.furnace,
    arcFurnaceInput.slot,
    item,
  )) {
    return true;
  }

  const stacker = getStackerAt(column, row);
  if (stacker && canStackerAcceptItem(stacker, item)) {
    return true;
  }

  const kilnInputTarget = getKilnInputAt(column, row);
  if (
    kilnInputTarget
    && item.kind === "material"
    && KILN_INPUT_MATERIALS.includes(item.material)
    && !state.kilnInputs.some((kilnInput) => kilnInput.kilnInstanceId === kilnInputTarget.kiln.instanceId)
  ) {
    return true;
  }

  const gunDeposit = getMachine("gunDeposit");
  if (
    gunDeposit
    && (
      (gunDeposit.input.column === column && gunDeposit.input.row === row)
      // The starter gun route approaches the deposit through its right-hand
      // footprint tile. Accept that physical entry as well as the nominal
      // centre input so existing saves can deliver ammo after casting.
      || isTileInsideMachine(column, row, gunDeposit)
    )
    && item.kind === "ammo"
  ) {
    return true;
  }

  const silverInputMaker = getContactMakerPortAt(column, row, "silverInput");
  if (silverInputMaker && canContactMakerReceiveMetal(silverInputMaker, item)) {
    return true;
  }

  const sellTubeInput = getSellTubeInputAt(column, row);
  return Boolean(sellTubeInput) && item.kind === "material" && isSellableMaterial(item.material, item);
}

function receiveConveyorItem(item, column, row) {
  if (!canReceiveConveyorItem(item, column, row)) {
    return false;
  }
  const mixer = getAggregateMixerInputAt(column, row);
  if (mixer) return receiveAggregateMixerItem(mixer, item);

  const storage = state.machines.find((machine) => (
    machine.id === "materialStorage" && isTileInsideMachine(column, row, machine)
  ));
  if (storage && item.kind === "material") {
    // Storage normalizes only material cargo. Ammunition stays in ammoStacks
    // and never enters the material-value reset path.
    state.stockpile[item.material] += item.quantity;
    addLog(`Material Storage received ${formatNumber(item.quantity)} ${MATERIAL_LABELS[item.material]}.`);
    return true;
  }

  const molderClayInput = getIngotMolderClayInputAt(column, row);
  if (molderClayInput && item.kind === "material" && item.material === "clay") {
    const instanceId = molderClayInput.molder.instanceId;
    const quantity = Number(item.quantity ?? 1);
    state.molderClayBuffers[instanceId] = (
      state.molderClayBuffers[instanceId] ?? 0
    ) + quantity;
    addLog(`Ingot Molder buffered ${formatNumber(quantity)} Clay for Iron molds.`);
    return true;
  }

  const arcFurnaceInput = getArcFurnaceInputAt(column, row);
  if (arcFurnaceInput && canArcFurnaceAcceptInput(
    arcFurnaceInput.furnace,
    arcFurnaceInput.slot,
    item,
  )) {
    const inputState = getArcFurnaceInputState(arcFurnaceInput.furnace);
    const slot = arcFurnaceInput.slot;
    const acceptedQuantity = item.quantity;
    const acceptedItem = { ...item, tileProgress: 0 };
    const acceptedValueUnits = getArcFurnaceInputValueUnits(acceptedItem);
    const matchingStack = inputState[slot].find((candidate) => (
      getArcFurnaceInputFamily(candidate.material) === getArcFurnaceInputFamily(acceptedItem.material)
    ));
    if (matchingStack) {
      matchingStack.quantity += acceptedQuantity;
      matchingStack.arcValueUnits = [
        ...getArcFurnaceInputValueUnits(matchingStack),
        ...acceptedValueUnits,
      ];
    } else {
      inputState[slot].push({ ...acceptedItem, arcValueUnits: acceptedValueUnits });
    }
    addLog(`Mini Electric Arc Furnace received ${formatNumber(acceptedQuantity)} ${MATERIAL_LABELS[item.material]}.`);
    return true;
  }

  const stacker = getStackerAt(column, row);
  if (stacker && canStackerAcceptItem(stacker, item)) {
    const itemKey = getStackerItemKey(item);
    const buffer = getStackerBuffer(stacker);
    if (buffer) {
      buffer.quantity += item.quantity;
      buffer.item = { ...buffer.item, quantity: buffer.quantity };
      state.stackerBuffers[stacker.instanceId] = buffer;
    } else {
      state.stackerBuffers[stacker.instanceId] = {
        item: { ...item, tileProgress: 0 },
        itemKey,
        quantity: item.quantity,
      };
    }
    addLog(`Stacker received ${formatNumber(item.quantity)} ${MATERIAL_LABELS[item.material] ?? "items"}.`);
    return true;
  }

  const kilnInputTarget = getKilnInputAt(column, row);
  if (
    kilnInputTarget
    && item.kind === "material"
    && KILN_INPUT_MATERIALS.includes(item.material)
    && !state.kilnInputs.some((kilnInput) => kilnInput.kilnInstanceId === kilnInputTarget.kiln.instanceId)
  ) {
    state.kilnInputs.push({
      material: item.material,
      kilnInstanceId: kilnInputTarget.kiln.instanceId,
      sourceMaterial: item.material,
      cashUpgraderEligibility: getCashUpgraderEligibilityTags(item),
      sourceValue: getItemSaleValue(item),
      sourceValueIsEffective: !ORE_CHUNK_MATERIALS.includes(item.material),
      quantity: item.quantity,
    });
    addLog(`Clay Kiln received one ${MATERIAL_LABELS[item.material]}.`);
    return true;
  }

  const gunDeposit = getMachine("gunDeposit");
  if (
    gunDeposit
    && (
      (gunDeposit.input.column === column && gunDeposit.input.row === row)
      || isTileInsideMachine(column, row, gunDeposit)
    )
    && item.kind === "ammo"
  ) {
    addAmmo(item.quantity, item.material, item.type ?? "rapidfire", item.damage, item.annealed === true, {
      casingMaterial: item.casingMaterial,
      jacketMaterial: item.jacketMaterial,
      coreMaterial: item.coreMaterial,
    });
    addLog("Gun Deposit received an ammunition stack.");
    return true;
  }

  const silverInputMaker = getContactMakerPortAt(column, row, "silverInput");
  if (silverInputMaker && canContactMakerReceiveMetal(silverInputMaker, item)) {
    receiveContactMakerMetal(silverInputMaker, item);
    return true;
  }

  const sellTubeInput = getSellTubeInputAt(column, row);
  if (sellTubeInput && item.kind === "material" && isSellableMaterial(item.material, item)) {
    const saleValue = getItemSaleValue(item)
      * getSellTubeValueMultiplier(sellTubeInput.sellTube)
      * getPlaytestSellValueMultiplier();
    const totalSaleValue = saleValue * item.quantity;
    state.cash += totalSaleValue;
    showSaleFloatingText(totalSaleValue, sellTubeInput.sellTube);
    const upgrades = [
      item.dusted ? "after a Leek Duster pass" : "",
      item.saleValueBonus ? "after a Rock Shack pass" : "",
    ].filter(Boolean).join(" and ");
    addLog(`${getMachineDisplayName(sellTubeInput.sellTube.id)} sold ${formatNumber(item.quantity)} ${MATERIAL_LABELS[item.material]}${upgrades ? ` ${upgrades}` : ""} for ${formatCash(totalSaleValue)}.`);
    if (item.material === "copper" && item.dusted && getTutorialStage() === "sellWait") {
      state.tutorial.dusterImprovedMalachiteSold = true;
    }
    return true;
  }

  return false;
}

function isAmmoShaperProcessConveyor(conveyor) {
  if (!isInternalConveyor(conveyor) || conveyor.internalMachineId !== "ammoShaper") {
    return false;
  }

  const shaper = getInternalConveyorMachine(conveyor);
  return conveyor.internalIndex === getMachineProcessLaneIndex(shaper);
}

function isBulletCoreCasterInputConveyor(conveyor) {
  return isInternalConveyor(conveyor)
    && conveyor.internalMachineId === "ammoShaper"
    && conveyor.internalIndex === 0;
}

function isJacketFormerProcessConveyor(conveyor) {
  if (!isInternalConveyor(conveyor) || conveyor.internalMachineId !== "jacketFormer") {
    return false;
  }

  const jacketFormer = getInternalConveyorMachine(conveyor);
  return conveyor.internalIndex === getMachineProcessLaneIndex(jacketFormer);
}

function isJacketFormerInputConveyor(conveyor) {
  return isInternalConveyor(conveyor)
    && conveyor.internalMachineId === "jacketFormer"
    && conveyor.internalIndex === 0;
}

function getInternalConveyorMachine(conveyor) {
  if (!isInternalConveyor(conveyor)) {
    return null;
  }
  return state.machines.find((machine) => (
    machine.id === conveyor.internalMachineId
      && machine.instanceId === conveyor.internalMachineInstanceId
  )) ?? getMachine(conveyor.internalMachineId);
}

function isGraphiteCopperAnnealerProcessConveyor(conveyor) {
  const annealer = getInternalConveyorMachine(conveyor);
  const processLaneIndex = annealer
    ? getMachineProcessLaneIndex(annealer)
    : MACHINE_LAYOUT.graphiteCopperAnnealer.processLaneIndex;
  return Boolean(
    conveyor.internalMachineId === "graphiteCopperAnnealer"
      && conveyor.internalIndex === processLaneIndex,
  );
}

function isGraniteProcessorConveyor(conveyor) {
  return isInternalConveyor(conveyor)
    && conveyor.internalMachineId === "graniteProcessor";
}

function isPrimitiveUpgraderProcessConveyor(conveyor) {
  return Boolean(
    isInternalConveyor(conveyor)
      && conveyor.internalMachineId === "primitiveUpgrader"
      && Number.isInteger(conveyor.internalIndex)
      && conveyor.internalIndex >= 0
      && conveyor.internalIndex < MACHINE_LAYOUT.primitiveUpgrader.internalConveyors.length,
  );
}

function isBronzeStampProcessConveyor(conveyor) {
  const stamp = getInternalConveyorMachine(conveyor);
  const processLaneIndex = stamp
    ? getMachineProcessLaneIndex(stamp)
    : MACHINE_LAYOUT.bronzeStamp.processLaneIndex;
  return Boolean(
    conveyor.internalMachineId === "bronzeStamp"
      && conveyor.internalIndex === processLaneIndex,
  );
}

function isQuartzWheelCutterInputConveyor(conveyor) {
  return conveyor?.internalMachineId === "quartzWheelCutter"
    && [0, 4].includes(conveyor.internalIndex);
}

function isQuartzWheelCutterProcessConveyor(conveyor) {
  return conveyor?.internalMachineId === "quartzWheelCutter"
    && [3, 7].includes(conveyor.internalIndex);
}

function isBronzePillarsProcessConveyor(conveyor) {
  const pillars = getInternalConveyorMachine(conveyor);
  const processLaneIndex = pillars
    ? getMachineProcessLaneIndex(pillars)
    : MACHINE_LAYOUT.bronzePillars.processLaneIndex;
  return Boolean(
    conveyor.internalMachineId === "bronzePillars"
      && conveyor.internalIndex === processLaneIndex,
  );
}

function isExtruderProcessConveyor(conveyor) {
  const extruder = getInternalConveyorMachine(conveyor);
  const processLaneIndex = extruder
    ? getMachineProcessLaneIndex(extruder)
    : MACHINE_LAYOUT.extruder.processLaneIndex;
  return Boolean(
    conveyor.internalMachineId === "extruder"
      && conveyor.internalIndex === processLaneIndex,
  );
}

function isLeekFiberExtractorProcessConveyor(conveyor) {
  const extractor = getInternalConveyorMachine(conveyor);
  const processLaneIndex = extractor
    ? getMachineProcessLaneIndex(extractor)
    : MACHINE_LAYOUT.leekFiberExtractor.processLaneIndex;
  return Boolean(
    conveyor.internalMachineId === "leekFiberExtractor"
      && conveyor.internalIndex === processLaneIndex,
  );
}

function isContactMakerProcessConveyor(conveyor) {
  const maker = getInternalConveyorMachine(conveyor);
  const processLaneIndex = maker
    ? getMachineProcessLaneIndex(maker)
    : MACHINE_LAYOUT.contactMaker.processLaneIndex;
  return Boolean(
    conveyor.internalMachineId === "contactMaker"
      && conveyor.internalIndex === processLaneIndex,
  );
}

function isMetalPressProcessConveyor(conveyor) {
  const press = getInternalConveyorMachine(conveyor);
  const processLaneIndex = press
    ? getMachineProcessLaneIndex(press)
    : MACHINE_LAYOUT.metalPress.processLaneIndex;
  return Boolean(
    conveyor.internalMachineId === "metalPress"
      && conveyor.internalIndex === processLaneIndex,
  );
}

function getGearPressMode(press) {
  return GEAR_PRESS_MODES.includes(press?.mode) ? press.mode : "heavy";
}

function switchGearPressMode(press, mode) {
  if (press?.id !== "gearPress" || !GEAR_PRESS_MODES.includes(mode)
    || getGearPressMode(press) === mode) {
    return false;
  }
  press.mode = mode;
  addLog(`Gear Press switched to ${mode === "heavy" ? "Heavy" : "Fine"} Gear mode.`);
  return true;
}

function canGearPressAcceptInput(press, item) {
  if (press?.id !== "gearPress" || item?.kind !== "material"
    || !PLATE_MATERIALS.includes(item.material)
    || !Number.isInteger(item.quantity) || item.quantity < 1) {
    return false;
  }
  const pending = state.gearPressInputs[press.instanceId];
  const required = getGearPressMode(press) === "heavy" ? 2 : 1;
  return !pending || (pending.material === item.material && pending.quantity < required);
}

function emitGearPressOutput(press) {
  const pending = state.gearPressInputs[press.instanceId];
  const mode = getGearPressMode(press);
  if (!pending || pending.quantity < (mode === "heavy" ? 2 : 1)) {
    return false;
  }
  const material = GEAR_MATERIALS.find((candidate) => (
    GEAR_DEFINITIONS[candidate].plateMaterial === pending?.material
      && GEAR_DEFINITIONS[candidate].mode === mode
  ));
  if (!material) {
    return false;
  }
  const platesPerGear = GEAR_DEFINITIONS[material].platesPerGear;
  const output = getInternalConveyor(press, getMachineProcessLaneIndex(press));
  const quantity = Math.min(Math.floor(pending.quantity / platesPerGear),
    Math.floor(getConveyorWeightCapacity(output) / GEAR_DEFINITIONS[material].weight));
  if (quantity < 1 || !output || getConveyorItem(output)) {
    return false;
  }
  const valuePerPlate = pending.totalValue / pending.quantity;
  const baseValuePerPlate = pending.totalBaseValue / pending.quantity;
  const item = {
    kind: "material",
    material,
    quantity,
    saleValueBase: valuePerPlate * platesPerGear,
    baseValue: baseValuePerPlate * platesPerGear,
    saleValueBonus: 0,
    annealedValueMultiplier: 1,
    dusted: false,
  };
  if (!placeItemOnConveyor(output, item)) {
    return false;
  }
  const remaining = pending.quantity - quantity * platesPerGear;
  if (remaining > 0) {
    state.gearPressInputs[press.instanceId] = {
      material: pending.material,
      quantity: remaining,
      totalValue: valuePerPlate * remaining,
      totalBaseValue: baseValuePerPlate * remaining,
    };
  } else {
    delete state.gearPressInputs[press.instanceId];
  }
  addLog(`Gear Press formed ${formatNumber(quantity)} ${MATERIAL_LABELS[material]}.`);
  return true;
}

function receiveGearPressInput(press, item) {
  const output = getInternalConveyor(press, getMachineProcessLaneIndex(press));
  if (!canGearPressAcceptInput(press, item) || !output || getConveyorItem(output)) {
    return false;
  }
  const pending = state.gearPressInputs[press.instanceId];
  state.gearPressInputs[press.instanceId] = {
    material: item.material,
    quantity: (pending?.quantity ?? 0) + item.quantity,
    totalValue: (pending?.totalValue ?? 0) + getItemSaleValue(item) * item.quantity,
    totalBaseValue: (pending?.totalBaseValue ?? 0) + getItemBaseValue(item) * item.quantity,
  };
  emitGearPressOutput(press);
  return true;
}

function flushGearPressOutputs() {
  Object.keys(state.gearPressInputs).forEach((instanceId) => {
    const press = getMachineByInstanceId(instanceId);
    if (press?.id === "gearPress") {
      emitGearPressOutput(press);
    }
  });
}

function getCasingMachineForConveyor(conveyor) {
  return isInternalConveyor(conveyor) && conveyor.internalMachineId === "casingMachine"
    ? getInternalConveyorMachine(conveyor)
    : null;
}

function isCasingMachineInputConveyor(conveyor) {
  return getCasingMachineForConveyor(conveyor)?.id === "casingMachine"
    && conveyor.internalIndex === 0;
}

function isCasingMachineProcessConveyor(conveyor) {
  const machine = getCasingMachineForConveyor(conveyor);
  return Boolean(machine && conveyor.internalIndex === getMachineProcessLaneIndex(machine));
}

function getCasingMaterial(material) {
  if (CASING_MATERIALS.includes(material)) {
    return material.replace(/Ingot$/, "");
  }
  return LIQUID_CASING_MATERIALS.includes(material) ? material : null;
}

function isJacketedAmmo(item) {
  return item?.kind === "ammo"
    && (item.jacketed === true || Boolean(item.jacketMaterial));
}

function canCasingMachineAcceptItem(machine, item) {
  const quantity = Number(item?.quantity);
  if (!machine
    || machine.id !== "casingMachine"
    || item?.kind !== "ammo"
    || !Number.isFinite(quantity)
    || quantity !== BUCKSHOT_INPUT_ROUNDS) {
    return false;
  }

  if ((item.type ?? "rapidfire") !== "rapidfire"
    || item.casingMaterial
    || (getCasingMachineMode(machine) === "buckshot" && !isJacketedAmmo(item))) {
    return false;
  }

  return true;
}

function getCasingMachineAvailableLiquid(machine, requestedItem = null) {
  const links = getCasingMachineSmelterLinks(machine);
  const linkedSmelterIds = new Set(links.map(({ smelter }) => smelter.instanceId));
  let liquids = state.moltenCopper.filter((liquidMetal) => (
    linkedSmelterIds.has(getMoltenMetalOwnerInstanceId(liquidMetal))
  ));
  const supportedLiquids = liquids.filter((liquidMetal) => (
    getCasingMaterial(liquidMetal.material)
      && Math.max(0, Number(liquidMetal.quantity ?? 1) || 0) > 0
  ));
  const supportedMaterial = supportedLiquids.find((liquidMetal) => (
    getAvailableLiquidQuantity(liquidMetal, machine, requestedItem) > 0
  )) ?? supportedLiquids[0];
  const material = supportedMaterial ? getCasingMaterial(supportedMaterial.material) : null;
  liquids = material
    ? liquids.filter((liquidMetal) => getCasingMaterial(liquidMetal.material) === material)
    : [];
  const liquid = supportedMaterial ?? null;
  const quantity = getAvailableLiquidTotal(liquids, machine, requestedItem);
  return {
    link: links[0] ?? null,
    links,
    liquids,
    liquid,
    material,
    quantity,
  };
}

function canCasingMachineProcessItem(machine, item) {
  if (!canCasingMachineAcceptItem(machine, item)) {
    return false;
  }

  const batchCount = Number(item.quantity) / BUCKSHOT_INPUT_ROUNDS;
  const liquid = getCasingMachineAvailableLiquid(machine, item);
  return Boolean(liquid.material && liquid.quantity >= batchCount);
}

function applyCasingMachineToItem(machine, item) {
  if (!canCasingMachineProcessItem(machine, item)) {
    return false;
  }

  // The departure phase has cleared the transformer tile. Use the actual
  // departing packet as demand, rather than relying on cargo still on that tile.
  const { liquids, material: casingMaterial } = getCasingMachineAvailableLiquid(machine, item);
  const batchCount = Number(item.quantity) / BUCKSHOT_INPUT_ROUNDS;
  let liquidToConsume = batchCount;
  liquids.forEach((liquid) => {
    if (liquidToConsume <= 0) {
      return;
    }
    const available = getAvailableLiquidQuantity(liquid);
    const consumed = Math.min(available, liquidToConsume);
    spendLiquidFlowCredit(liquid, consumed, machine, item);
    const liquidLeft = Number(liquid.quantity ?? 1) - consumed;
    liquidToConsume -= consumed;
    if (liquidLeft > 1e-9) {
      liquid.quantity = liquidLeft;
    } else {
      liquid.quantity = 0;
    }
  });
  state.moltenCopper = state.moltenCopper.filter((liquid) => Number(liquid.quantity ?? 1) > 1e-9);

  const mode = getCasingMachineMode(machine);
  const isBuckshot = mode === "buckshot";
  const incomingDamage = Number.isFinite(item.damage)
    ? item.damage
    : normalizeAmmoStack(item).damage;
  item.type = isBuckshot ? "buckshot" : "rapidfire";
  item.quantity = isBuckshot
    ? batchCount * BUCKSHOT_OUTPUT_ROUNDS
    : Number(item.quantity);
  item.damage = incomingDamage
    * getCasingDamageMultiplier(casingMaterial)
    * (isBuckshot ? BUCKSHOT_DAMAGE_MULTIPLIER : 1);
  item.casingMaterial = casingMaterial;
  item.jacketed = isJacketedAmmo(item);
  item.dusted = false;

  const casingLabel = CASING_MATERIAL_LABELS[casingMaterial]
    ?? casingMaterial;
  addLog(isBuckshot
    ? `Casing Machine formed ${formatNumber(item.quantity)} Buckshot rounds with a ${casingLabel} casing.`
    : `Casing Machine formed ${formatNumber(item.quantity)} penetrating Rapidfire rounds with a ${casingLabel} casing.`);
  return true;
}

function getStackerAt(column, row) {
  return getMachines("stacker").find((stacker) => (
    stacker.column === column && stacker.row === row
  )) ?? null;
}

function getSplitterAt(column, row) {
  return getMachines("splitter").find((splitter) => (
    splitter.column === column && splitter.row === row
  )) ?? null;
}

function getSplitterOutputDirections(splitter) {
  const orientation = splitter.orientation ?? "right";
  return [
    orientation,
    rotateMachineDirection("up", orientation),
    rotateMachineDirection("down", orientation),
  ];
}

function getAvailableSplitterOutput(splitter, item) {
  const directions = getSplitterOutputDirections(splitter);
  const startIndex = ((Math.floor(Number(splitter.splitterNextOutputIndex) || 0) % directions.length)
    + directions.length) % directions.length;

  for (let offset = 0; offset < directions.length; offset += 1) {
    const outputIndex = (startIndex + offset) % directions.length;
    const direction = directions[outputIndex];
    const vector = DIRECTION_VECTORS[direction];
    const outputConveyor = getConveyorAt(
      splitter.column + vector.column,
      splitter.row + vector.row,
    );
    if (!outputConveyor
      || getConveyorItem(outputConveyor)
      || !canConveyorFeedInto({ direction }, outputConveyor)
      || isInternalConveyor(outputConveyor) && !canItemLeaveConveyor(outputConveyor, item)) {
      continue;
    }

    return { direction, outputIndex, outputConveyor };
  }

  return null;
}

function canSplitterReceiveFromConveyor(splitter, conveyor) {
  return Boolean(
    splitter
      && conveyor
      && conveyor.direction === (splitter.orientation ?? "right"),
  );
}

function getStackerInputFlowDirections(stacker) {
  const blockedDirection = getOppositeDirection(stacker.orientation ?? "right");
  return CONVEYOR_ORIENTATIONS.filter((direction) => direction !== blockedDirection);
}

function canStackerReceiveFromConveyor(stacker, conveyor) {
  return Boolean(
    stacker
      && conveyor
      && getStackerInputFlowDirections(stacker).includes(conveyor.direction),
  );
}

function getStackerBuffer(stacker) {
  return state.stackerBuffers[stacker.instanceId] ?? null;
}

function getStackerItemKey(item) {
  return [
    item.kind,
    item.material,
    item.damage ?? "",
    item.coreMaterial ?? "",
    item.casingMaterial ?? "",
    item.jacketMaterial ?? "",
    item.annealed === true ? "annealed" : "normal",
    ...CASH_UPGRADER_ELIGIBILITY_TAGS.map((tag) => item[tag] ?? 0),
  ].join("|");
}

function getStackerConveyor(stacker) {
  // Routing-only belt metadata; cargo remains in the instance's single buffer.
  return {
    internalMachineId: stacker.id,
    direction: stacker.orientation ?? "right",
    speed: stacker.conveyorSpeed ?? CONFIG.defaultConveyorSpeed,
    weightCapacity: stacker.weightCapacity,
  };
}

function getStackerPendingQuantity(stacker, buffer) {
  if (buffer.outputRemaining > 0) return Math.min(buffer.outputRemaining, buffer.quantity);
  const configured = Math.max(1, Math.min(3, stacker.stackSize ?? 1));
  if (buffer.quantity >= configured) return configured;
  // A configured count must not deadlock when its items exceed belt capacity.
  const maximum = Math.floor((getConveyorWeightCapacity(getStackerConveyor(stacker)) + 1e-9)
    / getCargoUnitWeight(buffer.item));
  return maximum > 0 && buffer.quantity >= Math.min(configured, maximum)
    ? Math.min(configured, maximum) : 0;
}

function canStackerAcceptItem(stacker, item, visited = new Set()) {
  if (!stacker || !item || !Number.isFinite(item.quantity) || item.quantity < 1) {
    return false;
  }
  const buffer = getStackerBuffer(stacker);
  if (!canConveyorCarryItem(getStackerConveyor(stacker), {
    ...item, quantity: (buffer?.quantity ?? 0) + item.quantity,
  })) return false;
  if (!buffer || buffer.itemKey !== getStackerItemKey(item)) {
    return !buffer;
  }

  const pendingQuantity = getStackerPendingQuantity(stacker, buffer);
  if (!pendingQuantity) {
    return true;
  }

  if (visited.has(stacker.instanceId)) return false;
  const nextVisited = new Set(visited);
  nextVisited.add(stacker.instanceId);
  return Boolean(getStackerOutputTarget(stacker, { ...buffer.item, quantity: pendingQuantity }, nextVisited));
}

function getStackerOutputTarget(stacker, item, visited = new Set([stacker.instanceId])) {
  const direction = stacker.orientation ?? "right";
  const vector = DIRECTION_VECTORS[direction];
  const column = stacker.column + vector.column;
  const row = stacker.row + vector.row;
  const targetStacker = getStackerAt(column, row);
  const conveyor = targetStacker ? getStackerConveyor(targetStacker) : getConveyorAt(column, row);
  if (!conveyor || !canConveyorFeedInto({ direction }, conveyor)
    || (!targetStacker && getConveyorItem(conveyor))) return null;

  const targetBuffer = targetStacker ? getStackerBuffer(targetStacker) : null;
  const occupiedWeight = targetBuffer
    ? getCargoWeight({ ...targetBuffer.item, quantity: targetBuffer.quantity }) : 0;
  const maximum = Math.min(getConveyorWeightCapacity(getStackerConveyor(stacker)),
    getConveyorWeightCapacity(conveyor) - occupiedWeight);
  const quantity = item.quantity <= maximum / getCargoUnitWeight(item) + 1e-9
    ? item.quantity : Math.floor(maximum / getCargoUnitWeight(item) + 1e-9);
  if (!(quantity > 0)) return null;
  if (targetStacker && (!canStackerReceiveFromConveyor(targetStacker, { direction })
    || !canStackerAcceptItem(targetStacker, { ...item, quantity }, visited))) return null;
  return { conveyor, targetStacker, column, row, quantity };
}

function emitStackerOutputs(deltaSeconds = 0) {
  // Snapshot ready outputs before any handoff, so array order cannot move fresh
  // cargo through several Stackers in one update. Each emitted object pays a
  // full belt transit cycle; blocked time never banks multiple releases.
  const ready = [];
  getMachines("stacker").forEach((stacker) => {
    const buffer = getStackerBuffer(stacker);
    if (!buffer) return;
    const pendingQuantity = getStackerPendingQuantity(stacker, buffer);
    if (!(pendingQuantity > 0)) {
      buffer.outputProgress = 0;
      return;
    }
    const previous = Number.isFinite(buffer.outputProgress) ? buffer.outputProgress : 0;
    buffer.outputProgress = Math.min(1, Math.max(0, previous)
      + Math.max(0, Number(deltaSeconds) || 0) / getConveyorSecondsPerTile(getStackerConveyor(stacker)));
    if (buffer.outputProgress >= 1 - 1e-9) ready.push({ stacker, buffer, pendingQuantity });
  });
  ready.forEach(({ stacker, buffer, pendingQuantity }) => {
    const outputItem = {
      ...buffer.item,
      quantity: Math.min(pendingQuantity, buffer.quantity),
      tileProgress: 0,
    };
    const target = getStackerOutputTarget(stacker, outputItem);
    if (!target) return;
    const packet = { ...outputItem, quantity: target.quantity };
    const emitted = target.targetStacker
      ? (receiveConveyorItem(packet, target.column, target.row) ? packet.quantity : 0)
      : emitCapacitySafeCargo(target.conveyor, packet);
    if (!emitted) return;
    buffer.outputProgress = 0;
    buffer.quantity = Number((buffer.quantity - emitted).toPrecision(12));
    buffer.outputRemaining = Number((pendingQuantity - emitted).toPrecision(12));
    if (buffer.quantity <= 1e-9) {
      delete state.stackerBuffers[stacker.instanceId];
    } else {
      buffer.item = { ...buffer.item, quantity: buffer.quantity };
      state.stackerBuffers[stacker.instanceId] = buffer;
    }
    addLog(`Stacker released ${formatNumber(emitted)} ${MATERIAL_LABELS[outputItem.material] ?? "items"}.`);
  });
}

function getContactMakerInputState(instanceId) {
  const inputs = state.contactMakerInputs[instanceId] ?? {};
  return {
    ...inputs,
    silver: Number.isFinite(inputs.silver) ? inputs.silver : 0,
    silverValue: Number.isFinite(inputs.silverValue) ? inputs.silverValue : 0,
  };
}

function getContactMakerMetalInput(material) {
  return CONTACT_MAKER_METAL_INPUTS.find((input) => input.material === material) ?? null;
}

function getReadyContactMakerMetalInput(maker, wireQuantity = null) {
  if (!maker) {
    return null;
  }
  const inputState = getContactMakerInputState(maker.instanceId);
  const recipeCount = getContactMakerRecipeCount(maker, wireQuantity);
  return CONTACT_MAKER_METAL_INPUTS.find((input) => (
    hasAtLeastQuantity(
      inputState[input.quantityKey] ?? 0,
      recipeCount * input.ingotsPerBatch,
    )
  )) ?? null;
}

function getIngotMolderClayInputAt(column, row) {
  return getMachines("ingotMolder").map((molder) => ({
    molder,
    input: getMachinePort(molder, "clayInput"),
  })).find(({ input }) => (
    input?.column === column && input?.row === row
  )) ?? null;
}

function canIngotMolderAcceptClay(molder, item) {
  if (!molder || item?.kind !== "material" || item.material !== "clay") return false;
  const quantity = Number(item.quantity ?? 1);
  const buffered = state.molderClayBuffers[molder.instanceId] ?? 0;
  const total = buffered + quantity;
  const tolerance = Number.EPSILON * Math.max(1, total, CONFIG.ingotMolderClayCapacity) * 16;
  return Number.isFinite(quantity) && quantity > 0
    && Number.isFinite(buffered) && buffered >= 0
    && total <= CONFIG.ingotMolderClayCapacity + tolerance;
}

function canContactMakerReceiveMetal(maker, item) {
  const metalInput = getContactMakerMetalInput(item?.material);
  if (!maker || item?.kind !== "material" || !metalInput
    || !Number.isFinite(item.quantity) || item.quantity <= 0) {
    return false;
  }

  const buffered = getContactMakerInputState(maker.instanceId)[metalInput.quantityKey] ?? 0;
  const required = getContactMakerInputRequirements(maker)[metalInput.quantityKey];
  return !hasAtLeastQuantity(buffered, required);
}

function receiveContactMakerMetal(maker, item) {
  const metalInput = getContactMakerMetalInput(item.material);
  if (!metalInput) {
    return;
  }
  const current = getContactMakerInputState(maker.instanceId);
  const value = getItemSaleValue(item);
  state.contactMakerInputs[maker.instanceId] = {
    ...current,
    [metalInput.quantityKey]: (current[metalInput.quantityKey] ?? 0) + item.quantity,
    [metalInput.valueKey]: (current[metalInput.valueKey] ?? 0) + value * item.quantity,
  };
}

function getContactMakerRecipeCount(maker, wireQuantity = null) {
  const processConveyor = maker
    ? getInternalConveyor(maker, getMachineProcessLaneIndex(maker))
    : null;
  const processItem = processConveyor ? getConveyorItem(processConveyor) : null;
  const quantity = wireQuantity ?? processItem?.quantity ?? 0;
  return Math.max(1, Math.floor(quantity / 5));
}

function getContactMakerInputRequirements(maker) {
  const recipeCount = getContactMakerRecipeCount(maker);
  return CONTACT_MAKER_METAL_INPUTS.reduce((requirements, input) => {
    requirements[input.quantityKey] = recipeCount * input.ingotsPerBatch;
    return requirements;
  }, {
    recipeCount,
  });
}

function getContactMakerPortAt(column, row, portName) {
  return getMachines("contactMaker").find((maker) => {
    const port = getMachinePort(maker, portName);
    return port?.column === column && port.row === row;
  }) ?? null;
}

function hasLiquidMetalForBulletCoreCaster(caster, requiredQuantity = AMMO_COATING_LIQUID_PER_BUNDLE) {
  const link = getBulletCoreCasterKilnLink(caster);
  const liquidIndex = link ? findMoltenCopperIndex(link.kiln.instanceId) : -1;
  if (liquidIndex < 0) {
    return false;
  }

  const liquid = state.moltenCopper[liquidIndex];
  const available = getAvailableLiquidQuantity(liquid, caster);
  return LIQUID_METAL_AMMO_MATERIALS.includes(liquid.material)
    && available + 1e-9 >= requiredQuantity;
}

function canBulletCoreCasterAcceptItem(item) {
  return (item.kind === "material" && AMMO_MATERIALS.includes(item.material))
    || (item.kind === "liquidMetal" && LIQUID_METAL_AMMO_MATERIALS.includes(item.material));
}

function canItemLeaveConveyor(conveyor, item) {
  if (conveyor.internalMachineId === "gearPress") {
    return conveyor.internalIndex === 0
      ? canGearPressAcceptInput(getInternalConveyorMachine(conveyor), item)
      : item.kind === "material" && Object.hasOwn(GEAR_DEFINITIONS, item.material);
  }
  const arcFurnaceInput = getArcFurnaceInputForConveyor(conveyor);
  if (arcFurnaceInput) {
    return canArcFurnaceAcceptInput(arcFurnaceInput.furnace, arcFurnaceInput.slot, item);
  }

  if (isCasingMachineInputConveyor(conveyor)) {
    return canCasingMachineAcceptItem(getCasingMachineForConveyor(conveyor), item);
  }
  if (isCasingMachineProcessConveyor(conveyor)) {
    return canCasingMachineProcessItem(getCasingMachineForConveyor(conveyor), item);
  }

  if (isBulletCoreCasterInputConveyor(conveyor)
    && state.mine.ammoShaperMode === "coated") {
    return item.kind === "material"
      && item.material === "leek"
      && hasLiquidMetalForBulletCoreCaster(getInternalConveyorMachine(conveyor));
  }

  if (isQuartzWheelCutterInputConveyor(conveyor)) {
    return item.kind === "material" && item.material === "copper";
  }
  if (isQuartzWheelCutterProcessConveyor(conveyor)) {
    return item.kind === "material"
      && ["copper", "cutMalachite"].includes(item.material);
  }

  if (!isAmmoShaperProcessConveyor(conveyor)) {
    if (isJacketFormerInputConveyor(conveyor)) {
      return item.kind === "ammo" && !item.jacketMaterial;
    }
    if (isJacketFormerProcessConveyor(conveyor)) {
      return item.kind === "ammo" && item.jacketMaterial === "nativeCopper";
    }
    if (conveyor.internalMachineId === "extruder"
      && (conveyor.internalIndex === 0 || isExtruderProcessConveyor(conveyor))) {
      return item.kind === "material"
        && (INGOT_MATERIALS.includes(item.material) || item.material === "wire");
    }
    if (conveyor.internalMachineId === "graphiteCopperAnnealer"
      && (conveyor.internalIndex === 0 || isGraphiteCopperAnnealerProcessConveyor(conveyor))) {
      return (item.kind === "ammo" && item.material !== "leek")
        || (item.kind === "material" && ANNEALER_VALUE_MATERIALS.includes(item.material));
    }
    if (conveyor.internalMachineId === "leekFiberExtractor") {
      return item.kind === "material" && item.material === "leek";
    }
    if (conveyor.internalMachineId === "contactMaker") {
      if (isContactMakerProcessConveyor(conveyor)) {
        const maker = getInternalConveyorMachine(conveyor);
        return item.kind === "material"
          && item.material === "wire"
          && item.quantity >= 5
          && item.quantity % 5 === 0
          && getReadyContactMakerMetalInput(maker, item.quantity) !== null;
      }
      return item.kind === "material"
        && ["wire", ...CONTACT_PRODUCT_MATERIALS].includes(item.material);
    }
    if (conveyor.internalMachineId === "metalPress"
      && (conveyor.internalIndex === 0 || isMetalPressProcessConveyor(conveyor))) {
      return item.kind === "material" && Object.hasOwn(INGOT_TO_PLATE, item.material);
    }
    return true;
  }

  if (state.mine.ammoShaperMode === "coated") {
    return item.kind === "material"
      && item.material === "leek"
      && Boolean(item.metalMaterial);
  }

  return canBulletCoreCasterAcceptItem(item);
}

function transformItemLeavingConveyor(conveyor, item) {
  const sourceMaterial = item.kind === "material" ? item.material : null;
  const wasSellable = sourceMaterial !== null && isSellableMaterial(sourceMaterial, item);
  const finishMaterialTransform = () => {
    resetCashUpgraderEligibilityOnMaterialChange(item, sourceMaterial, wasSellable);
    return item;
  };

  if (isCasingMachineProcessConveyor(conveyor)) {
    applyCasingMachineToItem(getCasingMachineForConveyor(conveyor), item);
    return item;
  }

  if (isLeekFiberExtractorProcessConveyor(conveyor)) {
    if (item.kind === "material" && item.material === "leek") {
      item.material = "leekFiber";
      item.saleValueBase = null;
      item.saleValueBonus = 0;
      addLog(`Leek Fiber Extractor produced ${formatNumber(item.quantity)} Leek Fiber.`);
    }
    return finishMaterialTransform();
  }

  if (isQuartzWheelCutterProcessConveyor(conveyor)
    && item.kind === "material"
    && item.material === "copper") {
    const currentValue = getItemSaleValue(item);
    const baseValue = getItemBaseValue(item);
    item.material = "cutMalachite";
    item.quantity *= QUARTZ_WHEEL_CUTTER_YIELD;
    item.saleValueBase = currentValue * QUARTZ_WHEEL_CUTTER_MULTIPLIER;
    item.baseValue = baseValue * QUARTZ_WHEEL_CUTTER_MULTIPLIER;
    item.saleValueBonus = 0;
    item.annealedValueMultiplier = 1;
    item.dusterEligible = false;
    addLog(`Quartz Wheel Cutter produced ${formatNumber(item.quantity)} Cut Malachite at ×${formatNumber(QUARTZ_WHEEL_CUTTER_MULTIPLIER)} value.`);
    return finishMaterialTransform();
  }

  if (isContactMakerProcessConveyor(conveyor)) {
    if (item.kind === "material" && item.material === "wire" && item.quantity >= 5) {
      const maker = getInternalConveyorMachine(conveyor);
      const inputState = getContactMakerInputState(maker.instanceId);
      const recipeCount = getContactMakerRecipeCount(maker, item.quantity);
      const metalInput = getReadyContactMakerMetalInput(maker, item.quantity);
      if (item.quantity % 5 !== 0 || !metalInput) {
        return finishMaterialTransform();
      }
      const bufferedQuantity = inputState[metalInput.quantityKey] ?? 0;
      const bufferedValue = inputState[metalInput.valueKey] ?? 0;
      const valuePerIngot = bufferedQuantity > 0
        ? bufferedValue / bufferedQuantity
        : 0;
      const consumedMetalQuantity = recipeCount * metalInput.ingotsPerBatch;
      const contactStackValue = (
        getItemSaleValue(item) * 5 * recipeCount
        + valuePerIngot * consumedMetalQuantity
      ) * metalInput.valueMultiplier;
      inputState[metalInput.quantityKey] = Math.max(
        0,
        bufferedQuantity - consumedMetalQuantity,
      );
      inputState[metalInput.valueKey] = Math.max(
        0,
        bufferedValue - valuePerIngot * consumedMetalQuantity,
      );
      state.contactMakerInputs[maker.instanceId] = inputState;
      item.material = metalInput.outputMaterial;
      item.quantity = recipeCount * 5;
      item.saleValueBase = contactStackValue / item.quantity;
      item.baseValue = 8.8;
      item.saleValueBonus = 0;
      item.annealedValueMultiplier = 1;
      item.freshMoldedAt = Date.now();
      addLog(`Contact Maker produced ${formatNumber(item.quantity)} ${MATERIAL_LABELS[item.material]} from Copper Wire and ${MATERIAL_LABELS[metalInput.material]}.`);
    }
    return finishMaterialTransform();
  }

  if (isMetalPressProcessConveyor(conveyor)) {
    if (item.kind === "material" && Object.hasOwn(INGOT_TO_PLATE, item.material)) {
      const sourceMaterial = item.material;
      item.material = INGOT_TO_PLATE[sourceMaterial];
      item.saleValueBonus = 0;
      item.freshMoldedAt = Date.now();
      addLog(`Metal Press formed ${formatNumber(item.quantity)} ${MATERIAL_LABELS[item.material]} from ${MATERIAL_LABELS[sourceMaterial]}.`);
    }
    return finishMaterialTransform();
  }

  if (isGraniteProcessorConveyor(conveyor)) {
    if (item.kind === "material"
      && isSellableMaterial(item.material, item)
      && getItemBaseValue(item) >= GRANITE_PROCESSOR_MIN_BASE_VALUE) {
      const baseValue = getItemSaleValue(item);
      if (baseValue >= GRANITE_PROCESSOR_MIN_VALUE && baseValue < GRANITE_PROCESSOR_MAX_VALUE) {
        item.saleValueBase = baseValue * GRANITE_PROCESSOR_MULTIPLIER;
        item.saleValueBonus = 0;
        item.annealedValueMultiplier = 1;
      }
    }
    return finishMaterialTransform();
  }

  if (isPrimitiveUpgraderProcessConveyor(conveyor)) {
    if (item.kind === "material"
      && isSellableMaterial(item.material, item)
      && getItemBaseValue(item) >= PRIMITIVE_UPGRADER_MIN_BASE_VALUE) {
      const currentValue = getItemSaleValue(item);
      if (currentValue < PRIMITIVE_UPGRADER_MAX_VALUE) {
        item.saleValueBase = Math.min(
          currentValue + PRIMITIVE_UPGRADER_VALUE_BONUS,
          PRIMITIVE_UPGRADER_MAX_VALUE,
        );
        item.saleValueBonus = 0;
        item.annealedValueMultiplier = 1;
      }
    }
    return finishMaterialTransform();
  }

  if (isBronzeStampProcessConveyor(conveyor)) {
    if (item.kind === "material"
      && isSellableMaterial(item.material, item)
      && getItemBaseValue(item) >= BRONZE_STAMP_MIN_BASE_VALUE) {
      const uses = Number.isInteger(item.bronzeStampUses) ? item.bronzeStampUses : 0;
      const currentValue = getItemSaleValue(item);
      if (uses < BRONZE_STAMP_MAX_USES && currentValue >= BRONZE_STAMP_MIN_VALUE) {
        item.saleValueBase = currentValue + BRONZE_STAMP_VALUE_BONUS;
        item.saleValueBonus = 0;
        item.annealedValueMultiplier = 1;
        item.bronzeStampUses = uses + 1;
      }
    }
    return finishMaterialTransform();
  }

  if (isBronzePillarsProcessConveyor(conveyor)) {
    if (item.kind === "material"
      && isSellableMaterial(item.material, item)
      && getItemBaseValue(item) >= BRONZE_PILLARS_MIN_BASE_VALUE) {
      const uses = Number.isInteger(item.bronzePillarsUses)
        ? item.bronzePillarsUses
        : 0;
      const currentValue = getItemSaleValue(item);
      if (uses < BRONZE_PILLARS_MAX_USES && currentValue < BRONZE_PILLARS_MAX_VALUE) {
        item.saleValueBase = currentValue * BRONZE_PILLARS_MULTIPLIER;
        item.saleValueBonus = 0;
        item.annealedValueMultiplier = 1;
        item.bronzePillarsUses = uses + 1;
      }
    }
    return finishMaterialTransform();
  }

  if (isExtruderProcessConveyor(conveyor)) {
    if (item.kind === "material" && INGOT_MATERIALS.includes(item.material)) {
      const sourceMaterial = item.material;
      const wireCount = item.quantity * 5;
      const wireValue = getItemSaleValue(item) * 0.5;
      item.material = "wire";
      item.quantity = wireCount;
      item.saleValueBase = wireValue;
      item.saleValueBonus = 0;
      item.annealedValueMultiplier = 1;
      item.freshMoldedAt = Date.now();
      addLog(`Extruder produced ${formatNumber(wireCount)} copper wires from ${MATERIAL_LABELS[sourceMaterial]}.`);
    }
    return finishMaterialTransform();
  }

  if (isJacketFormerProcessConveyor(conveyor)) {
    if (item.kind === "ammo"
      && item.jacketMaterial === "nativeCopper"
      && item.jacketed !== true) {
      const coreMaterial = item.coreMaterial ?? item.material;
      const jacketDamage = getBaseAmmoDamage(item.jacketMaterial);
      item.coreMaterial = coreMaterial;
      item.damage = (Number(item.damage) * jacketDamage) ** 0.85;
      item.jacketed = true;
      addLog(`Jacket Former applied a Native copper jacket to ${MATERIAL_LABELS[coreMaterial] ?? "the bullet"} cores.`);
    }
    return finishMaterialTransform();
  }

  if (isGraphiteCopperAnnealerProcessConveyor(conveyor)) {
    const isFreshAdvancedMetalProduct = item.kind === "material"
      && ANNEALER_VALUE_MATERIALS.includes(item.material)
      && Boolean(item.freshMoldedAt);
    const isMineralCore = item.kind === "ammo"
      && item.material !== "leek"
      && item.annealedDamageMultiplier !== ANNEALER_MULTIPLIER
      && (Boolean(item.casterFinishedAt) || item.jacketed === true);
    if (isFreshAdvancedMetalProduct) {
      item.annealedValueMultiplier = ANNEALER_MULTIPLIER;
      item.freshMoldedAt = null;
    } else if (isMineralCore) {
      item.annealedDamageMultiplier = ANNEALER_MULTIPLIER;
      item.damage *= ANNEALER_MULTIPLIER;
      item.annealed = true;
      item.casterFinishedAt = null;
    }
    return finishMaterialTransform();
  }

  if (!isAmmoShaperProcessConveyor(conveyor)) {
    return finishMaterialTransform();
  }

  const isLeekAmmo = item.kind === "material"
    && item.material === "leek"
    && !item.metalMaterial;
  const isCoatedCore = state.mine.ammoShaperMode === "coated"
    && item.kind === "material"
    && item.material === "leek"
    && LIQUID_METAL_AMMO_MATERIALS.includes(item.metalMaterial);
  if (!isLeekAmmo && !isCoatedCore) {
    return finishMaterialTransform();
  }

  const roundCount = isCoatedCore
    ? AMMO_ROUNDS_PER_MINERAL
    : AMMO_ROUNDS_PER_OTHER_MATERIAL;
  const damage = isCoatedCore ? getBaseAmmoDamage(item.metalMaterial) : 1;

  const ammunition = {
    kind: "ammo",
    material: isCoatedCore ? item.metalMaterial : item.material,
    quantity: item.quantity * roundCount,
    damage,
    dusted: false,
    casterFinishedAt: Date.now(),
  };
  addLog(`${isCoatedCore ? "Bullet Core Caster cast" : "Bullet Core Caster formed"} ${formatNumber(ammunition.quantity)} ${MATERIAL_LABELS[ammunition.material]} rapidfire rounds${isCoatedCore ? ` from ${MATERIAL_LABELS[item.metalMaterial]} liquid metal` : ""}.`);
  return ammunition;
}

function getConveyorIdentity(conveyor) {
  if (isInternalConveyor(conveyor)) {
    return `internal:${getInternalConveyorKey(conveyor)}`;
  }
  if (isFixedConveyor(conveyor)) {
    return `fixed:${conveyor.column},${conveyor.row}`;
  }
  return `placed:${conveyor.column},${conveyor.row}`;
}

function getConveyorAdvanceDestination(conveyor, item) {
  return getWeightedConveyorDestination(conveyor, item);
}

function getUnweightedConveyorAdvanceDestination(conveyor, item) {
  if (!canItemLeaveConveyor(conveyor, item)) {
    return null;
  }

  if (conveyor.internalMachineId === "gearPress" && conveyor.internalIndex === 0) {
    const press = getInternalConveyorMachine(conveyor);
    const nextConveyor = getInternalConveyor(press, getMachineProcessLaneIndex(press));
    return {
      type: "gearPress",
      press,
      nextConveyor,
      destination: { column: nextConveyor.column, row: nextConveyor.row },
    };
  }

  const arcFurnaceInput = getArcFurnaceInputForConveyor(conveyor);
  if (arcFurnaceInput) {
    return {
      type: "receiver",
      destination: { column: conveyor.column, row: conveyor.row },
    };
  }

  const destination = getConveyorOutputPosition(conveyor);
  const stacker = getStackerAt(destination.column, destination.row);
  if (stacker) {
    return canStackerReceiveFromConveyor(stacker, conveyor)
      && canStackerAcceptItem(stacker, item)
      ? { type: "receiver", destination }
      : null;
  }

  const splitter = getSplitterAt(destination.column, destination.row);
  if (splitter) {
    if (!canSplitterReceiveFromConveyor(splitter, conveyor)) {
      return null;
    }
    const output = getAvailableSplitterOutput(splitter, item);
    return output
      ? {
        type: "conveyor",
        destination: {
          column: output.outputConveyor.column,
          row: output.outputConveyor.row,
        },
        nextConveyor: output.outputConveyor,
        splitterInstanceId: splitter.instanceId,
        splitterOutputIndex: output.outputIndex,
      }
      : null;
  }

  const nextConveyor = getConveyorAt(destination.column, destination.row);
  if (nextConveyor) {
    if (nextConveyor.internalMachineId === "gearPress") {
      // Source transformers run on departure; a direct Metal Press connection
      // delivers its resulting plate, not the ingot currently on its belt.
      const incomingItem = isMetalPressProcessConveyor(conveyor)
        && item.kind === "material" && Object.hasOwn(INGOT_TO_PLATE, item.material)
        ? { ...item, material: INGOT_TO_PLATE[item.material] }
        : item;
      if (nextConveyor.internalIndex !== 0
        || !canGearPressAcceptInput(getInternalConveyorMachine(nextConveyor), incomingItem)) {
        return null;
      }
    }
    const arcFurnaceInput = getArcFurnaceInputForConveyor(nextConveyor);
    if (arcFurnaceInput) {
      return canConveyorFeedInto(conveyor, nextConveyor)
        && canArcFurnaceAcceptInput(arcFurnaceInput.furnace, arcFurnaceInput.slot, item)
        ? { type: "receiver", destination }
        : null;
    }
    if (isCasingMachineInputConveyor(nextConveyor)
      && !canCasingMachineAcceptItem(getCasingMachineForConveyor(nextConveyor), item)) {
      return null;
    }
    if (isBulletCoreCasterInputConveyor(nextConveyor)
      && !canBulletCoreCasterAcceptItem(item)) {
      return null;
    }
    if (isQuartzWheelCutterInputConveyor(nextConveyor)
      && !(item.kind === "material" && item.material === "copper")) {
      return null;
    }
    return canConveyorFeedInto(conveyor, nextConveyor)
      ? { type: "conveyor", destination, nextConveyor }
      : null;
  }

  return canReceiveConveyorItem(item, destination.column, destination.row)
    ? { type: "receiver", destination }
    : null;
}

function createConveyorMovementResolver(requiresCompletedTile) {
  const resolved = new Map();
  const resolving = new Set();

  const resolveMovement = (conveyor) => {
    const identity = getConveyorIdentity(conveyor);
    if (resolved.has(identity)) {
      return resolved.get(identity);
    }

    const item = getConveyorItem(conveyor);
    if (!item || (requiresCompletedTile && (item.tileProgress ?? 0) < 1) || resolving.has(identity)) {
      return false;
    }

    resolving.add(identity);
    const target = getConveyorAdvanceDestination(conveyor, item);
    const canMove = !target
      ? false
      : target.type === "receiver" || !getConveyorItem(target.nextConveyor)
        ? true
        : getConveyorAdvanceDestination(target.nextConveyor, getConveyorItem(target.nextConveyor))?.clearsSource
          && resolveMovement(target.nextConveyor);
    resolving.delete(identity);
    resolved.set(identity, canMove);
    return canMove;
  };

  return resolveMovement;
}

function advanceConveyorItems(deltaSeconds) {
  const conveyors = getFactoryConveyors().map(({ conveyor }) => conveyor);
  const canMakeProgress = createConveyorMovementResolver(false);
  conveyors.forEach((conveyor) => {
    const item = getConveyorItem(conveyor);
    if (!item) {
      return;
    }

    markItemForDuster(item, conveyor.column, conveyor.row);

    if (!canMakeProgress(conveyor)) {
      item.tileProgress = 0;
      return;
    }

    item.tileProgress = Math.min(
      1,
      (item.tileProgress ?? 0) + deltaSeconds / getConveyorSecondsPerTile(conveyor),
    );
  });

  const candidateMovements = new Map();
  const claimedDestinations = new Set();
  const willMove = createConveyorMovementResolver(true);

  conveyors.forEach((conveyor) => {
    const item = getConveyorItem(conveyor);
    if (!item || !willMove(conveyor)) {
      return;
    }

    const target = getConveyorAdvanceDestination(conveyor, item);
    const destinationKey = getFactoryTileKey(target.destination.column, target.destination.row);
    if (claimedDestinations.has(destinationKey)) {
      return;
    }

    candidateMovements.set(getConveyorIdentity(conveyor), { ...target, conveyor, item });
    claimedDestinations.add(destinationKey);
  });

  // A full destination is only available if its own item was selected to leave.
  // Remove dependent moves until every remaining chain can safely advance.
  let removedDependentMove = true;
  while (removedDependentMove) {
    removedDependentMove = false;
    candidateMovements.forEach((movement, identity) => {
      if ((movement.type !== "conveyor" && movement.type !== "gearPress")
        || !getConveyorItem(movement.nextConveyor)) {
        return;
      }

      if (!candidateMovements.get(getConveyorIdentity(movement.nextConveyor))?.clearsSource) {
        candidateMovements.delete(identity);
        removedDependentMove = true;
      }
    });
  }
  const movements = [...candidateMovements.values()];

  // Sources clear together before destinations fill, so an entire compatible line can advance.
  movements.forEach((movement) => {
    if (movement.clearsSource) {
      releaseDusterForItem(movement.item);
      setConveyorItem(movement.conveyor, null);
    } else {
      const source = movement.item;
      movement.item = { ...source, quantity: movement.transferQuantity, dusterAssigned: false };
      source.quantity = Number((source.quantity - movement.transferQuantity).toPrecision(12));
      source.tileProgress = 0;
    }
  });

  movements.forEach((movement) => {
    if (movement.type === "gearPress") {
      receiveGearPressInput(movement.press, movement.item);
    } else if (movement.type === "conveyor") {
      const placed = placeItemOnConveyor(
        movement.nextConveyor,
        transformItemLeavingConveyor(movement.conveyor, movement.item),
      );
      if (placed && movement.splitterInstanceId) {
        const splitter = getMachineByInstanceId(movement.splitterInstanceId);
        if (splitter) {
          splitter.splitterNextOutputIndex = (movement.splitterOutputIndex + 1) % 3;
        }
      }
    } else {
      receiveConveyorItem(
        transformItemLeavingConveyor(movement.conveyor, movement.item),
        movement.destination.column,
        movement.destination.row,
      );
    }
  });
}

function emitStorageOutputs() {
  state.machines
    .filter((machine) => machine.id === "materialStorage")
    .forEach((storage) => {
      getActiveStorageOutputPorts(storage).forEach((port) => {
        const conveyor = getPlacedConveyor(port.column, port.row);
        if (!conveyor || getConveyorItem(conveyor)) {
          return;
        }

        const material = getStorageOutputFilter(storage, port).find((candidate) => (
          state.stockpile[candidate] >= 1
        ));
        if (!material) {
          return;
        }

        // Storage emits material cargo only; ammo is kept separately and cannot
        // be pulled from storage, so its damage/annealed state is untouched.
        const item = { kind: "material", material, quantity: 1, dusted: false };
        if (placeItemOnConveyor(conveyor, item)) {
          state.stockpile[material] -= 1;
        }
      });
    });
}

function getAmmoDepositRoute() {
  const shaper = getMachine("ammoShaper");
  const gunDeposit = getMachine("gunDeposit");
  if (!shaper || !gunDeposit) {
    return null;
  }

  const output = getInternalConveyorTiles(shaper).at(-1);
  const input = gunDeposit.input;
  if (!output || !input) {
    return null;
  }

  const firstStep = DIRECTION_VECTORS[output.direction];
  let column = output.column + firstStep.column;
  let row = output.row + firstStep.row;
  const route = [];
  const visited = new Set();

  while (route.length <= FACTORY_COLUMNS * FACTORY_ROWS) {
    const conveyor = getConveyorAt(column, row);
    if (!conveyor) {
      return null;
    }
    const key = `${column},${row}`;
    if (visited.has(key)) {
      return null;
    }
    visited.add(key);
    route.push(conveyor);

    const vector = DIRECTION_VECTORS[conveyor.direction];
    column += vector.column;
    row += vector.row;
    if (column === input.column && row === input.row) {
      return route;
    }
  }

  return null;
}

function hasAmmoProductionRoute() {
  return hasPlanterAmmoRoute() && getAmmoDepositRoute() !== null;
}

function getSellTubeInputTiles(sellTube) {
  return (sellTube?.inputTiles ?? []).map((tile) => rotateMachineCoordinate(
    sellTube,
    tile.column,
    tile.row,
  ));
}

function getSellTubeInputAt(column, row) {
  for (const sellTube of getSellTubeMachines()) {
    const input = getSellTubeInputTiles(sellTube).find((tile) => (
      tile.column === column && tile.row === row
    ));
    if (input) {
      return { sellTube, input };
    }
  }
  return null;
}

function getStorageSellRoute(storage, port) {
  if (!isStorageOutputActive(storage, port)) {
    return null;
  }

  const sellTubeInputs = getSellTubeMachines().flatMap((sellTube) => (
    getSellTubeInputTiles(sellTube).map((input) => ({ sellTube, input }))
  ));
  if (sellTubeInputs.length === 0) {
    return null;
  }
  const route = [];
  const visited = new Set();
  let column = port.column;
  let row = port.row;

  while (route.length <= FACTORY_COLUMNS * FACTORY_ROWS) {
    const conveyor = getConveyorAt(column, row);
    if (!conveyor) {
      return null;
    }
    const key = `${column},${row}`;
    if (visited.has(key)) {
      return null;
    }
    visited.add(key);
    route.push(conveyor);

    const direction = DIRECTION_VECTORS[conveyor.direction];
    column += direction.column;
    row += direction.row;
    const sellTubeInput = sellTubeInputs.find(({ input }) => (
      input.column === column && input.row === row
    ));
    if (sellTubeInput) {
      return { route, sellTube: sellTubeInput.sellTube, sellTubeInput: sellTubeInput.input };
    }
  }

  return null;
}

function getDusterForRoute(route, material) {
  if (!route || !isSellableMaterial(material) || getAvailableCrew() < 1) {
    return null;
  }

  const duster = getMachine("leekDuster");
  const upgradeTile = getMachineUpgradeTile(duster);
  if (!duster || !upgradeTile) {
    return null;
  }

  return route.route.some((conveyor) => (
    conveyor.column === upgradeTile.column && conveyor.row === upgradeTile.row
  )) ? duster : null;
}

function getSaleValue(material, duster = false, saleValueBonus = 0, valueMultiplier = 1, baseValueOverride = null) {
  const multiplierRule = SALE_VALUE_MULTIPLIERS[material];
  const baseValue = baseValueOverride ?? (multiplierRule
    ? (MINIMUM_SALE_VALUES[multiplierRule.baseMaterial] ?? 0) * multiplierRule.multiplier
    : MINIMUM_SALE_VALUES[material] ?? 0);
  const dustedValue = (duster ? baseValue * DUSTER_SELL_MULTIPLIER : baseValue) * valueMultiplier;
  if (saleValueBonus <= 0) {
    return dustedValue;
  }

  return Math.max(dustedValue, Math.min(ROCK_SHACK_VALUE_CAP, dustedValue + saleValueBonus));
}

function getItemSaleValue(item) {
  const hasStampedValue = Number.isFinite(item.saleValueBase);
  return getSaleValue(
    item.material,
    hasStampedValue ? false : item.dusted,
    item.saleValueBonus,
    item.annealedValueMultiplier ?? 1,
    hasStampedValue ? item.saleValueBase : null,
  );
}

function getItemBaseValue(item) {
  if (Number.isFinite(item?.baseValue)) {
    return item.baseValue;
  }
  if (!ORE_CHUNK_MATERIALS.includes(item?.material) && Number.isFinite(item?.saleValueBase)) {
    return item.saleValueBase;
  }
  return getSaleValue(item?.material);
}

function findStorageExport() {
  const storages = state.machines.filter((machine) => machine.id === "materialStorage");
  for (const storage of storages) {
    for (const port of getActiveStorageOutputPorts(storage)) {
      const route = getStorageSellRoute(storage, port);
      if (!route) {
        continue;
      }
      const material = getStorageOutputFilter(storage, port).find((candidate) => (
        isSellableMaterial(candidate) && state.stockpile[candidate] >= 1
      ));
      if (material) {
        return { storage, port, route, material, duster: getDusterForRoute(route, material) };
      }
    }
  }

  return null;
}

function hasStorageSellRoute() {
  return state.machines
    .filter((machine) => machine.id === "materialStorage")
    .some((storage) => getActiveStorageOutputPorts(storage).some((port) => (
      getStorageSellRoute(storage, port) !== null
    )));
}

function dispatchStorageExport() {
  if (state.storageExportsInTransit > 0) {
    return false;
  }

  const exportOrder = findStorageExport();
  if (!exportOrder) {
    return false;
  }

  const { port, route, material, duster } = exportOrder;
  if (material === "copper" && duster && getTutorialStage() === "saleFilter") {
    state.tutorial.stage = "sellWait";
  }
  state.stockpile[material] -= 1;
  if (duster) {
    state.dusterJob = { material };
  }
  state.storageExportsInTransit += 1;
  animateMaterialFromStorage(port, route, material, duster, () => {
    state.storageExportsInTransit -= 1;
    state.dusterJob = null;
    const saleValue = getSaleValue(material, duster)
      * getSellTubeValueMultiplier(route.sellTube)
      * getPlaytestSellValueMultiplier();
    state.cash += saleValue;
    showSaleFloatingText(saleValue, route.sellTube);
    addLog(`${getMachineDisplayName(route.sellTube.id)} sold one ${MATERIAL_LABELS[material]}${duster ? " after a Leek Duster pass" : ""} for ${formatCash(saleValue)}.`);
    if (material === "copper" && duster && getTutorialStage() === "sellWait") {
      state.tutorial.dusterImprovedMalachiteSold = true;
    }
    render();
  });
  return true;
}

function rotateMachineCoordinate(machine, column, row) {
  const orientation = machine.orientation ?? "right";
  if (orientation === "right") {
    return { column: machine.column + column, row: machine.row + row };
  }

  if (orientation === "up") {
    return { column: machine.column + row, row: machine.row + machine.width - 1 - column };
  }

  if (orientation === "down") {
    return { column: machine.column + machine.height - 1 - row, row: machine.row + column };
  }

  return {
    column: machine.column + machine.width - 1 - column,
    row: machine.row + machine.height - 1 - row,
  };
}

function rotateMachineDirection(direction, orientation = "right") {
  const directionIndex = CONVEYOR_ORIENTATIONS.indexOf(direction);
  const rotationOffset = CONVEYOR_ORIENTATIONS.indexOf(orientation)
    - CONVEYOR_ORIENTATIONS.indexOf("right");
  const rotatedIndex = (directionIndex + rotationOffset + CONVEYOR_ORIENTATIONS.length)
    % CONVEYOR_ORIENTATIONS.length;
  return CONVEYOR_ORIENTATIONS[rotatedIndex];
}

function getInternalConveyorTiles(machine) {
  return (machine.internalConveyors ?? []).map((conveyor) => ({
    ...rotateMachineCoordinate(machine, conveyor.column, conveyor.row),
    direction: rotateMachineDirection(conveyor.direction, machine.orientation),
    speed: conveyor.speed,
    arcFurnaceSlot: conveyor.arcFurnaceSlot,
    casingMachineSlot: conveyor.casingMachineSlot,
  }));
}

function getMachineProcessLaneIndex(machine) {
  return machine.processLaneIndex ?? 0;
}

function getMachineProcessTile(machine) {
  return getInternalConveyorTiles(machine)[getMachineProcessLaneIndex(machine)] ?? null;
}

