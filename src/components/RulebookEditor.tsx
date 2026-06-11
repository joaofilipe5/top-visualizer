import { useCallback, useState, useMemo } from 'react';
import { useTPP } from '../state/context';
import type { IncompatibilityRule, RuleType, ConstraintSeverity } from '../types';

const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: 'products_cannot_be_bought_together', label: 'Products Cannot Be Bought Together' },
  { value: 'products_cannot_share_market', label: 'Products Cannot Share Market' },
  { value: 'markets_cannot_both_be_visited', label: 'Markets Cannot Both Be Visited' },
  { value: 'market_requires_product', label: 'Market Requires Product' },
  { value: 'product_requires_product', label: 'Product Requires Product' },
  { value: 'product_requires_market', label: 'Product Requires Market' },
  { value: 'market_forbids_product', label: 'Market Forbids Product' },
  { value: 'route_forbidden_edge', label: 'Route Forbidden Edge' },
  { value: 'route_requires_edge', label: 'Route Requires Edge' },
  { value: 'route_max_distance_between_markets', label: 'Max Distance Between Markets' },
  { value: 'route_precedence', label: 'Route Precedence' },
  { value: 'budget_limit', label: 'Budget Limit' },
  { value: 'max_markets', label: 'Max Markets' },
  { value: 'min_markets', label: 'Min Markets' },
  { value: 'must_visit_market', label: 'Must Visit Market' },
  { value: 'forbidden_market', label: 'Forbidden Market' },
  { value: 'must_buy_product_at_market', label: 'Must Buy Product at Market' },
  { value: 'forbidden_purchase_assignment', label: 'Forbidden Purchase Assignment' },
];

const EXAMPLE_RULEBOOKS = [
  { name: 'No Constraints', rules: [] },
  { name: 'Budget Only', description: 'Budget constraint' },
  { name: 'Market Limits', description: 'Min/Max market visit constraints' },
  { name: 'Product Conflicts', description: 'Product incompatibility rules' },
  { name: 'Route Restrictions', description: 'Edge and precedence constraints' },
];

function generateId(): string {
  return 'rule_' + Math.random().toString(36).slice(2, 9);
}

function ruleNeedsProductIds(type: RuleType): boolean {
  return [
    'products_cannot_be_bought_together',
    'products_cannot_share_market',
    'market_requires_product',
    'product_requires_product',
    'product_requires_market',
    'market_forbids_product',
    'must_buy_product_at_market',
    'forbidden_purchase_assignment',
  ].includes(type);
}

function ruleNeedsMarketIds(type: RuleType): boolean {
  return [
    'markets_cannot_both_be_visited',
    'market_requires_product',
    'product_requires_market',
    'market_forbids_product',
    'must_visit_market',
    'forbidden_market',
    'must_buy_product_at_market',
    'forbidden_purchase_assignment',
  ].includes(type);
}

function ruleNeedsEdge(type: RuleType): boolean {
  return ['route_forbidden_edge', 'route_requires_edge', 'route_max_distance_between_markets'].includes(type);
}

function ruleNeedsOrderedPair(type: RuleType): boolean {
  return type === 'route_precedence';
}

function ruleNeedsValue(type: RuleType): boolean {
  return ['route_max_distance_between_markets', 'budget_limit', 'max_markets', 'min_markets'].includes(type);
}

