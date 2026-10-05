"use strict";

// Tunable values, material and machine catalogues, and tunnel progression data.

const CONFIG = Object.freeze({
  columns: 10,
  rows: 7,
  autoFirePerSecond: 4,
  planterCycleSeconds: 2,
  maxPlanterQueue: 2,
  defaultConveyorSpeed: 10,
  secondsPerTileAtConveyorSpeedOne: 10,
  firstLayerHitPoints: 100,
  layersPerBand: 10,
  tunnelOneBands: 30,
  tunnelTwoBands: 30,
  tunnelRealityCaps: Object.freeze({ 1: 30, 2: 30, 3: 20 }),
  tunnelTwoFirstLayerHitPoints: 250,
  tunnelTwoBandHitPointsGrowth: 2.5,
  tunnelThreeFirstLayerHitPoints: 1e5,
  realityShieldHitPoints: 1e9,
  realityShieldWaveSize: 20,
  realityShieldInitialIntervalSeconds: 30,
  realityShieldCrosshairDamage: 1e6,
  realityShieldWaveDamage: 1e8,
  realityShieldColumns: 16,
  realityShieldRows: 8,
  postEarlyBandHitPointsGrowth: 1.32,
  layerHitPointsGrowth: 1.05,
  bandHitPointsGrowth: 2,
  bandYieldGrowth: 1.25,
  remineChunkFraction: 1,
  remineHitPointDivisor: 3,
  drillDamagePerSecond: 50,
  firstLayerLimestoneYield: 30,
  limestoneYieldPerBand: 5,
  firstLayerGraniteYield: 40,
  graniteYieldPerBand: 8,
  firstLayerHematiteYield: 20,
  hematiteYieldPerBand: 2,
  startingAmmo: 0,
  startingCrew: 10,
  clayKilnProcessSeconds: 5,
  ingotMolderProcessSeconds: 1,
  simulationFramesPerSecond: 10,
  factoryRenderFramesPerSecond: 10,
  saveKey: "hamster-miners-save",
  saveVersion: 1,
  autosaveSeconds: 2,
  maxLogEntries: 8,
  cashEconomyVersion: 2,
  crewHireBaseCost: 5e3,
  crewHireCostMultiplier: 1.2,
});

const DRILL_UPGRADES = Object.freeze({
  basic: Object.freeze({ id: "basic", label: "Starter Drill", dps: 50, cash: 0 }),
  castIron: Object.freeze({
    id: "castIron",
    label: "Cast Iron Drill Head",
    dps: 300,
    cash: 1e3,
    requires: "basic",
    description: "We’d prefer not to disclose what your first drill was made out of…",
  }),
  wellOiledCrankshaft: Object.freeze({
    id: "wellOiledCrankshaft",
    label: "Well-Oiled Crankshaft",
    dps: 675,
    cash: 1.2e4,
    requires: "castIron",
    description: "Maybe it won't jam every 5 seconds now...",
  }),
  steelDrillHead: Object.freeze({
    id: "steelDrillHead",
    label: "Steel Drill Head",
    dps: 2.5e3,
    cash: 1.2e5,
    requires: "wellOiledCrankshaft",
    description: "We'd prefer not to disclose who's making these drill parts. Better to not incite technological jealousy.",
  }),
  gameController: Object.freeze({
    id: "gameController",
    label: "Game Controller",
    dps: 9001,
    cash: 1.337e6,
    requires: "steelDrillHead",
    description: "Since when were gamer hamsters this good at operating drills?",
  }),
  diamondTipped: Object.freeze({
    id: "diamondTipped",
    label: "Diamond-Tipped Drill",
    dps: 2e6,
    cash: 1e12,
    requires: "gameController",
    requiredDiamondFragments: 3,
    description: "It cuts through reality itself. Unfortunately, reality objects to this.",
  }),
});

const AMMO_ROUNDS_PER_MINERAL = 25;
const AMMO_ROUNDS_PER_OTHER_MATERIAL = 10;
const BUCKSHOT_INPUT_ROUNDS = 25;
const BUCKSHOT_OUTPUT_ROUNDS = 5;
const BUCKSHOT_SEGMENTS_PER_SHOT = 10;
const BUCKSHOT_MAX_HITS_PER_DEPOSIT = 2;
const BUCKSHOT_FIRE_PER_SECOND = 1;
const RAPIDFIRE_MK1_COST = 2.5e5;
const BUCKSHOT_GUN_COST = 5e5;
const GUN_IDS = Object.freeze(["rapidfire", "buckshot"]);
const GUN_SCHEDULE_MAX_STEPS = 8;
const AUTO_DRILL_MODES = Object.freeze(["off", "afterOres", "ignoreOres"]);
const AUTO_DRILL_MODE_LABELS = Object.freeze({
  off: "Off",
  afterOres: "After ores",
  ignoreOres: "Ignore Ores",
});

const MALACHITE_AMMO_DAMAGE = 3;
const LEAD_AMMO_DAMAGE = 5;

const FACTORY_COLUMNS = 50;
const FACTORY_ROWS = 30;
const FACTORY_SELECTION_DRAG_THRESHOLD = 8;
const LEGACY_FACTORY_COLUMNS = 16;
const LEGACY_FACTORY_ROWS = 20;
const FACTORY_STARTER_COLUMN_OFFSET = Math.floor((FACTORY_COLUMNS - LEGACY_FACTORY_COLUMNS) / 2);
const FACTORY_LAYOUT_VERSION = 2;
const FACTORY_GRID_START_ROW = 3;
const FACTORY_TOP_ROWS = 3;
const FACTORY_TILE_SIZE = 32;
const FACTORY_CANVAS_WIDTH = FACTORY_COLUMNS * FACTORY_TILE_SIZE;
const FACTORY_CANVAS_HEIGHT = (FACTORY_ROWS + FACTORY_TOP_ROWS) * FACTORY_TILE_SIZE;
const FACTORY_PAN_MARGIN_TILES = 3;
const FACTORY_PAN_MARGIN = FACTORY_PAN_MARGIN_TILES * FACTORY_TILE_SIZE;
const IS_NODE_TEST_ENVIRONMENT = typeof module !== "undefined" && Boolean(module.exports);
const PLAYTEST_CHEAT_DEFAULTS = Object.freeze({
  drillDpsX10: false,
  materialYieldX10: false,
  productionSpeedX5: false,
  sellValueX10: false,
});

function getFactoryCameraScrollLimits(viewportWidth, viewportHeight, zoom) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const worldLeft = -FACTORY_PAN_MARGIN;
  const worldTop = -FACTORY_PAN_MARGIN;
  const worldRight = FACTORY_CANVAS_WIDTH + FACTORY_PAN_MARGIN;
  const worldBottom = FACTORY_CANVAS_HEIGHT + FACTORY_PAN_MARGIN;
  const visibleWidth = Math.max(0, Number(viewportWidth) || 0) / safeZoom;
  const visibleHeight = Math.max(0, Number(viewportHeight) || 0) / safeZoom;
  const minScrollX = visibleWidth >= worldRight - worldLeft
    ? (worldLeft + worldRight - visibleWidth) / 2
    : worldLeft;
  const minScrollY = visibleHeight >= worldBottom - worldTop
    ? (worldTop + worldBottom - visibleHeight) / 2
    : worldTop;

  return {
    minScrollX,
    maxScrollX: Math.max(minScrollX, worldRight - visibleWidth),
    minScrollY,
    maxScrollY: Math.max(minScrollY, worldBottom - visibleHeight),
  };
}

function clampFactoryCameraScroll(camera, scrollX = camera.scrollX, scrollY = camera.scrollY) {
  const limits = getFactoryCameraScrollLimits(camera.width, camera.height, camera.zoom);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const nextScrollX = clamp(
    Number.isFinite(scrollX) ? scrollX : limits.minScrollX,
    limits.minScrollX,
    limits.maxScrollX,
  );
  const nextScrollY = clamp(
    Number.isFinite(scrollY) ? scrollY : limits.minScrollY,
    limits.minScrollY,
    limits.maxScrollY,
  );

  camera.setScroll(nextScrollX, nextScrollY);
  return { ...limits, scrollX: nextScrollX, scrollY: nextScrollY };
}

