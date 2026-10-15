"use strict";

// Browser bootstrapping; Node tests use the ordered browser sources via the test loader.

if (typeof module !== "undefined" && module.exports && !globalThis.__HAMSTER_MINERS_VM_BOOT__) {
  module.exports = require("./tests/load-game.cjs")();
} else {
state = loadSavedGame() ?? createInitialState();

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
    FACTORY_PAN_MARGIN_TILES,
    FACTORY_STARTER_COLUMN_OFFSET,
    getFactoryCameraScrollLimits,
    getFactoryCameraStartScroll,
    clampFactoryCameraScroll,
    panFactoryCameraAtEdges,
    drawMachineFloor,
    drawMachinePreviewConveyors,
    refreshMachineStaticLayer,
    renderMachineOverlay,
    __setFactorySceneForTests: (scene, overlay) => {
      clearStorageOutputLabels();
      clearConveyorItemLabels();
      machineStaticLayer?.destroy(true);
      machineStaticLayer = null;
      machineScene = scene;
      machineOverlay = overlay;
      gunNameText = null;
      gunAmmoText = null;
      lastFactoryOverlaySignature = null;
    },
    __setFactoryPreviewForTests: (id, orientation, tile) => {
      selectedBuildTool = id;
      selectedBuildOrientation = orientation;
      hoveredFactoryTile = tile;
      lastFactoryOverlaySignature = null;
    },
    RESOURCE_DEFINITIONS,
    PLAYTEST_PANEL_CHEAT_CODE,
    isObtainableMaterial,
    LOW_MELTING_METAL_ORES,
    MACHINE_LAYOUT,
    MACHINE_PURCHASES,
    GEAR_DEFINITIONS,
    GEAR_PRESS_MODES,
    CARGO_WEIGHTS,
    CONVEYOR_WEIGHT_LIMITS,
    getCargoUnitWeight,
    getCargoWeight,
    getConveyorWeightCapacity,
    canConveyorCarryItem,
    AGGREGATE_RECIPE,
    canAggregateMixerAcceptItem,
    receiveAggregateMixerItem,
    updateAggregateMixers,
    HOT_FLUID_PIPE_MODES,
    HOT_FLUID_PIPE_PRESETS,
    HOT_FLUID_PIPE_PORT_ROLES,
    HOT_FLUID_PIPE_THROUGHPUT,
    getHotFluidPipeMode,
    getHotFluidPipeInputDirection,
    getHotFluidPipeInputDirections,
    getHotFluidPipeLocalPorts,
    getHotFluidPipePortSides,
    getHotFluidPipePreset,
    isValidHotFluidPipePorts,
    isHotFluidPipeCap,
    configureHotFluidPipe,
    setHotFluidPipePortRole,
    switchHotFluidPipePreset,
    getHotFluidPipePlacementTemplate,
    renderHotFluidPipePortControls,
    getHotFluidPipeOutputDirections,
    getHotFluidPipeNetwork,
    switchHotFluidPipeMode,
    updateHotFluidPipes,
    getAvailableLiquidQuantity,
    getCasingMachineAvailableLiquid,
    flushArcFurnaceOutputs,
    startBulletCoreCasting,
    startMolderJob,
    getMachinePort,
    flipContactMakerInput,
    getMachinePorts,
    getGearPressMode,
    switchGearPressMode,
    canGearPressAcceptInput,
    receiveGearPressInput,
    flushGearPressOutputs,
    MACHINE_CATEGORY_ORDER,
    MACHINE_CATEGORY_LABELS,
    MACHINE_CATEGORY_BY_ID,
    getMachineCategory,
    getMachineCategories,
    machineBelongsToCategory,
    CRAFTING_RECIPES,
    getRecipeMachineName,
    getRecipeMachineOptions,
    getFilteredCraftingRecipes,
    renderRecipes,
    ARC_FURNACE_RECIPE_OPTIONS,
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
    switchCasingMachineMode,
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
    getConveyorItem,
    placeItemOnConveyor,
    getConveyorSpeed,
    getConveyorSecondsPerTile,
    placeMachine,
    getSelectableFactoryEntities,
    selectFactoryEntitiesInRectangle,
    beginGroupMove,
    moveSelectedFactoryEntities,
    completeGroupMove,
    rotateSelectedBuild,
    loadLayer,
    toggleAutoDrill,
    maybeStartAutomaticDrilling,
    AUTO_DRILL_MODES,
    pickUpSelectedFactoryEntities,
    pickUpSelectedFactoryEntity,
    getArcFurnaceRecipe,
    getArcFurnaceMode,
    switchArcFurnaceMode,
    getFactoryMachineProgressState,
    renderFactoryMachineControls,
    getMachineUpgradeTile,
    getInternalConveyorTiles,
    getMachineOccupiedTiles,
    isTileInsideMachine,
    markItemForDuster,
    transformItemLeavingConveyor,
    getJacketFormerKilnLink,
    getCasingMachineSmelterLink,
    startJacketFormerCoating,
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
    emitStorageOutputs,
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
    canCasingMachineAcceptItem,
    canCasingMachineProcessItem,
    applyCasingMachineToItem,
    getCasingMachineAvailableLiquid,
    getMachineActionProgressNote,
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
    beginFactoryTapSelection,
    cancelFactoryInteraction,
    getFactoryInteractionControlState,
    renderFactoryInteractionControls,
    bindFactoryInteractionControls,
    bindFactoryOverlayInputGuards,
    handleFactoryKeyDown,
    handleFactoryGridPointerDown,
    handleFactoryGridPointerMove,
    handleFactoryGridPointerUp,
    __getState: () => state,
    __setState: (nextState) => {
      state = nextState;
      factorySelectionDrag = null;
      factoryTapSelection = null;
      factoryOverlayGestureFromControls = false;
      factoryOverlayPointerActive = false;
      lastFactoryInteractionControlsSignature = null;
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
elements.selectRefractoryCasterButton.addEventListener("click", () => selectMachineForPlacement("refractoryCaster"));
elements.selectGraphiteCopperAnnealerButton.addEventListener("click", () => selectMachineForPlacement("graphiteCopperAnnealer"));
elements.selectGraniteProcessorButton.addEventListener("click", () => selectMachineForPlacement("graniteProcessor"));
elements.selectBronzeStampButton.addEventListener("click", () => selectMachineForPlacement("bronzeStamp"));
elements.selectBronzePillarsButton.addEventListener("click", () => selectMachineForPlacement("bronzePillars"));
elements.selectExtruderButton.addEventListener("click", () => selectMachineForPlacement("extruder"));
elements.selectLeekFiberExtractorButton.addEventListener("click", () => selectMachineForPlacement("leekFiberExtractor"));
elements.selectContactMakerButton.addEventListener("click", () => selectMachineForPlacement("contactMaker"));
  elements.selectMiniElectricArcFurnaceButton.addEventListener("click", () => selectMachineForPlacement("miniElectricArcFurnace"));
elements.selectMetalPressButton.addEventListener("click", () => selectMachineForPlacement("metalPress"));
elements.selectGearPressButton.addEventListener("click", () => selectMachineForPlacement("gearPress"));
elements.pipePlacementMode?.addEventListener("change", () => {
  if (switchHotFluidPipePreset(getHotFluidPipePlacementTemplate(), elements.pipePlacementMode.value)) {
    saveGame();
    renderInventoryDetail("hotFluidPipe");
  }
});
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
bindFactoryOverlayInputGuards();
elements.pickUpMachineButton.addEventListener("click", pickUpSelectedFactoryEntities);
elements.moveMachineButton.addEventListener("pointerdown", (event) => event.stopPropagation());
bindImmediateAction(elements.moveMachineButton, moveSelectedFactoryEntities);
bindFactoryInteractionControls();
elements.closeMachineControlsButton.addEventListener("click", clearFactorySelection);
elements.buyLeekDusterButton.addEventListener("click", () => purchaseMachine("leekDuster"));
elements.buyPrimitiveUpgraderButton.addEventListener("click", () => purchaseMachine("primitiveUpgrader"));
elements.buyConveyorButton.addEventListener("click", () => purchaseMachine("conveyor"));
elements.buyRockShackButton.addEventListener("click", () => purchaseMachine("rockShack"));
elements.buyClayKilnButton.addEventListener("click", () => purchaseMachine("clayKiln"));
elements.buyIngotMolderButton.addEventListener("click", () => purchaseMachine("ingotMolder"));
elements.buyRefractoryCasterButton.addEventListener("click", () => purchaseMachine("refractoryCaster"));
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
elements.buyGearPressButton.addEventListener("click", () => purchaseMachine("gearPress"));
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
elements.recipeMachineSearch?.addEventListener("input", renderRecipes);
elements.recipeMachineFilter?.addEventListener("change", renderRecipes);
elements.recipeMachineSearch?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    elements.recipeMachineSearch.value = "";
    renderRecipes();
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
document.addEventListener("keydown", handleFactoryKeyDown);

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

}
