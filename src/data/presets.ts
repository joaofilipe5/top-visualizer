// ============================================================================
// TPP Instance Generation Presets
// ============================================================================
// Pre-configured InstanceGenerationConfig objects at five scales. SMALL is the
// recommended default for interactive use. HUGE is for stress-testing.
// ============================================================================

import { InstanceGenerationConfig } from '../types';

/**
 * TINY preset: 5 markets, 4 products.
 * Useful for learning, debugging, and unit tests.
 */
export const TINY_PRESET: InstanceGenerationConfig = {
  nMarkets: 5,
  nProducts: 4,
  depotX: 50,
  depotY: 50,
  width: 100,
  height: 100,
  availabilityDensity: 0.6,
  minPrice: 5,
  maxPrice: 30,
  priceNoise: 0.15,
  travelCostMultiplier: 1.0,
  demandMode: 'fixed',
  fixedDemand: 1,
  minDemand: 1,
  maxDemand: 2,
  seed: 1,
  spatialMode: 'uniform',
  priceMode: 'random',
  mapBoundary: 'none',
  minProductsPerMarket: 1,
  maxProductsPerMarket: 4,
};

/**
 * SMALL preset (DEFAULT): 15 markets, 10 products.
 * A good balance between complexity and readability in the visualizer.
 */
export const SMALL_PRESET: InstanceGenerationConfig = {
  nMarkets: 15,
  nProducts: 10,
  depotX: 50,
  depotY: 50,
  width: 100,
  height: 100,
  availabilityDensity: 0.4,
  minPrice: 5,
  maxPrice: 50,
  priceNoise: 0.2,
  travelCostMultiplier: 1.0,
  demandMode: 'fixed',
  fixedDemand: 1,
  minDemand: 1,
  maxDemand: 3,
  seed: 42,
  spatialMode: 'uniform',
  priceMode: 'random',
  mapBoundary: 'none',
  minProductsPerMarket: 1,
  maxProductsPerMarket: 10,
};

/**
 * MEDIUM preset: 50 markets, 30 products.
 * Starts to show meaningful route optimization challenges.
 */
export const MEDIUM_PRESET: InstanceGenerationConfig = {
  nMarkets: 50,
  nProducts: 30,
  depotX: 50,
  depotY: 50,
  width: 200,
  height: 200,
  availabilityDensity: 0.35,
  minPrice: 3,
  maxPrice: 80,
  priceNoise: 0.25,
  travelCostMultiplier: 0.8,
  demandMode: 'fixed',
  fixedDemand: 1,
  minDemand: 1,
  maxDemand: 3,
  seed: 100,
  spatialMode: 'clustered',
  priceMode: 'geoCorrelated',
  mapBoundary: 'none',
  minProductsPerMarket: 1,
  maxProductsPerMarket: 15,
};

/**
 * LARGE preset: 150 markets, 80 products.
 * Computationally more intensive; good for benchmarking heuristics.
 */
export const LARGE_PRESET: InstanceGenerationConfig = {
  nMarkets: 150,
  nProducts: 80,
  depotX: 100,
  depotY: 100,
  width: 300,
  height: 300,
  availabilityDensity: 0.3,
  minPrice: 2,
  maxPrice: 120,
  priceNoise: 0.3,
  travelCostMultiplier: 0.5,
  demandMode: 'random',
  fixedDemand: 1,
  minDemand: 1,
  maxDemand: 5,
  seed: 256,
  spatialMode: 'clustered',
  priceMode: 'specialist',
  mapBoundary: 'none',
  minProductsPerMarket: 1,
  maxProductsPerMarket: 20,
};

/**
 * HUGE preset: 500 markets, 200 products.
 * For stress-testing the visualizer and heuristics.
 */
export const HUGE_PRESET: InstanceGenerationConfig = {
  nMarkets: 500,
  nProducts: 200,
  depotX: 250,
  depotY: 250,
  width: 500,
  height: 500,
  availabilityDensity: 0.25,
  minPrice: 1,
  maxPrice: 200,
  priceNoise: 0.35,
  travelCostMultiplier: 0.3,
  demandMode: 'random',
  fixedDemand: 1,
  minDemand: 1,
  maxDemand: 8,
  seed: 999,
  spatialMode: 'grid',
  priceMode: 'warehouse',
  mapBoundary: 'none',
  minProductsPerMarket: 1,
  maxProductsPerMarket: 40,
};

/** All presets keyed by name for UI dropdowns */
export const PRESETS: Record<string, InstanceGenerationConfig> = {
  tiny: TINY_PRESET,
  small: SMALL_PRESET,
  medium: MEDIUM_PRESET,
  large: LARGE_PRESET,
  huge: HUGE_PRESET,
};

/** Default preset */
export const DEFAULT_PRESET = SMALL_PRESET;