function normalizeGunSchedule(schedule) {
  if (!Array.isArray(schedule)) {
    return [];
  }

  return schedule
    .map((step) => ({
      gun: GUN_IDS.includes(step?.gun) ? step.gun : "rapidfire",
      shots: Math.max(1, Math.min(1e6, Math.floor(Number(step?.shots) || 1))),
    }))
    .slice(0, GUN_SCHEDULE_MAX_STEPS);
}

function normalizeGunScheduleMap(schedules) {
  return [1, 2, 3].reduce((map, tunnel) => {
    map[tunnel] = normalizeGunSchedule(schedules?.[tunnel]);
    return map;
  }, {});
}

const REALITY_SHIELD_CROSSHAIR_TYPE = "realityShieldCrosshair";
const QUARTZ_WHEEL_CUTTER_MULTIPLIER = 250;
const QUARTZ_WHEEL_CUTTER_YIELD = 0.4;
const BRONZE_STAMP_MAX_USES = 6;

function isObtainableMaterial(material) {
  return material !== REALITY_SHIELD_CROSSHAIR_TYPE;
}

function normalizeGunScheduleRuntimeMap(runtimes) {
  return [1, 2, 3].reduce((map, tunnel) => {
    const runtime = runtimes?.[tunnel];
    map[tunnel] = {
      stepIndex: Math.max(0, Math.floor(Number(runtime?.stepIndex) || 0)),
      shotsFired: Math.max(0, Math.floor(Number(runtime?.shotsFired) || 0)),
    };
    return map;
  }, {});
}

const RESOURCE_DEFINITIONS = Object.freeze({
  copper: {
    label: "Malachite ore",
    shortLabel: "Cu",
    segments: 3,
    hitPointsPerSegment: 3,
    yield: 2,
    stockpileKey: "copper",
  },
  nativeCopper: {
    label: "Native copper",
    shortLabel: "Cu",
    segments: 3,
    hitPointsPerSegment: 8,
    yield: 2,
    stockpileKey: "nativeCopper",
  },
  clay: {
    label: "Clay",
    shortLabel: "Cl",
    segments: 2,
    hitPointsPerSegment: 2,
    yield: 3,
    stockpileKey: "clay",
  },
  lead: {
    label: "Lead ore",
    shortLabel: "Pb",
    segments: 5,
    hitPointsPerSegment: 10,
    yield: 3,
    stockpileKey: "lead",
  },
  graphite: {
    label: "Graphite",
    shortLabel: "C",
    segments: 6,
    hitPointsPerSegment: 8,
    yield: 2,
    stockpileKey: "graphite",
  },
  quartz: {
    label: "Quartz",
    shortLabel: "Qz",
    segments: 7,
    hitPointsPerSegment: 50,
    yield: 2,
    stockpileKey: "quartz",
  },
  silver: {
    label: "Silver ore",
    shortLabel: "Ag",
    segments: 4,
    hitPointsPerSegment: 50,
    yield: 2,
    stockpileKey: "silver",
  },
  zinc: {
    label: "Zinc ore",
    shortLabel: "Zn",
    // Placeholder durability until Zinc's dedicated node stats are decided.
    segments: 4,
    hitPointsPerSegment: 50,
    yield: 2,
    stockpileKey: "zinc",
  },
  beryl: {
    label: "Beryl",
    shortLabel: "Be",
    segments: 4,
    hitPointsPerSegment: 50,
    yield: 2,
    stockpileKey: "beryl",
  },
  rawAquamarine: {
    label: "Raw aquamarine",
    shortLabel: "Aq",
    segments: 4,
    hitPointsPerSegment: 50,
    yield: 1,
    stockpileKey: "rawAquamarine",
  },
  rawEmerald: {
    label: "Raw emerald",
    shortLabel: "Em",
    segments: 4,
    hitPointsPerSegment: 50,
    yield: 1,
    stockpileKey: "rawEmerald",
  },
  tin: {
    label: "Tin ore",
    shortLabel: "Sn",
    segments: 3,
    hitPointsPerSegment: 100,
    yield: 3,
    stockpileKey: "tin",
  },
  [REALITY_SHIELD_CROSSHAIR_TYPE]: {
    label: "Reality shield crosshair",
    shortLabel: "",
    segments: 1,
    hitPointsPerSegment: 1,
    yield: 0,
    stockpileKey: null,
  },
});

const GEAR_PRESS_MODES = Object.freeze(["heavy", "fine"]);
const GEAR_DEFINITIONS = Object.freeze(Object.fromEntries([
  ["copper", "Copper", 0xc98752],
  ["brittleCopper", "Brittle copper", 0xca8651],
  ["silver", "Silver", 0xd7dce5],
  ["tin", "Tin", 0xc8b49a],
  ["bronze", "Bronze", 0xb87945],
  ["iron", "Iron", 0x85858a],
].flatMap(([metal, label, color]) => GEAR_PRESS_MODES.map((mode) => [
  `${metal}${mode === "heavy" ? "Heavy" : "Fine"}Gear`,
  Object.freeze({
    plateMaterial: `${metal}Plate`,
    mode,
    label: `${label} ${mode === "heavy" ? "Heavy" : "Fine"} Gear`,
    color,
    platesPerGear: mode === "heavy" ? 2 : 0.5,
    weight: mode === "heavy" ? 2 : 0.5,
  }),
]))));
const GEAR_MATERIALS = Object.freeze(Object.keys(GEAR_DEFINITIONS));

const STOCKPILE_LABELS = Object.freeze({
  leek: "Leek",
  copper: "Malachite ore",
  nativeCopper: "Native copper",
  clay: "Clay",
  lead: "Lead ore",
  graphite: "Graphite",
  quartz: "Quartz",
  silver: "Silver ore",
  zinc: "Zinc ore",
  beryl: "Beryl",
  rawAquamarine: "Raw aquamarine",
  rawEmerald: "Raw emerald",
  limestone: "Limestone",
  granite: "Granite",
  hematite: "Hematite ore",
  chert: "Chert",
  kimberlite: "Kimberlite host rock",
  copperIngot: "Copper ingot",
  brittleCopperIngot: "Brittle copper ingot",
  wire: "Copper wire",
  leekFiber: "Leek fiber",
  silverIngot: "Silver ingot",
  copperContactAlloyIngot: "Copper Contact Alloy ingot",
  tinContactAlloyIngot: "Tin Contact Alloy ingot",
  zincIngot: "Zinc ingot",
  contact: "Silver Contact",
  silverCopperContact: "Silver-Copper Contact",
  silverTinContact: "Silver-Tin Contact",
  cutMalachite: "Cut Malachite",
  tin: "Tin ore",
  tinIngot: "Tin ingot",
  bronzeIngot: "Bronze ingot",
  iron: "Iron",
  ironIngot: "Iron ingot",
  ceramic: "Ceramic",
  aggregate: "Aggregate",
  copperPlate: "Copper plate",
  brittleCopperPlate: "Brittle copper plate",
  silverPlate: "Silver plate",
  tinPlate: "Tin plate",
  bronzePlate: "Bronze plate",
  ironPlate: "Iron plate",
  ...Object.fromEntries(Object.entries(GEAR_DEFINITIONS).map(([material, definition]) => [material, definition.label])),
});

