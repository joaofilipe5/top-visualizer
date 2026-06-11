// ============================================================================
// TPP Visualizer — Regret-Based Construction Heuristic
// ============================================================================
// A construction heuristic inspired by "regret" heuristics from vehicle routing.
// Instead of greedily picking the cheapest option, it prioritizes products
// that would suffer the most if their best option were lost.
//
// Algorithm overview:
//   1. For each uncovered product, compute effective_cost at each candidate
//      market: effective_cost = price + λ × estimated_insertion_cost
//   2. Sort candidates by effective cost for each product.
//   3. regret = 2nd_best_effective_cost − best_effective_cost
//   4. Pick the product with the highest regret (most to lose).
//   5. Insert the best market for that product into the route.
//   6. Also assign any other uncovered products cheaply available there.
//   7. Repeat until all products are covered.
//   8. Apply 2-opt improvement.
//   9. λ defaults to 0.5 (controls the weight of travel vs. purchase).
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
// Main Heuristic
// ----------------------------------------------------------------------------

/**
 * Regret-based construction heuristic for the TPP.
 *
 * The key insight: a product with only one good option should be assigned
 * early, before that option is "used up" or becomes expensive due to routing.
 * Regret measures how much worse the second-best option is compared to the
 * best — high regret means the product is "anxious" about losing its top choice.
 *
 * The lambda parameter (λ) controls how much estimated travel cost factors
 * into the effective cost. At λ=0, this is pure purchase-cost based.
 * At higher λ, route efficiency is weighted more heavily.
 *
 * @param instance - The TPP instance to solve
 * @param lambda - Weight for insertion cost in effective cost calculation (default: 0.5)
 * @param rulebook - Optional constraint rulebook
 * @returns Array of HeuristicSteps documenting each decision
 */
export function regretConstruction(
  instance: TPPInstance,
  lambda: number = 0.5,
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

  // ---- Step 0: Initialize ----
  steps.push({
    stepNumber: stepNumber++,
    action: 'Initialize',
    explanation:
      `Starting Regret Construction (λ = ${lambda}). ` +
      `For each uncovered product, we compute effective_cost = price + λ × insertion_cost. ` +
      `The product with the highest regret (gap between 2nd-best and best option) is assigned first.`,
    solution: buildSolution([], [], [], instance, rulebook),
  });

  // ---- Main loop ----
  let iterations = 0;
  const maxIterations = products.length * markets.length; // Safety bound

  while (coveredProducts.size < products.length && iterations < maxIterations) {
    iterations++;

    // For each uncovered product, compute effective costs at each market
    let highestRegret = -Infinity;
    let regretProductId = '';
    let bestMarketForRegretProduct = '';
    let bestEffectiveCost = Infinity;
    let secondBestEffectiveCost = Infinity;

    for (const product of products) {
      if (coveredProducts.has(product.id)) continue;

      // Collect effective costs at all candidate markets
      const candidates: Array<{
        marketId: string;
        effectiveCost: number;
        price: number;
        insertionCost: number;
      }> = [];

      for (const market of markets) {
        const price = market.prices[product.id];
        if (price == null) continue; // Product not available here

        // Compute insertion cost for this market
        let insertionCost: number;
        if (selectedSet.has(market.id)) {
          // Market already in route — no additional insertion cost
          insertionCost = 0;
        } else {
          const { deltaCost } = computeRouteInsertionCost(
            currentRoute,
            market.id,
            markets,
            depot
          );
          insertionCost = deltaCost * instance.travelCostMultiplier;
        }

        const effectiveCost = price * product.demand + lambda * insertionCost;

        candidates.push({
          marketId: market.id,
          effectiveCost,
          price,
          insertionCost,
        });
      }

      if (candidates.length === 0) continue; // No market sells this product

      // Sort by effective cost ascending
      candidates.sort((a, b) => a.effectiveCost - b.effectiveCost);

      const best = candidates[0];
      const secondBest =
        candidates.length > 1 ? candidates[1] : { effectiveCost: best.effectiveCost * 2 };

      // Regret = how much worse the fallback is
      const regret = secondBest.effectiveCost - best.effectiveCost;

      if (regret > highestRegret) {
        highestRegret = regret;
        regretProductId = product.id;
        bestMarketForRegretProduct = best.marketId;
        bestEffectiveCost = best.effectiveCost;
        secondBestEffectiveCost = secondBest.effectiveCost;
      }
    }

    // No product found — break (shouldn't happen if instance is feasible)
    if (regretProductId === '' || bestMarketForRegretProduct === '') break;

    // ---- Insert the best market for the regret product ----
    const isNewMarket = !selectedSet.has(bestMarketForRegretProduct);
    let insertPosition = 0;

    if (isNewMarket) {
      const { position } = computeRouteInsertionCost(
        currentRoute,
        bestMarketForRegretProduct,
        markets,
        depot
      );
      insertPosition = position;
      selectedSet.add(bestMarketForRegretProduct);
      currentRoute = insertMarketIntoRoute(
        currentRoute,
        bestMarketForRegretProduct,
        insertPosition
      );
    }

    selectedMarkets = [...selectedSet];

    // Recompute all assignments optimally
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

    // Find which products are now assigned to this market
    const productsAtThisMarket = assignments
      .filter((a) => a.marketId === bestMarketForRegretProduct)
      .map((a) => products.find((p) => p.id === a.productId)?.name ?? a.productId);

    const regretProduct = products.find((p) => p.id === regretProductId)!;
    const bestMarket = getMarketById(bestMarketForRegretProduct, markets);

    steps.push({
      stepNumber: stepNumber++,
      action: isNewMarket ? 'Insert market (regret)' : 'Assign product (existing market)',
      explanation:
        `Product "${regretProduct.name}" has highest regret = ${highestRegret.toFixed(2)} ` +
        `(best effective cost: $${bestEffectiveCost.toFixed(2)}, ` +
        `2nd best: $${secondBestEffectiveCost.toFixed(2)}). ` +
        (isNewMarket
          ? `Added NEW market "${bestMarket.name}" to the route. `
          : `Market "${bestMarket.name}" was already selected. `) +
        `Products now assigned there: ${productsAtThisMarket.join(', ')}. ` +
        `Coverage: ${coveredProducts.size}/${products.length}.`,
      solution: buildSolution(
        currentRoute,
        selectedMarkets,
        assignments,
        instance,
        rulebook
      ),
      highlightedMarkets: [bestMarketForRegretProduct],
      highlightedProducts: [regretProductId],
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
      `Regret Construction (λ=${lambda}) complete. ` +
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
