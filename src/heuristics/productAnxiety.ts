// ============================================================================
// TPP Visualizer — Product Anxiety Construction Heuristic
// ============================================================================
// A construction heuristic that prioritizes products with few purchasing
// options ("anxious" products) and markets that cover them efficiently.
//
// Algorithm overview:
//   1. For each uncovered product, compute anxiety = 1 / (number of markets
//      that sell it at a reasonable price). Products available at fewer markets
//      have higher anxiety — they're "nervous" because their options are limited.
//   2. For each candidate (unselected) market, compute:
//      score = sum_of_anxiety(uncovered products it can cover) / (1 + insertion_cost)
//   3. Pick the highest-scoring market.
//   4. Insert it into the route, assign products optimally.
//   5. Repeat until all products are covered.
//   6. Apply 2-opt improvement.
//   7. Steps display anxiety values for educational purposes.
// ============================================================================

import type {
  TPPInstance,
  Rulebook,
  HeuristicStep,
  Solution,
  PurchaseAssignment,
  Product,
  Market,
} from '../types';
import {
  routeCost,
  purchaseCost,
  computePenaltyCost,
  totalCost,
  getMarketById,
  HARD_VIOLATION_PENALTY,
} from './cost';
import {
  twoOpt,
  computeRouteInsertionCost,
  insertMarketIntoRoute,
  computeBestPurchaseAssignment,
} from './routing';
import { checkRulebook } from './ruleChecker';

// ----------------------------------------------------------------------------
// Helper: Build a Solution object
// ----------------------------------------------------------------------------

function buildSolution(
  route: string[],
  selectedMarkets: string[],
  assignments: PurchaseAssignment[],
  instance: TPPInstance,
  rulebook?: Rulebook
): Solution {
  const travel = routeCost(
    route,
    instance.markets,
    instance.depot,
    instance.travelCostMultiplier
  );
  const purchase = purchaseCost(assignments);
  const violations = rulebook
    ? checkRulebook(rulebook, { route, selectedMarkets, assignments }, instance)
    : [];
  const penalty = computePenaltyCost(violations);
  const allCovered = instance.products.every((p) =>
    assignments.some((a) => a.productId === p.id)
  );

  return {
    route,
    selectedMarkets,
    assignments,
    travelCost: travel,
    purchaseCost: purchase,
    penaltyCost: penalty,
    totalCost: totalCost(travel, purchase, penalty),
    feasible: allCovered && violations.length === 0,
    violations,
  };
}

// ----------------------------------------------------------------------------
// Helper: Compute product anxiety values
// ----------------------------------------------------------------------------

/**
 * Computes "anxiety" for each uncovered product.
 * Anxiety = 1 / (number of markets that sell this product).
 *
 * A product sold at only 1 market has anxiety = 1.0 (very anxious).
 * A product sold at 10 markets has anxiety = 0.1 (very relaxed).
 * A product sold at 0 markets has anxiety = Infinity (critical!).
 *
 * The idea: scarce products should be prioritized because delaying their
 * assignment risks the best option being unavailable (e.g., the needed market
 * is far from the evolving route).
 */
function computeAnxietyValues(
  products: Product[],
  markets: Market[],
  coveredProducts: Set<string>
): Map<string, number> {
  const anxietyMap = new Map<string, number>();

  for (const product of products) {
    if (coveredProducts.has(product.id)) continue;

    // Count how many markets sell this product
    let availableCount = 0;
    for (const market of markets) {
      const price = market.prices[product.id];
      if (price != null) {
        availableCount++;
      }
    }

    // Anxiety inversely proportional to availability
    const anxiety = availableCount > 0 ? 1 / availableCount : Infinity;
    anxietyMap.set(product.id, anxiety);
  }

  return anxietyMap;
}

// ----------------------------------------------------------------------------
// Main Heuristic
// ----------------------------------------------------------------------------

/**
 * Product Anxiety Construction heuristic for the TPP.
 *
 * Markets that cover "anxious" (scarce) products are prioritized. This
 * ensures that products with limited purchasing options are handled early,
 * reducing the risk of expensive fallback assignments later.
 *
 * @param instance - The TPP instance to solve
 * @param rulebook - Optional constraint rulebook
 * @returns Array of HeuristicSteps documenting each decision
 */
