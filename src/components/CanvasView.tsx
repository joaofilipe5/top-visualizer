import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useTPP } from '../state/context';
import type { Market } from '../types';

// ============================================================================
// Types
// ============================================================================

type ViewBox = { x: number; y: number; width: number; height: number };

type TooltipData = {
  market: Market;
  screenX: number;
  screenY: number;
};

// ============================================================================
// Constants
// ============================================================================

const MARKET_RADIUS = 2.5;
const DEPOT_SIZE = 4;
const LABEL_OFFSET = 4;
const PADDING = 15;
const MIN_ZOOM = 10;
const MAX_ZOOM = 500;
const ZOOM_FACTOR = 0.1;

// ============================================================================
// Component
// ============================================================================

export default function CanvasView() {
  const { state, dispatch } = useTPP();
  const { instance, solution, heuristicSteps, currentStepIndex, rulebook, uiSettings } = state;

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan state
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, width: 100, height: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; vbx: number; vby: number } | null>(null);

  // Tooltip
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Current step highlights
  const currentStep = useMemo(() => {
    if (currentStepIndex >= 0 && currentStepIndex < heuristicSteps.length) {
      return heuristicSteps[currentStepIndex];
    }
    return null;
  }, [heuristicSteps, currentStepIndex]);

  const highlightedMarketSet = useMemo(
    () => new Set(currentStep?.highlightedMarkets ?? []),
    [currentStep]
  );

  const selectedMarketSet = useMemo(
    () => new Set(solution?.selectedMarkets ?? []),
    [solution]
  );

  // Fit to content
  const fitToContent = useCallback(() => {
    if (!instance) return;
    const allX = [instance.depot.x, ...instance.markets.map((m) => m.x)];
    const allY = [instance.depot.y, ...instance.markets.map((m) => m.y)];
    const minX = Math.min(...allX) - PADDING;
    const minY = Math.min(...allY) - PADDING;
    const maxX = Math.max(...allX) + PADDING;
    const maxY = Math.max(...allY) + PADDING;
    setViewBox({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    });
  }, [instance]);

  // Fit on instance change
  useEffect(() => {
    fitToContent();
  }, [fitToContent]);

  // Coordinate transform: screen → SVG
  const screenToSVG = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = viewBox.x + ((screenX - rect.left) / rect.width) * viewBox.width;
      const y = viewBox.y + ((screenY - rect.top) / rect.height) * viewBox.height;
      return { x, y };
    },
    [viewBox]
  );

  // Pan handlers
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      // Only start dragging if we didn't click on a market circle
      const target = e.target as SVGElement;
      if (target.classList.contains('market-node') || target.closest('.market-group')) {
        return; // let click handler fire instead
      }
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        vbx: viewBox.x,
        vby: viewBox.y,
      };
      (e.target as SVGSVGElement).setPointerCapture?.(e.pointerId);
    },
    [viewBox.x, viewBox.y]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!isDragging || !dragStart.current) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - dragStart.current.x) / rect.width) * viewBox.width;
      const dy = ((e.clientY - dragStart.current.y) / rect.height) * viewBox.height;
      setViewBox((vb) => ({
        ...vb,
        x: dragStart.current!.vbx - dx,
        y: dragStart.current!.vby - dy,
      }));
    },
    [isDragging, viewBox.width, viewBox.height]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
  }, []);

  // Zoom handler
  const handleWheel = useCallback(
    (e: ReactWheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;

      const cursor = screenToSVG(e.clientX, e.clientY);
      const direction = e.deltaY > 0 ? 1 : -1;
      const factor = 1 + direction * ZOOM_FACTOR;

      setViewBox((vb) => {
        const newWidth = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vb.width * factor));
        const newHeight = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vb.height * factor));
        const ratio = newWidth / vb.width;
        return {
          x: cursor.x - (cursor.x - vb.x) * ratio,
          y: cursor.y - (cursor.y - vb.y) * ratio,
          width: newWidth,
          height: newHeight,
        };
      });
    },
    [screenToSVG]
  );

  // Market click
  const handleMarketClick = useCallback(
    (marketId: string) => {
      if (uiSettings.isManualMode) {
        const newName = prompt('Enter new market name:');
        if (newName) {
          dispatch({ type: 'UPDATE_MARKET', payload: { id: marketId, market: { name: newName } } });
        }
      } else {
        dispatch({ type: 'TOGGLE_MARKET', payload: marketId });
      }
    },
    [dispatch, uiSettings.isManualMode]
  );

  // SVG Click (for adding markets manually)
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!uiSettings.isManualMode) return;
      
      const target = e.target as SVGElement;
      if (target.classList.contains('market-node') || target.closest('.market-group')) {
        return; // Handled by market click
      }

      // Ensure this was a click, not the end of a drag
      if (dragStart.current && (Math.abs(e.clientX - dragStart.current.x) > 5 || Math.abs(e.clientY - dragStart.current.y) > 5)) {
        return;
      }

      const svgCoords = screenToSVG(e.clientX, e.clientY);
      dispatch({ 
        type: 'ADD_MARKET', 
        payload: { x: Math.round(svgCoords.x), y: Math.round(svgCoords.y) } 
      });
    },
    [uiSettings.isManualMode, screenToSVG, dispatch]
  );

  // Market hover
  const handleMarketEnter = useCallback(
    (market: Market, e: React.MouseEvent) => {
      if (!uiSettings.showTooltips) return;
      setTooltip({
        market,
        screenX: e.clientX,
        screenY: e.clientY,
      });
    },
    [uiSettings.showTooltips]
  );

  const handleMarketLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Route points for polyline
  const routePoints = useMemo(() => {
    if (!instance || !solution || solution.route.length === 0) return null;
    const marketMap = new Map(instance.markets.map((m) => [m.id, m]));
    const points: Array<{ x: number; y: number }> = [];
    // Start at depot
    points.push({ x: instance.depot.x, y: instance.depot.y });
    // Through route
    for (const mId of solution.route) {
      const m = marketMap.get(mId);
      if (m) points.push({ x: m.x, y: m.y });
    }
    // Back to depot
    points.push({ x: instance.depot.x, y: instance.depot.y });
    return points;
  }, [instance, solution]);

  // Constraint overlays
  const constraintOverlays = useMemo(() => {
    if (!uiSettings.showRuleOverlays || !instance) return { forbiddenEdges: [], requiredEdges: [] };
    const marketMap = new Map(instance.markets.map((m) => [m.id, m]));
    const forbiddenEdges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const requiredEdges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    for (const rule of rulebook.rules) {
      if (!rule.enabled) continue;
      if (rule.type === 'route_forbidden_edge' && rule.edge) {
        const from = marketMap.get(rule.edge.fromMarketId);
        const to = marketMap.get(rule.edge.toMarketId);
        if (from && to) forbiddenEdges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      }
      if (rule.type === 'route_requires_edge' && rule.edge) {
        const from = marketMap.get(rule.edge.fromMarketId);
        const to = marketMap.get(rule.edge.toMarketId);
        if (from && to) requiredEdges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      }
    }
    return { forbiddenEdges, requiredEdges };
  }, [uiSettings.showRuleOverlays, instance, rulebook.rules]);

  // Violation market set
  const violationMarketSet = useMemo(() => {
    const set = new Set<string>();
    if (solution) {
      for (const v of solution.violations) {
        for (const mid of v.affectedMarkets) set.add(mid);
      }
    }
    return set;
  }, [solution]);

  // Tooltip product info
  const tooltipContent = useMemo(() => {
    if (!tooltip || !instance) return null;
    const { market } = tooltip;
    const productEntries = instance.products
      .filter((p) => market.prices[p.id] != null)
      .map((p) => ({
        name: p.name,
        price: market.prices[p.id] as number,
      }));
    const isSelected = selectedMarketSet.has(market.id);
    const isHighlighted = highlightedMarketSet.has(market.id);
    const hasViolation = violationMarketSet.has(market.id);
    return { market, productEntries, isSelected, isHighlighted, hasViolation };
  }, [tooltip, instance, selectedMarketSet, highlightedMarketSet, violationMarketSet]);

  // Label positions (Collision Avoidance)
  const labelPlacements = useMemo(() => {
    if (!instance) return new Map();
    
    // A simple grid or spatial hash is better, but N<=200 is small enough for O(N^2)
    type Rect = { x: number; y: number; w: number; h: number };
    const placedBoxes: Rect[] = [];
    const placements = new Map<string, { x: number; y: number; opacity: number; showLine?: boolean; lineToX?: number; lineToY?: number }>();
    
    const fontSize = 1.8;
    const charWidth = fontSize * 0.6; // Approximation of character width in SVG units
    
    // Add nodes as obstacles to avoid labels covering markets or depot
    const nodeObstacles: Rect[] = [
      { x: instance.depot.x - DEPOT_SIZE, y: instance.depot.y - DEPOT_SIZE, w: DEPOT_SIZE * 2, h: DEPOT_SIZE * 2 }
    ];
    for (const m of instance.markets) {
      nodeObstacles.push({ x: m.x - MARKET_RADIUS, y: m.y - MARKET_RADIUS, w: MARKET_RADIUS * 2, h: MARKET_RADIUS * 2 });
    }

    const checkCollision = (box: Rect) => {
      // Add slight padding to the box
      const bx = box.x - 0.5, by = box.y - 0.5, bw = box.w + 1, bh = box.h + 1;
      
      for (const other of placedBoxes) {
        if (bx < other.x + other.w && bx + bw > other.x &&
            by < other.y + other.h && by + bh > other.y) return true;
      }
      for (const other of nodeObstacles) {
        if (bx < other.x + other.w && bx + bw > other.x &&
            by < other.y + other.h && by + bh > other.y) return true;
      }
      return false;
    };

    for (const market of instance.markets) {
      const w = market.name.length * charWidth;
      const h = fontSize;
      
      // Candidate positions relative to market center
      // [dx, dy] where dx is center of text, dy is bottom of text
      const candidates = [
        { dx: 0, dy: MARKET_RADIUS + LABEL_OFFSET + h * 0.8 }, // Bottom
        { dx: 0, dy: -MARKET_RADIUS - LABEL_OFFSET }, // Top
        { dx: MARKET_RADIUS + LABEL_OFFSET + w / 2, dy: h * 0.3 }, // Right
        { dx: -MARKET_RADIUS - LABEL_OFFSET - w / 2, dy: h * 0.3 }, // Left
        { dx: MARKET_RADIUS + LABEL_OFFSET, dy: MARKET_RADIUS + LABEL_OFFSET + h * 0.5 }, // Bottom-Right
        { dx: -MARKET_RADIUS - LABEL_OFFSET, dy: MARKET_RADIUS + LABEL_OFFSET + h * 0.5 }, // Bottom-Left
        { dx: MARKET_RADIUS + LABEL_OFFSET, dy: -MARKET_RADIUS - LABEL_OFFSET }, // Top-Right
        { dx: -MARKET_RADIUS - LABEL_OFFSET, dy: -MARKET_RADIUS - LABEL_OFFSET }, // Top-Left
      ];

      let placed = false;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const box = { x: market.x + c.dx - w / 2, y: market.y + c.dy - h, w, h };
        if (!checkCollision(box)) {
          placedBoxes.push(box);
          placements.set(market.id, { 
            x: market.x + c.dx, 
            y: market.y + c.dy, 
            opacity: 1,
            showLine: i > 3, // show leader line for diagonals
            lineToX: market.x + (c.dx > 0 ? MARKET_RADIUS : c.dx < 0 ? -MARKET_RADIUS : 0),
            lineToY: market.y + (c.dy > 0 ? MARKET_RADIUS : c.dy < 0 ? -MARKET_RADIUS : 0)
          });
          placed = true;
          break;
        }
      }

      // Fallback: hide the label (or lower opacity drastically) if no space
      if (!placed) {
        placements.set(market.id, { x: market.x, y: market.y + MARKET_RADIUS + LABEL_OFFSET + h * 0.8, opacity: 0 });
      }
    }
    
    return placements;
  }, [instance]);

  // Market color determination
  const getMarketColor = useCallback(
    (market: Market): string => {
      if (violationMarketSet.has(market.id)) return 'var(--color-hard-violation)';
      if (selectedMarketSet.has(market.id)) return 'var(--color-selected)';
      if (highlightedMarketSet.has(market.id)) return 'var(--color-candidate)';
      return 'var(--color-rejected)';
    },
    [selectedMarketSet, highlightedMarketSet, violationMarketSet]
  );

  const getMarketOpacity = useCallback(
    (market: Market): number => {
      if (selectedMarketSet.has(market.id) || highlightedMarketSet.has(market.id)) return 1;
      if (violationMarketSet.has(market.id)) return 0.9;
      return 0.4;
    },
    [selectedMarketSet, highlightedMarketSet, violationMarketSet]
  );

  // Render nothing if no instance
  if (!instance) {
    return (
      <main className="canvas-area" aria-label="Canvas">
        <div className="welcome-screen">
          <div className="welcome-screen__icon">🗺️</div>
          <h2 className="welcome-screen__title">TPP Visualizer</h2>
          <p className="welcome-screen__subtitle">
            Generate a problem instance from the Instance tab to begin exploring the Traveling Purchaser Problem.
          </p>
        </div>
      </main>
    );
  }

  const vbString = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

  return (
    <main className="canvas-area" ref={containerRef} aria-label="Canvas" id="canvas-view">
      <svg
        ref={svgRef}
        className={`canvas-svg ${isDragging ? 'canvas-svg--dragging' : ''}`}
        viewBox={vbString}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleSvgClick}
        onWheel={handleWheel}
        id="canvas-svg"
      >
        {/* Defs */}
        <defs>
          {/* Grid pattern */}
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.15"
            />
          </pattern>
        </defs>

        {/* Layer 1: Grid background */}
        <rect
          x={viewBox.x - viewBox.width}
          y={viewBox.y - viewBox.height}
          width={viewBox.width * 3}
          height={viewBox.height * 3}
          fill="url(#grid)"
        />

        {/* Layer 1.5: Map Boundary */}
        {instance.mapPathData && (
          <path
            d={instance.mapPathData}
            fill="var(--color-bg-secondary)"
            stroke="var(--color-border)"
            strokeWidth={0.5}
            opacity={0.8}
            pointerEvents="none"
          />
        )}

        {/* Layer 2: Constraint overlays */}
        {constraintOverlays.forbiddenEdges.map((edge, i) => (
          <line
            key={`forbidden-${i}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="var(--color-hard-violation)"
            strokeWidth={0.4}
            strokeDasharray="1.5 1"
            opacity={0.6}
          />
        ))}
        {constraintOverlays.requiredEdges.map((edge, i) => (
          <line
            key={`required-${i}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="#22c55e"
            strokeWidth={0.4}
            strokeDasharray="1.5 1"
            opacity={0.6}
          />
        ))}

        {/* Layer 3: Route */}
        {routePoints && routePoints.length > 1 && (
          <polyline
            points={routePoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="var(--color-route)"
            strokeWidth={0.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
            style={{ transition: 'all 300ms ease' }}
          />
        )}

        {/* Layer 4: Markets */}
        {instance.markets.map((market) => {
          const color = getMarketColor(market);
          const opacity = getMarketOpacity(market);
          const isSelected = selectedMarketSet.has(market.id);
          const isHighlighted = highlightedMarketSet.has(market.id);
          const hasViolation = violationMarketSet.has(market.id);

          return (
            <g
              key={market.id}
              className="market-group"
              style={{ cursor: 'pointer' }}
              onClick={() => handleMarketClick(market.id)}
              onMouseEnter={(e) => handleMarketEnter(market, e)}
              onMouseLeave={handleMarketLeave}
            >
              {/* Violation ring */}
              {hasViolation && (
                <circle
                  cx={market.x}
                  cy={market.y}
                  r={MARKET_RADIUS + 1.2}
                  fill="none"
                  stroke="var(--color-hard-violation)"
                  strokeWidth={0.4}
                  opacity={0.7}
                >
                  <animate
                    attributeName="r"
                    from={String(MARKET_RADIUS + 1)}
                    to={String(MARKET_RADIUS + 3)}
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.7"
                    to="0"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {/* Highlight pulse for candidate markets */}
              {isHighlighted && !isSelected && (
                <circle
                  cx={market.x}
                  cy={market.y}
                  r={MARKET_RADIUS + 0.5}
                  fill="none"
                  stroke="var(--color-candidate)"
                  strokeWidth={0.3}
                  opacity={0.5}
                >
                  <animate
                    attributeName="r"
                    from={String(MARKET_RADIUS + 0.5)}
                    to={String(MARKET_RADIUS + 3)}
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.5"
                    to="0"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                className="market-node"
                cx={market.x}
                cy={market.y}
                r={MARKET_RADIUS}
                fill={color}
                opacity={opacity}
                style={{ transition: 'fill 150ms ease, opacity 150ms ease' }}
              />
              {/* Label */}
              {(() => {
                const placement = labelPlacements.get(market.id);
                if (!placement || placement.opacity === 0) return null;
                const baseOpacity = isSelected || isHighlighted ? 0.9 : 0.6;
                return (
                  <g style={{ transition: 'opacity 150ms ease' }} opacity={baseOpacity * placement.opacity}>
                    {placement.showLine && (
                      <line 
                        x1={market.x} y1={market.y} 
                        x2={placement.x} y2={placement.y - 1} 
                        stroke="var(--color-text-muted)" strokeWidth="0.2" opacity="0.5" 
                      />
                    )}
                    <text
                      x={placement.x}
                      y={placement.y}
                      textAnchor="middle"
                      fill="var(--color-text-secondary)"
                      fontSize={1.8}
                    >
                      {market.name}
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Layer 5: Depot */}
        <g>
          {/* Diamond shape */}
          <polygon
            points={`
              ${instance.depot.x},${instance.depot.y - DEPOT_SIZE}
              ${instance.depot.x + DEPOT_SIZE * 0.7},${instance.depot.y}
              ${instance.depot.x},${instance.depot.y + DEPOT_SIZE}
              ${instance.depot.x - DEPOT_SIZE * 0.7},${instance.depot.y}
            `}
            fill="var(--color-depot)"
            stroke="rgba(245, 158, 11, 0.5)"
            strokeWidth={0.3}
          />
          <text
            x={instance.depot.x}
            y={instance.depot.y + DEPOT_SIZE + LABEL_OFFSET + 1}
            textAnchor="middle"
            fill="var(--color-depot)"
            fontSize={2}
            fontWeight="bold"
          >
            Depot
          </text>
        </g>
      </svg>

      {/* Fit button */}
      <button
        className="btn btn--secondary btn--sm"
        onClick={fitToContent}
        id="btn-fit-canvas"
        aria-label="Fit to content"
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: 'var(--color-surface)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--color-border)',
          zIndex: 10,
        }}
      >
        ⊞ Fit
      </button>

      {/* Tooltip */}
      {tooltip && tooltipContent && (
        <div
          className="tooltip"
          style={{
            left: Math.min(tooltip.screenX + 12, window.innerWidth - 300),
            top: tooltip.screenY + 12,
          }}
        >
          <div className="tooltip__title">
            {tooltipContent.market.name}
            {tooltipContent.isSelected && (
              <span className="badge badge--cyan" style={{ marginLeft: 8 }}>Selected</span>
            )}
            {tooltipContent.hasViolation && (
              <span className="badge badge--infeasible" style={{ marginLeft: 8 }}>Violation</span>
            )}
          </div>
          <div className="tooltip__row">
            <span>Position</span>
            <span className="tooltip__row-value">
              ({tooltipContent.market.x.toFixed(1)}, {tooltipContent.market.y.toFixed(1)})
            </span>
          </div>
          {tooltipContent.productEntries.length > 0 && (
            <>
              <div className="tooltip__divider" />
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                Products Available ({tooltipContent.productEntries.length})
              </div>
              {tooltipContent.productEntries.slice(0, 6).map((pe) => (
                <div key={pe.name} className="tooltip__row">
                  <span>{pe.name}</span>
                  <span className="tooltip__row-value">${pe.price.toFixed(2)}</span>
                </div>
              ))}
              {tooltipContent.productEntries.length > 6 && (
                <div className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 4 }}>
                  +{tooltipContent.productEntries.length - 6} more
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
