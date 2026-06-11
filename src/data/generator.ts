// ============================================================================
// TPP Instance Generator
// ============================================================================
// Generates TPP problem instances with configurable spatial layouts, price
// models, and feasibility guarantees. Uses a seeded PRNG for reproducibility.
// ============================================================================

import {
  TPPInstance,
  Market,
  Product,
  Depot,
  InstanceGenerationConfig,
  InstanceMetadata,
  InstanceStatistics,
  DifficultyLevel,
} from '../types';

import { geoMercator, geoPath, geoContains, GeoProjection } from 'd3-geo';
import PRT_GEOJSON from './maps/PRT.geo.json';
import USA_GEOJSON from './maps/USA_contiguous.geo.json';

const MIN_MARKET_DISTANCE = 3.5; // Avoid physical overlap (radius is typically 1.5 - 2.5)

// ---------------------------------------------------------------------------
// Seeded PRNG — Mulberry32
// ---------------------------------------------------------------------------

/**
 * Mulberry32: a fast, high-quality 32-bit seeded PRNG.
 * Returns a function that produces numbers in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a random integer in [min, max] (inclusive on both ends).
 */
export function seededInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Box–Muller transform for Gaussian sampling (used by clustered mode)
// ---------------------------------------------------------------------------

function gaussianPair(rng: () => number): [number, number] {
  let u1 = rng();
  // Avoid log(0)
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}

// ---------------------------------------------------------------------------
// Euclidean distance helper
// ---------------------------------------------------------------------------

function euclidean(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// ---------------------------------------------------------------------------
// Clamp helper
// ---------------------------------------------------------------------------

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

// ---------------------------------------------------------------------------
// Product Generation
// ---------------------------------------------------------------------------

function generateProducts(config: InstanceGenerationConfig, rng: () => number): Product[] {
  const products: Product[] = [];
  for (let i = 0; i < config.nProducts; i++) {
    const demand =
      config.demandMode === 'fixed'
        ? config.fixedDemand
        : seededInt(rng, config.minDemand, config.maxDemand);

    products.push({
      id: `p${i}`,
      name: `Product ${i + 1}`,
      demand,
    });
  }
  return products;
}

// ---------------------------------------------------------------------------
// Market Generation (positions only — prices filled later)
// ---------------------------------------------------------------------------

function generateMarketPositions(
  config: InstanceGenerationConfig,
  rng: () => number,
  projection?: GeoProjection,
  geojson?: any
): Array<{ x: number; y: number }> {
  const { nMarkets, width, height, spatialMode } = config;

  let positions: Array<{ x: number; y: number }> = [];

  switch (spatialMode) {
    case 'uniform':
      positions = generateUniformPositions(nMarkets, width, height, rng);
      break;
    case 'clustered':
      positions = generateClusteredPositions(nMarkets, width, height, rng);
      break;
    case 'grid':
      positions = generateGridPositions(nMarkets, width, height, rng);
      break;
    default:
      positions = generateUniformPositions(nMarkets, width, height, rng);
  }

  // 1. Enforce GeoJSON boundary if provided
  if (projection && geojson) {
    const validPositions: Array<{ x: number; y: number }> = [];
    // We will do rejection sampling to replace invalid points
    for (const p of positions) {
      if (geoContains(geojson as any, projection.invert!([p.x, p.y]) as [number, number])) {
        validPositions.push(p);
      }
    }
    
    // Fill the rest with uniform rejection sampling inside the polygon
    let attempts = 0;
    while (validPositions.length < nMarkets && attempts < 10000) {
      attempts++;
      const nx = rng() * width;
      const ny = rng() * height;
      if (geoContains(geojson as any, projection.invert!([nx, ny]) as [number, number])) {
        validPositions.push({ x: nx, y: ny });
      }
    }
    positions = validPositions;
  }

  // 2. Enforce non-overlapping markets
  return enforceNonOverlapping(positions, width, height, rng, projection, geojson);
}

function enforceNonOverlapping(
  positions: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  rng: () => number,
  projection?: GeoProjection,
  geojson?: any
): Array<{ x: number; y: number }> {
  const finalPositions: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < positions.length; i++) {
    let p = positions[i];
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 50) {
      valid = true;
      for (const existing of finalPositions) {
        if (euclidean(p.x, p.y, existing.x, existing.y) < MIN_MARKET_DISTANCE) {
          valid = false;
          break;
        }
      }

      if (!valid) {
        // Jitter or find new point
        p = { x: rng() * width, y: rng() * height };
        // If map bounds active, must stay inside map
        if (projection && geojson) {
          while (!geoContains(geojson as any, projection.invert!([p.x, p.y]) as [number, number]) && attempts < 50) {
            p = { x: rng() * width, y: rng() * height };
            attempts++;
          }
        }
      }
      attempts++;
    }
    
    // Even if we failed to completely separate it after 50 attempts, we still add it
    // but the attempts usually resolve the overlap.
    finalPositions.push(p);
  }

  return finalPositions;
}