export function productAnxietyConstruction(
  instance: TPPInstance,
  rulebook?: Rulebook
): HeuristicStep[] {
  const steps: HeuristicStep[] = [];
  let stepNumber = 0;

  const { depot, markets, products } = instance;

  // Current state
  let currentRoute: string[] = [];
  const selectedSet = new Set<string>();
  let selectedMarkets: string[] = [];
  let assignments: PurchaseAssignment[] = [];
  const coveredProducts = new Set<string>();

  // ---- Step 0: Initialize with anxiety overview ----
  const initialAnxiety = computeAnxietyValues(products, markets, coveredProducts);
  const anxietySummary = products
    .map((p) => {
      const anxiety = initialAnxiety.get(p.id) ?? 0;
      return `${p.name}: ${anxiety === Infinity ? '∞' : anxiety.toFixed(3)}`;
    })
    .join(', ');

  steps.push({
    stepNumber: stepNumber++,
    action: 'Initialize',
    explanation:
      `Starting Product Anxiety Construction. ` +
      `Anxiety = 1/(number of markets selling the product). ` +
      `Initial anxiety values: [${anxietySummary}].`,
    solution: buildSolution([], [], [], instance, rulebook),
  });

  // ---- Main loop ----
  let iterations = 0;
  const maxIterations = markets.length;

  while (coveredProducts.size < products.length && iterations < maxIterations) {
    iterations++;

    // Compute current anxiety values for uncovered products
    const anxietyMap = computeAnxietyValues(products, markets, coveredProducts);

    // Evaluate each unselected market
    let bestMarketId = '';
    let bestScore = -Infinity;
    let bestPosition = 0;
    let bestDelta = 0;
    let bestAnxietySum = 0;
    let bestUncoveredHere: string[] = [];

    for (const market of markets) {
      if (selectedSet.has(market.id)) continue;

      // Compute sum of anxiety of uncovered products this market can cover
      let anxietySum = 0;
      const uncoveredHere: string[] = [];

      for (const product of products) {
        if (coveredProducts.has(product.id)) continue;
        const price = market.prices[product.id];
        if (price != null) {
          const anxiety = anxietyMap.get(product.id) ?? 0;
          anxietySum += anxiety;
          uncoveredHere.push(product.id);
        }
      }

      // Skip markets that don't cover any uncovered products
      if (anxietySum <= 0) continue;

      // Compute insertion cost
      const { position, deltaCost } = computeRouteInsertionCost(
        currentRoute,
        market.id,
        markets,
        depot
      );

      const insertionCost = deltaCost * instance.travelCostMultiplier;

      // Score: anxiety sum relative to insertion cost
      const score = anxietySum / (1 + insertionCost);

      if (score > bestScore) {
        bestScore = score;
        bestMarketId = market.id;
        bestPosition = position;
        bestDelta = deltaCost;
        bestAnxietySum = anxietySum;
        bestUncoveredHere = uncoveredHere;
      }
    }

    // No suitable market found
    if (bestMarketId === '') break;

    // ---- Add the best market ----
    selectedSet.add(bestMarketId);
    selectedMarkets = [...selectedSet];
    currentRoute = insertMarketIntoRoute(
      currentRoute,
      bestMarketId,
      bestPosition
    );

    // Recompute assignments
    assignments = computeBestPurchaseAssignment(
      selectedMarkets,
      products,
      markets
    );

    // Update covered products
    coveredProducts.clear();
    for (const a of assignments) {
      coveredProducts.add(a.productId);
    }

    const bestMarket = getMarketById(bestMarketId, markets);

    // Show anxiety values for the uncovered products at this market
    const anxietyDetails = bestUncoveredHere
      .map((pid) => {
        const p = products.find((pr) => pr.id === pid);
        const anxiety = anxietyMap.get(pid) ?? 0;
        return `${p?.name ?? pid} (anxiety=${anxiety === Infinity ? '∞' : anxiety.toFixed(3)})`;
      })
      .join(', ');

    const productsAssignedHere = assignments
      .filter((a) => a.marketId === bestMarketId)
      .map((a) => products.find((p) => p.id === a.productId)?.name ?? a.productId);

    steps.push({
      stepNumber: stepNumber++,
      action: 'Insert market (anxiety)',
      explanation:
        `Market "${bestMarket.name}" has highest anxiety-weighted score = ${bestScore.toFixed(3)}. ` +
        `Anxiety sum: ${bestAnxietySum.toFixed(3)}, insertion delta: ${bestDelta.toFixed(2)}. ` +
        `Uncovered products available: [${anxietyDetails}]. ` +
        `Products assigned here: ${productsAssignedHere.join(', ')}. ` +
        `Coverage: ${coveredProducts.size}/${products.length}.`,
      solution: buildSolution(
        currentRoute,
        selectedMarkets,
        assignments,
        instance,
        rulebook
      ),
      highlightedMarkets: [bestMarketId],
      highlightedProducts: bestUncoveredHere,
    });
  }

  // ---- 2-opt improvement ----
  const improvedRoute = twoOpt(currentRoute, markets, depot);
  const finalAssignments = computeBestPurchaseAssignment(
    selectedMarkets,
    products,
    markets
  );

  const beforeTravel = routeCost(
    currentRoute,
    markets,
    depot,
    instance.travelCostMultiplier
  );
  const afterTravel = routeCost(
    improvedRoute,
    markets,
    depot,
    instance.travelCostMultiplier
  );

  steps.push({
    stepNumber: stepNumber++,
    action: '2-opt improvement',
    explanation:
      `Applied 2-opt route improvement. ` +
      `Travel cost: $${beforeTravel.toFixed(2)} → $${afterTravel.toFixed(2)} ` +
      `(saved $${(beforeTravel - afterTravel).toFixed(2)}).`,
    solution: buildSolution(
      improvedRoute,
      selectedMarkets,
      finalAssignments,
      instance,
      rulebook
    ),
    highlightedMarkets: selectedMarkets,
  });

  // ---- Final summary ----
  const finalSolution = buildSolution(
    improvedRoute,
    selectedMarkets,
    finalAssignments,
    instance,
    rulebook
  );

  steps.push({
    stepNumber: stepNumber++,
    action: 'Complete',
    explanation:
      `Product Anxiety Construction complete. ` +
      `Total cost: $${finalSolution.totalCost.toFixed(2)} ` +
      `(travel: $${finalSolution.travelCost.toFixed(2)}, ` +
      `purchase: $${finalSolution.purchaseCost.toFixed(2)}, ` +
      `penalty: $${finalSolution.penaltyCost.toFixed(2)}). ` +
      `Markets visited: ${selectedMarkets.length}. ` +
      `Feasible: ${finalSolution.feasible ? 'Yes' : 'No'}.`,
    solution: finalSolution,
  });

  return steps;
}
