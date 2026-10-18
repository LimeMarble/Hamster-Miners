(function (root) {
  "use strict";

  const DATA = {
    saveKind: "hamster-miners-noammo-opening",
    saveVersion: 1,
    saveKey: "hamster-miners-noammo-opening-v1",
    config: {
      columns: 250, rows: 250, treeCount: 30, startingCrew: 10,
      planterSeconds: 2, fiberSeconds: 2, loggerSeconds: 12,
      basketCapacity: 100, beltSeconds: 1, beltWeight: 5,
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
      wood: { name: "Wood", value: null, weight: 1, color: "#bb8054", heat: 50 },
    },
    machines: {
      planter: {
        name: "Leek Planter", width: 3, height: 3, color: "#5f8148", category: "Material",
        cost: { cash: 0, materials: {} }, source: "leek", cycle: 2,
        description: "Grows one Leek every 2 seconds. Outputs directly from its facing edge; no conveyor inside.",
      },
      basket: {
        name: "Leek Basket", width: 1, height: 1, color: "#a98b53", category: "Logistics",
        cost: { cash: 0, materials: { leekFiber: 10 } },
        description: "Holds up to 100 items. Collect them into inventory, sell eligible contents, or assign a hauling hamster. No manual deposits.",
      },
      fiber: {
        name: "Leek Fiber Extractor", width: 1, height: 2, color: "#99a26d", category: "Material",
        baseFacing: "down",
        defaultFacing: "down",
        cost: { cash: 1, materials: { leek: 10 } }, crew: 1,
        description: "One Leek becomes two Leek Fiber. Each Fiber retains the incoming Leek’s value.",
      },
      logger: {
        name: "Logger", width: 1, height: 1, color: "#a7784c", category: "Material", crew: 1,
        cost: { cash: 0, materials: { wood: 50, leekFiber: 10 } },
        description: "Place inside the middle of a tree edge, pointing outward. One Wood every 12 seconds. Uses one hamster.",
      },
      wheel: {
        name: "Basic Hamster Wheel", width: 3, height: 2, color: "#a48b66", category: "Logistics", crew: 1,
        cost: { cash: 8, materials: { wood: 100, leekFiber: 50 } },
        description: "Kinetic connections run along both long edges. Connect a Conveyor Drive directly to one of them.",
      },
      drive: {
        name: "Conveyor Drive", width: 2, height: 1, color: "#b89b63", category: "Logistics",
        cost: { cash: 4, materials: { wood: 75, leekFiber: 15 } },
        description: "Its facing arrow identifies the kinetic intake. The output is on the opposite side.",
      },
      primitive: {
        name: "Primitive Upgrader", width: 1, height: 2, color: "#a58b60", category: "Cash",
        cost: { cash: 5, materials: { wood: 50, leekFiber: 10 } },
        cashEffect: null,
        description: "Two parallel primitive conveyor lanes. Requires a powered Conveyor Drive. Its new cash effect is not yet set.",
      },
      belt: {
        name: "Primitive Conveyor", width: 1, height: 1, color: "#71786c", category: "Logistics",
        cost: null,
        description: "Moves one cargo stack at a time. Requires kinetic power. Transit takes one second per tile.",
      },
      sellTube: {
        name: "Sell Tube", width: 2, height: 2, color: "#59857c", category: "Cash",
        cost: null,
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
