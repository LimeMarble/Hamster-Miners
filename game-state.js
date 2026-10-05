"use strict";

// DOM references, mutable runtime state, save hydration, and persistence.

const elements = {
  views: document.querySelectorAll("[data-view]"),
  viewNavButtons: document.querySelectorAll(".view-nav"),
  mineGrid: document.querySelector("#mineGrid"),
  realityShieldHud: document.querySelector("#realityShieldHud"),
  realityShieldHudHealth: document.querySelector("#realityShieldHudHealth"),
  realityShieldHudStatus: document.querySelector("#realityShieldHudStatus"),
  realityShieldHudAmmo: document.querySelector("#realityShieldHudAmmo"),
  realityShieldHealthFill: document.querySelector("#realityShieldHealthFill"),
  realityShieldButton: document.querySelector("#realityShieldButton"),
  realityShieldStatus: document.querySelector("#realityShieldStatus"),
  mineInformationOverlay: document.querySelector("#mineInformationOverlay"),
  mineLayerLabel: document.querySelector("#mineLayerLabel"),
  mineLayerHost: document.querySelector("#mineLayerHost"),
  mineProgressFill: document.querySelector("#mineProgressFill"),
  mineProgressMarkers: document.querySelector("#mineProgressMarkers"),
  mineProgressLabel: document.querySelector("#mineProgressLabel"),
  hostRockLegend: document.querySelector("#hostRockLegend"),
  mineLayerHealth: document.querySelector("#mineLayerHealth"),
  mineDrillDps: document.querySelector("#mineDrillDps"),
  cashOverlayValue: document.querySelector("#cashOverlayValue"),
  mineOresRemaining: document.querySelector("#mineOresRemaining"),
  mineLayerActions: document.querySelector("#mineLayerActions"),
  ammoValue: document.querySelector("#ammoValue"),
  planterRate: document.querySelector("#planterRate"),
  leekInputValue: document.querySelector("#leekInputValue"),
  crewValue: document.querySelector("#crewValue"),
  crewStatus: document.querySelector("#crewStatus"),
  factoryCrewOverlay: document.querySelector("#factoryCrewOverlay"),
  factoryCrewOverlayAvailable: document.querySelector("#factoryCrewOverlayAvailable"),
  factoryCrewOverlayAssigned: document.querySelector("#factoryCrewOverlayAssigned"),
  factoryCrewOverlayHireCost: document.querySelector("#factoryCrewOverlayHireCost"),
  factoryCrewOverlayHired: document.querySelector("#factoryCrewOverlayHired"),
  hireCrewButton: document.querySelector("#hireCrewButton"),
  factoryCrewAvailable: document.querySelector("#factoryCrewAvailable"),
  factoryCrewAssigned: document.querySelector("#factoryCrewAssigned"),
  autoExtractorValue: document.querySelector("#autoExtractorValue"),
  targetStatus: document.querySelector("#targetStatus"),
  shotsFiredValue: document.querySelector("#shotsFiredValue"),
  recoveredValue: document.querySelector("#recoveredValue"),
  tutorialOverlay: document.querySelector("#tutorialOverlay"),
  tutorialOverlayTitle: document.querySelector("#tutorialOverlayTitle"),
  tutorialOverlayDescription: document.querySelector("#tutorialOverlayDescription"),
  tutorialOverlayProgress: document.querySelector("#tutorialOverlayProgress"),
  tutorialActionButton: document.querySelector("#tutorialActionButton"),
  tutorialTitle: document.querySelector("#tutorialTitle"),
  tutorialDescription: document.querySelector("#tutorialDescription"),
  tutorialProgress: document.querySelector("#tutorialProgress"),
  selectConveyorButton: document.querySelector("#selectConveyorButton"),
  selectInventoryConveyorButton: document.querySelector("#selectInventoryConveyorButton"),
  selectPlanterButton: document.querySelector("#selectPlanterButton"),
  selectAmmoShaperButton: document.querySelector("#selectAmmoShaperButton"),
  selectJacketFormerButton: document.querySelector("#selectJacketFormerButton"),
  selectCasingMachineButton: document.querySelector("#selectCasingMachineButton"),
  selectStorageButton: document.querySelector("#selectStorageButton"),
  selectSellTubeButton: document.querySelector("#selectSellTubeButton"),
  selectGraphiteLacedSellTubeButton: document.querySelector("#selectGraphiteLacedSellTubeButton"),
  selectLeekDusterButton: document.querySelector("#selectLeekDusterButton"),
  selectPrimitiveUpgraderButton: document.querySelector("#selectPrimitiveUpgraderButton"),
  selectRockShackButton: document.querySelector("#selectRockShackButton"),
  selectClayKilnButton: document.querySelector("#selectClayKilnButton"),
  selectIngotMolderButton: document.querySelector("#selectIngotMolderButton"),
  selectRefractoryCasterButton: document.querySelector("#selectRefractoryCasterButton"),
  selectGraphiteCopperAnnealerButton: document.querySelector("#selectGraphiteCopperAnnealerButton"),
  selectGraniteProcessorButton: document.querySelector("#selectGraniteProcessorButton"),
  selectBronzeStampButton: document.querySelector("#selectBronzeStampButton"),
  selectBronzePillarsButton: document.querySelector("#selectBronzePillarsButton"),
  selectExtruderButton: document.querySelector("#selectExtruderButton"),
  selectLeekFiberExtractorButton: document.querySelector("#selectLeekFiberExtractorButton"),
  selectContactMakerButton: document.querySelector("#selectContactMakerButton"),
  selectMiniElectricArcFurnaceButton: document.querySelector("#selectMiniElectricArcFurnaceButton"),
  selectMetalPressButton: document.querySelector("#selectMetalPressButton"),
  selectGearPressButton: document.querySelector("#selectGearPressButton"),
  selectStackerButton: document.querySelector("#selectStackerButton"),
  selectSplitterButton: document.querySelector("#selectSplitterButton"),
  selectQuartzWheelCutterButton: document.querySelector("#selectQuartzWheelCutterButton"),
  conveyorInventoryCount: document.querySelector("#conveyorInventoryCount"),
  planterInventoryCount: document.querySelector("#planterInventoryCount"),
  ammoShaperInventoryCount: document.querySelector("#ammoShaperInventoryCount"),
  jacketFormerInventoryCount: document.querySelector("#jacketFormerInventoryCount"),
  casingMachineInventoryCount: document.querySelector("#casingMachineInventoryCount"),
  storageInventoryCount: document.querySelector("#storageInventoryCount"),
  sellTubeInventoryCount: document.querySelector("#sellTubeInventoryCount"),
  graphiteLacedSellTubeInventoryCount: document.querySelector("#graphiteLacedSellTubeInventoryCount"),
  leekDusterInventoryCount: document.querySelector("#leekDusterInventoryCount"),
  primitiveUpgraderInventoryCount: document.querySelector("#primitiveUpgraderInventoryCount"),
  rockShackInventoryCount: document.querySelector("#rockShackInventoryCount"),
  clayKilnInventoryCount: document.querySelector("#clayKilnInventoryCount"),
  ingotMolderInventoryCount: document.querySelector("#ingotMolderInventoryCount"),
  refractoryCasterInventoryCount: document.querySelector("#refractoryCasterInventoryCount"),
  graphiteCopperAnnealerInventoryCount: document.querySelector("#graphiteCopperAnnealerInventoryCount"),
  graniteProcessorInventoryCount: document.querySelector("#graniteProcessorInventoryCount"),
  bronzeStampInventoryCount: document.querySelector("#bronzeStampInventoryCount"),
  bronzePillarsInventoryCount: document.querySelector("#bronzePillarsInventoryCount"),
  extruderInventoryCount: document.querySelector("#extruderInventoryCount"),
  leekFiberExtractorInventoryCount: document.querySelector("#leekFiberExtractorInventoryCount"),
  contactMakerInventoryCount: document.querySelector("#contactMakerInventoryCount"),
  miniElectricArcFurnaceInventoryCount: document.querySelector("#miniElectricArcFurnaceInventoryCount"),
  metalPressInventoryCount: document.querySelector("#metalPressInventoryCount"),
  gearPressInventoryCount: document.querySelector("#gearPressInventoryCount"),
  aggregateMixerInventoryCount: document.querySelector("#aggregateMixerInventoryCount"),
  hotFluidPipeInventoryCount: document.querySelector("#hotFluidPipeInventoryCount"),
  pipePlacementControls: document.querySelector("#pipePlacementControls"),
  pipePlacementMode: document.querySelector("#pipePlacementMode"),
  pipePlacementTurnSide: document.querySelector("#pipePlacementTurnSide"),
  stackerInventoryCount: document.querySelector("#stackerInventoryCount"),
  splitterInventoryCount: document.querySelector("#splitterInventoryCount"),
  quartzWheelCutterInventoryCount: document.querySelector("#quartzWheelCutterInventoryCount"),
  inventoryConveyorCard: document.querySelector("#inventoryConveyorCard"),
  inventoryMachineCards: document.querySelectorAll("[data-inventory-machine]"),
  inventorySectionButtons: document.querySelectorAll("[data-inventory-section]"),
  inventoryCategoryButtons: document.querySelectorAll("[data-inventory-category]"),
  shopCategoryButtons: document.querySelectorAll("[data-shop-category]"),
  inventoryMachinesSection: document.querySelector("#inventoryMachinesSection"),
  inventoryDetailTitle: document.querySelector("#inventoryDetailTitle"),
  inventoryDetailDescription: document.querySelector("#inventoryDetailDescription"),
  inventoryDetailOwned: document.querySelector("#inventoryDetailOwned"),
  inventoryDetailPlaceButton: document.querySelector("#inventoryDetailPlaceButton"),
  inventoryItemsSection: document.querySelector("#inventoryItemsSection"),
  inventoryStorageList: document.querySelector("#inventoryStorageList"),
  machineControls: document.querySelector("#machineControls"),
  selectedMachineLabel: document.querySelector("#selectedMachineLabel"),
  closeMachineControlsButton: document.querySelector("#closeMachineControlsButton"),
  pickUpMachineButton: document.querySelector("#pickUpMachineButton"),
  moveMachineButton: document.querySelector("#moveMachineButton"),
  factoryInteractionControls: document.querySelector("#factoryInteractionControls"),
  factoryInteractionHelp: document.querySelector("#factoryInteractionHelp"),
  cancelFactoryInteractionButton: document.querySelector("#cancelFactoryInteractionButton"),
  rotateFactoryInteractionButton: document.querySelector("#rotateFactoryInteractionButton"),
  machineSelectionHelp: document.querySelector("#machineSelectionHelp"),
  machineActions: document.querySelector("#machineActions"),
  fireButton: document.querySelector("#fireButton"),
  autoToggleButton: document.querySelector("#autoToggleButton"),
  machineGrid: document.querySelector("#machineGrid"),
  ammoMaterialSelect: document.querySelector("#ammoMaterialSelect"),
  feedAmmoButton: document.querySelector("#feedAmmoButton"),
  ammoMakerStatus: document.querySelector("#ammoMakerStatus"),
  ammoStacks: document.querySelector("#ammoStacks"),
  stockpile: document.querySelector("#stockpile"),
  drillButton: document.querySelector("#drillButton"),
  drillProgressFill: document.querySelector("#drillProgressFill"),
  drillProgressLabel: document.querySelector("#drillProgressLabel"),
  drillDescription: document.querySelector("#drillDescription"),
  eventLog: document.querySelector("#eventLog"),
  buyLeekDusterButton: document.querySelector("#buyLeekDusterButton"),
  buyPrimitiveUpgraderButton: document.querySelector("#buyPrimitiveUpgraderButton"),
  buyConveyorButton: document.querySelector("#buyConveyorButton"),
  buyRockShackButton: document.querySelector("#buyRockShackButton"),
  buyClayKilnButton: document.querySelector("#buyClayKilnButton"),
  buyIngotMolderButton: document.querySelector("#buyIngotMolderButton"),
  buyRefractoryCasterButton: document.querySelector("#buyRefractoryCasterButton"),
  buyGraphiteCopperAnnealerButton: document.querySelector("#buyGraphiteCopperAnnealerButton"),
  buyGraniteProcessorButton: document.querySelector("#buyGraniteProcessorButton"),
  buyBronzeStampButton: document.querySelector("#buyBronzeStampButton"),
  buyBronzePillarsButton: document.querySelector("#buyBronzePillarsButton"),
  buyExtruderButton: document.querySelector("#buyExtruderButton"),
  buyLeekFiberExtractorButton: document.querySelector("#buyLeekFiberExtractorButton"),
  buyContactMakerButton: document.querySelector("#buyContactMakerButton"),
  buyJacketFormerButton: document.querySelector("#buyJacketFormerButton"),
  buyCasingMachineButton: document.querySelector("#buyCasingMachineButton"),
  buyMiniElectricArcFurnaceButton: document.querySelector("#buyMiniElectricArcFurnaceButton"),
  buyMetalPressButton: document.querySelector("#buyMetalPressButton"),
  buyGearPressButton: document.querySelector("#buyGearPressButton"),
  buyStackerButton: document.querySelector("#buyStackerButton"),
  buySplitterButton: document.querySelector("#buySplitterButton"),
  buyGraphiteLacedSellTubeButton: document.querySelector("#buyGraphiteLacedSellTubeButton"),
  buyMaterialStorageButton: document.querySelector("#buyMaterialStorageButton"),
  buyQuartzWheelCutterButton: document.querySelector("#buyQuartzWheelCutterButton"),
  shopDetailTitle: document.querySelector("#shopDetailTitle"),
  shopDetailDescription: document.querySelector("#shopDetailDescription"),
  shopDetailOwned: document.querySelector("#shopDetailOwned"),
  shopDetailQuantity: document.querySelector("#shopDetailQuantity"),
  shopDetailQuantityHelp: document.querySelector("#shopDetailQuantityHelp"),
  shopDetailCost: document.querySelector("#shopDetailCost"),
  shopDetailBuyButton: document.querySelector("#shopDetailBuyButton"),
  recipesList: document.querySelector("#recipesList"),
  recipeMachineSearch: document.querySelector("#recipeMachineSearch"),
  recipeMachineFilter: document.querySelector("#recipeMachineFilter"),
  recipeFilterStatus: document.querySelector("#recipeFilterStatus"),
  mineDrillUpgradeButton: document.querySelector("#mineDrillUpgradeButton"),
  saveDataField: document.querySelector("#saveDataField"),
  exportSaveButton: document.querySelector("#exportSaveButton"),
  importSaveButton: document.querySelector("#importSaveButton"),
  saveDataStatus: document.querySelector("#saveDataStatus"),
  codeField: document.querySelector("#codeField"),
  applyCodeButton: document.querySelector("#applyCodeButton"),
  codeStatus: document.querySelector("#codeStatus"),
  cheatPanel: document.querySelector("#cheatPanel"),
  cheatDrillDpsToggle: document.querySelector("#cheatDrillDpsToggle"),
  cheatMaterialYieldToggle: document.querySelector("#cheatMaterialYieldToggle"),
  cheatProductionSpeedToggle: document.querySelector("#cheatProductionSpeedToggle"),
  cheatSellValueToggle: document.querySelector("#cheatSellValueToggle"),
  cheatDrillUpgradeButton: document.querySelector("#cheatDrillUpgradeButton"),
  cheatDrillDowngradeButton: document.querySelector("#cheatDrillDowngradeButton"),
  cheatTunnelRightsButton: document.querySelector("#cheatTunnelRightsButton"),
  hardResetButton: document.querySelector("#hardResetButton"),
};