function generateUniformPositions(
  n: number,
  width: number,
  height: number,
  rng: () => number
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    positions.push({
      x: rng() * width,
      y: rng() * height,
    });
  }
  return positions;
}

function generateClusteredPositions(
  n: number,
  width: number,
  height: number,
  rng: () => number
): Array<{ x: number; y: number }> {
  const k = Math.ceil(Math.sqrt(n));
  const stddev = width / (2 * k);

  // Generate k cluster centers uniformly
  const centers: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < k; i++) {
    centers.push({ x: rng() * width, y: rng() * height });
  }

  // Assign each market to a random cluster center and sample around it
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const center = centers[seededInt(rng, 0, k - 1)];
    const [gx, gy] = gaussianPair(rng);
    positions.push({
      x: clamp(center.x + gx * stddev, 0, width),
      y: clamp(center.y + gy * stddev, 0, height),
    });
  }
  return positions;
}

function generateGridPositions(
  n: number,
  width: number,
  height: number,
  rng: () => number
): Array<{ x: number; y: number }> {
  // Compute rows and cols to approximately fill a grid
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const cellW = width / cols;
  const cellH = height / rows;
  const jitterX = cellW * 0.15; // small jitter ±15% of cell size
  const jitterY = cellH * 0.15;

  const positions: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows && positions.length < n; r++) {
    for (let c = 0; c < cols && positions.length < n; c++) {
      const baseX = (c + 0.5) * cellW;
      const baseY = (r + 0.5) * cellH;
      positions.push({
        x: clamp(baseX + (rng() * 2 - 1) * jitterX, 0, width),
        y: clamp(baseY + (rng() * 2 - 1) * jitterY, 0, height),
      });
    }
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Price Generation
// ---------------------------------------------------------------------------

function generatePrices(
  markets: Array<{ x: number; y: number }>,
  products: Product[],
  config: InstanceGenerationConfig,
  rng: () => number
): Array<Record<string, number | null>> {
  switch (config.priceMode) {
    case 'random':
      return generateRandomPrices(markets, products, config, rng);
    case 'geoCorrelated':
      return generateGeoCorrelatedPrices(markets, products, config, rng);
    case 'specialist':
      return generateSpecialistPrices(markets, products, config, rng);
    case 'warehouse':
      return generateWarehousePrices(markets, products, config, rng);
    default:
      return generateRandomPrices(markets, products, config, rng);
  }
}

function generateRandomPrices(
  markets: Array<{ x: number; y: number }>,
  products: Product[],
  config: InstanceGenerationConfig,
  rng: () => number
): Array<Record<string, number | null>> {
  const { availabilityDensity, minPrice, maxPrice } = config;
  return markets.map(() => {
    const prices: Record<string, number | null> = {};
    for (const product of products) {
      if (rng() < availabilityDensity) {
        prices[product.id] = Math.round((minPrice + rng() * (maxPrice - minPrice)) * 100) / 100;
      } else {
        prices[product.id] = null;
      }
    }
    return prices;
  });
}

function generateGeoCorrelatedPrices(
  markets: Array<{ x: number; y: number }>,
  products: Product[],
  config: InstanceGenerationConfig,
  rng: () => number
): Array<Record<string, number | null>> {
  const { availabilityDensity, minPrice, maxPrice, width, height, priceNoise } = config;

  // Each product has a hidden "source" location — closer markets get cheaper prices
  const productSources: Array<{ x: number; y: number }> = products.map(() => ({
    x: rng() * width,
    y: rng() * height,
  }));

  // Maximum possible distance for normalization
  const maxDist = Math.sqrt(width ** 2 + height ** 2);

  return markets.map((market) => {
    const prices: Record<string, number | null> = {};
    for (let pi = 0; pi < products.length; pi++) {
      const product = products[pi];
      if (rng() < availabilityDensity) {
        const dist = euclidean(market.x, market.y, productSources[pi].x, productSources[pi].y);
        const normalizedDist = dist / maxDist;
        // Closer to source → cheaper. Add noise.
        const noise = (rng() * 2 - 1) * priceNoise * (maxPrice - minPrice);
        const rawPrice = minPrice + (maxPrice - minPrice) * normalizedDist + noise;
        prices[product.id] = Math.round(clamp(rawPrice, minPrice, maxPrice) * 100) / 100;
      } else {
        prices[product.id] = null;
      }
    }
    return prices;
  });
}

function generateSpecialistPrices(
  markets: Array<{ x: number; y: number }>,
  products: Product[],
  config: InstanceGenerationConfig,
  rng: () => number
): Array<Record<string, number | null>> {
  const { availabilityDensity, minPrice, maxPrice } = config;
  const priceRange = maxPrice - minPrice;

  return markets.map(() => {
    // Each market specializes in ~30% of products
    const specializations = new Set<string>();
    for (const product of products) {
      if (rng() < 0.3) {
        specializations.add(product.id);
      }
    }
    // Ensure at least one specialization
    if (specializations.size === 0 && products.length > 0) {
      specializations.add(products[seededInt(rng, 0, products.length - 1)].id);
    }

    const prices: Record<string, number | null> = {};
    for (const product of products) {
      if (specializations.has(product.id)) {
        // Specialized → low price, always available
        prices[product.id] =
          Math.round((minPrice + rng() * priceRange * 0.3) * 100) / 100;
      } else if (rng() < availabilityDensity) {
        // Non-specialized but available → high price
        prices[product.id] =
          Math.round((minPrice + priceRange * 0.6 + rng() * priceRange * 0.4) * 100) / 100;
      } else {
        prices[product.id] = null;
      }
    }
    return prices;
  });
}

function generateWarehousePrices(
  markets: Array<{ x: number; y: number }>,
  products: Product[],
  config: InstanceGenerationConfig,
  rng: () => number
): Array<Record<string, number | null>> {
  const { availabilityDensity, minPrice, maxPrice } = config;
  const priceRange = maxPrice - minPrice;

  // ~20% of markets are warehouses
  const isWarehouse: boolean[] = markets.map(() => rng() < 0.2);

  return markets.map((_, mi) => {
    const prices: Record<string, number | null> = {};
    if (isWarehouse[mi]) {
      // Warehouses have higher density (0.8) and medium prices
      for (const product of products) {
        if (rng() < 0.8) {
          prices[product.id] =
            Math.round((minPrice + priceRange * 0.3 + rng() * priceRange * 0.4) * 100) / 100;
        } else {
          prices[product.id] = null;
        }
      }
    } else {
      // Regular markets: use config density, may have lower prices for some products
      for (const product of products) {
        if (rng() < availabilityDensity) {
          // 30% chance of having a low price for a product (bargain)
          if (rng() < 0.3) {
            prices[product.id] =
              Math.round((minPrice + rng() * priceRange * 0.25) * 100) / 100;
          } else {
            prices[product.id] =
              Math.round((minPrice + rng() * priceRange) * 100) / 100;
          }
        } else {
          prices[product.id] = null;
        }
      }
    }
    return prices;
  });
}

// ---------------------------------------------------------------------------
// Feasibility Repair & Limits
// ---------------------------------------------------------------------------

/**
 * Enforces minProductsPerMarket and maxProductsPerMarket limits.
 */
function applyMarketLimits(
  markets: Market[],
  products: Product[],
  config: InstanceGenerationConfig,
  rng: () => number
) {
  const { minProductsPerMarket, maxProductsPerMarket, minPrice, maxPrice } = config;
  const priceRange = maxPrice - minPrice;

  for (const market of markets) {
    const availableProducts = Object.keys(market.prices).filter(pId => market.prices[pId] !== null);
    
    // Too many products? Trim randomly.
    if (availableProducts.length > maxProductsPerMarket) {
      // Shuffle available products and keep only maxProductsPerMarket
      const shuffled = [...availableProducts].sort(() => rng() - 0.5);
      const toRemove = shuffled.slice(maxProductsPerMarket);
      for (const pId of toRemove) {
        market.prices[pId] = null;
      }
    }
    
    // Too few products? Add randomly.
    if (availableProducts.length < minProductsPerMarket) {
      const currentCount = availableProducts.length;
      const needed = minProductsPerMarket - currentCount;
      const unavailableProducts = products.map(p => p.id).filter(pId => market.prices[pId] === null);
      
      const shuffled = [...unavailableProducts].sort(() => rng() - 0.5);
      const toAdd = shuffled.slice(0, needed);
      
      for (const pId of toAdd) {
        // Assign a standard random price
        market.prices[pId] = Math.round((minPrice + rng() * priceRange) * 100) / 100;
      }
    }
  }
}

/**
 * For each product with no available market, assign it to 1–3 random markets
 * with a valid price. This guarantees that every product can be purchased.
 */
function feasibilityRepair(
  markets: Market[],
  products: Product[],
  config: InstanceGenerationConfig,
  rng: () => number
): string[] {
  const repairedProducts: string[] = [];

  for (const product of products) {
    const hasSupplier = markets.some((m) => m.prices[product.id] !== null && m.prices[product.id] !== undefined);
    if (!hasSupplier) {
      repairedProducts.push(product.id);

      // Assign to 1–3 random markets
      const count = seededInt(rng, 1, Math.min(3, markets.length));
      const indices = new Set<number>();
      while (indices.size < count) {
        indices.add(seededInt(rng, 0, markets.length - 1));
      }

      for (const idx of indices) {
        // Give a mid-range price
        const price =
          config.minPrice +
          (config.maxPrice - config.minPrice) * (0.3 + rng() * 0.4);
        markets[idx].prices[product.id] = Math.round(price * 100) / 100;
      }
    }
  }

  return repairedProducts;
}

// ---------------------------------------------------------------------------
// Instance Statistics
// ---------------------------------------------------------------------------

function computeStatistics(
  markets: Market[],
  products: Product[],
  config: InstanceGenerationConfig
): InstanceStatistics {
  // Average availability per product
  let totalAvail = 0;
  let cheapest = Infinity;
  let expensive = -Infinity;

  for (const product of products) {
    let availCount = 0;
    for (const market of markets) {
      const price = market.prices[product.id];
      if (price !== null && price !== undefined) {
        availCount++;
        if (price < cheapest) cheapest = price;
        if (price > expensive) expensive = price;
      }
    }
    totalAvail += availCount;
  }
  const avgAvailabilityPerProduct =
    products.length > 0 ? totalAvail / products.length : 0;

  // Average products per market
  let totalProductsInMarkets = 0;
  for (const market of markets) {
    for (const product of products) {
      if (market.prices[product.id] !== null && market.prices[product.id] !== undefined) {
        totalProductsInMarkets++;
      }
    }
  }
  const avgProductsPerMarket =
    markets.length > 0 ? totalProductsInMarkets / markets.length : 0;

  // Coordinate spread: maximum distance between any two markets
  let maxDist = 0;
  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const d = euclidean(markets[i].x, markets[i].y, markets[j].x, markets[j].y);
      if (d > maxDist) maxDist = d;
    }
  }

  // Difficulty score based on problem characteristics
  const estimatedDifficultyScore = computeDifficultyScore(
    markets.length,
    products.length,
    avgAvailabilityPerProduct / Math.max(markets.length, 1),
    expensive - cheapest,
    maxDist,
    config.width
  );

  return {
    avgAvailabilityPerProduct: Math.round(avgAvailabilityPerProduct * 100) / 100,
    avgProductsPerMarket: Math.round(avgProductsPerMarket * 100) / 100,
    cheapestProductPrice: cheapest === Infinity ? 0 : cheapest,
    mostExpensiveProductPrice: expensive === -Infinity ? 0 : expensive,
    coordinateSpread: Math.round(maxDist * 100) / 100,
    estimatedDifficultyScore: Math.round(estimatedDifficultyScore * 100) / 100,
  };
}