const MATERIAL_LABELS = Object.freeze({
  leek: "Leek",
  copper: "Malachite ore",
  nativeCopper: "Native copper",
  clay: "Clay",
  lead: "Lead ore",
  graphite: "Graphite",
  quartz: "Quartz",
  silver: "Silver ore",
  zinc: "Zinc ore",
  beryl: "Beryl",
  rawAquamarine: "Raw aquamarine",
  rawEmerald: "Raw emerald",
  limestone: "Limestone",
  granite: "Granite",
  hematite: "Hematite ore",
  chert: "Chert",
  kimberlite: "Kimberlite host rock",
  copperIngot: "Copper ingot",
  brittleCopperIngot: "Brittle copper ingot",
  wire: "Copper wire",
  leekFiber: "Leek fiber",
  silverIngot: "Silver ingot",
  copperContactAlloy: "Copper Contact Alloy",
  copperContactAlloyIngot: "Copper Contact Alloy ingot",
  tinContactAlloy: "Tin Contact Alloy",
  tinContactAlloyIngot: "Tin Contact Alloy ingot",
  zincIngot: "Zinc ingot",
  contact: "Silver Contact",
  silverCopperContact: "Silver-Copper Contact",
  silverTinContact: "Silver-Tin Contact",
  cutMalachite: "Cut Malachite",
  tin: "Tin ore",
  tinIngot: "Tin ingot",
  bronze: "Bronze",
  bronzeIngot: "Bronze ingot",
  iron: "Iron",
  ironIngot: "Iron ingot",
  ceramic: "Ceramic",
  aggregate: "Aggregate",
  copperPlate: "Copper plate",
  brittleCopperPlate: "Brittle copper plate",
  silverPlate: "Silver plate",
  tinPlate: "Tin plate",
  bronzePlate: "Bronze plate",
  ironPlate: "Iron plate",
  ...Object.fromEntries(Object.entries(GEAR_DEFINITIONS).map(([material, definition]) => [material, definition.label])),
});

const MATERIAL_COLORS = Object.freeze({
  leek: 0x9fd35d,
  copper: 0x58be89,
  nativeCopper: 0xb87333,
  clay: 0xc6a16b,
  lead: 0x5f6872,
  graphite: 0x4d4d58,
  quartz: 0xd7d2c8,
  silver: 0xbfc7d5,
  zinc: 0xa7b8c2,
  beryl: 0x8ed3c7,
  rawAquamarine: 0x79cfe0,
  rawEmerald: 0x3eaa68,
  limestone: 0xb8b6a3,
  granite: 0x8b8f98,
  hematite: 0x8b514a,
  chert: 0x77736b,
  kimberlite: 0x53434f,
  copperIngot: 0xc98752,
  brittleCopperIngot: 0xca8651,
  wire: 0xd8a45e,
  leekFiber: 0xb6c86e,
  silverIngot: 0xd7dce5,
  copperContactAlloy: 0xc5b49d,
  copperContactAlloyIngot: 0xc5b49d,
  tinContactAlloy: 0xb8c3c4,
  tinContactAlloyIngot: 0xb8c3c4,
  contact: 0xd7dce5,
  silverCopperContact: 0xc5b49d,
  silverTinContact: 0xb8c3c4,
  zincIngot: 0xb6c8d0,
  cutMalachite: 0x45b995,
  tin: 0xb8a99a,
  tinIngot: 0xc8b49a,
  bronze: 0xb87945,
  bronzeIngot: 0xb87945,
  iron: 0x85858a,
  ironIngot: 0x85858a,
  ceramic: 0xd8c9ac,
  aggregate: 0x96917e,
  copperPlate: 0xc98752,
  brittleCopperPlate: 0xca8651,
  silverPlate: 0xd7dce5,
  tinPlate: 0xc8b49a,
  bronzePlate: 0xb87945,
  ironPlate: 0x85858a,
  ...Object.fromEntries(Object.entries(GEAR_DEFINITIONS).map(([material, definition]) => [material, definition.color])),
});

const ORE_CHUNK_MATERIALS = Object.freeze([
  "copper", "nativeCopper", "clay", "lead", "graphite", "quartz", "silver", "zinc", "beryl", "rawAquamarine", "rawEmerald", "tin", "hematite",
]);
const ORE_START_BANDS = Object.freeze({
  copper: 1,
  nativeCopper: 1,
  clay: 1,
  lead: 5,
  graphite: 4,
  quartz: 2,
  silver: 10,
  zinc: 25,
  beryl: 25,
  rawAquamarine: 25,
  rawEmerald: 25,
  tin: 10,
});
const INGOT_MATERIALS = Object.freeze(["copperIngot", "brittleCopperIngot"]);
const SMELTABLE_INGOT_MATERIALS = Object.freeze([
  ...INGOT_MATERIALS,
  "silverIngot",
  "copperContactAlloyIngot",
  "tinContactAlloyIngot",
  "tinIngot",
  "zincIngot",
  "bronzeIngot",
  "ironIngot",
]);
const PLATE_MATERIALS = Object.freeze([
  "copperPlate",
  "brittleCopperPlate",
  "silverPlate",
  "tinPlate",
  "bronzePlate",
  "ironPlate",
]);

function getFactoryMaterialVisualKind(material) {
  if (Object.hasOwn(GEAR_DEFINITIONS, material)) {
    return "gear";
  }
  if (ORE_CHUNK_MATERIALS.includes(material)) {
    return "ore";
  }
  if (SMELTABLE_INGOT_MATERIALS.includes(material)) {
    return "ingot";
  }
  if (PLATE_MATERIALS.includes(material)) {
    return "plate";
  }
  if (material === "wire") {
    return "wire";
  }
  return "square";
}

const INGOT_TO_PLATE = Object.freeze({
  copperIngot: "copperPlate",
  brittleCopperIngot: "brittleCopperPlate",
  silverIngot: "silverPlate",
  tinIngot: "tinPlate",
  bronzeIngot: "bronzePlate",
  ironIngot: "ironPlate",
});
const LOW_MELTING_METAL_ORES = Object.freeze(["copper", "nativeCopper", "lead", "silver", "tin", "zinc"]);
const KILN_INPUT_MATERIALS = Object.freeze([
  ...LOW_MELTING_METAL_ORES,
  ...SMELTABLE_INGOT_MATERIALS,
]);
const ARC_FURNACE_ORE_INPUTS = Object.freeze(["hematite", "clay"]);
const MOLDER_METAL_ORES = Object.freeze([
  "copper", "nativeCopper", "silver", "tin", "zinc", "bronze", "iron",
  "copperContactAlloy", "tinContactAlloy",
]);
const SELL_TUBE_MACHINE_IDS = Object.freeze(["sellTube", "graphiteLacedSellTube"]);
const SELL_TUBE_VALUE_MULTIPLIERS = Object.freeze({
  sellTube: 1,
  graphiteLacedSellTube: 1.25,
});

const AMMO_MATERIALS = Object.freeze(["leek"]);
const LIQUID_METAL_AMMO_MATERIALS = Object.freeze(["copper", "lead"]);
const AMMO_SELECTOR_MATERIALS = Object.freeze(["leek", "copper"]);
const CASING_MATERIALS = Object.freeze(["bronzeIngot", "brassIngot", "steelIngot"]);
const LIQUID_CASING_MATERIALS = Object.freeze(["bronze", "brass", "steel"]);
const CASING_MATERIAL_LABELS = Object.freeze({
  bronzeIngot: "Bronze",
  brassIngot: "Brass",
  steelIngot: "Steel",
});
const CASING_MACHINE_MODES = Object.freeze(["penetratingRapidfire", "buckshot"]);
const CASING_DAMAGE_MULTIPLIERS = Object.freeze({
  bronze: 3,
});
const BUCKSHOT_DAMAGE_MULTIPLIER = 0.5;
const NONE_CASING_VALUE = "__none_casing__";
const NONE_JACKET_VALUE = "__none__";
const AMMO_CORE_LABELS = Object.freeze({
  leek: "Leek",
  copper: "Malachite",
  lead: "Lead",
});

const SELL_VALUES = Object.freeze({
  copper: 0.5,
  nativeCopper: 0.5,
  clay: 0.1,
  silver: 8.5,
});

