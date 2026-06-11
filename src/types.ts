// ============================================================================
// TPP Visualizer — Core Type Definitions
// ============================================================================

// --- Problem Domain Types ---

export type Product = {
  id: string;
  name: string;
  demand: number;
};

export type Market = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Maps product ID → price. null means the product is not available at this market. */
  prices: Record<string, number | null>;
};

export type Depot = {
  x: number;
  y: number;
};

export type PurchaseAssignment = {
  productId: string;
  marketId: string;
  quantity: number;
  price: number;
};

// --- Solution Types ---

export type Solution = {
  /** Ordered list of market IDs representing the route (excluding depot, which is implicit start/end) */
  route: string[];
  /** Set of market IDs selected for visiting */
  selectedMarkets: string[];
  /** Product-to-market purchase assignments */
  assignments: PurchaseAssignment[];
  travelCost: number;
  purchaseCost: number;
  penaltyCost: number;
  totalCost: number;
  feasible: boolean;
  violations: RuleViolation[];
};

export type HeuristicStep = {
  stepNumber: number;
  action: string;
  explanation: string;
  solution: Solution;
  highlightedMarkets?: string[];
  highlightedProducts?: string[];
};

export type HeuristicType =
  | 'cheapestPurchaseFirst'
  | 'greedyInsertion'
  | 'regretConstruction'
  | 'productAnxiety'
  | 'localSearch';

// --- Instance Types ---

export type TPPInstance = {
  depot: Depot;
  markets: Market[];
  products: Product[];
  travelCostMultiplier: number;
  /** Metadata about generation */
  metadata?: InstanceMetadata;
  mapPathData?: string;
};

export type InstanceMetadata = {
  feasibilityRepairApplied: boolean;
  repairedProducts: string[];
  statistics: InstanceStatistics;
  difficulty: DifficultyLevel;
  generationConfig?: InstanceGenerationConfig;
};

export type InstanceStatistics = {
  avgAvailabilityPerProduct: number;
  avgProductsPerMarket: number;
  cheapestProductPrice: number;
  mostExpensiveProductPrice: number;
  coordinateSpread: number;
  estimatedDifficultyScore: number;
};

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Very Hard';

// --- Instance Generation Config ---

export type SpatialMode = 'uniform' | 'clustered' | 'grid';
export type PriceMode = 'random' | 'geoCorrelated' | 'specialist' | 'warehouse';
export type DemandMode = 'fixed' | 'random';
export type MapBoundary = 'none' | 'portugal' | 'usa';

export type InstanceGenerationConfig = {
  nMarkets: number;
  nProducts: number;
  depotX: number;
  depotY: number;
  width: number;
  height: number;
  availabilityDensity: number; // 0 to 1
  minPrice: number;
  maxPrice: number;
  priceNoise: number;
  travelCostMultiplier: number;
  demandMode: DemandMode;
  fixedDemand: number;
  minDemand: number;
  maxDemand: number;
  seed?: number;
  spatialMode: SpatialMode;
  priceMode: PriceMode;
  mapBoundary: MapBoundary;
  // Market Maker properties
  minProductsPerMarket: number;
  maxProductsPerMarket: number;
};

// --- Constraint / Rule Types ---

export type ConstraintSeverity = 'hard' | 'soft';

export type RuleScope =
  | 'product'
  | 'market'
  | 'route'
  | 'purchase'
  | 'solution';

export type RuleType =
  | 'products_cannot_be_bought_together'
  | 'products_cannot_share_market'
  | 'markets_cannot_both_be_visited'
  | 'market_requires_product'
  | 'product_requires_product'
  | 'product_requires_market'
  | 'market_forbids_product'
  | 'route_forbidden_edge'
  | 'route_requires_edge'
  | 'route_max_distance_between_markets'
  | 'route_precedence'
  | 'budget_limit'
  | 'max_markets'
  | 'min_markets'
  | 'must_visit_market'
  | 'forbidden_market'
  | 'must_buy_product_at_market'
  | 'forbidden_purchase_assignment';

export type IncompatibilityRule = {
  id: string;
  name: string;
  description: string;
  severity: ConstraintSeverity;
  penalty?: number;
  scope: RuleScope;
  type: RuleType;
  enabled: boolean;
  productIds?: string[];
  marketIds?: string[];
  edge?: {
    fromMarketId: string;
    toMarketId: string;
  };
  orderedPair?: {
    beforeMarketId: string;
    afterMarketId: string;
  };
  value?: number;
};

export type RuleViolation = {
  ruleId: string;
  ruleName: string;
  severity: ConstraintSeverity;
  message: string;
  penalty: number;
  affectedProducts: string[];
  affectedMarkets: string[];
  affectedEdges: Array<{
    fromMarketId: string;
    toMarketId: string;
  }>;
};

export type Rulebook = {
  id: string;
  name: string;
  description: string;
  rules: IncompatibilityRule[];
};

