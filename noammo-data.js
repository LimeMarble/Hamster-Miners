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
      planterSeconds: 8, fiberSeconds: 2, loggerSeconds: 12,
      basketCapacity: 100, beltSeconds: 2, beltWeight: 5,
      clicksPerSecond: 5, chopsPerHarvest: 5,
      loadedSecondsPerTilePerWeight: 0.5, emptySecondsPerTile: 0.5,
      powerAreaSize: 16,
    },
    directions: ["right", "down", "left", "up"],
    vectors: {
      right: { x: 1, y: 0 }, down: { x: 0, y: 1 },
      left: { x: -1, y: 0 }, up: { x: 0, y: -1 },
    },
    materials: {
      leek: { name: "Leek", value: 0.1, weight: 1, color: "#9dbf65" },
      leekFiber: { name: "Leek Fiber", value: 0.1, weight: 1, color: "#ded4a0" },
      wood: { name: "Wood", value: 0.1, weight: 1, color: "#bb8054", heat: 30 },
      clay: { name: "Clay", value: 0.25, weight: 1, color: "#b76b53" },
      unfiredBrick: { name: "Unfired Brick", value: 0.25, weight: 1, color: "#a77d67" },
      unfiredPot: { name: "Unfired Pot", value: 1, weight: 2, color: "#bb8b70" },
      brick: { name: "Bricks", value: 1, weight: 1, color: "#b97955" },
      pot: { name: "Fired Pot", value: 4, weight: 2, color: "#c47b55" },
    },
    machines: {
      planter: {
        name: "Leek Planter", width: 3, height: 3, color: "#5f8148", category: "Material",
        cost: { cash: 500, materials: { brick: 50, leekFiber: 100 } }, source: "leek", cycle: 8, outputLimit: 2,
        description: "Grows one Leek every 8 seconds. Outputs directly from its facing edge; no conveyor inside.",
      },
      basket: {
        name: "Leek Basket", width: 1, height: 1, color: "#a98b53", category: "Logistics",
        quickAction: "collect",
        cost: { cash: 0, materials: { leekFiber: 5 } },
        description: "Holds up to 100 items. Collect them into inventory or assign a hauling hamster. No manual deposits.",
      },
      fiber: {
        name: "Leek Fiber Extractor", width: 1, height: 2, color: "#99a26d", category: "Material",
        cost: { cash: 0, materials: { wood: 30, leek: 1 } }, crew: 1,
        description: "One Leek becomes two Leek Fiber. Each Fiber retains the incoming Leek’s value.",
      },
      logger: {
        name: "Logger", width: 1, height: 1, color: "#a7784c", category: "Material", crew: 1,
        source: "wood", cycle: 12,
        cost: { cash: 0, materials: { wood: 50, leekFiber: 5 } },
        description: "Place inside the middle of a tree edge, pointing outward. One Wood every 12 seconds. Uses one hamster.",
      },
      clayPit: {
        name: "Clay Pit", width: 2, height: 2, color: "#a57253", category: "Material", crew: 1,
        cost: { cash: 0, materials: { wood: 100 } }, source: "clay", cycle: 12, centeredOutput: true,
        description: "One Clay every 12 seconds. Manually operated by one hamster; no kinetic power required.",
      },
      clayShaper: {
        name: "Clay Shaping Bench", width: 2, height: 2, color: "#bd9675", category: "Material", crew: 1,
        footprint: [[0, 0], [1, 0], [1, 1]], defaultMode: "brick",
        cost: { cash: 20, materials: { wood: 50, leekFiber: 5 } },
        recipes: {
          brick: { name: "Unfired Brick", input: 1, output: "unfiredBrick", seconds: 2, valueMultiplier: 1 },
          pot: { name: "Unfired Pot", input: 2, output: "unfiredPot", seconds: 4, valueMultiplier: 2 },
        },
        description: "Hand-shapes Clay into unfired Bricks or Pots. Bricks retain their Clay’s value; Pots double the combined value of their two Clay inputs.",
      },
      kiln: {
        name: "Clay Kiln", width: 2, height: 3, color: "#a76d4b", category: "Material", crew: 2,
        crewCells: [[0, 2], [1, 2]],
        cost: { cash: 30, materials: { unfiredBrick: 50, clay: 10, leekFiber: 15 } },
        heatCapacity: 250, heatPerSecond: 5, outputSeconds: 2,
        recipes: {
          unfiredBrick: { input: 4, output: "brick", seconds: 8, valueMultiplier: 4 },
          unfiredPot: { input: 2, output: "pot", seconds: 8, valueMultiplier: 4 },
        },
        description: "Fires four unfired Bricks or two unfired Pots in eight seconds, multiplying their value by four. Either input accepts fuel or unfired products. Uses two hamsters.",
      },
      wheel: {
        name: "Basic Hamster Wheel", width: 3, height: 2, color: "#a48b66", category: "Logistics", crew: 1,
        defaultFacing: "down",
        cost: { cash: 8, materials: { wood: 100, leekFiber: 25 } },
        description: "Kinetic connections run along both long edges. Connect a Conveyor Drive directly to one of them.",
      },
      drive: {
        name: "Conveyor Drive", width: 2, height: 1, color: "#b89b63", category: "Logistics",
        cost: { cash: 4, materials: { wood: 75, leekFiber: 7.5 } },
        description: "Connect to a Hamster Wheel to power primitive conveyors within a 16×16 area.",
      },
      primitive: {
        name: "Primitive Upgrader", width: 1, height: 2, color: "#a58b60", category: "Cash",
        cost: { cash: 5, materials: { wood: 50, leekFiber: 5 } },
        cashEffect: null,
        description: "Two parallel primitive conveyor lanes. Requires a powered Conveyor Drive. Its new cash effect is not yet set.",
      },
      belt: {
        name: "Primitive Conveyor", width: 1, height: 1, color: "#71786c", category: "Logistics",
        cost: { cash: 1, materials: { wood: 20 } },
        description: "Moves one cargo stack at a time. Requires kinetic power. Transit takes two seconds per tile.",
      },
      sellTube: {
        name: "Sell Tube", width: 2, height: 2, color: "#59857c", category: "Cash",
        cost: { cash: 250, materials: { brick: 200 } },
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