const MINIMUM_SALE_VALUES = Object.freeze({
  ...SELL_VALUES,
  copperIngot: 2,
  brittleCopperIngot: 2,
  copperContactAlloyIngot: 27.6,
  tinContactAlloyIngot: 30.6,
  contact: 8.8,
  silverCopperContact: 8.8,
  silverTinContact: 8.8,
  wire: 1,
  cutMalachite: 125,
  ...Object.fromEntries(Object.entries(GEAR_DEFINITIONS).map(([material, definition]) => [
    material,
    ({ copperPlate: 2, brittleCopperPlate: 2, silverPlate: SELL_VALUES.silver * 4 }[definition.plateMaterial] ?? 0)
      * definition.platesPerGear,
  ])),
});

const CONTACT_MAKER_METAL_INPUTS = Object.freeze([
  Object.freeze({
    material: "silverIngot",
    quantityKey: "silver",
    valueKey: "silverValue",
    outputMaterial: "contact",
    valueMultiplier: 2,
    ingotsPerBatch: 0.5,
  }),
  Object.freeze({
    material: "copperContactAlloyIngot",
    quantityKey: "copperAlloy",
    valueKey: "copperAlloyValue",
    outputMaterial: "silverCopperContact",
    valueMultiplier: 3,
    ingotsPerBatch: 0.5,
  }),
  Object.freeze({
    material: "tinContactAlloyIngot",
    quantityKey: "tinAlloy",
    valueKey: "tinAlloyValue",
    outputMaterial: "silverTinContact",
    valueMultiplier: 3,
    ingotsPerBatch: 0.5,
  }),
]);
const CONTACT_PRODUCT_MATERIALS = Object.freeze([
  "contact",
  "silverCopperContact",
  "silverTinContact",
]);

const SALE_VALUE_MULTIPLIERS = Object.freeze({
  brittleCopperIngot: Object.freeze({ baseMaterial: "copper", multiplier: 4 }),
});

const DUSTER_SELL_MULTIPLIER = 1.25;
const DUSTER_INELIGIBLE_MATERIALS = Object.freeze(["cutMalachite"]);
const ROCK_SHACK_VALUE_BONUS = 0.2;
const ROCK_SHACK_VALUE_CAP = 1.5;
const PRIMITIVE_UPGRADER_VALUE_BONUS = 0.5;
const PRIMITIVE_UPGRADER_MIN_BASE_VALUE = 1;
const PRIMITIVE_UPGRADER_MAX_VALUE = 15;
const ANNEALER_MULTIPLIER = 1.7;
const ANNEALER_VALUE_MATERIALS = Object.freeze([
  "wire",
  ...Object.values(INGOT_TO_PLATE),
  ...CONTACT_PRODUCT_MATERIALS,
]);
const GRANITE_PROCESSOR_MULTIPLIER = 1.3;
const GRANITE_PROCESSOR_MIN_BASE_VALUE = 1;
const GRANITE_PROCESSOR_MIN_VALUE = 10;
const GRANITE_PROCESSOR_MAX_VALUE = 50;
const BRONZE_STAMP_VALUE_BONUS = 100;
const BRONZE_STAMP_MIN_BASE_VALUE = 8;
const BRONZE_STAMP_MIN_VALUE = 150;
const BRONZE_PILLARS_MULTIPLIER = 1.4;
const BRONZE_PILLARS_MAX_USES = 1;
const BRONZE_PILLARS_MIN_BASE_VALUE = 20;
const BRONZE_PILLARS_MAX_VALUE = 5e4;
const CASH_UPGRADER_ELIGIBILITY_TAGS = Object.freeze([
  "bronzeStampUses",
  "bronzePillarsUses",
]);

function getCashUpgraderEligibilityTags(item) {
  if (item?.kind !== "material" || !isSellableMaterial(item.material, item)) {
    return {};
  }

  return CASH_UPGRADER_ELIGIBILITY_TAGS.reduce((tags, tag) => {
    if (Number.isInteger(item[tag]) && item[tag] > 0) {
      tags[tag] = item[tag];
    }
    return tags;
  }, {});
}

function resetCashUpgraderEligibilityOnMaterialChange(item, sourceMaterial, wasSellable) {
  if (!wasSellable || item?.kind !== "material" || item.material === sourceMaterial) {
    return;
  }

  CASH_UPGRADER_ELIGIBILITY_TAGS.forEach((tag) => {
    delete item[tag];
  });
}

function restoreCashUpgraderEligibilityForSameProduct(item, sourceMaterial, tags) {
  if (sourceMaterial !== item?.material || item?.kind !== "material") {
    return;
  }

  CASH_UPGRADER_ELIGIBILITY_TAGS.forEach((tag) => {
    if (Number.isInteger(tags?.[tag]) && tags[tag] > 0) {
      item[tag] = tags[tag];
    }
  });
}

function getBaseAmmoDamage(material) {
  if (material === "leek") {
    return 1;
  }
  return material === "lead" ? LEAD_AMMO_DAMAGE : MALACHITE_AMMO_DAMAGE;
}

function getAmmoCoreLabel(material) {
  return AMMO_CORE_LABELS[material] ?? MATERIAL_LABELS[material] ?? material;
}

function getJacketedAmmoDamage(coreMaterial, jacketMaterial, annealed = false) {
  const damage = (getBaseAmmoDamage(coreMaterial) * getBaseAmmoDamage(jacketMaterial)) ** 0.85;
  return annealed ? damage * ANNEALER_MULTIPLIER : damage;
}

function getCasingDamageMultiplier(casingMaterial) {
  return CASING_DAMAGE_MULTIPLIERS[casingMaterial] ?? 1;
}

function getCasedAmmoDamage(stack) {
  const annealed = stack.annealed === true;
  const coreMaterial = stack.coreMaterial ?? stack.material;
  const uncasedDamage = stack.jacketMaterial
    ? getJacketedAmmoDamage(coreMaterial, stack.jacketMaterial, annealed)
    : getBaseAmmoDamage(stack.material) * (annealed && stack.material !== "leek"
      ? ANNEALER_MULTIPLIER
      : 1);
  const casingDamage = uncasedDamage * getCasingDamageMultiplier(stack.casingMaterial);
  return stack.type === "buckshot" && stack.casingMaterial
    ? casingDamage * BUCKSHOT_DAMAGE_MULTIPLIER
    : casingDamage;
}

function getCasingMachineMode(machine) {
  return CASING_MACHINE_MODES.includes(machine?.mode) ? machine.mode : "buckshot";
}