export default function RulebookEditor() {
  const { state, dispatch } = useTPP();
  const { rulebook, instance } = state;
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  const products = useMemo(() => instance?.products ?? [], [instance]);
  const markets = useMemo(() => instance?.markets ?? [], [instance]);

  const toggleExpand = useCallback((ruleId: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }, []);

  const updateRulebook = useCallback(
    (rules: IncompatibilityRule[]) => {
      dispatch({ type: 'SET_RULEBOOK', payload: { ...rulebook, rules } });
    },
    [dispatch, rulebook]
  );

  const updateRulebookName = useCallback(
    (name: string) => {
      dispatch({ type: 'SET_RULEBOOK', payload: { ...rulebook, name } });
    },
    [dispatch, rulebook]
  );

  const addRule = useCallback(() => {
    const newRule: IncompatibilityRule = {
      id: generateId(),
      name: 'New Rule',
      description: '',
      severity: 'hard',
      penalty: 0,
      scope: 'solution',
      type: 'budget_limit',
      enabled: true,
    };
    updateRulebook([...rulebook.rules, newRule]);
    setExpandedRules((prev) => new Set(prev).add(newRule.id));
  }, [rulebook.rules, updateRulebook]);

  const deleteRule = useCallback(
    (ruleId: string) => {
      updateRulebook(rulebook.rules.filter((r) => r.id !== ruleId));
    },
    [rulebook.rules, updateRulebook]
  );

  const updateRule = useCallback(
    (ruleId: string, patch: Partial<IncompatibilityRule>) => {
      updateRulebook(
        rulebook.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r))
      );
    },
    [rulebook.rules, updateRulebook]
  );

  const resetRulebook = useCallback(() => {
    dispatch({
      type: 'SET_RULEBOOK',
      payload: {
        id: 'default',
        name: 'Default Rulebook',
        description: 'No constraints',
        rules: [],
      },
    });
    setExpandedRules(new Set());
  }, [dispatch]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(rulebook, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tpp-rulebook.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [rulebook]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const rb = JSON.parse(ev.target?.result as string);
          dispatch({ type: 'SET_RULEBOOK', payload: rb });
        } catch {
          /* ignore */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [dispatch]);

  const toggleProductInRule = useCallback(
    (ruleId: string, productId: string) => {
      const rule = rulebook.rules.find((r) => r.id === ruleId);
      if (!rule) return;
      const current = rule.productIds ?? [];
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId];
      updateRule(ruleId, { productIds: next });
    },
    [rulebook.rules, updateRule]
  );

  const toggleMarketInRule = useCallback(
    (ruleId: string, marketId: string) => {
      const rule = rulebook.rules.find((r) => r.id === ruleId);
      if (!rule) return;
      const current = rule.marketIds ?? [];
      const next = current.includes(marketId)
        ? current.filter((id) => id !== marketId)
        : [...current, marketId];
      updateRule(ruleId, { marketIds: next });
    },
    [rulebook.rules, updateRule]
  );

  return (
    <section aria-label="Rulebook editor" id="rulebook-editor">
      {/* Rulebook Name */}
      <div className="input-group" style={{ marginBottom: 'var(--sp-4)' }}>
        <label className="input-group__label" htmlFor="rulebook-name">Rulebook Name</label>
        <input
          className="input input--sm"
          id="rulebook-name"
          type="text"
          value={rulebook.name}
          onChange={(e) => updateRulebookName(e.target.value)}
        />
      </div>

      {/* Action Buttons */}
      <div className="btn-row" style={{ marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <button className="btn btn--primary btn--sm" onClick={addRule} id="btn-add-rule">
          + New Rule
        </button>
        <button className="btn btn--secondary btn--sm" onClick={handleImport} id="btn-import-rulebook">
          Import
        </button>
        <button className="btn btn--secondary btn--sm" onClick={handleExport} id="btn-export-rulebook">
          Export
        </button>
        <button className="btn btn--danger btn--sm" onClick={resetRulebook} id="btn-reset-rulebook">
          Reset
        </button>
      </div>

      {/* Example Rulebooks */}
      <div className="input-group" style={{ marginBottom: 'var(--sp-4)' }}>
        <label className="input-group__label">Load Example</label>
        <select
          className="input input--sm"
          onChange={(e) => {
            const idx = parseInt(e.target.value, 10);
            if (idx === 0) resetRulebook();
            // Other examples would need actual rule data - placeholder for now
          }}
          defaultValue=""
          id="example-rulebook-select"
        >
          <option value="" disabled>Select an example…</option>
          {EXAMPLE_RULEBOOKS.map((ex, i) => (
            <option key={i} value={i}>{ex.name}</option>
          ))}
        </select>
      </div>

      {/* Rules List */}
      {rulebook.rules.length === 0 ? (
        <div className="placeholder">
          <span className="placeholder__icon">📋</span>
          <span className="placeholder__text">No rules defined. Click "New Rule" to add one.</span>
        </div>
      ) : (
        <div>
          {rulebook.rules.map((rule) => {
            const isExpanded = expandedRules.has(rule.id);
            return (
              <div key={rule.id} className="rule-card" id={`rule-card-${rule.id}`}>
                <div className="rule-card__header" onClick={() => toggleExpand(rule.id)}>
                  <span className={`collapsible-chevron ${isExpanded ? 'collapsible-chevron--open' : ''}`}>
                    ▶
                  </span>
                  <label className="toggle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                    />
                    <span className="toggle__track" />
                    <span className="toggle__thumb" />
                  </label>
                  <span className="rule-card__name" style={{ opacity: rule.enabled ? 1 : 0.5 }}>
                    {rule.name}
                  </span>
                  <span className={`badge ${rule.severity === 'hard' ? 'badge--hard' : 'badge--soft'}`}>
                    {rule.severity}
                  </span>
                </div>

                {isExpanded && (
                  <div className="rule-card__body">
                    {/* Name */}
                    <div className="input-group">
                      <label className="input-group__label">Name</label>
                      <input
                        className="input input--sm"
                        type="text"
                        value={rule.name}
                        onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                      />
                    </div>

                    {/* Type */}
                    <div className="input-group">
                      <label className="input-group__label">Rule Type</label>
                      <select
                        className="input input--sm"
                        value={rule.type}
                        onChange={(e) => updateRule(rule.id, { type: e.target.value as RuleType })}
                      >
                        {RULE_TYPES.map((rt) => (
                          <option key={rt.value} value={rt.value}>{rt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Severity */}
                    <div className="input-group">
                      <label className="input-group__label">Severity</label>
                      <div className="pill-group">
                        {(['hard', 'soft'] as ConstraintSeverity[]).map((s) => (
                          <button
                            key={s}
                            className={`pill-btn ${rule.severity === s ? 'pill-btn--active' : ''}`}
                            onClick={() => updateRule(rule.id, { severity: s })}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Penalty (if soft) */}
                    {rule.severity === 'soft' && (
                      <div className="input-group">
                        <label className="input-group__label">Penalty</label>
                        <input
                          className="input input--sm"
                          type="number"
                          min={0}
                          step={1}
                          value={rule.penalty ?? 0}
                          onChange={(e) => updateRule(rule.id, { penalty: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    )}

                    {/* Dynamic: productIds */}
                    {ruleNeedsProductIds(rule.type) && (
                      <div className="input-group">
                        <label className="input-group__label">Products</label>
                        <div className="multi-select">
                          {products.length === 0 ? (
                            <span className="text-xs text-muted">No products available</span>
                          ) : (
                            products.map((p) => (
                              <label
                                key={p.id}
                                className={`multi-select__item ${(rule.productIds ?? []).includes(p.id) ? 'multi-select__item--selected' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={(rule.productIds ?? []).includes(p.id)}
                                  onChange={() => toggleProductInRule(rule.id, p.id)}
                                />
                                {p.name}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dynamic: marketIds */}
                    {ruleNeedsMarketIds(rule.type) && (
                      <div className="input-group">
                        <label className="input-group__label">Markets</label>
                        <div className="multi-select">
                          {markets.length === 0 ? (
                            <span className="text-xs text-muted">No markets available</span>
                          ) : (
                            markets.map((m) => (
                              <label
                                key={m.id}
                                className={`multi-select__item ${(rule.marketIds ?? []).includes(m.id) ? 'multi-select__item--selected' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={(rule.marketIds ?? []).includes(m.id)}
                                  onChange={() => toggleMarketInRule(rule.id, m.id)}
                                />
                                {m.name}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dynamic: edge */}
                    {ruleNeedsEdge(rule.type) && (
                      <div className="input-row">
                        <div className="input-group">
                          <label className="input-group__label">From Market</label>
                          <select
                            className="input input--sm"
                            value={rule.edge?.fromMarketId ?? ''}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                edge: { fromMarketId: e.target.value, toMarketId: rule.edge?.toMarketId ?? '' },
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {markets.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="input-group">
                          <label className="input-group__label">To Market</label>
                          <select
                            className="input input--sm"
                            value={rule.edge?.toMarketId ?? ''}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                edge: { fromMarketId: rule.edge?.fromMarketId ?? '', toMarketId: e.target.value },
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {markets.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Dynamic: orderedPair */}
                    {ruleNeedsOrderedPair(rule.type) && (
                      <div className="input-row">
                        <div className="input-group">
                          <label className="input-group__label">Before Market</label>
                          <select
                            className="input input--sm"
                            value={rule.orderedPair?.beforeMarketId ?? ''}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                orderedPair: {
                                  beforeMarketId: e.target.value,
                                  afterMarketId: rule.orderedPair?.afterMarketId ?? '',
                                },
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {markets.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="input-group">
                          <label className="input-group__label">After Market</label>
                          <select
                            className="input input--sm"
                            value={rule.orderedPair?.afterMarketId ?? ''}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                orderedPair: {
                                  beforeMarketId: rule.orderedPair?.beforeMarketId ?? '',
                                  afterMarketId: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {markets.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Dynamic: value */}
                    {ruleNeedsValue(rule.type) && (
                      <div className="input-group">
                        <label className="input-group__label">Value</label>
                        <input
                          className="input input--sm"
                          type="number"
                          min={0}
                          step={1}
                          value={rule.value ?? 0}
                          onChange={(e) => updateRule(rule.id, { value: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    )}

                    {/* Description */}
                    <div className="input-group">
                      <label className="input-group__label">Description</label>
                      <textarea
                        className="input input--sm"
                        value={rule.description}
                        onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                        rows={2}
                      />
                    </div>

                    {/* Delete */}
                    <button
                      className="btn btn--danger btn--sm w-full"
                      onClick={() => deleteRule(rule.id)}
                    >
                      Delete Rule
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
