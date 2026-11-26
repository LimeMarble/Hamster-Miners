(function (root) {
  "use strict";
  const materials = ["clay", "unfiredPot", "pot", "paintedPot"];
  const distribution = [[2, 0.05], [3, 0.15], [4, 0.40], [5, 0.25], [6, 0.15]];
  const weights = {
    unfired: { integrity: 7, regularity: 3, smoothness: 1, purity: 2 },
    fired: { integrity: 4, regularity: 2, smoothness: 4, purity: 3 },
  };
  const grades = [
    { name: "F", min: 0, max: 29, low: 1, high: 1 },
    { name: "E", min: 30, max: 44, low: 1.1, high: 1.4 },
    { name: "D", min: 45, max: 59, low: 1.5, high: 1.8 },
    { name: "C", min: 60, max: 74, low: 2, high: 3 },
    { name: "B", min: 75, max: 89, low: 4, high: 8 },
    { name: "A", min: 90, max: 100, low: 10, high: 50 },
    { name: "S", min: 101, max: 149, low: 1e2, high: 1e8 },
    { name: "T", min: 150, low: 1e10 },
  ];
  const modeled = material => materials.includes(material);
  const cap = value => Math.max(0, Math.min(10, value));
  function shape(workability, purity, spun = false) {
    return { workability, purity, integrity: cap(spun ? workability : 0.6 * workability),
      regularity: cap(spun ? workability + 1 : 1 + 0.3 * workability), smoothness: cap(1 + 0.25 * workability) };
  }
  function defaults(material) {
    if (material === "clay") return { workability: 2, purity: 2 };
    const result = shape(2, 2);
    if (["pot", "paintedPot"].includes(material)) result.integrity = Math.max(0, result.integrity - 2);
    return result;
  }
  const properties = item => item.quality ?? defaults(item.material);
  function valid(item) {
    if (item.quality === undefined) return item.qualityAssessed === undefined;
    const q = item.quality, keys = Object.keys(defaults(item.material));
    return modeled(item.material) && q && typeof q === "object" && !Array.isArray(q)
      && Object.keys(q).length === keys.length
      && keys.every(key => Number.isFinite(q[key]) && q[key] >= 0 && q[key] <= 10)
      && (item.qualityAssessed === undefined || (item.qualityAssessed === true && item.graded === true));
  }
  function draw(roll) {
    let cumulative = 0;
    for (const [value, chance] of distribution) { cumulative = Math.round((cumulative + chance) * 100) / 100; if (roll < cumulative) return value; }
    return 6;
  }
  function score(item) {
    if (!modeled(item?.material)) return null;
    const q = properties(item);
    if (item.material === "clay") return 8 * q.workability + 2 * q.purity;
    return Object.entries(weights[item.material === "unfiredPot" ? "unfired" : "fired"])
      .reduce((sum, [key, weight]) => sum + q[key] * weight, 0);
  }
  function grade(score) {
    // Integer bands select the letter; fractional points retain their cash effect.
    const integer = Math.max(0, Math.floor(score + 1e-8));
    const result = [...grades].reverse().find(entry => integer >= entry.min);
    const multiplier = result.name === "T" ? 10 ** (10 + (score - 150) / 10)
      : result.low * (result.high / result.low) ** Math.max(0, Math.min(1, (score - result.min) / (result.max - result.min)));
    return { ...result, score, multiplier };
  }
  function summary(item) {
    const value = score(item);
    return value === null ? null : { ...grade(value), assessed: Boolean(item.qualityAssessed), properties: { ...properties(item) } };
  }
  function saleValue(item) {
    const result = summary(item);
    return item.value * (result?.assessed ? result.multiplier : 1);
  }
  function spin(item) {
    if (item.material !== "unfiredPot") return item;
    const q = item.quality ??= defaults(item.material);
    q.integrity = cap(q.workability); q.regularity = cap(q.workability + 1);
    return item;
  }
  function burnish(item) {
    if (item.material !== "unfiredPot") return item;
    const q = item.quality ??= defaults(item.material);
    // A target prevents mixing treated/untreated stacks from enabling repeat gains.
    q.smoothness = Math.max(q.smoothness, cap(1 + 0.25 * q.workability + 5));
    item.burnished = true;
    return item;
  }
  function blend(output, inputs) {
    const quantity = inputs.reduce((sum, item) => sum + item.quantity, 0);
    const keys = Object.keys(defaults(output.material));
    output.quality = Object.fromEntries(keys.map(key => [key, inputs.reduce((sum, item) => sum + (properties(item)[key] ?? 0) * item.quantity, 0) / quantity]));
    if (output.material === "unfiredPot" && inputs.every(item => item.material === "clay")) output.quality = shape(output.quality.workability, output.quality.purity);
    if (output.material === "pot" && inputs.every(item => item.material === "unfiredPot")) {
      output.quality.integrity = inputs.reduce((sum, item) => sum + Math.max(0, properties(item).integrity - (item.preheated ? 0 : 2)) * item.quantity, 0) / quantity;
    }
    if (inputs.every(item => item.qualityAssessed)) { output.qualityAssessed = true; output.graded = true; }
    // Legacy assessments already live in value. Keep that historical amount once.
    else if (inputs.some(item => item.graded && !item.qualityAssessed)) output.graded = true;
    return output;
  }
  const API = { materials, distribution, weights, grades, modeled, defaults, properties, valid, draw, shape, score, grade, summary, saleValue, spin, burnish, blend };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.NoAmmoQuality = API;
}(globalThis));