function switchCasingMachineMode(machine, mode) {
  if (!machine || machine.id !== "casingMachine" || !CASING_MACHINE_MODES.includes(mode)) {
    return false;
  }
  if (getCasingMachineMode(machine) === mode) {
    return false;
  }

  machine.mode = mode;
  addLog(`Casing Machine switched to ${mode === "buckshot" ? "Buckshot" : "Penetrating rapidfire"} mode.`);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function normalizeAmmoStack(stack) {
  const annealed = stack.annealed === true;
  const damage = getCasedAmmoDamage({ ...stack, annealed });
  return {
    ...stack,
    type: stack.type ?? "rapidfire",
    damage,
    annealed,
  };
}

function getAmmoStackIdentity(stack) {
  return [
    stack.type,
    stack.material,
    stack.coreMaterial ?? stack.material,
    stack.casingMaterial ?? "",
    stack.jacketMaterial ?? "",
    stack.damage,
    stack.annealed === true,
  ].join("|");
}

function normalizeAmmoStacks(stacks) {
  const merged = [];
  const byIdentity = new Map();
  stacks.forEach((stack) => {
    const normalized = normalizeAmmoStack(stack);
    const identity = getAmmoStackIdentity(normalized);
    const existing = byIdentity.get(identity);
    if (existing) {
      existing.count += normalized.count;
    } else {
      const copy = { ...normalized };
      byIdentity.set(identity, copy);
      merged.push(copy);
    }
  });
  return merged;
}

function isSellableMaterial(material, item = null) {
  return Object.hasOwn(GEAR_DEFINITIONS, material)
    || (MINIMUM_SALE_VALUES[material] ?? 0) > 0
    || Number.isFinite(item?.saleValueBase) && item.saleValueBase > 0;
}

const MACHINE_PURCHASES = Object.freeze({
  conveyor: { cash: 100, materials: { limestone: 20, graphite: 1, wire: 10 } },
  leekDuster: { cash: 0, materials: { leek: 1 } },
  primitiveUpgrader: { cash: 45, materials: { leek: 10, clay: 10 } },
  rockShack: { cash: 2.5, materials: { limestone: 25 } },
  clayKiln: { cash: 10, materials: { clay: 25 } },
  ingotMolder: { cash: 5, materials: { clay: 5 } },
  refractoryCaster: {
    cash: 1.5e6,
    materials: { ironIngot: 50, ironPlate: 25, ceramic: 25 },
  },
  graphiteCopperAnnealer: { cash: 700, materials: { granite: 150, copperIngot: 20, wire: 50 } },
  graniteProcessor: { cash: 150, materials: { granite: 80, limestone: 120 } },
  bronzeStamp: { cash: 2.5e4, materials: { bronzePlate: 4, copperIngot: 20, wire: 50, contact: 20 } },
  bronzePillars: { cash: 1e5, materials: { bronzePlate: 20, bronzeIngot: 80, limestone: 400 } },
  extruder: { cash: 1250, materials: { granite: 100, copperIngot: 15, graphite: 10 } },
  leekFiberExtractor: { cash: 2500, materials: { limestone: 50, copperIngot: 5, wire: 10 } },
  contactMaker: { cash: 1.8e4, materials: { granite: 80, leekFiber: 100, copperIngot: 20, graphite: 25, wire: 100 } },
  jacketFormer: { cash: 1e4, materials: { limestone: 500, copperIngot: 50, graphite: 25, wire: 100 } },
  miniElectricArcFurnace: {
    cash: 1e5,
    materials: { graphite: 30, copperIngot: 15, wire: 100, contact: 50 },
  },
  metalPress: {
    cash: 5e4,
    materials: { bronzeIngot: 20, graphite: 50, limestone: 100, wire: 50 },
  },
  gearPress: {
    cash: 4e5,
    materials: { ironIngot: 100, ironPlate: 50, wire: 100 },
  },
  aggregateMixer: {
    cash: 8e5,
    materials: { ironHeavyGear: 50, ironPlate: 100, ceramic: 50, wire: 150 },
  },
  hotFluidPipe: {
    cash: 2.5e4,
    materials: { ceramic: 2, ironIngot: 2, tinIngot: 1, aggregate: 5 },
  },
  stacker: {
    cash: 2e3,
    materials: { bronzePlate: 5, wire: 10, contact: 10 },
  },
  splitter: {
    cash: 2e3,
    materials: { bronzePlate: 5, wire: 10, contact: 10 },
  },
  casingMachine: {
    cash: 4.5e5,
    materials: { ceramic: 40, bronzePlate: 20, wire: 100 },
  },
  graphiteLacedSellTube: {
    cash: 2e3,
    materials: { graphite: 20, leekFiber: 50, copperIngot: 10 },
  },
  materialStorage: {
    cash: 5e3,
    materials: { limestone: 500, leek: 100, leekFiber: 100, copperIngot: 50 },
  },
  quartzWheelCutter: {
    cash: 6e5,
    materials: { quartz: 200, ironIngot: 500, ironPlate: 300 },
  },
});

const MACHINE_CATEGORY_ORDER = Object.freeze(["cash", "material", "ammo", "logistics"]);
const MACHINE_CATEGORY_LABELS = Object.freeze({
  cash: "Cash",
  material: "Material",
  ammo: "Ammo",
  logistics: "Logistics",
});
const MACHINE_CATEGORY_BY_ID = Object.freeze({
  sellTube: "cash",
  graphiteLacedSellTube: "cash",
  leekDuster: "cash",
  primitiveUpgrader: "cash",
  rockShack: "cash",
  graniteProcessor: "cash",
  bronzeStamp: "cash",
  bronzePillars: "cash",
  planter: "material",
  clayKiln: "material",
  ingotMolder: "material",
  refractoryCaster: "material",
  extruder: "material",
  leekFiberExtractor: "material",
  contactMaker: ["material", "cash"],
  miniElectricArcFurnace: "material",
  metalPress: "material",
  gearPress: "material",
  aggregateMixer: "material",
  ammoShaper: "ammo",
  jacketFormer: "ammo",
  casingMachine: "ammo",
  graphiteCopperAnnealer: ["ammo", "cash"],
  quartzWheelCutter: ["material", "cash"],
  gun: "ammo",
  conveyor: "logistics",
  materialStorage: "logistics",
  stacker: "logistics",
  splitter: "logistics",
  hotFluidPipe: "logistics",
});

function getMachineCategory(machineId) {
  const categories = MACHINE_CATEGORY_BY_ID[machineId];
  return Array.isArray(categories) ? categories[0] : categories ?? "material";
}

function getMachineCategories(machineId) {
  const categories = MACHINE_CATEGORY_BY_ID[machineId];
  return Array.isArray(categories)
    ? categories
    : [categories ?? "material"];
}

function machineBelongsToCategory(machineId, category) {
  return getMachineCategories(machineId).includes(category);
}

const MACHINE_LAYOUT = Object.freeze({
  planter: {
    column: 6,
    row: 10,
    width: 3,
    height: 3,
    orientation: "up",
    // HM Machines.xlsx shows this right-facing: core/output cell, then one belt cell.
    internalConveyors: [
      { column: 1, row: 1, direction: "right" },
      { column: 2, row: 1, direction: "right" },
    ],
    processLaneIndex: 0,
    movable: true,
  },
  ammoShaper: {
    column: 6,
    row: 5,
    width: 3,
    height: 3,
    orientation: "up",
    // HM Machines.xlsx shows this right-facing: input belt, core-casting tile, output belt.
    internalConveyors: [
      { column: 0, row: 1, direction: "right" },
      { column: 1, row: 1, direction: "right" },
      { column: 2, row: 1, direction: "right" },
    ],
    // Liquid metal may enter through either side-center port and is cast on
    // the existing middle transformer tile.
    liquidInputs: [
      { column: 1, row: 0, direction: "down" },
      { column: 1, row: 2, direction: "up" },
    ],
    processLaneIndex: 1,
    movable: true,
  },
  jacketFormer: {
    width: 3,
    height: 3,
    orientation: "up",
    internalConveyors: [
      { column: 0, row: 1, direction: "right" },
      { column: 1, row: 1, direction: "right" },
      { column: 2, row: 1, direction: "right" },
    ],
    liquidInputs: [
      { column: 1, row: 0, direction: "down" },
      { column: 1, row: 2, direction: "up" },
    ],
    processLaneIndex: 1,
    movable: true,
  },
  materialStorage: {
    column: 1,
    row: 6,
    width: 4,
    height: 4,
    movable: true,
  },
  quartzWheelCutter: {
    width: 4,
    height: 5,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 1, direction: "right", speed: 1 },
      { column: 1, row: 1, direction: "right", speed: 1 },
      { column: 2, row: 1, direction: "right", speed: 1 },
      { column: 3, row: 1, direction: "right", speed: 1 },
      { column: 0, row: 3, direction: "right", speed: 1 },
      { column: 1, row: 3, direction: "right", speed: 1 },
      { column: 2, row: 3, direction: "right", speed: 1 },
      { column: 3, row: 3, direction: "right", speed: 1 },
    ],
    processLaneIndexes: [3, 7],
    movable: true,
  },
  sellTube: {
    width: 2,
    height: 2,
    orientation: "right",
    inputTiles: [
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 },
    ],
    movable: true,
  },
  graphiteLacedSellTube: {
    width: 2,
    height: 2,
    orientation: "right",
    inputTiles: [
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 },
    ],
    movable: true,
  },
  leekDuster: {
    width: 1,
    height: 1,
    orientation: "right",
    upgradeOrigin: { column: 0, row: 0 },
    movable: true,
  },
  primitiveUpgrader: {
    width: 1,
    height: 2,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 0, direction: "right", speed: 4 },
      { column: 0, row: 1, direction: "right", speed: 4 },
    ],
    movable: true,
  },
  rockShack: {
    width: 1,
    height: 2,
    orientation: "right",
    // The upper tile is a built-in conveyor; the lower tile is the shack itself.
    internalConveyors: [
      { column: 0, row: 0, direction: "right" },
    ],
    movable: true,
  },
  clayKiln: {
    width: 1,
    height: 3,
    orientation: "right",
    input: { column: 0, row: 1 },
    // The kiln has one central input tile and one liquid outlet directly on its facing side.
    liquidOutput: { column: 0, row: 1, direction: "right" },
    movable: true,
  },
  ingotMolder: {
    width: 1,
    height: 2,
    orientation: "right",
    clayInput: { column: 0, row: 0, direction: "down" },
    // The one marked Input/Output tile carries the completed ingot onward.
    internalConveyors: [
      { column: 0, row: 1, direction: "right" },
    ],
    liquidInputOutput: { column: 0, row: 1, direction: "right" },
    movable: true,
  },
  refractoryCaster: {
    width: 2,
    height: 2,
    orientation: "right",
    // The top row is machine body; the lower row has a liquid input and
    // four-ingot output lane.
    internalConveyors: [
      { column: 1, row: 1, direction: "right" },
    ],
    liquidInput: { column: 0, row: 1, direction: "right" },
    movable: true,
  },
  graphiteCopperAnnealer: {
    width: 3,
    height: 3,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 1, direction: "right", speed: 2 },
      { column: 1, row: 1, direction: "up", speed: 2 },
      { column: 1, row: 0, direction: "up", speed: 2 },
    ],
    processLaneIndex: 2,
    movable: true,
  },
  graniteProcessor: {
    width: 1,
    height: 2,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 0, direction: "right" },
      { column: 0, row: 1, direction: "right" },
    ],
    movable: true,
  },
  bronzeStamp: {
    width: 1,
    height: 3,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 1, direction: "right", speed: 5 },
    ],
    processLaneIndex: 0,
    movable: true,
  },
  bronzePillars: {
    width: 3,
    height: 3,
    orientation: "right",
    occupiedTiles: [
      { column: 2, row: 0 },
      { column: 1, row: 1 },
      { column: 0, row: 2 },
    ],
    // The central X is the upgrader's pass-through tile. It uses the default
    // conveyor speed because no custom speed was specified for this machine.
    internalConveyors: [
      { column: 1, row: 1, direction: "right" },
    ],
    processLaneIndex: 0,
    movable: true,
  },
  extruder: {
    width: 3,
    height: 1,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 0, direction: "right" },
      { column: 1, row: 0, direction: "right" },
      { column: 2, row: 0, direction: "right" },
    ],
    processLaneIndex: 1,
    mode: "wire",
    movable: true,
  },
  leekFiberExtractor: {
    width: 2,
    height: 2,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 1, direction: "right" },
      { column: 1, row: 1, direction: "right" },
    ],
    processLaneIndex: 1,
    movable: true,
  },
  contactMaker: {
    width: 4,
    height: 3,
    orientation: "right",
    metalInputFlipped: false,
    internalConveyors: [
      { column: 0, row: 1, direction: "right", speed: 5 },
      { column: 1, row: 1, direction: "right", speed: 5 },
      { column: 2, row: 1, direction: "right", speed: 5 },
      { column: 3, row: 1, direction: "right", speed: 5 },
    ],
    silverInput: { column: 1, row: 2, direction: "up" },
    processLaneIndex: 1,
    movable: true,
  },
  miniElectricArcFurnace: {
    width: 3,
    height: 3,
    orientation: "right",
    mode: "smelting",
    internalConveyors: [
      { column: 0, row: 1, direction: "right", arcFurnaceSlot: "primary" },
      { column: 1, row: 0, direction: "down", arcFurnaceSlot: "secondary" },
      { column: 1, row: 2, direction: "up", arcFurnaceSlot: "tertiary" },
    ],
    liquidOutput: { column: 2, row: 1, direction: "right" },
    movable: true,
  },
  metalPress: {
    width: 2,
    height: 3,
    orientation: "right",
    internalConveyors: [
      { column: 0, row: 1, direction: "right", speed: 5 },
      { column: 1, row: 1, direction: "right", speed: 5 },
    ],
    processLaneIndex: 1,
    movable: true,
  },
  gearPress: {
    width: 2,
    height: 3,
    orientation: "right",
    mode: "heavy",
    internalConveyors: [
      { column: 0, row: 1, direction: "right", speed: 5 },
      { column: 1, row: 1, direction: "right", speed: 5 },
    ],
    processLaneIndex: 1,
    movable: true,
  },
  stacker: {
    width: 1,
    height: 1,
    orientation: "right",
    stackSize: 1,
    movable: true,
  },
  aggregateMixer: {
    width: 4,
    height: 3,
    orientation: "right",
    materialInputs: [{ column: 0, row: 0 }, { column: 0, row: 2 }],
    internalConveyors: [{ column: 3, row: 1, direction: "right" }],
    movable: true,
  },
  hotFluidPipe: {
    width: 1,
    height: 1,
    orientation: "right",
    mode: "straight",
    turnSide: "left",
    movable: true,
  },
  splitter: {
    width: 1,
    height: 1,
    orientation: "right",
    splitterNextOutputIndex: 0,
    movable: true,
  },
  casingMachine: {
    width: 3,
    height: 3,
    orientation: "up",
    mode: "buckshot",
    // Ammo physically crosses input, transformer, and output tiles; linked
    // casing liquid is consumed only when its transformer stack advances.
    internalConveyors: [
      { column: 0, row: 1, direction: "right", casingMachineSlot: "input" },
      { column: 1, row: 1, direction: "right", casingMachineSlot: "process" },
      { column: 2, row: 1, direction: "right" },
    ],
    liquidInputs: [
      { column: 1, row: 0, direction: "down" },
      { column: 1, row: 2, direction: "up" },
    ],
    processLaneIndex: 1,
    movable: true,
  },
  gunDeposit: {
    column: 6,
    row: 3,
    width: 4,
    height: 1,
    input: { column: 7, row: 3 },
    movable: false,
  },
  gun: {
    column: 6,
    row: 0,
    width: 4,
    height: 3,
    movable: false,
  },
});

