"use strict";

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
  remineChunkFraction: 0.5,
  remineHitPointDivisor: 5,
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
const IS_NODE_TEST_ENVIRONMENT = typeof module !== "undefined" && Boolean(module.exports);
const PLAYTEST_CHEAT_DEFAULTS = Object.freeze({
  drillDpsX10: false,
  materialYieldX10: false,
  productionSpeedX5: false,
  sellValueX10: false,
});

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
  zincIngot: "Zinc ingot",
  contact: "Silver-Copper Contact",
  cutMalachite: "Cut Malachite",
  tin: "Tin ore",
  tinIngot: "Tin ingot",
  bronzeIngot: "Bronze ingot",
  iron: "Iron",
  ironIngot: "Iron ingot",
  ceramic: "Ceramic",
  copperPlate: "Copper plate",
  brittleCopperPlate: "Brittle copper plate",
  silverPlate: "Silver plate",
  tinPlate: "Tin plate",
  bronzePlate: "Bronze plate",
  ironPlate: "Iron plate",
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
  zincIngot: "Zinc ingot",
  contact: "Silver-Copper Contact",
  cutMalachite: "Cut Malachite",
  tin: "Tin ore",
  tinIngot: "Tin ingot",
  bronze: "Bronze",
  bronzeIngot: "Bronze ingot",
  iron: "Iron",
  ironIngot: "Iron ingot",
  ceramic: "Ceramic",
  copperPlate: "Copper plate",
  brittleCopperPlate: "Brittle copper plate",
  silverPlate: "Silver plate",
  tinPlate: "Tin plate",
  bronzePlate: "Bronze plate",
  ironPlate: "Iron plate",
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
  zincIngot: 0xb6c8d0,
  contact: 0xc8b86c,
  cutMalachite: 0x45b995,
  tin: 0xb8a99a,
  tinIngot: 0xc8b49a,
  bronze: 0xb87945,
  bronzeIngot: 0xb87945,
  iron: 0x85858a,
  ironIngot: 0x85858a,
  ceramic: 0xd8c9ac,
  copperPlate: 0xc98752,
  brittleCopperPlate: 0xca8651,
  silverPlate: 0xd7dce5,
  tinPlate: 0xc8b49a,
  bronzePlate: 0xb87945,
  ironPlate: 0x85858a,
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
const MOLDER_METAL_ORES = Object.freeze(["copper", "nativeCopper", "silver", "tin", "zinc", "bronze", "iron"]);
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
  wire: 1,
  cutMalachite: 125,
});

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
  "contact",
]);
const GRANITE_PROCESSOR_MULTIPLIER = 1.3;
const GRANITE_PROCESSOR_MIN_BASE_VALUE = 1;
const GRANITE_PROCESSOR_MIN_VALUE = 10;
const GRANITE_PROCESSOR_MAX_VALUE = 50;
const BRONZE_STAMP_VALUE_BONUS = 100;
const BRONZE_STAMP_MIN_BASE_VALUE = 8;
const BRONZE_STAMP_MIN_VALUE = 150;
const BRONZE_PILLARS_MULTIPLIER = 1.4;
const BRONZE_PILLARS_MAX_USES = 3;
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
  return (MINIMUM_SALE_VALUES[material] ?? 0) > 0
    || Number.isFinite(item?.saleValueBase) && item.saleValueBase > 0;
}