// Hydration is deferred until all feature scripts have loaded so save migrations
// can safely call helpers from the factory and mining subsystems.
let state;
let tickHandle = null;
let autoFireAccumulator = 0;
let planterAccumulator = 0;
let autosaveAccumulator = 0;
let simulationRevision = 0;
let machineGame = null;
let machineScene = null;
let machineSceneUnavailable = false;
let factoryCrewText = null;
let machineOverlay = null;
let machineStaticLayer = null;
let gunNameText = null;
let gunAmmoText = null;
let storageOutputLabels = [];
let selectedStorageOutputKey = null;
let selectedBuildTool = null;
let selectedBuildOrientation = "right";
let selectedFactoryEntity = null;
let selectedFactoryEntities = [];
let factorySelectionDrag = null;
let factoryTapSelection = null;
const factoryOverlayBlockedEvents = new WeakSet();
let factoryOverlayGestureFromControls = false;
let factoryOverlayPointerActive = false;
let factoryOverlayInputGuardsBound = false;
let groupMoveState = null;
let hoveredFactoryTile = null;
let activeView = "mine";
let activeInventorySection = "machines";
let activeInventoryCategory = "cash";
let selectedInventoryMachineId = null;
let activeShopCategory = "cash";
let selectedShopMachineId = null;
let selectedShopPurchaseQuantity = "1";
let lastMineGridSignature = null;
let lastMineOreSummarySignature = null;
let lastMineLayerActionSignature = null;
let lastMineProgressMarkersSignature = null;
let lastStockpileSignature = null;
let lastLogSignature = null;
let lastAmmoStacksSignature = null;
let lastFactoryControlsSignature = null;
let lastFactoryInteractionControlsSignature = null;
let lastFactoryOverlaySignature = null;
let factoryConveyorCache = null;
let factoryConveyorByIdentity = null;
let factoryConveyorByTile = null;
const conveyorItems = new Set();
let conveyorItemLabels = new Map();
let factoryCameraZoom = 1;
let factoryTextResolution = 1;
let factoryPointerInside = false;
const REALITY_SHIELD_CHEAT_CODE = "Icantake'em";
const PLAYTEST_PANEL_CHEAT_CODE = "doit15timesalloveragain";
let realityShieldCheatBuffer = "";