const FIXED_CONVEYORS = Object.freeze([
  { column: 7 + FACTORY_STARTER_COLUMN_OFFSET, row: 4, direction: "up" },
]);

const STARTER_ROUTE_CONVEYORS = Object.freeze([
  { column: 7 + FACTORY_STARTER_COLUMN_OFFSET, row: 9, direction: "up" },
  { column: 7 + FACTORY_STARTER_COLUMN_OFFSET, row: 8, direction: "up" },
]);

const CONVEYOR_ORIENTATIONS = Object.freeze(["up", "right", "down", "left"]);

const DIRECTION_VECTORS = Object.freeze({
  up: { column: 0, row: -1 },
  right: { column: 1, row: 0 },
  down: { column: 0, row: 1 },
  left: { column: -1, row: 0 },
});

const INITIAL_DEPOSITS = Object.freeze([
  { cell: 3, type: "copper" },
  { cell: 8, type: "clay" },
  { cell: 15, type: "clay" },
  { cell: 20, type: "clay" },
  { cell: 27, type: "copper" },
  { cell: 34, type: "copper" },
  { cell: 41, type: "clay" },
  { cell: 46, type: "clay" },
  { cell: 52, type: "clay" },
  { cell: 56, type: "copper" },
  { cell: 60, type: "clay" },
  { cell: 64, type: "clay" },
]);

