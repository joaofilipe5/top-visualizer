import { useCallback, useMemo, useState } from 'react';
import { useTPP } from '../state/context';
import type {
  InstanceGenerationConfig,
  SpatialMode,
  PriceMode,
  DemandMode,
  DifficultyLevel,
} from '../types';
import { generateInstance } from '../data/generator';

const PRESETS: Record<string, Partial<InstanceGenerationConfig>> = {
  Tiny: { nMarkets: 5, nProducts: 3 },
  Small: { nMarkets: 10, nProducts: 6 },
  Medium: { nMarkets: 15, nProducts: 10 },
  Large: { nMarkets: 30, nProducts: 20 },
  Huge: { nMarkets: 60, nProducts: 40 },
};

const SPATIAL_MODES: SpatialMode[] = ['uniform', 'clustered', 'grid'];
const PRICE_MODES: PriceMode[] = ['random', 'geoCorrelated', 'specialist', 'warehouse'];
const DEMAND_MODES: DemandMode[] = ['fixed', 'random'];
const MAP_MODES: { value: import('../types').MapBoundary; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'portugal', label: 'Portugal' },
  { value: 'usa', label: 'United States' },
];

const difficultyBadgeClass = (d: DifficultyLevel) => {
  switch (d) {
    case 'Easy':
      return 'badge--difficulty-easy';
    case 'Medium':
      return 'badge--difficulty-medium';
    case 'Hard':
      return 'badge--difficulty-hard';
    case 'Very Hard':
      return 'badge--difficulty-veryhard';
  }
};

