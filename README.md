# Travelling Purchaser Problem Visualizer

An interactive operations research tool for exploring joint purchasing and routing decisions. Choose markets, assign products to suppliers, and inspect how construction heuristics and local search trade off travel costs, purchase costs and constraint penalties.

## Problem and methods

The Travelling Purchaser Problem combines a depot-based tour with product procurement. The implementation tracks travel cost, purchase cost, penalty cost, total cost and feasibility for each candidate solution.

Five strategies are available: cheapest-purchase-first, greedy market insertion, regret construction, product-anxiety construction and local search. Routing utilities include nearest-neighbour construction and 2-opt. Heuristics are approximate; the application does not certify global optimality.

## Features

- Generated instances with configurable product availability, prices, demand, spatial patterns and random seed.
- Step-by-step heuristic playback and manual market selection.
- Hard and soft rules covering incompatible products/markets, purchases, forbidden edges, precedence, budgets and visit requirements.
- Strict, repair and penalty search modes for local search.
- Portugal and United States map boundaries, cost breakdowns, violation inspection and PDF export.

## Run locally

Use Node.js 22.12+ (or a later supported version) and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Generate an instance, select a heuristic and use the playback controls to inspect its decisions. Edit the rulebook to compare constrained solutions.

```bash
npm test
npm run build
npm run preview
```

## Repository map

| Path | Purpose |
| --- | --- |
| `src/heuristics/` | Construction algorithms, routing and local improvement |
| `src/rules/` | Constraint generation, validation and repair |
| `src/data/` | Instance generation, presets and map data |
| `src/components/` | Visualization and interactive controls |
| `src/state/` | Application state |
| `src/__tests__/` | Existing generator, rule and heuristic tests |

## Scope

This is an exploratory visualizer implemented in React, TypeScript and Vite. Results depend on the generated instance, enabled rules and search settings. Map coordinates are a modelling aid, not a road-network travel-time dataset. It contains no published benchmark proving approximation guarantees or superiority over exact solvers.
