// ============================================================================
// TPP Constraint Generator
// ============================================================================
// Generates random constraints (a Rulebook) for a given TPP instance based
// on a ConstraintGenerationConfig. Includes feasibility-preservation logic:
// - Never forbid the sole supplier of a product
// - Never simultaneously require and forbid the same market
// - Sanity check pass after generation
// ============================================================================

import {
  TPPInstance,
  ConstraintGenerationConfig,
  Rulebook,
  IncompatibilityRule,
  ConstraintSeverity,
} from '../types';
import { mulberry32, seededInt } from '../data/generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick a random severity based on config ratios.
 * hardRuleRatio and softRuleRatio define the relative probability.
 */
function pickSeverity(
  config: ConstraintGenerationConfig,
  rng: () => number
): ConstraintSeverity {
  const total = config.hardRuleRatio + config.softRuleRatio;
  if (total === 0) return 'hard';
  return rng() < config.hardRuleRatio / total ? 'hard' : 'soft';
}

/**
 * Pick a random penalty for soft constraints (between 10 and 200).
 */
function pickPenalty(rng: () => number): number {
  return Math.round((10 + rng() * 190) * 100) / 100;
}

/**
 * Pick N unique random items from an array.
 */
function pickRandom<T>(arr: T[], n: number, rng: () => number): T[] {
  if (n >= arr.length) return [...arr];
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = seededInt(rng, 0, copy.length - 1);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

/**
 * Get the set of markets that are the sole supplier for at least one product.
 * These markets should never be forbidden.
 */
function getSoleSupplierMarkets(instance: TPPInstance): Set<string> {
  const soleSuppliers = new Set<string>();
  for (const product of instance.products) {
    const suppliers = instance.markets.filter(
      (m) => m.prices[product.id] !== null && m.prices[product.id] !== undefined
    );
    if (suppliers.length === 1) {
      soleSuppliers.add(suppliers[0].id);
    }
  }
  return soleSuppliers;
}

/**
 * Get products that have exactly one supplier.
 */
function getBottleneckProducts(instance: TPPInstance): Set<string> {
  const bottlenecks = new Set<string>();
  for (const product of instance.products) {
    const suppliers = instance.markets.filter(
      (m) => m.prices[product.id] !== null && m.prices[product.id] !== undefined
    );
    if (suppliers.length <= 1) {
      bottlenecks.add(product.id);
    }
  }
  return bottlenecks;
}

// ---------------------------------------------------------------------------
// Rule ID counter
// ---------------------------------------------------------------------------

let ruleCounter = 0;
function nextRuleId(): string {
  return `r${ruleCounter++}`;
}

// ---------------------------------------------------------------------------
// Individual Constraint Generators
// ---------------------------------------------------------------------------

function generateProductIncompatibilities(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number,
  bottleneckProducts: Set<string>
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];
  const productIds = instance.products
    .map((p) => p.id)
    .filter((id) => !bottleneckProducts.has(id));

  for (let i = 0; i < config.productIncompatibilityCount && productIds.length >= 2; i++) {
    const pair = pickRandom(productIds, 2, rng);
    const severity = pickSeverity(config, rng);
    rules.push({
      id: nextRuleId(),
      name: `Product Incompatibility ${i + 1}`,
      description: `Products ${pair[0]} and ${pair[1]} cannot be purchased at the same market.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'product',
      type: 'products_cannot_share_market',
      enabled: true,
      productIds: pair,
    });
  }
  return rules;
}

function generateMarketIncompatibilities(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number,
  soleSuppliers: Set<string>
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];
  const eligibleMarkets = instance.markets
    .map((m) => m.id)
    .filter((id) => !soleSuppliers.has(id));

  for (let i = 0; i < config.marketIncompatibilityCount && eligibleMarkets.length >= 2; i++) {
    const pair = pickRandom(eligibleMarkets, 2, rng);
    const severity = pickSeverity(config, rng);
    rules.push({
      id: nextRuleId(),
      name: `Market Exclusivity ${i + 1}`,
      description: `Markets ${pair[0]} and ${pair[1]} cannot both be visited.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'market',
      type: 'markets_cannot_both_be_visited',
      enabled: true,
      marketIds: pair,
    });
  }
  return rules;
}

