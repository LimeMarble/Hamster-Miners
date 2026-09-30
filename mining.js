"use strict";

// Ammo selection, combat, tunnel progression, drilling, and simulation ticks.

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
    || !hasOpenConveyorSlot(inputConveyor)
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
        `Tunnel ${tunnel} Band ${completedBands} cleared. Its first layer can now be re-mined with its full deposit pool.`,
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
    && state.cash >= 2e6;
}

function buyTunnelThreeRights() {
  if (!canBuyTunnelThreeRights()) {
    return;
  }

  state.cash -= 2e6;
  state.mine.tunnelThreeRightsPurchased = true;
  if (!state.mine.unlockedTunnels.includes(3)) {
    state.mine.unlockedTunnels.push(3);
  }
  addLog("Tunnel 3 Mining Rights purchased for $2,000,000. Tunnel 3 unlocked.");
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
  startArcFurnaceJobs();
  startKilnJobs();
}

function updateFactory(deltaSeconds) {
  advanceConveyorItems(deltaSeconds);
  flushMolderOutputs();
  flushArcFurnaceOutputs();
  startMolderJob();
  emitStackerOutputs();
  emitStorageOutputs(deltaSeconds);

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

