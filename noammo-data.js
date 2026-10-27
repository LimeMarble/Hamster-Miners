(function (root) {
  "use strict";

  // Miners Starting Terrain.xlsx: green centers in the first 250 rows/columns.
  // These are one-based [Excel column, Excel row], not tree footprint origins.
  const TREE_CENTERS = [
    [110, 41], [128, 42], [162, 44], [59, 49], [119, 55], [181, 55],
    [69, 60], [63, 64], [158, 68], [67, 75], [130, 105], [137, 108],
    [118, 112], [133, 116], [184, 121], [129, 130], [136, 132], [97, 133],
    [167, 134], [76, 136], [131, 139], [124, 141], [135, 149], [113, 155],
    [128, 160], [74, 169], [68, 183], [71, 192], [147, 202], [166, 205],
    [99, 211], [68, 213], [142, 216], [147, 216], [164, 226], [142, 227],
  ];
  const DATA = {
    saveKind: "hamster-miners-noammo-opening",
    saveVersion: 1,
    saveKey: "hamster-miners-noammo-opening-v1",
    startingTerrain: { version: 1, treeCenters: TREE_CENTERS },
    config: {
      columns: 250, rows: 250, treeCount: TREE_CENTERS.length, startingCrew: 10,
      crewHireBaseCost: 5, crewHireCostMultiplier: 1.1,
      planterSeconds: 8, fiberSeconds: 2, loggerSeconds: 6,
      basketCapacity: 100, beltSeconds: 2, beltWeight: 2,
      clicksPerSecond: 5, chopsPerHarvest: 5,
      powerAreaReach: 7,
    },
    directions: ["right", "down", "left", "up"],
    vectors: {
      right: { x: 1, y: 0 }, down: { x: 0, y: 1 },
      left: { x: -1, y: 0 }, up: { x: 0, y: -1 },
    },
    materials: {
      leek: { name: "Leek", value: 0.1, weight: 1, color: "#9dbf65" },
      leekFiber: { name: "Leek Fiber", value: 0.1, weight: 1, color: "#ded4a0" },
      wood: { name: "Wood", value: 0.1, weight: 1, color: "#bb8054", heat: 30000 },
      charcoal: { name: "Charcoal", value: 0.2, weight: 1, color: "#373a35", heat: 240000 },
      woodenGear: { name: "Wooden Gear", value: 0.2, weight: 2, color: "#c19762" },
      clay: { name: "Clay", value: 0.25, weight: 1, color: "#b76b53", family: "clay" },
      unfiredBrick: { name: "Unfired Brick", value: 0.25, weight: 1, color: "#a77d67", family: "clay" },
      unfiredPot: { name: "Unfired Pot", value: 1, weight: 2, color: "#bb8b70", family: "clay" },
      brick: { name: "Bricks", value: 1, weight: 1, color: "#b97955", family: "clay" },
      pot: { name: "Fired Pot", value: 4, weight: 2, color: "#c47b55", family: "clay" },
      chert: { name: "Chert", value: 0.1, weight: 1, color: "#858581", family: "stone" },
      granite: { name: "Granite", value: 0.1, weight: 1, color: "#b27a72", family: "stone" },
      limestone: { name: "Limestone", value: 0.1, weight: 1, color: "#c6bea0", family: "stone" },
      corundum: { name: "Corundum", value: 1, weight: 1, color: "#9b899d", family: "stone" },
      nativeCopper: { name: "Native Copper", value: 1.5, weight: 1, color: "#c58b58" },
      moltenCopper: { name: "Molten Copper", value: 6, weight: 1, color: "#ef9958", fluid: true, moldsTo: "copperIngot" },
      copperIngot: { name: "Copper Ingot", value: 6, weight: 1, color: "#d29a69", family: "metal" },
      soil: { name: "Soil", value: null, weight: 1, color: "#79563b" },
    },
    grades: [
      { name: "Poor", multiplier: 0.75, color: "#ba7b65" },
      { name: "Standard", multiplier: 1.5, color: "#c5c8b0" },
      { name: "Fine", multiplier: 2.5, color: "#8bc799" },
      { name: "Remarkable", multiplier: 8, color: "#9eb3ec" },
      { name: "Exceptional", multiplier: 40, color: "#d6b3e6" },
    ],
    gradeTables: { clay: [0.2, 0.6, 0.2, 0, 0], stone: [0, 1, 0, 0, 0] },
    machines: {
      planter: {
        name: "Leek Planter", width: 3, height: 3, color: "#5f8148", category: "Material",
        dismantleMinimum: 2,
        cost: { cash: 1500, materials: { brick: 50, leekFiber: 100, soil: 200 } }, source: "leek", cycle: 8, outputLimit: 2,
        description: "Grows one Leek every 8 seconds. Outputs directly from its facing edge; no conveyor inside.",
      },
      basket: {
        name: "Leek Basket", width: 1, height: 1, color: "#a98b53", category: "Logistics",
        dismantleMinimum: 1,
        quickAction: "collect", collectorCapacity: 100,
        cost: { cash: 0, materials: { leekFiber: 5 } },
        description: "Holds up to 100 items. Collect them into inventory. No manual deposits.",
      },
      brickStorage: {
        name: "Brick Resource Storage", width: 2, height: 2, color: "#b57355", category: "Logistics",
        labelLines: ["Brick Resource", "Storage"], quickAction: "collect", collectorCapacity: 600,
        cost: { cash: 500, materials: { brick: 100, clay: 15 } },
        description: "Holds up to 600 resources. Collect them into inventory. No manual deposits.",
      },
      fiber: {
        name: "Leek Fiber Extractor", width: 1, height: 2, color: "#99a26d", category: "Material",
        cost: { cash: 0, materials: { wood: 30, leek: 1 } }, crew: 1,
        description: "One Leek becomes two Leek Fiber. Each Fiber retains the incoming Leek’s value.",
      },
      logger: {
        name: "Logger", width: 1, height: 1, color: "#a7784c", category: "Material", crew: 1,
        source: "wood", cycle: 6,
        cost: { cash: 0, materials: { wood: 50, leekFiber: 5 } },
        description: "Place inside the middle of a tree edge, pointing outward. One Wood every 6 seconds. Uses one hamster.",
      },
      clayPit: {
        name: "Clay Pit", width: 2, height: 2, color: "#a57253", category: "Material", crew: 1,
        cost: { cash: 5, materials: { wood: 100 } }, source: "clay", cycle: 12, centeredOutput: true,
        description: "One Clay every 12 seconds. Manually operated by one hamster; no kinetic power required.",
      },
      primitiveRockDrill: {
        name: "Primitive Rock Drill", width: 3, height: 2, color: "#8d8573", category: "Material",
        labelLines: ["Primitive", "Rock Drill"], labelCell: [0.5, 0.5],
        cost: { cash: 15000, materials: { chert: 40, wood: 50 } },
        sourceModes: { chert: "Chert", granite: "Granite" }, defaultMode: "chert",
        cycle: 5, sourceQuantity: 2, outputLimit: 2, centeredOutput: true, requiresKinetic: true,
        ports: [
          { x: 2, y: 0.5, direction: "right", role: "output", span: 2 },
          { x: 1, y: 1, direction: "down", role: "kineticInput" },
          { x: 1, y: 0, direction: "up", role: "kineticInput" },
        ],
        description: "Extracts two Chert or Granite every five seconds. Connect a Hamster Wheel to either kinetic intake.",
      },
      copperDrill: {
        name: "Copper Drill", width: 3, height: 2, color: "#b18461", category: "Material",
        labelLines: ["Copper", "Drill"], labelCell: [0.5, 0.5],
        cost: { cash: 80000, materials: { granite: 100, chert: 50, woodenGear: 20, wood: 40 } },
        source: "nativeCopper", cycle: 15, outputLimit: 1, requiresKinetic: true, centeredOutput: true,
        ports: [
          { x: 2, y: 0.5, direction: "right", role: "output", span: 2 },
          { x: 1, y: 1, direction: "down", role: "kineticInput" },
          { x: 1, y: 0, direction: "up", role: "kineticInput" },
        ],
        description: "Extracts one Native Copper every fifteen seconds. Connect a Hamster Wheel to either kinetic intake. Uses a centered two-tile output.",
      },
      pebbleSifter: {
        name: "Pebble Sifter", width: 3, height: 2, color: "#a48e69", category: "Material",
        labelLines: ["Pebble", "Sifter"],
        cost: { cash: 1800, materials: { wood: 150, brick: 30, leekFiber: 50 } },
        cycle: 2, requiresKinetic: true, batchOutputs: { soil: 0.1, chert: 0.1 },
        ports: [
          { x: 2, y: 0, direction: "right", role: "output", material: "soil" },
          { x: 1, y: 1, direction: "down", role: "kineticInput" },
          { x: 2, y: 1, direction: "right", role: "output", material: "chert" },
        ],
        description: "Sifts 0.1 Soil and 0.1 Chert every two seconds. Requires a connected Hamster Wheel. Both outputs must clear before sifting continues.",
      },
      clayShaper: {
        name: "Clay Shaping Bench", width: 2, height: 2, color: "#bd9675", category: "Material", crew: 1,
        footprint: [[0, 0], [1, 0], [1, 1]], defaultMode: "brick", craftInput: "clay", inputLimit: 2, outputBuffer: 1,
        cost: { cash: 20, materials: { wood: 50, leekFiber: 5 } },
        recipes: {
          brick: { name: "Unfired Brick", input: 1, output: "unfiredBrick", seconds: 2, valueMultiplier: 1 },
          pot: { name: "Unfired Pot", input: 2, output: "unfiredPot", seconds: 4, valueMultiplier: 2 },
        },
        description: "Hand-shapes Clay into unfired Bricks or Pots. Bricks retain their Clay’s value; Pots double the combined value of their two Clay inputs.",
      },
      crudeGearBench: {
        name: "Crude Gear Bench", width: 1, height: 2, color: "#b18b62", category: "Material", crew: 1,
        labelLines: ["Gear", "Bench"], labelCell: [0, 0],
        cost: { cash: 0, materials: { wood: 25 } }, craftInput: "wood", inputLimit: 2, defaultMode: "gear",
        ports: [
          { x: 0, y: 1, direction: "left", role: "input" },
          { x: 0, y: 1, direction: "right", role: "output" },
        ],
        recipes: { gear: { name: "Wooden Gear", input: 2, output: "woodenGear", seconds: 12, valueMultiplier: 1 } },
        description: "One hamster carves two Wood into one Wooden Gear in twelve seconds. Hand-operated.",
      },
      potSpinner: {
        name: "Pot Spinner", width: 2, height: 3, color: "#a89478", category: "Material",
        labelLines: ["Pot", "Spinner"], craftInput: "clay", inputLimit: 2, defaultMode: "pot", requiresKinetic: true,
        cost: { cash: 7500, materials: { wood: 150, brick: 60, granite: 30, leekFiber: 15 } },
        ports: [
          { x: 0, y: 1, direction: "left", role: "input" },
          { x: 1, y: 1, direction: "right", role: "output" },
          { x: 0, y: 0, direction: "up", role: "kineticInput" },
          { x: 0, y: 2, direction: "down", role: "kineticInput" },
        ],
        recipes: {
          pot: { name: "Unfired Pot", input: 2, output: "unfiredPot", seconds: 12, valueMultiplier: 2,
            gradeProfile: [0.2, 0.1, 0.4, 0.25, 0.05] },
        },
        description: "Carefully shapes two Clay into one unfired Pot in twelve seconds, improving its grade chances. Connect a Hamster Wheel to either kinetic intake.",
      },
      gradingBench: {
        name: "Grading Bench", width: 2, height: 2, color: "#b2a782", category: "Cash",
        crew: 1, secondsPerWeight: 1, inputWeightLimit: 5,
        labelLines: ["Grading", "Bench"], footprint: [[0, 0], [1, 0], [1, 1]],
        cost: { cash: 4000, materials: { wood: 100, leekFiber: 50, chert: 10 } },
        description: "Evaluates Clay products and stone, rolling once per ungraded stack. Takes one second per weight and uses one hamster.",
      },
      kiln: {
        name: "Clay Kiln", width: 2, height: 3, color: "#a76d4b", category: "Material", crew: 2,
        cost: { cash: 300, materials: { unfiredBrick: 50, clay: 10, leekFiber: 15 } },
        heatCapacity: 250000, heatPerSecond: 10000, outputSeconds: 2,
        recipes: {
          unfiredBrick: { input: 4, output: "brick", seconds: 8, valueMultiplier: 4 },
          unfiredPot: { input: 2, output: "pot", seconds: 8, valueMultiplier: 4 },
        },
        description: "Fires four unfired Bricks or two unfired Pots in eight seconds, multiplying their value by four. Either input accepts fuel or unfired products. Uses two hamsters.",
      },
      primitiveFurnace: {
        name: "Primitive Furnace", width: 2, height: 3, color: "#96755d", category: "Material", crew: 2,
        labelLines: ["Primitive", "Furnace"],
        cost: { cash: 280000, materials: { brick: 200, granite: 100, clay: 50 } },
        heatCapacity: 1000000, heatPerSecond: 25000, outputSeconds: 2,
        manualRecipes: true, defaultMode: "charcoal",
        ports: [
          { x: 0, y: 0, direction: "left", role: "input" },
          { x: 0, y: 1, direction: "left", role: "input" },
          { x: 1, y: 1, direction: "right", role: "output" },
        ],
        recipes: {
          charcoal: { name: "Charcoal", material: "wood", input: 4, output: "charcoal", outputQuantity: 2, seconds: 12, heatPerSecond: 0, valueMultiplier: 1 },
          copper: { name: "Copper smelting", material: "nativeCopper", input: 4, output: "moltenCopper", outputQuantity: 4, seconds: 20, valueMultiplier: 4 },
        },
        description: "Makes two Charcoal from four Wood in twelve seconds without external heat, or smelts four Native Copper in twenty seconds using 500ku of heat. Feeds molten Copper directly into an Ingot Molder. Uses two hamsters.",
      },
      ingotMolder: {
        name: "Ingot Molder", width: 1, height: 2, color: "#b99472", category: "Material", crew: 1,
        labelLines: ["Ingot", "Molder"], labelCell: [0, 0],
        cost: { cash: 128000, materials: { brick: 40, clay: 20, leekFiber: 10 } },
        molder: true, inputLimit: 1, outputBuffer: 1, seconds: 1,
        ports: [
          { x: 0, y: 1, direction: "left", role: "input" },
          { x: 0, y: 1, direction: "right", role: "output" },
        ],
        description: "Molds one unit of liquid metal into one ingot every second, preserving its value. Uses one hamster and no consumables. Cast Iron requires a Refractory Caster.",
      },
      wheel: {
        name: "Basic Hamster Wheel", width: 3, height: 2, color: "#a48b66", category: "Logistics", crew: 1,
        defaultFacing: "down",
        cost: { cash: 0, materials: { wood: 100, leekFiber: 25 } },
        description: "One kinetic output at the center of each long edge. Connect a Conveyor Drive or kinetic machine directly to an output.",
      },
      drive: {
        name: "Conveyor Drive", width: 2, height: 1, color: "#b89b63", category: "Logistics",
        cost: { cash: 0, materials: { wood: 75, leekFiber: 7.5 } },
        description: "Connect to a Hamster Wheel to power primitive conveyors up to seven tiles beyond the Drive’s footprint.",
      },
      primitive: {
        name: "Primitive Upgrader", width: 1, height: 2, color: "#a58b60", category: "Cash",
        cost: { cash: 2, materials: { wood: 10, leekFiber: 5 }, machines: { belt: 2 } },
        cashEffect: null,
        conveyors: [[0, 0], [0, 1]],
        description: "Two parallel primitive conveyor lanes. Requires a powered Conveyor Drive.",
      },
      brickSeal: {
        name: "Brick Seal", width: 1, height: 2, color: "#bd7856", category: "Cash",
        labelCell: [0, 1], labelLines: ["Brick", "Seal"],
        cost: { cash: 450, materials: { brick: 35 }, machines: { belt: 1 } },
        conveyors: [[0, 0]],
        cashEffect: { bonus: 1.25, useLimit: 9, upperLimit: 15, baseValueRequired: 0.5 },
        gradeEffect: { family: "clay", poorToStandardPerUse: 0.05, useLimit: 4 },
        description: "Seals passing products to increase their value. Gradually fixes Poor clay products through four uses.",
      },
      pebblePile: {
        name: "Pebble Pile", width: 1, height: 2, color: "#999488", category: "Cash",
        labelCell: [0, 1], labelLines: ["Pebble", "Pile"], conveyors: [[0, 0]],
        cost: { cash: 2000, materials: { chert: 20, leekFiber: 30 }, machines: { belt: 1 } },
        cashEffect: { bonus: 4, useLimit: 5, baseValueRequired: 0.5 },
        description: "Adds $4 to passing sellables up to five times. Requires kinetic power for its conveyor.",
      },
      leekInfuser: {
        name: "Leek Infuser", width: 1, height: 2, color: "#82975a", category: "Cash",
        labelCell: [0, 1], labelLines: ["Leek", "Infuser"], conveyors: [[0, 0]],
        cost: { cash: 15, materials: { leek: 20, leekFiber: 15 }, machines: { belt: 1 } },
        cashEffect: { bonus: 0.4, upperLimit: 2 },
        description: "Infuses passing sellables with Leek essence to increase their value.",
      },
      primitiveShack: {
        name: "Primitive Shack", width: 3, height: 4, color: "#9e815c", category: "Cash",
        labelCell: [1, 0], labelLines: ["Primitive Shack"],
        conveyors: [[0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
        upgradeCells: [[1, 1], [1, 2]],
        cost: { cash: 10000, materials: { wood: 880, leekFiber: 200, chert: 50, pot: 20 }, machines: { belt: 6 } },
        cashEffect: { multiplier: 2, useLimit: 1, upperLimit: 2500, baseValueRequired: 1.2 },
        description: "Doubles the value of passing products. Two parallel conveyor paths run through the Shack.",
      },
      graniteProcessor: {
        name: "Granite Processor", width: 1, height: 2, color: "#aa8077", category: "Cash",
        labelLines: ["Granite", "Processor"], conveyors: [[0, 0], [0, 1]],
        cost: { cash: 50000, materials: { granite: 300 }, machines: { belt: 2 } },
        cashEffect: { multiplier: 1.3, useLimit: 6, upperLimit: 500, baseValueRequired: 3.5 },
        description: "Processes passing products to increase their value. Two parallel primitive conveyor lanes.",
      },
      copperChimes: {
        name: "Copper Chimes", width: 1, height: 3, color: "#c58a5a", category: "Cash",
        labelLines: ["Copper", "Chimes"], labelCell: [0, 0], conveyors: [[0, 1]],
        cost: { cash: 300000, materials: { leekFiber: 200, wood: 50, copperIngot: 10 }, machines: { belt: 1 } },
        cashEffect: { multiplier: 1.25, useLimit: 1, upperLimit: 5000 },
        description: "Increases the value of passing sellables by 25% once. Requires kinetic power for its conveyor.",
      },
      belt: {
        name: "Primitive Conveyor", width: 1, height: 1, color: "#71786c", category: "Logistics",
        cost: { cash: 0, materials: { wood: 10, woodenGear: 4 } },
        conveyors: [[0, 0]],
        description: "Moves one cargo stack at a time. Requires kinetic power. Transit takes two seconds per tile.",
      },
      primitiveBridge: {
        name: "Primitive Conveyor Bridge", width: 3, height: 1, color: "#a58b63", category: "Logistics",
        labelLines: ["Bridge"], conveyors: [[0, 0], [1, 0], [2, 0]], bridge: true,
        cost: { cash: 100, materials: {}, machines: { belt: 4 } },
        description: "Carries cargo over one ordinary conveyor. The entrance and exit must remain clear.",
      },
      primitiveStacker: {
        name: "Primitive Stacker", width: 1, height: 1, color: "#9b906e", category: "Logistics",
        labelLines: ["Stacker"],
        cost: { cash: 3000, materials: { wood: 80, chert: 50, granite: 80 }, machines: { belt: 1 } },
        conveyors: [[0, 0]], maxStackSize: 2, defaultStackSize: 1,
        ports: [
          { x: 0, y: 0, direction: "left", role: "input" },
          { x: 0, y: 0, direction: "up", role: "input" },
          { x: 0, y: 0, direction: "down", role: "input" },
          { x: 0, y: 0, direction: "right", role: "output" },
        ],
        description: "Combines matching items into a stack of the typed size, up to two. Accepts from three sides and outputs in its facing direction. Requires kinetic power.",
      },
      manualOverflow: {
        name: "Manual Overflow", width: 2, height: 3, color: "#a38e68", category: "Logistics", crew: 1,
        labelLines: ["Manual", "Overflow"], defaultMode: "up", manualTransferSeconds: 2,
        cost: { cash: 4, materials: { wood: 20, woodenGear: 2 }, machines: { belt: 2 } },
        conveyors: [[0, 1], [1, 1]],
        modeFootprints: {
          up: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
          down: [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2]],
        },
        ports: [
          { x: 0, y: 1, direction: "left", role: "input" },
          { x: 1, y: 1, direction: "right", role: "output" },
          { x: 0, y: 0, direction: "up", role: "output", mode: "up" },
          { x: 0, y: 2, direction: "down", role: "output", mode: "down" },
        ],
        description: "One hamster redirects blocked cargo to the selected side in two seconds. The straight conveyor route has priority.",
      },
      sellTube: {
        dismantleMinimum: 1,
        name: "Sell Tube", width: 2, height: 2, color: "#59857c", category: "Cash",
        cost: { cash: 750, materials: { brick: 200 } },
        description: "Sells eligible incoming cargo at its current value.",
      },
    },
  };

  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = freeze(DATA);
  else root.NoAmmoData = freeze(DATA);
}(globalThis));
