// ============================================================================
// Sample TPP Instances (Hand-Crafted)
// ============================================================================
// Two curated instances for testing, demo, and documentation purposes.
// Each has known characteristics that make them useful for verifying
// heuristics and constraint handling.
// ============================================================================

import { TPPInstance } from '../types';

// ---------------------------------------------------------------------------
// 1. TINY SAMPLE: 3 markets, 3 products — obvious optimal solution
// ---------------------------------------------------------------------------
// Layout:
//   Depot at (50, 50).
//   M0 at (30, 30) — sells p0 cheaply, p1 cheaply
//   M1 at (70, 70) — sells p1 expensively, p2 cheaply
//   M2 at (90, 10) — sells p0 expensively, p2 expensively
//
// Optimal: visit M0 (buy p0 for 5, p1 for 8) + M1 (buy p2 for 6)
//          Total purchase = 19, travel = depot→M0→M1→depot
//
// Sub-optimal alternative: visit all three markets
// ---------------------------------------------------------------------------

export const TINY_SAMPLE_INSTANCE: TPPInstance = {
  depot: { x: 50, y: 50 },
  markets: [
    {
      id: 'm0',
      name: 'Market 1',
      x: 30,
      y: 30,
      prices: {
        p0: 5,   // cheapest for p0
        p1: 8,   // cheapest for p1
        p2: null, // not available
      },
    },
    {
      id: 'm1',
      name: 'Market 2',
      x: 70,
      y: 70,
      prices: {
        p0: null, // not available
        p1: 25,   // expensive
        p2: 6,    // cheapest for p2
      },
    },
    {
      id: 'm2',
      name: 'Market 3',
      x: 90,
      y: 10,
      prices: {
        p0: 30,  // expensive
        p1: null, // not available
        p2: 20,   // expensive
      },
    },
  ],
  products: [
    { id: 'p0', name: 'Product 1', demand: 1 },
    { id: 'p1', name: 'Product 2', demand: 1 },
    { id: 'p2', name: 'Product 3', demand: 1 },
  ],
  travelCostMultiplier: 1.0,
  metadata: {
    feasibilityRepairApplied: false,
    repairedProducts: [],
    statistics: {
      avgAvailabilityPerProduct: 2.0,
      avgProductsPerMarket: 2.0,
      cheapestProductPrice: 5,
      mostExpensiveProductPrice: 30,
      coordinateSpread: 84.85,
      estimatedDifficultyScore: 15,
    },
    difficulty: 'Easy',
  },
};

// ---------------------------------------------------------------------------
// 2. SMALL SAMPLE: 6 markets, 5 products — interesting tradeoffs
// ---------------------------------------------------------------------------
// Layout (roughly a ring around the depot):
//   Depot at (50, 50)
//   M0 (20, 80) — "corner specialist" — cheap p0, p1
//   M1 (80, 80) — "specialist" — cheap p2, p3
//   M2 (80, 20) — "specialist" — cheap p3, p4
//   M3 (20, 20) — "generalist" — has everything at medium prices
//   M4 (50, 90) — "bargain" — very cheap p4 but far
//   M5 (50, 10) — "bargain" — very cheap p0 but far
//
// Tradeoffs:
// - M3 can supply everything in one stop → low travel, higher purchase cost
// - M0+M1 gets p0-p3 cheaply but no p4, need M2 or M4 for that
// - M5 has cheapest p0 but is far from depot — worth the detour?
// - Multiple equally attractive 2-market and 3-market solutions
// ---------------------------------------------------------------------------

export const SMALL_SAMPLE_INSTANCE: TPPInstance = {
  depot: { x: 50, y: 50 },
  markets: [
    {
      id: 'm0',
      name: 'Corner Specialist',
      x: 20,
      y: 80,
      prices: {
        p0: 4,
        p1: 6,
        p2: null,
        p3: null,
        p4: 45,
      },
    },
    {
      id: 'm1',
      name: 'East Specialist',
      x: 80,
      y: 80,
      prices: {
        p0: null,
        p1: 30,
        p2: 7,
        p3: 5,
        p4: null,
      },
    },
    {
      id: 'm2',
      name: 'Southeast Specialist',
      x: 80,
      y: 20,
      prices: {
        p0: null,
        p1: null,
        p2: 25,
        p3: 8,
        p4: 6,
      },
    },
    {
      id: 'm3',
      name: 'Generalist',
      x: 20,
      y: 20,
      prices: {
        p0: 15,
        p1: 18,
        p2: 20,
        p3: 16,
        p4: 22,
      },
    },
    {
      id: 'm4',
      name: 'North Bargain',
      x: 50,
      y: 90,
      prices: {
        p0: 30,
        p1: null,
        p2: null,
        p3: null,
        p4: 3,
      },
    },
    {
      id: 'm5',
      name: 'South Bargain',
      x: 50,
      y: 10,
      prices: {
        p0: 2,
        p1: null,
        p2: null,
        p3: 40,
        p4: null,
      },
    },
  ],
  products: [
    { id: 'p0', name: 'Product 1', demand: 1 },
    { id: 'p1', name: 'Product 2', demand: 1 },
    { id: 'p2', name: 'Product 3', demand: 1 },
    { id: 'p3', name: 'Product 4', demand: 1 },
    { id: 'p4', name: 'Product 5', demand: 1 },
  ],
  travelCostMultiplier: 1.0,
  metadata: {
    feasibilityRepairApplied: false,
    repairedProducts: [],
    statistics: {
      avgAvailabilityPerProduct: 3.4,
      avgProductsPerMarket: 2.83,
      cheapestProductPrice: 2,
      mostExpensiveProductPrice: 45,
      coordinateSpread: 84.85,
      estimatedDifficultyScore: 22,
    },
    difficulty: 'Easy',
  },
};