export default function InstanceControls() {
  const { state, dispatch } = useTPP();
  const { generationConfig, instance, uiSettings } = state;

  const updateConfig = useCallback(
    (patch: Partial<InstanceGenerationConfig>) => {
      dispatch({ type: 'UPDATE_GENERATION_CONFIG', payload: patch });
    },
    [dispatch]
  );

  const handleNumChange = useCallback(
    (field: keyof InstanceGenerationConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        updateConfig({ [field]: val } as Partial<InstanceGenerationConfig>);
      }
    },
    [updateConfig]
  );

  const handleSelectChange = useCallback(
    (field: keyof InstanceGenerationConfig) => (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateConfig({ [field]: e.target.value } as Partial<InstanceGenerationConfig>);
    },
    [updateConfig]
  );

  const newSeed = useCallback(() => {
    updateConfig({ seed: Math.floor(Math.random() * 999999) });
  }, [updateConfig]);

  const applyPreset = useCallback(
    (name: string) => {
      const preset = PRESETS[name];
      if (preset) updateConfig(preset);
    },
    [updateConfig]
  );

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(generationConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tpp-instance-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [generationConfig]);

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
          const config = JSON.parse(ev.target?.result as string);
          dispatch({ type: 'UPDATE_GENERATION_CONFIG', payload: config });
        } catch {
          // silently fail on invalid JSON
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [dispatch]);

  const handleGenerate = useCallback(() => {
    try {
      const inst = generateInstance(generationConfig);
      dispatch({ type: 'SET_INSTANCE', payload: inst });
    } catch (e) {
      console.error(e);
      alert('Failed to generate instance. Please check constraints.');
    }
  }, [generationConfig, dispatch]);

  const metadata = useMemo(() => instance?.metadata ?? null, [instance]);

  return (
    <section aria-label="Instance controls" id="instance-controls">
      {/* Mode Toggle */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="pill-group">
          <button 
            className={`pill-btn ${!uiSettings.isManualMode ? 'pill-btn--active' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_UI_SETTINGS', payload: { isManualMode: false } })}
            style={{ flex: 1 }}
          >
            Random Generator
          </button>
          <button 
            className={`pill-btn ${uiSettings.isManualMode ? 'pill-btn--active' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_UI_SETTINGS', payload: { isManualMode: true } })}
            style={{ flex: 1 }}
          >
            Manual Edit
          </button>
        </div>
      </div>

      {uiSettings.isManualMode ? (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="panel-section__title">Market Maker</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-3)' }}>
            Click anywhere on the canvas to add a new Market. Use the sidebar to rename it and edit product prices.
          </p>
          <button 
            className="btn btn--secondary w-full"
            onClick={() => {
              const name = prompt('Enter new product name:');
              if (name) dispatch({ type: 'ADD_PRODUCT', payload: { name, demand: 1 }});
            }}
          >
            + Add New Product
          </button>
        </div>
      ) : (
      <>
      {/* Presets */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Presets</div>
        <div className="presets-row">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              className="btn btn--secondary btn--sm"
              onClick={() => applyPreset(name)}
              id={`preset-${name.toLowerCase()}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Dimensions */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Dimensions</div>
        <div className="input-row">
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-nMarkets">Markets</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-nMarkets"
              min={2}
              max={200}
              value={generationConfig.nMarkets}
              onChange={handleNumChange('nMarkets')}
            />
          </div>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-nProducts">Products</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-nProducts"
              min={1}
              max={100}
              value={generationConfig.nProducts}
              onChange={handleNumChange('nProducts')}
            />
          </div>
        </div>
      </div>

      {/* Spatial */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Spatial</div>
        <div className="input-group" style={{ marginBottom: 'var(--sp-2)' }}>
          <label className="input-group__label" htmlFor="cfg-spatialMode">Mode</label>
          <select
            className="input input--sm"
            id="cfg-spatialMode"
            value={generationConfig.spatialMode}
            onChange={handleSelectChange('spatialMode')}
          >
            {SPATIAL_MODES.map((m) => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="input-group" style={{ marginBottom: 'var(--sp-2)' }}>
          <label className="input-group__label" htmlFor="cfg-mapBoundary">Map Boundary</label>
          <select
            className="input input--sm"
            id="cfg-mapBoundary"
            value={generationConfig.mapBoundary || 'none'}
            onChange={handleSelectChange('mapBoundary')}
          >
            {MAP_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="input-row">
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-width">Width</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-width"
              min={10}
              max={1000}
              value={generationConfig.width}
              onChange={handleNumChange('width')}
            />
          </div>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-height">Height</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-height"
              min={10}
              max={1000}
              value={generationConfig.height}
              onChange={handleNumChange('height')}
            />
          </div>
        </div>
        <div className="input-row" style={{ marginTop: 'var(--sp-2)' }}>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-depotX">Depot X</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-depotX"
              value={generationConfig.depotX}
              onChange={handleNumChange('depotX')}
            />
          </div>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-depotY">Depot Y</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-depotY"
              value={generationConfig.depotY}
              onChange={handleNumChange('depotY')}
            />
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Pricing</div>
        <div className="input-group" style={{ marginBottom: 'var(--sp-2)' }}>
          <label className="input-group__label" htmlFor="cfg-priceMode">Price Mode</label>
          <select
            className="input input--sm"
            id="cfg-priceMode"
            value={generationConfig.priceMode}
            onChange={handleSelectChange('priceMode')}
          >
            {PRICE_MODES.map((m) => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="input-row">
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-minPrice">Min Price</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-minPrice"
              min={0}
              step={1}
              value={generationConfig.minPrice}
              onChange={handleNumChange('minPrice')}
            />
          </div>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-maxPrice">Max Price</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-maxPrice"
              min={0}
              step={1}
              value={generationConfig.maxPrice}
              onChange={handleNumChange('maxPrice')}
            />
          </div>
        </div>
        <div className="input-row" style={{ marginTop: 'var(--sp-2)' }}>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-priceNoise">Price Noise</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-priceNoise"
              min={0}
              max={1}
              step={0.05}
              value={generationConfig.priceNoise}
              onChange={handleNumChange('priceNoise')}
            />
          </div>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-availability">Availability</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-availability"
              min={0.05}
              max={1}
              step={0.05}
              value={generationConfig.availabilityDensity}
              onChange={handleNumChange('availabilityDensity')}
            />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 'var(--sp-2)' }}>
          <label className="input-group__label" htmlFor="cfg-travelMult">Travel Cost Multiplier</label>
          <input
            className="input input--sm"
            type="number"
            id="cfg-travelMult"
            min={0.01}
            step={0.1}
            value={generationConfig.travelCostMultiplier}
            onChange={handleNumChange('travelCostMultiplier')}
          />
        </div>
      </div>

      {/* Demand */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Demand</div>
        <div className="input-group" style={{ marginBottom: 'var(--sp-2)' }}>
          <label className="input-group__label" htmlFor="cfg-demandMode">Mode</label>
          <select
            className="input input--sm"
            id="cfg-demandMode"
            value={generationConfig.demandMode}
            onChange={handleSelectChange('demandMode')}
          >
            {DEMAND_MODES.map((m) => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </div>
        {generationConfig.demandMode === 'fixed' ? (
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-fixedDemand">Fixed Demand</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-fixedDemand"
              min={1}
              max={100}
              value={generationConfig.fixedDemand}
              onChange={handleNumChange('fixedDemand')}
            />
          </div>
        ) : (
          <div className="input-row">
            <div className="input-group">
              <label className="input-group__label" htmlFor="cfg-minDemand">Min</label>
              <input
                className="input input--sm"
                type="number"
                id="cfg-minDemand"
                min={1}
                value={generationConfig.minDemand}
                onChange={handleNumChange('minDemand')}
              />
            </div>
            <div className="input-group">
              <label className="input-group__label" htmlFor="cfg-maxDemand">Max</label>
              <input
                className="input input--sm"
                type="number"
                id="cfg-maxDemand"
                min={1}
                value={generationConfig.maxDemand}
                onChange={handleNumChange('maxDemand')}
              />
            </div>
          </div>
        )}
        <div className="input-row" style={{ marginTop: 'var(--sp-2)' }}>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-minProducts">Min Products/Market</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-minProducts"
              min={1}
              value={generationConfig.minProductsPerMarket}
              onChange={handleNumChange('minProductsPerMarket')}
            />
          </div>
          <div className="input-group">
            <label className="input-group__label" htmlFor="cfg-maxProducts">Max Products/Market</label>
            <input
              className="input input--sm"
              type="number"
              id="cfg-maxProducts"
              min={1}
              value={generationConfig.maxProductsPerMarket}
              onChange={handleNumChange('maxProductsPerMarket')}
            />
          </div>
        </div>
      </div>

      {/* Seed */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-section__title">Advanced</div>
        <div className="input-group">
          <label className="input-group__label" htmlFor="cfg-seed">Seed</label>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <input
              className="input input--sm"
              type="number"
              id="cfg-seed"
              value={generationConfig.seed}
              onChange={handleNumChange('seed')}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn--secondary btn--sm"
              onClick={newSeed}
              id="btn-new-seed"
              aria-label="Generate new seed"
            >
              🎲 New
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <button
          className="btn btn--primary w-full"
          id="btn-generate-instance"
          onClick={handleGenerate}
          style={{ marginBottom: 'var(--sp-2)' }}
        >
          Generate Instance
        </button>
        <div className="btn-row">
          <button className="btn btn--secondary btn--sm" id="btn-regenerate" onClick={handleGenerate} style={{ flex: 1 }}>
            Regenerate
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => { newSeed(); setTimeout(handleGenerate, 50); }} id="btn-random-seed" style={{ flex: 1 }}>
            Random Seed
          </button>
        </div>
      </div>

      {/* Import / Export */}
      <div className="btn-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <button className="btn btn--ghost btn--sm" onClick={handleImport} id="btn-import-config" style={{ flex: 1 }}>
          Import JSON
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleExport} id="btn-export-config" style={{ flex: 1 }}>
          Export JSON
        </button>
      </div>

      {/* Instance Statistics */}
      {metadata && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <div className="panel-section__title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <span>Instance Statistics</span>
            <span className={`badge ${difficultyBadgeClass(metadata.difficulty)}`}>
              {metadata.difficulty}
            </span>
          </div>

          {metadata.feasibilityRepairApplied && (
            <div
              style={{
                padding: 'var(--sp-2) var(--sp-3)',
                background: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid rgba(249, 115, 22, 0.2)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-uncovered)',
                marginBottom: 'var(--sp-3)',
              }}
            >
              ⚠ Feasibility repair was applied to {metadata.repairedProducts.length} product(s)
            </div>
          )}

          <div className="instance-stats">
            <div className="instance-stats__item">
              <div className="instance-stats__label">Avg Avail/Product</div>
              <div className="instance-stats__value">
                {metadata.statistics.avgAvailabilityPerProduct.toFixed(1)}
              </div>
            </div>
            <div className="instance-stats__item">
              <div className="instance-stats__label">Avg Products/Market</div>
              <div className="instance-stats__value">
                {metadata.statistics.avgProductsPerMarket.toFixed(1)}
              </div>
            </div>
            <div className="instance-stats__item">
              <div className="instance-stats__label">Cheapest Price</div>
              <div className="instance-stats__value">
                ${metadata.statistics.cheapestProductPrice.toFixed(2)}
              </div>
            </div>
            <div className="instance-stats__item">
              <div className="instance-stats__label">Most Expensive</div>
              <div className="instance-stats__value">
                ${metadata.statistics.mostExpensiveProductPrice.toFixed(2)}
              </div>
            </div>
            <div className="instance-stats__item">
              <div className="instance-stats__label">Coord Spread</div>
              <div className="instance-stats__value">
                {metadata.statistics.coordinateSpread.toFixed(1)}
              </div>
            </div>
            <div className="instance-stats__item">
              <div className="instance-stats__label">Difficulty Score</div>
              <div className="instance-stats__value">
                {metadata.statistics.estimatedDifficultyScore.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </section>
  );
}
