// ============================================================================
// Example Rulebooks
// ============================================================================
// Five curated, themed Rulebooks demonstrating different constraint scenarios.
// Uses generic product/market IDs (p0, p1, ..., m0, m1, ...) that work with
// both sample instances and generated instances.
// ============================================================================

import { Rulebook } from '../types';

// ---------------------------------------------------------------------------
// 1. Cold-Chain Logistics
// ---------------------------------------------------------------------------
// Scenario: A buyer must transport frozen and refrigerated goods. Some legs
// of the route are too long for cold-chain integrity, and certain frozen
// products cannot be picked up at the same market as fresh products.
// ---------------------------------------------------------------------------

export const COLD_CHAIN_RULEBOOK: Rulebook = {
  id: 'cold-chain',
  name: 'Cold-Chain Logistics',
  description:
    'Frozen products have route leg limits to maintain temperature integrity. ' +
    'Frozen and fresh products cannot be stored together at the same market pickup.',
  rules: [
    // Frozen and fresh products can't share a market (storage incompatibility)
    {
      id: 'cc-1',
      name: 'Frozen/Fresh Separation',
      description: 'Frozen product p0 and fresh product p2 cannot be picked up at the same market.',
      severity: 'hard',
      scope: 'product',
      type: 'products_cannot_share_market',
      enabled: true,
      productIds: ['p0', 'p2'],
    },
    {
      id: 'cc-2',
      name: 'Frozen/Fresh Separation 2',
      description: 'Frozen product p1 and fresh product p3 cannot be picked up at the same market.',
      severity: 'hard',
      scope: 'product',
      type: 'products_cannot_share_market',
      enabled: true,
      productIds: ['p1', 'p3'],
    },
    // Route leg distance limits — cold chain breaks if legs are too long
    {
      id: 'cc-3',
      name: 'Max Leg Distance (Cold Chain)',
      description: 'No route leg can exceed 60 units to maintain cold-chain integrity.',
      severity: 'hard',
      scope: 'route',
      type: 'route_max_distance_between_markets',
      enabled: true,
      value: 60,
    },
    // Soft penalty: if too many markets are visited, freshness degrades
    {
      id: 'cc-4',
      name: 'Freshness Penalty',
      description: 'Visiting more than 4 markets incurs a freshness penalty.',
      severity: 'soft',
      penalty: 25,
      scope: 'solution',
      type: 'max_markets',
      enabled: true,
      value: 4,
    },
    // Must visit a specific cold-storage market
    {
      id: 'cc-5',
      name: 'Cold Storage Required',
      description: 'Market m0 has cold storage and must be visited.',
      severity: 'hard',
      scope: 'market',
      type: 'must_visit_market',
      enabled: true,
      marketIds: ['m0'],
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. Supplier Exclusivity
// ---------------------------------------------------------------------------
// Scenario: Competing suppliers have exclusivity agreements. If you buy from
// one supplier's market, you cannot buy from a competitor's market.
// ---------------------------------------------------------------------------

export const SUPPLIER_EXCLUSIVITY_RULEBOOK: Rulebook = {
  id: 'supplier-exclusivity',
  name: 'Supplier Exclusivity',
  description:
    'Competing suppliers have exclusivity contracts. Certain pairs of markets ' +
    'cannot both be visited. Approved suppliers must be used for specific products.',
  rules: [
    // Exclusive supplier pairs
    {
      id: 'se-1',
      name: 'Supplier A vs B',
      description: 'Markets m0 (Supplier A) and m1 (Supplier B) have an exclusivity agreement.',
      severity: 'hard',
      scope: 'market',
      type: 'markets_cannot_both_be_visited',
      enabled: true,
      marketIds: ['m0', 'm1'],
    },
    {
      id: 'se-2',
      name: 'Supplier C vs D',
      description: 'Markets m2 (Supplier C) and m3 (Supplier D) have an exclusivity agreement.',
      severity: 'hard',
      scope: 'market',
      type: 'markets_cannot_both_be_visited',
      enabled: true,
      marketIds: ['m2', 'm3'],
    },
    // If you visit a supplier, you must buy their main product there
    {
      id: 'se-3',
      name: 'Approved Supplier for p0',
      description: 'Product p0 must be purchased at market m0 (approved supplier).',
      severity: 'hard',
      scope: 'purchase',
      type: 'must_buy_product_at_market',
      enabled: true,
      productIds: ['p0'],
      marketIds: ['m0'],
    },
    // Soft penalty for using non-preferred suppliers
    {
      id: 'se-4',
      name: 'Non-Preferred Supplier Penalty',
      description: 'Purchasing p2 at m4 incurs a non-preferred supplier penalty.',
      severity: 'soft',
      penalty: 30,
      scope: 'purchase',
      type: 'forbidden_purchase_assignment',
      enabled: true,
      productIds: ['p2'],
      marketIds: ['m4'],
    },
    // If market m1 is visited, product p1 must also be purchased (minimum order)
    {
      id: 'se-5',
      name: 'Minimum Order at m1',
      description: 'If market m1 is visited, product p1 must be purchased (minimum order requirement).',
      severity: 'hard',
      scope: 'market',
      type: 'market_requires_product',
      enabled: true,
      marketIds: ['m1'],
      productIds: ['p1'],
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. Hazardous Materials
// ---------------------------------------------------------------------------
// Scenario: Some products are hazardous and cannot be transported together
// or purchased at certain markets without proper facilities.
// ---------------------------------------------------------------------------

export const HAZARDOUS_MATERIALS_RULEBOOK: Rulebook = {
  id: 'hazmat',
  name: 'Hazardous Materials',
  description:
    'Hazardous products cannot share a market or be bought together. ' +
    'Certain markets lack hazmat handling facilities.',
  rules: [
    // Incompatible hazardous products
    {
      id: 'hz-1',
      name: 'Chemical Incompatibility',
      description: 'Products p0 (oxidizer) and p1 (flammable) cannot be purchased together.',
      severity: 'hard',
      scope: 'product',
      type: 'products_cannot_be_bought_together',
      enabled: true,
      productIds: ['p0', 'p1'],
    },
    // Cannot share a market
    {
      id: 'hz-2',
      name: 'Hazmat Storage Separation',
      description: 'Products p2 (corrosive) and p3 (reactive) cannot be picked up at the same market.',
      severity: 'hard',
      scope: 'product',
      type: 'products_cannot_share_market',
      enabled: true,
      productIds: ['p2', 'p3'],
    },
    // Market m3 lacks hazmat facilities
    {
      id: 'hz-3',
      name: 'No Hazmat at m3',
      description: 'Market m3 cannot handle hazardous product p0.',
      severity: 'hard',
      scope: 'market',
      type: 'market_forbids_product',
      enabled: true,
      marketIds: ['m3'],
      productIds: ['p0'],
    },
    {
      id: 'hz-4',
      name: 'No Hazmat at m4',
      description: 'Market m4 cannot handle hazardous product p1.',
      severity: 'hard',
      scope: 'market',
      type: 'market_forbids_product',
      enabled: true,
      marketIds: ['m4'],
      productIds: ['p1'],
    },
    // If you buy hazmat, you need the safety supplier
    {
      id: 'hz-5',
      name: 'Safety Supplier Required',
      description: 'If product p0 is purchased, market m2 (safety equipment) must be visited.',
      severity: 'hard',
      scope: 'purchase',
      type: 'product_requires_market',
      enabled: true,
      productIds: ['p0'],
      marketIds: ['m2'],
    },
    // Buying p0 requires also buying safety product p4
    {
      id: 'hz-6',
      name: 'Safety Product Required',
      description: 'If product p0 (hazardous) is purchased, product p4 (safety gear) must also be purchased.',
      severity: 'hard',
      scope: 'product',
      type: 'product_requires_product',
      enabled: true,
      productIds: ['p0', 'p4'],
    },
    // Soft penalty: extra insurance cost for visiting many markets with hazmat
    {
      id: 'hz-7',
      name: 'Hazmat Insurance Penalty',
      description: 'Visiting more than 3 markets with hazmat incurs extra insurance cost.',
      severity: 'soft',
      penalty: 50,
      scope: 'solution',
      type: 'max_markets',
      enabled: true,
      value: 3,
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Budget-Constrained
// ---------------------------------------------------------------------------
// Scenario: Strict budget limits with a maximum market count. Soft penalty
// for going over a lower market count threshold.
// ---------------------------------------------------------------------------

export const BUDGET_CONSTRAINED_RULEBOOK: Rulebook = {
  id: 'budget',
  name: 'Budget-Constrained',
  description:
    'Hard budget limit, maximum market cap, and soft penalties for visiting too many markets.',
  rules: [
    // Hard budget limit
    {
      id: 'bg-1',
      name: 'Hard Budget',
      description: 'Total cost (travel + purchase + penalties) must not exceed 200.',
      severity: 'hard',
      scope: 'solution',
      type: 'budget_limit',
      enabled: true,
      value: 200,
    },
    // Hard max markets
    {
      id: 'bg-2',
      name: 'Max Markets (Hard)',
      description: 'Cannot visit more than 5 markets.',
      severity: 'hard',
      scope: 'solution',
      type: 'max_markets',
      enabled: true,
      value: 5,
    },
    // Soft penalty: prefer fewer markets (logistics overhead)
    {
      id: 'bg-3',
      name: 'Too Many Stops Penalty',
      description: 'Visiting more than 3 markets incurs a logistics overhead penalty.',
      severity: 'soft',
      penalty: 15,
      scope: 'solution',
      type: 'max_markets',
      enabled: true,
      value: 3,
    },
    // Must visit at least 2 markets (diversification requirement)
    {
      id: 'bg-4',
      name: 'Minimum Diversification',
      description: 'Must visit at least 2 markets for supply diversification.',
      severity: 'hard',
      scope: 'solution',
      type: 'min_markets',
      enabled: true,
      value: 2,
    },
    // Forbidden luxury market (over budget)
    {
      id: 'bg-5',
      name: 'Forbidden Luxury Market',
      description: 'Market m4 is too expensive and is forbidden under the budget scenario.',
      severity: 'hard',
      scope: 'market',
      type: 'forbidden_market',
      enabled: true,
      marketIds: ['m4'],
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. Precedence and Routing
// ---------------------------------------------------------------------------
// Scenario: Specific market ordering requirements and required/forbidden
// route edges due to road closures, one-way streets, etc.
// ---------------------------------------------------------------------------

export const PRECEDENCE_RULEBOOK: Rulebook = {
  id: 'precedence',
  name: 'Precedence & Routing',
  description:
    'Market ordering constraints, required route edges (highway connections), ' +
    'and forbidden edges (road closures).',
  rules: [
    // Precedence: m0 before m2
    {
      id: 'pr-1',
      name: 'Pickup Order 1',
      description: 'Market m0 must be visited before market m2 (pickup dependencies).',
      severity: 'hard',
      scope: 'route',
      type: 'route_precedence',
      enabled: true,
      orderedPair: { beforeMarketId: 'm0', afterMarketId: 'm2' },
    },
    // Precedence: m1 before m3
    {
      id: 'pr-2',
      name: 'Pickup Order 2',
      description: 'Market m1 must be visited before market m3 (processing order).',
      severity: 'hard',
      scope: 'route',
      type: 'route_precedence',
      enabled: true,
      orderedPair: { beforeMarketId: 'm1', afterMarketId: 'm3' },
    },
    // Required edge: highway connection m0 → m1
    {
      id: 'pr-3',
      name: 'Highway Connection',
      description: 'Route must use the highway connection from m0 to m1.',
      severity: 'hard',
      scope: 'route',
      type: 'route_requires_edge',
      enabled: true,
      edge: { fromMarketId: 'm0', toMarketId: 'm1' },
    },
    // Forbidden edge: road closure m2 → m3
    {
      id: 'pr-4',
      name: 'Road Closure',
      description: 'Road from m2 to m3 is closed — route cannot go directly m2 → m3.',
      severity: 'hard',
      scope: 'route',
      type: 'route_forbidden_edge',
      enabled: true,
      edge: { fromMarketId: 'm2', toMarketId: 'm3' },
    },
    // Soft penalty: prefer short legs
    {
      id: 'pr-5',
      name: 'Long Leg Penalty',
      description: 'Route legs exceeding 50 units incur a fuel surcharge.',
      severity: 'soft',
      penalty: 20,
      scope: 'route',
      type: 'route_max_distance_between_markets',
      enabled: true,
      value: 50,
    },
    // Must visit the distribution hub
    {
      id: 'pr-6',
      name: 'Distribution Hub',
      description: 'Market m0 is the distribution hub and must be visited.',
      severity: 'hard',
      scope: 'market',
      type: 'must_visit_market',
      enabled: true,
      marketIds: ['m0'],
    },
  ],
};

// ---------------------------------------------------------------------------
// All example rulebooks in one convenient array
// ---------------------------------------------------------------------------

export const EXAMPLE_RULEBOOKS: Rulebook[] = [
  COLD_CHAIN_RULEBOOK,
  SUPPLIER_EXCLUSIVITY_RULEBOOK,
  HAZARDOUS_MATERIALS_RULEBOOK,
  BUDGET_CONSTRAINED_RULEBOOK,
  PRECEDENCE_RULEBOOK,
];

/** Lookup by ID */
export const EXAMPLE_RULEBOOK_MAP: Record<string, Rulebook> = Object.fromEntries(
  EXAMPLE_RULEBOOKS.map((rb) => [rb.id, rb])
);