/**
 * Difficulty score heuristic.
 * Higher = harder. Takes into account:
 * - Number of markets and products (more = harder)
 * - Density (lower = harder, since fewer purchasing options)
 * - Price variance (higher = harder, more tradeoffs to consider)
 * - Spread (larger = harder, more travel cost)
 */
function computeDifficultyScore(
  nMarkets: number,
  nProducts: number,
  densityRatio: number,
  priceRange: number,
  spread: number,
  worldWidth: number
): number {
  // Scale factor: grows with problem size
  const sizeFactor = Math.log2(Math.max(nMarkets * nProducts, 1)) / 10;

  // Lower density makes it harder (fewer choices)
  const densityFactor = 1 - clamp(densityRatio, 0, 1);

  // Higher price variance → more complex trade-offs
  const priceFactor = priceRange > 0 ? Math.min(priceRange / 100, 1) : 0;

  // Larger spread relative to world → more travel cost matters
  const spreadFactor = worldWidth > 0 ? clamp(spread / (worldWidth * 1.4), 0, 1) : 0;

  return (sizeFactor * 0.4 + densityFactor * 0.25 + priceFactor * 0.15 + spreadFactor * 0.2) * 100;
}

function mapDifficultyScore(score: number): DifficultyLevel {
  if (score < 25) return 'Easy';
  if (score < 50) return 'Medium';
  if (score < 75) return 'Hard';
  return 'Very Hard';
}

