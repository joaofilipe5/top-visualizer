// ============================================================================
// TPP Visualizer — Greedy Market Insertion Heuristic
// ============================================================================
// A construction heuristic that balances purchase savings against routing cost
// by scoring candidate markets with: score = purchase_saving / (1 + insertion_cost).
//
// Algorithm overview:
//   1. Start with an empty solution (no markets, no route).
//   2. At each iteration, evaluate every unselected market:
//      - purchase_saving: sum of price improvements for uncovered products
//        available at this market compared to current assignment.
//        For products not yet covered, saving = the price at this market
//        (conceptually going from ∞ to a finite price).
//      - route_insertion_cost: cheapest-position insertion delta into the route.
//      - score = purchase_saving / (1 + route_insertion_cost)
//   3. Pick the market with the highest score.
//   4. Add it: insert into route, reassign products optimally.
//   5. Repeat until all products are covered.
//   6. Final 2-opt improvement.
//   7. Generate a HeuristicStep at each market insertion.
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
// Helper: Compute purchase saving if a candidate market is added
// ----------------------------------------------------------------------------

/**
 * Computes how much total purchase cost would decrease if `candidateId` were
 * added to the selected set.
 *
 * For each product:
 *  - If the product is not yet covered (no assignment), and the candidate
 *    sells it, the saving = price at candidate × demand. (Going from ∞ → finite.)
 *  - If the product is currently assigned at a higher price, the saving =
 *    (current price - candidate price) × demand.
 *  - If the candidate doesn't sell the product or is more expensive, saving = 0.
 */
function computePurchaseSaving(
  candidateId: string,
  products: Product[],
  markets: Market[],
  currentAssignments: PurchaseAssignment[]
): number {
  const candidate = getMarketById(candidateId, markets);
  let totalSaving = 0;

  // Build a map of current best price per product
  const currentPriceMap = new Map<string, number>();
  for (const a of currentAssignments) {
    currentPriceMap.set(a.productId, a.price);
  }

  for (const product of products) {
    const candidatePrice = candidate.prices[product.id];

    // Skip if the candidate doesn't sell this product
    if (candidatePrice == null) continue;

    const currentPrice = currentPriceMap.get(product.id);

    if (currentPrice === undefined) {
      // Product is not yet covered — full price is the "saving" from infinity
      totalSaving += candidatePrice * product.demand;
    } else if (candidatePrice < currentPrice) {
      // Candidate offers a better price
      totalSaving += (currentPrice - candidatePrice) * product.demand;
    }
    // else: no saving (candidate is same price or more expensive)
  }

  return totalSaving;
}

// ----------------------------------------------------------------------------
// Main Heuristic
// ----------------------------------------------------------------------------

/**
 * Greedy Market Insertion heuristic for the Traveling Purchaser Problem.
 *
 * At each step, the market that offers the best ratio of purchase savings
 * to routing cost increase is inserted into the solution. This balances
 * the dual objectives of cheap purchasing and short routes.
 *
 * @param instance - The TPP instance to solve
 * @param rulebook - Optional constraint rulebook
 * @returns Array of HeuristicSteps documenting each decision
 */
export function greedyMarketInsertion(
  instance: TPPInstance,
  rulebook?: Rulebook
): HeuristicStep[] {
  const steps: HeuristicStep[] = [];
  let stepNumber = 0;

  const { depot, markets, products } = instance;

  // Current state
  let currentRoute: string[] = [];
  let selectedMarkets: string[] = [];
  let assignments: PurchaseAssignment[] = [];

  // Track which products are covered
  const coveredProducts = new Set<string>();

  // ---- Step 0: Initialize ----
  steps.push({
    stepNumber: stepNumber++,
    action: 'Initialize',
    explanation:
      'Starting Greedy Market Insertion. At each iteration, we evaluate every unselected market by: ' +
      'score = purchase_saving / (1 + insertion_cost). The highest-scoring market is added.',
    solution: buildSolution([], [], [], instance, rulebook),
  });

  // ---- Main loop: add markets until all products are covered ----
  const allMarketIds = new Set(markets.map((m) => m.id));
  const selectedSet = new Set<string>();
  let iterations = 0;
  const maxIterations = markets.length; // Safety bound

  while (coveredProducts.size < products.length && iterations < maxIterations) {
    iterations++;

    let bestMarketId = '';
    let bestScore = -Infinity;
    let bestPosition = 0;
    let bestDelta = 0;
    let bestSaving = 0;

    // Evaluate each unselected market
    for (const marketId of allMarketIds) {
      if (selectedSet.has(marketId)) continue;

      // Compute purchase saving
      const saving = computePurchaseSaving(
        marketId,
        products,
        markets,
        assignments
      );

      // Skip markets that offer no purchase improvement
      if (saving <= 0) continue;

      // Compute insertion cost into route
      const { position, deltaCost } = computeRouteInsertionCost(
        currentRoute,
        marketId,
        markets,
        depot
      );

      // Score: savings relative to cost of adding the market
      // We use (1 + deltaCost) to avoid division by zero and to weight
      // the insertion cost appropriately
      const score = saving / (1 + deltaCost * instance.travelCostMultiplier);

      if (score > bestScore) {
        bestScore = score;
        bestMarketId = marketId;
        bestPosition = position;
        bestDelta = deltaCost;
        bestSaving = saving;
      }
    }

    // If no market offers any improvement, check for uncovered products
    if (bestMarketId === '') {
      // Try to find any market that covers an uncovered product, even at zero saving
      for (const marketId of allMarketIds) {
        if (selectedSet.has(marketId)) continue;
        const market = getMarketById(marketId, markets);

        for (const product of products) {
          if (coveredProducts.has(product.id)) continue;
          const price = market.prices[product.id];
          if (price != null) {
            bestMarketId = marketId;
            const { position, deltaCost } = computeRouteInsertionCost(
              currentRoute,
              marketId,
              markets,
              depot
            );
            bestPosition = position;
            bestDelta = deltaCost;
            bestSaving = price * product.demand;
            break;
          }
        }
        if (bestMarketId !== '') break;
      }

      // If still no market found, we cannot cover all products
      if (bestMarketId === '') break;
    }

    // ---- Add the best market ----
    selectedSet.add(bestMarketId);
    selectedMarkets = [...selectedSet];
    currentRoute = insertMarketIntoRoute(currentRoute, bestMarketId, bestPosition);

    // Recompute assignments optimally for the new set of selected markets
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
    const newlyCoveredHere = products.filter((p) => {
      const a = assignments.find((a) => a.productId === p.id);
      return a?.marketId === bestMarketId;
    });

    steps.push({
      stepNumber: stepNumber++,
      action: 'Insert market',
      explanation:
        `Selected Market "${bestMarket.name}" (score = ${bestScore.toFixed(3)}). ` +
        `Purchase saving: $${bestSaving.toFixed(2)}, insertion cost delta: ${bestDelta.toFixed(2)}. ` +
        `Products assigned here: ${newlyCoveredHere.map((p) => p.name).join(', ') || 'none'}. ` +
        `Coverage: ${coveredProducts.size}/${products.length} products.`,
      solution: buildSolution(
        currentRoute,
        selectedMarkets,
        assignments,
        instance,
        rulebook
      ),
      highlightedMarkets: [bestMarketId],
      highlightedProducts: newlyCoveredHere.map((p) => p.id),
    });
  }

  // ---- Phase 2: 2-opt improvement ----
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
      `Applied 2-opt to improve the route. ` +
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
      `Greedy Market Insertion complete. ` +
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
