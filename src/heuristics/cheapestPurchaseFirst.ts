// ============================================================================
// TPP Visualizer — Cheapest Purchase First Heuristic
// ============================================================================
// A simple construction heuristic that focuses on minimizing purchase cost
// first, then builds a route through the needed markets.
//
// Algorithm overview:
//   1. For each product, find the single cheapest market globally.
//   2. Collect the unique set of markets needed.
//   3. Build a route using nearest-neighbor construction.
//   4. Improve the route with 2-opt.
//   5. Record a HeuristicStep at each major decision point.
//
// This heuristic is fast and intuitive but ignores the travel cost when
// choosing markets, which can lead to expensive routes when cheap products
// are spread across distant markets.
// ============================================================================

import type {
  TPPInstance,
  Rulebook,
  HeuristicStep,
  Solution,
  PurchaseAssignment,
} from '../types';
import {
  distance,
  routeCost,
  purchaseCost,
  computePenaltyCost,
  totalCost,
  HARD_VIOLATION_PENALTY,
} from './cost';
import {
  nearestNeighborRoute,
  twoOpt,
  computeBestPurchaseAssignment,
} from './routing';
import { checkRulebook } from './ruleChecker';

// ----------------------------------------------------------------------------
// Helper: Build a complete Solution object from route + assignments
// ----------------------------------------------------------------------------

/**
 * Constructs a full Solution object from a route and assignments,
 * computing all cost components and checking for rule violations.
 */
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
  const allProductsCovered = instance.products.every((p) =>
    assignments.some((a) => a.productId === p.id)
  );
  const feasible = allProductsCovered && violations.length === 0;

  return {
    route,
    selectedMarkets,
    assignments,
    travelCost: travel,
    purchaseCost: purchase,
    penaltyCost: penalty,
    totalCost: totalCost(travel, purchase, penalty),
    feasible,
    violations,
  };
}

// ----------------------------------------------------------------------------
// Main Heuristic
// ----------------------------------------------------------------------------

/**
 * Cheapest Purchase First heuristic for the Traveling Purchaser Problem.
 *
 * Strategy: minimize purchase cost greedily, then handle routing.
 * This is analogous to a "greedy set cover" where each product is assigned
 * to its globally cheapest source, ignoring travel entirely during assignment.
 *
 * @param instance - The TPP instance to solve
 * @param rulebook - Optional constraint rulebook
 * @returns Array of HeuristicSteps documenting each decision
 */
export function cheapestPurchaseFirst(
  instance: TPPInstance,
  rulebook?: Rulebook
): HeuristicStep[] {
  const steps: HeuristicStep[] = [];
  let stepNumber = 0;

  const { depot, markets, products, travelCostMultiplier } = instance;

  // ---- Step 0: Record initial empty state ----
  const emptySolution = buildSolution([], [], [], instance, rulebook);
  steps.push({
    stepNumber: stepNumber++,
    action: 'Initialize',
    explanation:
      'Starting Cheapest Purchase First heuristic. For each product, we will find the single cheapest market globally, ignoring travel cost.',
    solution: emptySolution,
  });

  // ---- Phase 1: For each product, find the cheapest market globally ----
  const assignments: PurchaseAssignment[] = [];
  const selectedMarketSet = new Set<string>();

  for (const product of products) {
    let bestMarketId = '';
    let bestPrice = Infinity;

    // Scan all markets for the cheapest price for this product
    for (const market of markets) {
      const price = market.prices[product.id];
      if (price != null && price < bestPrice) {
        bestPrice = price;
        bestMarketId = market.id;
      }
    }

    if (bestMarketId === '') {
      // Product is unavailable at any market — record but continue
      steps.push({
        stepNumber: stepNumber++,
        action: 'Product unavailable',
        explanation: `Product "${product.name}" (${product.id}) is not available at any market. The solution will be infeasible.`,
        solution: buildSolution(
          [],
          [...selectedMarketSet],
          [...assignments],
          instance,
          rulebook
        ),
        highlightedProducts: [product.id],
      });
      continue;
    }

    // Record the assignment
    assignments.push({
      productId: product.id,
      marketId: bestMarketId,
      quantity: product.demand,
      price: bestPrice,
    });
    const isNewMarket = !selectedMarketSet.has(bestMarketId);
    selectedMarketSet.add(bestMarketId);

    const bestMarket = markets.find((m) => m.id === bestMarketId)!;

    steps.push({
      stepNumber: stepNumber++,
      action: 'Assign product to cheapest market',
      explanation:
        `Product "${product.name}" → Market "${bestMarket.name}" at price $${bestPrice.toFixed(2)} × ${product.demand} units.` +
        (isNewMarket
          ? ` This is a NEW market added to the selection.`
          : ` Market was already selected.`),
      solution: buildSolution(
        [],
        [...selectedMarketSet],
        [...assignments],
        instance,
        rulebook
      ),
      highlightedMarkets: [bestMarketId],
      highlightedProducts: [product.id],
    });
  }

  // ---- Phase 2: Build a route with nearest-neighbor ----
  const selectedMarkets = [...selectedMarketSet];
  const nnRoute = nearestNeighborRoute(selectedMarkets, markets, depot);
  const nnAssignments = computeBestPurchaseAssignment(
    selectedMarkets,
    products,
    markets
  );

  steps.push({
    stepNumber: stepNumber++,
    action: 'Build nearest-neighbor route',
    explanation:
      `Built a nearest-neighbor route through ${selectedMarkets.length} selected markets. ` +
      `Route order: depot → ${nnRoute.map((id) => markets.find((m) => m.id === id)?.name ?? id).join(' → ')} → depot.`,
    solution: buildSolution(
      nnRoute,
      selectedMarkets,
      nnAssignments,
      instance,
      rulebook
    ),
    highlightedMarkets: selectedMarkets,
  });

  // ---- Phase 3: Improve with 2-opt ----
  const improvedRoute = twoOpt(nnRoute, markets, depot);
  const finalAssignments = computeBestPurchaseAssignment(
    selectedMarkets,
    products,
    markets
  );

  const beforeCost = routeCost(nnRoute, markets, depot, travelCostMultiplier);
  const afterCost = routeCost(
    improvedRoute,
    markets,
    depot,
    travelCostMultiplier
  );
  const improvement = beforeCost - afterCost;

  steps.push({
    stepNumber: stepNumber++,
    action: '2-opt improvement',
    explanation:
      `Applied 2-opt local search to improve the route. ` +
      `Travel cost: $${beforeCost.toFixed(2)} → $${afterCost.toFixed(2)} ` +
      `(saved $${improvement.toFixed(2)}). ` +
      `Final route: depot → ${improvedRoute.map((id) => markets.find((m) => m.id === id)?.name ?? id).join(' → ')} → depot.`,
    solution: buildSolution(
      improvedRoute,
      selectedMarkets,
      finalAssignments,
      instance,
      rulebook
    ),
    highlightedMarkets: selectedMarkets,
  });

  // ---- Final step: Summary ----
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
      `Cheapest Purchase First complete. ` +
      `Total cost: $${finalSolution.totalCost.toFixed(2)} ` +
      `(travel: $${finalSolution.travelCost.toFixed(2)}, ` +
      `purchase: $${finalSolution.purchaseCost.toFixed(2)}, ` +
      `penalty: $${finalSolution.penaltyCost.toFixed(2)}). ` +
      `Markets visited: ${selectedMarkets.length}. ` +
      `Feasible: ${finalSolution.feasible ? 'Yes' : 'No'}.`,
    solution: finalSolution,
    highlightedMarkets: selectedMarkets,
  });

  return steps;
}