// --- Constraint Generation Config ---

export type BudgetTightness = 'loose' | 'medium' | 'tight';

export type ConstraintGenerationConfig = {
  enableConstraints: boolean;
  hardRuleRatio: number;
  softRuleRatio: number;
  productIncompatibilityCount: number;
  marketIncompatibilityCount: number;
  forbiddenEdgeCount: number;
  requiredEdgeCount: number;
  precedenceRuleCount: number;
  budgetTightness: BudgetTightness;
  maxMarketsEnabled: boolean;
  minMarketsEnabled: boolean;
  mustVisitMarketCount: number;
  forbiddenMarketCount: number;
  forbiddenAssignmentCount: number;
};

// --- UI State Types ---

export type SearchMode = 'strict' | 'repair' | 'penalty';

export type UISettings = {
  animationSpeed: number; // ms per step (50-2000)
  searchMode: SearchMode;
  selectedHeuristic: HeuristicType;
  showTooltips: boolean;
  showRuleOverlays: boolean;
  isManualMode: boolean;
};

export type AppState = {
  instance: TPPInstance | null;
  solution: Solution | null;
  heuristicSteps: HeuristicStep[];
  currentStepIndex: number;
  isRunning: boolean;
  isPaused: boolean;
  rulebook: Rulebook;
  uiSettings: UISettings;
  generationConfig: InstanceGenerationConfig;
  constraintConfig: ConstraintGenerationConfig;
};

// --- Action Types for Reducer ---

export type AppAction =
  | { type: 'SET_INSTANCE'; payload: TPPInstance }
  | { type: 'SET_SOLUTION'; payload: Solution | null }
  | { type: 'SET_HEURISTIC_STEPS'; payload: HeuristicStep[] }
  | { type: 'SET_CURRENT_STEP'; payload: number }
  | { type: 'STEP_FORWARD' }
  | { type: 'STEP_BACKWARD' }
  | { type: 'SET_RUNNING'; payload: boolean }
  | { type: 'SET_PAUSED'; payload: boolean }
  | { type: 'SET_RULEBOOK'; payload: Rulebook }
  | { type: 'UPDATE_UI_SETTINGS'; payload: Partial<UISettings> }
  | { type: 'UPDATE_GENERATION_CONFIG'; payload: Partial<InstanceGenerationConfig> }
  | { type: 'UPDATE_CONSTRAINT_CONFIG'; payload: Partial<ConstraintGenerationConfig> }
  | { type: 'TOGGLE_MARKET'; payload: string }
  // Market Maker Actions
  | { type: 'ADD_MARKET'; payload: { x: number; y: number } }
  | { type: 'UPDATE_MARKET'; payload: { id: string; market: Partial<Market> } }
  | { type: 'REMOVE_MARKET'; payload: string }
  | { type: 'UPDATE_PRODUCT'; payload: { id: string; product: Partial<Product> } }
  | { type: 'ADD_PRODUCT'; payload: { name: string; demand: number } }
  | { type: 'REMOVE_PRODUCT'; payload: string }
  | { type: 'RESET_SOLUTION' }
  | { type: 'RESET_ALL' };

// --- Helper type for the empty/initial solution ---

export const EMPTY_SOLUTION: Solution = {
  route: [],
  selectedMarkets: [],
  assignments: [],
  travelCost: 0,
  purchaseCost: 0,
  penaltyCost: 0,
  totalCost: 0,
  feasible: false,
  violations: [],
};

export const EMPTY_RULEBOOK: Rulebook = {
  id: 'default',
  name: 'Default Rulebook',
  description: 'No constraints',
  rules: [],
};

export const DEFAULT_UI_SETTINGS: UISettings = {
  animationSpeed: 500,
  searchMode: 'strict',
  selectedHeuristic: 'cheapestPurchaseFirst',
  showTooltips: true,
  showRuleOverlays: true,
  isManualMode: false,
};

export const DEFAULT_GENERATION_CONFIG: InstanceGenerationConfig = {
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
  maxDemand: 5,
  seed: 42,
  spatialMode: 'uniform',
  priceMode: 'random',
  mapBoundary: 'none',
  minProductsPerMarket: 1,
  maxProductsPerMarket: 10,
};

export const DEFAULT_CONSTRAINT_CONFIG: ConstraintGenerationConfig = {
  enableConstraints: false,
  hardRuleRatio: 0.5,
  softRuleRatio: 0.5,
  productIncompatibilityCount: 0,
  marketIncompatibilityCount: 0,
  forbiddenEdgeCount: 0,
  requiredEdgeCount: 0,
  precedenceRuleCount: 0,
  budgetTightness: 'loose',
  maxMarketsEnabled: false,
  minMarketsEnabled: false,
  mustVisitMarketCount: 0,
  forbiddenMarketCount: 0,
  forbiddenAssignmentCount: 0,
};