const EARLY_TUNNEL_ONE_DEPOSITS = Object.freeze([
  { cell: 3, type: "copper" },
  { cell: 8, type: "clay" },
  { cell: 20, type: "clay" },
  { cell: 34, type: "copper" },
  { cell: 46, type: "clay" },
  { cell: 60, type: "clay" },
]);

// Later tunnel milestones can add a pool here without changing the layer loop.
const TUNNEL_ONE_SPAWN_POOLS = Object.freeze([
  { startsAtBand: 1, deposits: EARLY_TUNNEL_ONE_DEPOSITS },
  { startsAtBand: 3, deposits: INITIAL_DEPOSITS },
  {
    startsAtBand: 5,
    deposits: Object.freeze([
      { cell: 2, type: "clay" },
      { cell: 7, type: "clay" },
      { cell: 14, type: "clay" },
      { cell: 19, type: "clay" },
      { cell: 25, type: "clay" },
      { cell: 31, type: "copper" },
      { cell: 38, type: "copper" },
      { cell: 44, type: "copper" },
      { cell: 53, type: "copper" },
      { cell: 46, type: "lead" },
      { cell: 56, type: "lead" },
      { cell: 64, type: "lead" },
    ]),
  },
  {
    startsAtBand: 10,
    deposits: Object.freeze([
      { cell: 2, type: "clay" },
      { cell: 7, type: "clay" },
      { cell: 14, type: "clay" },
      { cell: 19, type: "copper" },
      { cell: 25, type: "copper" },
      { cell: 31, type: "copper" },
      { cell: 38, type: "copper" },
      { cell: 44, type: "lead" },
      { cell: 53, type: "lead" },
      { cell: 61, type: "lead" },
      { cell: 64, type: "lead" },
      { cell: 46, type: "silver" },
      { cell: 56, type: "silver" },
    ]),
  },
  {
    startsAtBand: 16,
    deposits: Object.freeze([
      { cell: 2, type: "clay" },
      { cell: 7, type: "copper" },
      { cell: 14, type: "copper" },
      { cell: 19, type: "copper" },
      { cell: 25, type: "copper" },
      { cell: 31, type: "lead" },
      { cell: 38, type: "lead" },
      { cell: 44, type: "lead" },
      { cell: 53, type: "silver" },
      { cell: 61, type: "silver" },
      { cell: 64, type: "silver" },
    ]),
  },
  {
    startsAtBand: 20,
    deposits: Object.freeze([
      { cell: 2, type: "copper" },
      { cell: 7, type: "copper" },
      { cell: 14, type: "copper" },
      { cell: 19, type: "copper" },
      { cell: 25, type: "lead" },
      { cell: 31, type: "lead" },
      { cell: 38, type: "lead" },
      { cell: 44, type: "silver" },
      { cell: 53, type: "silver" },
      { cell: 61, type: "silver" },
      { cell: 64, type: "silver" },
    ]),
  },
  {
    startsAtBand: 24,
    deposits: Object.freeze([
      { cell: 2, type: "copper" },
      { cell: 7, type: "copper" },
      { cell: 14, type: "lead" },
      { cell: 19, type: "lead" },
      { cell: 25, type: "silver" },
      { cell: 31, type: "silver" },
      { cell: 38, type: "silver" },
      { cell: 44, type: "zinc" },
      { cell: 53, type: "zinc" },
    ]),
  },
]);

const TUNNEL_TWO_DEPOSITS = Object.freeze([
  { cell: 2, type: "nativeCopper" },
  { cell: 7, type: "clay" },
  { cell: 14, type: "nativeCopper" },
  { cell: 19, type: "clay" },
  { cell: 25, type: "nativeCopper" },
  { cell: 31, type: "clay" },
  { cell: 38, type: "nativeCopper" },
  { cell: 44, type: "clay" },
  { cell: 53, type: "nativeCopper" },
  { cell: 61, type: "clay" },
]);

const TUNNEL_TWO_SPAWN_POOLS = Object.freeze([
  { startsAtBand: 1, deposits: TUNNEL_TWO_DEPOSITS },
  {
    startsAtBand: 4,
    deposits: Object.freeze([
      { cell: 2, type: "clay" },
      { cell: 7, type: "clay" },
      { cell: 14, type: "clay" },
      { cell: 19, type: "clay" },
      { cell: 25, type: "nativeCopper" },
      { cell: 31, type: "nativeCopper" },
      { cell: 38, type: "nativeCopper" },
      { cell: 44, type: "nativeCopper" },
      { cell: 53, type: "graphite" },
      { cell: 61, type: "graphite" },
    ]),
  },
  {
    startsAtBand: 10,
    deposits: Object.freeze([
      { cell: 2, type: "clay" },
      { cell: 7, type: "clay" },
      { cell: 14, type: "nativeCopper" },
      { cell: 19, type: "nativeCopper" },
      { cell: 25, type: "nativeCopper" },
      { cell: 31, type: "nativeCopper" },
      { cell: 38, type: "graphite" },
      { cell: 44, type: "graphite" },
      { cell: 53, type: "graphite" },
      { cell: 61, type: "tin" },
      { cell: 64, type: "tin" },
    ]),
  },
  {
    startsAtBand: 15,
    deposits: Object.freeze([
      { cell: 2, type: "nativeCopper" },
      { cell: 7, type: "nativeCopper" },
      { cell: 14, type: "nativeCopper" },
      { cell: 19, type: "nativeCopper" },
      { cell: 25, type: "graphite" },
      { cell: 31, type: "graphite" },
      { cell: 38, type: "graphite" },
      { cell: 44, type: "tin" },
      { cell: 53, type: "tin" },
      { cell: 61, type: "tin" },
      { cell: 64, type: "tin" },
    ]),
  },
  {
    startsAtBand: 25,
    deposits: Object.freeze([
      { cell: 2, type: "nativeCopper" },
      { cell: 7, type: "nativeCopper" },
      { cell: 14, type: "nativeCopper" },
      { cell: 19, type: "nativeCopper" },
      { cell: 25, type: "graphite" },
      { cell: 31, type: "graphite" },
      { cell: 38, type: "graphite" },
      { cell: 44, type: "tin" },
      { cell: 53, type: "tin" },
      { cell: 61, type: "tin" },
      { cell: 64, type: "tin" },
      { cell: 46, type: "beryl" },
      { cell: 56, type: "beryl" },
      { cell: 60, type: "beryl" },
      { cell: 3, type: "rawAquamarine", chance: 1 },
      { cell: 60, type: "rawEmerald", chance: 0.2 },
    ]),
  },
]);

const TUNNEL_THREE_CHERT_DEPOSITS = Object.freeze([
  { cell: 5, type: "quartz" },
  { cell: 18, type: "quartz" },
  { cell: 31, type: "quartz" },
  { cell: 44, type: "quartz" },
  { cell: 57, type: "quartz" },
]);

function getBandForLayer(layerNumber) {
  return Math.floor((layerNumber - 1) / CONFIG.layersPerBand) + 1;
}

function getLayerNumberInBand(layerNumber) {
  return ((layerNumber - 1) % CONFIG.layersPerBand) + 1;
}

function getTunnelLayerLimit(tunnel = 1) {
  return CONFIG.layersPerBand * (CONFIG.tunnelRealityCaps[tunnel] ?? 0);
}

function getCurrentTunnel() {
  return [1, 2, 3].includes(state?.mine?.currentTunnel) ? state.mine.currentTunnel : 1;
}

function getHostRockMaterial(
  tunnel = getCurrentTunnel(),
  band = getBandForLayer(state?.mine?.currentLayer ?? 1),
  layerNumber = state?.mine?.currentLayer ?? 1,
) {
  const finalBand = CONFIG.tunnelRealityCaps[tunnel] ?? 0;
  if (band >= finalBand) {
    return "kimberlite";
  }
  return tunnel === 3
    ? getTunnelLayerFormation(layerNumber, tunnel)
    : tunnel === 2
      ? "granite"
      : "limestone";
}