// ---------------------------------------------------------------------------
// Main Generator
// ---------------------------------------------------------------------------

/**
 * Generate a full TPP instance from a configuration object.
 * The instance is guaranteed to be feasible: every product has at least one
 * market that sells it. If the random generation fails to provide this,
 * a feasibility repair pass assigns orphan products to random markets.
 */
export function generateInstance(config: InstanceGenerationConfig): TPPInstance {
  const rng = mulberry32(config.seed ?? Math.floor(Math.random() * 999999));

  let projection: GeoProjection | undefined = undefined;
  let geojson: any = undefined;
  let mapPathData: string | undefined = undefined;

  if (config.mapBoundary === 'portugal') {
    geojson = PRT_GEOJSON;
  } else if (config.mapBoundary === 'usa') {
    geojson = USA_GEOJSON;
  }

  if (geojson) {
    projection = geoMercator().fitSize([config.width, config.height], geojson);
    const pathGenerator = geoPath().projection(projection);
    mapPathData = pathGenerator(geojson) || undefined;
  }

  // 1. Generate products
  const products = generateProducts(config, rng);

  // 2. Generate market positions
  const positions = generateMarketPositions(config, rng, projection, geojson);

  // 3. Generate prices for each market-product pair
  const allPrices = generatePrices(positions, products, config, rng);

  // 4. Assemble Market objects
  const markets: Market[] = positions.map((pos, i) => ({
    id: `m${i}`,
    name: `Market ${i + 1}`,
    x: Math.round(pos.x * 100) / 100,
    y: Math.round(pos.y * 100) / 100,
    prices: allPrices[i],
  }));

  // 4. Feasibility check: Min/Max limits per market
  applyMarketLimits(markets, products, config, rng);

  // 5. Feasibility repair: ensure every product can be bought somewhere
  const repairedProducts = feasibilityRepair(markets, products, config, rng);

  // 6. Depot
  const depot: Depot = { x: config.depotX, y: config.depotY };

  // 7. Statistics & difficulty
  const statistics = computeStatistics(markets, products, config);
  const difficulty = mapDifficultyScore(statistics.estimatedDifficultyScore);

  // 8. Metadata
  const metadata: InstanceMetadata = {
    feasibilityRepairApplied: repairedProducts.length > 0,
    repairedProducts,
    statistics,
    difficulty,
    generationConfig: { ...config },
  };

  return {
    depot,
    markets,
    products,
    travelCostMultiplier: config.travelCostMultiplier,
    metadata,
    mapPathData,
  };
}