function generateForbiddenEdges(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];
  const marketIds = instance.markets.map((m) => m.id);

  for (let i = 0; i < config.forbiddenEdgeCount && marketIds.length >= 2; i++) {
    const pair = pickRandom(marketIds, 2, rng);
    const severity = pickSeverity(config, rng);
    rules.push({
      id: nextRuleId(),
      name: `Forbidden Route Edge ${i + 1}`,
      description: `Route cannot go directly from ${pair[0]} to ${pair[1]}.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'route',
      type: 'route_forbidden_edge',
      enabled: true,
      edge: { fromMarketId: pair[0], toMarketId: pair[1] },
    });
  }
  return rules;
}

function generateRequiredEdges(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];
  const marketIds = instance.markets.map((m) => m.id);

  for (let i = 0; i < config.requiredEdgeCount && marketIds.length >= 2; i++) {
    const pair = pickRandom(marketIds, 2, rng);
    const severity = pickSeverity(config, rng);
    rules.push({
      id: nextRuleId(),
      name: `Required Route Edge ${i + 1}`,
      description: `Route must include the edge from ${pair[0]} to ${pair[1]}.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'route',
      type: 'route_requires_edge',
      enabled: true,
      edge: { fromMarketId: pair[0], toMarketId: pair[1] },
    });
  }
  return rules;
}

function generatePrecedenceRules(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];
  const marketIds = instance.markets.map((m) => m.id);

  for (let i = 0; i < config.precedenceRuleCount && marketIds.length >= 2; i++) {
    const pair = pickRandom(marketIds, 2, rng);
    const severity = pickSeverity(config, rng);
    rules.push({
      id: nextRuleId(),
      name: `Route Precedence ${i + 1}`,
      description: `Market ${pair[0]} must be visited before market ${pair[1]}.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'route',
      type: 'route_precedence',
      enabled: true,
      orderedPair: { beforeMarketId: pair[0], afterMarketId: pair[1] },
    });
  }
  return rules;
}

function generateBudgetConstraint(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];

  // Estimate a baseline cost: cheapest purchase cost for each product
  let baselinePurchase = 0;
  for (const product of instance.products) {
    let cheapest = Infinity;
    for (const market of instance.markets) {
      const price = market.prices[product.id];
      if (price !== null && price !== undefined && price < cheapest) {
        cheapest = price;
      }
    }
    baselinePurchase += cheapest === Infinity ? 0 : cheapest * product.demand;
  }

  // Rough travel cost estimate (diameter of the market space)
  const xs = instance.markets.map((m) => m.x);
  const ys = instance.markets.map((m) => m.y);
  const diameter = Math.sqrt(
    (Math.max(...xs) - Math.min(...xs)) ** 2 +
    (Math.max(...ys) - Math.min(...ys)) ** 2
  );
  const estimatedTravel = diameter * instance.travelCostMultiplier * 1.5;
  const estimatedTotal = baselinePurchase + estimatedTravel;

  // Budget multiplier based on tightness
  let multiplier: number;
  switch (config.budgetTightness) {
    case 'loose':
      multiplier = 2.0 + rng() * 0.5;
      break;
    case 'medium':
      multiplier = 1.3 + rng() * 0.3;
      break;
    case 'tight':
      multiplier = 1.05 + rng() * 0.15;
      break;
    default:
      multiplier = 2.0;
  }

  const budget = Math.round(estimatedTotal * multiplier * 100) / 100;
  const severity = pickSeverity(config, rng);

  rules.push({
    id: nextRuleId(),
    name: 'Budget Limit',
    description: `Total cost must not exceed ${budget}.`,
    severity,
    penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
    scope: 'solution',
    type: 'budget_limit',
    enabled: true,
    value: budget,
  });

  return rules;
}

function generateMaxMarketsConstraint(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number
): IncompatibilityRule[] {
  if (!config.maxMarketsEnabled) return [];

  // Set max to between nProducts (minimum needed) and nMarkets
  const minPossible = Math.min(instance.products.length, instance.markets.length);
  const maxVal = seededInt(rng, minPossible, instance.markets.length);
  const severity = pickSeverity(config, rng);

  return [
    {
      id: nextRuleId(),
      name: 'Maximum Markets',
      description: `Cannot visit more than ${maxVal} markets.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'solution',
      type: 'max_markets',
      enabled: true,
      value: maxVal,
    },
  ];
}