function getHostRockYield(tunnel = getCurrentTunnel(), band = 1) {
  const normalizedBand = Math.max(1, Math.floor(band));
  if (tunnel === 3) {
    if (normalizedBand >= (CONFIG.tunnelRealityCaps[tunnel] ?? 0)
      || normalizedBand % 2 === 0) {
      return 0;
    }
    return CONFIG.firstLayerHematiteYield
      + CONFIG.hematiteYieldPerBand * (normalizedBand - 1);
  }
  return tunnel === 2
    ? CONFIG.firstLayerGraniteYield + CONFIG.graniteYieldPerBand * (normalizedBand - 1)
    : CONFIG.firstLayerLimestoneYield + CONFIG.limestoneYieldPerBand * (normalizedBand - 1);
}

function getTunnelLayerFormation(layerNumber, tunnel = 1) {
  if (tunnel !== 3) {
    return null;
  }
  const band = getBandForLayer(layerNumber);
  if (band >= (CONFIG.tunnelRealityCaps[tunnel] ?? 0)) {
    return "kimberlite";
  }
  return band % 2 === 1 ? "hematite" : "chert";
}

function getCompletedLayersForTunnel(tunnel = getCurrentTunnel()) {
  return state.mine.completedRegularLayersByTunnel?.[tunnel]
    ?? (tunnel === 1 ? state.mine.completedRegularLayers : 0);
}

function getCompletedBandsForTunnel(tunnel = getCurrentTunnel()) {
  return state.mine.completedBandsByTunnel?.[tunnel]
    ?? (tunnel === 1 ? state.mine.completedBands : 0);
}

function syncLegacyMineProgress() {
  const tunnel = getCurrentTunnel();
  state.mine.completedRegularLayers = getCompletedLayersForTunnel(tunnel);
  state.mine.completedBands = getCompletedBandsForTunnel(tunnel);
}

function getLayerStats(layerNumber, tunnel = 1) {
  const band = getBandForLayer(layerNumber);
  const layerInBand = getLayerNumberInBand(layerNumber);
  const firstLayerHitPoints = tunnel === 3
    ? CONFIG.tunnelThreeFirstLayerHitPoints
    : tunnel === 2
      ? CONFIG.tunnelTwoFirstLayerHitPoints
      : CONFIG.firstLayerHitPoints;
  const earlyBandGrowth = tunnel === 2
    ? CONFIG.tunnelTwoBandHitPointsGrowth
    : CONFIG.bandHitPointsGrowth;
  const bandGrowth = tunnel === 3
    ? CONFIG.postEarlyBandHitPointsGrowth ** (band - 1)
    : band <= 5
      ? earlyBandGrowth ** (band - 1)
      : (earlyBandGrowth ** 4) * (CONFIG.postEarlyBandHitPointsGrowth ** (band - 5));
  const hitPoints = Math.ceil(firstLayerHitPoints * bandGrowth * (CONFIG.layerHitPointsGrowth ** (layerInBand - 1)));

  return {
    band,
    layerInBand,
    hitPoints,
    yieldMultiplier: tunnel === 3
      ? 1
      : band <= 5
      ? CONFIG.bandYieldGrowth ** (band - 1)
      : (CONFIG.bandYieldGrowth ** 4) * (1.1 ** (band - 5)),
  };
}

const expandedSpawnPoolCache = new WeakMap();

function getExpandedSpawnPool(pool) {
  const cached = expandedSpawnPoolCache.get(pool);
  if (cached) {
    return cached;
  }

  const totalCells = CONFIG.columns * CONFIG.rows;
  const occupiedCells = new Set(pool.map(({ cell }) => cell));
  const duplicateCells = [];

  pool.forEach((deposit) => {
    // Chance nodes keep their single roll. A 100% Aquamarine roll is therefore
    // guaranteed without being doubled alongside the ordinary deposits.
    if (deposit.chance != null) {
      return;
    }

    // Start opposite the original tile, then walk a coprime stride to keep
    // added nodes scattered and distinct on the 10 × 7 mine grid.
    for (let offset = 0; offset < totalCells; offset += 1) {
      const cell = (deposit.cell + 35 + offset * 17) % totalCells;
      if (!occupiedCells.has(cell)) {
        occupiedCells.add(cell);
        duplicateCells.push({ ...deposit, cell });
        return;
      }
    }
  });

  const expanded = Object.freeze([...pool, ...duplicateCells]);
  expandedSpawnPoolCache.set(pool, expanded);
  return expanded;
}

function getSpawnPoolForBand(band, tunnel = 1) {
  if (tunnel === 3) {
    const isChertBand = band % 2 === 0 && band < CONFIG.tunnelRealityCaps[3];
    return getExpandedSpawnPool(isChertBand ? TUNNEL_THREE_CHERT_DEPOSITS : []);
  }

  const spawnPools = tunnel === 2 ? TUNNEL_TWO_SPAWN_POOLS : TUNNEL_ONE_SPAWN_POOLS;
  let pool = spawnPools[0].deposits;

  spawnPools.forEach((entry) => {
    if (band >= entry.startsAtBand) {
      pool = entry.deposits;
    }
  });

  // Tunnel 1 uses its unexpanded pool from Bands 3–24, cutting the doubled
  // deposit counts in half while leaving early and later progression intact.
  if (tunnel === 1 && band >= 3 && band <= 24) {
    return pool;
  }

  // Tunnel 2's expanded duplicate deposits are removed at every band. Rare
  // chance-based gem deposits are reduced by half as well, including the
  // formerly guaranteed Aquamarine roll.
  if (tunnel === 2) {
    const hasChanceDeposits = pool.some((deposit) => deposit.chance != null);
    return hasChanceDeposits
      ? Object.freeze(pool.map((deposit) => (
        deposit.chance == null ? deposit : { ...deposit, chance: deposit.chance / 2 }
      )))
      : pool;
  }

  return getExpandedSpawnPool(pool);
}

function getDepositYieldMultiplier(type, band, tunnel = 1) {
  const startsAtBand = ORE_START_BANDS[type];
  if (startsAtBand === undefined) {
    return getLayerStats((Math.max(1, band) - 1) * CONFIG.layersPerBand + 1, tunnel).yieldMultiplier;
  }
  if (startsAtBand === 1 && !["lead", "graphite", "silver", "beryl", "rawAquamarine", "rawEmerald"].includes(type)) {
    return getLayerStats((Math.max(1, band) - 1) * CONFIG.layersPerBand + 1, tunnel).yieldMultiplier;
  }
  return 1.1 ** Math.max(0, band - startsAtBand);
}

function getRemineDepositBlueprints(pool, remineIndex) {
  const depositsByType = new Map();
  pool.forEach((deposit) => {
    const deposits = depositsByType.get(deposit.type) ?? [];
    deposits.push(deposit);
    depositsByType.set(deposit.type, deposits);
  });

  const selectedDeposits = new Set();
  depositsByType.forEach((deposits) => {
    const count = Math.floor(deposits.length * CONFIG.remineChunkFraction);
    const offset = count > 0 ? (remineIndex * count) % deposits.length : 0;

    for (let index = 0; index < count; index += 1) {
      selectedDeposits.add(deposits[(offset + index) % deposits.length]);
    }
  });

  return pool.filter((deposit) => selectedDeposits.has(deposit));
}

function createLayerDeposits(layerNumber, { tunnel = 1, isRemine = false, remineIndex = 0 } = {}) {
  const stats = getLayerStats(layerNumber, tunnel);
  const pool = getSpawnPoolForBand(stats.band, tunnel);
  const rolledPool = pool.filter((deposit) => deposit.chance == null || Math.random() < deposit.chance);
  const deposits = isRemine ? getRemineDepositBlueprints(rolledPool, remineIndex) : rolledPool;

  return deposits.map((deposit, index) => createDeposit(
    deposit,
    index,
    getDepositYieldMultiplier(deposit.type, stats.band, tunnel),
  ));
}

