"use strict";

// Screen rendering, UI actions, formatting, and save import/export controls.

function setActiveView(view) {
  const requestedViewExists = Array.from(elements.views).some((section) => section.dataset.view === view);
  if (!requestedViewExists) {
    return;
  }

  // A hidden Phaser canvas keeps rendering at display rate. Recreate it when the
  // player comes back instead of spending CPU on a factory that cannot be seen.
  const leavingFactory = activeView === "factory" && view !== "factory";
  if (leavingFactory) {
    factorySelectionDrag = null;
    factoryTapSelection = null;
  }
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

  document.title = "Hamster Miners";
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

function normalizeRecipeMachineSearch(query) {
  return String(query ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getRecipeMachineName(recipe) {
  // Modes belong to the same machine, not to separate filter entries.
  return recipe.machine.split("·")[0].trim();
}

function getRecipeMachineOptions(query = "", recipes = CRAFTING_RECIPES) {
  const search = normalizeRecipeMachineSearch(query);
  const rank = (name) => {
    const normalized = normalizeRecipeMachineSearch(name);
    return normalized === search ? -2 : normalized.startsWith(search) ? -1 : normalized.indexOf(search);
  };
  return [...new Set(recipes.map(getRecipeMachineName))]
    .filter((name) => normalizeRecipeMachineSearch(name).includes(search))
    .sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}

function getFilteredCraftingRecipes(query = "", machineName = "", recipes = CRAFTING_RECIPES) {
  const options = getRecipeMachineOptions(query, recipes);
  const order = new Map(options.map((name, index) => [name, index]));
  const filtered = recipes.filter((recipe) => {
    const name = getRecipeMachineName(recipe);
    return order.has(name) && (!machineName || name === machineName);
  });
  // Keep the catalogue's normal order unless the user is searching for matches.
  return normalizeRecipeMachineSearch(query)
    ? filtered.sort((left, right) => order.get(getRecipeMachineName(left)) - order.get(getRecipeMachineName(right)))
    : filtered;
}

function renderRecipes() {
  if (!elements.recipesList) return;
  const query = elements.recipeMachineSearch?.value ?? "";
  const options = getRecipeMachineOptions(query);
  const requestedMachine = elements.recipeMachineFilter?.value ?? "";
  const selectedMachine = options.includes(requestedMachine) ? requestedMachine : "";
  const signature = JSON.stringify([normalizeRecipeMachineSearch(query), selectedMachine]);
  if (elements.recipesList.dataset.filterSignature === signature) return;

  if (elements.recipeMachineFilter) {
    const optionsSignature = JSON.stringify(options);
    if (elements.recipeMachineFilter.dataset.optionsSignature !== optionsSignature) {
      const optionFragment = document.createDocumentFragment();
      ["", ...options].forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name || "All matching machines";
        optionFragment.append(option);
      });
      elements.recipeMachineFilter.replaceChildren(optionFragment);
      elements.recipeMachineFilter.dataset.optionsSignature = optionsSignature;
    }
    elements.recipeMachineFilter.value = selectedMachine;
  }

  const fragment = document.createDocumentFragment();
  const recipes = getFilteredCraftingRecipes(query, selectedMachine);
  recipes.forEach((recipe) => {
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
  elements.recipesList.dataset.filterSignature = signature;
  if (elements.recipeFilterStatus) {
    elements.recipeFilterStatus.textContent = recipes.length
      ? `${recipes.length} recipe${recipes.length === 1 ? "" : "s"} · ${selectedMachine || `${options.length} machines`}`
      : `No machines match “${query.trim()}”.`;
  }
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
  elements.refractoryCasterInventoryCount.textContent = `Stored: ${formatNumber(inventory.refractoryCaster)}`;
  elements.graphiteCopperAnnealerInventoryCount.textContent = `Stored: ${formatNumber(inventory.graphiteCopperAnnealer)}`;
  elements.graniteProcessorInventoryCount.textContent = `Stored: ${formatNumber(inventory.graniteProcessor)}`;
  elements.bronzeStampInventoryCount.textContent = `Stored: ${formatNumber(inventory.bronzeStamp)}`;
  elements.bronzePillarsInventoryCount.textContent = `Stored: ${formatNumber(inventory.bronzePillars)}`;
  elements.extruderInventoryCount.textContent = `Stored: ${formatNumber(inventory.extruder)}`;
  elements.leekFiberExtractorInventoryCount.textContent = `Stored: ${formatNumber(inventory.leekFiberExtractor)}`;
  elements.contactMakerInventoryCount.textContent = `Stored: ${formatNumber(inventory.contactMaker)}`;
  elements.miniElectricArcFurnaceInventoryCount.textContent = `Stored: ${formatNumber(inventory.miniElectricArcFurnace)}`;
  elements.metalPressInventoryCount.textContent = `Stored: ${formatNumber(inventory.metalPress)}`;
  elements.gearPressInventoryCount.textContent = `Stored: ${formatNumber(inventory.gearPress)}`;
  if (elements.aggregateMixerInventoryCount) elements.aggregateMixerInventoryCount.textContent = `Stored: ${formatNumber(inventory.aggregateMixer)}`;
  if (elements.hotFluidPipeInventoryCount) elements.hotFluidPipeInventoryCount.textContent = `Stored: ${formatNumber(inventory.hotFluidPipe)}`;
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
  elements.selectRefractoryCasterButton.disabled = inventory.refractoryCaster <= 0;
  elements.selectGraphiteCopperAnnealerButton.disabled = inventory.graphiteCopperAnnealer <= 0;
  elements.selectGraniteProcessorButton.disabled = inventory.graniteProcessor <= 0;
  elements.selectBronzeStampButton.disabled = inventory.bronzeStamp <= 0;
  elements.selectBronzePillarsButton.disabled = inventory.bronzePillars <= 0;
  elements.selectExtruderButton.disabled = inventory.extruder <= 0;
  elements.selectLeekFiberExtractorButton.disabled = inventory.leekFiberExtractor <= 0;
  elements.selectContactMakerButton.disabled = inventory.contactMaker <= 0;
  elements.selectMiniElectricArcFurnaceButton.disabled = inventory.miniElectricArcFurnace <= 0;
  elements.selectMetalPressButton.disabled = inventory.metalPress <= 0;
  elements.selectGearPressButton.disabled = inventory.gearPress <= 0;
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
    if (Object.hasOwn(GEAR_DEFINITIONS, material)) {
      visual.classList.add("is-gear", `is-${GEAR_DEFINITIONS[material].mode}-gear`);
      visual.style.setProperty("--gear-color", `#${GEAR_DEFINITIONS[material].color.toString(16).padStart(6, "0")}`);
    }
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
  if (elements.pipePlacementControls) {
    elements.pipePlacementControls.hidden = machineId !== "hotFluidPipe";
    const stored = state.machineInventoryInstances.find((machine) => machine.id === "hotFluidPipe");
    elements.pipePlacementMode.value = stored ? getHotFluidPipeMode(stored) : selectedPipePlacementMode;
    elements.pipePlacementTurnSide.value = stored?.turnSide ?? selectedPipeTurnSide;
  }
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

  if (machine.id === "miniElectricArcFurnace") {
    // Production changes only its live status, not the recipe control structure.
    return `${getArcFurnaceMode(machine)}|${machine.orientation ?? "right"}`;
  }

  const casingCargoState = machine.id === "casingMachine"
    ? getInternalConveyorTiles(machine).map((_conveyor, index) => {
      const item = getConveyorItem(getInternalConveyor(machine, index));
      return item
        ? `${index}:${item.kind}:${item.type ?? item.material}:${item.quantity}:${item.casingMaterial ?? ""}`
        : `${index}:empty`;
    }).join(",")
    : "";
  const casingLiquidState = machine.id === "casingMachine"
    ? (() => {
      const available = getCasingMachineAvailableLiquid(machine);
      // Quantities update the existing status node, not the mode buttons.
      return available.material ?? "";
    })()
    : "";

  return [
    state.dusterJob?.material ?? "",
    state.kilnJobs.map((job) => job.kilnInstanceId).join(","),
    state.kilnInputs.map((input) => input.kilnInstanceId).join(","),
    state.molderJobs.map((job) => job.molderInstanceId).join(","),
    machine.id === "ingotMolder" ? state.molderClayBuffers[machine.instanceId] ?? 0 : "",
    JSON.stringify(state.molderOutputBuffers[machine.instanceId] ?? {}),
    state.arcFurnaceJobs.map((job) => job.furnaceInstanceId).join(","),
    JSON.stringify(state.arcFurnaceOutputBuffers[machine.instanceId] ?? {}),
    machine.mode ?? "",
    machine.turnSide ?? "",
    machine.id === "aggregateMixer" ? JSON.stringify(state.aggregateMixerInputs[machine.instanceId] ?? {}) : "",
    machine.id === "aggregateMixer" ? Boolean(state.aggregateMixerJobs[machine.instanceId]) : "",
    machine.stackSize ?? "",
    JSON.stringify(state.arcFurnaceInputs[machine.instanceId] ?? {}),
    JSON.stringify(state.stackerBuffers[machine.instanceId] ?? {}),
    JSON.stringify(state.gearPressInputs[machine.instanceId] ?? {}),
    machine.id === "gearPress"
      ? getInternalConveyorTiles(machine).map((conveyor) => {
        const item = getConveyorItem(conveyor);
        return item ? `${item.material}:${item.quantity}` : "empty";
      }).join(",")
      : "",
    casingCargoState,
    casingLiquidState,
  ].join("|");
}

function getMachineActionProgressNote(machine) {
  if (machine?.id === "aggregateMixer") {
    const job = state.aggregateMixerJobs[machine.instanceId];
    const buffer = state.aggregateMixerInputs[machine.instanceId] ?? {};
    return job ? `Mixing: ${formatQuantity(job.secondsRemaining)}s.`
      : `Limestone ${formatQuantity(buffer.limestone ?? 0)} / 40 · Chert ${formatQuantity(buffer.chert ?? 0)} / 20.`;
  }
  if (machine?.id === "hotFluidPipe") {
    return getHotFluidPipeNetwork().nodes.get(machine.instanceId)?.sealed
      ? "Network sealed · 30 fluid weight/s. Blocked exits are skipped."
      : "Network stopped: an output is open. Connect a destination or add a cap.";
  }
  if (machine?.id === "gearPress") {
    const pending = state.gearPressInputs[machine.instanceId];
    const output = getConveyorItem(getInternalConveyor(machine, getMachineProcessLaneIndex(machine)));
    if (output) {
      return `${formatNumber(output.quantity)} ${MATERIAL_LABELS[output.material]} on the output conveyor.`;
    }
    return pending
      ? `Holding ${formatNumber(pending.quantity)} ${MATERIAL_LABELS[pending.material]}${getGearPressMode(machine) === "heavy" ? "; waiting for another matching plate" : ""}.`
      : "Waiting for metal plates.";
  }
  if (machine?.id === "clayKiln") {
    const kilnJob = state.kilnJobs.find((job) => job.kilnInstanceId === machine.instanceId);
    const hasInput = state.kilnInputs.some((input) => input.kilnInstanceId === machine.instanceId);
    const kilnLiquids = state.moltenCopper.filter((liquidMetal) => (
      getMoltenMetalOwnerInstanceId(liquidMetal) === machine.instanceId
        && Math.max(0, Number(liquidMetal.quantity ?? 1) || 0) > 0
    ));
    const liquidLabels = [...new Set(kilnLiquids.map(({ material }) => (
      MATERIAL_LABELS[material] ?? material ?? "unknown metal"
    )))];
    return kilnJob
      ? `Smelting: ${formatNumber(kilnJob.secondsRemaining)}s · 2 crew assigned.`
      : liquidLabels.length > 0
        ? `${liquidLabels.length === 1 ? `Liquid ${liquidLabels[0]} is` : `Liquid metals (${liquidLabels.join(", ")}) are`} waiting for an adjacent Ingot Molder, Refractory Caster, Bullet Core Caster, Jacket Former, or Casing Machine.`
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
    const linkedLiquidIndex = link ? findMoltenCopperIndex(link.kiln.instanceId) : -1;
    const linkedLiquid = linkedLiquidIndex >= 0 ? state.moltenCopper[linkedLiquidIndex] : null;
    const hasLinkedLiquid = Boolean(linkedLiquid);
    const bufferedClay = state.molderClayBuffers[machine.instanceId] ?? 0;
    return molderJob
      ? molderJob.secondsRemaining <= 0
        ? "Finished ingot is waiting for its output lane to clear."
        : `Molding: ${formatNumber(molderJob.secondsRemaining)}s · 1 crew assigned${molderJob.material === "iron" ? " · Clay mold used" : ""}.`
      : outputBuffer
        ? "Finished ingot is waiting for its output lane to clear."
        : !link
          ? "Place this machine directly in front of a Clay Kiln liquid outlet."
          : outputBlocked
            ? "Its output lane is occupied. Move the ingot onward before molding another."
            : !hasLinkedLiquid
              ? "Waiting for liquid metal."
              : linkedLiquid.material === "iron" && !hasAtLeastQuantity(bufferedClay, 1)
                ? `Waiting for 1 Clay for the Iron mold · ${formatNumber(bufferedClay)} buffered.`
              : getAvailableCrew() < 1
                ? "Waiting for 1 available crew hamster."
                : `Crew will mold the next ingot in its reusable mold${bufferedClay > 0 ? ` · ${formatNumber(bufferedClay)} Clay buffered` : ""}.`;
  }

  if (machine?.id === "refractoryCaster") {
    const link = getMolderKilnLink(machine, "liquidInput");
    const job = state.molderJobs.find((candidate) => candidate.molderInstanceId === machine.instanceId);
    const outputConveyor = getInternalConveyor(machine, 0);
    const outputBlocked = Boolean(outputConveyor && getConveyorItem(outputConveyor));
    const outputBuffer = state.molderOutputBuffers[machine.instanceId];
    const liquidIndex = link ? findMoltenCopperIndex(link.kiln.instanceId) : -1;
    const liquid = liquidIndex >= 0 ? state.moltenCopper[liquidIndex] : null;
    const availableQuantity = liquid
      ? Math.max(0, Math.floor(Number(liquid.quantity ?? 1) || 0))
      : 0;
    const hasBatch = liquid
      && MOLDER_METAL_ORES.includes(liquid.material)
      && availableQuantity > 0;
    const metalLabel = liquid ? MATERIAL_LABELS[liquid.material] ?? liquid.material : "metal";
    return job
      ? job.secondsRemaining <= 0
        ? "Finished ingots are waiting for the output lane to clear."
        : `Molding ${formatNumber(job.quantity)} ${MATERIAL_LABELS[job.material] ?? job.material} Ingots: ${formatNumber(job.secondsRemaining)}s.`
      : outputBuffer
        ? "Finished ingots are waiting for the output lane to clear."
        : !link
          ? "Place its Input tile directly against a smelter's liquid outlet."
              : outputBlocked
                ? "Its output lane is occupied. Move the ingots onward before molding another batch."
                : !hasBatch
                  ? "Waiting for supported liquid metal."
                  : `Ready to mold ${formatNumber(Math.min(4, availableQuantity))} ${metalLabel}.`;
  }

  if (machine?.id === "miniElectricArcFurnace") {
    const job = state.arcFurnaceJobs.find((candidate) => (
      candidate.furnaceInstanceId === machine.instanceId
    ));
    const bufferedLiquids = state.moltenCopper.filter((liquidMetal) => (
      getMoltenMetalOwnerInstanceId(liquidMetal) === machine.instanceId
        && Math.max(0, Number(liquidMetal.quantity ?? 1) || 0) > 0
    ));
    const bufferedByMaterial = new Map();
    bufferedLiquids.forEach(({ material, quantity }) => {
      bufferedByMaterial.set(
        material,
        (bufferedByMaterial.get(material) ?? 0) + Math.max(0, Number(quantity ?? 1) || 0),
      );
    });
    const mode = getArcFurnaceMode(machine);
    const recipeOption = ARC_FURNACE_RECIPE_OPTIONS.find((option) => option.value === mode);
    return job
      ? `Processing ${recipeOption?.label ?? "metal"}: ${formatNumber(job.secondsRemaining)}s · 1 crew assigned.`
      : bufferedByMaterial.size > 0
        ? `Liquid output at outlet: ${[...bufferedByMaterial.entries()]
          .map(([material, quantity]) => `${MATERIAL_LABELS[material] ?? material ?? "unknown metal"} ${formatNumber(quantity)}`)
          .join(", ")}.`
      : getAvailableCrew() < 1
        ? "Waiting for 1 available crew hamster."
        : mode === "smelting"
          ? "Waiting for the next primary input."
          : "Waiting for the selected recipe's inputs.";
  }

  if (machine?.id === "casingMachine") {
    const inputItem = getConveyorItem(getInternalConveyor(machine, 0));
    const transformerItem = getConveyorItem(getInternalConveyor(machine, 1));
    const outputItem = getConveyorItem(getInternalConveyor(machine, 2));
    const liquid = getCasingMachineAvailableLiquid(machine);
    if (transformerItem && !transformerItem.casingMaterial) {
      const required = Number(transformerItem.quantity) / BUCKSHOT_INPUT_ROUNDS;
      return !liquid.link
        ? "Place either side-center liquid input against a smelter outlet."
        : liquid.quantity < required
          ? `Transformer waiting for ${formatNumber(required)} liquid ${liquid.material ?? "casing metal"} (${formatNumber(liquid.quantity)} available).`
          : "Casing is ready; the completed stack will move onto the output lane.";
    }
    if (outputItem) {
      return `Output lane carries ${formatNumber(outputItem.quantity)} ${outputItem.type === "buckshot" ? "Buckshot" : "cased Rapidfire"} rounds.`;
    }
    if (inputItem) {
      return `Input lane carries ${formatNumber(inputItem.quantity)} Rapidfire rounds toward the transformer.`;
    }
    return "Waiting for a complete Rapidfire stack on the input conveyor.";
  }

  return null;
}

function updateMachineActionProgressNote(machine) {
  const noteKey = {
    clayKiln: "kiln-progress",
    ingotMolder: "molder-progress",
    refractoryCaster: "refractory-caster-progress",
    miniElectricArcFurnace: "arc-furnace-progress",
    casingMachine: "casing-machine-progress",
    aggregateMixer: "aggregate-mixer-progress",
    hotFluidPipe: "hot-fluid-pipe-progress",
  }[machine?.id];
  if (!noteKey || !elements.machineActions) {
    return;
  }
  const note = elements.machineActions.querySelector(
    `[data-machine-action-note="${noteKey}"]`,
  );
  const text = getMachineActionProgressNote(machine);
  if (note && text !== null) {
    setTextContentIfChanged(note, text);
  }
}

function getFactoryInteractionControlState() {
  const machine = selectedFactoryEntity?.type === "machine"
    ? getMachineByInstanceId(selectedFactoryEntity.instanceId)
    : null;
  const canRotateSelection = selectedFactoryEntity?.type === "conveyor"
    ? Boolean(getPlacedConveyor(selectedFactoryEntity.column, selectedFactoryEntity.row))
      && !isFactoryEntityInTransit(selectedFactoryEntity)
    : Boolean(machine?.movable) && !isMachineBusy(machine)
      && !isFactoryEntityInTransit(selectedFactoryEntity);
  const visible = activeView === "factory" && Boolean(
    factoryTapSelection || selectedBuildTool || groupMoveState || selectedFactoryEntities.length,
  );
  const canRotate = !factoryTapSelection && Boolean(
    selectedBuildTool || groupMoveState || canRotateSelection,
  );
  let cancelLabel = "Clear selection";
  let help = "Q / E rotates. Press Shift, then tap two corners to box-select.";
  if (factoryTapSelection) {
    cancelLabel = "Cancel selection";
    help = factoryTapSelection.startTile
      ? "Tap the opposite corner to finish selecting."
      : "Tap the first corner of your selection.";
  } else if (groupMoveState) {
    cancelLabel = "Cancel move";
    help = "Tap a green position to place the group. Q / E or Rotate turns it.";
  } else if (selectedBuildTool) {
    cancelLabel = "Cancel placement";
    help = `Tap to place ${getMachineDisplayName(selectedBuildTool)}. Q / E or Rotate turns it.`;
  }
  return { visible, canRotate, cancelLabel, help };
}

function renderFactoryInteractionControls() {
  if (!elements.factoryInteractionControls) {
    return;
  }
  const controls = getFactoryInteractionControlState();
  const signature = JSON.stringify(controls);
  if (signature === lastFactoryInteractionControlsSignature) {
    return;
  }
  lastFactoryInteractionControlsSignature = signature;
  elements.factoryInteractionControls.hidden = !controls.visible;
  elements.rotateFactoryInteractionButton.disabled = !controls.canRotate;
  setTextContentIfChanged(elements.cancelFactoryInteractionButton, controls.cancelLabel);
  setTextContentIfChanged(elements.factoryInteractionHelp, controls.help);
}

function bindFactoryInteractionControls() {
  [elements.cancelFactoryInteractionButton, elements.rotateFactoryInteractionButton].forEach((button) => {
    if (button) {
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
    }
  });
  if (elements.cancelFactoryInteractionButton) {
    bindImmediateAction(elements.cancelFactoryInteractionButton, cancelFactoryInteraction);
  }
  if (elements.rotateFactoryInteractionButton) {
    bindImmediateAction(elements.rotateFactoryInteractionButton, () => rotateSelectedBuild("clockwise"));
  }
}

function renderFactoryMachineControls() {
  renderFactoryInteractionControls();
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
  const entityHasCargo = ["materialStorage", "miniElectricArcFurnace"].includes(machine?.id)
    ? false : isFactoryEntityInTransit(entity);
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
    elements.machineSelectionHelp.textContent = "Tap a green position to place the group. Cancel move, Escape or × cancels.";
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
    elements.machineSelectionHelp.textContent = "Press Shift, then tap two corners to box-select. Hold Shift on a corner to add pieces, or drag from an empty tile.";
    elements.pickUpMachineButton.textContent = `Pick up ${selectionCount} pieces`;
    elements.pickUpMachineButton.disabled = !canPickUpSelectedFactoryEntities(records);
    elements.moveMachineButton.textContent = `Move ${selectionCount} pieces`;
    elements.moveMachineButton.disabled = records.length !== selectionCount;
    return;
  }

  if (entity.type === "conveyor") {
    elements.selectedMachineLabel.textContent = "Conveyor selected";
    elements.machineSelectionHelp.textContent = "Press Shift, then tap two corners to box-select, or drag from an empty tile.";
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
  elements.machineSelectionHelp.textContent = "Q / E or Rotate turns the selected building. Press Shift, then tap two corners to box-select.";
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
      addMachineActionNote("Place an Ingot Molder or Refractory Caster input tile, or either Bullet Core Caster side-center liquid input, directly beside it with the same facing.");
    }
    return;
  }

  if (machine.id === "ingotMolder") {
    const link = getMolderKilnLink(machine);
    const linked = Boolean(link);
    addMachineActionNote(getMachineActionProgressNote(machine), "molder-progress");
    addMachineActionNote("Feed Clay into its other tile; each Iron ingot consumes one Clay mold. Other metals use the reusable mold.");
    addMachineActionNote("Completed ingots leave through its marked output lane; connect a conveyor in its facing direction.");
  }

  if (machine.id === "refractoryCaster") {
    addMachineActionNote(getMachineActionProgressNote(machine), "refractory-caster-progress");
    addMachineActionNote("Its installed reusable mold casts up to four ingots from a supported liquid metal every 2 seconds without crew; smaller available quantities are molded as they arrive.");
    addMachineActionNote("Place its Input tile directly against a smelter's liquid outlet; connect a conveyor to its marked Output tile.");
  }

  if (machine.id === "graphiteCopperAnnealer") {
    addMachineActionNote("Mineral ammo gains ×1.7 damage. Fresh Copper Wires, metal Plates, and Contacts gain ×1.7 value once; ores and ingots are not accepted.");
    addMachineActionNote("Speed 2. Connect one input and output line through its center transformer tile.");
  }

  if (machine.id === "graniteProcessor") {
    addMachineActionNote("No crew required. Sellable materials with base value $1 or more and current value from $10 to under $50 are processed at ×1.3 value.");
    addMachineActionNote("Two horizontal processing lanes; each processor applies its value change as the item passes through.");
  }

  if (machine.id === "bronzeStamp") {
    addMachineActionNote("No crew required. Sellables with base value $8 or more and current value from $150 to under $750 gain $100 value, up to 6 times per item.");
    addMachineActionNote("Its centre conveyor runs at speed 5.");
  }

  if (machine.id === "bronzePillars") {
    addMachineActionNote("No crew required. Sellables with base value $20 or more and current value under $50k gain ×1.4 once per item.");
    addMachineActionNote("Its central pass-through tile uses the default conveyor speed.");
  }

  if (machine.id === "extruder") {
    addMachineActionNote("No crew required. Wire mode turns each copper ingot into 5 copper wires, each worth 50% of the ingot's current value.");
    addMachineActionNote("Three horizontal conveyor cells carry items straight through.");
  }

  if (machine.id === "miniElectricArcFurnace") {
    const mode = getArcFurnaceMode(machine);
    const recipeSelectLabel = document.createElement("label");
    recipeSelectLabel.className = "machine-action-recipe-label";
    recipeSelectLabel.textContent = "Recipe";
    const recipeSelect = document.createElement("select");
    recipeSelect.className = "button button-secondary machine-action-recipe-select";
    recipeSelect.setAttribute("aria-label", "Mini Electric Arc Furnace recipe");
    ARC_FURNACE_RECIPE_OPTIONS.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      recipeSelect.append(option);
    });
    recipeSelect.value = mode;
    recipeSelect.addEventListener("change", () => {
      if (!switchArcFurnaceMode(machine, recipeSelect.value)) {
        return;
      }
      saveGame();
      render();
    });
    recipeSelectLabel.append(recipeSelect);
    elements.machineActions.append(recipeSelectLabel);

    const selectedRecipeOption = ARC_FURNACE_RECIPE_OPTIONS.find((option) => option.value === mode);
    addMachineActionNote(`Selected: ${selectedRecipeOption?.description ?? "single-metal smelting"}.`);
    const alloyRecipe = ARC_FURNACE_RECIPES[mode];
    addMachineActionNote(alloyRecipe
      ? `Uses 1 crew and takes ${alloyRecipe.inputCount * 2} seconds per batch.`
      : "Uses 1 crew. Single smelting accepts one ore or ingot through the primary input and takes 2 seconds. Two Hematite make liquid Iron, while two Clay fire directly into Ceramic; both take 4 seconds. Both alloy inputs are unused.");

    addMachineActionNote(
      getMachineActionProgressNote(machine),
      "arc-furnace-progress",
    );
    addMachineActionNote("Recipes can always be changed. Switching discards this furnace's buffered inputs and liquid output, and cancels its in-progress batch; completed Ceramic output is kept.");
    const outlet = getMachinePort(machine, "liquidOutput");
    if (outlet?.direction) {
      addMachineActionNote(`Its output feeds the adjacent tile ${outlet.direction}. Liquid metal can feed an Ingot Molder, Refractory Caster, Bullet Core Caster, Jacket Former, or Casing Machine; fired Ceramic goes to a conveyor.`);
      addMachineActionNote("Place an Ingot Molder input/output tile directly beside it with the same facing for liquid metal recipes.");
    }
  }

  if (machine.id === "metalPress") {
    addMachineActionNote("No crew required. Presses one ingot into one matching metal plate without changing its value.");
    addMachineActionNote("Its two horizontal conveyor cells run at speed 5; the second cell is the pressing transformer lane.");
  }

  if (machine.id === "gearPress") {
    const mode = getGearPressMode(machine);
    GEAR_PRESS_MODES.forEach((value) => {
      const label = value === "heavy" ? "Heavy Gear" : "Fine Gear";
      addMachineAction(
        `${label}${mode === value ? " (selected)" : ""}`,
        () => {
          if (switchGearPressMode(machine, value)) {
            saveGame();
            render();
          }
        },
        mode === value,
      );
    });
    addMachineActionNote(mode === "heavy"
      ? "Two matching metal plates make one Heavy Gear."
      : "One metal plate makes two Fine Gears.");
    addMachineActionNote("No crew required. Total input value is preserved.");
    addMachineActionNote(getMachineActionProgressNote(machine), "gear-press-progress");
  }

  if (machine.id === "aggregateMixer") {
    addMachineActionNote("Either input accepts Limestone or Chert. Each batch uses 40 Limestone and 20 Chert to make 10 Aggregate in 10 seconds. No crew required.");
    addMachineActionNote(getMachineActionProgressNote(machine), "aggregate-mixer-progress");
  }
  if (machine.id === "hotFluidPipe") {
    Object.entries(HOT_FLUID_PIPE_MODES).forEach(([mode, label]) => addMachineAction(
      `${label}${getHotFluidPipeMode(machine) === mode ? " (selected)" : ""}`,
      () => { if (switchHotFluidPipeMode(machine, mode)) { saveGame(); render(); } }, getHotFluidPipeMode(machine) === mode,
    ));
    if (getHotFluidPipeMode(machine) === "turn") {
      ["left", "right"].forEach((side) => addMachineAction(`Turn ${side}${machine.turnSide === side ? " (selected)" : ""}`,
        () => { switchHotFluidPipeMode(machine, "turn", side); saveGame(); render(); }, machine.turnSide === side));
    }
    addMachineActionNote(getMachineActionProgressNote(machine), "hot-fluid-pipe-progress");
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
    const mode = getCasingMachineMode(machine);
    const inputItem = getConveyorItem(getInternalConveyor(machine, 0));
    const transformerItem = getConveyorItem(getInternalConveyor(machine, 1));
    const outputItem = getConveyorItem(getInternalConveyor(machine, 2));
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
          switchCasingMachineMode(machine, value);
        },
        selected,
      );
      if (selected) {
        addMachineActionNote(`Selected: ${description}.`);
      }
    });
    addMachineActionNote("No crew required. Ammo moves on the three physical conveyors; casing metal must arrive as liquid through either side-center input. Each 25 rounds uses 1 liquid unit.");
    addMachineActionNote("Mode changes affect uncased ammo currently on the machine's conveyors.");
    if (inputItem) {
      addMachineActionNote(`Input conveyor: ${formatNumber(inputItem.quantity)} Rapidfire rounds.`);
    }
    if (transformerItem) {
      addMachineActionNote(`Transformer: ${formatNumber(transformerItem.quantity)} uncased Rapidfire rounds.`);
    }
    if (outputItem) {
      addMachineActionNote(`Output conveyor: ${formatNumber(outputItem.quantity)} ${outputItem.type === "buckshot" ? "Buckshot" : "cased Rapidfire"} rounds.`);
    }
    addMachineActionNote("Bronze currently multiplies damage by ×3.", "casing-machine-progress");
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
    ? `${formatNumber(secondsUntilPlanter)}s`
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
        camera.roundPixels = true;
        camera.setZoom(factoryCameraZoom);
        camera.scrollX = Math.max(
          0,
          (FACTORY_STARTER_COLUMN_OFFSET + LEGACY_FACTORY_COLUMNS / 2) * FACTORY_TILE_SIZE
            - camera.width / (2 * camera.zoom),
        );
        camera.scrollY = 0;
        clampFactoryCameraScroll(camera);
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
          clampFactoryCameraScroll(camera);
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
          const nextScrollX = Number.isFinite(camera.scrollX)
            ? camera.scrollX + horizontalStrength * panSpeed
            : 0;
          const nextScrollY = Number.isFinite(camera.scrollY)
            ? camera.scrollY + verticalStrength * panSpeed
            : 0;
          clampFactoryCameraScroll(camera, nextScrollX, nextScrollY);
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
  clampFactoryCameraScroll(machineScene.cameras.main);
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
  const refractoryCaster = getMachine("refractoryCaster");
  const annealer = getMachine("graphiteCopperAnnealer");
  const graniteProcessor = getMachine("graniteProcessor");
  const bronzeStamp = getMachine("bronzeStamp");
  const bronzePillars = getMachine("bronzePillars");
  const extruder = getMachine("extruder");
  const leekFiberExtractor = getMachine("leekFiberExtractor");
  const contactMaker = getMachine("contactMaker");
  const miniElectricArcFurnace = getMachine("miniElectricArcFurnace");
  const metalPress = getMachine("metalPress");
  const gearPress = getMachine("gearPress");
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
    { machine: refractoryCaster, fill: 0x634b4b, border: 0xe9b0a0, opacity: 0.9 },
    { machine: annealer, fill: 0x3f5360, border: 0x9ed1d0, opacity: 0.9 },
    { machine: graniteProcessor, fill: 0x554d62, border: 0xd0b7f2, opacity: 0.9 },
    { machine: bronzeStamp, fill: 0x6b4d35, border: 0xe7b878, opacity: 0.9 },
    { machine: bronzePillars, fill: 0x6a4d38, border: 0xf0bf7a, opacity: 0.9 },
    { machine: extruder, fill: 0x4e5d46, border: 0xc6e39b, opacity: 0.9 },
    { machine: leekFiberExtractor, fill: 0x52613f, border: 0xd2d99b, opacity: 0.9 },
    { machine: contactMaker, fill: 0x4d5b4a, border: 0xc8e0a1, opacity: 0.9 },
    { machine: miniElectricArcFurnace, fill: 0x4c4b58, border: 0xe0c3ff, opacity: 0.9 },
    { machine: metalPress, fill: 0x5b4d3d, border: 0xe1c38f, opacity: 0.9 },
    { machine: gearPress, fill: 0x484e55, border: 0xc3cbd3, opacity: 0.9 },
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
    ...getMachines("refractoryCaster").slice(1).map((machine) => ({
      machine, fill: 0x634b4b, border: 0xe9b0a0, opacity: 0.9,
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
    ...getMachines("gearPress").slice(1).map((machine) => ({
      machine, fill: 0x484e55, border: 0xc3cbd3, opacity: 0.9,
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
  getMachines("gearPress").forEach((press) => {
    getInternalConveyorTiles(press).forEach((conveyor) => {
      drawConveyorTile(floor, conveyor.column, conveyor.row, conveyor.direction, {
        fillColor: 0x89939d,
        arrowColor: 0x252d34,
      });
    });
  });

  getMachines("aggregateMixer").forEach((mixer) => {
    const size = getMachineFootprintSize(mixer);
    floor.fillStyle(0x626257, 0.95);
    floor.fillRect(mixer.column * FACTORY_TILE_SIZE + 2, mixer.row * FACTORY_TILE_SIZE + 2,
      size.width * FACTORY_TILE_SIZE - 4, size.height * FACTORY_TILE_SIZE - 4);
    floor.lineStyle(2, 0xd7d2b7, 0.9);
    floor.strokeRect(mixer.column * FACTORY_TILE_SIZE + 2, mixer.row * FACTORY_TILE_SIZE + 2,
      size.width * FACTORY_TILE_SIZE - 4, size.height * FACTORY_TILE_SIZE - 4);
    drawAggregateMixerPorts(floor, mixer, true);
    const center = getMachineLabelCenter(mixer);
    addMachineFloorLabel(scene, center.x, center.y, "AGGREGATE\nMIXER", {
      color: "#e8e4cb", fontFamily: "system-ui, sans-serif", fontSize: "10px", fontStyle: "bold", align: "center",
    });
  });
  getMachines("hotFluidPipe").forEach((pipe) => drawHotFluidPipeTile(floor, pipe, true));
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
  if (refractoryCaster) {
    const casterLabel = getMachineLabelCenter(refractoryCaster);
    addMachineFloorLabel(scene, casterLabel.x, casterLabel.y, `REFRACTORY\nCASTER ${getOrientationSymbol(refractoryCaster.orientation)}`, {
      color: "#ffe1d8",
      fontFamily: "system-ui, sans-serif",
      fontSize: "8px",
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
    ["refractoryCaster", (machine) => `REFRACTORY\nCASTER ${getOrientationSymbol(machine.orientation)}`, "#ffe1d8", 8, 0],
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

  getMachines("gearPress").forEach((press) => {
    const center = getMachineLabelCenter(press);
    addMachineFloorLabel(scene, center.x, center.y, `GEAR\nPRESS ${getOrientationSymbol(press.orientation)}`, {
      color: "#e0e7ef",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 1,
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
  const contact = event?.changedTouches?.[0] ?? event?.touches?.[0] ?? event;
  if (Number.isFinite(contact?.clientX) && Number.isFinite(contact?.clientY)) {
    return { x: contact.clientX, y: contact.clientY };
  }
  const x = pointer?.x;
  const y = pointer?.y;
  const canvas = machineScene?.game?.canvas ?? elements.machineGrid?.querySelector?.("canvas");
  const bounds = canvas?.getBoundingClientRect?.();
  if (bounds && Number.isFinite(x) && Number.isFinite(y)) {
    const width = machineScene?.scale?.width ?? canvas.width ?? bounds.width;
    const height = machineScene?.scale?.height ?? canvas.height ?? bounds.height;
    return { x: bounds.left + x * bounds.width / width, y: bounds.top + y * bounds.height / height };
  }
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
  if (event && factoryOverlayBlockedEvents.has(event)) {
    return false;
  }
  const target = event?.target;
  const path = event?.composedPath?.() ?? [];
  const position = getFactoryPointerScreenPosition(pointer);
  for (const overlay of [controls, elements.factoryInteractionControls]) {
    if (overlay && (path.includes(overlay) || (target && overlay.contains?.(target)))) {
      return false;
    }
    if (overlay?.hidden) {
      continue;
    }
    const bounds = overlay?.getBoundingClientRect?.();
    if (bounds && position
      && position.x >= bounds.left && position.x <= bounds.right
      && position.y >= bounds.top && position.y <= bounds.bottom) {
      return false;
    }
  }
  return true;
}

function bindFactoryOverlayInputGuards() {
  if (factoryOverlayInputGuardsBound || !document.addEventListener) {
    return;
  }
  factoryOverlayInputGuardsBound = true;
  const capture = (event) => {
    const overControls = !shouldFinalizeFactoryMarquee({ event });
    if (event.type === "pointerdown" || event.type === "touchstart") {
      factoryOverlayGestureFromControls = overControls;
      factoryOverlayPointerActive = true;
    } else if (event.type === "mousedown") {
      // A pointer-down action may already have hidden/rebuilt the overlay before
      // its compatibility mouse event arrives on the canvas.
      factoryOverlayGestureFromControls = overControls
        || (factoryOverlayPointerActive && factoryOverlayGestureFromControls);
    }
    const fromControls = overControls || factoryOverlayGestureFromControls;
    if (fromControls) {
      // Phaser can process an event later, after DOM actions changed the panel.
      factoryOverlayBlockedEvents.add(event);
      if (factorySelectionDrag) {
        const wasTapDrag = factorySelectionDrag.tapSelection && factorySelectionDrag.moved;
        factorySelectionDrag = null;
        if (wasTapDrag) factoryTapSelection = null;
        if (!IS_NODE_TEST_ENVIRONMENT) renderFactoryMachineControls();
        renderMachineOverlay();
      }
      if (elements.machineGrid?.contains?.(event.target)
        && ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "contextmenu"].includes(event.type)) {
        event.stopPropagation();
      }
    }
    if (["pointerup", "pointercancel", "touchend", "touchcancel"].includes(event.type)) {
      factoryOverlayPointerActive = false;
    }
  };
  ["pointerdown", "mousedown", "pointerup", "mouseup", "pointercancel",
    "touchstart", "touchend", "touchcancel", "click", "dblclick", "contextmenu"]
    .forEach((type) => document.addEventListener(type, capture, true));
  [elements.machineControls, elements.factoryInteractionControls].forEach((overlay) => {
    if (!overlay) return;
    // Release events still reach Phaser to reset its held-button state; the
    // captured event marker prevents those releases from acting on the grid.
    ["pointerdown", "pointermove", "mousedown", "mousemove", "touchstart", "touchmove", "wheel", "click",
      "dblclick", "contextmenu"].forEach((type) => {
      overlay.addEventListener(type, (event) => event.stopPropagation());
    });
  });
}

function handleFactoryKeyDown(event) {
  const tagName = event.target?.tagName ?? "";
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tagName) || event.target?.isContentEditable) {
    return;
  }
  if (registerRealityShieldCheatKey(event.key)) {
    event.preventDefault();
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "shift") {
    if (!event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && beginFactoryTapSelection()) {
      event.preventDefault();
    }
  } else if (key === "escape") {
    event.preventDefault();
    cancelFactoryInteraction();
  } else if (key === "e") {
    event.preventDefault();
    rotateSelectedBuild("clockwise");
  } else if (key === "q") {
    event.preventDefault();
    rotateSelectedBuild("counterclockwise");
  }
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
  factorySelectionDrag = null;
  factoryTapSelection = null;
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
  if (!tile || !shouldFinalizeFactoryMarquee(pointer)) {
    return;
  }

  factorySelectionDrag = null;

  if (pointer.rightButtonDown?.() || pointer.button === 2) {
    if (factoryTapSelection || groupMoveState) {
      cancelFactoryInteraction();
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

  if (factoryTapSelection) {
    if (factoryTapSelection.startTile) {
      const selection = factoryTapSelection;
      selectFactoryEntitiesInRectangle(
        selection.startTile,
        tile,
        selection.additive || isFactoryPointerAdditive(pointer),
      );
    } else {
      factoryTapSelection.startTile = tile;
      factoryTapSelection.currentTile = tile;
      factoryTapSelection.additive = isFactoryPointerAdditive(pointer);
      // A held mouse drag can still finish the same selection on release.
      factorySelectionDrag = {
        startTile: tile,
        currentTile: tile,
        startPointer: getFactoryPointerScreenPosition(pointer),
        additive: factoryTapSelection.additive,
        tapSelection: true,
        moved: false,
      };
      if (!IS_NODE_TEST_ENVIRONMENT) {
        renderFactoryMachineControls();
      }
    }
    renderMachineOverlay();
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
  if (!shouldFinalizeFactoryMarquee(pointer)) {
    setHoveredFactoryTile(null);
    return;
  }
  const tile = getFactoryTileFromPointer(pointer);
  hoveredFactoryTile = tile;
  if (factoryTapSelection?.startTile && tile) {
    factoryTapSelection.currentTile = tile;
  }
  if (factorySelectionDrag && tile) {
    factorySelectionDrag.currentTile = tile;
    factorySelectionDrag.moved = factorySelectionDrag.moved
      || hasFactoryMarqueeExceededDragThreshold(
        factorySelectionDrag.startPointer,
        getFactoryPointerScreenPosition(pointer),
      );
  }
  renderMachineOverlay();
}

function handleFactoryGridPointerUp(pointer) {
  if (!factorySelectionDrag) {
    return;
  }

  const drag = factorySelectionDrag;
  factorySelectionDrag = null;
  if (drag.tapSelection && !drag.moved) {
    return;
  }
  if (!shouldFinalizeFactoryMarquee(pointer)) {
    if (drag.tapSelection) {
      factoryTapSelection = null;
      if (!IS_NODE_TEST_ENVIRONMENT) {
        renderFactoryMachineControls();
      }
    }
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
    if (!shouldFinalizeFactoryMarquee(pointer)) return;
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
    factoryTapSelection
      ? `${factoryTapSelection.startTile?.column ?? "armed"}:${factoryTapSelection.startTile?.row ?? ""}:${factoryTapSelection.currentTile?.column ?? ""}:${factoryTapSelection.currentTile?.row ?? ""}`
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
  const marquee = factoryTapSelection?.startTile
    ? factoryTapSelection
    : factorySelectionDrag?.moved ? factorySelectionDrag : null;
  if (marquee) {
    const bounds = getFactorySelectionBounds(
      marquee.startTile,
      marquee.currentTile,
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
  if (machine.id === "aggregateMixer") drawAggregateMixerPorts(graphics, machine, isValid);
  if (machine.id === "hotFluidPipe") {
    const stored = state.machineInventoryInstances.find((candidate) => candidate.id === "hotFluidPipe");
    drawHotFluidPipeTile(graphics, { ...machine, mode: stored?.mode ?? selectedPipePlacementMode,
      turnSide: stored?.turnSide ?? selectedPipeTurnSide }, isValid);
  }
  const fillColor = isValid ? 0x4e7180 : 0x713f3a;
  const arrowColor = isValid ? 0xd6f5ff : 0xf1b0a4;
  getInternalConveyorTiles(machine).forEach((conveyor) => {
    drawConveyorTile(graphics, conveyor.column, conveyor.row, conveyor.direction, {
      fillColor,
      arrowColor,
      opacity: 0.82,
    });
  });
  if (machine.id === "ingotMolder") {
    const clayInput = getMachinePort(machine, "clayInput");
    if (clayInput) {
      drawConveyorTile(graphics, clayInput.column, clayInput.row, clayInput.direction, {
        fillColor: isValid ? 0x80684e : 0x713f3a,
        arrowColor: isValid ? 0xe8c89b : 0xf1b0a4,
        opacity: 0.82,
      });
    }
  }
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

function drawAggregateMixerPorts(graphics, mixer, valid) {
  const direction = mixer.orientation ?? "right";
  getMachinePorts(mixer, "materialInputs").forEach((port) => drawConveyorTile(graphics, port.column, port.row, direction, {
    fillColor: valid ? 0x5e706b : 0x713f3a, arrowColor: valid ? 0xdbebe5 : 0xf1b0a4, opacity: 0.9,
  }));
  getInternalConveyorTiles(mixer).forEach((port) => drawConveyorTile(graphics, port.column, port.row, port.direction, {
    fillColor: valid ? 0x4e7180 : 0x713f3a, arrowColor: valid ? 0xd6f5ff : 0xf1b0a4, opacity: 0.9,
  }));
}

function drawHotFluidPipeTile(graphics, pipe, valid) {
  const center = getMachineTileCenter(pipe.column, pipe.row);
  const half = FACTORY_TILE_SIZE / 2;
  const directions = [getOppositeDirection(pipe.orientation ?? "right"), ...getHotFluidPipeOutputDirections(pipe)];
  graphics.lineStyle(9, valid ? 0x555d68 : 0x713f3a, 1);
  directions.forEach((direction) => {
    const vector = DIRECTION_VECTORS[direction];
    graphics.lineBetween(center.x, center.y, center.x + vector.column * half, center.y + vector.row * half);
  });
  graphics.lineStyle(3, valid ? 0xe3a56e : 0xf1b0a4, 1);
  directions.forEach((direction) => {
    const vector = DIRECTION_VECTORS[direction];
    graphics.lineBetween(center.x, center.y, center.x + vector.column * half, center.y + vector.row * half);
  });
  graphics.fillStyle(valid ? 0xe3a56e : 0xf1b0a4, 1);
  graphics.fillCircle(center.x, center.y, getHotFluidPipeMode(pipe) === "cap" ? 6 : 4);
  getHotFluidPipeOutputDirections(pipe).forEach((direction) => {
    const vector = DIRECTION_VECTORS[direction];
    const x = center.x + vector.column * half * 0.65;
    const y = center.y + vector.row * half * 0.65;
    graphics.fillTriangle(x + vector.column * 4, y + vector.row * 4,
      x - vector.row * 3, y + vector.column * 3, x + vector.row * 3, y - vector.column * 3);
  });
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
    if (visualKind === "gear") {
      const radius = GEAR_DEFINITIONS[item.material].mode === "fine" ? 5 : 6;
      machineOverlay.fillCircle(point.x, point.y, radius);
      machineOverlay.fillRect(point.x - radius - 1, point.y - 2, radius * 2 + 2, 4);
      machineOverlay.fillRect(point.x - 2, point.y - radius - 1, 4, radius * 2 + 2);
    } else if (visualKind === "ore") {
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
    if (visualKind === "gear") {
      machineOverlay.strokeCircle(point.x, point.y, GEAR_DEFINITIONS[item.material].mode === "fine" ? 5 : 6);
      machineOverlay.fillStyle(0x20291f, 1);
      machineOverlay.fillCircle(point.x, point.y, 2);
    } else if (visualKind === "ore") {
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
  const cargo = visualKind === "gear"
    ? machineScene.add.circle(x, y, Math.min(width, height) / 2, MATERIAL_COLORS[material], 1)
    : visualKind === "ore"
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
    const clayInput = getMachinePort(molder, "clayInput");
    if (clayInput) {
      drawConveyorTile(graphics, clayInput.column, clayInput.row, clayInput.direction, {
        fillColor: 0x80684e,
        arrowColor: 0xe8c89b,
      });
    }
    drawLiquidPort(getMachinePort(molder, "liquidInputOutput"));
  });
  getMachines("refractoryCaster").forEach((caster) => {
    drawLiquidPort(getMachinePort(caster, "liquidInput"));
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
      ? "Buy Tunnel 3 Rights · $2,000,000"
      : "Tunnel 3 Rights · $2,000,000 needed";
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
  maximumFractionDigits = 100,
  significantDigits = NUMBER_SUFFIX_SIGNIFICANT_DIGITS,
) {
  const parts = getNumberParts(value);
  if (!parts) return typeof value === "number" && !Number.isFinite(value) ? "∞" : String(value);
  if (parts.mantissa === 0) return "0";

  const sign = parts.negative ? "−" : "";
  if (parts.exponent < 3) {
    const plainSignificantDigits = Math.max(1, Math.min(3, Math.floor(significantDigits)));
    if (parts.exponent < -97) {
      const scientificMantissa = Number(parts.mantissa.toPrecision(plainSignificantDigits));
      return `${sign}${formatPlainNumber(
        scientificMantissa,
        plainSignificantDigits - 1,
        plainSignificantDigits - 1,
      )}e${parts.exponent}`;
    }

    const maximumPlainFractionDigits = Math.min(
      100,
      Math.max(0, Math.floor(maximumFractionDigits)),
      Math.max(0, plainSignificantDigits - 1 - parts.exponent),
    );
    const roundedValue = Number((parts.mantissa * 10 ** parts.exponent).toPrecision(plainSignificantDigits));
    if (roundedValue >= 1e3) {
      return `${sign}${formatNumber(roundedValue, maximumFractionDigits, significantDigits)}`;
    }
    return `${sign}${formatPlainNumber(roundedValue, maximumPlainFractionDigits)}`;
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
  return formatNumber(normalized);
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
  lastFactoryInteractionControlsSignature = null;
  lastFactoryOverlaySignature = null;
  selectedBuildTool = null;
  selectedBuildOrientation = "right";
  selectedFactoryEntity = null;
  selectedFactoryEntities = [];
  groupMoveState = null;
  factorySelectionDrag = null;
  factoryTapSelection = null;
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