function generateMinMarketsConstraint(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number
): IncompatibilityRule[] {
  if (!config.minMarketsEnabled) return [];

  // Set min to between 1 and half the number of markets
  const maxPossible = Math.max(1, Math.floor(instance.markets.length / 2));
  const minVal = seededInt(rng, 1, maxPossible);
  const severity = pickSeverity(config, rng);

  return [
    {
      id: nextRuleId(),
      name: 'Minimum Markets',
      description: `Must visit at least ${minVal} markets.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'solution',
      type: 'min_markets',
      enabled: true,
      value: minVal,
    },
  ];
}

function generateMustVisitMarkets(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];
  const marketIds = instance.markets.map((m) => m.id);
  const selected = pickRandom(marketIds, config.mustVisitMarketCount, rng);

  for (let i = 0; i < selected.length; i++) {
    rules.push({
      id: nextRuleId(),
      name: `Must Visit ${selected[i]}`,
      description: `Market ${selected[i]} must be visited.`,
      severity: 'hard',
      scope: 'market',
      type: 'must_visit_market',
      enabled: true,
      marketIds: [selected[i]],
    });
  }
  return rules;
}

function generateForbiddenMarkets(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number,
  soleSuppliers: Set<string>,
  mustVisitIds: Set<string>
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];
  // Don't forbid sole suppliers or markets that are required
  const eligible = instance.markets
    .map((m) => m.id)
    .filter((id) => !soleSuppliers.has(id) && !mustVisitIds.has(id));

  const selected = pickRandom(eligible, config.forbiddenMarketCount, rng);

  for (let i = 0; i < selected.length; i++) {
    rules.push({
      id: nextRuleId(),
      name: `Forbidden Market ${selected[i]}`,
      description: `Market ${selected[i]} cannot be visited.`,
      severity: 'hard',
      scope: 'market',
      type: 'forbidden_market',
      enabled: true,
      marketIds: [selected[i]],
    });
  }
  return rules;
}

function generateForbiddenAssignments(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  rng: () => number,
  bottleneckProducts: Set<string>
): IncompatibilityRule[] {
  const rules: IncompatibilityRule[] = [];

  // Build list of valid (product, market) pairs that could be forbidden
  // but only if the product has at least 2 suppliers (so we don't break feasibility)
  const candidates: Array<{ productId: string; marketId: string }> = [];
  for (const product of instance.products) {
    if (bottleneckProducts.has(product.id)) continue;
    for (const market of instance.markets) {
      const price = market.prices[product.id];
      if (price !== null && price !== undefined) {
        candidates.push({ productId: product.id, marketId: market.id });
      }
    }
  }

  const selected = pickRandom(candidates, config.forbiddenAssignmentCount, rng);

  for (let i = 0; i < selected.length; i++) {
    const { productId, marketId } = selected[i];
    const severity = pickSeverity(config, rng);
    rules.push({
      id: nextRuleId(),
      name: `Forbidden Assignment ${i + 1}`,
      description: `Product ${productId} cannot be purchased at market ${marketId}.`,
      severity,
      penalty: severity === 'soft' ? pickPenalty(rng) : undefined,
      scope: 'purchase',
      type: 'forbidden_purchase_assignment',
      enabled: true,
      productIds: [productId],
      marketIds: [marketId],
    });
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Sanity Check
// ---------------------------------------------------------------------------

/**
 * Post-generation sanity check. Ensures:
 * 1. No market is both required and forbidden.
 * 2. Every product still has at least one non-forbidden supplier.
 */
function sanitizeRulebook(rules: IncompatibilityRule[], instance: TPPInstance): IncompatibilityRule[] {
  // Collect forbidden market IDs (hard constraints only)
  const forbiddenMarkets = new Set<string>();
  const mustVisitMarkets = new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.type === 'forbidden_market' && rule.severity === 'hard' && rule.marketIds?.[0]) {
      forbiddenMarkets.add(rule.marketIds[0]);
    }
    if (rule.type === 'must_visit_market' && rule.severity === 'hard' && rule.marketIds?.[0]) {
      mustVisitMarkets.add(rule.marketIds[0]);
    }
  }

  // 1. Disable any forbidden_market rule that conflicts with a must_visit rule
  for (const rule of rules) {
    if (
      rule.type === 'forbidden_market' &&
      rule.marketIds?.[0] &&
      mustVisitMarkets.has(rule.marketIds[0])
    ) {
      rule.enabled = false;
    }
  }

  // 2. Check each product has at least one non-forbidden supplier
  // Collect hard-forbidden assignments per product
  const forbiddenAssignments = new Map<string, Set<string>>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (
      rule.type === 'forbidden_purchase_assignment' &&
      rule.severity === 'hard' &&
      rule.productIds?.[0] &&
      rule.marketIds?.[0]
    ) {
      const pid = rule.productIds[0];
      if (!forbiddenAssignments.has(pid)) {
        forbiddenAssignments.set(pid, new Set());
      }
      forbiddenAssignments.get(pid)!.add(rule.marketIds[0]);
    }
  }

  for (const product of instance.products) {
    const suppliers = instance.markets.filter((m) => {
      const price = m.prices[product.id];
      if (price === null || price === undefined) return false;
      if (forbiddenMarkets.has(m.id)) return false;
      if (forbiddenAssignments.get(product.id)?.has(m.id)) return false;
      return true;
    });

    if (suppliers.length === 0) {
      // Disable the most recently added forbidden-assignment rule for this product
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (
          r.enabled &&
          r.type === 'forbidden_purchase_assignment' &&
          r.severity === 'hard' &&
          r.productIds?.[0] === product.id
        ) {
          r.enabled = false;
          break; // Disable one at a time and re-check
        }
      }
    }
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Main Generator
// ---------------------------------------------------------------------------

/**
 * Generate a set of random constraints for a TPP instance.
 * The generated Rulebook tries to preserve feasibility by:
 * - Not forbidding sole-supplier markets
 * - Not creating require+forbid conflicts
 * - Running a sanity check after generation
 */
export function generateConstraints(
  instance: TPPInstance,
  config: ConstraintGenerationConfig,
  seed: number
): Rulebook {
  if (!config.enableConstraints) {
    return {
      id: 'generated-empty',
      name: 'No Constraints',
      description: 'Constraint generation is disabled.',
      rules: [],
    };
  }

  // Reset rule counter for deterministic IDs
  ruleCounter = 0;
  const rng = mulberry32(seed);

  const soleSuppliers = getSoleSupplierMarkets(instance);
  const bottleneckProducts = getBottleneckProducts(instance);

  // Generate must-visit first so we can avoid conflicting with forbidden
  const mustVisitRules = generateMustVisitMarkets(instance, config, rng);
  const mustVisitIds = new Set(mustVisitRules.flatMap((r) => r.marketIds ?? []));

  const allRules: IncompatibilityRule[] = [
    ...generateProductIncompatibilities(instance, config, rng, bottleneckProducts),
    ...generateMarketIncompatibilities(instance, config, rng, soleSuppliers),
    ...generateForbiddenEdges(instance, config, rng),
    ...generateRequiredEdges(instance, config, rng),
    ...generatePrecedenceRules(instance, config, rng),
    ...generateBudgetConstraint(instance, config, rng),
    ...generateMaxMarketsConstraint(instance, config, rng),
    ...generateMinMarketsConstraint(instance, config, rng),
    ...mustVisitRules,
    ...generateForbiddenMarkets(instance, config, rng, soleSuppliers, mustVisitIds),
    ...generateForbiddenAssignments(instance, config, rng, bottleneckProducts),
  ];

  // Sanity check: remove conflicting rules
  const sanitizedRules = sanitizeRulebook(allRules, instance);

  return {
    id: `generated-${seed}`,
    name: 'Generated Rulebook',
    description: `Auto-generated constraints (seed=${seed}). ${sanitizedRules.filter((r) => r.enabled).length} active rules.`,
    rules: sanitizedRules.filter((r) => r.enabled),
  };
}
