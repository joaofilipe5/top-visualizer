import { useMemo } from 'react';
import { useTPP } from '../state/context';

export default function ProductPanel() {
  const { state } = useTPP();
  const { instance, solution, heuristicSteps, currentStepIndex } = state;

  const currentStep = useMemo(() => {
    if (currentStepIndex >= 0 && currentStepIndex < heuristicSteps.length) {
      return heuristicSteps[currentStepIndex];
    }
    return null;
  }, [heuristicSteps, currentStepIndex]);

  const highlightedProducts = useMemo(
    () => new Set(currentStep?.highlightedProducts ?? []),
    [currentStep]
  );

  const productData = useMemo(() => {
    if (!instance) return [];
    return instance.products.map((product) => {
      // Find assignment for this product
      const assignment = solution?.assignments.find((a) => a.productId === product.id);
      const isCovered = !!assignment;
      const assignedMarket = assignment
        ? instance.markets.find((m) => m.id === assignment.marketId)
        : null;
      const price = assignment ? assignment.price : null;
      return {
        ...product,
        isCovered,
        assignedMarketName: assignedMarket?.name ?? null,
        price,
        isHighlighted: highlightedProducts.has(product.id),
      };
    });
  }, [instance, solution, highlightedProducts]);

  const summary = useMemo(() => {
    const total = productData.length;
    const covered = productData.filter((p) => p.isCovered).length;
    return { total, covered, uncovered: total - covered };
  }, [productData]);

  if (!instance) {
    return (
      <aside className="panel-left" aria-label="Products panel">
        <div className="panel-section">
          <div className="panel-section__title">Products</div>
        </div>
        <div className="placeholder">
          <span className="placeholder__icon">📦</span>
          <span className="placeholder__text">Generate an instance to see products</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel-left" aria-label="Products panel" id="product-panel">
      <div className="panel-section">
        <div className="panel-section__title">Products</div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
          <div className="text-xs">
            <span className="text-muted">Total </span>
            <span className="font-semibold">{summary.total}</span>
          </div>
          <div className="text-xs">
            <span style={{ color: 'var(--color-covered)' }}>Covered </span>
            <span className="font-semibold" style={{ color: 'var(--color-covered)' }}>{summary.covered}</span>
          </div>
          <div className="text-xs">
            <span style={{ color: 'var(--color-uncovered)' }}>Uncov. </span>
            <span className="font-semibold" style={{ color: 'var(--color-uncovered)' }}>{summary.uncovered}</span>
          </div>
        </div>
      </div>

      <div className="panel-scrollable">
        {productData.map((product) => {
          const statusClass = product.isCovered ? 'product-item--covered' : 'product-item--uncovered';
          const highlightClass = product.isHighlighted ? 'product-item--highlighted' : '';
          return (
            <div
              key={product.id}
              className={`product-item ${statusClass} ${highlightClass}`}
              id={`product-item-${product.id}`}
              title={`${product.name} — Demand: ${product.demand}`}
            >
              <div>
                <div className="product-item__name">{product.name}</div>
                <div className="product-item__detail">
                  Demand: {product.demand}
                  {product.assignedMarketName && (
                    <> · {product.assignedMarketName}</>
                  )}
                </div>
              </div>

              {product.price !== null && (
                <span className="product-item__price">${product.price.toFixed(2)}</span>
              )}

              {product.isCovered ? (
                <span className="badge badge--covered">✓</span>
              ) : (
                <span className="badge badge--uncovered">✗</span>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