const MACHINE_PURCHASES = Object.freeze({
  conveyor: { cash: 100, materials: { limestone: 20, graphite: 1, wire: 10 } },
  leekDuster: { cash: 0, materials: { leek: 1 } },
  primitiveUpgrader: { cash: 45, materials: { leek: 10, clay: 10 } },
  rockShack: { cash: 2.5, materials: { limestone: 25 } },
  clayKiln: { cash: 10, materials: { clay: 25 } },
  ingotMolder: { cash: 5, materials: { clay: 5 } },
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
  extruder: "material",
  leekFiberExtractor: "material",
  contactMaker: ["material", "cash"],
  miniElectricArcFurnace: "material",
  metalPress: "material",
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
    // The one marked Input/Output tile carries the completed ingot onward.
    internalConveyors: [
      { column: 0, row: 1, direction: "right" },
    ],
    liquidInputOutput: { column: 0, row: 1, direction: "right" },
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
  stacker: {
    width: 1,
    height: 1,
    orientation: "right",
    stackSize: 1,
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
    // The main line carries jacketed ammunition. Casing ingots enter through
    // either side-center casing port and wait until both inputs are present.
    internalConveyors: [
      { column: 0, row: 1, direction: "right", casingMachineSlot: "input" },
      { column: 1, row: 1, direction: "right" },
      { column: 2, row: 1, direction: "right", casingMachineSlot: "process" },
    ],
    liquidInputs: [
      { column: 1, row: 0, direction: "down" },
      { column: 1, row: 2, direction: "up" },
    ],
    processLaneIndex: 2,
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
    startsAtBand: 25,
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
  selectGraphiteCopperAnnealerButton: document.querySelector("#selectGraphiteCopperAnnealerButton"),
  selectGraniteProcessorButton: document.querySelector("#selectGraniteProcessorButton"),
  selectBronzeStampButton: document.querySelector("#selectBronzeStampButton"),
  selectBronzePillarsButton: document.querySelector("#selectBronzePillarsButton"),
  selectExtruderButton: document.querySelector("#selectExtruderButton"),
  selectLeekFiberExtractorButton: document.querySelector("#selectLeekFiberExtractorButton"),
  selectContactMakerButton: document.querySelector("#selectContactMakerButton"),
  selectMiniElectricArcFurnaceButton: document.querySelector("#selectMiniElectricArcFurnaceButton"),
  selectMetalPressButton: document.querySelector("#selectMetalPressButton"),
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
  graphiteCopperAnnealerInventoryCount: document.querySelector("#graphiteCopperAnnealerInventoryCount"),
  graniteProcessorInventoryCount: document.querySelector("#graniteProcessorInventoryCount"),
  bronzeStampInventoryCount: document.querySelector("#bronzeStampInventoryCount"),
  bronzePillarsInventoryCount: document.querySelector("#bronzePillarsInventoryCount"),
  extruderInventoryCount: document.querySelector("#extruderInventoryCount"),
  leekFiberExtractorInventoryCount: document.querySelector("#leekFiberExtractorInventoryCount"),
  contactMakerInventoryCount: document.querySelector("#contactMakerInventoryCount"),
  miniElectricArcFurnaceInventoryCount: document.querySelector("#miniElectricArcFurnaceInventoryCount"),
  metalPressInventoryCount: document.querySelector("#metalPressInventoryCount"),
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

let state = loadSavedGame() ?? createInitialState();
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
      graphiteCopperAnnealer: 0,
      graniteProcessor: 0,
      bronzeStamp: 0,
      bronzePillars: 0,
      extruder: 0,
      leekFiberExtractor: 0,
      contactMaker: 0,
      miniElectricArcFurnace: 0,
      metalPress: 0,
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
      silverIngot: 0,
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
      limestone: 0,
      granite: 0,
      graphite: 0,
      hematite: 0,
      chert: 0,
      iron: 0,
      copperIngot: 0,
      brittleCopperIngot: 0,
      wire: 0,
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
    molderOutputBuffers: {},
    contactMakerInputs: {},
    arcFurnaceInputs: {},
    arcFurnaceJobs: [],
    arcFurnaceOutputBuffers: {},
    casingMachineInputs: {},
    stackerBuffers: {},
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
        mode: type === "miniElectricArcFurnace" && machine.mode === "alloy"
          ? "alloy2"
          : machine.mode ?? MACHINE_LAYOUT[type].mode,
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
        mode: type === "miniElectricArcFurnace" && machine.mode === "alloy"
          ? "alloy2"
          : machine.mode ?? MACHINE_LAYOUT[type].mode,
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
  hydratedState.mine.selectedAmmoGunType = hydratedState.mine.selectedGun === "buckshot"
    ? "buckshot"
    : "rapidfire";
  if (hydratedState.mine.unlockedTunnels.includes(3)) {
    hydratedState.mine.tunnelThreeRightsPurchased = true;
  }
  return hydratedState;
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

    return hydrateSavedState(payload.state);
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
  const port = machine?.[propertyName];
  if (!port) {
    return null;
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

function getMolderKilnLink(molder = getMachine("ingotMolder")) {
  const molderPort = getMachinePort(molder, "liquidInputOutput");
  if (!molderPort || !molderPort.direction) {
    return null;
  }

  return [...getMachines("clayKiln"), ...getMachines("miniElectricArcFurnace")].map((smelter) => {
    const smelterOutput = getMachinePort(smelter, "liquidOutput");
    if (!smelterOutput?.direction || molderPort.direction !== smelterOutput.direction) {
      return null;
    }

    const direction = DIRECTION_VECTORS[smelterOutput.direction];
    return smelterOutput.column + direction.column === molderPort.column
      && smelterOutput.row + direction.row === molderPort.row
      ? { kiln: smelter, kilnOutput: smelterOutput, molderPort }
      : null;
  }).find(Boolean) ?? null;
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

function isSmeltableMetalInput(material) {
  return KILN_INPUT_MATERIALS.includes(material)
    || SMELTABLE_INGOT_MATERIALS.includes(material)
    || ARC_FURNACE_ORE_INPUTS.includes(material);
}

const ARC_FURNACE_RECIPES = Object.freeze({
  alloy2: Object.freeze({
    outputMaterial: "bronze",
    outputQuantity: 6,
    inputCount: 6,
    slots: Object.freeze({
      primary: Object.freeze({ quantity: 5, materials: isCopperAlloyInput }),
      secondary: Object.freeze({ quantity: 1, materials: isTinAlloyInput }),
      tertiary: Object.freeze({ quantity: 1, materials: isTinAlloyInput }),
    }),
    sharedSlots: Object.freeze(["secondary", "tertiary"]),
    sharedQuantity: 1,
  }),
});

const CRAFTING_RECIPES = Object.freeze([
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
    name: "Silver-Copper Contacts",
    machine: "Contact Maker",
    input: "5 Copper Wires + 0.5 Silver Ingots",
    output: "5 Silver-Copper Contacts",
    note: "The contact stack has a base value of $8.8.",
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
    input: "1 Leek + 1 liquid Malachite or Lead",
    output: "25 coated rounds",
    note: "Malachite deals 3 damage; Lead deals 5 damage.",
  }),
  Object.freeze({
    category: "Ammunition",
    name: "Copper-Jacketed Rounds",
    machine: "Jacket Former",
    input: "Mineral-core ammo + liquid Native copper",
    output: "Copper-jacketed ammo",
    note: "Damage follows the core × jacket formula raised to the 0.85 power. The jacket is held until liquid Native copper arrives.",
  }),
  Object.freeze({
    category: "Ammunition",
    name: "Buckshot Rounds",
    machine: "Casing Machine",
    input: "25 jacketed rounds + 1 Bronze, Brass, or Steel ingot",
    output: "5 Buckshot rounds",
    note: "The Buckshot Gun fires one round per second and scatters 10 hits across active ore segments, with no more than 2 pellets landing on one ore.",
  }),
  Object.freeze({
    category: "Low-temperature smelting",
    name: "Liquid Metal",
    machine: "Clay Kiln",
    input: "1 supported low-melting ore or ingot",
    output: "1 liquid metal",
    note: "Uses 2 crew and takes 5 seconds. The liquid output feeds an Ingot Molder or Bullet Core Caster.",
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
    machine: "Mini Electric Arc Furnace · 2-input alloy mode",
    input: "5 Copper + 1 Tin",
    output: "6 liquid Bronze",
    note: "Uses 1 crew and takes 12 seconds; the existing Ingot Molder casts it into Bronze Ingots.",
  }),
  Object.freeze({
    category: "Casting",
    name: "Metal Ingots",
    machine: "Ingot Molder",
    input: "1 supported liquid Copper, Native copper, Silver, Tin, Bronze, or Iron",
    output: "1 matching ingot",
    note: "Uses 1 crew and takes 1 second.",
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
    note: "Each Cut Malachite has ×250 of the input’s current per-item value and ×250 base value. Cut Malachite cannot receive a Leek Duster pass; dust the ore first if desired. Quartz is a construction cost, not a recipe input.",
  }),
]);

function getArcFurnaceMode(furnace) {
  if (furnace?.mode === "alloy") {
    // Saves made before the explicit alloy mode split used this value.
    return "alloy2";
  }
  return ["smelting", "alloy2", "alloy3"].includes(furnace?.mode)
    ? furnace.mode
    : "smelting";
}

function switchArcFurnaceMode(furnace, mode) {
  if (!furnace || furnace.id !== "miniElectricArcFurnace"
    || !["smelting", "alloy2", "alloy3"].includes(mode)) {
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
      (liquidMetal.smelterInstanceId ?? liquidMetal.kilnInstanceId) === furnace.instanceId
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
    (liquidMetal.smelterInstanceId ?? liquidMetal.kilnInstanceId) !== furnace.instanceId
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
  addLog(`Mini Electric Arc Furnace switched to ${mode === "smelting"
    ? "Single smelting"
    : mode === "alloy2" ? "2-input alloy" : "3-input alloy"} mode${losses.length > 0
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

  const copperQuantity = getArcFurnaceInputQuantity(furnace, "primary");
  const tinQuantity = recipe.sharedSlots.reduce(
    (total, slot) => total + getArcFurnaceInputQuantity(furnace, slot),
    0,
  );
  const primary = inputState.primary;
  if (copperQuantity < recipe.slots.primary.quantity || tinQuantity < recipe.sharedQuantity
    || !primary.every((item) => recipe.slots.primary.materials(item.material))
    || !inputState.secondary.concat(inputState.tertiary)
      .every((item) => recipe.slots.secondary.materials(item.material))) {
    return null;
  }

  return {
    inputCount: recipe.inputCount,
    outputMaterial: recipe.outputMaterial,
    outputQuantity: recipe.outputQuantity,
    outputValue: (
      getArcFurnaceInputValueAcrossSlots(inputState, ["primary"], recipe.slots.primary.quantity)
      + getArcFurnaceInputValueAcrossSlots(inputState, recipe.sharedSlots, recipe.sharedQuantity)
    ) / recipe.inputCount,
    consume: () => {
      takeArcFurnaceInputUnits(inputState, "primary", recipe.slots.primary.quantity);
      takeArcFurnaceInputUnitsAcrossSlots(inputState, recipe.sharedSlots, recipe.sharedQuantity);
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

function flushArcFurnaceOutputs() {
  Object.entries(state.arcFurnaceOutputBuffers).forEach(([furnaceInstanceId, item]) => {
    const furnace = getMachineByInstanceId(furnaceInstanceId);
    const outputConveyor = furnace ? getArcFurnaceSolidOutputConveyor(furnace) : null;
    if (!outputConveyor || getConveyorItem(outputConveyor) || !placeItemOnConveyor(outputConveyor, item)) {
      return;
    }

    delete state.arcFurnaceOutputBuffers[furnaceInstanceId];
    addLog(`Mini Electric Arc Furnace output ${MATERIAL_LABELS[item.material] ?? item.material} entered its conveyor.`);
  });
}

function findMoltenCopperIndex(kilnInstanceId) {
  const linkedIndex = state.moltenCopper.findIndex((liquidMetal) => (
    (liquidMetal.smelterInstanceId ?? liquidMetal.kilnInstanceId) === kilnInstanceId
  ));
  if (linkedIndex >= 0) {
    return linkedIndex;
  }

  // Entries from saves created before kiln outputs were tagged can still be
  // consumed by the connected machine.
  return state.moltenCopper.findIndex((liquidMetal) => !liquidMetal.kilnInstanceId);
}

function getBulletCoreCasterKilnLink() {
  const caster = getMachine("ammoShaper");
  if (!caster) {
    return null;
  }

  const casterInputs = getMachinePorts(caster, "liquidInputs");
  return getMachines("clayKiln").map((kiln) => {
    const kilnOutput = getMachinePort(kiln, "liquidOutput");
    if (!kilnOutput?.direction) {
      return null;
    }

    const direction = DIRECTION_VECTORS[kilnOutput.direction];
    const casterInput = casterInputs.find((input) => (
      kilnOutput.column + direction.column === input.column
        && kilnOutput.row + direction.row === input.row
    ));
    return casterInput ? { kiln, kilnOutput, casterInput } : null;
  }).find(Boolean) ?? null;
}

function getJacketFormerKilnLink(jacketFormer = getMachine("jacketFormer")) {
  if (!jacketFormer) {
    return null;
  }

  const jacketFormerInputs = getMachinePorts(jacketFormer, "liquidInputs");
  return getMachines("clayKiln").map((kiln) => {
    const kilnOutput = getMachinePort(kiln, "liquidOutput");
    if (!kilnOutput?.direction) {
      return null;
    }

    const direction = DIRECTION_VECTORS[kilnOutput.direction];
    const jacketFormerInput = jacketFormerInputs.find((input) => (
      kilnOutput.column + direction.column === input.column
        && kilnOutput.row + direction.row === input.row
    ));
    return jacketFormerInput ? { kiln, kilnOutput, jacketFormerInput } : null;
  }).find(Boolean) ?? null;
}

function getCasingMachineSmelterLink(casingMachine = getMachine("casingMachine")) {
  if (!casingMachine) {
    return null;
  }

  const casingInputs = getMachinePorts(casingMachine, "liquidInputs");
  return [...getMachines("clayKiln"), ...getMachines("miniElectricArcFurnace")].map((smelter) => {
    const smelterOutput = getMachinePort(smelter, "liquidOutput");
    if (!smelterOutput?.direction) {
      return null;
    }

    const direction = DIRECTION_VECTORS[smelterOutput.direction];
    const casingInput = casingInputs.find((input) => (
      smelterOutput.column + direction.column === input.column
        && smelterOutput.row + direction.row === input.row
    ));
    return casingInput ? { smelter, smelterOutput, casingInput } : null;
  }).find(Boolean) ?? null;
}

function isBulletCoreCasterLinkedToKiln() {
  return Boolean(getBulletCoreCasterKilnLink());
}

function getBusyCrew() {
  return (state.dusterJob ? 1 : 0)
    + (state.kilnJobs.length * 2)
    + state.molderJobs.length
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
        liquidMetal.kilnInstanceId === machine.instanceId
      )),
    ))
    || (machine?.id === "ingotMolder" && state.molderJobs.some((job) => (
      job.molderInstanceId === machine.instanceId
    )))
    || (machine?.id === "miniElectricArcFurnace" && (
      state.arcFurnaceJobs.some((job) => job.furnaceInstanceId === machine.instanceId)
      || state.moltenCopper.some((liquidMetal) => (
        (liquidMetal.smelterInstanceId ?? liquidMetal.kilnInstanceId) === machine.instanceId
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
  if (!conveyor || getConveyorItem(conveyor)) {
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

  const storage = state.machines.find((machine) => (
    machine.id === "materialStorage" && isTileInsideMachine(column, row, machine)
  ));
  if (storage && item.kind === "material") {
    return true;
  }

  const arcFurnaceInput = getArcFurnaceInputAt(column, row);
  if (arcFurnaceInput && canArcFurnaceAcceptInput(
    arcFurnaceInput.furnace,
    arcFurnaceInput.slot,
    item,
  )) {
    return true;
  }

  const casingInput = getFactoryConveyors()
    .map(({ conveyor }) => conveyor)
    .find((conveyor) => (
      conveyor.column === column
      && conveyor.row === row
      && getCasingMachineInputForConveyor(conveyor)
    ));
  if (casingInput) {
    const { machine } = getCasingMachineInputForConveyor(casingInput);
    return canCasingMachineAcceptAmmoInput(machine, item);
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
  if (silverInputMaker
    && item.kind === "material"
    && item.material === "silverIngot"
    && getContactMakerInputState(silverInputMaker.instanceId).silver
      < getContactMakerInputRequirements(silverInputMaker).silver) {
    return true;
  }

  const sellTubeInput = getSellTubeInputAt(column, row);
  return Boolean(sellTubeInput) && item.kind === "material" && isSellableMaterial(item.material, item);
}

function receiveConveyorItem(item, column, row) {
  if (!canReceiveConveyorItem(item, column, row)) {
    return false;
  }

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

  const casingInput = getFactoryConveyors()
    .map(({ conveyor }) => conveyor)
    .find((conveyor) => (
      conveyor.column === column
      && conveyor.row === row
      && getCasingMachineInputForConveyor(conveyor)
    ));
  if (casingInput) {
    const { machine } = getCasingMachineInputForConveyor(casingInput);
    return receiveCasingMachineItem(machine, item);
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
  if (silverInputMaker
    && item.kind === "material"
    && item.material === "silverIngot"
    && getContactMakerInputState(silverInputMaker.instanceId).silver
      < getContactMakerInputRequirements(silverInputMaker).silver) {
    const current = getContactMakerInputState(silverInputMaker.instanceId);
    const value = getItemSaleValue(item);
    state.contactMakerInputs[silverInputMaker.instanceId] = {
      ...current,
      silver: current.silver + item.quantity,
      silverValue: current.silverValue + value * item.quantity,
    };
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

  const shaper = getMachine("ammoShaper");
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

function getCasingMachineInputForConveyor(conveyor) {
  if (!isInternalConveyor(conveyor) || conveyor.internalMachineId !== "casingMachine") {
    return null;
  }

  const machine = getInternalConveyorMachine(conveyor);
  const input = getInternalConveyorTiles(machine)[conveyor.internalIndex];
  return input?.casingMachineSlot === "input"
    ? { machine, input }
    : null;
}

function getCasingMachineInputState(machine) {
  const existing = state.casingMachineInputs[machine.instanceId];
  if (existing && isSaveRecord(existing)) {
    return existing;
  }

  const inputState = { ammo: null, casing: null };
  state.casingMachineInputs[machine.instanceId] = inputState;
  return inputState;
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
  return canCasingMachineAcceptAmmoInput(machine, item);
}

function canCasingMachineAcceptAmmoInput(machine, item) {
  if (!machine || item?.kind !== "ammo" || !Number.isFinite(item.quantity) || item.quantity < 1) {
    return false;
  }

  const inputState = getCasingMachineInputState(machine);
  return Boolean(
    (item.type === "rapidfire" || item.type == null)
      && item.quantity >= BUCKSHOT_INPUT_ROUNDS
      && !item.casingMaterial
      && (getCasingMachineMode(machine) === "penetratingRapidfire" || isJacketedAmmo(item))
      && !inputState.ammo,
  );
}

function receiveCasingMachineItem(machine, item) {
  if (!canCasingMachineAcceptItem(machine, item)) {
    return false;
  }

  const inputState = getCasingMachineInputState(machine);
  if (item.kind === "ammo") {
    inputState.ammo = { ...item, quantity: item.quantity };
    addLog(`Casing Machine buffered ${formatNumber(item.quantity)} jacketed rounds.`);
  } else {
    inputState.casing = { ...item, quantity: item.quantity };
    addLog(`Casing Machine buffered one ${CASING_MATERIAL_LABELS[item.material] ?? item.material} ingot.`);
  }
  state.casingMachineInputs[machine.instanceId] = inputState;
  return true;
}

function emitCasingMachineOutputs() {
  getMachines("casingMachine").forEach((machine) => {
    const inputState = getCasingMachineInputState(machine);
    const processConveyor = getInternalConveyor(machine, getMachineProcessLaneIndex(machine));
    if (!inputState.ammo || !inputState.casing || !processConveyor || getConveyorItem(processConveyor)) {
      return;
    }

    const ammo = inputState.ammo;
    const casing = inputState.casing;
    const mode = getCasingMachineMode(machine);
    const casingMaterial = getCasingMaterial(casing.material);
    if (!casingMaterial) {
      return;
    }
    const isBuckshot = mode === "buckshot";
    const incomingDamage = Number.isFinite(ammo.damage)
      ? ammo.damage
      : normalizeAmmoStack(ammo).damage;
    const output = {
      kind: "ammo",
      type: isBuckshot ? "buckshot" : "rapidfire",
      material: ammo.material,
      quantity: isBuckshot ? BUCKSHOT_OUTPUT_ROUNDS : BUCKSHOT_INPUT_ROUNDS,
      damage: incomingDamage
        * getCasingDamageMultiplier(casingMaterial)
        * (isBuckshot ? BUCKSHOT_DAMAGE_MULTIPLIER : 1),
      annealed: ammo.annealed === true,
      coreMaterial: ammo.coreMaterial ?? ammo.material,
      jacketMaterial: ammo.jacketMaterial,
      casingMaterial,
      jacketed: ammo.jacketed === true || Boolean(ammo.jacketMaterial),
      dusted: false,
    };
    ammo.quantity -= BUCKSHOT_INPUT_ROUNDS;
    casing.quantity -= 1;
    inputState.ammo = ammo.quantity > 0 ? ammo : null;
    inputState.casing = casing.quantity > 0 ? casing : null;
    state.casingMachineInputs[machine.instanceId] = inputState;
    placeItemOnConveyor(processConveyor, output);
    const casingLabel = CASING_MATERIAL_LABELS[casing.material]
      ?? CASING_MATERIAL_LABELS[`${casingMaterial}Ingot`]
      ?? casingMaterial;
    addLog(mode === "buckshot"
      ? `Casing Machine formed ${BUCKSHOT_OUTPUT_ROUNDS} Buckshot rounds with a ${casingLabel} casing.`
      : `Casing Machine formed ${BUCKSHOT_INPUT_ROUNDS} penetrating Rapidfire rounds with a ${casingLabel} casing.`);
  });
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

function canStackerAcceptItem(stacker, item) {
  if (!stacker || !item || !Number.isFinite(item.quantity) || item.quantity < 1) {
    return false;
  }
  const buffer = getStackerBuffer(stacker);
  if (!buffer || buffer.itemKey !== getStackerItemKey(item)) {
    return !buffer;
  }

  const stackSize = Math.max(1, Math.min(3, stacker.stackSize ?? 1));
  if (buffer.quantity < stackSize) {
    return true;
  }

  const outputConveyor = getStackerOutputConveyor(stacker);
  const outputDirection = stacker.orientation ?? "right";
  return Boolean(
    outputConveyor
      && !getConveyorItem(outputConveyor)
      && canConveyorFeedInto({ direction: outputDirection }, outputConveyor),
  );
}

function getStackerOutputConveyor(stacker) {
  const direction = stacker.orientation ?? "right";
  const vector = DIRECTION_VECTORS[direction];
  return getConveyorAt(stacker.column + vector.column, stacker.row + vector.row);
}

function emitStackerOutputs() {
  getMachines("stacker").forEach((stacker) => {
    const buffer = getStackerBuffer(stacker);
    if (!buffer) {
      return;
    }

    const outputConveyor = getStackerOutputConveyor(stacker);
    const outputDirection = stacker.orientation ?? "right";
    const outputQuantity = Math.max(1, Math.min(3, stacker.stackSize ?? 1));
    if (!outputConveyor
      || getConveyorItem(outputConveyor)
      || !canConveyorFeedInto({ direction: outputDirection }, outputConveyor)
      || buffer.quantity < outputQuantity) {
      return;
    }

    const outputItem = {
      ...buffer.item,
      quantity: outputQuantity,
      tileProgress: 0,
    };
    buffer.quantity -= outputQuantity;
    if (buffer.quantity <= 0) {
      delete state.stackerBuffers[stacker.instanceId];
    } else {
      buffer.item = { ...buffer.item, quantity: buffer.quantity };
      state.stackerBuffers[stacker.instanceId] = buffer;
    }
    placeItemOnConveyor(outputConveyor, outputItem);
    addLog(`Stacker released ${formatNumber(outputQuantity)} ${MATERIAL_LABELS[outputItem.material] ?? "items"}.`);
  });
}

function getContactMakerInputState(instanceId) {
  return state.contactMakerInputs[instanceId] ?? { silver: 0, silverValue: 0 };
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
  return {
    recipeCount,
    silver: recipeCount * 0.5,
  };
}

function getContactMakerPortAt(column, row, portName) {
  return getMachines("contactMaker").find((maker) => {
    const port = getMachinePort(maker, portName);
    return port?.column === column && port.row === row;
  }) ?? null;
}

function hasLiquidMetalForBulletCoreCaster() {
  const link = getBulletCoreCasterKilnLink();
  return Boolean(link && findMoltenCopperIndex(link.kiln.instanceId) >= 0);
}

function canBulletCoreCasterAcceptItem(item) {
  return (item.kind === "material" && AMMO_MATERIALS.includes(item.material))
    || (item.kind === "liquidMetal" && LIQUID_METAL_AMMO_MATERIALS.includes(item.material));
}

function canItemLeaveConveyor(conveyor, item) {
  const arcFurnaceInput = getArcFurnaceInputForConveyor(conveyor);
  if (arcFurnaceInput) {
    return canArcFurnaceAcceptInput(arcFurnaceInput.furnace, arcFurnaceInput.slot, item);
  }

  if (isBulletCoreCasterInputConveyor(conveyor)
    && state.mine.ammoShaperMode === "coated") {
    return item.kind === "material"
      && item.material === "leek"
      && hasLiquidMetalForBulletCoreCaster();
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
        const inputState = getContactMakerInputState(conveyor.internalMachineInstanceId);
        const recipeCount = getContactMakerRecipeCount(
          getInternalConveyorMachine(conveyor),
          item.quantity,
        );
        return item.kind === "material"
          && item.material === "wire"
          && item.quantity >= 5
          && item.quantity % 5 === 0
          && inputState.silver >= recipeCount * 0.5;
      }
      return item.kind === "material" && ["wire", "contact"].includes(item.material);
    }
    if (conveyor.internalMachineId === "metalPress"
      && (conveyor.internalIndex === 0 || isMetalPressProcessConveyor(conveyor))) {
      return item.kind === "material" && SMELTABLE_INGOT_MATERIALS.includes(item.material);
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
      if (item.quantity % 5 !== 0
        || inputState.silver < recipeCount * 0.5) {
        return finishMaterialTransform();
      }
      const silverValuePerIngot = inputState.silver > 0
        ? inputState.silverValue / inputState.silver
        : 0;
      const contactStackValue = (
        getItemSaleValue(item) * 5 * recipeCount
        + silverValuePerIngot * 0.5 * recipeCount
      ) * 2;
      inputState.silver -= recipeCount * 0.5;
      inputState.silverValue -= silverValuePerIngot * 0.5 * recipeCount;
      state.contactMakerInputs[maker.instanceId] = inputState;
      item.material = "contact";
      item.quantity = recipeCount * 5;
      item.saleValueBase = contactStackValue / item.quantity;
      item.baseValue = 8.8;
      item.saleValueBonus = 0;
      item.annealedValueMultiplier = 1;
      item.freshMoldedAt = Date.now();
      addLog(`Contact Maker produced ${formatNumber(item.quantity)} Silver-Copper Contacts from Copper Wire and Silver.`);
    }
    return finishMaterialTransform();
  }

  if (isMetalPressProcessConveyor(conveyor)) {
    if (item.kind === "material" && SMELTABLE_INGOT_MATERIALS.includes(item.material)) {
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
  if (!canItemLeaveConveyor(conveyor, item)) {
    return null;
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
    const arcFurnaceInput = getArcFurnaceInputForConveyor(nextConveyor);
    if (arcFurnaceInput) {
      return canConveyorFeedInto(conveyor, nextConveyor)
        && canArcFurnaceAcceptInput(arcFurnaceInput.furnace, arcFurnaceInput.slot, item)
        ? { type: "receiver", destination }
        : null;
    }
    const casingInput = getCasingMachineInputForConveyor(nextConveyor);
    if (casingInput) {
      return canConveyorFeedInto(conveyor, nextConveyor)
        && canCasingMachineAcceptAmmoInput(casingInput.machine, item)
        ? { type: "receiver", destination }
        : null;
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
        : resolveMovement(target.nextConveyor);
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
      if (movement.type !== "conveyor" || !getConveyorItem(movement.nextConveyor)) {
        return;
      }

      if (!candidateMovements.has(getConveyorIdentity(movement.nextConveyor))) {
        candidateMovements.delete(identity);
        removedDependentMove = true;
      }
    });
  }
  const movements = [...candidateMovements.values()];

  // Sources clear together before destinations fill, so an entire compatible line can advance.
  movements.forEach((movement) => {
    releaseDusterForItem(movement.item);
    setConveyorItem(movement.conveyor, null);
  });

  movements.forEach((movement) => {
    if (movement.type === "conveyor") {
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
    graphiteCopperAnnealer: "Granite-Copper Annealer",
    graniteProcessor: "Granite Processor",
    bronzeStamp: "Bronze Stamp",
    bronzePillars: "Bronze Pillars",
    extruder: "Extruder",
    leekFiberExtractor: "Leek Fiber Extractor",
    contactMaker: "Contact Maker",
    miniElectricArcFurnace: "Mini Electric Arc Furnace",
    metalPress: "Metal Press",
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
    || state.machineInventoryInstances.some((machine) => machine.instanceId === instanceId));
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
          liquidMetal.kilnInstanceId === kilnInput.kilnInstanceId
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

  state.moltenCopper.push({
    kilnInstanceId: job.kilnInstanceId,
    material: getSmeltedLiquidMaterial(job.material),
    sourceMaterial: job.sourceMaterial ?? job.material,
    cashUpgraderEligibility: job.cashUpgraderEligibility ?? {},
    sourceValue: job.sourceValue,
    sourceValueIsEffective: job.sourceValueIsEffective === true,
    quantity: job.quantity ?? 1,
  });
  addLog(`Clay Kiln produced liquid ${MATERIAL_LABELS[getSmeltedLiquidMaterial(job.material)] ?? job.material}. Connect it to an adjacent Ingot Molder or Bullet Core Caster.`);
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
      (liquidMetal.smelterInstanceId ?? liquidMetal.kilnInstanceId) === furnace.instanceId
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
    addLog(
      getArcFurnaceMode(furnace) === "alloy2"
        ? "Mini Electric Arc Furnace began the Bronze alloy: 5 copper + 1 tin → 6 liquid Bronze."
        : recipe.inputCount === 2
          ? `Mini Electric Arc Furnace began firing 2 ${MATERIAL_LABELS[recipe.inputMaterial]} → 1 ${MATERIAL_LABELS[recipe.outputMaterial]}.`
        : "Mini Electric Arc Furnace began smelting one metal input.",
    );
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

  state.moltenCopper.push({
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

  const caster = getMachine("ammoShaper");
  const processConveyor = caster
    ? getInternalConveyor(caster, getMachineProcessLaneIndex(caster))
    : null;
  const link = getBulletCoreCasterKilnLink();
  if (!caster || !processConveyor || !link) {
    return false;
  }

  const processItem = getConveyorItem(processConveyor);
  if (!processItem || processItem.kind !== "material" || processItem.material !== "leek") {
    return false;
  }

  if (processItem.metalMaterial) {
    return false;
  }

  const liquidMetalIndex = findMoltenCopperIndex(link.kiln.instanceId);
  if (liquidMetalIndex < 0) {
    return false;
  }

  const liquidMetal = state.moltenCopper.splice(liquidMetalIndex, 1)[0];
  if (!canBulletCoreCasterAcceptItem({
    kind: "liquidMetal",
    material: liquidMetal.material,
  })) {
    state.moltenCopper.splice(liquidMetalIndex, 0, liquidMetal);
    return false;
  }

  processItem.metalMaterial = liquidMetal.material;
  processItem.kilnInstanceId = liquidMetal.kilnInstanceId;
  addLog(`Bullet Core Caster reinforced one leek core with liquid ${MATERIAL_LABELS[liquidMetal.material]}.`);
  return true;
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

    const liquidMetal = state.moltenCopper.splice(liquidMetalIndex, 1)[0];
    processItem.jacketMaterial = liquidMetal.material;
    processItem.jacketKilnInstanceId = liquidMetal.kilnInstanceId;
    addLog(`Jacket Former is holding ${formatNumber(processItem.quantity)} cores for a Native copper jacket.`);
    started = true;
  });
  return started;
}

function startCasingMachineLiquid() {
  let started = false;
  getMachines("casingMachine").forEach((casingMachine) => {
    const inputState = getCasingMachineInputState(casingMachine);
    if (!inputState.ammo || inputState.casing) {
      return;
    }

    const link = getCasingMachineSmelterLink(casingMachine);
    if (!link) {
      return;
    }

    const liquidMetalIndex = findMoltenCopperIndex(link.smelter.instanceId);
    if (liquidMetalIndex < 0) {
      return;
    }

    const liquidMetal = state.moltenCopper[liquidMetalIndex];
    if (!getCasingMaterial(liquidMetal.material)) {
      return;
    }

    state.moltenCopper.splice(liquidMetalIndex, 1);
    inputState.casing = { ...liquidMetal, quantity: Math.max(1, liquidMetal.quantity ?? 1) };
    state.casingMachineInputs[casingMachine.instanceId] = inputState;
    addLog(`Casing Machine buffered ${formatNumber(inputState.casing.quantity)} liquid ${MATERIAL_LABELS[liquidMetal.material] ?? liquidMetal.material}.`);
    started = true;
  });
  return started;
}

function startMolderJob() {
  let started = false;
  getMachines("ingotMolder").forEach((molder) => {
    const outputConveyor = getInternalConveyor(molder, 0);
    if (state.molderJobs.some((job) => job.molderInstanceId === molder.instanceId)
      || state.molderOutputBuffers[molder.instanceId]
      || getAvailableCrew() < 1) {
      return;
    }

    const link = getMolderKilnLink(molder);
    if (!link || !outputConveyor) {
      return;
    }

    const moltenCopperIndex = findMoltenCopperIndex(link.kiln.instanceId);
    if (moltenCopperIndex < 0) {
      return;
    }

    if (!MOLDER_METAL_ORES.includes(state.moltenCopper[moltenCopperIndex].material)) {
      return;
    }

    const moltenCopper = state.moltenCopper[moltenCopperIndex];
    if (!hasAtLeastQuantity(moltenCopper.quantity ?? 1, 1)) {
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
      quantity: 1,
      secondsRemaining: CONFIG.ingotMolderProcessSeconds,
    });
    if (subtractQuantity(moltenCopper, 1, 1) === 0) {
      state.moltenCopper.splice(moltenCopperIndex, 1);
    }
    addLog(`Ingot Molder began shaping one ${MATERIAL_LABELS[moltenCopper.material]} ingot with its reusable mold and 1 crew.`);
    started = true;
  });
  return started;
}

function completeMolderJob(job) {
  if (!job) {
    return;
  }

  const molder = getMachineByInstanceId(job.molderInstanceId);
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
    addLog(`${MATERIAL_LABELS[outputMaterial]} finished and is waiting for the Ingot Molder output lane.`);
    return;
  }

  addLog(`${MATERIAL_LABELS[outputMaterial]} finished and entered the Ingot Molder output lane.`);
  state.molderJobs = state.molderJobs.filter((candidate) => candidate !== job);
}

function flushMolderOutputs() {
  Object.entries(state.molderOutputBuffers).forEach(([molderInstanceId, item]) => {
    const molder = getMachineByInstanceId(molderInstanceId);
    const outputConveyor = molder ? getInternalConveyor(molder, 0) : null;
    if (!outputConveyor || getConveyorItem(outputConveyor) || !placeItemOnConveyor(outputConveyor, item)) {
      return;
    }

    delete state.molderOutputBuffers[molderInstanceId];
    addLog(`${MATERIAL_LABELS[item.material]} left the Ingot Molder output buffer.`);
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

function selectFactoryEntity(entity, additive = false) {
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
  render();
}

function clearFactorySelection() {
  if (!selectedFactoryEntity && selectedFactoryEntities.length === 0 && !groupMoveState) {
    return;
  }

  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  selectedStorageOutputKey = null;
  hoveredFactoryTile = null;
  render();
}

function cancelFactoryPlacement() {
  if (!selectedBuildTool) {
    return;
  }

  selectedBuildTool = null;
  hoveredFactoryTile = null;
  addLog("Placement selection cancelled.");
  render();
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
    state.moltenCopper.push({
      kilnInstanceId: item.kilnInstanceId,
      material: item.material,
      sourceMaterial: item.sourceMaterial ?? item.material,
      cashUpgraderEligibility: item.cashUpgraderEligibility ?? {},
      sourceValue: item.sourceValue,
      sourceValueIsEffective: item.sourceValueIsEffective === true,
      quantity: item.quantity ?? 1,
    });
    return "liquid copper";
  }

  return "cargo";
}

function recoverFactoryEntityCargo(entity) {
  const entityTileKeys = new Set(getFactoryEntityTileKeys(entity));
  const recovered = [];
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
    .filter(({ descriptor }) => descriptor.type === "machine" && descriptor.id === "casingMachine")
    .forEach(({ object }) => {
      const inputState = state.casingMachineInputs[object.instanceId];
      if (!inputState) {
        return;
      }
      if (inputState.ammo) {
        addAmmo(
          inputState.ammo.quantity,
          inputState.ammo.material,
          inputState.ammo.type,
          inputState.ammo.damage,
          inputState.ammo.annealed === true,
          {
            casingMaterial: inputState.ammo.casingMaterial,
            jacketMaterial: inputState.ammo.jacketMaterial,
            coreMaterial: inputState.ammo.coreMaterial,
          },
        );
        recovered.push(`${formatNumber(inputState.ammo.quantity)} jacketed rounds`);
      }
      if (inputState.casing) {
        state.stockpile[inputState.casing.material] = (
          state.stockpile[inputState.casing.material] ?? 0
        ) + inputState.casing.quantity;
        recovered.push(`${formatNumber(inputState.casing.quantity)} ${MATERIAL_LABELS[inputState.casing.material] ?? inputState.casing.material}`);
      }
      delete state.casingMachineInputs[object.instanceId];
    });
  return recovered;
}

function pickUpSelectedFactoryEntities() {
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
    addLog(`${getMachineDisplayName(entity.id)} cannot be moved in this prototype.`);
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
  renderFactoryMachineControls();
  renderMachineOverlay();
  renderAmmoMaker();
}

function addAmmo(count, material, type = "rapidfire", damage = 1, annealed = false, composition = {}) {
  state.ammoStacks = normalizeAmmoStacks(state.ammoStacks);
  const normalizedAnnealed = annealed === true;
  const casingMaterial = composition.casingMaterial ?? null;
  const jacketMaterial = composition.jacketMaterial ?? null;
  const coreMaterial = composition.coreMaterial ?? material;
  const normalizedDamage = getCasedAmmoDamage({
    type,
    material,
    casingMaterial,
    jacketMaterial,
    coreMaterial,
    annealed: normalizedAnnealed,
  });
  const existing = state.ammoStacks.find(
    (stack) => stack.type === type
      && stack.damage === normalizedDamage
      && stack.material === material
      && stack.annealed === normalizedAnnealed
      && (stack.casingMaterial ?? null) === casingMaterial
      && (stack.jacketMaterial ?? null) === jacketMaterial
      && (stack.coreMaterial ?? stack.material) === coreMaterial,
  );

  if (existing) {
    existing.count += count;
  } else {
    state.ammoStacks.push({
      type,
      damage: normalizedDamage,
      material,
      count,
      annealed: normalizedAnnealed,
      ...(casingMaterial ? { casingMaterial } : {}),
      ...(jacketMaterial ? { jacketMaterial } : {}),
      ...(coreMaterial !== material ? { coreMaterial } : {}),
    });
  }
}

function getSelectedAmmoMaterial() {
  syncSelectedAmmoForGun();
  const selectedMaterial = state.mine.selectedAmmoMaterial
    ?? state.mine.selectedAmmoCoreMaterial
    ?? elements.ammoMaterialSelect?.dataset.selectedMaterial;
  return [...AMMO_SELECTOR_MATERIALS, ...LIQUID_METAL_AMMO_MATERIALS].includes(selectedMaterial)
    ? selectedMaterial
    : "leek";
}

function getSelectedAmmoAnnealed() {
  syncSelectedAmmoForGun();
  return state.mine.selectedAmmoAnnealed === true;
}

function captureSelectedAmmoSelection() {
  return {
    material: state.mine.selectedAmmoMaterial ?? state.mine.selectedAmmoCoreMaterial ?? "leek",
    casingMaterial: state.mine.selectedAmmoCasingMaterial ?? null,
    jacketMaterial: state.mine.selectedAmmoJacketMaterial ?? null,
    coreMaterial: state.mine.selectedAmmoCoreMaterial
      ?? state.mine.selectedAmmoMaterial
      ?? "leek",
    damage: state.mine.selectedAmmoDamage == null
      ? null
      : Number(state.mine.selectedAmmoDamage),
    annealed: state.mine.selectedAmmoAnnealed === true,
  };
}

function getDefaultAmmoSelection() {
  return {
    material: "leek",
    casingMaterial: null,
    jacketMaterial: null,
    coreMaterial: "leek",
    damage: null,
    annealed: false,
  };
}

function getAmmoStackForSelection(gunType, selection) {
  return state.ammoStacks.find((stack) => (
    (stack.type ?? "rapidfire") === gunType
      && stack.count > 0
      && canFireAmmoStack(stack)
      && getAmmoComposition(stack).casingMaterial === (selection.casingMaterial ?? null)
      && getAmmoComposition(stack).jacketMaterial === (selection.jacketMaterial ?? null)
      && getAmmoComposition(stack).coreMaterial === (selection.coreMaterial ?? selection.material ?? "leek")
      && (selection.damage == null || Number(stack.damage) === Number(selection.damage))
      && (stack.annealed === true) === (selection.annealed === true)
  )) ?? null;
}

function rememberSelectedAmmoForGun(gunType = state.mine.selectedAmmoGunType) {
  if (!["rapidfire", "buckshot"].includes(gunType)) {
    return;
  }
  if (!isSaveRecord(state.mine.selectedAmmoByGun)) {
    state.mine.selectedAmmoByGun = {};
  }
  state.mine.selectedAmmoByGun[gunType] = captureSelectedAmmoSelection();
}

function syncSelectedAmmoForGun() {
  const gunType = getSelectedGunAmmoType();
  if (!isSaveRecord(state.mine.selectedAmmoByGun)) {
    state.mine.selectedAmmoByGun = {};
  }
  if (!isSaveRecord(state.mine.selectedAmmoByGun[gunType])) {
    state.mine.selectedAmmoByGun[gunType] = getDefaultAmmoSelection();
  }
  if (state.mine.selectedAmmoGunType === gunType) {
    return;
  }

  if (["rapidfire", "buckshot"].includes(state.mine.selectedAmmoGunType)) {
    rememberSelectedAmmoForGun(state.mine.selectedAmmoGunType);
  }
  const selection = state.mine.selectedAmmoByGun[gunType];
  const usableSelection = getAmmoStackForSelection(gunType, selection);
  const fallback = usableSelection
    ?? state.ammoStacks.find((stack) => (
      (stack.type ?? "rapidfire") === gunType
        && stack.count > 0
        && canFireAmmoStack(stack)
    ));
  const activeSelection = fallback
    ? {
      material: fallback.coreMaterial ?? fallback.material,
      casingMaterial: fallback.casingMaterial ?? null,
      jacketMaterial: fallback.jacketMaterial ?? null,
      coreMaterial: fallback.coreMaterial ?? fallback.material,
      damage: Number(fallback.damage),
      annealed: fallback.annealed === true,
    }
    : selection;
  state.mine.selectedAmmoMaterial = activeSelection.material
    ?? activeSelection.coreMaterial
    ?? "leek";
  state.mine.selectedAmmoCasingMaterial = activeSelection.casingMaterial ?? null;
  state.mine.selectedAmmoJacketMaterial = activeSelection.jacketMaterial ?? null;
  state.mine.selectedAmmoCoreMaterial = activeSelection.coreMaterial
    ?? activeSelection.material
    ?? "leek";
  state.mine.selectedAmmoDamage = activeSelection.damage == null ? null : Number(activeSelection.damage);
  state.mine.selectedAmmoAnnealed = activeSelection.annealed === true;
  state.mine.selectedAmmoGunType = gunType;
  rememberSelectedAmmoForGun(gunType);
}

function getSelectedAmmoComposition() {
  syncSelectedAmmoForGun();
  return {
    casingMaterial: state.mine.selectedAmmoCasingMaterial ?? null,
    jacketMaterial: state.mine.selectedAmmoJacketMaterial ?? null,
    coreMaterial: getSelectedAmmoMaterial(),
    damage: state.mine.selectedAmmoDamage == null ? null : Number(state.mine.selectedAmmoDamage),
  };
}

function getSelectedAmmoStack() {
  const selected = getSelectedAmmoComposition();
  const selectedAnnealed = getSelectedAmmoAnnealed();
  return state.ammoStacks.find((stack) => (
    (stack.type ?? "rapidfire") === getSelectedGunAmmoType()
      && canFireAmmoStack(stack)
      && getAmmoComposition(stack).casingMaterial === selected.casingMaterial
      && getAmmoComposition(stack).jacketMaterial === selected.jacketMaterial
      && getAmmoComposition(stack).coreMaterial === selected.coreMaterial
      && (selected.damage == null || Number(stack.damage) === selected.damage)
      && stack.annealed === selectedAnnealed
      && stack.count > 0
  )) ?? null;
}

function canFireAmmoStack(stack) {
  return Boolean(stack)
    && (!stack.casingMaterial || state.mine?.rapidfireGunMk1Purchased === true);
}

function isRealityShieldAmmoSelected() {
  const selected = getSelectedAmmoComposition();
  return getSelectedGun() === "rapidfire"
    && selected.coreMaterial === "leek"
    && selected.casingMaterial === null
    && selected.jacketMaterial === null
    && (selected.damage == null || Number(selected.damage) === 1)
    && getSelectedAmmoAnnealed() === false;
}

function getAmmoCountForMaterial(material, annealed = null) {
  return state.ammoStacks
    .filter((stack) => stack.type === "rapidfire"
      && stack.material === material
      && (annealed === null || stack.annealed === annealed))
    .reduce((total, stack) => total + stack.count, 0);
}

function getAmmoSelectorOptions() {
  const selectedGunType = getSelectedGunAmmoType();
  const options = selectedGunType === "rapidfire"
    ? [
      { material: "leek", annealed: false, damage: 1 },
      { material: "copper", annealed: false, damage: MALACHITE_AMMO_DAMAGE },
      { material: "lead", annealed: false, damage: LEAD_AMMO_DAMAGE },
    ]
    : [];
  state.ammoStacks.forEach((stack) => {
    if ((stack.type ?? "rapidfire") !== selectedGunType || stack.count <= 0) {
      return;
    }
    if (!options.some((option) => option.material === stack.material && option.annealed === (stack.annealed === true))) {
      options.push({
        material: stack.material,
        annealed: stack.annealed === true,
        damage: stack.damage,
      });
    }
  });
  return options;
}

function getAmmoComposition(stack) {
  return {
    casingMaterial: stack.casingMaterial ?? null,
    jacketMaterial: stack.jacketMaterial ?? null,
    coreMaterial: stack.coreMaterial ?? stack.material ?? null,
  };
}

function getAmmoCompositionKey(stack) {
  const composition = getAmmoComposition(stack);
  return [
    composition.casingMaterial ?? "",
    composition.jacketMaterial ?? "",
    composition.coreMaterial ?? "",
  ].join("|");
}

function groupAmmoStacks(stacks) {
  const groups = new Map();
  stacks.forEach((stack) => {
    const key = getAmmoCompositionKey(stack);
    if (!groups.has(key)) {
      groups.set(key, {
        ...getAmmoComposition(stack),
        stacks: [],
      });
    }
    groups.get(key).stacks.push(stack);
  });
  return [...groups.values()];
}

function dispatchMaterialToAmmoShaper(material) {
  if (!hasAmmoProductionRoute() || !AMMO_MATERIALS.includes(material)) {
    return;
  }

  state.materialsInTransit += 1;
  addLog(`One ${MATERIAL_LABELS[material]} entered the Bullet Core Caster conveyor.`);
  const deliveryRevision = simulationRevision;

  animateMaterialToAmmoShaper(material, () => {
    if (deliveryRevision !== simulationRevision) {
      return;
    }

    state.materialsInTransit -= 1;
    const roundCount = AMMO_ROUNDS_PER_OTHER_MATERIAL;
    const damage = 1;
    state.ammoInTransit += roundCount;
    addLog(`Bullet Core Caster formed ${roundCount} ${MATERIAL_LABELS[material]} rapidfire rounds.`);
    animateAmmoToDeposit(material, roundCount, () => {
      if (deliveryRevision !== simulationRevision) {
        return;
      }

      state.ammoInTransit -= roundCount;
      addAmmo(roundCount, material, "rapidfire", damage);
      addLog("Gun Deposit received the shaped ammo stack.");
      render();
    });
    render();
  });
}

function dispatchMaterialToStorage(material) {
  const route = getPlanterStorageRoute();
  if (!route) {
    return;
  }

  state.materialsInTransit += 1;
  addLog(`One ${MATERIAL_LABELS[material]} entered the Material Storage conveyor.`);
  const deliveryRevision = simulationRevision;
  animateMaterialToStorage(material, route, () => {
    if (deliveryRevision !== simulationRevision) {
      return;
    }

    state.materialsInTransit -= 1;
    state.stockpile[material] += 1;
    addLog(`Material Storage received one ${MATERIAL_LABELS[material]}.`);
    render();
  });
}

function queuePlanterLeek() {
  if (state.planterQueue >= CONFIG.maxPlanterQueue) {
    return false;
  }

  state.planterQueue += 1;
  return true;
}

function dispatchQueuedPlanterLeek() {
  const planter = getMachine("planter");
  const inputConveyor = planter ? getInternalConveyor(planter, 0) : null;
  if (state.planterQueue <= 0 || !inputConveyor) {
    return false;
  }

  if (!placeItemOnConveyor(inputConveyor, {
    kind: "material",
    material: "leek",
    quantity: 1,
    dusted: false,
  })) {
    return false;
  }

  state.planterQueue -= 1;
  addLog("Leek Planter placed one Leek on its first internal conveyor.");
  return true;
}

function consumeAmmo() {
  const stack = getSelectedAmmoStack();
  if (!stack) {
    return null;
  }

  const ammo = {
    type: stack.type,
    damage: stack.damage,
    material: stack.material,
    annealed: stack.annealed === true,
    coreMaterial: stack.coreMaterial ?? stack.material,
    jacketMaterial: stack.jacketMaterial ?? null,
    casingMaterial: stack.casingMaterial ?? null,
  };
  stack.count -= 1;
  state.ammoStacks = state.ammoStacks.filter((candidate) => candidate.count > 0);
  return ammo;
}

function applyDamageToDeposit(deposit, damage) {
  if (!deposit || deposit.segmentsRemaining <= 0) {
    return false;
  }

  const appliedDamage = Math.min(damage, deposit.currentSegmentHitPoints);
  deposit.currentSegmentHitPoints -= appliedDamage;
  if (deposit.currentSegmentHitPoints <= 0) {
    deposit.segmentsRemaining -= 1;
    if (deposit.segmentsRemaining > 0) {
      deposit.currentSegmentHitPoints = deposit.hitPointsPerSegment;
    }
  }

  if (deposit.segmentsRemaining === 0) {
    const definition = RESOURCE_DEFINITIONS[deposit.type];
    const yieldedAmount = deposit.yield * getMaterialYieldMultiplier();
    state.stockpile[definition.stockpileKey] += yieldedAmount;
    state.recoveredOre += yieldedAmount;
    if (state.selectedDepositId === deposit.id) {
      state.selectedDepositId = null;
    }
    addLog(`${definition.label} displaced: +${formatNumber(yieldedAmount)} to stockpile.`);
  }
  return true;
}

function fireBuckshotRound() {
  const ammo = consumeAmmo();
  if (!ammo) {
    return false;
  }

  const hitsByDeposit = new Map();
  let landedHits = 0;
  for (let hit = 0; hit < BUCKSHOT_SEGMENTS_PER_SHOT; hit += 1) {
    const activeDeposits = getActiveDeposits().filter((deposit) => (
      (hitsByDeposit.get(deposit.id) ?? 0) < BUCKSHOT_MAX_HITS_PER_DEPOSIT
    ));
    if (activeDeposits.length === 0) {
      break;
    }
    const target = activeDeposits[Math.floor(Math.random() * activeDeposits.length)];
    hitsByDeposit.set(target.id, (hitsByDeposit.get(target.id) ?? 0) + 1);
    applyDamageToDeposit(target, ammo.damage);
    landedHits += 1;
  }
  state.shotsFired += 1;
  advanceGunScheduleAfterShot();
  addLog(`Buckshot Gun fired ${landedHits} of ${BUCKSHOT_SEGMENTS_PER_SHOT} ${formatNumber(ammo.damage)}-damage hits.`);
  maybeStartAutomaticDrilling();
  return true;
}

function canStartRealityShield() {
  const shield = getRealityShield();
  return Boolean(hasDiamondTippedDrill()
    && !state.drill.active
    && !shield.active
    && !shield.completed);
}

function startRealityShield(temporaryBattle = false) {
  if (temporaryBattle
    ? Boolean(getRealityShield().active)
    : !canStartRealityShield()) {
    return false;
  }

  const shield = getRealityShield();
  shield.active = true;
  shield.hitPointsRemaining = shield.hitPointsTotal;
  shield.refreshTimer = CONFIG.realityShieldInitialIntervalSeconds;
  shield.refreshIntervalSeconds = CONFIG.realityShieldInitialIntervalSeconds;
  shield.waveNumber = 0;
  shield.ores = [];
  shield.temporaryBattle = temporaryBattle;
  state.selectedDepositId = null;
  state.mine.selectedAmmoMaterial = "leek";
  state.mine.selectedAmmoCoreMaterial = "leek";
  state.mine.selectedAmmoCasingMaterial = null;
  state.mine.selectedAmmoJacketMaterial = null;
  state.mine.selectedAmmoDamage = 1;
  state.mine.selectedAmmoAnnealed = false;
  state.mine.selectedGun = "rapidfire";
  state.mine.selectedAmmoGunType = "rapidfire";
  rememberSelectedAmmoForGun("rapidfire");
  addLog("Reality Shield challenge started. Only 1-damage Leek bullets can pierce its interruptions.");
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function completeRealityShield() {
  const shield = getRealityShield();
  shield.active = false;
  shield.hitPointsRemaining = 0;
  shield.ores = [];
  state.selectedDepositId = null;
  if (shield.temporaryBattle) {
    shield.temporaryBattle = false;
    shield.hitPointsRemaining = shield.hitPointsTotal;
    addLog("Test Reality Shield battle complete. No progression was awarded.");
  } else {
    shield.completed = true;
    addLog("The Reality Shield has been broken. The world beyond it is no longer protected.");
  }
}

function updateRealityShield(deltaSeconds) {
  const shield = getRealityShield();
  if (!shield.active) {
    return;
  }

  shield.refreshTimer -= deltaSeconds;
  if (shield.refreshTimer <= 0) {
    if (shield.ores.length > 0) {
      shield.refreshIntervalSeconds *= 2;
      addLog(`The Reality Shield refreshed its interruption wave. Next wave in ${formatNumber(shield.refreshIntervalSeconds)} seconds.`);
    } else {
      shield.refreshIntervalSeconds = CONFIG.realityShieldInitialIntervalSeconds;
      addLog("The Reality Shield released another interruption wave.");
    }
    shield.ores = createRealityShieldWave();
    shield.waveNumber += 1;
    shield.refreshTimer = shield.refreshIntervalSeconds;
    state.selectedDepositId = null;
    return;
  }

  if (shield.ores.length > 0) {
    return;
  }

  shield.hitPointsRemaining = Math.max(
    0,
    shield.hitPointsRemaining - getRealityShieldDps() * deltaSeconds,
  );
  if (shield.hitPointsRemaining <= 0) {
    completeRealityShield();
  }
}

function selectDeposit(depositId) {
  if (getRealityShield()?.active) {
    const shieldOre = getRealityShield().ores.find((ore) => ore.id === depositId);
    if (!shieldOre || shieldOre.defeatedAt) {
      return;
    }
    defeatRealityShieldOre(depositId);
    return;
  }

  const deposit = getDepositById(depositId);
  if (!deposit || deposit.segmentsRemaining <= 0 || state.drill.completed) {
    return;
  }

  state.selectedDepositId = depositId;
  addLog(`Manual target set: ${RESOURCE_DEFINITIONS[deposit.type].label}.`);
  render();
}

function finishRealityShieldOreKill(oreId, defeatedAt) {
  const shield = getRealityShield();
  if (!shield.active) {
    return;
  }

  const ore = shield.ores.find((candidate) => candidate.id === oreId);
  if (!ore || ore.defeatedAt !== defeatedAt) {
    return;
  }

  shield.ores = shield.ores.filter((candidate) => candidate.id !== oreId);
  shield.hitPointsRemaining = Math.max(
    0,
    shield.hitPointsRemaining - CONFIG.realityShieldCrosshairDamage,
  );
  if (shield.ores.length === 0) {
    shield.hitPointsRemaining = Math.max(
      0,
      shield.hitPointsRemaining - CONFIG.realityShieldWaveDamage,
    );
    shield.refreshTimer = Math.min(
      shield.refreshTimer,
      CONFIG.realityShieldInitialIntervalSeconds,
    );
    addLog("Reality Shield interruption cleared. Drilling resumes.");
  }

  if (shield.hitPointsRemaining <= 0) {
    completeRealityShield();
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return;
  }

  if (!IS_NODE_TEST_ENVIRONMENT) {
    const targetCell = Array.from(
      elements.mineGrid.querySelectorAll(".deposit-realityShieldCrosshair"),
    ).find((cell) => cell.dataset.depositId === oreId);
    if (targetCell) {
      const hostRockCell = document.createElement("div");
      hostRockCell.className = "mine-cell";
      hostRockCell.setAttribute("aria-label", "Reality Shield barrier");
      targetCell.replaceWith(hostRockCell);
    }
    lastMineGridSignature = getMineGridSignature();
    renderRealityShield();
    renderDrill();
    renderLog();
  }
}

function defeatRealityShieldOre(oreId) {
  const shield = getRealityShield();
  const ore = shield.ores.find((candidate) => candidate.id === oreId);
  if (!shield.active || !ore || ore.defeatedAt) {
    return false;
  }

  const defeatedAt = Date.now();
  ore.defeatedAt = defeatedAt;
  state.selectedDepositId = null;
  addLog("Reality Shield crosshair destroyed.");
  if (!IS_NODE_TEST_ENVIRONMENT) {
    const targetCell = Array.from(
      elements.mineGrid.querySelectorAll(".deposit-realityShieldCrosshair"),
    ).find((cell) => cell.dataset.depositId === oreId);
    if (targetCell) {
      targetCell.classList.add("shield-crosshair-defeated");
      targetCell.disabled = true;
      targetCell.setAttribute("aria-label", "Reality shield crosshair destroyed");
      targetCell.title = "Destroyed";
      const core = targetCell.querySelector(".deposit-core");
      const startRotation = ore.rotation ?? 0;
      const endRotation = startRotation + (ore.deathRotation ?? 1080);
      core?.animate([
        { opacity: 1, transform: `scale(1) rotate(${startRotation}deg)` },
        { opacity: 0, transform: `scale(1.7) rotate(${endRotation}deg)` },
      ], {
        duration: 1000,
        easing: "ease-in",
        fill: "forwards",
      });
    }
    renderRealityShield();
    renderDrill();
    window.setTimeout(() => finishRealityShieldOreKill(oreId, defeatedAt), 1000);
  } else {
    finishRealityShieldOreKill(oreId, defeatedAt);
  }
  return true;
}

function fireLeek(source) {
  if (getRealityShield()?.active) {
    const target = getTargetDeposit();
    if (!target || !isRealityShieldAmmoSelected()) {
      return;
    }

    state.shotsFired += 1;
    defeatRealityShieldOre(target.id);
    return;
  }

  if (state.drill.active || state.drill.completed) {
    return;
  }

  const target = getTargetDeposit();
  if ((!target && getSelectedGun() !== "buckshot") || getTotalAmmo() < 1) {
    return;
  }

  if (getSelectedGun() === "buckshot") {
    fireBuckshotRound();
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return;
  }

  const ammo = consumeAmmo();
  if (!ammo) {
    return;
  }

  state.shotsFired += 1;
  applyDamageToDeposit(target, ammo.damage);
  advanceGunScheduleAfterShot();

  if (target.segmentsRemaining > 0 && source === "manual") {
    addLog(
      `${RESOURCE_DEFINITIONS[target.type].label}: ${target.currentSegmentHitPoints}/${target.hitPointsPerSegment} HP in this segment.`,
    );
  }

  maybeStartAutomaticDrilling();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function feedAmmoShaper() {
  const shaper = getMachine("ammoShaper");
  const inputConveyor = shaper ? getInternalConveyor(shaper, 0) : null;
  if (
    state.drill.active
    || state.drill.completed
    || !shaper
    || !inputConveyor
    || getConveyorItem(inputConveyor)
  ) {
    return;
  }

  const material = getSelectedAmmoMaterial();
  if (!material) {
    return;
  }

  if (material === "leek" || !AMMO_MATERIALS.includes(material)) {
    return;
  }
  if (state.stockpile[material] < 1) {
    return;
  }
  state.stockpile[material] -= 1;

  if (!placeItemOnConveyor(inputConveyor, {
    kind: "material",
    material,
    quantity: 1,
    dusted: false,
  })) {
    return;
  }
  addLog(`One ${MATERIAL_LABELS[material]} entered the Bullet Core Caster input conveyor.`);
  render();
}

function toggleAutoExtractor() {
  if (state.drill.active || state.drill.completed) {
    return;
  }

  state.autoExtractorEnabled = !state.autoExtractorEnabled;
  addLog(state.autoExtractorEnabled ? "Automatic extractor resumed." : "Automatic extractor paused.");
  render();
}

function startDrilling(automatic = false) {
  if (state.drill.active || state.drill.completed || getRealityShield()?.active) {
    return;
  }

  state.drill.active = true;
  addLog(
    automatic
      ? `Automatic drill engaged at ${getDrillDps()} DPS.`
      : `Face drill engaged at ${getDrillDps()} DPS. Remaining ore will be lost when the face is cleared.`,
  );
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function completeDrilling() {
  const remaining = getActiveDeposits();
  const lostOre = remaining.length;

  if (lostOre > 0) {
    state.deposits.forEach((deposit) => {
      deposit.segmentsRemaining = 0;
    });
    addLog(`The drill cleared the face and destroyed ${lostOre} unextracted ore deposit(s).`);
  } else {
    addLog("The drill cleared the face after every mapped deposit was extracted.");
  }

  state.drill.active = false;
  state.drill.completed = true;
  state.drill.hitPointsRemaining = 0;
  state.selectedDepositId = null;

  if (!state.mine.isRemine) {
    const tunnel = getCurrentTunnel();
    const priorCompletedBands = getCompletedBandsForTunnel(tunnel);
    const completedRegularLayers = Math.max(
      getCompletedLayersForTunnel(tunnel),
      state.mine.currentLayer,
    );
    const completedBands = Math.floor(completedRegularLayers / CONFIG.layersPerBand);
    state.mine.completedRegularLayersByTunnel[tunnel] = completedRegularLayers;
    state.mine.completedBandsByTunnel[tunnel] = completedBands;
    syncLegacyMineProgress();

    if (completedBands > priorCompletedBands) {
      addLog(
        `Tunnel ${tunnel} Band ${completedBands} cleared. Its first layer can now be re-mined with half of its ore chunks.`,
      );
      if (tunnel === 1 && completedBands >= 1) {
        state.mine.autoDrillUnlocked = true;
        addLog("Automatic drilling is now available after a layer has been fully mined.");
      }
      if (tunnel === 2 && completedBands >= 5) {
        state.mine.autoProgressionUnlocked = true;
        state.mine.autoRemineUnlocked = true;
        addLog("Automatic re-mining and continuation are now available after Tunnel 2 Band 5.");
      }
      if (tunnel === 1 && completedBands >= 20) {
        state.mine.rapidfireGunMk1Unlocked = true;
        state.mine.buckshotGunUnlocked = true;
        state.mine.gunSchedulingUnlocked = true;
        addLog("Tunnel 1 Band 20 cleared. Rapidfire Gun Mk. 1, the Buckshot Gun, and Gunner's Manual are now available.");
      }
    }
  }

  if (state.mine.isRemine
    && state.mine.autoRemineUnlocked
    && state.mine.autoRemineEnabled) {
    const selectedBand = Math.min(
      Math.max(1, state.mine.selectedRemineBand || 1),
      getCompletedBandsForTunnel(getCurrentTunnel()),
    );
    remineBandFirstLayer(selectedBand);
    return;
  }

  if (state.mine.autoProgressionUnlocked
    && state.mine.autoContinueEnabled
    && !state.mine.isRemine
    && state.mine.currentLayer < getTunnelLayerLimit(getCurrentTunnel())) {
    loadLayer(state.mine.currentLayer + 1, { tunnel: getCurrentTunnel() });
    return;
  }

  render();
}

function canBuyMiningRights() {
  return !state.mine.miningRightsPurchased
    && getCompletedBandsForTunnel(1) >= 1
    && state.cash >= 100;
}

function buyMiningRights() {
  if (!canBuyMiningRights()) {
    return;
  }

  state.cash -= 100;
  state.mine.miningRightsPurchased = true;
  if (!state.mine.unlockedTunnels.includes(2)) {
    state.mine.unlockedTunnels.push(2);
  }
  addLog("Mining Rights purchased for $100. Tunnel 2 unlocked.");
  saveGame();
  render();
}

function canBuyTunnelThreeRights() {
  return !state.mine.tunnelThreeRightsPurchased
    && state.mine.unlockedTunnels.includes(2)
    && state.cash >= 8e5;
}

function buyTunnelThreeRights() {
  if (!canBuyTunnelThreeRights()) {
    return;
  }

  state.cash -= 8e5;
  state.mine.tunnelThreeRightsPurchased = true;
  if (!state.mine.unlockedTunnels.includes(3)) {
    state.mine.unlockedTunnels.push(3);
  }
  addLog("Tunnel 3 Mining Rights purchased for $800,000. Tunnel 3 unlocked.");
  saveGame();
  render();
}

function canBuyRapidfireGunMk1() {
  return Boolean(
    state.mine.rapidfireGunMk1Unlocked
      && !state.mine.rapidfireGunMk1Purchased
      && state.cash >= RAPIDFIRE_MK1_COST,
  );
}

function buyRapidfireGunMk1() {
  if (!canBuyRapidfireGunMk1()) {
    return false;
  }

  state.cash -= RAPIDFIRE_MK1_COST;
  state.mine.rapidfireGunMk1Purchased = true;
  addLog("Rapidfire Gun Mk. 1 purchased. It can fire cased ammunition.");
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function canBuyBuckshotGun() {
  return Boolean(
    state.mine.buckshotGunUnlocked
      && state.mine.rapidfireGunMk1Purchased
      && !state.mine.buckshotGunPurchased
      && state.cash >= BUCKSHOT_GUN_COST,
  );
}

function buyBuckshotGun() {
  if (!canBuyBuckshotGun()) {
    return false;
  }

  state.cash -= BUCKSHOT_GUN_COST;
  state.mine.buckshotGunPurchased = true;
  addLog("Buckshot Gun purchased. It fires one shot per second and scatters 10 hits across the active ore.");
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function selectGun(gunId) {
  if (gunId === "buckshot" && !state.mine.buckshotGunPurchased) {
    return false;
  }
  if (!["rapidfire", "buckshot"].includes(gunId)) {
    return false;
  }

  rememberSelectedAmmoForGun(getSelectedGunAmmoType());
  state.mine.selectedGun = gunId;
  state.mine.selectedAmmoGunType = null;
  syncSelectedAmmoForGun();
  autoFireAccumulator = 0;
  addLog(`${getGunDisplayName(gunId)} selected.`);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function loadLayer(layerNumber, { tunnel = getCurrentTunnel(), isRemine = false, remineIndex = 0 } = {}) {
  const stats = getLayerStats(layerNumber, tunnel);
  const drillUpgradeId = state.drill.upgradeId ?? "basic";
  state.mine.currentTunnel = tunnel;
  if (!state.mine.unlockedTunnels.includes(tunnel)) {
    return;
  }
  state.mine.currentLayer = layerNumber;
  state.mine.isRemine = isRemine;
  resetGunScheduleProgress(tunnel);
  state.deposits = createLayerDeposits(layerNumber, { tunnel, isRemine, remineIndex });
  state.drill = {
    active: false,
    completed: false,
    upgradeId: drillUpgradeId,
    hitPointsRemaining: isRemine
      ? Math.ceil(stats.hitPoints / CONFIG.remineHitPointDivisor)
      : stats.hitPoints,
    hitPointsTotal: isRemine
      ? Math.ceil(stats.hitPoints / CONFIG.remineHitPointDivisor)
      : stats.hitPoints,
  };
  state.selectedDepositId = null;
  autoFireAccumulator = 0;
  addLog(
    isRemine
      ? `Re-mining Tunnel ${tunnel} Band ${stats.band}, Layer 1 with half of its original ore chunks.`
      : `Entered Tunnel ${tunnel}, Band ${stats.band}, Layer ${stats.layerInBand}.`,
  );
  const automaticDrillingStarted = maybeStartAutomaticDrilling();
  if (!automaticDrillingStarted && !IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function switchTunnel(tunnel) {
  if (!state.mine.unlockedTunnels.includes(tunnel) || tunnel === getCurrentTunnel()) {
    return;
  }

  snapshotCurrentTunnelProgress();
  const savedProgress = state.mine.tunnelProgress[tunnel];
  if (savedProgress) {
    state.mine.currentTunnel = tunnel;
    state.mine.currentLayer = savedProgress.currentLayer;
    state.mine.isRemine = savedProgress.isRemine;
    state.deposits = JSON.parse(JSON.stringify(savedProgress.deposits));
    state.drill = {
      ...savedProgress.drill,
      upgradeId: getHigherDrillUpgradeId(state.drill.upgradeId, savedProgress.drill.upgradeId),
    };
    state.selectedDepositId = savedProgress.selectedDepositId;
    autoFireAccumulator = 0;
    syncLegacyMineProgress();
    const automaticDrillingStarted = maybeStartAutomaticDrilling();
    if (!automaticDrillingStarted && !IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    saveGame();
    return;
  }

  loadLayer(1, { tunnel });
  saveGame();
}

function advanceToNextLayer() {
  if (state.drill.active || !state.drill.completed) {
    return;
  }

  const tunnel = getCurrentTunnel();
  const nextLayer = state.mine.isRemine
    ? getCompletedLayersForTunnel(tunnel) + 1
    : state.mine.currentLayer + 1;
  if (nextLayer > getTunnelLayerLimit(tunnel)) {
    return;
  }

  loadLayer(nextLayer);
}

function remineBandFirstLayer(band) {
  const tunnel = getCurrentTunnel();
  if (state.drill.active || !state.drill.completed || band > getCompletedBandsForTunnel(tunnel)) {
    return;
  }

  state.mine.selectedRemineBand = band;
  const remineIndex = state.mine.reminesByBand[band] ?? 0;
  state.mine.reminesByBand[band] = remineIndex + 1;
  loadLayer((band - 1) * CONFIG.layersPerBand + 1, { tunnel, isRemine: true, remineIndex });
}

function toggleAutoDrill() {
  if (!state.mine.autoDrillUnlocked) {
    return;
  }

  const currentIndex = Math.max(0, AUTO_DRILL_MODES.indexOf(state.mine.autoDrillMode));
  const nextIndex = (currentIndex + 1 + AUTO_DRILL_MODES.length) % AUTO_DRILL_MODES.length;
  state.mine.autoDrillMode = AUTO_DRILL_MODES[nextIndex];
  addLog({
    off: "Automatic drilling disabled.",
    afterOres: "Automatic drilling will start after all ores on a layer are extracted.",
    ignoreOres: "Automatic drilling will start immediately on layer entry, ignoring ores.",
  }[state.mine.autoDrillMode]);
  const automaticDrillingStarted = maybeStartAutomaticDrilling();
  saveGame();
  if (!automaticDrillingStarted && !IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function toggleAutoContinue() {
  if (!state.mine.autoProgressionUnlocked) {
    return;
  }

  state.mine.autoContinueEnabled = !state.mine.autoContinueEnabled;
  addLog(state.mine.autoContinueEnabled ? "Automatic continuation enabled." : "Automatic continuation disabled.");
  render();
}

function toggleAutoRemine() {
  if (!state.mine.autoRemineUnlocked) {
    return;
  }

  state.mine.autoRemineEnabled = !state.mine.autoRemineEnabled;
  addLog(state.mine.autoRemineEnabled ? "Automatic re-mining enabled." : "Automatic re-mining disabled.");
  render();
}

function toggleGunSchedule() {
  const tunnel = getCurrentTunnel();
  const schedule = getGunScheduleForTunnel(tunnel);
  if (!state.mine.gunSchedulingUnlocked || schedule.length === 0) {
    return;
  }

  if (!state.mine.gunScheduleEnabledByTunnel) {
    state.mine.gunScheduleEnabledByTunnel = {};
  }
  state.mine.gunScheduleEnabledByTunnel[tunnel] = !state.mine.gunScheduleEnabledByTunnel[tunnel];
  addLog(
    state.mine.gunScheduleEnabledByTunnel[tunnel]
      ? `Gun schedule enabled for Tunnel ${tunnel}.`
      : `Gun schedule disabled for Tunnel ${tunnel}.`,
  );
  saveGame();
  render();
}

function setGunScheduleForTunnel(tunnel, schedule) {
  if (!state.mine.gunSchedulesByTunnel) {
    state.mine.gunSchedulesByTunnel = {};
  }
  state.mine.gunSchedulesByTunnel[tunnel] = normalizeGunSchedule(schedule);
  if (state.mine.gunScheduleEnabledByTunnel?.[tunnel]
    && state.mine.gunSchedulesByTunnel[tunnel].length === 0) {
    state.mine.gunScheduleEnabledByTunnel[tunnel] = false;
  }
}

function renderGunScheduleControls(fragment, tunnel) {
  if (!state.mine.gunSchedulingUnlocked) {
    return;
  }

  const schedule = getGunScheduleForTunnel(tunnel);
  const active = isGunScheduleActive(tunnel);
  const schedulePanel = document.createElement("section");
  schedulePanel.className = "mine-gun-schedule";

  const heading = document.createElement("strong");
  heading.textContent = `Gun schedule · Tunnel ${tunnel}`;
  schedulePanel.append(heading);

  const explanation = document.createElement("small");
  explanation.textContent = "Counts actual shots fired, then repeats from the first step on each layer.";
  schedulePanel.append(explanation);

  if (schedule.length === 0) {
    const empty = document.createElement("small");
    empty.textContent = "No steps configured.";
    schedulePanel.append(empty);
  }

  schedule.forEach((step, index) => {
    const row = document.createElement("div");
    row.className = "mine-gun-schedule-row";

    const gunSelect = document.createElement("select");
    gunSelect.className = "mine-gun-schedule-gun";
    gunSelect.setAttribute("aria-label", `Tunnel ${tunnel} schedule gun ${index + 1}`);
    const availableGuns = state.mine.buckshotGunPurchased ? GUN_IDS : ["rapidfire"];
    availableGuns.forEach((gunId) => {
      const option = document.createElement("option");
      option.value = gunId;
      option.textContent = getGunDisplayName(gunId);
      option.selected = gunId === step.gun;
      gunSelect.append(option);
    });
    gunSelect.addEventListener("change", () => {
      const updated = getGunScheduleForTunnel(tunnel);
      if (!updated[index]) {
        return;
      }
      updated[index].gun = gunSelect.value;
      setGunScheduleForTunnel(tunnel, updated);
      saveGame();
      render();
    });

    const shotsInput = document.createElement("input");
    shotsInput.className = "mine-gun-schedule-shots";
    shotsInput.type = "number";
    shotsInput.min = "1";
    shotsInput.max = "1000000";
    shotsInput.step = "1";
    shotsInput.value = String(step.shots);
    shotsInput.setAttribute("aria-label", `Tunnel ${tunnel} schedule shot count ${index + 1}`);
    shotsInput.addEventListener("change", () => {
      const updated = getGunScheduleForTunnel(tunnel);
      if (!updated[index]) {
        return;
      }
      updated[index].shots = Math.max(1, Math.min(1e6, Math.floor(Number(shotsInput.value) || 1)));
      setGunScheduleForTunnel(tunnel, updated);
      saveGame();
      render();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button button-secondary";
    removeButton.textContent = "×";
    removeButton.title = "Remove schedule step";
    removeButton.setAttribute("aria-label", `Remove Tunnel ${tunnel} schedule step ${index + 1}`);
    bindImmediateAction(removeButton, () => {
      const updated = getGunScheduleForTunnel(tunnel);
      updated.splice(index, 1);
      setGunScheduleForTunnel(tunnel, updated);
      saveGame();
      render();
    });

    row.append(gunSelect, shotsInput, removeButton);
    schedulePanel.append(row);
  });

  const scheduleActions = document.createElement("div");
  scheduleActions.className = "mine-gun-schedule-actions";
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "button button-secondary";
  toggleButton.textContent = active ? "Gun schedule: On" : "Gun schedule: Off";
  toggleButton.disabled = schedule.length === 0;
  bindImmediateAction(toggleButton, toggleGunSchedule);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "button button-secondary";
  addButton.textContent = "Add step";
  addButton.disabled = schedule.length >= GUN_SCHEDULE_MAX_STEPS;
  bindImmediateAction(addButton, () => {
    setGunScheduleForTunnel(tunnel, [...schedule, {
      gun: state.mine.buckshotGunPurchased ? "buckshot" : "rapidfire",
      shots: 1,
    }]);
    saveGame();
    render();
  });
  scheduleActions.append(toggleButton, addButton);
  schedulePanel.append(scheduleActions);
  fragment.append(schedulePanel);
}

function maybeStartAutomaticDrilling() {
  const mode = state.mine.autoDrillMode;
  if (
    mode !== "off"
    && state.mine.autoDrillUnlocked
    && !state.drill.active
    && !state.drill.completed
    && (mode === "ignoreOres" || getActiveDeposits().length === 0)
  ) {
    startDrilling(true);
    return true;
  }

  return false;
}

function runDebugAction(action) {
  if (action === "ammo") {
    addAmmo(10, "leek");
    addLog("Debug: +10 leek ammunition.");
  }

  if (action === "stone") {
    state.stockpile.limestone += 25;
    addLog("Debug: +25 limestone.");
  }

  if (action === "copper" || action === "clay") {
    spawnDeposit(action);
  }

  if (action === "realityShield") {
    activateRealityShieldCheat();
    addLog("Debug: temporary Reality Shield battle started.");
  }

  render();
}

function activateRealityShieldCheat() {
  if (getRealityShield().active) {
    return false;
  }

  const started = startRealityShield(true);
  if (started) {
    addLog("Code accepted: temporary Diamond-Tipped Drill access granted for this battle.");
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
  }
  return started;
}

function applyPlaytestCode(code = elements.codeField?.value.trim() ?? "") {
  const enteredCode = String(code).trim();
  if (enteredCode.toLowerCase() === PLAYTEST_PANEL_CHEAT_CODE.toLowerCase()) {
    state.cheatPanelUnlocked = true;
    state.playtestCheats = {
      ...PLAYTEST_CHEAT_DEFAULTS,
      ...(state.playtestCheats ?? {}),
    };
    addLog("Playtest cheat panel unlocked.");
    saveGame();
    if (elements.codeStatus) {
      elements.codeStatus.textContent = "Code accepted. Playtest cheat panel unlocked for this save.";
    }
    if (!IS_NODE_TEST_ENVIRONMENT) {
      render();
    }
    return true;
  }

  if (enteredCode.toLowerCase() !== REALITY_SHIELD_CHEAT_CODE.toLowerCase()) {
    if (elements.codeStatus) {
      elements.codeStatus.textContent = "Unknown code.";
    }
    return false;
  }

  const started = activateRealityShieldCheat();
  if (elements.codeStatus) {
    elements.codeStatus.textContent = started
      ? "Code accepted. Temporary Reality Shield battle started."
      : "A Reality Shield battle is already active.";
  }
  if (started) {
    saveGame();
  }
  return started;
}

function togglePlaytestCheat(cheatId) {
  if (!state.cheatPanelUnlocked || !Object.hasOwn(PLAYTEST_CHEAT_DEFAULTS, cheatId)) {
    return false;
  }
  state.playtestCheats = {
    ...PLAYTEST_CHEAT_DEFAULTS,
    ...(state.playtestCheats ?? {}),
    [cheatId]: !isPlaytestCheatEnabled(cheatId),
  };
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return state.playtestCheats[cheatId];
}

function changePlaytestDrillUpgrade(direction) {
  if (!state.cheatPanelUnlocked || ![-1, 1].includes(direction)) {
    return false;
  }
  const upgradeIds = Object.keys(DRILL_UPGRADES);
  const currentIndex = upgradeIds.indexOf(state.drill.upgradeId);
  const targetIndex = Math.min(upgradeIds.length - 1, Math.max(0, currentIndex + direction));
  if (currentIndex < 0 || targetIndex === currentIndex) {
    return false;
  }
  const upgradeId = upgradeIds[targetIndex];
  state.drill.upgradeId = upgradeId;
  Object.values(state.mine.tunnelProgress).forEach((progress) => {
    if (isSaveRecord(progress) && isSaveRecord(progress.drill)) {
      progress.drill.upgradeId = upgradeId;
    }
  });
  addLog(`Playtest cheat set drill to ${DRILL_UPGRADES[upgradeId].label}.`);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return true;
}

function grantNextTunnelRights() {
  if (!state.cheatPanelUnlocked) {
    return false;
  }
  if (!Array.isArray(state.mine.unlockedTunnels)) {
    state.mine.unlockedTunnels = [1];
  }
  const nextTunnel = [2, 3].find((tunnel) => !state.mine.unlockedTunnels.includes(tunnel));
  if (!nextTunnel) {
    return false;
  }
  state.mine.unlockedTunnels.push(nextTunnel);
  if (nextTunnel === 2) {
    state.mine.miningRightsPurchased = true;
  } else {
    state.mine.miningRightsPurchased = true;
    state.mine.tunnelThreeRightsPurchased = true;
  }
  addLog(`Playtest cheat granted Tunnel ${nextTunnel} rights for free.`);
  saveGame();
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
  return nextTunnel;
}

function registerRealityShieldCheatKey(key) {
  if (typeof key !== "string" || key.length !== 1) {
    return false;
  }

  realityShieldCheatBuffer = `${realityShieldCheatBuffer}${key}`
    .slice(-REALITY_SHIELD_CHEAT_CODE.length);
  if (realityShieldCheatBuffer.toLowerCase() !== REALITY_SHIELD_CHEAT_CODE.toLowerCase()) {
    return false;
  }

  realityShieldCheatBuffer = "";
  return activateRealityShieldCheat();
}

function spawnDeposit(type) {
  if (!isObtainableMaterial(type)) {
    addLog("Reality Shield crosshairs are internal challenge targets.");
    return;
  }

  if (state.drill.active || state.drill.completed) {
    addLog("Debug spawn unavailable after drilling begins.");
    return;
  }

  const occupiedCells = new Set(state.deposits.filter((deposit) => deposit.segmentsRemaining > 0).map((deposit) => deposit.cell));
  const availableCells = Array.from({ length: CONFIG.columns * CONFIG.rows }, (_, index) => index)
    .filter((cell) => !occupiedCells.has(cell));

  if (availableCells.length === 0) {
    addLog("Debug: no open host-rock cells remain.");
    return;
  }

  const cell = availableCells[Math.floor(Math.random() * availableCells.length)];
  const deposit = createDeposit(
    { cell, type },
    state.deposits.length,
    getLayerStats(state.mine.currentLayer, getCurrentTunnel()).yieldMultiplier,
  );
  state.deposits.push(deposit);
  addLog(`Debug: spawned ${RESOURCE_DEFINITIONS[type].label}.`);
}

function addLog(message) {
  const timestamp = new Intl.DateTimeFormat(undefined, {
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());

  state.logs.unshift({ timestamp, message });
  state.logs = state.logs.slice(0, CONFIG.maxLogEntries);
}

function updateCrewOperatedMachines(deltaSeconds) {
  const processingDelta = deltaSeconds * getProcessingSpeedMultiplier();
  state.kilnJobs.forEach((job) => {
    job.secondsRemaining -= processingDelta;
  });
  state.kilnJobs.slice().forEach((job) => {
    if (job.secondsRemaining <= 0) {
      completeKilnJob(job);
      state.kilnJobs = state.kilnJobs.filter((candidate) => candidate !== job);
    }
  });

  state.molderJobs.forEach((job) => {
    job.secondsRemaining -= processingDelta;
  });
  state.molderJobs.slice().forEach((job) => {
    if (job.secondsRemaining <= 0) {
      completeMolderJob(job);
    }
  });

  state.arcFurnaceJobs.forEach((job) => {
    job.secondsRemaining -= processingDelta;
  });
  state.arcFurnaceJobs.slice().forEach((job) => {
    if (job.secondsRemaining <= 0) {
      completeArcFurnaceJob(job);
    }
  });

  // Machines begin their next job on their own. The player only supplies a placed,
  // connected setup and enough hamster crew; no per-item operation buttons are needed.
  startMolderJob();
  startBulletCoreCasting();
  startJacketFormerCoating();
  startCasingMachineLiquid();
  startArcFurnaceJobs();
  startKilnJobs();
}

function updateFactory(deltaSeconds) {
  emitCasingMachineOutputs();
  advanceConveyorItems(deltaSeconds);
  flushMolderOutputs();
  flushArcFurnaceOutputs();
  startMolderJob();
  emitStackerOutputs();
  emitStorageOutputs();

  planterAccumulator += deltaSeconds * getProcessingSpeedMultiplier();
  while (
    planterAccumulator >= CONFIG.planterCycleSeconds
    && state.planterQueue < CONFIG.maxPlanterQueue
  ) {
    planterAccumulator -= CONFIG.planterCycleSeconds;
    queuePlanterLeek();
  }

  // A blocked planter stores only two visible leeks instead of building up an invisible backlog.
  if (state.planterQueue >= CONFIG.maxPlanterQueue) {
    planterAccumulator = 0;
  }
  dispatchQueuedPlanterLeek();
}

function update(deltaSeconds) {
  updateCrewOperatedMachines(deltaSeconds);
  updateFactory(deltaSeconds);
  if (getRealityShield()?.active) {
    updateRealityShield(deltaSeconds);
    return;
  }
  if (state.drill.completed) {
    return;
  }

  if (state.drill.active) {
    const priorProgress = 1 - state.drill.hitPointsRemaining / state.drill.hitPointsTotal;
    const appliedDamage = Math.min(
      getDrillDps() * deltaSeconds,
      state.drill.hitPointsRemaining,
    );
    state.drill.hitPointsRemaining -= appliedDamage;
    const currentProgress = 1 - state.drill.hitPointsRemaining / state.drill.hitPointsTotal;
    const hostRockYield = getHostRockYield(
      getCurrentTunnel(),
      getBandForLayer(state.mine.currentLayer),
    );
    const hostRockGained = Math.floor(currentProgress * hostRockYield)
      - Math.floor(priorProgress * hostRockYield);

    if (hostRockGained > 0) {
      state.stockpile[getHostRockMaterial()] += hostRockGained * getMaterialYieldMultiplier();
    }

    if (state.drill.hitPointsRemaining <= 0) {
      completeDrilling();
    }
    return;
  }

  if (maybeStartAutomaticDrilling()) {
    return;
  }

  const canAutoFire = state.autoExtractorEnabled && getTotalAmmo() >= 1 && getTargetDeposit();
  if (!canAutoFire) {
    // A gun without ammunition does not store missed firing time for a later burst.
    autoFireAccumulator = 0;
    return;
  }

  autoFireAccumulator += deltaSeconds * getSelectedGunFireRate();
  while (autoFireAccumulator >= 1) {
    fireLeek("auto");
    autoFireAccumulator -= 1;

    if (getTotalAmmo() < 1 || !getTargetDeposit()) {
      autoFireAccumulator = 0;
      break;
    }
  }

}

function setActiveView(view) {
  const requestedViewExists = Array.from(elements.views).some((section) => section.dataset.view === view);
  if (!requestedViewExists) {
    return;
  }

  // A hidden Phaser canvas keeps rendering at display rate. Recreate it when the
  // player comes back instead of spending CPU on a factory that cannot be seen.
  const leavingFactory = activeView === "factory" && view !== "factory";
  if (leavingFactory && machineGame) {
    rebuildMachineScene();
  }

  // Navigation is a valid tutorial action too; the overlay button is only a shortcut.
  if (view === "inventory" && state.tutorial.visible && getTutorialStage() === "factoryRoute") {
    state.tutorial.stage = "inventorySelect";
  }

  activeView = view;
  elements.views.forEach((section) => {
    const isActive = section.dataset.view === activeView;
    section.hidden = !isActive;
    section.setAttribute("aria-hidden", String(!isActive));
  });
  elements.viewNavButtons.forEach((button) => {
    const isActive = button.dataset.viewTarget === activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  const viewTitle = activeView === "construction"
    ? "Shop"
    : `${activeView[0].toUpperCase()}${activeView.slice(1)}`;
  document.title = `Hamster Miners — ${viewTitle}`;
  render();
  if (activeView === "factory") {
    resizeFactoryScene();
    window.requestAnimationFrame?.(() => resizeFactoryScene());
  }
  saveGame();
}

function handleTutorialAction() {
  if (!state.tutorial.visible) {
    return;
  }

  if (getTutorialStage() === "intro") {
    state.tutorial.stage = "factoryRoute";
    setActiveView("factory");
    return;
  }

  if (getTutorialStage() === "factoryRoute") {
    state.tutorial.stage = "inventorySelect";
    setActiveView("inventory");
    return;
  }

  if (getTutorialStage() === "mineReturn") {
    state.tutorial.stage = "mineDisplacement";
    state.mineHudUnlocked = true;
    setActiveView("mine");
    return;
  }

  if (getTutorialStage() === "storeLeek") {
    setActiveView("factory");
    return;
  }

  if (getTutorialStage() === "buildDuster") {
    setActiveView("construction");
    return;
  }

  if (getTutorialStage() === "placeDuster" || getTutorialStage() === "saleSetup" || getTutorialStage() === "saleRoute") {
    setActiveView("inventory");
    return;
  }

  if (getTutorialStage() === "saleFilter") {
    setActiveView("factory");
    return;
  }

  if (getTutorialStage() === "complete") {
    state.tutorial.visible = false;
    render();
  }
}

function render() {
  renderStatus();
  renderTutorialOverlay();

  if (activeView === "factory") {
    renderTutorial();
    renderMachineGrid();
    renderFactoryMachineControls();
    renderAmmoMaker();
    renderMachineOverlay();
  } else if (activeView === "mine") {
    renderMineGrid();
    renderMineInformationOverlay();
    renderRealityShield();
    renderAmmoMaker();
    renderStockpile();
    renderDrill();
    renderLog();
  } else if (activeView === "inventory") {
    renderMachineInventory();
  } else if (activeView === "construction") {
    renderConstruction();
  } else if (activeView === "recipes") {
    renderRecipes();
  } else if (activeView === "options") {
    renderOptions();
  }
}

function renderOptions() {
  elements.exportSaveButton.disabled = false;
  elements.importSaveButton.disabled = elements.saveDataField.value.trim().length === 0;
  if (!elements.cheatPanel) {
    return;
  }
  elements.cheatPanel.hidden = !state.cheatPanelUnlocked;
  if (!state.cheatPanelUnlocked) {
    return;
  }

  [
    [elements.cheatDrillDpsToggle, "drillDpsX10", "×10 drill DPS"],
    [elements.cheatMaterialYieldToggle, "materialYieldX10", "×10 material yield"],
    [elements.cheatProductionSpeedToggle, "productionSpeedX5", "×5 conveyor and processing speed"],
    [elements.cheatSellValueToggle, "sellValueX10", "×10 sell value"],
  ].forEach(([button, cheatId, label]) => {
    if (!button) {
      return;
    }
    const enabled = isPlaytestCheatEnabled(cheatId);
    button.textContent = `${label}: ${enabled ? "On" : "Off"}`;
    button.setAttribute("aria-pressed", String(enabled));
  });

  const drillUpgradeIds = Object.keys(DRILL_UPGRADES);
  const currentDrillIndex = drillUpgradeIds.indexOf(state.drill.upgradeId);
  const nextDrillUpgrade = DRILL_UPGRADES[drillUpgradeIds[currentDrillIndex + 1]];
  const previousDrillUpgrade = DRILL_UPGRADES[drillUpgradeIds[currentDrillIndex - 1]];
  elements.cheatDrillUpgradeButton.disabled = !nextDrillUpgrade;
  elements.cheatDrillUpgradeButton.textContent = nextDrillUpgrade
    ? `Upgrade drill → ${nextDrillUpgrade.label}`
    : "Drill is at its highest level";
  elements.cheatDrillDowngradeButton.disabled = !previousDrillUpgrade;
  elements.cheatDrillDowngradeButton.textContent = previousDrillUpgrade
    ? `Downgrade drill → ${previousDrillUpgrade.label}`
    : "Drill is at its lowest level";

  const nextTunnel = [2, 3].find((tunnel) => !state.mine.unlockedTunnels.includes(tunnel));
  elements.cheatTunnelRightsButton.disabled = !nextTunnel;
  elements.cheatTunnelRightsButton.textContent = nextTunnel
    ? `Get Tunnel ${nextTunnel} rights (free)`
    : "All tunnel rights unlocked";
}

function renderRecipes() {
  if (!elements.recipesList || elements.recipesList.dataset.rendered === "true") {
    return;
  }

  const fragment = document.createDocumentFragment();
  CRAFTING_RECIPES.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "panel recipe-card";

    const machine = document.createElement("p");
    machine.className = "recipe-machine";
    machine.textContent = `${recipe.category} · ${recipe.machine}`;

    const title = document.createElement("h3");
    title.textContent = recipe.name;

    const flow = document.createElement("p");
    flow.className = "recipe-flow";
    flow.textContent = `${recipe.input} → ${recipe.output}`;

    const note = document.createElement("p");
    note.className = "recipe-note";
    note.textContent = recipe.note;

    card.append(machine, title, flow, note);
    fragment.append(card);
  });
  elements.recipesList.replaceChildren(fragment);
  elements.recipesList.dataset.rendered = "true";
}

function renderMachineInventory() {
  const showingMachines = activeInventorySection === "machines";
  elements.inventoryMachinesSection.hidden = !showingMachines;
  elements.inventoryItemsSection.hidden = showingMachines;
  elements.inventorySectionButtons.forEach((button) => {
    const selected = button.dataset.inventorySection === activeInventorySection;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  elements.inventoryCategoryButtons.forEach((button) => {
    const selected = button.dataset.inventoryCategory === activeInventoryCategory;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  const inventory = state.machineInventory;
  const visibleCards = [];
  elements.inventoryMachineCards.forEach((card) => {
    const machineId = card.dataset.inventoryMachine;
    const hidden = (inventory[machineId] ?? 0) < 1
      || !machineBelongsToCategory(machineId, activeInventoryCategory);
    card.hidden = hidden;
    let hitArea = card.querySelector(".inventory-card-hit-area");
    if (!hitArea) {
      hitArea = document.createElement("button");
      hitArea.type = "button";
      hitArea.className = "inventory-card-hit-area";
      hitArea.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        selectInventoryMachine(card.dataset.inventoryMachine);
      });
      hitArea.addEventListener("click", (event) => {
        event.stopPropagation();
        selectInventoryMachine(card.dataset.inventoryMachine);
      });
      card.append(hitArea);
    }
    const title = card.querySelector("h3")?.textContent ?? machineId;
    hitArea.setAttribute("aria-label", `Select ${title}`);
    if (!hidden) {
      visibleCards.push(card);
    }
  });
  if (!selectedInventoryMachineId
    || !visibleCards.some((card) => card.dataset.inventoryMachine === selectedInventoryMachineId)) {
    selectedInventoryMachineId = visibleCards[0]?.dataset.inventoryMachine ?? null;
  }
  elements.inventoryMachineCards.forEach((card) => {
    const selected = card.dataset.inventoryMachine === selectedInventoryMachineId;
    card.classList.toggle("is-selected", selected);
    card.querySelector(".inventory-card-hit-area")?.setAttribute("aria-pressed", String(selected));
  });
  elements.conveyorInventoryCount.textContent = `Stored: ${formatNumber(inventory.conveyor)}`;
  elements.planterInventoryCount.textContent = `Stored: ${formatNumber(inventory.planter)}`;
  elements.ammoShaperInventoryCount.textContent = `Stored: ${formatNumber(inventory.ammoShaper)}`;
  elements.jacketFormerInventoryCount.textContent = `Stored: ${formatNumber(inventory.jacketFormer)}`;
  elements.casingMachineInventoryCount.textContent = `Stored: ${formatNumber(inventory.casingMachine)}`;
  elements.storageInventoryCount.textContent = `Stored: ${formatNumber(inventory.materialStorage)}`;
  elements.sellTubeInventoryCount.textContent = `Stored: ${formatNumber(inventory.sellTube)}`;
  elements.graphiteLacedSellTubeInventoryCount.textContent = `Stored: ${formatNumber(inventory.graphiteLacedSellTube)}`;
  elements.leekDusterInventoryCount.textContent = `Stored: ${formatNumber(inventory.leekDuster)}`;
  elements.primitiveUpgraderInventoryCount.textContent = `Stored: ${formatNumber(inventory.primitiveUpgrader)}`;
  elements.rockShackInventoryCount.textContent = `Stored: ${formatNumber(inventory.rockShack)}`;
  elements.clayKilnInventoryCount.textContent = `Stored: ${formatNumber(inventory.clayKiln)}`;
  elements.ingotMolderInventoryCount.textContent = `Stored: ${formatNumber(inventory.ingotMolder)}`;
  elements.graphiteCopperAnnealerInventoryCount.textContent = `Stored: ${formatNumber(inventory.graphiteCopperAnnealer)}`;
  elements.graniteProcessorInventoryCount.textContent = `Stored: ${formatNumber(inventory.graniteProcessor)}`;
  elements.bronzeStampInventoryCount.textContent = `Stored: ${formatNumber(inventory.bronzeStamp)}`;
  elements.bronzePillarsInventoryCount.textContent = `Stored: ${formatNumber(inventory.bronzePillars)}`;
  elements.extruderInventoryCount.textContent = `Stored: ${formatNumber(inventory.extruder)}`;
  elements.leekFiberExtractorInventoryCount.textContent = `Stored: ${formatNumber(inventory.leekFiberExtractor)}`;
  elements.contactMakerInventoryCount.textContent = `Stored: ${formatNumber(inventory.contactMaker)}`;
  elements.miniElectricArcFurnaceInventoryCount.textContent = `Stored: ${formatNumber(inventory.miniElectricArcFurnace)}`;
  elements.metalPressInventoryCount.textContent = `Stored: ${formatNumber(inventory.metalPress)}`;
  elements.stackerInventoryCount.textContent = `Stored: ${formatNumber(inventory.stacker)}`;
  elements.splitterInventoryCount.textContent = `Stored: ${formatNumber(inventory.splitter)}`;
  elements.quartzWheelCutterInventoryCount.textContent = `Stored: ${formatNumber(inventory.quartzWheelCutter)}`;
  renderInventoryDetail(selectedInventoryMachineId);
  elements.selectInventoryConveyorButton.disabled = inventory.conveyor <= 0;
  elements.selectPlanterButton.disabled = inventory.planter <= 0;
  elements.selectAmmoShaperButton.disabled = inventory.ammoShaper <= 0;
  elements.selectJacketFormerButton.disabled = inventory.jacketFormer <= 0;
  elements.selectCasingMachineButton.disabled = inventory.casingMachine <= 0;
  elements.selectStorageButton.disabled = inventory.materialStorage <= 0;
  elements.selectSellTubeButton.disabled = inventory.sellTube <= 0;
  elements.selectGraphiteLacedSellTubeButton.disabled = inventory.graphiteLacedSellTube <= 0;
  elements.selectLeekDusterButton.disabled = inventory.leekDuster <= 0;
  elements.selectPrimitiveUpgraderButton.disabled = inventory.primitiveUpgrader <= 0;
  elements.selectRockShackButton.disabled = inventory.rockShack <= 0;
  elements.selectClayKilnButton.disabled = inventory.clayKiln <= 0;
  elements.selectIngotMolderButton.disabled = inventory.ingotMolder <= 0;
  elements.selectGraphiteCopperAnnealerButton.disabled = inventory.graphiteCopperAnnealer <= 0;
  elements.selectGraniteProcessorButton.disabled = inventory.graniteProcessor <= 0;
  elements.selectBronzeStampButton.disabled = inventory.bronzeStamp <= 0;
  elements.selectBronzePillarsButton.disabled = inventory.bronzePillars <= 0;
  elements.selectExtruderButton.disabled = inventory.extruder <= 0;
  elements.selectLeekFiberExtractorButton.disabled = inventory.leekFiberExtractor <= 0;
  elements.selectContactMakerButton.disabled = inventory.contactMaker <= 0;
  elements.selectMiniElectricArcFurnaceButton.disabled = inventory.miniElectricArcFurnace <= 0;
  elements.selectMetalPressButton.disabled = inventory.metalPress <= 0;
  elements.selectStackerButton.disabled = inventory.stacker <= 0;
  elements.selectSplitterButton.disabled = inventory.splitter <= 0;
  elements.selectQuartzWheelCutterButton.disabled = inventory.quartzWheelCutter <= 0;

  const fragment = document.createDocumentFragment();
  Object.entries(STOCKPILE_LABELS).forEach(([material, label]) => {
    if ((state.stockpile[material] ?? 0) <= 0) {
      return;
    }
    const box = document.createElement("article");
    box.className = "inventory-item-box";
    box.dataset.material = material;

    const visual = document.createElement("span");
    visual.className = `inventory-item-visual is-${material}`;
    visual.setAttribute("aria-hidden", "true");

    const itemLabel = document.createElement("div");
    itemLabel.className = "inventory-item-label";
    itemLabel.textContent = label;

    const itemCount = document.createElement("div");
    itemCount.className = "inventory-item-count";
    itemCount.textContent = formatNumber(state.stockpile[material] ?? 0);

    box.append(visual, itemLabel, itemCount);
    fragment.append(box);
  });
  elements.inventoryStorageList.replaceChildren(fragment);
}

function renderInventoryDetail(machineId) {
  const card = [...elements.inventoryMachineCards].find((candidate) => (
    candidate.dataset.inventoryMachine === machineId
  ));
  const placeButton = elements.inventoryDetailPlaceButton;
  if (!card || !machineId) {
    elements.inventoryDetailTitle.textContent = "No stored machine";
    elements.inventoryDetailDescription.textContent = "This category has no machinery available for placement.";
    elements.inventoryDetailOwned.textContent = "Stored: 0";
    placeButton.disabled = true;
    placeButton.hidden = false;
    placeButton.textContent = "Select a machine";
    return;
  }

  const sourceButton = card.querySelector(".button");
  elements.inventoryDetailTitle.textContent = card.querySelector("h3")?.textContent ?? machineId;
  elements.inventoryDetailDescription.textContent = card.querySelector("p")?.textContent ?? "";
  elements.inventoryDetailOwned.textContent = card.querySelector("strong")?.textContent
    ?? `Stored: ${formatNumber(state.machineInventory[machineId] ?? 0)}`;
  placeButton.hidden = !sourceButton;
  placeButton.disabled = !sourceButton || (state.machineInventory[machineId] ?? 0) < 1;
  placeButton.textContent = sourceButton?.textContent ?? "No placement action";
}

function selectInventoryMachine(machineId) {
  if ((state.machineInventory[machineId] ?? 0) < 1
    || !machineBelongsToCategory(machineId, activeInventoryCategory)) {
    return;
  }
  selectedInventoryMachineId = machineId;
  render();
}

function selectInventoryMachineForPlacement(machineId) {
  if (machineId === "conveyor") {
    selectConveyorForPlacement();
    return;
  }
  selectMachineForPlacement(machineId);
}

function setInventorySection(section) {
  if (section !== "machines" && section !== "items") {
    return;
  }
  activeInventorySection = section;
  render();
}

function setInventoryCategory(category) {
  if (!MACHINE_CATEGORY_ORDER.includes(category)) {
    return;
  }
  activeInventoryCategory = category;
  render();
}

function setShopCategory(category) {
  if (!MACHINE_CATEGORY_ORDER.includes(category)) {
    return;
  }
  activeShopCategory = category;
  render();
}

function getFactoryMachineProgressState(machine) {
  if (!machine || machine.id === "materialStorage") {
    return "";
  }

  return [
    state.dusterJob?.material ?? "",
    state.kilnJobs.map((job) => job.kilnInstanceId).join(","),
    state.kilnInputs.map((input) => input.kilnInstanceId).join(","),
    state.molderJobs.map((job) => job.molderInstanceId).join(","),
    JSON.stringify(state.molderOutputBuffers[machine.instanceId] ?? {}),
    state.arcFurnaceJobs.map((job) => job.furnaceInstanceId).join(","),
    JSON.stringify(state.arcFurnaceOutputBuffers[machine.instanceId] ?? {}),
    machine.mode ?? "",
    machine.stackSize ?? "",
    JSON.stringify(state.arcFurnaceInputs[machine.instanceId] ?? {}),
    JSON.stringify(state.stackerBuffers[machine.instanceId] ?? {}),
    JSON.stringify(state.casingMachineInputs[machine.instanceId] ?? {}),
    state.moltenCopper.some((liquidMetal) => (
      (liquidMetal.smelterInstanceId ?? liquidMetal.kilnInstanceId) === machine.instanceId
    )),
  ].join("|");
}

function getMachineActionProgressNote(machine) {
  if (machine?.id === "clayKiln") {
    const kilnJob = state.kilnJobs.find((job) => job.kilnInstanceId === machine.instanceId);
    const hasInput = state.kilnInputs.some((input) => input.kilnInstanceId === machine.instanceId);
    const blockedByLiquid = state.moltenCopper.some((liquidMetal) => (
      liquidMetal.kilnInstanceId === machine.instanceId
    ));
    return kilnJob
      ? `Smelting: ${kilnJob.secondsRemaining.toFixed(1)}s · 2 crew assigned.`
      : blockedByLiquid
        ? "Liquid copper is waiting for an adjacent Ingot Molder or Bullet Core Caster."
        : !hasInput
          ? "Waiting for a low-melting metal at its centre input."
          : getAvailableCrew() < 2
            ? "Waiting for 2 available crew hamsters."
            : "Crew will automatically smelt the next delivered ore.";
  }

  if (machine?.id === "ingotMolder") {
    const link = getMolderKilnLink(machine);
    const molderJob = state.molderJobs.find((job) => job.molderInstanceId === machine.instanceId);
    const outputConveyor = getInternalConveyor(machine, 0);
    const outputBlocked = Boolean(outputConveyor && getConveyorItem(outputConveyor));
    const outputBuffer = state.molderOutputBuffers[machine.instanceId];
    const hasLinkedLiquid = Boolean(link && findMoltenCopperIndex(link.kiln.instanceId) >= 0);
    return molderJob
      ? molderJob.secondsRemaining <= 0
        ? "Finished ingot is waiting for its output lane to clear."
        : `Molding: ${molderJob.secondsRemaining.toFixed(1)}s · 1 crew assigned.`
      : outputBuffer
        ? "Finished ingot is waiting for its output lane to clear."
        : !link
          ? "Place this machine directly in front of a Clay Kiln liquid outlet."
          : outputBlocked
            ? "Its output lane is occupied. Move the ingot onward before molding another."
            : !hasLinkedLiquid
              ? "Waiting for liquid metal."
              : getAvailableCrew() < 1
                ? "Waiting for 1 available crew hamster."
                : "Crew will mold the next ingot in its reusable mold.";
  }

  if (machine?.id === "miniElectricArcFurnace") {
    const job = state.arcFurnaceJobs.find((candidate) => (
      candidate.furnaceInstanceId === machine.instanceId
    ));
    const mode = getArcFurnaceMode(machine);
    return job
      ? `Smelting ${job.material === "bronze" ? "Bronze alloy" : "one metal"}: ${job.secondsRemaining.toFixed(1)}s · 1 crew assigned.`
      : mode === "alloy2"
        ? "2-input alloy mode accepts copper through the primary input and tin through either alloy input: 5 copper + 1 tin produces 6 liquid Bronze in 12 seconds."
        : mode === "alloy3"
          ? "3-input alloy mode is reserved for recipes requiring three different metal inputs. No 3-input recipes are available yet."
          : "Single smelting accepts one ore or ingot through the primary input and takes 2 seconds. Two Hematite make liquid Iron, while two Clay fire directly into Ceramic; both take 4 seconds. Both alloy inputs are unused.";
  }

  return null;
}

function updateMachineActionProgressNote(machine) {
  const noteKey = {
    clayKiln: "kiln-progress",
    ingotMolder: "molder-progress",
    miniElectricArcFurnace: "arc-furnace-progress",
  }[machine?.id];
  if (!noteKey || !elements.machineActions) {
    return;
  }
  const note = elements.machineActions.querySelector(
    `[data-machine-action-note="${noteKey}"]`,
  );
  const text = getMachineActionProgressNote(machine);
  if (note && text !== null) {
    note.textContent = text;
  }
}

function renderFactoryMachineControls() {
  const entity = selectedFactoryEntity;
  const selectionCount = selectedFactoryEntities.length;
  const isGroupMoving = Boolean(groupMoveState);
  const isFactorySelection = activeView === "factory"
    && (entity || selectionCount > 0 || isGroupMoving);
  const machine = entity?.type === "machine" ? getMachineByInstanceId(entity.instanceId) : null;
  const storageOutputs = machine?.id === "materialStorage"
    ? getActiveStorageOutputPorts(machine)
    : [];
  const storageState = storageOutputs.map((port) => (
    `${getStorageOutputKey(machine, port)}:${getStorageOutputFilter(machine, port).join(",")}`
  )).join("|");
  const entityHasCargo = machine?.id === "materialStorage" ? false : isFactoryEntityInTransit(entity);
  const machineProgressState = getFactoryMachineProgressState(machine);
  const signature = [
    activeView,
    entity?.type ?? "none",
    entity?.id ?? "",
    entity?.column ?? "",
    entity?.row ?? "",
    selectedFactoryEntities.map(getFactoryEntitySelectionKey).join(","),
    groupMoveState
      ? `${getFactoryGroupMoveSignature()}:${hoveredFactoryTile?.column ?? ""}:${hoveredFactoryTile?.row ?? ""}`
      : "",
    selectedStorageOutputKey ?? "",
    storageState,
    entityHasCargo,
    machineProgressState,
  ].join(";");
  if (signature === lastFactoryControlsSignature) {
    updateMachineActionProgressNote(machine);
    return;
  }
  lastFactoryControlsSignature = signature;

  elements.machineControls.hidden = !isFactorySelection;
  elements.machineActions.replaceChildren();
  if (!isFactorySelection) {
    return;
  }

  if (isGroupMoving) {
    elements.selectedMachineLabel.textContent = `Moving ${selectionCount} factory pieces`;
    elements.machineSelectionHelp.textContent = "Click a green position to place the group. Right-click or × cancels.";
    elements.pickUpMachineButton.textContent = "Pick up selected";
    elements.pickUpMachineButton.disabled = true;
    elements.moveMachineButton.textContent = hoveredFactoryTile
      ? (isFactoryGroupPlacementBuildable(hoveredFactoryTile.column, hoveredFactoryTile.row)
        ? "Place selected group"
        : "Blocked position")
      : "Place selected group";
    elements.moveMachineButton.disabled = !hoveredFactoryTile
      || !isFactoryGroupPlacementBuildable(hoveredFactoryTile.column, hoveredFactoryTile.row);
    return;
  }

  if (selectionCount > 1) {
    const records = getSelectedFactoryEntityRecords();
    elements.selectedMachineLabel.textContent = `${selectionCount} factory pieces selected`;
    elements.machineSelectionHelp.textContent = "Drag from an empty tile to select a group. Shift-click or Shift-drag adds pieces.";
    elements.pickUpMachineButton.textContent = `Pick up ${selectionCount} pieces`;
    elements.pickUpMachineButton.disabled = !canPickUpSelectedFactoryEntities(records);
    elements.moveMachineButton.textContent = `Move ${selectionCount} pieces`;
    elements.moveMachineButton.disabled = records.length !== selectionCount;
    return;
  }

  if (entity.type === "conveyor") {
    elements.selectedMachineLabel.textContent = "Conveyor selected";
    elements.machineSelectionHelp.textContent = "Drag from an empty tile to select multiple factory pieces.";
    const canPickUp = Boolean(getFactorySelectableConveyor(entity.column, entity.row))
      && (getTutorialStage() === "complete" || Boolean(getPlacedConveyor(entity.column, entity.row)));
    elements.pickUpMachineButton.textContent = "Pick up";
    elements.moveMachineButton.textContent = "Move / place more";
    elements.pickUpMachineButton.disabled = !canPickUp;
    elements.moveMachineButton.disabled = !canPickUp;
    return;
  }

  elements.selectedMachineLabel.textContent = machine
    ? `${getMachineDisplayName(machine.id)} selected`
    : "No machine selected";
  elements.machineSelectionHelp.textContent = "Q / E rotates the selected building. Drag from an empty tile to select multiple pieces.";
  const canPickUp = canPickUpMachine(machine);
  elements.pickUpMachineButton.textContent = "Pick up";
  elements.moveMachineButton.textContent = "Move / place more";
  elements.pickUpMachineButton.disabled = !canPickUp;
  elements.moveMachineButton.disabled = !canPickUp;
  if (machine) {
    renderMachineActions(machine);
  }
}

function addMachineAction(label, onClick, disabled = false, className = "button button-secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.disabled = disabled;
  bindImmediateAction(button, onClick);
  elements.machineActions.append(button);
}

function bindImmediateAction(button, action) {
  // Dynamic controls are regenerated on the simulation's 0.1s visual tick.
  // Activating on press keeps the action from disappearing between pointer-down and click.
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!button.disabled) {
      action();
    }
  });
  button.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !button.disabled) {
      event.preventDefault();
      action();
    }
  });
}

function addMachineActionNote(text, key = null) {
  const note = document.createElement("small");
  note.className = "machine-action-note";
  if (key) {
    note.dataset.machineActionNote = key;
  }
  note.textContent = text;
  elements.machineActions.append(note);
}

function toggleAmmoShaperMode() {
  state.mine.ammoShaperMode = state.mine.ammoShaperMode === "coated" ? "basic" : "coated";
  addLog(
    state.mine.ammoShaperMode === "coated"
      ? "Bullet Core Caster set to coated mode. Leeks wait for liquid metal before crossing the transformer."
      : "Bullet Core Caster set to basic mode. Leeks form standard rounds immediately.",
  );
  render();
}

function selectStorageOutput(storage, port) {
  selectedStorageOutputKey = getStorageOutputKey(storage, port);
  render();
}

function renderStorageOutputControls(storage, outputs) {
  const selectedPort = outputs.find((port) => (
    getStorageOutputKey(storage, port) === selectedStorageOutputKey
  )) ?? outputs[0];
  selectedStorageOutputKey = getStorageOutputKey(storage, selectedPort);

  const controls = document.createElement("section");
  controls.className = "storage-output-controls";

  const tabs = document.createElement("div");
  tabs.className = "storage-output-tabs";
  outputs.forEach((port, index) => {
    const tab = document.createElement("button");
    const isSelected = port.number === selectedPort.number;
    tab.type = "button";
    tab.className = `storage-output-tab${isSelected ? " is-selected" : ""}`;
    tab.textContent = `${index + 1} ${getOrientationSymbol(port.direction)}`;
    tab.title = `Configure Output ${index + 1}`;
    tab.setAttribute("aria-label", `Configure storage output ${index + 1}`);
    tab.setAttribute("aria-pressed", String(isSelected));
    bindImmediateAction(tab, () => selectStorageOutput(storage, port));
    tabs.append(tab);
  });

  const summary = document.createElement("small");
  summary.className = "storage-output-summary";
  const filter = new Set(getStorageOutputFilter(storage, selectedPort));
  const displayNumber = getStorageOutputDisplayNumber(storage, selectedPort);
  summary.textContent = `Output ${displayNumber} ${getOrientationSymbol(selectedPort.direction)} · ${filter.size === 0 ? "Nothing allowed" : `${filter.size} material${filter.size === 1 ? "" : "s"} allowed`}`;

  const filters = document.createElement("div");
  filters.className = "storage-filter-grid";
  Object.keys(STOCKPILE_LABELS).forEach((material) => {
    const isAllowed = filter.has(material);
    const filterButton = document.createElement("button");
    filterButton.type = "button";
    filterButton.className = `storage-filter-chip${isAllowed ? " is-allowed" : ""}`;
    filterButton.textContent = `${isAllowed ? "✓ " : ""}${MATERIAL_LABELS[material]}`;
    filterButton.title = `${isAllowed ? "Block" : "Allow"} ${MATERIAL_LABELS[material]} on Output ${displayNumber}`;
    filterButton.setAttribute("aria-pressed", String(isAllowed));
    bindImmediateAction(filterButton, () => toggleStorageOutputFilter(storage, selectedPort, material));
    filters.append(filterButton);
  });

  controls.append(tabs, summary, filters);
  elements.machineActions.append(controls);
}

function renderMachineActions(machine) {
  if (machine.id === "planter") {
    addMachineActionNote(
      hasMachineOutputConnection("planter")
        ? "Its internal lanes and output conveyor are connected. Each Leek advances one belt tile at a time until a compatible machine receives it."
        : "Its internal lanes can hold Leeks, but connect a conveyor directly to the final lane so they can leave the planter.",
    );
    return;
  }

  if (machine.id === "ammoShaper") {
    const modeButton = document.createElement("button");
    modeButton.type = "button";
    modeButton.className = "button button-secondary";
    modeButton.textContent = state.mine.ammoShaperMode === "coated"
      ? "Mode: Coated bullets"
      : "Mode: Basic rounds";
    modeButton.title = state.mine.ammoShaperMode === "coated"
      ? "Leeks wait before the transformer until liquid metal is available."
      : "Leeks pass through immediately as basic rounds.";
    bindImmediateAction(modeButton, toggleAmmoShaperMode);
    elements.machineActions.append(modeButton);
    addMachineActionNote(
      state.mine.ammoShaperMode === "coated"
        ? "Leeks pause before the transformer until liquid metal is available, then become coated bullets."
        : "Leeks become basic rounds immediately. Switch to coated mode to require liquid metal reinforcement.",
    );
    addMachineActionNote(
      isBulletCoreCasterLinkedToKiln()
        ? "A linked Clay Kiln can feed liquid copper through one of the two side-center liquid inputs."
        : "Place a Clay Kiln's liquid outlet directly against either side-center liquid input.",
    );
    return;
  }

  if (machine.id === "jacketFormer") {
    addMachineActionNote(
      getJacketFormerKilnLink(machine)
        ? "Unjacketed mineral cores pause at the transformer until liquid Native copper is available. Liquid Native copper waits here until a core arrives."
        : "Place a Clay Kiln's liquid outlet directly against either side-center liquid input.",
    );
    addMachineActionNote("Native copper jackets use (core damage × 3)^0.85 damage. Existing annealing status is preserved.");
    return;
  }

  if (["sellTube", "graphiteLacedSellTube"].includes(machine.id)) {
    addMachineActionNote("Receives sellable materials on any input tile and sells them automatically.");
    if (machine.id === "graphiteLacedSellTube") {
      addMachineActionNote("Graphite lining increases the final sale value by ×1.25.");
    }
    return;
  }

  if (machine.id === "materialStorage") {
    const outputs = getActiveStorageOutputPorts(machine);
    if (outputs.length === 0) {
      addMachineActionNote("Place a conveyor beside Storage and point it directly away to activate an output. Outputs are numbered clockwise from the top-left active output.");
      return;
    }
    renderStorageOutputControls(machine, outputs);
    return;
  }

  if (machine.id === "leekDuster") {
    const upgradeTile = getMachineUpgradeTile(machine);
    addMachineActionNote(
      state.dusterJob
        ? `Improving ${MATERIAL_LABELS[state.dusterJob.material]} for sale · 1 crew assigned.`
        : "Assigns 1 crew while any sellable material passes through its upgrade tile on the way to a Sell Tube.",
    );
    addMachineActionNote("Its marked 1×1 tile is the upgrade tile.");
    return;
  }

  if (machine.id === "primitiveUpgrader") {
    addMachineActionNote("No crew required. Sellable items with at least $1 base value gain $0.50 per pass, up to a current value of $15.");
    addMachineActionNote("Two independent horizontal conveyor lanes run at speed 4; materials below the base-value requirement pass through unchanged.");
    return;
  }

  if (machine.id === "rockShack") {
    addMachineActionNote("Sellable materials crossing its built-in conveyor gain $0.20 sale value, up to $1.50. Materials already worth more than $1.50 are unchanged.");
    addMachineActionNote("Its upper tile is the built-in conveyor; rotate the shack to set its flow direction.");
    return;
  }

  if (machine.id === "clayKiln") {
    addMachineActionNote(getMachineActionProgressNote(machine), "kiln-progress");
    const outlet = getMachinePort(machine, "liquidOutput");
    if (outlet?.direction) {
      addMachineActionNote(`Its single liquid outlet feeds the adjacent tile ${outlet.direction}.`);
      addMachineActionNote("Place an Ingot Molder's input/output tile or either Bullet Core Caster side-center liquid input directly beside it with the same facing.");
    }
    return;
  }

  if (machine.id === "ingotMolder") {
    const link = getMolderKilnLink(machine);
    const linked = Boolean(link);
    addMachineActionNote(getMachineActionProgressNote(machine), "molder-progress");
    addMachineActionNote("Completed ingots leave through its marked output lane; connect a conveyor in its facing direction.");
  }

  if (machine.id === "graphiteCopperAnnealer") {
    addMachineActionNote("Mineral ammo gains ×1.7 damage. Fresh Copper Wires, metal Plates, and Silver-Copper Contacts gain ×1.7 value once; ores and ingots are not accepted.");
    addMachineActionNote("Speed 2. Connect one input and output line through its center transformer tile.");
  }

  if (machine.id === "graniteProcessor") {
    addMachineActionNote("No crew required. Sellable materials with base value $1 or more and current value from $10 to under $50 are processed at ×1.3 value; output may exceed $50.");
    addMachineActionNote("Two horizontal processing lanes; each processor applies its value change as the item passes through.");
  }

  if (machine.id === "bronzeStamp") {
    addMachineActionNote("No crew required. Sellables with base value $8 or more and current value from $150 to under $750 gain $100 value; the output may exceed $750.");
    addMachineActionNote("Its centre conveyor runs at speed 5.");
  }

  if (machine.id === "bronzePillars") {
    addMachineActionNote("No crew required. Sellables with base value $20 or more and current value under $50k gain ×1.4, up to 3 uses per item; the final output may exceed $50k.");
    addMachineActionNote("Its central pass-through tile uses the default conveyor speed.");
  }

  if (machine.id === "extruder") {
    addMachineActionNote("No crew required. Wire mode turns each copper ingot into 5 copper wires, each worth 50% of the ingot's current value.");
    addMachineActionNote("Three horizontal conveyor cells carry items straight through.");
  }

  if (machine.id === "miniElectricArcFurnace") {
    const mode = getArcFurnaceMode(machine);
    [
      {
        value: "smelting",
        label: "Single smelting",
        description: "one input metal",
      },
      {
        value: "alloy2",
        label: "2-input alloy",
        description: "the current Bronze recipe",
      },
      {
        value: "alloy3",
        label: "3-input alloy",
        description: "reserved for future recipes",
      },
    ].forEach(({ value, label, description }) => {
      const selected = mode === value;
      addMachineAction(
        selected ? `${label} (selected)` : label,
        () => {
          if (!switchArcFurnaceMode(machine, value)) {
            return;
          }
          saveGame();
          render();
        },
        selected,
      );
      if (selected) {
        addMachineActionNote(`Selected: ${description}.`);
      }
    });

    addMachineActionNote(
      getMachineActionProgressNote(machine),
      "arc-furnace-progress",
    );
    addMachineActionNote("Modes can always be changed. Switching discards this furnace's buffered inputs and liquid output, and cancels its in-progress batch; completed Ceramic output is kept.");
    const outlet = getMachinePort(machine, "liquidOutput");
    if (outlet?.direction) {
      addMachineActionNote(`Its output feeds the adjacent tile ${outlet.direction}. Liquid metals go to an Ingot Molder; fired Ceramic goes to a conveyor.`);
      addMachineActionNote("Place an Ingot Molder input/output tile directly beside it with the same facing for liquid metal recipes.");
    }
  }

  if (machine.id === "metalPress") {
    addMachineActionNote("No crew required. Presses one ingot into one matching metal plate without changing its value.");
    addMachineActionNote("Its two horizontal conveyor cells run at speed 5; the second cell is the pressing transformer lane.");
  }

  if (machine.id === "stacker") {
    const stackSize = Math.max(1, Math.min(3, machine.stackSize ?? 1));
    const buffer = getStackerBuffer(machine);
    addMachineActionNote("No crew required. Accepts matching items from its three input sides and releases them in configured batches through its facing side.");
    addMachineActionNote(`Stored: ${buffer ? `${formatNumber(buffer.quantity)} matching items` : "empty"}.`);
    [1, 2, 3].forEach((size) => {
      addMachineAction(
        size === stackSize ? `Output stack: ${size} (selected)` : `Output stack: ${size}`,
        () => {
          machine.stackSize = size;
          addLog(`Stacker output stack size set to ${size}.`);
          saveGame();
          render();
        },
        size === stackSize,
      );
    });
  }

  if (machine.id === "splitter") {
    const directions = getSplitterOutputDirections(machine);
    const nextDirection = directions[
      ((Math.floor(Number(machine.splitterNextOutputIndex) || 0) % directions.length)
        + directions.length) % directions.length
    ];
    addMachineActionNote("No crew required. One conveyor enters from behind; each whole stack is routed among the forward, left, and right exits in sequence.");
    addMachineActionNote(`Blocked or incompatible exits are skipped. Next preferred exit: ${nextDirection}.`);
  }

  if (machine.id === "casingMachine") {
    const inputState = getCasingMachineInputState(machine);
    const mode = getCasingMachineMode(machine);
    const occupied = Boolean(inputState.ammo || inputState.casing)
      || getInternalConveyorTiles(machine).some((conveyor) => getConveyorItem(conveyor));
    [
      {
        value: "penetratingRapidfire",
        label: "Penetrating rapidfire",
        description: "keeps the incoming Rapidfire stack and multiplies its damage by the casing",
      },
      {
        value: "buckshot",
        label: "Buckshot",
        description: `turns ${BUCKSHOT_INPUT_ROUNDS} rounds into ${BUCKSHOT_OUTPUT_ROUNDS} rounds with a ×0.5 damage penalty`,
      },
    ].forEach(({ value, label, description }) => {
      const selected = mode === value;
      addMachineAction(
        selected ? `${label} (selected)` : label,
        () => {
          machine.mode = value;
          addLog(`Casing Machine switched to ${label} mode.`);
          saveGame();
          render();
        },
        occupied || selected,
      );
      if (selected) {
        addMachineActionNote(`Selected: ${description}.`);
      }
    });
    addMachineActionNote("No crew required. Buffers one Rapidfire ammunition stack on its main line and waits for liquid Bronze, Brass, or Steel through either side-center input.");
    addMachineActionNote(`Bronze currently multiplies damage by ×3.${inputState.ammo ? ` Rapidfire buffered: ${formatNumber(inputState.ammo.quantity)}.` : ""}${inputState.casing ? ` Liquid casing buffered: ${formatNumber(inputState.casing.quantity)} ${MATERIAL_LABELS[inputState.casing.material] ?? inputState.casing.material}.` : ""}`);
  }
}

function renderShopDetail(machineId) {
  const card = document.querySelector(`[data-shop-machine="${machineId}"]`);
  const cost = MACHINE_PURCHASES[machineId];
  if (!card || !cost) {
    return;
  }

  const title = card.querySelector("h3")?.textContent ?? machineId;
  elements.shopDetailTitle.textContent = title;
  elements.shopDetailDescription.textContent = card.querySelector(".panel-copy")?.textContent ?? "";
  elements.shopDetailOwned.textContent = `Owned: ${formatNumber(getOwnedMachineCount(machineId))}`;
  elements.shopDetailCost.replaceChildren();

  const quantity = getValidShopPurchaseQuantity(selectedShopPurchaseQuantity);
  const totalCost = quantity === null ? null : getMachinePurchaseCost(machineId, quantity);
  const help = elements.shopDetailQuantityHelp;
  if (help) {
    help.textContent = quantity === null
      ? "Enter a whole number from 1 to 9,999."
      : "Choose 1–9,999.";
    help.classList.toggle("is-invalid", quantity === null);
  }

  const costRows = [{ key: "cash", label: "Cash", amount: totalCost?.cash ?? null }];
  Object.entries(cost.materials).forEach(([material, amount]) => {
    costRows.push({
      key: material,
      label: STOCKPILE_LABELS[material] ?? material,
      amount: totalCost?.materials[material] ?? null,
    });
  });
  costRows.forEach(({ key, label, amount }) => {
    const row = document.createElement("div");
    row.className = "shop-detail-cost-row";
    const term = document.createElement("span");
    term.textContent = label;
    const value = document.createElement("strong");
    const ownedAmount = key === "cash" ? state.cash : (state.stockpile[key] ?? 0);
    value.textContent = amount === null
      ? `${key === "cash" ? formatCash(ownedAmount) : formatQuantity(ownedAmount)} / —`
      : `${key === "cash" ? formatCash(ownedAmount) : formatQuantity(ownedAmount)} / ${key === "cash" ? formatCash(amount) : formatQuantity(amount)}`;
    const insufficient = amount === null || ownedAmount < amount;
    row.classList.toggle("is-insufficient", insufficient);
    row.append(term, value);
    elements.shopDetailCost.append(row);
  });

  elements.shopDetailBuyButton.textContent = quantity === null
    ? "Enter a valid quantity"
    : quantity === 1 ? `Buy ${title}` : `Buy ${formatNumber(quantity)} × ${title}`;
  elements.shopDetailBuyButton.disabled = quantity === null
    || !canAffordMachinePurchase(machineId, quantity);
}

function getOwnedMachineCount(machineId) {
  const stored = state.machineInventory[machineId] ?? 0;
  const placed = state.machines.filter((machine) => machine.id === machineId).length;
  const placedConveyors = machineId === "conveyor" ? state.placedConveyors.length : 0;
  return stored + placed + placedConveyors;
}

function selectShopMachine(machineId) {
  if (!MACHINE_PURCHASES[machineId]) {
    return;
  }
  if (selectedShopMachineId !== machineId) {
    selectedShopPurchaseQuantity = "1";
    if (elements.shopDetailQuantity) {
      elements.shopDetailQuantity.value = selectedShopPurchaseQuantity;
    }
  }
  selectedShopMachineId = machineId;
  renderConstruction();
}

function renderConstruction() {
  const shopCatalogue = document.querySelector(".construction-catalogue");
  const shopCards = shopCatalogue ? [...shopCatalogue.querySelectorAll("[data-shop-machine]")] : [];
  elements.shopCategoryButtons.forEach((button) => {
    const selected = button.dataset.shopCategory === activeShopCategory;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  shopCards.forEach((card) => {
      const machineId = card.dataset.shopMachine;
      card.hidden = !machineBelongsToCategory(machineId, activeShopCategory);
      let hitArea = card.querySelector(".shop-card-hit-area");
      if (!hitArea) {
        hitArea = document.createElement("button");
        hitArea.type = "button";
        hitArea.className = "shop-card-hit-area";
        hitArea.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          selectShopMachine(card.dataset.shopMachine);
        });
        hitArea.addEventListener("click", (event) => {
          event.stopPropagation();
          selectShopMachine(card.dataset.shopMachine);
        });
        card.append(hitArea);
      }
      const title = card.querySelector("h3")?.textContent ?? card.dataset.shopMachine;
      hitArea.setAttribute("aria-label", `Select ${title}`);
      hitArea.setAttribute("aria-pressed", String(card.dataset.shopMachine === selectedShopMachineId));
      card.classList.toggle("is-selected", card.dataset.shopMachine === selectedShopMachineId);
    });

  const visibleShopCards = shopCards
    .filter((card) => !card.hidden)
    .sort((a, b) => (
      MACHINE_PURCHASES[a.dataset.shopMachine].cash
      - MACHINE_PURCHASES[b.dataset.shopMachine].cash
    ));
  visibleShopCards.forEach((card) => shopCatalogue.append(card));
  shopCards.filter((card) => card.hidden).forEach((card) => shopCatalogue.append(card));

  const previousSelectedShopMachineId = selectedShopMachineId;
  if (!selectedShopMachineId
    || !MACHINE_PURCHASES[selectedShopMachineId]
    || !machineBelongsToCategory(selectedShopMachineId, activeShopCategory)) {
    selectedShopMachineId = visibleShopCards[0]?.dataset.shopMachine ?? null;
  }
  if (selectedShopMachineId !== previousSelectedShopMachineId) {
    selectedShopPurchaseQuantity = "1";
    if (elements.shopDetailQuantity) {
      elements.shopDetailQuantity.value = selectedShopPurchaseQuantity;
    }
  }
  shopCards.forEach((card) => {
    const machineId = card.dataset.shopMachine;
    card.querySelector(".shop-card-hit-area")?.setAttribute("aria-pressed", String(machineId === selectedShopMachineId));
    card.classList.toggle("is-selected", machineId === selectedShopMachineId);
  });
  if (selectedShopMachineId) {
    renderShopDetail(selectedShopMachineId);
  }
}

function renderStatus() {
  const target = getTargetDeposit();
  const planter = getMachine("planter");
  const planterInputConveyor = planter ? getInternalConveyor(planter, 0) : null;
  setTextContentIfChanged(elements.ammoValue, formatNumber(getTotalAmmo()));
  const secondsUntilPlanter = Math.max(
    0,
    CONFIG.planterCycleSeconds - planterAccumulator,
  ) / getProcessingSpeedMultiplier();
  setTextContentIfChanged(elements.planterRate, `${getGunDisplayName()} · ${getSelectedGun() === "buckshot" ? `${BUCKSHOT_FIRE_PER_SECOND} shot/s · ${BUCKSHOT_SEGMENTS_PER_SHOT} random hits` : `${CONFIG.autoFirePerSecond} shots/s`}`);
  setTextContentIfChanged(elements.leekInputValue, planterInputConveyor && !getConveyorItem(planterInputConveyor)
    ? `${secondsUntilPlanter.toFixed(1)}s`
    : `${state.planterQueue} / ${CONFIG.maxPlanterQueue} leeks queued`);
  setTextContentIfChanged(elements.crewValue, `${getAvailableCrew()} / ${state.crew.total} available`);
  setTextContentIfChanged(elements.crewStatus, `Assigned: ${getBusyCrew()}`);
  setTextContentIfChanged(elements.factoryCrewAvailable, `${getAvailableCrew()} / ${state.crew.total} available`);
  setTextContentIfChanged(elements.factoryCrewAssigned, `Assigned: ${getBusyCrew()}`);
  if (elements.factoryCrewOverlay) {
    elements.factoryCrewOverlay.hidden = activeView !== "factory";
  }
  setTextContentIfChanged(elements.factoryCrewOverlayAvailable, `${getAvailableCrew()} / ${state.crew.total}`);
  setTextContentIfChanged(elements.factoryCrewOverlayAssigned, `Assigned: ${getBusyCrew()}`);
  setTextContentIfChanged(elements.factoryCrewOverlayHireCost, `Next hire: ${formatCash(getCrewHireCost())}`);
  setTextContentIfChanged(elements.factoryCrewOverlayHired, `Hired: ${formatNumber(getHiredCrewCount())}`);
  if (elements.hireCrewButton) {
    elements.hireCrewButton.disabled = !canAffordCrewHire();
    elements.hireCrewButton.title = `Hire one crew hamster for ${formatCash(getCrewHireCost())}.`;
  }
  setTextContentIfChanged(elements.autoExtractorValue, state.autoExtractorEnabled ? "Online" : "Paused");
  const targetDescription = target
    ? `Target: ${RESOURCE_DEFINITIONS[target.type].label} · Segment HP ${target.currentSegmentHitPoints} / ${target.hitPointsPerSegment} · ${target.segmentsRemaining} segment${target.segmentsRemaining === 1 ? "" : "s"} remaining`
    : "No mapped ore remains";
  setTextContentIfChanged(elements.targetStatus, getRealityShield()?.active
    ? targetDescription === "No mapped ore remains"
      ? "Reality Shield exposed · click a shield crosshair"
      : `Reality Shield target · ${targetDescription}`
    : state.drill.active
    ? `Drilling in progress · ${targetDescription}`
    : state.drill.completed
      ? "Face exhausted"
      : targetDescription);
  setTextContentIfChanged(elements.shotsFiredValue, formatNumber(state.shotsFired));
  setTextContentIfChanged(elements.recoveredValue, formatNumber(state.recoveredOre));
  setTextContentIfChanged(elements.cashOverlayValue, formatCash(state.cash));

  const shieldActive = getRealityShield()?.active === true;
  elements.fireButton.disabled = !target || (!shieldActive && !getSelectedAmmoStack())
    || state.drill.active || state.drill.completed
    || (shieldActive && !isRealityShieldAmmoSelected());
  const selectedMaterial = getSelectedAmmoMaterial();
  setTextContentIfChanged(elements.fireButton, getSelectedGun() === "buckshot"
    ? "Fire one Buckshot round"
    : selectedMaterial === "leek"
    ? "Fire one Leek round"
    : `Fire one ${getSelectedAmmoAnnealed() ? "annealed " : ""}${MATERIAL_LABELS[selectedMaterial]} core`);
  elements.autoToggleButton.disabled = state.drill.active || state.drill.completed || getRealityShield()?.active;
  setTextContentIfChanged(elements.autoToggleButton, state.autoExtractorEnabled
    ? `Pause ${getGunDisplayName()}`
    : `Resume ${getGunDisplayName()}`);
}

function renderTutorial() {
  elements.selectConveyorButton.classList.toggle("is-selected", selectedBuildTool === "conveyor");
  elements.selectConveyorButton.disabled = false;
  elements.selectConveyorButton.textContent = `Conveyor: ${getOrientationSymbol(selectedBuildOrientation)} ${selectedBuildOrientation}`;
}

function getOrientationSymbol(orientation) {
  return {
    up: "↑",
    right: "→",
    down: "↓",
    left: "←",
  }[orientation];
}

function renderTutorialOverlay() {
  updateTutorialProgress();

  elements.tutorialOverlay.hidden = !state.tutorial.visible;
  elements.inventoryConveyorCard.classList.toggle(
    "is-highlighted",
    state.tutorial.visible && getTutorialStage() === "inventorySelect",
  );

  if (!state.tutorial.visible) {
    return;
  }

  const stage = getTutorialStage();
  const copy = {
    intro: {
      title: "A quiet mine needs a supply line",
      description: "Ore must be displaced in segments, but the Rapidfire Gun Mk. 0 has no ammunition. Build a small factory route before attempting the first deposit.",
      progress: "1 / 15 · Learn the premise",
      action: "Go to Factory",
    },
    factoryRoute: {
      title: "The factory needs a route",
      description: "The planter grows leeks and the Bullet Core Caster turns each one into a basic round. Liquid copper from a Clay Kiln reinforces leek cores into 25 Malachite bullets dealing 3 damage. The two glowing floor cells are the missing connection, but you need a conveyor first.",
      progress: "2 / 15 · Inspect the supply line",
      action: "Open Machine Inventory",
    },
    inventorySelect: {
      title: "Select a conveyor",
      description: "Choose the highlighted Conveyor from the inventory. It begins facing east, so the factory will ask you to rotate it before placement.",
      progress: "3 / 15 · Choose a machine",
      action: null,
    },
    factoryPlaceFirst: {
      title: "Rotate, then place the first conveyor",
      description: `The selected conveyor begins ${getOrientationSymbol("right")} east. Press Q once to rotate it counter-clockwise so it faces ${getOrientationSymbol("up")} up, then place it on the highlighted first tile. It currently faces ${getOrientationSymbol(selectedBuildOrientation)} ${selectedBuildOrientation}.`,
      progress: "4 / 15 · Learn rotation",
      action: null,
    },
    factoryPlaceSecond: {
      title: "Finish the supply line",
      description: "The first conveyor is in place. Place the second up-facing conveyor on the remaining highlighted tile to complete the connection.",
      progress: "5 / 15 · Complete the route",
      action: null,
    },
    mineReturn: {
      title: "Ammunition is now on the way",
      description: "The planter will send a leek to the Shaper every 2 seconds. Return to the mine to watch the gun use those rounds to displace ore.",
      progress: "6 / 15 · Return to the mine",
      action: "Return to Mine",
    },
    mineDisplacement: {
      title: "Recover Malachite Ore",
      description: "The gun automatically fires when ammunition arrives. Click a Malachite Ore deposit to target it; fully clearing its segments recovers its material.",
      progress: "7 / 15 · Recover Malachite Ore",
      action: null,
    },
    storeLeek: {
      title: "Route a Leek into storage",
      description: "Open the Factory and re-route the Leek Planter’s built-in output through conveyors into any Material Storage tile. The next harvested Leek will be stored for the Shop.",
      progress: "8 / 15 · Connect Material Storage",
      action: "Open Factory",
    },
    buildDuster: {
      title: "Build the Leek Duster",
      description: "One stored Leek is enough to assemble a Leek Duster. It raises the sale value of Malachite Ore and brittle copper ingots that pass through its upgrade tile by 25%.",
      progress: "9 / 15 · Construct an upgrader",
      action: "Open Shop",
    },
    placeDuster: {
      title: "Place the Leek Duster",
      description: "Open Machine Inventory, select the Leek Duster, and place it on any open factory tile.",
      progress: "10 / 15 · Place the upgrader",
      action: "Open Machine Inventory",
    },
    saleSetup: {
      title: "Place the Sell Tube",
      description: "Open Machine Inventory, select the free Sell Tube, and place it somewhere reachable from Material Storage.",
      progress: "12 / 15 · Place a destination",
      action: "Open Machine Inventory",
    },
    saleRoute: {
      title: "Build a storage output route",
      description: "Place a conveyor directly beside Material Storage pointing away from it, then continue conveyors through the Leek Duster’s highlighted upgrade tile and into any Sell Tube input tile.",
      progress: "13 / 15 · Connect storage to sale",
      action: "Open Machine Inventory",
    },
    saleFilter: {
      title: "Filter the storage output",
      description: "Select Material Storage. Its active outward conveyors are numbered clockwise. On the connected output, allow Malachite Ore.",
      progress: "14 / 15 · Choose what leaves storage",
      action: "Open Factory",
    },
    sellWait: {
      title: "Watch the sale route",
      description: "Malachite Ore is traveling through the Leek Duster’s upgrade tile. The Sell Tube will pay its improved value when it arrives.",
      progress: "15 / 15 · Complete the first sale",
      action: null,
    },
    complete: {
      title: "Starter factory loop online",
      description: "You have displaced, stored, upgraded, filtered, and sold your first ore. Material Storage now manages what each active output is allowed to send onward.",
      progress: "Tutorial complete",
      action: "Finish tutorial",
    },
  }[stage];

  setTextContentIfChanged(elements.tutorialOverlayTitle, copy.title);
  setTextContentIfChanged(elements.tutorialOverlayDescription, copy.description);
  setTextContentIfChanged(elements.tutorialOverlayProgress, copy.progress);
  elements.tutorialActionButton.hidden = !copy.action;
  setTextContentIfChanged(elements.tutorialActionButton, copy.action ?? "");
}

function updateTutorialProgress() {
  if (getTutorialStage() === "mineDisplacement" && state.stockpile.copper > 0) {
    state.tutorial.stage = "storeLeek";
  } else if (getTutorialStage() === "storeLeek" && state.stockpile.leek > 0) {
    state.tutorial.stage = "buildDuster";
  } else if (getTutorialStage() === "sellWait" && state.tutorial.dusterImprovedMalachiteSold) {
    state.tutorial.stage = "complete";
  }
}

function renderMachineGrid() {
  if (machineGame || machineSceneUnavailable) {
    return;
  }

  if (typeof Phaser === "undefined") {
    machineSceneUnavailable = true;
    elements.machineGrid.textContent = "Phaser could not load; conveyor animation is unavailable.";
    return;
  }

  factoryTextResolution = getFactoryTextResolution();

  machineGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: elements.machineGrid,
    width: 960,
    height: 640,
    backgroundColor: "#181d18",
    render: {
      antialias: true,
    },
    // This controls canvas drawing only. The factory simulation remains at its
    // deliberate 10 Hz cadence, while panning and item visuals stay responsive.
    fps: {
      limit: CONFIG.factoryRenderFramesPerSecond,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 640,
    },
    scene: {
      create() {
        machineScene = this;
        const camera = machineScene.cameras.main;
        camera.setBounds(0, 0, FACTORY_CANVAS_WIDTH, FACTORY_CANVAS_HEIGHT);
        camera.roundPixels = true;
        camera.setZoom(factoryCameraZoom);
        camera.scrollX = Math.max(
          0,
          (FACTORY_STARTER_COLUMN_OFFSET + LEGACY_FACTORY_COLUMNS / 2) * FACTORY_TILE_SIZE
            - camera.width / (2 * camera.zoom),
        );
        camera.scrollY = 0;
        drawMachineFloor(machineScene);
        machineOverlay = machineScene.add.graphics();
        machineOverlay.setDepth(2);
        createFactoryInteractions(machineScene);
        machineScene.game.canvas.addEventListener("contextmenu", (event) => {
          event.preventDefault();
        });
        machineScene.game.canvas.addEventListener("pointerenter", () => {
          factoryPointerInside = true;
        });
        machineScene.game.canvas.addEventListener("pointerleave", () => {
          factoryPointerInside = false;
          setHoveredFactoryTile(null);
        });
        machineScene.input.on("wheel", (pointer, gameObjects, deltaX, deltaY) => {
          const nextZoom = Phaser.Math.Clamp(
            camera.zoom * (deltaY > 0 ? 0.9 : 1.1),
            0.45,
            2,
          );
          camera.setZoom(nextZoom);
          factoryCameraZoom = nextZoom;
        });
        machineScene.events.on("update", (time, delta) => {
          const pointer = machineScene.input.activePointer;
          if (!factoryPointerInside || !pointer || pointer.withinGame === false) {
            return;
          }
          const edgeDistance = 72;
          const horizontalStrength = pointer.x < edgeDistance
            ? -(edgeDistance - pointer.x) / edgeDistance
            : pointer.x > machineScene.scale.width - edgeDistance
              ? (pointer.x - (machineScene.scale.width - edgeDistance)) / edgeDistance
              : 0;
          const verticalStrength = pointer.y < edgeDistance
            ? -(edgeDistance - pointer.y) / edgeDistance
              : pointer.y > machineScene.scale.height - edgeDistance
                ? (pointer.y - (machineScene.scale.height - edgeDistance)) / edgeDistance
                : 0;
          const panSpeed = 650 * (delta / 1000) / camera.zoom;
          const maxScrollX = Math.max(0, FACTORY_CANVAS_WIDTH - camera.width / camera.zoom);
          const maxScrollY = Math.max(0, FACTORY_CANVAS_HEIGHT - camera.height / camera.zoom);
          const nextScrollX = Number.isFinite(camera.scrollX)
            ? camera.scrollX + horizontalStrength * panSpeed
            : 0;
          const nextScrollY = Number.isFinite(camera.scrollY)
            ? camera.scrollY + verticalStrength * panSpeed
            : 0;
          camera.setScroll(
            Phaser.Math.Clamp(nextScrollX, 0, maxScrollX),
            Phaser.Math.Clamp(nextScrollY, 0, maxScrollY),
          );
        });
        renderMachineOverlay();
        window.requestAnimationFrame?.(() => resizeFactoryScene());
      },
    },
  });
}

function resizeFactoryScene() {
  if (!machineGame || !machineScene || !elements.machineGrid) {
    return;
  }

  const width = elements.machineGrid.clientWidth;
  const height = elements.machineGrid.clientHeight;
  if (width <= 0 || height <= 0) {
    return;
  }

  const nextTextResolution = getFactoryTextResolution();
  if (nextTextResolution !== factoryTextResolution) {
    factoryTextResolution = nextTextResolution;
    clearConveyorItemLabels();
    refreshMachineStaticLayer();
  }

  machineGame.scale.resize(width, height);
  machineScene.cameras.main.setViewport(0, 0, width, height);
  const camera = machineScene.cameras.main;
  const maxScrollX = Math.max(0, FACTORY_CANVAS_WIDTH - camera.width / camera.zoom);
  const maxScrollY = Math.max(0, FACTORY_CANVAS_HEIGHT - camera.height / camera.zoom);
  camera.setScroll(
    Phaser.Math.Clamp(Number.isFinite(camera.scrollX) ? camera.scrollX : 0, 0, maxScrollX),
    Phaser.Math.Clamp(Number.isFinite(camera.scrollY) ? camera.scrollY : 0, 0, maxScrollY),
  );
}

function getFactoryTextResolution() {
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
}

function getMachineTileCenter(column, row) {
  return {
    x: column * FACTORY_TILE_SIZE + FACTORY_TILE_SIZE / 2,
    y: row * FACTORY_TILE_SIZE + FACTORY_TILE_SIZE / 2,
  };
}

function drawMachineFloor(scene) {
  machineStaticLayer = scene.add.container(0, 0).setDepth(0);
  const floor = scene.add.graphics();
  machineStaticLayer.add(floor);
  floor.fillStyle(0x2d352b, 1);
  floor.fillRect(0, 0, FACTORY_CANVAS_WIDTH, FACTORY_CANVAS_HEIGHT);

  floor.fillStyle(0x1a2019, 1);
  floor.fillRect(0, 0, FACTORY_CANVAS_WIDTH, FACTORY_GRID_START_ROW * FACTORY_TILE_SIZE);

  floor.lineStyle(1, 0x576151, 0.55);
  for (let column = 0; column <= FACTORY_COLUMNS; column += 1) {
    floor.lineBetween(
      column * FACTORY_TILE_SIZE,
      FACTORY_GRID_START_ROW * FACTORY_TILE_SIZE,
      column * FACTORY_TILE_SIZE,
      FACTORY_CANVAS_HEIGHT,
    );
  }
  for (let row = FACTORY_GRID_START_ROW; row <= FACTORY_GRID_START_ROW + FACTORY_ROWS; row += 1) {
    floor.lineBetween(
      0,
      row * FACTORY_TILE_SIZE,
      FACTORY_CANVAS_WIDTH,
      row * FACTORY_TILE_SIZE,
    );
  }

  // These are routing hints, not physical belts: paint them beneath machine
  // shells, real conveyors, and the dynamic cargo overlay.
  getMachines("stacker").forEach((stacker) => drawStackerPorts(floor, stacker));
  getMachines("splitter").forEach((splitter) => drawSplitterPorts(floor, splitter));

  const planter = getMachine("planter");
  const shaper = getMachine("ammoShaper");
  const jacketFormer = getMachine("jacketFormer");
  const storage = getMachine("materialStorage");
  const sellTube = getMachine("sellTube");
  const graphiteLacedSellTube = getMachine("graphiteLacedSellTube");
  const duster = getMachine("leekDuster");
  const primitiveUpgrader = getMachine("primitiveUpgrader");
  const rockShack = getMachine("rockShack");
  const kiln = getMachine("clayKiln");
  const molder = getMachine("ingotMolder");
  const annealer = getMachine("graphiteCopperAnnealer");
  const graniteProcessor = getMachine("graniteProcessor");
  const bronzeStamp = getMachine("bronzeStamp");
  const bronzePillars = getMachine("bronzePillars");
  const extruder = getMachine("extruder");
  const leekFiberExtractor = getMachine("leekFiberExtractor");
  const contactMaker = getMachine("contactMaker");
  const miniElectricArcFurnace = getMachine("miniElectricArcFurnace");
  const metalPress = getMachine("metalPress");
  const stacker = getMachine("stacker");
  const splitter = getMachine("splitter");
  const casingMachine = getMachine("casingMachine");
  const quartzWheelCutter = getMachine("quartzWheelCutter");
  const gunDeposit = getMachine("gunDeposit");
  const gun = getMachine("gun");

  [
    { machine: gun, fill: 0x28372a, border: 0xc9dc75, opacity: 0.8 },
    { machine: planter, fill: 0x425437, border: 0xb8d979, opacity: 0.6 },
    { machine: shaper, fill: 0x68472c, border: 0xf1b96e, opacity: 0.7 },
    { machine: jacketFormer, fill: 0x5b4657, border: 0xe3b4ed, opacity: 0.8 },
    { machine: storage, fill: 0x3b5155, border: 0x8fc5c7, opacity: 0.7 },
    { machine: sellTube, fill: 0x47515b, border: 0xb8d3df, opacity: 0.8 },
    { machine: graphiteLacedSellTube, fill: 0x39424b, border: 0xc6d4dc, opacity: 0.9 },
    { machine: duster, fill: 0x465232, border: 0xd8e795, opacity: 0.85 },
    { machine: primitiveUpgrader, fill: 0x59613d, border: 0xd4db9a, opacity: 0.9 },
    { machine: rockShack, fill: 0x5c554a, border: 0xdfc48a, opacity: 0.85 },
    { machine: kiln, fill: 0x614431, border: 0xe4a46b, opacity: 0.85 },
    { machine: molder, fill: 0x5e505a, border: 0xdcb1cb, opacity: 0.85 },
    { machine: annealer, fill: 0x3f5360, border: 0x9ed1d0, opacity: 0.9 },
    { machine: graniteProcessor, fill: 0x554d62, border: 0xd0b7f2, opacity: 0.9 },
    { machine: bronzeStamp, fill: 0x6b4d35, border: 0xe7b878, opacity: 0.9 },
    { machine: bronzePillars, fill: 0x6a4d38, border: 0xf0bf7a, opacity: 0.9 },
    { machine: extruder, fill: 0x4e5d46, border: 0xc6e39b, opacity: 0.9 },
    { machine: leekFiberExtractor, fill: 0x52613f, border: 0xd2d99b, opacity: 0.9 },
    { machine: contactMaker, fill: 0x4d5b4a, border: 0xc8e0a1, opacity: 0.9 },
    { machine: miniElectricArcFurnace, fill: 0x4c4b58, border: 0xe0c3ff, opacity: 0.9 },
    { machine: metalPress, fill: 0x5b4d3d, border: 0xe1c38f, opacity: 0.9 },
    { machine: stacker, fill: 0x5d4b3e, border: 0xe6c18f, opacity: 0.9 },
    { machine: splitter, fill: 0x405b58, border: 0x9ac9c2, opacity: 0.9 },
    { machine: casingMachine, fill: 0x594d3f, border: 0xe5bd83, opacity: 0.9 },
    { machine: quartzWheelCutter, fill: 0x36594f, border: 0x79d3b6, opacity: 0.9 },
    { machine: gunDeposit, fill: 0x355264, border: 0x89cae2, opacity: 0.75 },
    ...getMachines("leekDuster").slice(1).map((machine) => ({
      machine, fill: 0x465232, border: 0xd8e795, opacity: 0.85,
    })),
    ...getMachines("rockShack").slice(1).map((machine) => ({
      machine, fill: 0x5c554a, border: 0xdfc48a, opacity: 0.85,
    })),
    ...getMachines("materialStorage").slice(1).map((machine) => ({
      machine, fill: 0x3b5155, border: 0x8fc5c7, opacity: 0.7,
    })),
    ...getMachines("sellTube").slice(1).map((machine) => ({
      machine, fill: 0x47515b, border: 0xb8d3df, opacity: 0.8,
    })),
    ...getMachines("graphiteLacedSellTube").slice(1).map((machine) => ({
      machine, fill: 0x39424b, border: 0xc6d4dc, opacity: 0.9,
    })),
    ...getMachines("primitiveUpgrader").slice(1).map((machine) => ({
      machine, fill: 0x59613d, border: 0xd4db9a, opacity: 0.9,
    })),
    ...getMachines("clayKiln").slice(1).map((machine) => ({
      machine, fill: 0x614431, border: 0xe4a46b, opacity: 0.85,
    })),
    ...getMachines("ingotMolder").slice(1).map((machine) => ({
      machine, fill: 0x5e505a, border: 0xdcb1cb, opacity: 0.85,
    })),
    ...getMachines("graphiteCopperAnnealer").slice(1).map((machine) => ({
      machine, fill: 0x3f5360, border: 0x9ed1d0, opacity: 0.9,
    })),
    ...getMachines("jacketFormer").slice(1).map((machine) => ({
      machine, fill: 0x5b4657, border: 0xe3b4ed, opacity: 0.8,
    })),
    ...getMachines("graniteProcessor").slice(1).map((machine) => ({
      machine, fill: 0x554d62, border: 0xd0b7f2, opacity: 0.9,
    })),
    ...getMachines("bronzeStamp").slice(1).map((machine) => ({
      machine, fill: 0x6b4d35, border: 0xe7b878, opacity: 0.9,
    })),
    ...getMachines("bronzePillars").slice(1).map((machine) => ({
      machine, fill: 0x6a4d38, border: 0xf0bf7a, opacity: 0.9,
    })),
    ...getMachines("extruder").slice(1).map((machine) => ({
      machine, fill: 0x4e5d46, border: 0xc6e39b, opacity: 0.9,
    })),
    ...getMachines("leekFiberExtractor").slice(1).map((machine) => ({
      machine, fill: 0x52613f, border: 0xd2d99b, opacity: 0.9,
    })),
    ...getMachines("contactMaker").slice(1).map((machine) => ({
      machine, fill: 0x4d5b4a, border: 0xc8e0a1, opacity: 0.9,
    })),
    ...getMachines("miniElectricArcFurnace").slice(1).map((machine) => ({
      machine, fill: 0x4c4b58, border: 0xe0c3ff, opacity: 0.9,
    })),
    ...getMachines("metalPress").slice(1).map((machine) => ({
      machine, fill: 0x5b4d3d, border: 0xe1c38f, opacity: 0.9,
    })),
    ...getMachines("stacker").slice(1).map((machine) => ({
      machine, fill: 0x5d4b3e, border: 0xe6c18f, opacity: 0.9,
    })),
    ...getMachines("splitter").slice(1).map((machine) => ({
      machine, fill: 0x405b58, border: 0x9ac9c2, opacity: 0.9,
    })),
    ...getMachines("casingMachine").slice(1).map((machine) => ({
      machine, fill: 0x594d3f, border: 0xe5bd83, opacity: 0.9,
    })),
    ...getMachines("quartzWheelCutter").slice(1).map((machine) => ({
      machine, fill: 0x36594f, border: 0x79d3b6, opacity: 0.9,
    })),
  ].forEach(({ machine, fill, border, opacity }) => {
    if (!machine) {
      return;
    }

    floor.fillStyle(fill, 1);
    floor.lineStyle(2, border, opacity);
    if (Array.isArray(machine.occupiedTiles)) {
      getMachineOccupiedTiles(machine).forEach(({ column, row }) => {
        floor.fillRect(
          column * FACTORY_TILE_SIZE,
          row * FACTORY_TILE_SIZE,
          FACTORY_TILE_SIZE,
          FACTORY_TILE_SIZE,
        );
        floor.strokeRect(
          column * FACTORY_TILE_SIZE + 1,
          row * FACTORY_TILE_SIZE + 1,
          FACTORY_TILE_SIZE - 2,
          FACTORY_TILE_SIZE - 2,
        );
      });
    } else {
      const size = getMachineFootprintSize(machine);
      floor.fillRect(
        machine.column * FACTORY_TILE_SIZE,
        machine.row * FACTORY_TILE_SIZE,
        size.width * FACTORY_TILE_SIZE,
        size.height * FACTORY_TILE_SIZE,
      );
      floor.strokeRect(
        machine.column * FACTORY_TILE_SIZE + 1,
        machine.row * FACTORY_TILE_SIZE + 1,
        size.width * FACTORY_TILE_SIZE - 2,
        size.height * FACTORY_TILE_SIZE - 2,
      );
    }
  });

  [planter, shaper, jacketFormer].filter(Boolean).forEach((machine) => {
    getInternalConveyorTiles(machine).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x798372,
        arrowColor: 0x20271e,
      });
    });
  });
  getMachines("primitiveUpgrader").forEach((upgrader) => {
    getInternalConveyorTiles(upgrader).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x89915f,
        arrowColor: 0x29301d,
      });
    });
  });
  getMachines("jacketFormer").slice(1).forEach((machine) => {
    getInternalConveyorTiles(machine).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x806887,
        arrowColor: 0x33283a,
      });
    });
  });
  getMachines("rockShack").forEach((shack) => {
    getInternalConveyorTiles(shack).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x8b7a5c,
        arrowColor: 0x2e261b,
      });
    });
  });
  getMachines("graphiteCopperAnnealer").forEach((annealer) => {
    getInternalConveyorTiles(annealer).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x667d82,
        arrowColor: 0x1f2d31,
      });
    });
  });
  getMachines("graniteProcessor").forEach((processor) => {
    getInternalConveyorTiles(processor).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x756b83,
        arrowColor: 0x271f31,
      });
    });
  });
  getMachines("bronzeStamp").forEach((stamp) => {
    getInternalConveyorTiles(stamp).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x946d43,
        arrowColor: 0x302116,
      });
    });
  });
  getMachines("bronzePillars").forEach((pillars) => {
    getInternalConveyorTiles(pillars).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x946d43,
        arrowColor: 0x302116,
      });
    });
  });
  getMachines("extruder").forEach((machine) => {
    getInternalConveyorTiles(machine).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x728366,
        arrowColor: 0x20291c,
      });
    });
  });
  getMachines("leekFiberExtractor").forEach((machine) => {
    getInternalConveyorTiles(machine).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x778568,
        arrowColor: 0x20291c,
      });
    });
  });
  getMachines("contactMaker").forEach((machine) => {
    getInternalConveyorTiles(machine).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x778568,
        arrowColor: 0x20291c,
      });
    });
  });
  getMachines("miniElectricArcFurnace").forEach((furnace) => {
    getInternalConveyorTiles(furnace).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x7980a0,
        arrowColor: 0x252538,
      });
    });
  });
  getMachines("metalPress").forEach((press) => {
    getInternalConveyorTiles(press).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x927a59,
        arrowColor: 0x2d2419,
      });
    });
  });
  getMachines("casingMachine").forEach((machine) => {
    getInternalConveyorTiles(machine).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x876b4c,
        arrowColor: 0x302116,
      });
    });
  });
  getMachines("quartzWheelCutter").forEach((machine) => {
    getInternalConveyorTiles(machine).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x6c9a88,
        arrowColor: 0x1e3029,
      });
    });
  });

  state.placedConveyors.forEach((conveyor) => {
    drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction);
  });

  getActiveFixedConveyors().forEach((conveyor) => {
    drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction);
  });

  // The floor, grid, machine shells, and empty conveyors only change after a placement,
  // pickup, or rotation. Bake them once instead of replaying every drawing command each frame.
  const cachedFloor = scene.add.renderTexture(0, 0, FACTORY_CANVAS_WIDTH, FACTORY_CANVAS_HEIGHT)
    .setOrigin(0);
  cachedFloor.draw(floor);
  machineStaticLayer.addAt(cachedFloor, 0);
  floor.destroy();

  const getMachineLabelCenter = (machine) => {
    const size = getMachineFootprintSize(machine);
    return getMachineTileCenter(
      machine.column + size.width / 2 - 0.5,
      machine.row + size.height / 2 - 0.5,
    );
  };

  if (planter) {
    const planterLabel = getMachineLabelCenter(planter);
    addMachineFloorLabel(scene, planterLabel.x, planterLabel.y, `LEEK\nPLANTER ${getOrientationSymbol(planter.orientation)}`, {
    color: "#edf5bd",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    fontStyle: "bold",
    align: "center",
    lineSpacing: 2,
    });
  }
  if (shaper) {
    const shaperLabel = getMachineLabelCenter(shaper);
    addMachineFloorLabel(scene, shaperLabel.x, shaperLabel.y, `BULLET CORE\nCASTER ${getOrientationSymbol(shaper.orientation)}`, {
    color: "#ffe0ac",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    fontStyle: "bold",
    align: "center",
    lineSpacing: 2,
    });
  }
  if (storage) {
    const storageLabel = getMachineLabelCenter(storage);
    addMachineFloorLabel(scene, storageLabel.x, storageLabel.y, "MATERIAL\nSTORAGE", {
      color: "#d7f1ef",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 2,
    });
  }
  if (sellTube) {
    const sellTubeLabel = getMachineLabelCenter(sellTube);
    addMachineFloorLabel(scene, sellTubeLabel.x, sellTubeLabel.y, "SELL\nTUBE", {
      color: "#e3eef3",
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 2,
    });
  }
  if (graphiteLacedSellTube) {
    const graphiteSellTubeLabel = getMachineLabelCenter(graphiteLacedSellTube);
    addMachineFloorLabel(scene, graphiteSellTubeLabel.x, graphiteSellTubeLabel.y, "GRAPHITE-LACED\nSELL TUBE", {
      color: "#e1edf4",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (duster) {
    const dusterLabel = getMachineLabelCenter(duster);
    addMachineFloorLabel(scene, dusterLabel.x, dusterLabel.y, `LEEK\nDUSTER ${getOrientationSymbol(duster.orientation)}`, {
      color: "#ecf4bd",
      fontFamily: "system-ui, sans-serif",
      fontSize: "10px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (primitiveUpgrader) {
    const upgraderLabel = getMachineLabelCenter(primitiveUpgrader);
    addMachineFloorLabel(scene, upgraderLabel.x, upgraderLabel.y, `PRIMITIVE\nUPGRADER ${getOrientationSymbol(primitiveUpgrader.orientation)}`, {
      color: "#f0f4bd",
      fontFamily: "system-ui, sans-serif",
      fontSize: "7px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (rockShack) {
    const rockShackLabel = getMachineLabelCenter(rockShack);
    addMachineFloorLabel(scene, rockShackLabel.x, rockShackLabel.y, "ROCK\nSHACK", {
      color: "#fff0c6",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (kiln) {
    const kilnLabel = getMachineLabelCenter(kiln);
    addMachineFloorLabel(scene, kilnLabel.x, kilnLabel.y, `CLAY\nKILN ${getOrientationSymbol(kiln.orientation)}`, {
      color: "#ffe0bc",
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 2,
    });
  }
  if (molder) {
    const molderLabel = getMachineLabelCenter(molder);
    addMachineFloorLabel(scene, molderLabel.x, molderLabel.y, `INGOT\nMOLDER ${getOrientationSymbol(molder.orientation)}`, {
      color: "#ffe0f1",
      fontFamily: "system-ui, sans-serif",
      fontSize: "10px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (annealer) {
    const annealerLabel = getMachineLabelCenter(annealer);
    addMachineFloorLabel(scene, annealerLabel.x, annealerLabel.y, `GRAPHITE-COPPER\nANNEALER ${getOrientationSymbol(annealer.orientation)}`, {
      color: "#d9ffff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (jacketFormer) {
    const jacketFormerLabel = getMachineLabelCenter(jacketFormer);
    addMachineFloorLabel(scene, jacketFormerLabel.x, jacketFormerLabel.y, `JACKET
FORMER ${getOrientationSymbol(jacketFormer.orientation)}`, {
      color: "#f0c8f4",
      fontFamily: "system-ui, sans-serif",
      fontSize: "10px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (graniteProcessor) {
    const processorLabel = getMachineLabelCenter(graniteProcessor);
    addMachineFloorLabel(scene, processorLabel.x, processorLabel.y, "GRANITE\nPROCESSOR", {
      color: "#eadbff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (bronzeStamp) {
    const stampLabel = getMachineLabelCenter(bronzeStamp);
    addMachineFloorLabel(scene, stampLabel.x, stampLabel.y, `BRONZE\nSTAMP ${getOrientationSymbol(bronzeStamp.orientation)}`, {
      color: "#ffe7b0",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (bronzePillars) {
    const pillarsLabel = getMachineLabelCenter(bronzePillars);
    addMachineFloorLabel(scene, pillarsLabel.x, pillarsLabel.y, `BRONZE\nPILLARS ${getOrientationSymbol(bronzePillars.orientation)}`, {
      color: "#ffe7b0",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (extruder) {
    const extruderLabel = getMachineLabelCenter(extruder);
    addMachineFloorLabel(scene, extruderLabel.x, extruderLabel.y, `EXTRUDER ${getOrientationSymbol(extruder.orientation)}`, {
      color: "#e3f3b9",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
    });
  }
  if (leekFiberExtractor) {
    const extractorLabel = getMachineLabelCenter(leekFiberExtractor);
    addMachineFloorLabel(scene, extractorLabel.x, extractorLabel.y, `LEEK FIBER\nEXTRACTOR ${getOrientationSymbol(leekFiberExtractor.orientation)}`, {
      color: "#e3f3b9",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (contactMaker) {
    const contactLabel = getMachineLabelCenter(contactMaker);
    addMachineFloorLabel(scene, contactLabel.x, contactLabel.y, `CONTACT\nMAKER ${getOrientationSymbol(contactMaker.orientation)}`, {
      color: "#e3f3b9",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (miniElectricArcFurnace) {
    const furnaceLabel = getMachineLabelCenter(miniElectricArcFurnace);
    addMachineFloorLabel(scene, furnaceLabel.x, furnaceLabel.y, `MINI ELECTRIC\nARC FURNACE ${getOrientationSymbol(miniElectricArcFurnace.orientation)}`, {
      color: "#eadbff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (metalPress) {
    const pressLabel = getMachineLabelCenter(metalPress);
    addMachineFloorLabel(scene, pressLabel.x, pressLabel.y, `METAL\nPRESS ${getOrientationSymbol(metalPress.orientation)}`, {
      color: "#ffe7b0",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (stacker) {
    const stackerLabel = getMachineLabelCenter(stacker);
    addMachineFloorLabel(scene, stackerLabel.x, stackerLabel.y, `STACKER\n×${Math.max(1, Math.min(3, stacker.stackSize ?? 1))} ${getOrientationSymbol(stacker.orientation)}`, {
      color: "#ffe7b0",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (splitter) {
    const splitterLabel = getMachineLabelCenter(splitter);
    addMachineFloorLabel(scene, splitterLabel.x, splitterLabel.y, `SPLIT ${getOrientationSymbol(splitter.orientation)}`, {
      color: "#d8f3ef",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
    });
  }

  if (casingMachine) {
    const casingMachineLabel = getMachineLabelCenter(casingMachine);
    addMachineFloorLabel(scene, casingMachineLabel.x, casingMachineLabel.y, `CASING\nMACHINE ${getOrientationSymbol(casingMachine.orientation)}`, {
      color: "#ffe7b0",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }
  if (quartzWheelCutter) {
    const cutterLabel = getMachineLabelCenter(quartzWheelCutter);
    addMachineFloorLabel(scene, cutterLabel.x, cutterLabel.y, `QUARTZ WHEEL\nCUTTER ${getOrientationSymbol(quartzWheelCutter.orientation)}`, {
      color: "#c7f5e2",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
    });
  }

  const duplicateLabelSpecs = [
    ["leekDuster", (machine) => `LEEK\nDUSTER ${getOrientationSymbol(machine.orientation)}`, "#ecf4bd", 9, 0],
    ["primitiveUpgrader", (machine) => `PRIMITIVE\nUPGRADER ${getOrientationSymbol(machine.orientation)}`, "#f0f4bd", 7, 0],
    ["rockShack", () => "ROCK\nSHACK", "#fff0c6", 9, 0],
    ["materialStorage", () => "MATERIAL\nSTORAGE", "#d7f1ef", 13, 0],
    ["sellTube", () => "SELL\nTUBE", "#e3eef3", 11, 0],
    ["graphiteLacedSellTube", () => "GRAPHITE-LACED\nSELL TUBE", "#e1edf4", 8, 0],
    ["clayKiln", (machine) => `CLAY\nKILN ${getOrientationSymbol(machine.orientation)}`, "#ffe0bc", 10, 0],
    ["ingotMolder", (machine) => `INGOT\nMOLDER ${getOrientationSymbol(machine.orientation)}`, "#ffe0f1", 9, 0],
    ["graphiteCopperAnnealer", (machine) => `GRANITE-COPPER\nANNEALER ${getOrientationSymbol(machine.orientation)}`, "#d9ffff", 8, 0],
    ["jacketFormer", (machine) => `JACKET\nFORMER ${getOrientationSymbol(machine.orientation)}`, "#f0c8f4", 10, 0],
    ["graniteProcessor", () => "GRANITE\nPROCESSOR", "#eadbff", 9, 0],
    ["bronzeStamp", (machine) => `BRONZE\nSTAMP ${getOrientationSymbol(machine.orientation)}`, "#ffe7b0", 9, 0],
    ["bronzePillars", (machine) => `BRONZE\nPILLARS ${getOrientationSymbol(machine.orientation)}`, "#ffe7b0", 8, 0],
    ["extruder", (machine) => `EXTRUDER ${getOrientationSymbol(machine.orientation)}`, "#e3f3b9", 9, 0],
    ["leekFiberExtractor", (machine) => `LEEK FIBER\nEXTRACTOR ${getOrientationSymbol(machine.orientation)}`, "#e3f3b9", 8, 0],
    ["contactMaker", (machine) => `CONTACT\nMAKER ${getOrientationSymbol(machine.orientation)}`, "#e3f3b9", 9, 0],
    ["miniElectricArcFurnace", (machine) => `MINI ELECTRIC\nARC FURNACE ${getOrientationSymbol(machine.orientation)}`, "#eadbff", 8, 0],
    ["metalPress", (machine) => `METAL\nPRESS ${getOrientationSymbol(machine.orientation)}`, "#ffe7b0", 9, 0],
    ["stacker", (machine) => `STACKER\n×${Math.max(1, Math.min(3, machine.stackSize ?? 1))} ${getOrientationSymbol(machine.orientation)}`, "#ffe7b0", 8, 0],
    ["splitter", (machine) => `SPLIT ${getOrientationSymbol(machine.orientation)}`, "#d8f3ef", 8, 0],
    ["casingMachine", (machine) => `CASING\nMACHINE ${getOrientationSymbol(machine.orientation)}`, "#ffe7b0", 8, 0],
    ["quartzWheelCutter", (machine) => `QUARTZ WHEEL\nCUTTER ${getOrientationSymbol(machine.orientation)}`, "#c7f5e2", 9, 0],
  ];
  duplicateLabelSpecs.forEach(([machineId, getLabel, color, fontSize, yOffset]) => {
    getMachines(machineId).slice(1).forEach((machine) => {
      const center = getMachineLabelCenter(machine);
      addMachineFloorLabel(scene, center.x, center.y + yOffset, getLabel(machine), {
        color,
        fontFamily: "system-ui, sans-serif",
        fontSize: `${fontSize}px`,
        fontStyle: "bold",
        align: "center",
        lineSpacing: 1,
      });
    });
  });

  if (gunDeposit) {
    const gunDepositLabel = getMachineLabelCenter(gunDeposit);
    addMachineFloorLabel(scene, gunDepositLabel.x, gunDepositLabel.y, "GUN DEPOSIT", {
    color: "#c5eaff",
    fontFamily: "system-ui, sans-serif",
    fontSize: "11px",
    fontStyle: "bold",
    align: "center",
    });
  }
  if (gun) {
    const gunLabel = getMachineLabelCenter(gun);
    gunNameText = addMachineFloorLabel(scene, gunLabel.x, gunLabel.y - 10, getFactoryGunDisplayLabel(), {
    color: getFactoryGunDisplayColor(),
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    fontStyle: "bold",
    align: "center",
    lineSpacing: 2,
    });
    gunAmmoText = addMachineFloorLabel(scene, gunLabel.x, gunLabel.y + 24, "", {
    color: "#bdc8aa",
    fontFamily: "system-ui, sans-serif",
    fontSize: "11px",
    align: "center",
    });
  }

}

function addMachineFloorLabel(scene, x, y, text, style) {
  const label = scene.add.text(x, y, text, style)
    .setResolution(factoryTextResolution)
    .setOrigin(0.5);
  machineStaticLayer.add(label);
  return label;
}

function showSaleFloatingText(amount, sellTube = getMachine("sellTube")) {
  if (!machineScene || !sellTube) {
    return;
  }

  const point = getMachineTileCenter(
    sellTube.column + (sellTube.width - 1) / 2,
    sellTube.row + (sellTube.height - 1) / 2,
  );
  const label = machineScene.add.text(point.x, point.y - 18, `+${formatCash(amount)}`, {
    color: "#72d67a",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    fontStyle: "bold",
    stroke: "#172010",
    strokeThickness: 3,
  }).setResolution(factoryTextResolution).setOrigin(0.5).setDepth(6);

  machineScene.tweens.add({
    targets: label,
    y: label.y - 24,
    alpha: 0,
    duration: 900,
    ease: "Cubic.easeOut",
    onComplete: () => label.destroy(),
  });
}

function getFactoryTileFromPointer(pointer) {
  const column = Math.floor(pointer.worldX / FACTORY_TILE_SIZE);
  const row = Math.floor(pointer.worldY / FACTORY_TILE_SIZE);
  return isFactoryGridTile(column, row) ? { column, row } : null;
}

function isFactoryPointerAdditive(pointer) {
  return Boolean(pointer?.event?.shiftKey || pointer?.shiftKey);
}

function getFactoryPointerScreenPosition(pointer) {
  const event = pointer?.event;
  const x = Number.isFinite(event?.clientX) ? event.clientX : pointer?.x;
  const y = Number.isFinite(event?.clientY) ? event.clientY : pointer?.y;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function hasFactoryMarqueeExceededDragThreshold(startPosition, currentPosition) {
  return Boolean(startPosition && currentPosition)
    && Math.hypot(
      currentPosition.x - startPosition.x,
      currentPosition.y - startPosition.y,
    ) >= FACTORY_SELECTION_DRAG_THRESHOLD;
}

function shouldFinalizeFactoryMarquee(pointer, controls = elements.machineControls) {
  const event = pointer?.event;
  const target = event?.target;
  if (target && controls?.contains?.(target)) {
    return false;
  }

  const bounds = controls?.getBoundingClientRect?.();
  if (bounds && Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    const isOverControls = event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
    if (isOverControls) {
      return false;
    }
  }
  return true;
}

function getFactorySelectionBounds(startTile, endTile) {
  return {
    minColumn: Math.min(startTile.column, endTile.column),
    maxColumn: Math.max(startTile.column, endTile.column),
    minRow: Math.min(startTile.row, endTile.row),
    maxRow: Math.max(startTile.row, endTile.row),
  };
}

function isFactoryEntityInsideSelection(entity, bounds) {
  return getFactoryEntityOccupiedCoordinates(entity).some(({ column, row }) => (
    column >= bounds.minColumn
      && column <= bounds.maxColumn
      && row >= bounds.minRow
      && row <= bounds.maxRow
  ));
}

function selectFactoryEntitiesInRectangle(startTile, endTile, additive = false) {
  const bounds = getFactorySelectionBounds(startTile, endTile);
  const selected = getSelectableFactoryEntities().filter((entity) => (
    isFactoryEntityInsideSelection(entity, bounds)
  ));
  const selectedByKey = new Map(selected.map((entity) => [getFactoryEntitySelectionKey(entity), entity]));

  if (!additive) {
    selectedFactoryEntities = selected;
  } else {
    selectedFactoryEntities.forEach((entity) => {
      selectedByKey.set(getFactoryEntitySelectionKey(entity), entity);
    });
    selectedFactoryEntities = [...selectedByKey.values()];
  }
  selectedFactoryEntity = selectedFactoryEntities.length === 1
    ? selectedFactoryEntities[0]
    : null;
  selectedBuildTool = null;
  groupMoveState = null;
  selectedStorageOutputKey = null;
  if (!IS_NODE_TEST_ENVIRONMENT) {
    render();
  }
}

function setHoveredFactoryTile(nextTile) {
  if (hoveredFactoryTile?.column === nextTile?.column && hoveredFactoryTile?.row === nextTile?.row) {
    return;
  }

  hoveredFactoryTile = nextTile;
  renderMachineOverlay();
}

function handleFactoryGridPointerDown(pointer) {
  const tile = getFactoryTileFromPointer(pointer);
  if (!tile) {
    return;
  }

  factorySelectionDrag = null;

  if (pointer.rightButtonDown?.() || pointer.button === 2) {
    if (groupMoveState) {
      clearFactorySelection();
      return;
    }
    if (selectedBuildTool) {
      cancelFactoryPlacement();
      return;
    }

    const entity = getFactoryEntityAt(tile.column, tile.row);
    if (entity) {
      pickUpSelectedFactoryEntity(entity);
    }
    return;
  }

  if (groupMoveState) {
    completeGroupMove(tile.column, tile.row);
    return;
  }

  if (selectedBuildTool === "conveyor") {
    placeConveyor(tile.column, tile.row);
  } else if (selectedBuildTool) {
    placeMachine(selectedBuildTool, tile.column, tile.row);
  } else {
    const entity = getFactoryEntityAt(tile.column, tile.row);
    if (entity) {
      selectFactoryEntity(entity, isFactoryPointerAdditive(pointer));
    } else {
      factorySelectionDrag = {
        startTile: tile,
        currentTile: tile,
        startPointer: getFactoryPointerScreenPosition(pointer),
        additive: isFactoryPointerAdditive(pointer),
        moved: false,
      };
    }
  }
}

function handleFactoryGridPointerMove(pointer) {
  const tile = getFactoryTileFromPointer(pointer);
  setHoveredFactoryTile(tile);
  if (!factorySelectionDrag || !tile) {
    return;
  }

  factorySelectionDrag.currentTile = tile;
  factorySelectionDrag.moved = factorySelectionDrag.moved
    || hasFactoryMarqueeExceededDragThreshold(
      factorySelectionDrag.startPointer,
      getFactoryPointerScreenPosition(pointer),
    );
  renderMachineOverlay();
}

function handleFactoryGridPointerUp(pointer) {
  if (!factorySelectionDrag) {
    return;
  }

  const drag = factorySelectionDrag;
  factorySelectionDrag = null;
  if (!shouldFinalizeFactoryMarquee(pointer)) {
    renderMachineOverlay();
    return;
  }
  if (drag.moved) {
    selectFactoryEntitiesInRectangle(drag.startTile, drag.currentTile, drag.additive);
  } else if (!drag.additive) {
    clearFactorySelection();
  }
  renderMachineOverlay();
}

function createFactoryInteractions(scene) {
  const gridHeight = FACTORY_ROWS * FACTORY_TILE_SIZE;
  const gridHitArea = scene.add.zone(
    FACTORY_CANVAS_WIDTH / 2,
    FACTORY_GRID_START_ROW * FACTORY_TILE_SIZE + gridHeight / 2,
    FACTORY_CANVAS_WIDTH,
    gridHeight,
  );
  gridHitArea.setInteractive({ useHandCursor: true });
  gridHitArea.on("pointermove", handleFactoryGridPointerMove);
  gridHitArea.on("pointerout", () => setHoveredFactoryTile(null));
  gridHitArea.on("pointerdown", handleFactoryGridPointerDown);
  scene.input.on("pointerup", handleFactoryGridPointerUp);

  const gun = getMachine("gun");
  if (!gun) {
    return;
  }
  const gunPoint = getMachineTileCenter(gun.column + gun.width / 2 - 0.5, gun.row + gun.height / 2 - 0.5);
  const gunHitArea = scene.add.rectangle(
    gunPoint.x,
    gunPoint.y,
    gun.width * FACTORY_TILE_SIZE,
    gun.height * FACTORY_TILE_SIZE,
    0x000000,
    0,
  );
  gunHitArea.setInteractive({ useHandCursor: true });
  gunHitArea.on("pointerdown", (pointer) => {
    if (pointer.rightButtonDown?.() || pointer.button === 2) {
      cancelFactoryPlacement();
      return;
    }
    addLog(`Active gun: ${getGunDisplayName()} — Malachite rounds deal 3 damage, 4 rounds per second.`);
    render();
  });
}

function getFactoryOverlaySignature() {
  const conveyorState = getActiveFactoryConveyorItems().map(({ conveyor, item }) => (
    `${getConveyorIdentity(conveyor)}:${conveyor.direction}:${item.kind}:${item.material}:${item.quantity}:${Number(item.tileProgress ?? 0).toFixed(2)}`
  )).join("|");
  const machineState = state.machines.map((machine) => (
    `${machine.instanceId}:${machine.column}:${machine.row}:${machine.orientation ?? "right"}`
  )).join("|");
  const selectedStack = getSelectedAmmoStack();
  return [
    simulationRevision,
    conveyorState,
    machineState,
    state.planterQueue,
    selectedFactoryEntity?.type ?? "none",
    selectedFactoryEntity?.instanceId ?? "",
    selectedFactoryEntity?.column ?? "",
    selectedFactoryEntity?.row ?? "",
    selectedFactoryEntities.map(getFactoryEntitySelectionKey).join(","),
    groupMoveState
      ? `${getFactoryGroupMoveSignature()}:${hoveredFactoryTile?.column ?? ""}:${hoveredFactoryTile?.row ?? ""}`
      : "",
    factorySelectionDrag
      ? `${factorySelectionDrag.startTile.column}:${factorySelectionDrag.startTile.row}:${factorySelectionDrag.currentTile.column}:${factorySelectionDrag.currentTile.row}`
      : "",
    selectedBuildTool ?? "",
    selectedBuildOrientation,
    hoveredFactoryTile?.column ?? "",
    hoveredFactoryTile?.row ?? "",
    getTutorialStage(),
    getSelectedGun(),
    state.mine.rapidfireGunMk1Purchased,
    selectedStack?.count ?? 0,
    getSelectedAmmoMaterial(),
    getSelectedAmmoAnnealed(),
  ].join(";");
}

function drawFactoryEntitySelection(entity, color = 0xf5d976, alpha = 0.95) {
  const object = resolveFactoryEntity(entity);
  if (!object) {
    return;
  }

  machineOverlay.lineStyle(3, color, alpha);
  getFactoryEntityOccupiedCoordinates(entity, object).forEach(({ column, row }) => {
    machineOverlay.strokeRect(
      column * FACTORY_TILE_SIZE + 2,
      row * FACTORY_TILE_SIZE + 2,
      FACTORY_TILE_SIZE - 4,
      FACTORY_TILE_SIZE - 4,
    );
  });
}

function drawFactoryGroupPreview() {
  if (!groupMoveState || !hoveredFactoryTile) {
    return;
  }

  const valid = isFactoryGroupPlacementBuildable(hoveredFactoryTile.column, hoveredFactoryTile.row);
  const plan = getFactoryGroupPlacementPlan(hoveredFactoryTile.column, hoveredFactoryTile.row);
  plan.forEach((entry) => {
    const candidate = entry.descriptor.type === "machine"
      ? {
        ...entry.object,
        column: entry.column,
        row: entry.row,
        orientation: entry.orientation,
      }
      : null;
    const tiles = entry.descriptor.type === "machine"
      ? getMachineOccupiedTiles(candidate)
      : [{ column: entry.column, row: entry.row }];
    machineOverlay.fillStyle(valid ? 0xc9dc75 : 0xd8765b, 0.22);
    machineOverlay.lineStyle(3, valid ? 0xc9dc75 : 0xd8765b, 0.9);
    tiles.forEach(({ column, row }) => {
      machineOverlay.fillRect(
        column * FACTORY_TILE_SIZE + 2,
        row * FACTORY_TILE_SIZE + 2,
        FACTORY_TILE_SIZE - 4,
        FACTORY_TILE_SIZE - 4,
      );
      machineOverlay.strokeRect(
        column * FACTORY_TILE_SIZE + 2,
        row * FACTORY_TILE_SIZE + 2,
        FACTORY_TILE_SIZE - 4,
        FACTORY_TILE_SIZE - 4,
      );
    });

    if (candidate) {
      drawMachinePreviewConveyors(machineOverlay, candidate, valid);
      drawMachinePlacementDirectionIndicator(machineOverlay, candidate, valid);
    } else {
      drawConveyorTile(machineOverlay, entry.column, entry.row, entry.direction, {
        fillColor: valid ? 0x4e7180 : 0x713f3a,
        arrowColor: valid ? 0xd6f5ff : 0xf1b0a4,
        opacity: 0.82,
      });
    }
  });
}

function renderMachineOverlay() {
  if (!machineScene || !machineOverlay) {
    return;
  }

  const signature = getFactoryOverlaySignature();
  if (signature === lastFactoryOverlaySignature) {
    return;
  }
  lastFactoryOverlaySignature = signature;

  clearStorageOutputLabels();
  machineOverlay.clear();
  drawConveyorItemBuffers();
  drawPlanterQueue(machineOverlay);
  drawStorageOutputLabels();

  if (selectedFactoryEntities.length > 0) {
    selectedFactoryEntities.forEach((entity) => drawFactoryEntitySelection(entity));
  }
  if (factorySelectionDrag?.moved) {
    const bounds = getFactorySelectionBounds(
      factorySelectionDrag.startTile,
      factorySelectionDrag.currentTile,
    );
    machineOverlay.fillStyle(0xc9dc75, 0.12);
    machineOverlay.lineStyle(2, 0xf5d976, 0.9);
    machineOverlay.fillRect(
      bounds.minColumn * FACTORY_TILE_SIZE + 1,
      bounds.minRow * FACTORY_TILE_SIZE + 1,
      (bounds.maxColumn - bounds.minColumn + 1) * FACTORY_TILE_SIZE - 2,
      (bounds.maxRow - bounds.minRow + 1) * FACTORY_TILE_SIZE - 2,
    );
    machineOverlay.strokeRect(
      bounds.minColumn * FACTORY_TILE_SIZE + 1,
      bounds.minRow * FACTORY_TILE_SIZE + 1,
      (bounds.maxColumn - bounds.minColumn + 1) * FACTORY_TILE_SIZE - 2,
      (bounds.maxRow - bounds.minRow + 1) * FACTORY_TILE_SIZE - 2,
    );
  }
  drawFactoryGroupPreview();

  const duster = getMachine("leekDuster");
  drawMachineUpgradeTile(machineOverlay, getMachineUpgradeTile(duster), true, 0.2);

  const tutorialRequirement = getTutorialPlacementRequirement();
  if (getTutorialStage() === "factoryRoute") {
    machineOverlay.lineStyle(3, 0xf5d976, 0.95);
    STARTER_ROUTE_CONVEYORS.forEach((required) => {
      machineOverlay.strokeRect(
        required.column * FACTORY_TILE_SIZE + 2,
        required.row * FACTORY_TILE_SIZE + 2,
        FACTORY_TILE_SIZE - 4,
        FACTORY_TILE_SIZE - 4,
      );
    });
  } else if (tutorialRequirement) {
    machineOverlay.lineStyle(3, 0xf5d976, 0.95);
    machineOverlay.strokeRect(
      tutorialRequirement.column * FACTORY_TILE_SIZE + 2,
      tutorialRequirement.row * FACTORY_TILE_SIZE + 2,
      FACTORY_TILE_SIZE - 4,
      FACTORY_TILE_SIZE - 4,
    );
  }

  if (selectedBuildTool && hoveredFactoryTile) {
    const isConveyor = selectedBuildTool === "conveyor";
    const selectedMachine = isConveyor ? null : MACHINE_LAYOUT[selectedBuildTool];
    const isBuildable = isConveyor
      ? isBuildableFactoryTile(hoveredFactoryTile.column, hoveredFactoryTile.row)
      : isMachineFootprintBuildable(
        selectedMachine,
        hoveredFactoryTile.column,
        hoveredFactoryTile.row,
        selectedBuildOrientation,
      );
    const matchesTutorialTile = !tutorialRequirement
      || (hoveredFactoryTile.column === tutorialRequirement.column
        && hoveredFactoryTile.row === tutorialRequirement.row);
    const matchesTutorialOrientation = !tutorialRequirement
      || selectedBuildOrientation === tutorialRequirement.direction;
    const previewIsValid = isBuildable && matchesTutorialTile && matchesTutorialOrientation;

    if (isConveyor) {
      drawConveyorTile(
        machineOverlay,
        hoveredFactoryTile.column,
        hoveredFactoryTile.row,
        selectedBuildOrientation,
        {
          fillColor: previewIsValid ? 0xc9dc75 : 0xd8765b,
          arrowColor: 0x172010,
          opacity: 0.52,
        },
      );
    } else {
      const previewMachine = {
        ...selectedMachine,
        column: hoveredFactoryTile.column,
        row: hoveredFactoryTile.row,
        orientation: selectedBuildOrientation,
      };
      machineOverlay.fillStyle(previewIsValid ? 0xc9dc75 : 0xd8765b, 0.4);
      if (Array.isArray(previewMachine.occupiedTiles)) {
        getMachineOccupiedTiles(previewMachine).forEach(({ column, row }) => {
          machineOverlay.fillRect(
            column * FACTORY_TILE_SIZE + 2,
            row * FACTORY_TILE_SIZE + 2,
            FACTORY_TILE_SIZE - 4,
            FACTORY_TILE_SIZE - 4,
          );
        });
      } else {
        const previewSize = getMachineFootprintSize(previewMachine);
        machineOverlay.fillRect(
          hoveredFactoryTile.column * FACTORY_TILE_SIZE + 2,
          hoveredFactoryTile.row * FACTORY_TILE_SIZE + 2,
          previewSize.width * FACTORY_TILE_SIZE - 4,
          previewSize.height * FACTORY_TILE_SIZE - 4,
        );
      }
      drawMachinePreviewConveyors(machineOverlay, previewMachine, previewIsValid);
      drawMachinePlacementDirectionIndicator(machineOverlay, previewMachine, previewIsValid);

      if (previewMachine.upgradeOrigin) {
        const upgradeTile = getMachineUpgradeTile(previewMachine);
        drawMachineUpgradeTile(machineOverlay, upgradeTile, previewIsValid, 0.38);
      }
    }
  }

  // Keep temporary liquid-port labels visible above the machine floor and its
  // text labels. These are visual placeholders until real pipes exist.
  drawMachineLiquidPorts(machineOverlay);

  const selectedStack = getSelectedAmmoStack();
  const selectedGun = getSelectedGun();
  gunNameText
    ?.setText(getFactoryGunDisplayLabel(selectedGun))
    .setColor(getFactoryGunDisplayColor(selectedGun));
  gunAmmoText?.setText(getFactoryAmmoReadyLabel(selectedStack));
}

function drawMachinePreviewConveyors(graphics, machine, isValid) {
  const fillColor = isValid ? 0x4e7180 : 0x713f3a;
  const arrowColor = isValid ? 0xd6f5ff : 0xf1b0a4;
  getInternalConveyorTiles(machine).forEach((conveyor) => {
    drawConveyorTile(graphics, conveyor.column, conveyor.row, conveyor.direction, {
      fillColor,
      arrowColor,
      opacity: 0.82,
    });
  });
  if (machine.id === "stacker") {
    drawStackerPorts(graphics, machine, {
      inputFillColor: fillColor,
      inputArrowColor: arrowColor,
      outputFillColor: isValid ? 0x927a59 : 0x713f3a,
      outputArrowColor: isValid ? 0x2d2419 : 0xf1b0a4,
      opacity: 0.82,
    });
  }
  if (machine.id === "splitter") {
    drawSplitterPorts(graphics, machine, {
      inputFillColor: fillColor,
      inputArrowColor: arrowColor,
      outputFillColor: isValid ? 0x668f88 : 0x713f3a,
      outputArrowColor: isValid ? 0x1e302d : 0xf1b0a4,
      opacity: 0.82,
    });
  }
}

function drawMachineUpgradeTile(graphics, tile, isValid, opacity) {
  if (!tile || !isFactoryGridTile(tile.column, tile.row)) {
    return;
  }

  const color = isValid ? 0xd8e795 : 0xd8765b;
  graphics.fillStyle(color, opacity);
  graphics.fillRect(
    tile.column * FACTORY_TILE_SIZE + 3,
    tile.row * FACTORY_TILE_SIZE + 3,
    FACTORY_TILE_SIZE - 6,
    FACTORY_TILE_SIZE - 6,
  );
  graphics.lineStyle(2, color, Math.min(opacity + 0.55, 0.9));
  graphics.strokeRect(
    tile.column * FACTORY_TILE_SIZE + 4,
    tile.row * FACTORY_TILE_SIZE + 4,
    FACTORY_TILE_SIZE - 8,
    FACTORY_TILE_SIZE - 8,
  );
}

function drawMachinePlacementDirectionIndicator(graphics, machine, isValid) {
  if (!machine.orientation) {
    return;
  }

  const size = getMachineFootprintSize(machine);
  const left = machine.column * FACTORY_TILE_SIZE;
  const top = machine.row * FACTORY_TILE_SIZE;
  const width = size.width * FACTORY_TILE_SIZE;
  const height = size.height * FACTORY_TILE_SIZE;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const arrowLength = Math.min(22, Math.max(10, Math.min(width, height) * 0.48));
  const arrowHalfWidth = Math.min(9, Math.max(5, Math.min(width, height) * 0.2));
  const color = isValid ? 0x1b2b17 : 0x4d160f;

  graphics.fillStyle(color, 0.82);
  if (machine.orientation === "right") {
    graphics.fillTriangle(
      centerX + arrowLength / 2,
      centerY,
      centerX - arrowLength / 2,
      centerY - arrowHalfWidth,
      centerX - arrowLength / 2,
      centerY + arrowHalfWidth,
    );
  } else if (machine.orientation === "left") {
    graphics.fillTriangle(
      centerX - arrowLength / 2,
      centerY,
      centerX + arrowLength / 2,
      centerY - arrowHalfWidth,
      centerX + arrowLength / 2,
      centerY + arrowHalfWidth,
    );
  } else if (machine.orientation === "up") {
    graphics.fillTriangle(
      centerX,
      centerY - arrowLength / 2,
      centerX - arrowHalfWidth,
      centerY + arrowLength / 2,
      centerX + arrowHalfWidth,
      centerY + arrowLength / 2,
    );
  } else {
    graphics.fillTriangle(
      centerX,
      centerY + arrowLength / 2,
      centerX - arrowHalfWidth,
      centerY - arrowLength / 2,
      centerX + arrowHalfWidth,
      centerY - arrowLength / 2,
    );
  }
}

function drawPlanterQueue(graphics) {
  if (state.planterQueue <= 0) {
    return;
  }

  const planter = getMachine("planter");
  if (!planter) {
    return;
  }
  const queueY = (planter.row + 2.45) * FACTORY_TILE_SIZE;
  graphics.fillStyle(0x2d2419, 0.82);
  graphics.fillRoundedRect(
    planter.column * FACTORY_TILE_SIZE + 10,
    planter.row * FACTORY_TILE_SIZE + planter.height * FACTORY_TILE_SIZE - 25,
    planter.width * FACTORY_TILE_SIZE - 20,
    17,
    5,
  );

  for (let index = 0; index < state.planterQueue; index += 1) {
    const queueX = (planter.column + 0.7 + index * 1.6) * FACTORY_TILE_SIZE;
    graphics.fillStyle(MATERIAL_COLORS.leek, 1);
    graphics.fillRoundedRect(queueX - 5, queueY - 7, 10, 14, 3);
    graphics.fillStyle(0xdfe996, 1);
    graphics.fillTriangle(queueX - 6, queueY - 7, queueX + 1, queueY - 7, queueX - 2, queueY - 15);
    graphics.fillTriangle(queueX - 1, queueY - 7, queueX + 6, queueY - 7, queueX + 3, queueY - 15);
  }
}

function clearStorageOutputLabels() {
  storageOutputLabels.forEach((label) => label.destroy());
  storageOutputLabels = [];
}

function clearConveyorItemLabels() {
  conveyorItemLabels.forEach((label) => label.destroy());
  conveyorItemLabels.clear();
}

function drawConveyorItemBuffers() {
  const activeLabelKeys = new Set();
  getActiveFactoryConveyorItems().forEach(({ conveyor, item }) => {

    const origin = getMachineTileCenter(conveyor.column, conveyor.row);
    const vector = DIRECTION_VECTORS[conveyor.direction];
    const progress = Math.min(item.tileProgress ?? 0, 0.92);
    const point = {
      x: origin.x + vector.column * FACTORY_TILE_SIZE * progress,
      y: origin.y + vector.row * FACTORY_TILE_SIZE * progress,
    };
    const color = MATERIAL_COLORS[item.material] ?? 0xf4f5da;
    const visualKind = getFactoryMaterialVisualKind(item.material);
    machineOverlay.fillStyle(color, 1);
    if (visualKind === "ore") {
      machineOverlay.fillEllipse(point.x, point.y, 16, 10);
    } else if (visualKind === "ingot") {
      machineOverlay.fillRoundedRect(point.x - 7, point.y - 4, 14, 8, 3);
    } else if (visualKind === "plate") {
      machineOverlay.fillRoundedRect(point.x - 7, point.y - 7, 14, 14, 3);
    } else if (visualKind === "wire") {
      const horizontal = vector.column !== 0;
      machineOverlay.fillRoundedRect(
        point.x - (horizontal ? 7 : 2),
        point.y - (horizontal ? 2 : 7),
        horizontal ? 14 : 4,
        horizontal ? 4 : 14,
        2,
      );
    } else {
      machineOverlay.fillRoundedRect(point.x - 7, point.y - 7, 14, 14, 3);
    }
    machineOverlay.lineStyle(1, 0xf4f5da, 0.9);
    if (visualKind === "ore") {
      machineOverlay.strokeEllipse(point.x, point.y, 16, 10);
    } else if (visualKind === "ingot") {
      machineOverlay.strokeRoundedRect(point.x - 7, point.y - 4, 14, 8, 3);
    } else if (visualKind === "plate") {
      machineOverlay.strokeRoundedRect(point.x - 7, point.y - 7, 14, 14, 3);
    } else if (visualKind === "wire") {
      const horizontal = vector.column !== 0;
      machineOverlay.strokeRoundedRect(
        point.x - (horizontal ? 7 : 2),
        point.y - (horizontal ? 2 : 7),
        horizontal ? 14 : 4,
        horizontal ? 4 : 14,
        2,
      );
    } else {
      machineOverlay.strokeRoundedRect(point.x - 7, point.y - 7, 14, 14, 3);
    }

    const displayedQuantity = Number(Number(item.quantity).toPrecision(12));
    if (displayedQuantity > 1 && machineScene) {
      const labelKey = getConveyorIdentity(conveyor);
      activeLabelKeys.add(labelKey);
      let label = conveyorItemLabels.get(labelKey);
      const quantityText = formatQuantity(displayedQuantity);
      if (!label) {
        label = machineScene.add.text(point.x + 7, point.y - 7, quantityText, {
          color: "#fffde1",
          fontFamily: "system-ui, sans-serif",
          fontSize: "9px",
          fontStyle: "bold",
          stroke: "#172010",
          strokeThickness: 2,
        }).setResolution(factoryTextResolution).setOrigin(0.5).setDepth(3);
        conveyorItemLabels.set(labelKey, label);
      }
      label.setPosition(point.x + 7, point.y - 7).setText(quantityText);
    }
  });
  conveyorItemLabels.forEach((label, labelKey) => {
    if (!activeLabelKeys.has(labelKey)) {
      label.destroy();
      conveyorItemLabels.delete(labelKey);
    }
  });
}

function createAnimatedMaterialCargo(material, x, y, width, height) {
  const visualKind = getFactoryMaterialVisualKind(material);
  const cargo = visualKind === "ore"
    ? machineScene.add.ellipse(x, y, width, Math.round(height * 0.62), MATERIAL_COLORS[material], 1)
    : machineScene.add.rectangle(
      x,
      y,
      width,
      visualKind === "wire"
        ? Math.max(3, Math.round(height * 0.2))
        : visualKind === "ingot"
          ? Math.round(height * 0.5)
          : height,
      MATERIAL_COLORS[material],
    );
  cargo.setStrokeStyle(2, 0xf4f5da, 0.8);
  return cargo;
}

function drawStorageOutputLabels() {
  const storage = selectedFactoryEntity?.type === "machine"
    && selectedFactoryEntity.id === "materialStorage"
    ? getMachineByInstanceId(selectedFactoryEntity.instanceId)
    : null;
  if (!storage || !machineScene) {
    return;
  }

  getActiveStorageOutputPorts(storage).forEach((port, index) => {
    const point = getMachineTileCenter(port.column, port.row);
    const label = machineScene.add.text(point.x, point.y, String(index + 1), {
      color: "#fff5b5",
      fontFamily: "system-ui, sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      stroke: "#1b2118",
      strokeThickness: 3,
    }).setResolution(factoryTextResolution).setOrigin(0.5).setDepth(3);
    storageOutputLabels.push(label);
  });
}

function drawConveyorTile(graphics, column, row, direction, options = {}) {
  const {
    fillColor = 0x6f7780,
    arrowColor = 0x28302c,
    opacity = 1,
  } = options;
  const point = getMachineTileCenter(column, row);
  graphics.fillStyle(fillColor, opacity);
  const conveyorWidth = FACTORY_TILE_SIZE - 4;
  const conveyorHeight = FACTORY_TILE_SIZE - 10;
  graphics.fillRoundedRect(
    point.x - conveyorWidth / 2,
    point.y - conveyorHeight / 2,
    conveyorWidth,
    conveyorHeight,
    4,
  );
  graphics.fillStyle(arrowColor, opacity);

  if (direction === "right") {
    graphics.fillTriangle(point.x - 4, point.y - 7, point.x - 4, point.y + 7, point.x + 8, point.y);
  } else if (direction === "left") {
    graphics.fillTriangle(point.x + 4, point.y - 7, point.x + 4, point.y + 7, point.x - 8, point.y);
  } else if (direction === "up") {
    graphics.fillTriangle(point.x - 7, point.y + 4, point.x + 7, point.y + 4, point.x, point.y - 8);
  } else {
    graphics.fillTriangle(point.x - 7, point.y - 4, point.x + 7, point.y - 4, point.x, point.y + 8);
  }
}

function drawStackerPorts(graphics, stacker, options = {}) {
  if (!stacker) {
    return;
  }

  const {
    inputFillColor = 0x6f7780,
    inputArrowColor = 0x28302c,
    outputFillColor = 0x927a59,
    outputArrowColor = 0x2d2419,
    opacity = 0.24,
  } = options;
  const drawPort = (column, row, direction, fillColor, arrowColor) => {
    if (!isFactoryGridTile(column, row)) {
      return;
    }
    drawConveyorTile(graphics, column, row, direction, {
      fillColor,
      arrowColor,
      opacity,
    });
  };

  const outputDirection = stacker.orientation ?? "right";
  const outputVector = DIRECTION_VECTORS[outputDirection];
  drawPort(
    stacker.column + outputVector.column,
    stacker.row + outputVector.row,
    outputDirection,
    outputFillColor,
    outputArrowColor,
  );

  getStackerInputFlowDirections(stacker).forEach((flowDirection) => {
    const sourceSide = DIRECTION_VECTORS[getOppositeDirection(flowDirection)];
    drawPort(
      stacker.column + sourceSide.column,
      stacker.row + sourceSide.row,
      flowDirection,
      inputFillColor,
      inputArrowColor,
    );
  });
}

function drawSplitterPorts(graphics, splitter, options = {}) {
  if (!splitter) {
    return;
  }

  const {
    inputFillColor = 0x6f7780,
    inputArrowColor = 0x28302c,
    outputFillColor = 0x668f88,
    outputArrowColor = 0x1e302d,
    opacity = 0.24,
  } = options;
  const orientation = splitter.orientation ?? "right";
  const inputVector = DIRECTION_VECTORS[getOppositeDirection(orientation)];
  const drawPort = (column, row, direction, fillColor, arrowColor) => {
    if (!isFactoryGridTile(column, row)) {
      return;
    }
    drawConveyorTile(graphics, column, row, direction, {
      fillColor,
      arrowColor,
      opacity,
    });
  };

  drawPort(
    splitter.column + inputVector.column,
    splitter.row + inputVector.row,
    orientation,
    inputFillColor,
    inputArrowColor,
  );
  getSplitterOutputDirections(splitter).forEach((direction) => {
    const vector = DIRECTION_VECTORS[direction];
    drawPort(
      splitter.column + vector.column,
      splitter.row + vector.row,
      direction,
      outputFillColor,
      outputArrowColor,
    );
  });
}

function drawMachineLiquidPorts(graphics) {
  const drawLiquidPort = (port) => {
    if (!port) {
      return;
    }
    drawConveyorTile(graphics, port.column, port.row, port.direction, {
      fillColor: 0x4e7180,
      arrowColor: 0xd6f5ff,
    });
  };

  const caster = getMachine("ammoShaper");
  if (caster) {
    getMachinePorts(caster, "liquidInputs").forEach(drawLiquidPort);
  }
  getMachines("jacketFormer").forEach((jacketFormer) => {
    getMachinePorts(jacketFormer, "liquidInputs").forEach(drawLiquidPort);
  });
  getMachines("casingMachine").forEach((casingMachine) => {
    getMachinePorts(casingMachine, "liquidInputs").forEach(drawLiquidPort);
  });
  getMachines("ingotMolder").forEach((molder) => {
    drawLiquidPort(getMachinePort(molder, "liquidInputOutput"));
  });
  getMachines("clayKiln").forEach((kiln) => {
    drawLiquidPort(getMachinePort(kiln, "liquidOutput"));
  });
  getMachines("contactMaker").forEach((maker) => {
    drawLiquidPort(getMachinePort(maker, "silverInput"));
  });
  getMachines("miniElectricArcFurnace").forEach((furnace) => {
    drawLiquidPort(getMachinePort(furnace, "liquidOutput"));
  });
}

function animateMaterialToAmmoShaper(material, onDelivered) {
  if (!machineScene) {
    onDelivered();
    return;
  }

  const planter = getMachine("planter");
  const shaper = getMachine("ammoShaper");
  if (!planter || !shaper) {
    onDelivered();
    return;
  }
  const planterLanes = getInternalConveyorTiles(planter);
  const shaperLanes = getInternalConveyorTiles(shaper);
  const planterProcessIndex = getMachineProcessLaneIndex(planter);
  const shaperProcessIndex = getMachineProcessLaneIndex(shaper);
  const planterProcessTile = planterLanes[planterProcessIndex];
  const start = getMachineTileCenter(planterProcessTile.column, planterProcessTile.row);
  const cargo = createAnimatedMaterialCargo(material, start.x, start.y, 18, 26);
  conveyorItems.add(cargo);

  animateCargoAlongPoints(cargo, [
    ...planterLanes.slice(planterProcessIndex + 1).map((conveyor) => (
      getMachineTileCenter(conveyor.column, conveyor.row)
    )),
    ...(getPlanterAmmoRoute() ?? []).map((conveyor) => (
      getMachineTileCenter(conveyor.column, conveyor.row)
    )),
    ...shaperLanes.slice(0, shaperProcessIndex + 1).map((conveyor) => (
      getMachineTileCenter(conveyor.column, conveyor.row)
    )),
  ], () => {
    conveyorItems.delete(cargo);
    cargo.destroy();
    onDelivered();
  });
}

function animateMaterialToStorage(material, destination, onDelivered) {
  if (!machineScene) {
    onDelivered();
    return;
  }

  const planter = getMachine("planter");
  if (!planter) {
    onDelivered();
    return;
  }
  const planterLanes = getInternalConveyorTiles(planter);
  const planterProcessIndex = getMachineProcessLaneIndex(planter);
  const planterProcessTile = planterLanes[planterProcessIndex];
  const start = getMachineTileCenter(planterProcessTile.column, planterProcessTile.row);
  const cargo = createAnimatedMaterialCargo(material, start.x, start.y, 18, 26);
  conveyorItems.add(cargo);

  animateCargoAlongPoints(cargo, [
    ...planterLanes.slice(planterProcessIndex + 1).map((conveyor) => (
      getMachineTileCenter(conveyor.column, conveyor.row)
    )),
    ...destination.route.map((conveyor) => (
      getMachineTileCenter(conveyor.column, conveyor.row)
    )),
    getMachineTileCenter(destination.storageInput.column, destination.storageInput.row),
  ], () => {
    conveyorItems.delete(cargo);
    cargo.destroy();
    onDelivered();
  });
}

function animateMaterialFromStorage(port, route, material, duster, onDelivered) {
  if (!machineScene) {
    onDelivered();
    return;
  }

  const start = getMachineTileCenter(port.column, port.row);
  const cargo = createAnimatedMaterialCargo(material, start.x, start.y, 18, 22);
  cargo.setStrokeStyle(2, duster ? 0xd8e795 : 0xf4f5da, 0.8);
  conveyorItems.add(cargo);
  const points = [
    ...route.route.slice(1).map((conveyor) => getMachineTileCenter(conveyor.column, conveyor.row)),
    getMachineTileCenter(route.sellTubeInput.column, route.sellTubeInput.row),
  ];

  animateCargoAlongPoints(cargo, points, () => {
    conveyorItems.delete(cargo);
    cargo.destroy();
    onDelivered();
  });
}

function animateAmmoToDeposit(material, amount, onDelivered) {
  if (!machineScene) {
    onDelivered();
    return;
  }

  const shaper = getMachine("ammoShaper");
  const gunDeposit = getMachine("gunDeposit");
  if (!shaper || !gunDeposit) {
    onDelivered();
    return;
  }
  const shaperLanes = getInternalConveyorTiles(shaper);
  const shaperProcessIndex = getMachineProcessLaneIndex(shaper);
  const shaperProcessTile = shaperLanes[shaperProcessIndex];
  const start = getMachineTileCenter(shaperProcessTile.column, shaperProcessTile.row);
  const cargo = machineScene.add.container(start.x, start.y);
  const ammo = machineScene.add.rectangle(0, 0, 30, 18, MATERIAL_COLORS[material], 1);
  ammo.setStrokeStyle(2, 0xfff3b0, 0.9);
  const label = machineScene.add.text(0, 0, String(amount), {
    color: "#111711",
    fontFamily: "system-ui, sans-serif",
    fontSize: "11px",
    fontStyle: "bold",
  }).setResolution(factoryTextResolution).setOrigin(0.5);
  cargo.add([ammo, label]);
  conveyorItems.add(cargo);

  animateCargoAlongPoints(cargo, [
    ...shaperLanes.slice(shaperProcessIndex + 1).map((conveyor) => (
      getMachineTileCenter(conveyor.column, conveyor.row)
    )),
    ...(getAmmoDepositRoute() ?? []).map((conveyor) => (
      getMachineTileCenter(conveyor.column, conveyor.row)
    )),
    getMachineTileCenter(gunDeposit.input.column, gunDeposit.input.row),
  ], () => {
    conveyorItems.delete(cargo);
    cargo.destroy();
    onDelivered();
  });
}

function animateCargoAlongPoints(cargo, points, onDelivered, pointIndex = 0) {
  const destination = points[pointIndex];
  machineScene.tweens.add({
    targets: cargo,
    x: destination.x,
    y: destination.y,
    duration: 180,
    ease: "Linear",
    onComplete: () => {
      if (pointIndex + 1 < points.length) {
        animateCargoAlongPoints(cargo, points, onDelivered, pointIndex + 1);
      } else {
        onDelivered();
      }
    },
  });
}

function clearConveyorItems() {
  conveyorItems.forEach((item) => {
    machineScene?.tweens.killTweensOf(item);
    item.destroy();
  });
  conveyorItems.clear();
  clearConveyorItemLabels();
}

function renderAmmoMaker() {
  syncSelectedAmmoForGun();
  const selectedGunType = getSelectedGunAmmoType();
  const selectorOptions = selectedGunType === "rapidfire"
    ? getAmmoSelectorOptions().map((option) => ({
      casingMaterial: null,
      jacketMaterial: null,
      coreMaterial: option.material,
      damage: option.damage,
      annealed: option.annealed,
    }))
    : [];
  state.ammoStacks.forEach((stack) => {
    if ((stack.type ?? "rapidfire") === selectedGunType && stack.count > 0) {
      selectorOptions.push({
        ...getAmmoComposition(stack),
        damage: Number(stack.damage),
        annealed: stack.annealed === true,
      });
    }
  });
  const unique = (values) => [...new Set(values.filter((value) => value != null))];
  const selected = getSelectedAmmoComposition();
  const casingValues = unique(selectorOptions.map((option) => option.casingMaterial));
  const casingSelectValues = casingValues.length > 0
    ? [NONE_CASING_VALUE, ...casingValues]
    : [];
  let selectedCasing = selected.casingMaterial;
  if (selectedCasing !== null && !casingValues.includes(selectedCasing)) {
    selectedCasing = casingValues[0] ?? null;
  }
  const casingScopedOptions = selectorOptions.filter((option) => (
    option.casingMaterial === selectedCasing
  ));
  const jacketValues = unique(casingScopedOptions.map((option) => option.jacketMaterial));
  const hasUnjacketedOption = casingScopedOptions.some((option) => option.jacketMaterial === null);
  let selectedJacket = selected.jacketMaterial;
  if (selectedJacket !== null && !jacketValues.includes(selectedJacket)) {
    selectedJacket = jacketValues[0] ?? null;
  } else if (selectedJacket === null && !hasUnjacketedOption) {
    selectedJacket = jacketValues[0] ?? null;
  }
  const jacketSelectValues = jacketValues.length > 0
    ? [NONE_JACKET_VALUE, ...jacketValues]
    : [];
  const jacketScopedOptions = casingScopedOptions.filter((option) => (
    option.jacketMaterial === selectedJacket
  ));
  const coreValues = unique(jacketScopedOptions.map((option) => option.coreMaterial));
  const selectedCore = coreValues.includes(selected.coreMaterial)
    ? selected.coreMaterial
    : coreValues[0] ?? null;
  let matchingOptions = jacketScopedOptions.filter((option) => (
    option.coreMaterial === selectedCore
  ));
  if (matchingOptions.length === 0 && selectorOptions.length > 0) {
    const fallback = selectorOptions.find((option) => option.casingMaterial === selectedCasing)
      ?? selectorOptions.find((option) => option.jacketMaterial === selectedJacket)
      ?? selectorOptions.find((option) => option.casingMaterial != null)
      ?? selectorOptions[0];
    selectedCasing = fallback.casingMaterial;
    selectedJacket = fallback.jacketMaterial;
    matchingOptions = selectorOptions.filter((option) => (
      option.casingMaterial === selectedCasing
        && option.jacketMaterial === selectedJacket
    ));
  }
  selected.casingMaterial = selectedCasing;
  selected.jacketMaterial = selectedJacket;
  selected.coreMaterial = selectedCore;
  state.mine.selectedAmmoCasingMaterial = selectedCasing;
  state.mine.selectedAmmoJacketMaterial = selectedJacket;
  state.mine.selectedAmmoCoreMaterial = selectedCore;
  state.mine.selectedAmmoMaterial = selectedCore;
  const damageVariantKey = (option) => `${option.damage}|${option.annealed === true ? "annealed" : "normal"}`;
  const damageValues = unique(matchingOptions.map(damageVariantKey));

  const selectorSignature = [
    casingSelectValues, jacketSelectValues, coreValues, damageValues,
    selected.casingMaterial, selected.jacketMaterial, selected.coreMaterial,
    selectedGunType,
  ].flat().join("|");
  if (elements.ammoMaterialSelect.dataset.signature !== selectorSignature) {
    elements.ammoMaterialSelect.replaceChildren();
    const addSelect = (label, key, values, visible = true) => {
      if (!visible || values.length === 0) return null;
      const wrapper = document.createElement("label");
      wrapper.className = "ammo-category";
      const labelText = document.createElement("span");
      labelText.className = "ammo-category-label";
      labelText.textContent = label;
      wrapper.append(labelText);
      if (key !== "damage") {
        const visual = document.createElement("span");
        const visualMaterial = key === "casingMaterial" ? (selected.casingMaterial ?? "none")
          : key === "jacketMaterial" ? (selected.jacketMaterial ?? "none")
            : selected.coreMaterial;
        visual.className = `ammo-category-visual is-${visualMaterial ?? values[0]}`;
        visual.setAttribute("aria-hidden", "true");
        labelText.prepend(visual);
      }
      const select = document.createElement("select");
      select.dataset.category = key;
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        if (key === "damage") {
          const [damageText, annealedText] = String(value).split("|");
          const damage = Number(damageText);
          const annealed = annealedText === "annealed";
            const exactCount = state.ammoStacks
              .filter((stack) => (stack.type ?? "rapidfire") === selectedGunType
                && getAmmoComposition(stack).casingMaterial === selected.casingMaterial
                && getAmmoComposition(stack).jacketMaterial === selected.jacketMaterial
                && getAmmoComposition(stack).coreMaterial === selected.coreMaterial
                && Number(stack.damage) === damage
                && (stack.annealed === true) === annealed)
              .reduce((total, stack) => total + stack.count, 0);
          option.textContent = `${formatNumber(damage)} damage · ${formatNumber(exactCount)} left`;
        } else {
          option.textContent = value === NONE_CASING_VALUE || value === NONE_JACKET_VALUE
            ? "None"
            : key === "coreMaterial"
              ? getAmmoCoreLabel(value)
              : MATERIAL_LABELS[value] ?? value;
        }
        select.append(option);
      });
      select.addEventListener("change", () => {
        const value = key === "casingMaterial" && select.value === NONE_CASING_VALUE
          ? null
          : key === "jacketMaterial" && select.value === NONE_JACKET_VALUE
          ? null
          : select.value || null;
        if (key === "casingMaterial") state.mine.selectedAmmoCasingMaterial = value;
        if (key === "jacketMaterial") state.mine.selectedAmmoJacketMaterial = value;
        if (key === "coreMaterial") {
          state.mine.selectedAmmoCoreMaterial = value;
          state.mine.selectedAmmoMaterial = value;
        }
        if (key === "damage") {
          const [damageText, annealedText] = String(value).split("|");
          state.mine.selectedAmmoDamage = Number(damageText);
          state.mine.selectedAmmoAnnealed = annealedText === "annealed";
          const matchingDamage = selectorOptions.find((option) => (
            option.casingMaterial === state.mine.selectedAmmoCasingMaterial
              && option.jacketMaterial === state.mine.selectedAmmoJacketMaterial
              && option.coreMaterial === state.mine.selectedAmmoCoreMaterial
              && damageVariantKey(option) === value
          ));
          if (matchingDamage) {
            state.mine.selectedAmmoAnnealed = matchingDamage.annealed === true;
          }
        }
        saveGame();
        render();
      });
      wrapper.append(select);
      elements.ammoMaterialSelect.append(wrapper);
      return select;
    };
    addSelect("Casing", "casingMaterial", casingSelectValues, casingSelectValues.length > 0);
    addSelect("Jacket", "jacketMaterial", jacketSelectValues, jacketSelectValues.length > 0);
    addSelect("Core", "coreMaterial", coreValues);
    addSelect("Damage", "damage", damageValues);
    elements.ammoMaterialSelect.dataset.signature = selectorSignature;
  }
  const selectedDamageVariant = matchingOptions.find((option) => (
    Number(option.damage) === Number(selected.damage)
      && option.annealed === selected.annealed
  )) ?? matchingOptions.find((option) => (
    Number(option.damage) === Number(selected.damage)
  )) ?? matchingOptions[0];
  state.mine.selectedAmmoDamage = selectedDamageVariant?.damage ?? null;
  state.mine.selectedAmmoAnnealed = selectedDamageVariant?.annealed === true;
  rememberSelectedAmmoForGun(selectedGunType);
  Array.from(elements.ammoMaterialSelect.querySelectorAll("select")).forEach((select) => {
    const value = select.dataset.category === "casingMaterial"
      ? (selected.casingMaterial ?? NONE_CASING_VALUE)
      : select.dataset.category === "jacketMaterial"
        ? (selected.jacketMaterial ?? NONE_JACKET_VALUE)
        : select.dataset.category === "coreMaterial" ? state.mine.selectedAmmoCoreMaterial
          : selectedDamageVariant ? damageVariantKey(selectedDamageVariant) : "";
    if (value != null && [...select.options].some((option) => option.value === String(value))) {
      select.value = String(value);
    }
    select.disabled = getRealityShield()?.active === true;
  });

  // Keep the selector controls stable while counts change. Firing a round
  // updates these labels in place instead of replacing the open dropdown.
  const currentSelection = getSelectedAmmoComposition();
  const damageSelect = elements.ammoMaterialSelect.querySelector('select[data-category="damage"]');
  Array.from(damageSelect?.options ?? []).forEach((option) => {
    const [damageText, annealedText] = String(option.value).split("|");
    const damage = Number(damageText);
    const annealed = annealedText === "annealed";
    const exactCount = state.ammoStacks
      .filter((stack) => (stack.type ?? "rapidfire") === selectedGunType
        && getAmmoComposition(stack).casingMaterial === currentSelection.casingMaterial
        && getAmmoComposition(stack).jacketMaterial === currentSelection.jacketMaterial
        && getAmmoComposition(stack).coreMaterial === currentSelection.coreMaterial
        && Number(stack.damage) === damage
        && (stack.annealed === true) === annealed)
      .reduce((total, stack) => total + stack.count, 0);
    option.textContent = `${formatNumber(damage)} damage · ${formatNumber(exactCount)} left`;
  });

  const selectedMaterial = getSelectedAmmoMaterial();
  const selectedAnnealed = getSelectedAmmoAnnealed();
  const isLiquidMetalOnly = LIQUID_METAL_AMMO_MATERIALS.includes(selectedMaterial);
  const available = isLiquidMetalOnly ? state.moltenCopper.length : 0;
  const shaper = getMachine("ammoShaper");
  const shaperInputConveyor = shaper ? getInternalConveyor(shaper, 0) : null;
  const planter = getMachine("planter");
  const planterInputConveyor = planter ? getInternalConveyor(planter, 0) : null;
  const shaperInputOpen = Boolean(shaperInputConveyor && !getConveyorItem(shaperInputConveyor));
  const planterInputOpen = Boolean(planterInputConveyor && !getConveyorItem(planterInputConveyor));
  if (elements.feedAmmoButton) {
    elements.feedAmmoButton.disabled = selectedMaterial === "leek"
      || isLiquidMetalOnly
      || available < 1
      || state.drill.active
      || state.drill.completed
      || !shaperInputOpen;
  }
  const selectedStack = getSelectedAmmoStack();
  const selectedDamage = selectedStack?.damage ?? selectedDamageVariant?.damage ?? 1;
  elements.ammoMakerStatus.textContent = selectedGunType === "buckshot" && selectorOptions.length === 0
    ? "No Buckshot rounds available. Build jacketed ammo and feed it with a Bronze, Brass, or Steel ingot."
    : selectedMaterial === "leek"
    ? "Leek rounds selected · 1 damage each."
    : selectedAnnealed
      ? `Annealed ${getAmmoCoreLabel(selectedMaterial)} cores selected · ${formatNumber(selectedDamage)} damage each.`
    : isLiquidMetalOnly
      ? `${getAmmoCoreLabel(selectedMaterial)} cores selected · ${formatNumber(selectedDamage)} damage each. Liquid metal reinforces leek cores automatically.`
    : !shaperInputOpen
      ? "The Bullet Core Caster's input conveyor is occupied."
      : `${formatNumber(available)} ${MATERIAL_LABELS[selectedMaterial]} input available.`;

  const ammoStacksSignature = state.ammoStacks.map((stack) => (
    `${stack.type}:${stack.damage}:${stack.material}:${stack.count}:${stack.annealed === true}`
  )).join("|");
  if (ammoStacksSignature === lastAmmoStacksSignature) {
    return;
  }
  lastAmmoStacksSignature = ammoStacksSignature;

  const fragment = document.createDocumentFragment();
  if (state.ammoStacks.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-stack";
    empty.textContent = "No ammo produced yet.";
    fragment.append(empty);
  } else {
    const ammoGroups = groupAmmoStacks(state.ammoStacks);
    const hasCasingGroups = ammoGroups.some((group) => group.casingMaterial);
    const hasJacketGroups = ammoGroups.some((group) => group.jacketMaterial);
    const addGroupHeading = (text, className = "") => {
      const heading = document.createElement("div");
      heading.className = `ammo-stack-group-heading${className ? ` ${className}` : ""}`;
      heading.textContent = text;
      return heading;
    };
    const addMaterialGroup = (material, title, level) => {
      if (!material) {
        return;
      }
      fragment.append(addGroupHeading(
        `${title}: ${title === "Core" ? getAmmoCoreLabel(material) : MATERIAL_LABELS[material] ?? material}`,
        `is-${level}`,
      ));
    };

    ammoGroups.forEach((group) => {
      if (hasCasingGroups) {
        addMaterialGroup(group.casingMaterial, "Casing", "casing");
      }
      if (hasJacketGroups) {
        addMaterialGroup(group.jacketMaterial, "Jacket", "jacket");
      }
      addMaterialGroup(group.coreMaterial, "Core", "core");

      group.stacks.forEach((stack) => {
        const row = document.createElement("div");
        row.className = "ammo-stack";
      const label = document.createElement("span");
      const ammoLabel = stack.coreMaterial
          ? `${getAmmoCoreLabel(stack.coreMaterial)} core`
          : stack.material === "copper"
            ? "Malachite bullet cores"
            : `${MATERIAL_LABELS[stack.material]} rounds`;
        label.textContent = `${ammoLabel}${stack.annealed ? " · annealed" : ""} · ${stack.type} · ${formatNumber(stack.damage)} damage`;
        const count = document.createElement("strong");
        count.textContent = formatNumber(stack.count);
        row.append(label, count);
        fragment.append(row);
      });
    });
  }
  elements.ammoStacks.replaceChildren(fragment);
}

function getMineGridSignature() {
  const shield = getRealityShield();
  return `${getCurrentTunnel()}|${state.mine.currentLayer}|${state.mine.isRemine}|${state.selectedDepositId ?? "none"}|${state.deposits.map((deposit) => (
    `${deposit.id}:${deposit.segmentsRemaining}:${deposit.currentSegmentHitPoints}`
  )).join(",")}|shield:${shield?.active}:${shield?.waveNumber}:${shield?.ores?.map((ore) => ore.id).join(",")}`;
}

function renderMineGrid() {
  const shield = getRealityShield();
  const signature = getMineGridSignature();
  if (signature === lastMineGridSignature) {
    return;
  }
  lastMineGridSignature = signature;
  const hostRock = getHostRockMaterial();
  elements.mineGrid.classList.toggle("is-granite-host", hostRock === "granite");
  elements.mineGrid.classList.toggle("is-kimberlite-host", hostRock === "kimberlite");
  elements.mineGrid.classList.toggle("is-hematite-host", hostRock === "hematite");
  elements.mineGrid.classList.toggle("is-chert-host", hostRock === "chert");

  const depositsByCell = shield?.active
    ? new Map()
    : new Map(state.deposits.map((deposit) => [deposit.cell, deposit]));
  if (shield?.active) {
    shield.ores.forEach((ore) => depositsByCell.set(ore.cell, ore));
  }
  const fragment = document.createDocumentFragment();

  const gridColumns = shield?.active ? CONFIG.realityShieldColumns : CONFIG.columns;
  const gridRows = shield?.active ? CONFIG.realityShieldRows : CONFIG.rows;
  elements.mineGrid.classList.toggle("is-reality-shield-grid", shield?.active === true);

  for (let cell = 0; cell < gridRows * gridColumns; cell += 1) {
    const deposit = depositsByCell.get(cell);
    const cellButton = document.createElement(deposit ? "button" : "div");
    cellButton.className = "mine-cell";

    if (!deposit) {
    cellButton.setAttribute("aria-label", `${STOCKPILE_LABELS[getHostRockMaterial()]} host rock`);
    } else {
      renderDepositCell(cellButton, deposit);
    }

    fragment.append(cellButton);
  }

  elements.mineGrid.replaceChildren(fragment);
}

function renderMineInformationOverlay() {
  elements.mineInformationOverlay.hidden = !state.mineHudUnlocked;
  if (!state.mineHudUnlocked) {
    return;
  }

  const tunnel = getCurrentTunnel();
  const stats = getLayerStats(state.mine.currentLayer, tunnel);
  setTextContentIfChanged(elements.mineLayerLabel, state.mine.isRemine
    ? `TUNNEL ${tunnel} · BAND ${stats.band} · LAYER 1 RE-MINE`
    : `TUNNEL ${tunnel} · BAND ${stats.band} · LAYER ${stats.layerInBand}`);
  setTextContentIfChanged(elements.mineLayerHost, `${STOCKPILE_LABELS[getHostRockMaterial(tunnel)]} host rock`);
  setTextContentIfChanged(elements.hostRockLegend, `${STOCKPILE_LABELS[getHostRockMaterial(tunnel)]} host`);
  renderMineProgress(tunnel);
  setTextContentIfChanged(elements.mineLayerHealth, `${formatNumber(state.drill.hitPointsRemaining)} / ${formatNumber(state.drill.hitPointsTotal)} HP`);
  setTextContentIfChanged(elements.mineDrillDps, `${getDrillDps()} DPS`);
  if (elements.mineDrillUpgradeButton) {
    const nextUpgrade = getNextDrillUpgrade();
    const installed = !nextUpgrade;
    const canAfford = !installed && canAffordDrillUpgrade(nextUpgrade.id);
    const cashShortfall = installed ? 0 : Math.max(0, nextUpgrade.cash - state.cash);
    const fragmentShortfall = installed
      ? 0
      : Math.max(0, (nextUpgrade.requiredDiamondFragments ?? 0) - (state.diamondFragments ?? 0));
    elements.mineDrillUpgradeButton.disabled = installed || !canAfford;
    elements.mineDrillUpgradeButton.classList.toggle(
      "is-unaffordable",
      !installed && !canAfford,
    );
    const fragmentCost = nextUpgrade?.requiredDiamondFragments
      ? ` · ${nextUpgrade.requiredDiamondFragments} Diamond Fragments`
      : "";
    setTextContentIfChanged(elements.mineDrillUpgradeButton, installed
      ? "All current upgrades installed"
      : canAfford
        ? `${nextUpgrade.label} · ${formatCash(nextUpgrade.cash, 3, 4)}${fragmentCost}`
        : [
          cashShortfall > 0 ? `Need ${formatCash(cashShortfall)} cash` : "",
          fragmentShortfall > 0 ? `Need ${formatNumber(fragmentShortfall)} Diamond Fragments` : "",
        ].filter(Boolean).join(" · "));
    const upgradeTitle = installed
      ? "No further drill upgrades are currently available."
      : `${nextUpgrade.description} Raises drill power to ${nextUpgrade.dps} DPS.`
        + (nextUpgrade.requiredDiamondFragments
          ? ` Requires ${nextUpgrade.requiredDiamondFragments} Diamond Fragments.`
          : "")
        + (!canAfford
          ? ` Currently short ${cashShortfall > 0 ? `${formatCash(cashShortfall)} cash` : ""}`
            + (cashShortfall > 0 && fragmentShortfall > 0 ? " and " : "")
            + (fragmentShortfall > 0 ? `${formatNumber(fragmentShortfall)} Diamond Fragments` : "")
            + "."
          : "");
    if (elements.mineDrillUpgradeButton.title !== upgradeTitle) {
      elements.mineDrillUpgradeButton.title = upgradeTitle;
    }
  }

  const spawnedTypes = new Set(
    getSpawnPoolForBand(stats.band, tunnel).map(({ type }) => type),
  );
  const oreCounts = Object.entries(RESOURCE_DEFINITIONS)
    .filter(([type]) => spawnedTypes.has(type))
    .map(([type, definition]) => ({
      type,
      definition,
      depositsRemaining: state.deposits.filter(
        (deposit) => deposit.type === type && deposit.segmentsRemaining > 0,
      ).length,
      yieldAtBand: definition.yield
        * getDepositYieldMultiplier(type, stats.band, tunnel)
        * getMaterialYieldMultiplier(),
    }));
  const oreSummarySignature = oreCounts
    .map(({ type, depositsRemaining, yieldAtBand }) => `${type}:${depositsRemaining}:${yieldAtBand}`)
    .join(",");
  if (oreSummarySignature !== lastMineOreSummarySignature) {
    lastMineOreSummarySignature = oreSummarySignature;
    const fragment = document.createDocumentFragment();
    oreCounts.forEach(({ definition, depositsRemaining, yieldAtBand }) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = definition.label;
    value.textContent = `${formatNumber(depositsRemaining)} ${depositsRemaining === 1 ? "deposit" : "deposits"} · ${formatNumber(yieldAtBand)} each`;
    row.append(term, value);
    fragment.append(row);
    });
    elements.mineOresRemaining.replaceChildren(fragment);
  }
  renderMineLayerActions();
}

const MINE_PROGRESS_MILESTONES = Object.freeze([
  { tunnel: 1, band: 1, label: "Clear Tunnel 1 Band 1" },
  { tunnel: 2, band: 5, label: "Clear Tunnel 2 Band 5 · Unlock Auto Re-mine and Auto-continue" },
  { tunnel: 1, band: 4, label: "Clear Tunnel 1 Band 4 · Lead appears in Band 5" },
  { tunnel: 1, band: 9, label: "Clear Tunnel 1 Band 9 · Silver appears in Band 10" },
  { tunnel: 1, band: 20, label: "Clear Tunnel 1 Band 20 · ???" },
]);

function renderMineProgress(tunnel) {
  const layerLimit = getTunnelLayerLimit(tunnel);
  const completedLayers = getCompletedLayersForTunnel(tunnel);
  const completedBands = getCompletedBandsForTunnel(tunnel);
  const milestones = MINE_PROGRESS_MILESTONES.filter((milestone) => milestone.tunnel === tunnel);
  const nextMilestone = milestones.find((milestone) => milestone.band > completedBands);
  const goalLayer = nextMilestone
    ? Math.min(layerLimit, nextMilestone.band * CONFIG.layersPerBand)
    : layerLimit;
  const drillProgress = state.mine.isRemine
    ? 0
    : Math.max(0, 1 - state.drill.hitPointsRemaining / state.drill.hitPointsTotal);
  const progressedLayers = state.mine.isRemine
    ? completedLayers
    : Math.max(completedLayers, state.mine.currentLayer - 1 + drillProgress);
  const progressWidth = `${Math.min(100, (progressedLayers / goalLayer) * 100)}%`;
  if (elements.mineProgressFill.style.width !== progressWidth) {
    elements.mineProgressFill.style.width = progressWidth;
  }
  setTextContentIfChanged(elements.mineProgressLabel, nextMilestone
    ? `Progress to ${nextMilestone.label}`
    : `Band ${getBandForLayer(state.mine.currentLayer)} · Layer ${getLayerNumberInBand(state.mine.currentLayer)}`);

  const markerSignature = `${tunnel}|${goalLayer}|${completedBands}|${milestones.length}`;
  if (markerSignature !== lastMineProgressMarkersSignature) {
    lastMineProgressMarkersSignature = markerSignature;
    const fragment = document.createDocumentFragment();
    milestones.forEach((milestone) => {
      const marker = document.createElement("span");
      const markerLayer = milestone.band * CONFIG.layersPerBand;
      const reached = completedBands >= milestone.band;
      marker.className = `mine-progress-marker${reached ? " is-reached" : ""}`;
      marker.style.left = `${Math.min(100, (markerLayer / goalLayer) * 100)}%`;
      marker.title = reached ? `${milestone.label} · Reached` : milestone.label;
      marker.setAttribute("aria-label", marker.title);
      fragment.append(marker);
    });
    elements.mineProgressMarkers.replaceChildren(fragment);
  }
}

function renderMineLayerActions() {
  const tunnel = getCurrentTunnel();
  const shield = getRealityShield();
  const actionSignature = [
    state.mine.currentLayer,
    state.mine.isRemine,
    tunnel,
    getCompletedBandsForTunnel(tunnel),
    getCompletedLayersForTunnel(tunnel),
    state.mine.unlockedTunnels.join(","),
    state.mine.miningRightsPurchased,
    state.mine.tunnelThreeRightsPurchased,
    state.cash,
    state.mine.autoDrillUnlocked,
    state.mine.autoProgressionUnlocked,
    state.mine.autoRemineUnlocked,
    state.mine.autoDrillMode,
    state.mine.autoContinueEnabled,
    state.mine.autoRemineEnabled,
    state.mine.selectedRemineBand,
    state.mine.rapidfireGunMk1Unlocked,
    state.mine.rapidfireGunMk1Purchased,
    state.mine.buckshotGunUnlocked,
    state.mine.buckshotGunPurchased,
    state.mine.gunSchedulingUnlocked,
    state.mine.gunScheduleEnabledByTunnel?.[tunnel],
    JSON.stringify(getGunScheduleForTunnel(tunnel)),
    JSON.stringify(getGunScheduleRuntime(tunnel)),
    getSelectedGun(),
    state.drill.active,
    state.drill.completed,
    shield.active,
    shield.completed,
    shield.ores.length,
  ].join("|");
  if (actionSignature === lastMineLayerActionSignature) {
    return;
  }
  lastMineLayerActionSignature = actionSignature;

  const fragment = document.createDocumentFragment();
  const stats = getLayerStats(state.mine.currentLayer, tunnel);

  if (shield.active) {
    const challengeNote = document.createElement("p");
    challengeNote.className = "mine-layer-action-note";
    challengeNote.textContent = shield.ores.length > 0
      ? "Click every red shield crosshair to clear the interruption."
      : "The Reality Shield is exposed. Drilling resumes until the next interruption wave.";
    fragment.append(challengeNote);
    elements.mineLayerActions.replaceChildren(fragment);
    return;
  }

  if (tunnel === 1 && getCompletedBandsForTunnel(1) >= 1 && !state.mine.miningRightsPurchased) {
    const rightsButton = document.createElement("button");
    rightsButton.type = "button";
    rightsButton.className = "button button-warning mine-layer-action";
    rightsButton.textContent = canBuyMiningRights()
      ? "Buy Mining Rights · $100"
      : "Mining Rights · $100 needed";
    rightsButton.disabled = !canBuyMiningRights();
    bindImmediateAction(rightsButton, buyMiningRights);
    fragment.append(rightsButton);
  }

  if (tunnel === 2 && !state.mine.tunnelThreeRightsPurchased) {
    const rightsButton = document.createElement("button");
    rightsButton.type = "button";
    rightsButton.className = "button button-warning mine-layer-action";
    rightsButton.textContent = canBuyTunnelThreeRights()
      ? "Buy Tunnel 3 Rights · $800,000"
      : "Tunnel 3 Rights · $800,000 needed";
    rightsButton.disabled = !canBuyTunnelThreeRights();
    bindImmediateAction(rightsButton, buyTunnelThreeRights);
    fragment.append(rightsButton);
  }

  if (state.mine.buckshotGunUnlocked) {
    if (!state.mine.rapidfireGunMk1Purchased) {
      const gunButton = document.createElement("button");
      gunButton.type = "button";
      gunButton.className = "button button-warning mine-layer-action";
      gunButton.textContent = canBuyRapidfireGunMk1()
        ? "Buy Rapidfire Gun Mk. 1 · $250k"
        : "Rapidfire Gun Mk. 1 · $250k needed";
      gunButton.disabled = !canBuyRapidfireGunMk1();
      bindImmediateAction(gunButton, buyRapidfireGunMk1);
      fragment.append(gunButton);
    } else if (!state.mine.buckshotGunPurchased) {
      const gunButton = document.createElement("button");
      gunButton.type = "button";
      gunButton.className = "button button-warning mine-layer-action";
      gunButton.textContent = canBuyBuckshotGun()
        ? "Buy Buckshot Gun · $500k"
        : "Buckshot Gun · $500k needed";
      gunButton.disabled = !canBuyBuckshotGun();
      bindImmediateAction(gunButton, buyBuckshotGun);
      fragment.append(gunButton);
    } else {
      const gunControls = document.createElement("div");
      gunControls.className = "mine-gun-controls";
      const scheduleActive = isGunScheduleActive(tunnel);
      ["rapidfire", "buckshot"].forEach((gunId) => {
        const gunButton = document.createElement("button");
        gunButton.type = "button";
        gunButton.className = "button button-secondary mine-layer-action";
        gunButton.textContent = gunId === getSelectedGun()
          ? `${getGunDisplayName(gunId)} · ${scheduleActive ? "Scheduled" : "Selected"}`
          : `Use ${getGunDisplayName(gunId)}`;
        gunButton.disabled = scheduleActive || gunId === getSelectedGun();
        bindImmediateAction(gunButton, () => selectGun(gunId));
        gunControls.append(gunButton);
      });
      fragment.append(gunControls);
    }
  }

  renderGunScheduleControls(fragment, tunnel);

  state.mine.unlockedTunnels.forEach((unlockedTunnel) => {
    if (unlockedTunnel === tunnel) {
      return;
    }
    const tunnelButton = document.createElement("button");
    tunnelButton.type = "button";
    tunnelButton.className = "button button-secondary mine-layer-action";
    tunnelButton.textContent = `Enter Tunnel ${unlockedTunnel}`;
    bindImmediateAction(tunnelButton, () => switchTunnel(unlockedTunnel));
    fragment.append(tunnelButton);
  });

  if (state.mine.autoDrillUnlocked) {
    const autoDrillButton = document.createElement("button");
    autoDrillButton.type = "button";
    autoDrillButton.className = "button button-secondary mine-layer-action";
    autoDrillButton.textContent = `Automatic drilling: ${AUTO_DRILL_MODE_LABELS[state.mine.autoDrillMode] ?? "Off"}`;
    autoDrillButton.title = "Click to cycle: Off → After ores → Ignore Ores.";
    bindImmediateAction(autoDrillButton, toggleAutoDrill);
    fragment.append(autoDrillButton);
  }

  if (state.mine.autoProgressionUnlocked) {
    const autoContinueButton = document.createElement("button");
    autoContinueButton.type = "button";
    autoContinueButton.className = "button button-secondary mine-layer-action";
    autoContinueButton.textContent = state.mine.autoContinueEnabled
      ? "Automatic continuation: On"
      : "Automatic continuation: Off";
    bindImmediateAction(autoContinueButton, toggleAutoContinue);
    fragment.append(autoContinueButton);
  }

  if (state.mine.autoRemineUnlocked) {
    const autoRemineButton = document.createElement("button");
    autoRemineButton.type = "button";
    autoRemineButton.className = "button button-secondary mine-layer-action";
    autoRemineButton.textContent = state.mine.autoRemineEnabled
      ? "Automatic re-mining: On"
      : "Automatic re-mining: Off";
    bindImmediateAction(autoRemineButton, toggleAutoRemine);
    fragment.append(autoRemineButton);
  }

  if (!state.drill.active && !state.drill.completed) {
    const drillButton = document.createElement("button");
    drillButton.type = "button";
    drillButton.className = "button button-warning mine-layer-action";
    drillButton.textContent = "Drill this layer";
    bindImmediateAction(drillButton, () => startDrilling());
    fragment.append(drillButton);
  } else if (state.drill.completed) {
    const nextRegularLayer = state.mine.isRemine
      ? getCompletedLayersForTunnel(tunnel) + 1
      : state.mine.currentLayer + 1;
    if (nextRegularLayer <= getTunnelLayerLimit(tunnel)) {
      const nextLayerButton = document.createElement("button");
      nextLayerButton.type = "button";
      nextLayerButton.className = "button mine-layer-action";
      const nextLayerStats = getLayerStats(nextRegularLayer, tunnel);
      nextLayerButton.textContent = nextLayerStats.band !== stats.band
        ? `Continue to Band ${nextLayerStats.band}`
        : `Continue to Layer ${nextLayerStats.layerInBand}`;
      bindImmediateAction(nextLayerButton, advanceToNextLayer);
      fragment.append(nextLayerButton);
    } else if (!state.mine.isRemine) {
      const completeNote = document.createElement("p");
      completeNote.className = "mine-layer-action-note";
      completeNote.textContent = "Tunnel 1’s initial four Bands are cleared. Re-mine any completed Band while deeper pools are prepared.";
      fragment.append(completeNote);
    }

    const completedBands = getCompletedBandsForTunnel(tunnel);
    if (completedBands > 0) {
      const remineControls = document.createElement("div");
      remineControls.className = "mine-remine-controls";
      const remineLabel = document.createElement("label");
      remineLabel.textContent = "Re-mine";
      const remineSelect = document.createElement("select");
      remineSelect.className = "mine-remine-select";
      for (let band = 1; band <= completedBands; band += 1) {
        const option = document.createElement("option");
        option.value = String(band);
        option.textContent = `Band ${band}`;
        option.selected = band === state.mine.selectedRemineBand;
        remineSelect.append(option);
      }
      remineSelect.addEventListener("change", () => {
        state.mine.selectedRemineBand = Number(remineSelect.value);
        renderMineLayerActions();
      });
      const remineButton = document.createElement("button");
      remineButton.type = "button";
      remineButton.className = "button button-secondary";
      remineButton.textContent = "Layer 1";
      bindImmediateAction(remineButton, () => remineBandFirstLayer(Number(remineSelect.value)));
      remineLabel.append(remineSelect);
      remineControls.append(remineLabel, remineButton);
      fragment.append(remineControls);
    }
  } else if (getCompletedLayersForTunnel(tunnel) > 0 || stats.band > 1) {
    const progressNote = document.createElement("p");
    progressNote.className = "mine-layer-action-note";
    progressNote.textContent = `Band ${stats.band} has ${CONFIG.layersPerBand - stats.layerInBand + 1} layer(s) remaining before its first layer can be re-mined.`;
    fragment.append(progressNote);
  }

  elements.mineLayerActions.replaceChildren(fragment);
}

function renderDepositCell(cellButton, deposit) {
  const definition = RESOURCE_DEFINITIONS[deposit.type];
  cellButton.dataset.depositId = deposit.id;
  const isRealityShieldCrosshair = deposit.type === REALITY_SHIELD_CROSSHAIR_TYPE;
  if (isRealityShieldCrosshair) {
    const isDefeated = Boolean(deposit.defeatedAt);
    cellButton.type = "button";
    cellButton.classList.add("deposit", `deposit-${deposit.type}`);
    if (isDefeated) {
      cellButton.classList.add("shield-crosshair-defeated");
      cellButton.disabled = true;
    }
    cellButton.setAttribute(
      "aria-label",
      isDefeated ? "Reality shield crosshair destroyed" : "Reality shield crosshair",
    );
    cellButton.title = isDefeated ? "Destroyed" : "Click to destroy";
    bindImmediateAction(cellButton, () => selectDeposit(deposit.id));

    const core = document.createElement("span");
    core.className = "deposit-core";
    core.style.setProperty("--crosshair-rotation", `${deposit.rotation ?? 0}deg`);
    core.style.setProperty("--crosshair-death-rotation", `${deposit.deathRotation ?? 1080}deg`);
    cellButton.append(core);
    return;
  }
  const isDepleted = deposit.segmentsRemaining <= 0;
  const isSelected = state.selectedDepositId === deposit.id;

  cellButton.type = "button";
  cellButton.classList.add("deposit", `deposit-${deposit.type}`);
  if (isDepleted) {
    cellButton.classList.add("depleted");
    cellButton.disabled = true;
  }
  if (isSelected) {
    cellButton.classList.add("selected-deposit");
  }

  cellButton.setAttribute(
    "aria-label",
    isDepleted
      ? `${definition.label}, depleted`
      : `${definition.label}, ${deposit.segmentsRemaining} of ${deposit.segmentsTotal} segments remaining; current segment has ${deposit.currentSegmentHitPoints} of ${deposit.hitPointsPerSegment} hit points`,
  );
  cellButton.title = isDepleted
    ? `${definition.label}: depleted`
    : `${deposit.segmentsRemaining}/${deposit.segmentsTotal} segments · ${deposit.currentSegmentHitPoints}/${deposit.hitPointsPerSegment} HP`;
  bindImmediateAction(cellButton, () => selectDeposit(deposit.id));

  const label = document.createElement("span");
  label.className = "deposit-label";
  label.textContent = definition.shortLabel;

  const core = document.createElement("span");
  core.className = "deposit-core";

  const meter = document.createElement("span");
  meter.className = "segment-meter";
  for (let segment = 0; segment < deposit.segmentsTotal; segment += 1) {
    const pip = document.createElement("span");
    pip.className = `segment${segment < deposit.segmentsRemaining ? " filled" : ""}`;
    meter.append(pip);
  }

  const hitPointTrack = document.createElement("span");
  hitPointTrack.className = "deposit-hp";
  hitPointTrack.setAttribute("aria-hidden", "true");
  const hitPointFill = document.createElement("span");
  hitPointFill.className = "deposit-hp-fill";
  hitPointFill.style.width = isDepleted
    ? "0%"
    : `${(deposit.currentSegmentHitPoints / deposit.hitPointsPerSegment) * 100}%`;
  hitPointTrack.append(hitPointFill);

  cellButton.append(label, core, meter, hitPointTrack);
}

function renderStockpile() {
  const signature = Object.keys(STOCKPILE_LABELS).map((key) => state.stockpile[key]).join(",");
  if (signature === lastStockpileSignature) {
    return;
  }
  lastStockpileSignature = signature;

  const fragment = document.createDocumentFragment();
  Object.entries(STOCKPILE_LABELS).forEach(([key, label]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const definition = document.createElement("dd");
    definition.textContent = formatNumber(state.stockpile[key]);
    fragment.append(term, definition);
  });
  elements.stockpile.replaceChildren(fragment);
}

function renderRealityShield() {
  const shield = getRealityShield();
  if (!elements.realityShieldButton || !elements.realityShieldStatus) {
    return;
  }

  document.body?.classList.toggle("reality-shield-active", shield.active);
  if (elements.realityShieldHud) {
    elements.realityShieldHud.hidden = !shield.active;
  }
  if (shield.active && elements.realityShieldHudHealth) {
    setTextContentIfChanged(elements.realityShieldHudHealth, `${formatNumber(shield.hitPointsRemaining)} / ${formatNumber(shield.hitPointsTotal)} HP`);
    setTextContentIfChanged(elements.realityShieldHudStatus, shield.ores.length > 0
      ? `${shield.ores.length} shield crosshairs blocking the drill · next wave in ${formatNumber(Math.max(0, shield.refreshTimer))}s`
      : `Drilling at ${formatNumber(getRealityShieldDps())} DPS · next wave in ${formatNumber(Math.max(0, shield.refreshTimer))}s`);
    setTextContentIfChanged(elements.realityShieldHudAmmo, "1-damage Leek rounds: unlimited");
    const shieldWidth = `${Math.max(0, Math.min(100, (shield.hitPointsRemaining / shield.hitPointsTotal) * 100))}%`;
    if (elements.realityShieldHealthFill.style.width !== shieldWidth) {
      elements.realityShieldHealthFill.style.width = shieldWidth;
    }
  }

  const available = hasDiamondTippedDrill();
  elements.realityShieldButton.hidden = !available;
  elements.realityShieldButton.disabled = !canStartRealityShield();
  setTextContentIfChanged(elements.realityShieldButton, shield.active
      ? "Reality Shield Challenge Active"
      : shield.completed
        ? "Reality Shield Broken"
        : "Challenge the Reality Shield");

  elements.realityShieldStatus.hidden = !available && !shield.active;
  if (!available && !shield.active) {
    return;
  }
  if (shield.active) {
    const waveStatus = shield.ores.length > 0
      ? `${shield.ores.length} shield crosshairs require clicks · next wave in ${formatNumber(Math.max(0, shield.refreshTimer))}s`
      : `next interruption in ${formatNumber(Math.max(0, shield.refreshTimer))}s`;
    setTextContentIfChanged(elements.realityShieldStatus, `${formatNumber(shield.hitPointsRemaining)} / ${formatNumber(shield.hitPointsTotal)} HP · ${waveStatus}`);
  } else if (shield.completed) {
    setTextContentIfChanged(elements.realityShieldStatus, "The shield is broken. The way beyond reality is open.");
  } else {
    setTextContentIfChanged(elements.realityShieldStatus, "1.00b HP · 30-second interruption waves · three Diamond Fragments required for the drill.");
  }
}

function renderDrill() {
  const shield = getRealityShield();
  if (shield?.active) {
    const percentage = Math.round(
      (1 - shield.hitPointsRemaining / shield.hitPointsTotal) * 100,
    );
    const progressWidth = `${percentage}%`;
    if (elements.drillProgressFill.style.width !== progressWidth) {
      elements.drillProgressFill.style.width = progressWidth;
    }
    setTextContentIfChanged(elements.drillProgressLabel, `${formatNumber(shield.hitPointsRemaining)} / ${formatNumber(shield.hitPointsTotal)} HP · Reality Shield`);
    setTextContentIfChanged(elements.drillDescription, shield.ores.length > 0
      ? "Drilling is paused until every shield crosshair is clicked."
      : `${getRealityShieldDps()} DPS. The shield is exposed until its next interruption wave.`);
    elements.drillButton.disabled = true;
    setTextContentIfChanged(elements.drillButton, "Reality Shield active");
    return;
  }

  const percentage = Math.round(
    (1 - state.drill.hitPointsRemaining / state.drill.hitPointsTotal) * 100,
  );
  const progressWidth = `${percentage}%`;
  if (elements.drillProgressFill.style.width !== progressWidth) {
    elements.drillProgressFill.style.width = progressWidth;
  }

  if (state.drill.completed) {
    setTextContentIfChanged(elements.drillProgressLabel, "Face cleared — choose the next layer or a completed Band re-mine.");
    setTextContentIfChanged(elements.drillDescription, "A completed Band can repeatedly yield half of the ore chunks from its first layer.");
    elements.drillButton.disabled = true;
    setTextContentIfChanged(elements.drillButton, "Face cleared");
  } else if (state.drill.active) {
    setTextContentIfChanged(elements.drillProgressLabel, `${formatNumber(state.drill.hitPointsRemaining)} / ${formatNumber(state.drill.hitPointsTotal)} HP — drilling ${STOCKPILE_LABELS[getHostRockMaterial()]}.`);
    setTextContentIfChanged(elements.drillDescription, `${getDrillDps()} DPS. Drilling is irreversible; remaining ore will be lost at completion.`);
    elements.drillButton.disabled = true;
    setTextContentIfChanged(elements.drillButton, "Drilling…");
  } else {
    const activeCount = getActiveDeposits().length;
    setTextContentIfChanged(elements.drillProgressLabel, activeCount > 0
      ? `${formatNumber(state.drill.hitPointsRemaining)} / ${formatNumber(state.drill.hitPointsTotal)} HP · ${activeCount} ore deposit(s) remain.`
      : `${formatNumber(state.drill.hitPointsRemaining)} / ${formatNumber(state.drill.hitPointsTotal)} HP · every mapped ore deposit was recovered.`);
    setTextContentIfChanged(elements.drillDescription, `Layer drill: ${getDrillDps()} DPS. Any ore left when the drill completes is lost.`);
    elements.drillButton.disabled = false;
    setTextContentIfChanged(elements.drillButton, "Start drilling");
  }
}

function renderLog() {
  const signature = state.logs.map((entry) => (
    typeof entry === "string" ? entry : `${entry.timestamp}:${entry.message}`
  )).join("|");
  if (signature === lastLogSignature) {
    return;
  }
  lastLogSignature = signature;

  const fragment = document.createDocumentFragment();
  state.logs.forEach((entry) => {
    const item = document.createElement("li");
    if (typeof entry === "string") {
      item.textContent = entry;
    } else {
      const time = document.createElement("time");
      time.textContent = entry.timestamp;
      item.append(time, entry.message);
    }
    fragment.append(item);
  });
  elements.eventLog.replaceChildren(fragment);
}

const NUMBER_SUFFIXES = Object.freeze([
  "", "k", "M", "B", "T", "Qd", "Qn", "Sx", "Sp", "Oc", "No",
]);
const LAYERED_NUMBER_SUFFIXES = Object.freeze([
  "", "k", "U", "D", "T", "Qd", "Qn", "Sx", "Sp", "Oc", "No",
]);
const SECOND_NUMBER_SUFFIXES = Object.freeze([
  "", "Dc", "Vg", "Tg", "qg", "Qg", "sg", "Sg", "Og", "Ng",
]);
const THIRD_NUMBER_SUFFIXES = Object.freeze([
  "", "Cent", "Dcnt", "Tcnt", "qcnt", "Qcnt", "scnt", "Scnt", "Ocnt", "Ncnt",
]);
const NUMBER_SUFFIX_SIGNIFICANT_DIGITS = 3;
const NUMBER_SCIENTIFIC_EXPONENT = 303;
const wholeNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function getNumberSuffixForGroup(suffixGroup) {
  if (suffixGroup < 1 || suffixGroup > 1000) return "";
  if (suffixGroup <= 10) return NUMBER_SUFFIXES[suffixGroup];

  const primaryIndex = suffixGroup % 10;
  const primary = primaryIndex === 1
    ? ""
    : LAYERED_NUMBER_SUFFIXES[primaryIndex === 0 ? 10 : primaryIndex];
  const secondary = SECOND_NUMBER_SUFFIXES[Math.floor((suffixGroup - 1) / 10) % 10];
  const tertiary = THIRD_NUMBER_SUFFIXES[Math.floor((suffixGroup - 1) / 100) % 10];
  return `${primary}${secondary}${tertiary}`;
}

function getNumberParts(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue === 0) return { negative: false, mantissa: 0, exponent: 0 };
  const [mantissa, exponent] = Math.abs(numericValue).toExponential(15).split("e");
  return {
    negative: numericValue < 0,
    mantissa: Number(mantissa),
    exponent: Number(exponent),
  };
}

function formatPlainNumber(value, maximumFractionDigits, minimumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);
}

function formatNumber(
  value,
  maximumFractionDigits = 1,
  significantDigits = NUMBER_SUFFIX_SIGNIFICANT_DIGITS,
) {
  const parts = getNumberParts(value);
  if (!parts) return typeof value === "number" && !Number.isFinite(value) ? "∞" : String(value);
  if (parts.mantissa === 0) return "0";

  const sign = parts.negative ? "−" : "";
  if (parts.exponent < 3) {
    return `${sign}${formatPlainNumber(parts.mantissa * 10 ** parts.exponent, maximumFractionDigits)}`;
  }

  if (parts.exponent >= NUMBER_SCIENTIFIC_EXPONENT || !getNumberSuffixForGroup(Math.floor(parts.exponent / 3))) {
    let scientificMantissa = Math.round(parts.mantissa * 100) / 100;
    let scientificExponent = parts.exponent;
    if (scientificMantissa >= 10) {
      scientificMantissa /= 10;
      scientificExponent += 1;
    }
    return `${sign}${formatPlainNumber(scientificMantissa, 2, 2)}e${scientificExponent}`;
  }

  let suffixGroup = Math.floor(parts.exponent / 3);
  let scaledValue = parts.mantissa * 10 ** (parts.exponent - suffixGroup * 3);
  let fractionDigits = Math.max(
    0,
    significantDigits - 1 - Math.floor(Math.log10(scaledValue)),
  );
  const roundingScale = 10 ** fractionDigits;
  scaledValue = Math.round(scaledValue * roundingScale) / roundingScale;
  if (scaledValue >= 1000 && getNumberSuffixForGroup(suffixGroup + 1)) {
    suffixGroup += 1;
    scaledValue /= 1000;
    fractionDigits = significantDigits - 1;
  }

  return `${sign}${formatPlainNumber(
    scaledValue,
    fractionDigits,
    fractionDigits,
  )}${getNumberSuffixForGroup(suffixGroup)}`;
}

function formatCash(
  value,
  maximumFractionDigits = 2,
  significantDigits = NUMBER_SUFFIX_SIGNIFICANT_DIGITS,
) {
  return `$${formatNumber(value, maximumFractionDigits, significantDigits)}`;
}

function formatQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return formatNumber(quantity);
  }
  if (quantity === 0) {
    return "0";
  }

  const normalized = Number(quantity.toPrecision(12));
  if (Math.abs(normalized) >= 1e3) {
    return formatNumber(normalized);
  }
  return formatPlainNumber(normalized, 12);
}

function getSaveKeyForPath(pathname) {
  const pathSegments = String(pathname ?? "").split("/").filter(Boolean);
  return pathSegments.includes("beta")
    ? `${CONFIG.saveKey}-beta`
    : CONFIG.saveKey;
}

function getActiveSaveKey() {
  return getSaveKeyForPath(window.location?.pathname);
}

function setTextContentIfChanged(element, value) {
  if (!element) {
    return false;
  }
  const text = String(value);
  if (element.textContent === text) {
    return false;
  }
  element.textContent = text;
  return true;
}

function applyGameState(nextState, view = "mine") {
  simulationRevision += 1;
  clearConveyorItems();
  state = nextState;
  autoFireAccumulator = 0;
  planterAccumulator = 0;
  autosaveAccumulator = 0;
  lastMineGridSignature = null;
  lastMineOreSummarySignature = null;
  lastMineLayerActionSignature = null;
  lastMineProgressMarkersSignature = null;
  lastStockpileSignature = null;
  lastLogSignature = null;
  lastAmmoStacksSignature = null;
  lastFactoryControlsSignature = null;
  lastFactoryOverlaySignature = null;
  selectedBuildTool = null;
  selectedBuildOrientation = "right";
  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  selectedStorageOutputKey = null;
  hoveredFactoryTile = null;
  rebuildMachineScene();
  setActiveView(view);
  render();
}

function resetDemo() {
  applyGameState(createInitialState());
  saveGame();
}

function setSaveDataStatus(message) {
  elements.saveDataStatus.textContent = message;
}

function exportSaveData() {
  const encodedPayload = saveGame();
  if (!encodedPayload) {
    setSaveDataStatus("Export failed: browser storage is unavailable.");
    return;
  }

  elements.saveDataField.value = encodedPayload;
  elements.saveDataField.focus();
  elements.saveDataField.select();
  setSaveDataStatus("Save exported. Copy the selected Base64 text somewhere safe.");
  renderOptions();
}

function importSaveData() {
  const encodedPayload = elements.saveDataField.value.trim();
  if (!encodedPayload) {
    setSaveDataStatus("Paste a Base64 save before importing.");
    return;
  }

  try {
    const payload = decodeSavePayload(encodedPayload);
    if (payload?.version !== CONFIG.saveVersion) {
      throw new Error("unsupported save version");
    }
    const importedState = hydrateSavedState(payload.state);
    if (!importedState) {
      throw new Error("invalid game state");
    }
    if (!window.confirm("Import this save and replace your current local progress?")) {
      return;
    }

    applyGameState(importedState, "options");
    saveGame();
    elements.saveDataField.value = getEncodedSaveGame();
    setSaveDataStatus("Save imported successfully.");
    renderOptions();
  } catch {
    setSaveDataStatus("That save data is invalid or belongs to an incompatible version.");
  }
}

function hardResetGame() {
  if (!window.confirm("Hard reset all Hamster Miners progress? This cannot be undone.")) {
    return;
  }

  try {
    window.localStorage.removeItem(getActiveSaveKey());
  } catch {
    // Replacing state and saving the new game below is still the best fallback.
  }

  elements.saveDataField.value = "";
  setSaveDataStatus("");
  applyGameState(createInitialState());
  saveGame();
}

function startGameLoop() {
  let lastTime = performance.now();
  tickHandle = window.setInterval(() => {
    const now = performance.now();
    const deltaSeconds = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    update(deltaSeconds);
    autosaveAccumulator += deltaSeconds;
    if (autosaveAccumulator >= CONFIG.autosaveSeconds) {
      autosaveAccumulator = 0;
      saveGame();
    }
    render();
  }, 1e3 / CONFIG.simulationFramesPerSecond);
}

if (IS_NODE_TEST_ENVIRONMENT) {
  module.exports = {
    CONFIG,
    MINE_PROGRESS_MILESTONES,
    getSaveKeyForPath,
    getActiveSaveKey,
    FACTORY_COLUMNS,
    FACTORY_ROWS,
    FACTORY_STARTER_COLUMN_OFFSET,
    RESOURCE_DEFINITIONS,
    PLAYTEST_PANEL_CHEAT_CODE,
    isObtainableMaterial,
    LOW_MELTING_METAL_ORES,
    MACHINE_LAYOUT,
    MACHINE_PURCHASES,
    MACHINE_CATEGORY_ORDER,
    MACHINE_CATEGORY_LABELS,
    MACHINE_CATEGORY_BY_ID,
    getMachineCategory,
    getMachineCategories,
    machineBelongsToCategory,
    CRAFTING_RECIPES,
    ANNEALER_MULTIPLIER,
    PRIMITIVE_UPGRADER_VALUE_BONUS,
    PRIMITIVE_UPGRADER_MIN_BASE_VALUE,
    PRIMITIVE_UPGRADER_MAX_VALUE,
    GRANITE_PROCESSOR_MULTIPLIER,
    GRANITE_PROCESSOR_MIN_VALUE,
    GRANITE_PROCESSOR_MAX_VALUE,
    QUARTZ_WHEEL_CUTTER_MULTIPLIER,
    QUARTZ_WHEEL_CUTTER_YIELD,
    BRONZE_STAMP_VALUE_BONUS,
    BRONZE_STAMP_MIN_BASE_VALUE,
    BRONZE_STAMP_MIN_VALUE,
    BRONZE_STAMP_MAX_USES,
    BRONZE_PILLARS_MULTIPLIER,
    BRONZE_PILLARS_MAX_USES,
    BRONZE_PILLARS_MIN_BASE_VALUE,
    BRONZE_PILLARS_MAX_VALUE,
    MALACHITE_AMMO_DAMAGE,
    LEAD_AMMO_DAMAGE,
    BUCKSHOT_INPUT_ROUNDS,
    BUCKSHOT_OUTPUT_ROUNDS,
    BUCKSHOT_SEGMENTS_PER_SHOT,
    BUCKSHOT_MAX_HITS_PER_DEPOSIT,
    BUCKSHOT_FIRE_PER_SECOND,
    RAPIDFIRE_MK1_COST,
    BUCKSHOT_GUN_COST,
    CASING_MATERIALS,
    LIQUID_CASING_MATERIALS,
    CASING_MACHINE_MODES,
    BUCKSHOT_DAMAGE_MULTIPLIER,
    getBaseAmmoDamage,
    getCasingDamageMultiplier,
    getCasingMachineMode,
    createInitialState,
    hydrateSavedState,
    createDeposit,
    getBandForLayer,
    getLayerStats,
    getHostRockMaterial,
    getHostRockYield,
    getMaterialYieldMultiplier,
    getTunnelLayerFormation,
    canBuyTunnelThreeRights,
    getSpawnPoolForBand,
    getDepositYieldMultiplier,
    getProcessingSpeedMultiplier,
    getPlaytestSellValueMultiplier,
    formatNumber,
    formatCash,
    formatQuantity,
    setTextContentIfChanged,
    getSaleValue,
    getItemSaleValue,
    getFactoryMaterialVisualKind,
    getFactoryConveyors,
    getConveyorAt,
    getConveyorSpeed,
    getConveyorSecondsPerTile,
    placeMachine,
    getSelectableFactoryEntities,
    selectFactoryEntitiesInRectangle,
    beginGroupMove,
    completeGroupMove,
    rotateSelectedBuild,
    loadLayer,
    toggleAutoDrill,
    maybeStartAutomaticDrilling,
    AUTO_DRILL_MODES,
    pickUpSelectedFactoryEntities,
    pickUpSelectedFactoryEntity,
    getArcFurnaceRecipe,
    switchArcFurnaceMode,
    getFactoryMachineProgressState,
    getMachineUpgradeTile,
    getInternalConveyorTiles,
    getMachineOccupiedTiles,
    isTileInsideMachine,
    markItemForDuster,
    transformItemLeavingConveyor,
    getJacketFormerKilnLink,
    getCasingMachineSmelterLink,
    startJacketFormerCoating,
    startCasingMachineLiquid,
    getBusyCrew,
    getAvailableCrew,
    getHiredCrewCount,
    getCrewHireCost,
    canAffordCrewHire,
    hireCrew,
    isMachineBusy,
    canPickUpMachine,
    startKilnJobs,
    updateCrewOperatedMachines,
    applyDamageToDeposit,
    completeMolderJob,
    flushMolderOutputs,
    updateFactory,
    addAmmo,
    consumeAmmo,
    fireLeek,
    canAffordMachinePurchase,
    getValidShopPurchaseQuantity,
    getMachinePurchaseCost,
    purchaseMachine,
    getAmmoCountForMaterial,
    getAmmoSelectorOptions,
    getAmmoComposition,
    getAmmoCompositionKey,
    groupAmmoStacks,
    canStackerReceiveFromConveyor,
    emitStackerOutputs,
    canReceiveConveyorItem,
    receiveConveyorItem,
    canItemLeaveConveyor,
    getConveyorAdvanceDestination,
    advanceConveyorItems,
    DRILL_UPGRADES,
    createRealityShieldWave,
    defeatRealityShieldOre,
    canStartRealityShield,
    startRealityShield,
    getRealityShieldDps,
    updateRealityShield,
    registerRealityShieldCheatKey,
    REALITY_SHIELD_HP: CONFIG.realityShieldHitPoints,
    REALITY_SHIELD_DEFAULT_INTERVAL_SECONDS: CONFIG.realityShieldInitialIntervalSeconds,
    getDrillDps,
    applyPlaytestCode,
    togglePlaytestCheat,
    changePlaytestDrillUpgrade,
    grantNextTunnelRights,
    update,
    getNextDrillUpgrade,
    canAffordDrillUpgrade,
    purchaseDrillUpgrade,
    getSelectedAmmoAnnealed,
    getSelectedAmmoStack,
    canFireAmmoStack,
    getSelectedGun,
    getSelectedGunAmmoType,
    getSelectedGunFireRate,
    getGunDisplayName,
    getFactoryGunDisplayLabel,
    getFactoryAmmoReadyLabel,
    getGunScheduleForTunnel,
    getGunScheduleRuntime,
    isGunScheduleActive,
    getScheduledGun,
    advanceGunScheduleAfterShot,
    toggleGunSchedule,
    setGunScheduleForTunnel,
    canBuyBuckshotGun,
    buyBuckshotGun,
    canBuyRapidfireGunMk1,
    buyRapidfireGunMk1,
    selectGun,
    switchTunnel,
    getCasingMachineInputState,
    canCasingMachineAcceptItem,
    receiveCasingMachineItem,
    emitCasingMachineOutputs,
    __setFactorySelection: (selection) => {
      selectedFactoryEntities = Array.isArray(selection) ? selection : [];
      selectedFactoryEntity = selectedFactoryEntities.length === 1
        ? selectedFactoryEntities[0]
        : null;
      groupMoveState = null;
    },
    __getFactorySelection: () => selectedFactoryEntities.slice(),
    __setActiveViewForTests: (view) => {
      activeView = view;
    },
    hasFactoryMarqueeExceededDragThreshold,
    shouldFinalizeFactoryMarquee,
    __getState: () => state,
    __setState: (nextState) => {
      state = nextState;
      invalidateFactoryConveyorCache();
    },
  };
} else {
elements.fireButton.addEventListener("click", () => fireLeek("manual"));
elements.hireCrewButton?.addEventListener("click", hireCrew);
elements.selectConveyorButton.addEventListener("click", selectConveyorForPlacement);
elements.selectInventoryConveyorButton.addEventListener("click", selectConveyorForPlacement);
elements.selectPlanterButton.addEventListener("click", () => selectMachineForPlacement("planter"));
elements.selectAmmoShaperButton.addEventListener("click", () => selectMachineForPlacement("ammoShaper"));
elements.selectJacketFormerButton.addEventListener("click", () => selectMachineForPlacement("jacketFormer"));
elements.selectCasingMachineButton.addEventListener("click", () => selectMachineForPlacement("casingMachine"));
elements.selectStorageButton.addEventListener("click", () => selectMachineForPlacement("materialStorage"));
elements.selectSellTubeButton.addEventListener("click", () => selectMachineForPlacement("sellTube"));
elements.selectGraphiteLacedSellTubeButton.addEventListener("click", () => selectMachineForPlacement("graphiteLacedSellTube"));
elements.selectLeekDusterButton.addEventListener("click", () => selectMachineForPlacement("leekDuster"));
elements.selectPrimitiveUpgraderButton.addEventListener("click", () => selectMachineForPlacement("primitiveUpgrader"));
elements.selectRockShackButton.addEventListener("click", () => selectMachineForPlacement("rockShack"));
elements.selectClayKilnButton.addEventListener("click", () => selectMachineForPlacement("clayKiln"));
elements.selectIngotMolderButton.addEventListener("click", () => selectMachineForPlacement("ingotMolder"));
elements.selectGraphiteCopperAnnealerButton.addEventListener("click", () => selectMachineForPlacement("graphiteCopperAnnealer"));
elements.selectGraniteProcessorButton.addEventListener("click", () => selectMachineForPlacement("graniteProcessor"));
elements.selectBronzeStampButton.addEventListener("click", () => selectMachineForPlacement("bronzeStamp"));
elements.selectBronzePillarsButton.addEventListener("click", () => selectMachineForPlacement("bronzePillars"));
elements.selectExtruderButton.addEventListener("click", () => selectMachineForPlacement("extruder"));
elements.selectLeekFiberExtractorButton.addEventListener("click", () => selectMachineForPlacement("leekFiberExtractor"));
elements.selectContactMakerButton.addEventListener("click", () => selectMachineForPlacement("contactMaker"));
  elements.selectMiniElectricArcFurnaceButton.addEventListener("click", () => selectMachineForPlacement("miniElectricArcFurnace"));
elements.selectMetalPressButton.addEventListener("click", () => selectMachineForPlacement("metalPress"));
elements.selectStackerButton.addEventListener("click", () => selectMachineForPlacement("stacker"));
elements.selectSplitterButton.addEventListener("click", () => selectMachineForPlacement("splitter"));
elements.selectQuartzWheelCutterButton.addEventListener("click", () => selectMachineForPlacement("quartzWheelCutter"));
elements.inventorySectionButtons.forEach((button) => {
  button.addEventListener("click", () => setInventorySection(button.dataset.inventorySection));
});
elements.inventoryCategoryButtons.forEach((button) => {
  button.addEventListener("click", () => setInventoryCategory(button.dataset.inventoryCategory));
});
elements.shopCategoryButtons.forEach((button) => {
  button.addEventListener("click", () => setShopCategory(button.dataset.shopCategory));
});
elements.inventoryDetailPlaceButton.addEventListener("click", () => {
  if (selectedInventoryMachineId) {
    selectInventoryMachineForPlacement(selectedInventoryMachineId);
  }
});
elements.pickUpMachineButton.addEventListener("click", pickUpSelectedFactoryEntities);
elements.moveMachineButton.addEventListener("pointerdown", (event) => event.stopPropagation());
bindImmediateAction(elements.moveMachineButton, moveSelectedFactoryEntities);
elements.closeMachineControlsButton.addEventListener("click", clearFactorySelection);
elements.buyLeekDusterButton.addEventListener("click", () => purchaseMachine("leekDuster"));
elements.buyPrimitiveUpgraderButton.addEventListener("click", () => purchaseMachine("primitiveUpgrader"));
elements.buyConveyorButton.addEventListener("click", () => purchaseMachine("conveyor"));
elements.buyRockShackButton.addEventListener("click", () => purchaseMachine("rockShack"));
elements.buyClayKilnButton.addEventListener("click", () => purchaseMachine("clayKiln"));
elements.buyIngotMolderButton.addEventListener("click", () => purchaseMachine("ingotMolder"));
elements.buyGraphiteCopperAnnealerButton.addEventListener("click", () => purchaseMachine("graphiteCopperAnnealer"));
elements.buyGraniteProcessorButton.addEventListener("click", () => purchaseMachine("graniteProcessor"));
elements.buyBronzeStampButton.addEventListener("click", () => purchaseMachine("bronzeStamp"));
elements.buyBronzePillarsButton.addEventListener("click", () => purchaseMachine("bronzePillars"));
elements.buyExtruderButton.addEventListener("click", () => purchaseMachine("extruder"));
elements.buyLeekFiberExtractorButton.addEventListener("click", () => purchaseMachine("leekFiberExtractor"));
elements.buyContactMakerButton.addEventListener("click", () => purchaseMachine("contactMaker"));
elements.buyJacketFormerButton.addEventListener("click", () => purchaseMachine("jacketFormer"));
elements.buyCasingMachineButton.addEventListener("click", () => purchaseMachine("casingMachine"));
  elements.buyMiniElectricArcFurnaceButton.addEventListener("click", () => purchaseMachine("miniElectricArcFurnace"));
  elements.buyMetalPressButton.addEventListener("click", () => purchaseMachine("metalPress"));
  elements.buyStackerButton.addEventListener("click", () => purchaseMachine("stacker"));
elements.buySplitterButton.addEventListener("click", () => purchaseMachine("splitter"));
elements.buyGraphiteLacedSellTubeButton.addEventListener("click", () => purchaseMachine("graphiteLacedSellTube"));
elements.buyMaterialStorageButton.addEventListener("click", () => purchaseMachine("materialStorage"));
elements.buyQuartzWheelCutterButton.addEventListener("click", () => purchaseMachine("quartzWheelCutter"));
elements.shopDetailBuyButton.addEventListener("click", () => {
  if (selectedShopMachineId) {
    purchaseMachine(selectedShopMachineId, selectedShopPurchaseQuantity);
  }
});
elements.shopDetailQuantity.addEventListener("input", () => {
  selectedShopPurchaseQuantity = elements.shopDetailQuantity.value;
  if (selectedShopMachineId) {
    renderShopDetail(selectedShopMachineId);
  }
});
elements.mineDrillUpgradeButton?.addEventListener("click", () => {
  const nextUpgrade = getNextDrillUpgrade();
  if (nextUpgrade) {
    purchaseDrillUpgrade(nextUpgrade.id);
  }
});
elements.exportSaveButton.addEventListener("click", exportSaveData);
elements.importSaveButton.addEventListener("click", importSaveData);
elements.hardResetButton.addEventListener("click", hardResetGame);
elements.applyCodeButton.addEventListener("click", () => applyPlaytestCode());
elements.cheatDrillDpsToggle.addEventListener("click", () => togglePlaytestCheat("drillDpsX10"));
elements.cheatMaterialYieldToggle.addEventListener("click", () => togglePlaytestCheat("materialYieldX10"));
elements.cheatProductionSpeedToggle.addEventListener("click", () => togglePlaytestCheat("productionSpeedX5"));
elements.cheatSellValueToggle.addEventListener("click", () => togglePlaytestCheat("sellValueX10"));
elements.cheatDrillUpgradeButton.addEventListener("click", () => changePlaytestDrillUpgrade(1));
elements.cheatDrillDowngradeButton.addEventListener("click", () => changePlaytestDrillUpgrade(-1));
elements.cheatTunnelRightsButton.addEventListener("click", grantNextTunnelRights);
elements.codeField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyPlaytestCode();
  }
});
elements.saveDataField.addEventListener("input", renderOptions);
elements.tutorialActionButton.addEventListener("click", handleTutorialAction);
elements.feedAmmoButton?.addEventListener("click", feedAmmoShaper);
elements.autoToggleButton.addEventListener("click", toggleAutoExtractor);
bindImmediateAction(elements.drillButton, () => startDrilling());
bindImmediateAction(elements.realityShieldButton, () => startRealityShield());
document.querySelectorAll("[data-debug]").forEach((button) => {
  button.addEventListener("click", () => runDebugAction(button.dataset.debug));
});
document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.viewTarget));
});
document.addEventListener("keydown", (event) => {
  const tagName = event.target instanceof HTMLElement ? event.target.tagName : "";
  if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") {
    return;
  }

  if (registerRealityShieldCheatKey(event.key)) {
    event.preventDefault();
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "escape") {
    event.preventDefault();
    if (selectedBuildTool) {
      cancelFactoryPlacement();
    } else {
      clearFactorySelection();
    }
  } else if (key === "e") {
    event.preventDefault();
    rotateSelectedBuild("clockwise");
  } else if (key === "q") {
    event.preventDefault();
    rotateSelectedBuild("counterclockwise");
  }
});

window.addEventListener("beforeunload", () => {
  saveGame();
  if (tickHandle !== null) {
    window.clearInterval(tickHandle);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    saveGame();
  }
});

setActiveView("mine");
startGameLoop();
}