function createInitialState() {
  return {
    ammoStacks: CONFIG.startingAmmo > 0
      ? [{ type: "rapidfire", damage: 1, material: "leek", count: CONFIG.startingAmmo, annealed: false }]
      : [],
    machines: Object.entries(MACHINE_LAYOUT)
      .filter(([, machine]) => Number.isInteger(machine.column) && Number.isInteger(machine.row))
      .map(([id, machine]) => ({
        id,
        instanceId: `starter-${id}`,
        ...machine,
        column: machine.column + FACTORY_STARTER_COLUMN_OFFSET,
      })),
    factoryLayoutVersion: FACTORY_LAYOUT_VERSION,
    nextMachineInstanceId: 1,
    machineInventory: {
      conveyor: 20,
      planter: 0,
      ammoShaper: 0,
      jacketFormer: 0,
      materialStorage: 0,
      sellTube: 1,
      graphiteLacedSellTube: 0,
      leekDuster: 0,
      primitiveUpgrader: 0,
      rockShack: 0,
      clayKiln: 0,
      ingotMolder: 0,
      refractoryCaster: 0,
      graphiteCopperAnnealer: 0,
      graniteProcessor: 0,
      bronzeStamp: 0,
      bronzePillars: 0,
      extruder: 0,
      leekFiberExtractor: 0,
      contactMaker: 0,
      miniElectricArcFurnace: 0,
      metalPress: 0,
      gearPress: 0,
      aggregateMixer: 0,
      hotFluidPipe: 0,
      stacker: 0,
      splitter: 0,
      casingMachine: 0,
      quartzWheelCutter: 0,
    },
    // Picked-up machinery remains an individually configured physical item.
    // This preserves per-instance modes and IDs through inventory and saves.
    machineInventoryInstances: [],
    placedConveyors: [],
    fixedConveyorItems: Object.fromEntries(
      FIXED_CONVEYORS.map((conveyor) => [getFactoryTileKey(conveyor.column, conveyor.row), null]),
    ),
    internalConveyorItems: {},
    tutorial: {
      stage: "intro",
      visible: true,
      dusterImprovedMalachiteSold: false,
      starterConveyorRemoved: false,
    },
    mineHudUnlocked: false,
    planterQueue: 0,
    materialsInTransit: 0,
    ammoInTransit: 0,
    storageExportsInTransit: 0,
    storageOutputFilters: {},
    autoExtractorEnabled: true,
    selectedDepositId: null,
    shotsFired: 0,
    recoveredOre: 0,
    cash: 0,
    cashEconomyVersion: CONFIG.cashEconomyVersion,
    diamondFragments: 0,
    cheatPanelUnlocked: false,
    playtestCheats: { ...PLAYTEST_CHEAT_DEFAULTS },
  stockpile: {
      leek: 0,
      copper: 0,
      nativeCopper: 0,
      clay: 0,
      lead: 0,
      silver: 0,
      zinc: 0,
      beryl: 0,
      rawAquamarine: 0,
      rawEmerald: 0,
      quartz: 0,
      leekFiber: 0,
      contact: 0,
      silverCopperContact: 0,
      silverTinContact: 0,
      silverIngot: 0,
      copperContactAlloyIngot: 0,
      tinContactAlloyIngot: 0,
      zincIngot: 0,
      tin: 0,
      tinIngot: 0,
      bronzeIngot: 0,
      copperPlate: 0,
      brittleCopperPlate: 0,
      silverPlate: 0,
      tinPlate: 0,
      bronzePlate: 0,
      ironIngot: 0,
      ironPlate: 0,
      cutMalachite: 0,
      ceramic: 0,
      aggregate: 0,
      limestone: 0,
      granite: 0,
      graphite: 0,
      hematite: 0,
      chert: 0,
      iron: 0,
      copperIngot: 0,
      brittleCopperIngot: 0,
      wire: 0,
      ...Object.fromEntries(GEAR_MATERIALS.map((material) => [material, 0])),
    },
    crew: { total: CONFIG.startingCrew },
    dusterJob: null,
    // Each kiln owns its pending input. Keeping this per instance prevents a
    // blocked output on one kiln from preventing another kiln from accepting ore.
    kilnInputs: [],
    kilnJob: null,
    kilnJobs: [],
    molderJob: null,
    molderJobs: [],
    molderClayBuffers: {},
    molderOutputBuffers: {},
    contactMakerInputs: {},
    arcFurnaceInputs: {},
    arcFurnaceJobs: [],
    arcFurnaceOutputBuffers: {},
    stackerBuffers: {},
    gearPressInputs: {},
    aggregateMixerInputs: {},
    aggregateMixerJobs: {},
    aggregateMixerOutputs: {},
    moltenCopper: [],
    mine: {
      currentTunnel: 1,
      unlockedTunnels: [1],
      miningRightsPurchased: false,
      selectedAmmoMaterial: "leek",
      selectedAmmoAnnealed: false,
      selectedAmmoCasingMaterial: null,
      selectedAmmoJacketMaterial: null,
      selectedAmmoCoreMaterial: "leek",
      selectedAmmoDamage: null,
      selectedAmmoGunType: "rapidfire",
      selectedAmmoByGun: {
        rapidfire: {
          material: "leek",
          casingMaterial: null,
          jacketMaterial: null,
          coreMaterial: "leek",
          damage: null,
          annealed: false,
        },
        buckshot: {
          material: "leek",
          casingMaterial: null,
          jacketMaterial: null,
          coreMaterial: "leek",
          damage: null,
          annealed: false,
        },
      },
      selectedGun: "rapidfire",
      rapidfireGunMk1Unlocked: false,
      rapidfireGunMk1Purchased: false,
      buckshotGunUnlocked: false,
      buckshotGunPurchased: false,
      gunSchedulingUnlocked: false,
      gunScheduleEnabledByTunnel: { 1: false, 2: false, 3: false },
      gunSchedulesByTunnel: { 1: [], 2: [], 3: [] },
      gunScheduleRuntimeByTunnel: {
        1: { stepIndex: 0, shotsFired: 0 },
        2: { stepIndex: 0, shotsFired: 0 },
        3: { stepIndex: 0, shotsFired: 0 },
      },
      ammoShaperMode: "basic",
      currentLayer: 1,
      isRemine: false,
      completedRegularLayers: 0,
      completedBands: 0,
      completedRegularLayersByTunnel: { 1: 0, 2: 0, 3: 0 },
      completedBandsByTunnel: { 1: 0, 2: 0, 3: 0 },
      tunnelProgress: {},
      autoDrillUnlocked: false,
      autoProgressionUnlocked: false,
      autoRemineUnlocked: false,
      tunnelThreeRightsPurchased: false,
      autoDrillMode: "off",
      autoContinueEnabled: false,
  autoRemineEnabled: false,
      selectedRemineBand: 1,
      reminesByBand: {},
      realityShield: {
        active: false,
        completed: false,
        hitPointsRemaining: CONFIG.realityShieldHitPoints,
        hitPointsTotal: CONFIG.realityShieldHitPoints,
        refreshTimer: CONFIG.realityShieldInitialIntervalSeconds,
        refreshIntervalSeconds: CONFIG.realityShieldInitialIntervalSeconds,
        waveNumber: 0,
        ores: [],
        temporaryBattle: false,
      },
    },
    deposits: createLayerDeposits(1),
    drill: {
      active: false,
      completed: false,
      upgradeId: "basic",
      hitPointsRemaining: CONFIG.firstLayerHitPoints,
      hitPointsTotal: CONFIG.firstLayerHitPoints,
    },
    logs: ["Tutorial: connect the leek planter to the Bullet Core Caster."],
  };
}

function encodeSavePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeSavePayload(encodedPayload) {
  const binary = atob(encodedPayload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isSaveRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveSavedMachineType(machine) {
  if (!isSaveRecord(machine)) {
    return null;
  }
  if (MACHINE_LAYOUT[machine.id]) {
    return machine.id;
  }

  // Version 1 briefly saved hydrated machines without their type ID. Their
  // footprint and immutable machine layout are still enough to recover them.
  return Object.entries(MACHINE_LAYOUT).find(([, definition]) => (
    machine.width === definition.width
    && machine.height === definition.height
    && (machine.processLaneIndex ?? null) === (definition.processLaneIndex ?? null)
    && Boolean(machine.upgradeOrigin) === Boolean(definition.upgradeOrigin)
    && Boolean(machine.liquidOutput) === Boolean(definition.liquidOutput)
    && Boolean(machine.liquidInputOutput) === Boolean(definition.liquidInputOutput)
    && Boolean(machine.input) === Boolean(definition.input)
    && (Array.isArray(machine.inputTiles) ? machine.inputTiles.length : 0)
      === (Array.isArray(definition.inputTiles) ? definition.inputTiles.length : 0)
    && (Array.isArray(machine.internalConveyors) ? machine.internalConveyors.length : 0)
      === (Array.isArray(definition.internalConveyors) ? definition.internalConveyors.length : 0)
  ))?.[0] ?? null;
}

function getMoltenMetalOwnerInstanceId(liquidMetal) {
  return liquidMetal?.smelterInstanceId ?? liquidMetal?.kilnInstanceId ?? null;
}

function normalizeMoltenMetalQueues(targetState) {
  const smelterMachines = [
    ...(targetState.machines ?? []),
    ...(targetState.machineInventoryInstances ?? []),
  ].filter((machine) => (MACHINE_LAYOUT[machine?.id]?.liquidOutput || machine?.id === "hotFluidPipe")
    && typeof machine.instanceId === "string"
    && machine.instanceId.length > 0);
  const validSmelterIds = new Set(smelterMachines.map(({ instanceId }) => instanceId));
  const queuesBySmelter = new Map();

  (Array.isArray(targetState.moltenCopper) ? targetState.moltenCopper : []).forEach((liquidMetal) => {
    const ownerInstanceId = getMoltenMetalOwnerInstanceId(liquidMetal);
    if (!ownerInstanceId || !validSmelterIds.has(ownerInstanceId)
      || !Number.isFinite(Number(liquidMetal.quantity ?? 1))
      || Number(liquidMetal.quantity ?? 1) <= 1e-9
      || typeof liquidMetal.material !== "string") {
      return;
    }
    if (!queuesBySmelter.has(ownerInstanceId)) {
      queuesBySmelter.set(ownerInstanceId, []);
    }
    queuesBySmelter.get(ownerInstanceId).push({ ...liquidMetal });
  });

  targetState.moltenCopper = [];
  queuesBySmelter.forEach((liquids, ownerInstanceId) => {
    const kilnJob = targetState.kilnJobs?.find((job) => job.kilnInstanceId === ownerInstanceId);
    const furnaceJob = targetState.arcFurnaceJobs?.find((job) => job.furnaceInstanceId === ownerInstanceId);
    const inProgressMaterial = kilnJob
      ? getSmeltedLiquidMaterial(kilnJob.material)
      : furnaceJob?.material ?? null;
    const selectedMaterial = inProgressMaterial
      && liquids.some(({ material }) => material === inProgressMaterial)
      ? inProgressMaterial
      : liquids.at(-1).material;

    // One physical smelter can only have one liquid material in its outlet.
    // Keep the most recent material for malformed/legacy queues, rather than
    // letting an older tile's output be consumed first after a move or reload.
    liquids.filter(({ material }) => material === selectedMaterial).forEach((liquidMetal) => {
      targetState.moltenCopper.push({
        ...liquidMetal,
        kilnInstanceId: ownerInstanceId,
        smelterInstanceId: ownerInstanceId,
      });
    });
  });
}

function recoverRetiredConveyorSlots(targetState) {
  // Four-stack saves keep slot zero in the original cargo fields. Return only
  // the retired extra slots to inventory, retaining ammo composition/damage.
  const extraSlots = isSaveRecord(targetState.extraConveyorItems)
    ? targetState.extraConveyorItems
    : {};
  Object.values(extraSlots).forEach((slots) => {
    if (!Array.isArray(slots)) {
      return;
    }
    slots.slice(1).forEach((item) => {
      const quantity = Number(item?.quantity);
      if (!item || !Number.isFinite(quantity) || quantity <= 0) {
        return;
      }
      if (item.kind === "material" && typeof item.material === "string"
        && isObtainableMaterial(item.material)) {
        targetState.stockpile[item.material] = Number(
          ((targetState.stockpile[item.material] ?? 0) + quantity).toPrecision(12),
        );
      } else if (item.kind === "ammo") {
        targetState.ammoStacks.push({ ...item, count: quantity });
      }
    });
  });
  targetState.ammoStacks = normalizeAmmoStacks(targetState.ammoStacks);
  delete targetState.extraConveyorItems;
  delete targetState.storageOutputTimers;
  delete targetState.storageOutputNextLanes;
  const cargo = [
    ...targetState.placedConveyors.map(({ item }) => item),
    ...Object.values(targetState.fixedConveyorItems),
    ...Object.values(targetState.internalConveyorItems),
  ];
  cargo.filter(Boolean).forEach((item) => {
    delete item.beltEntryDirection;
  });
  if (targetState.dusterJob?.source === "conveyor"
    && !cargo.some((item) => item?.dusterAssigned)) {
    targetState.dusterJob = null;
  }
  // An already-started parallel furnace batch keeps its paid-for output, but
  // the remaining cycles now take their original, sequential processing time.
  targetState.arcFurnaceJobs.forEach((job) => {
    const batchCount = Number(job.batchCount);
    const inputCount = Number(job.inputCount);
    if (Number.isFinite(batchCount) && batchCount > 1
      && Number.isFinite(inputCount) && inputCount > 0) {
      job.secondsRemaining = Math.max(0, Number(job.secondsRemaining) || 0)
        + inputCount * 2 * (1 - 1 / batchCount);
    }
    delete job.batchCount;
  });
}

function hydrateSavedState(savedState) {
  if (!isSaveRecord(savedState)) {
    return null;
  }

  const initialState = createInitialState();
  const savedMachines = Array.isArray(savedState.machines) ? savedState.machines : [];
  const usedInstanceIds = new Set();
  const machines = savedMachines
    .map((machine, index) => ({ machine, index, type: resolveSavedMachineType(machine) }))
    .filter(({ type }) => type !== null)
    .map(({ machine, index, type }) => {
      const savedInstanceId = typeof machine.instanceId === "string" && machine.instanceId.length > 0
        ? machine.instanceId
        : `restored-${type}-${index + 1}`;
      const instanceId = usedInstanceIds.has(savedInstanceId)
        ? `restored-${type}-${index + 1}`
        : savedInstanceId;
      usedInstanceIds.add(instanceId);
      return {
        id: type,
        instanceId,
        ...MACHINE_LAYOUT[type],
        column: Number.isInteger(machine.column) ? machine.column : MACHINE_LAYOUT[type].column,
        row: Number.isInteger(machine.row) ? machine.row : MACHINE_LAYOUT[type].row,
        orientation: machine.orientation ?? MACHINE_LAYOUT[type].orientation,
        mode: type === "miniElectricArcFurnace"
          ? normalizeArcFurnaceMode(machine.mode ?? MACHINE_LAYOUT[type].mode)
          : type === "gearPress"
            ? getGearPressMode(machine)
            : type === "hotFluidPipe" ? getHotFluidPipeMode(machine) : machine.mode ?? MACHINE_LAYOUT[type].mode,
        turnSide: machine.turnSide === "right" ? "right" : "left",
        metalInputFlipped: type === "contactMaker" && machine.metalInputFlipped === true,
        pipeNextOutputIndex: Math.max(0, Math.floor(Number(machine.pipeNextOutputIndex) || 0)),
        pipeFlowCredit: 0,
        stackSize: machine.stackSize ?? MACHINE_LAYOUT[type].stackSize,
        splitterNextOutputIndex: type === "splitter"
          ? ((Math.floor(Number(machine.splitterNextOutputIndex) || 0) % 3) + 3) % 3
          : undefined,
      };
    });
  const machineInventoryInstances = (Array.isArray(savedState.machineInventoryInstances)
    ? savedState.machineInventoryInstances
    : [])
    .map((machine, index) => ({ machine, index, type: resolveSavedMachineType(machine) }))
    .filter(({ type }) => type !== null)
    .map(({ machine, index, type }) => {
      const savedInstanceId = typeof machine.instanceId === "string" && machine.instanceId.length > 0
        ? machine.instanceId
        : `restored-inventory-${type}-${index + 1}`;
      let instanceId = savedInstanceId;
      let suffix = index + 1;
      while (usedInstanceIds.has(instanceId)) {
        instanceId = `restored-inventory-${type}-${suffix}`;
        suffix += 1;
      }
      usedInstanceIds.add(instanceId);
      return {
        id: type,
        instanceId,
        ...MACHINE_LAYOUT[type],
        column: Number.isInteger(machine.column) ? machine.column : MACHINE_LAYOUT[type].column,
        row: Number.isInteger(machine.row) ? machine.row : MACHINE_LAYOUT[type].row,
        orientation: machine.orientation ?? MACHINE_LAYOUT[type].orientation,
        mode: type === "miniElectricArcFurnace"
          ? normalizeArcFurnaceMode(machine.mode ?? MACHINE_LAYOUT[type].mode)
          : type === "gearPress"
            ? getGearPressMode(machine)
            : type === "hotFluidPipe" ? getHotFluidPipeMode(machine) : machine.mode ?? MACHINE_LAYOUT[type].mode,
        turnSide: machine.turnSide === "right" ? "right" : "left",
        metalInputFlipped: type === "contactMaker" && machine.metalInputFlipped === true,
        pipeNextOutputIndex: Math.max(0, Math.floor(Number(machine.pipeNextOutputIndex) || 0)),
        pipeFlowCredit: 0,
        stackSize: machine.stackSize ?? MACHINE_LAYOUT[type].stackSize,
        splitterNextOutputIndex: type === "splitter"
          ? ((Math.floor(Number(machine.splitterNextOutputIndex) || 0) % 3) + 3) % 3
          : undefined,
      };
    });

  const hydratedState = {
    ...initialState,
    ...savedState,
    cheatPanelUnlocked: savedState.cheatPanelUnlocked === true,
    playtestCheats: Object.fromEntries(Object.keys(PLAYTEST_CHEAT_DEFAULTS).map((id) => (
      [id, savedState.playtestCheats?.[id] === true]
    ))),
    machines,
    nextMachineInstanceId: Number.isInteger(savedState.nextMachineInstanceId)
      ? Math.max(1, savedState.nextMachineInstanceId)
      : initialState.nextMachineInstanceId,
    machineInventory: {
      ...initialState.machineInventory,
      ...(isSaveRecord(savedState.machineInventory) ? savedState.machineInventory : {}),
    },
    machineInventoryInstances,
    placedConveyors: Array.isArray(savedState.placedConveyors) ? savedState.placedConveyors : [],
    fixedConveyorItems: {
      ...initialState.fixedConveyorItems,
      ...(isSaveRecord(savedState.fixedConveyorItems) ? savedState.fixedConveyorItems : {}),
    },
    internalConveyorItems: isSaveRecord(savedState.internalConveyorItems)
      ? savedState.internalConveyorItems
      : {},
    tutorial: {
      ...initialState.tutorial,
      ...(isSaveRecord(savedState.tutorial) ? savedState.tutorial : {}),
    },
    stockpile: {
      ...initialState.stockpile,
      ...(isSaveRecord(savedState.stockpile) ? savedState.stockpile : {}),
      graphite: Number.isFinite(savedState.stockpile?.graphite)
        ? savedState.stockpile.graphite
        : initialState.stockpile.graphite,
    },
    diamondFragments: Math.max(0, Number(savedState.diamondFragments) || 0),
    crew: {
      ...initialState.crew,
      ...(isSaveRecord(savedState.crew) ? savedState.crew : {}),
    },
    kilnInputs: Array.isArray(savedState.kilnInputs)
      ? savedState.kilnInputs
      : (isSaveRecord(savedState.kilnInput) ? [savedState.kilnInput] : []),
    kilnJobs: Array.isArray(savedState.kilnJobs)
      ? savedState.kilnJobs
      : (isSaveRecord(savedState.kilnJob) ? [savedState.kilnJob] : []),
    contactMakerInputs: isSaveRecord(savedState.contactMakerInputs)
      ? Object.fromEntries(Object.entries(savedState.contactMakerInputs).map(([instanceId, inputs]) => {
        if (!isSaveRecord(inputs)) {
          return [instanceId, inputs];
        }
        const normalizedInputs = { ...inputs };
        delete normalizedInputs.fiber;
        return [instanceId, normalizedInputs];
      }))
      : {},
    arcFurnaceInputs: isSaveRecord(savedState.arcFurnaceInputs)
      ? savedState.arcFurnaceInputs
      : {},
    arcFurnaceJobs: Array.isArray(savedState.arcFurnaceJobs)
      ? savedState.arcFurnaceJobs
      : [],
    arcFurnaceOutputBuffers: isSaveRecord(savedState.arcFurnaceOutputBuffers)
      ? savedState.arcFurnaceOutputBuffers
      : {},
    casingMachineInputs: isSaveRecord(savedState.casingMachineInputs)
      ? savedState.casingMachineInputs
      : {},
    stackerBuffers: isSaveRecord(savedState.stackerBuffers)
      ? savedState.stackerBuffers
      : {},
    gearPressInputs: isSaveRecord(savedState.gearPressInputs)
      ? Object.fromEntries(Object.entries(savedState.gearPressInputs).filter(([, input]) => (
        isSaveRecord(input)
          && PLATE_MATERIALS.includes(input.material)
          && Number.isFinite(input.quantity) && input.quantity > 0
          && Number.isFinite(input.totalValue) && input.totalValue >= 0
          && Number.isFinite(input.totalBaseValue) && input.totalBaseValue >= 0
      )))
      : {},
    aggregateMixerInputs: normalizeAggregateMixerInputs(savedState.aggregateMixerInputs),
    aggregateMixerJobs: isSaveRecord(savedState.aggregateMixerJobs)
      ? Object.fromEntries(Object.entries(savedState.aggregateMixerJobs).filter(([, job]) =>
        isSaveRecord(job) && Number.isFinite(job.secondsRemaining) && job.secondsRemaining >= 0)) : {},
    aggregateMixerOutputs: isSaveRecord(savedState.aggregateMixerOutputs)
      ? Object.fromEntries(Object.entries(savedState.aggregateMixerOutputs).filter(([, quantity]) =>
        Number.isFinite(quantity) && quantity >= 0)) : {},
    mine: {
      ...initialState.mine,
      ...(isSaveRecord(savedState.mine) ? savedState.mine : {}),
      selectedAmmoByGun: {
        ...initialState.mine.selectedAmmoByGun,
        ...(isSaveRecord(savedState.mine?.selectedAmmoByGun)
          ? savedState.mine.selectedAmmoByGun
          : {}),
      },
      completedRegularLayersByTunnel: {
        ...initialState.mine.completedRegularLayersByTunnel,
        ...(isSaveRecord(savedState.mine?.completedRegularLayersByTunnel)
          ? savedState.mine.completedRegularLayersByTunnel
          : { 1: savedState.mine?.completedRegularLayers ?? 0 }),
      },
      completedBandsByTunnel: {
        ...initialState.mine.completedBandsByTunnel,
        ...(isSaveRecord(savedState.mine?.completedBandsByTunnel)
          ? savedState.mine.completedBandsByTunnel
          : { 1: savedState.mine?.completedBands ?? 0 }),
      },
      tunnelProgress: isSaveRecord(savedState.mine?.tunnelProgress)
        ? savedState.mine.tunnelProgress
        : {},
      autoDrillMode: AUTO_DRILL_MODES.includes(savedState.mine?.autoDrillMode)
        ? savedState.mine.autoDrillMode
        : savedState.mine?.autoDrillEnabled
          ? "afterOres"
          : "off",
      gunSchedulingUnlocked: Boolean(savedState.mine?.gunSchedulingUnlocked),
      gunScheduleEnabledByTunnel: {
        ...initialState.mine.gunScheduleEnabledByTunnel,
        ...(isSaveRecord(savedState.mine?.gunScheduleEnabledByTunnel)
          ? savedState.mine.gunScheduleEnabledByTunnel
          : {}),
      },
      gunSchedulesByTunnel: normalizeGunScheduleMap(savedState.mine?.gunSchedulesByTunnel),
      gunScheduleRuntimeByTunnel: normalizeGunScheduleRuntimeMap(savedState.mine?.gunScheduleRuntimeByTunnel),
      realityShield: {
        ...initialState.mine.realityShield,
        ...(isSaveRecord(savedState.mine?.realityShield) ? savedState.mine.realityShield : {}),
        ores: Array.isArray(savedState.mine?.realityShield?.ores)
          ? savedState.mine.realityShield.ores
          : [],
      },
    },
    drill: {
      ...initialState.drill,
      ...(isSaveRecord(savedState.drill) ? savedState.drill : {}),
    },
    ammoStacks: Array.isArray(savedState.ammoStacks)
      ? normalizeAmmoStacks(savedState.ammoStacks)
      : [],
    deposits: Array.isArray(savedState.deposits) ? savedState.deposits : initialState.deposits,
    moltenCopper: Array.isArray(savedState.moltenCopper) ? savedState.moltenCopper : [],
    molderJobs: Array.isArray(savedState.molderJobs)
      ? savedState.molderJobs
      : (isSaveRecord(savedState.molderJob) ? [savedState.molderJob] : []),
    molderClayBuffers: isSaveRecord(savedState.molderClayBuffers)
      ? Object.fromEntries(Object.entries(savedState.molderClayBuffers).map(([instanceId, quantity]) => (
        [instanceId, Number.isFinite(Number(quantity)) ? Math.max(0, Number(quantity)) : 0]
      )))
      : {},
    molderOutputBuffers: isSaveRecord(savedState.molderOutputBuffers)
      ? savedState.molderOutputBuffers
      : {},
    logs: Array.isArray(savedState.logs) ? savedState.logs : initialState.logs,
  };

  delete hydratedState.stockpile[REALITY_SHIELD_CROSSHAIR_TYPE];
  delete hydratedState.mine.autoDrillEnabled;
  hydratedState.deposits = hydratedState.deposits.filter((deposit) => (
    deposit?.type !== REALITY_SHIELD_CROSSHAIR_TYPE
  ));

  // Existing saves predate the drill persistence fix. Grant the currently
  // available Cast Iron Drill to the only existing save line, including any
  // saved tunnel snapshots.
  if (!DRILL_UPGRADES[hydratedState.drill.upgradeId]
    || (hydratedState.drill.upgradeId === "basic" && !hydratedState.cheatPanelUnlocked)) {
    hydratedState.drill.upgradeId = "castIron";
  }
  Object.values(hydratedState.mine.tunnelProgress).forEach((progress) => {
    if (isSaveRecord(progress) && isSaveRecord(progress.drill)) {
      if (!DRILL_UPGRADES[progress.drill.upgradeId]
        || (progress.drill.upgradeId === "basic" && !hydratedState.cheatPanelUnlocked)) {
        progress.drill.upgradeId = "castIron";
      }
    }
  });

  // Drill heads are global progression, not tunnel-local equipment. Older
  // saves can contain tunnel snapshots made before the latest upgrade.
  const savedDrillUpgradeIds = [
    hydratedState.drill.upgradeId,
    ...Object.values(hydratedState.mine.tunnelProgress).map((progress) => progress?.drill?.upgradeId),
  ];
  const sharedDrillUpgradeId = savedDrillUpgradeIds.reduce(
    (best, upgradeId) => getHigherDrillUpgradeId(best, upgradeId),
    "basic",
  );
  hydratedState.drill.upgradeId = sharedDrillUpgradeId;
  Object.values(hydratedState.mine.tunnelProgress).forEach((progress) => {
    if (isSaveRecord(progress) && isSaveRecord(progress.drill)) {
      progress.drill.upgradeId = sharedDrillUpgradeId;
    }
  });

  if (savedState.cashEconomyVersion !== CONFIG.cashEconomyVersion) {
    hydratedState.cash = (Number(hydratedState.cash) || 0) / 10;
    const scaleStampedCashValues = (value) => {
      if (Array.isArray(value)) {
        value.forEach(scaleStampedCashValues);
        return;
      }
      if (!isSaveRecord(value)) {
        return;
      }
      Object.entries(value).forEach(([key, child]) => {
        if (["saleValueBase", "saleValueBonus", "sourceValue"].includes(key)
          && Number.isFinite(child)) {
          value[key] = child / 10;
        } else {
          scaleStampedCashValues(child);
        }
      });
    };
    scaleStampedCashValues(hydratedState);
    hydratedState.cashEconomyVersion = CONFIG.cashEconomyVersion;
  }

  // A cheat battle is deliberately never resumed from a save. Its temporary
  // state must not leak Diamond-Tipped Drill access into ordinary mining.
  if (hydratedState.mine.realityShield.temporaryBattle) {
    hydratedState.mine.realityShield.active = false;
    hydratedState.mine.realityShield.temporaryBattle = false;
    hydratedState.mine.realityShield.ores = [];
    hydratedState.mine.realityShield.refreshTimer = CONFIG.realityShieldInitialIntervalSeconds;
    hydratedState.mine.realityShield.refreshIntervalSeconds = CONFIG.realityShieldInitialIntervalSeconds;
  }

  if (savedState.factoryLayoutVersion !== FACTORY_LAYOUT_VERSION) {
    hydratedState.machines = hydratedState.machines.map((machine) => ({
      ...machine,
      column: machine.column + FACTORY_STARTER_COLUMN_OFFSET,
    }));
    hydratedState.placedConveyors = hydratedState.placedConveyors.map((conveyor) => ({
      ...conveyor,
      column: conveyor.column + FACTORY_STARTER_COLUMN_OFFSET,
    }));
    hydratedState.fixedConveyorItems = Object.fromEntries(
      Object.entries(hydratedState.fixedConveyorItems).map(([key, item]) => {
        const [column, row] = key.split(":").map(Number);
        const shiftedColumn = column < FACTORY_STARTER_COLUMN_OFFSET
          ? column + FACTORY_STARTER_COLUMN_OFFSET
          : column;
        return [`${shiftedColumn}:${row}`, item];
      }),
    );
    hydratedState.factoryLayoutVersion = FACTORY_LAYOUT_VERSION;
  }

  hydratedState.kilnJob = null;
  hydratedState.molderJob = null;
  const firstKilnInstanceId = hydratedState.machines.find((machine) => machine.id === "clayKiln")?.instanceId;
  hydratedState.kilnJobs = hydratedState.kilnJobs.map((job) => ({
    ...job,
    kilnInstanceId: job.kilnInstanceId ?? firstKilnInstanceId,
  })).filter((job) => job.kilnInstanceId);
  const firstMolderInstanceId = hydratedState.machines.find((machine) => machine.id === "ingotMolder")?.instanceId;
  hydratedState.molderJobs = hydratedState.molderJobs.map((job) => ({
    ...job,
    molderInstanceId: job.molderInstanceId ?? firstMolderInstanceId,
  })).filter((job) => job.molderInstanceId);
  Object.entries(hydratedState.molderClayBuffers).forEach(([instanceId, quantity]) => {
    if (!hydratedState.machines.some((machine) => (
      machine.id === "ingotMolder" && machine.instanceId === instanceId
    ))) {
      hydratedState.stockpile.clay += quantity;
      delete hydratedState.molderClayBuffers[instanceId];
    }
  });

  // Ceramic used to be routed through the Ingot Molder while the recipe was
  // still provisional. Convert that stale representation into a solid output
  // buffer (or stockpile it if its originating furnace no longer exists).
  const preserveLegacyCeramic = (furnaceInstanceId, quantity = 1) => {
    if (!furnaceInstanceId
      || !hydratedState.machines.some((machine) => machine.instanceId === furnaceInstanceId)) {
      hydratedState.stockpile.ceramic += quantity;
      return;
    }
    const existing = hydratedState.arcFurnaceOutputBuffers[furnaceInstanceId];
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    hydratedState.arcFurnaceOutputBuffers[furnaceInstanceId] = {
      kind: "material",
      material: "ceramic",
      quantity,
      dusted: false,
    };
  };
  hydratedState.moltenCopper = hydratedState.moltenCopper.filter((liquidMetal) => {
    if (liquidMetal.material !== "ceramic") {
      return true;
    }
    preserveLegacyCeramic(
      liquidMetal.smelterInstanceId ?? liquidMetal.kilnInstanceId,
      liquidMetal.quantity ?? 1,
    );
    return false;
  });
  hydratedState.molderJobs = hydratedState.molderJobs.filter((job) => {
    if (job.material !== "ceramic") {
      return true;
    }
    preserveLegacyCeramic(job.kilnInstanceId, job.quantity ?? 1);
    return false;
  });
  Object.entries(hydratedState.molderOutputBuffers).forEach(([molderInstanceId, item]) => {
    if (item?.material !== "ceramic") {
      return;
    }
    hydratedState.stockpile.ceramic += item.quantity ?? 1;
    delete hydratedState.molderOutputBuffers[molderInstanceId];
  });

  if (hydratedState.mine.completedBandsByTunnel[1] >= 1
    && hydratedState.mine.miningRightsPurchased
    && !hydratedState.mine.unlockedTunnels.includes(2)) hydratedState.mine.unlockedTunnels.push(2);
  if (hydratedState.mine.completedBandsByTunnel[2] >= 5) {
    hydratedState.mine.autoProgressionUnlocked = true;
  }
  if (hydratedState.mine.completedBandsByTunnel[2] >= 5) {
    hydratedState.mine.autoRemineUnlocked = true;
  }
  if (hydratedState.mine.completedBandsByTunnel[1] >= 1) hydratedState.mine.autoDrillUnlocked = true;
  if (hydratedState.mine.completedBandsByTunnel[1] >= 20) {
    hydratedState.mine.rapidfireGunMk1Unlocked = true;
    hydratedState.mine.buckshotGunUnlocked = true;
    hydratedState.mine.gunSchedulingUnlocked = true;
  }
  if (hydratedState.mine.buckshotGunPurchased) {
    hydratedState.mine.rapidfireGunMk1Unlocked = true;
    hydratedState.mine.rapidfireGunMk1Purchased = true;
  }
  if (hydratedState.mine.rapidfireGunMk1Purchased) {
    hydratedState.mine.rapidfireGunMk1Unlocked = true;
  }
  if (!hydratedState.mine.buckshotGunPurchased) {
    hydratedState.mine.selectedGun = "rapidfire";
  } else if (!["rapidfire", "buckshot"].includes(hydratedState.mine.selectedGun)) {
    hydratedState.mine.selectedGun = "rapidfire";
  }
  if (!isSaveRecord(savedState.mine?.selectedAmmoByGun)) {
    const selectedGunType = hydratedState.mine.selectedGun === "buckshot" ? "buckshot" : "rapidfire";
    hydratedState.mine.selectedAmmoByGun[selectedGunType] = {
      material: hydratedState.mine.selectedAmmoMaterial ?? "leek",
      casingMaterial: hydratedState.mine.selectedAmmoCasingMaterial ?? null,
      jacketMaterial: hydratedState.mine.selectedAmmoJacketMaterial ?? null,
      coreMaterial: hydratedState.mine.selectedAmmoCoreMaterial
        ?? hydratedState.mine.selectedAmmoMaterial
        ?? "leek",
      damage: hydratedState.mine.selectedAmmoDamage == null
        ? null
        : Number(hydratedState.mine.selectedAmmoDamage),
      annealed: hydratedState.mine.selectedAmmoAnnealed === true,
    };
  }
  hydratedState.mine.selectedAmmoGunType = GUN_IDS.includes(savedState.mine?.selectedAmmoGunType)
    ? savedState.mine.selectedAmmoGunType
    : hydratedState.mine.selectedGun === "buckshot"
      ? "buckshot"
      : "rapidfire";
  if (hydratedState.mine.unlockedTunnels.includes(3)) {
    hydratedState.mine.tunnelThreeRightsPurchased = true;
  }
  migrateLegacyCasingMachineBuffers(hydratedState);
  recoverRetiredConveyorSlots(hydratedState);
  normalizeMoltenMetalQueues(hydratedState);
  return hydratedState;
}

function migrateLegacyCasingMachineBuffers(hydratedState) {
  const legacyBuffers = hydratedState.casingMachineInputs;
  if (!isSaveRecord(legacyBuffers)) {
    delete hydratedState.casingMachineInputs;
    return;
  }

  Object.values(legacyBuffers).forEach((inputState) => {
    if (!isSaveRecord(inputState)) {
      return;
    }

    const ammo = inputState.ammo;
    const ammoQuantity = Number(ammo?.quantity ?? ammo?.count);
    if (ammo?.kind === "ammo" && Number.isFinite(ammoQuantity) && ammoQuantity > 0) {
      const { quantity: _legacyQuantity, ...ammoStack } = ammo;
      const normalizedStack = {
        ...ammoStack,
        count: ammoQuantity,
      };
      hydratedState.ammoStacks = normalizeAmmoStacks([
        ...hydratedState.ammoStacks,
        normalizedStack,
      ]);
    }

    const liquid = inputState.casing;
    const liquidQuantity = Number(liquid?.quantity ?? 1);
    if (!liquid || !Number.isFinite(liquidQuantity) || liquidQuantity <= 0) {
      return;
    }

    const smelterInstanceId = liquid.smelterInstanceId ?? liquid.kilnInstanceId;
    const existingLiquid = hydratedState.moltenCopper.find((candidate) => (
      (candidate.smelterInstanceId ?? candidate.kilnInstanceId) === smelterInstanceId
        && candidate.material === liquid.material
    ));
    if (existingLiquid) {
      existingLiquid.quantity = Number(existingLiquid.quantity ?? 1) + liquidQuantity;
    } else {
      hydratedState.moltenCopper.push({
        ...liquid,
        ...(smelterInstanceId ? { smelterInstanceId, kilnInstanceId: smelterInstanceId } : {}),
        quantity: liquidQuantity,
      });
    }
  });

  delete hydratedState.casingMachineInputs;
}

function loadSavedGame() {
  try {
    const encodedPayload = window.localStorage.getItem(getActiveSaveKey());
    if (!encodedPayload) {
      return null;
    }

    const payload = decodeSavePayload(encodedPayload);
    if (payload?.version !== CONFIG.saveVersion) {
      return null;
    }

    const hadLegacyCasingBuffers = isSaveRecord(payload.state?.casingMachineInputs);
    const hydratedState = hydrateSavedState(payload.state);
    if (hadLegacyCasingBuffers) {
      try {
        window.localStorage.setItem(getActiveSaveKey(), encodeSavePayload({
          version: CONFIG.saveVersion,
          state: hydratedState,
        }));
      } catch {
        // The in-memory migration still succeeds if browser storage is full.
      }
    }
    return hydratedState;
  } catch {
    return null;
  }
}

function getEncodedSaveGame() {
  snapshotCurrentTunnelProgress();
  return encodeSavePayload({
    version: CONFIG.saveVersion,
    state,
  });
}

function snapshotCurrentTunnelProgress() {
  const tunnel = getCurrentTunnel();
  state.mine.tunnelProgress[tunnel] = {
    currentLayer: state.mine.currentLayer,
    isRemine: state.mine.isRemine,
    deposits: JSON.parse(JSON.stringify(state.deposits)),
    drill: { ...state.drill },
    selectedDepositId: state.selectedDepositId,
  };
}

function saveGame() {
  try {
    const encodedPayload = getEncodedSaveGame();
    window.localStorage.setItem(getActiveSaveKey(), encodedPayload);
    return encodedPayload;
  } catch {
    // A blocked or full browser store should not interrupt the prototype.
    return null;
  }
}

