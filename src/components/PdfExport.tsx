import { useRef, useState } from 'react';
// @ts-ignore - html2pdf doesn't have official types in this project context
import html2pdf from 'html2pdf.js';

export default function PdfExport() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!contentRef.current || isExporting) return;
    setIsExporting(true);

    const element = contentRef.current;
    
    // Temporarily unhide for the PDF generation
    element.style.display = 'block';

    const opt = {
      margin:       15,
      filename:     'TPP_Visualizer_Guide.pdf',
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } finally {
      element.style.display = 'none';
      setIsExporting(false);
    }
  };

  return (
    <>
      <button 
        className="btn btn--secondary w-full" 
        onClick={handleExport}
        disabled={isExporting}
        style={{ marginTop: 'var(--sp-4)' }}
      >
        {isExporting ? 'Generating PDF...' : '📄 Download PDF Guide'}
      </button>

      {/* Hidden printable content */}
      <div 
        ref={contentRef} 
        style={{ 
          display: 'none', 
          fontFamily: '"Times New Roman", Times, serif',
          color: '#000',
          lineHeight: '1.6',
          fontSize: '12pt',
          width: '800px', // Fixed width for consistent PDF rendering
          padding: '20px'
        }}
      >
        <h1 style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
          TPP-IC Visualizer: Solver and Interface Guide
        </h1>
        
        <h2 style={{ marginTop: '30px', borderBottom: '1px solid #ccc' }}>1. Overview of the TPP-IC Visualizer</h2>
        <p>
          The Traveling Purchaser Problem with Incompatibility Constraints (TPP-IC) visualizer is a tool designed to explore heuristic approaches to a complex combinatorial optimization problem.
        </p>
        <ul>
          <li><strong>Depot</strong>: The starting and ending point of the route.</li>
          <li><strong>Markets</strong>: Locations that can be visited to purchase products. They have specific coordinates and varying prices for available products.</li>
          <li><strong>Products</strong>: Items that must be purchased to satisfy a specific <strong>demand</strong>.</li>
          <li><strong>Covered/Uncovered</strong>: A product is "covered" when its required demand has been fully purchased across the visited markets.</li>
          <li><strong>Violations</strong>: Occur when a solution breaks active constraints (e.g., visiting forbidden markets, exceeding budget). Soft violations incur a penalty cost; hard violations make the solution infeasible.</li>
        </ul>

        <h2 style={{ marginTop: '30px', borderBottom: '1px solid #ccc' }}>2. Solver Guide</h2>
        <p>The visualizer includes five heuristic solvers:</p>

        <h3 style={{ marginTop: '20px' }}>Cheapest Purchase First</h3>
        <p><strong>Purpose</strong>: A naive baseline heuristic.<br/>
        <strong>Algorithm</strong>: Ignores travel costs. It simply looks at every product and assigns its purchase to the single cheapest market globally. It then creates a route visiting those markets using Nearest Neighbor and 2-Opt.<br/>
        <strong>Strengths</strong>: Extremely fast, guarantees minimal purchase cost.<br/>
        <strong>Limitations</strong>: Usually produces terrible travel routes, often visiting distant markets to save a few cents.</p>

        <h3 style={{ marginTop: '20px' }}>Greedy Market Insertion</h3>
        <p><strong>Purpose</strong>: A balanced construction heuristic.<br/>
        <strong>Algorithm</strong>: Iteratively evaluates all unvisited markets. It scores each market based on the potential savings it offers (cheaper product prices) minus the cost of detouring the route to visit it. It inserts the best-scoring market until all products are covered.<br/>
        <strong>Strengths</strong>: Good balance of purchase and travel costs.<br/>
        <strong>Limitations</strong>: Can get stuck in local optima early in the construction phase.</p>

        <h3 style={{ marginTop: '20px' }}>Regret Construction</h3>
        <p><strong>Purpose</strong>: An advanced construction heuristic.<br/>
        <strong>Algorithm</strong>: Calculates "regret" for each product—the difference in price between the cheapest available market and the second cheapest. It prioritizes buying products with high regret first, forcing the route to include those critical markets early.<br/>
        <strong>Strengths</strong>: Avoids terrible late-stage decisions by locking in critical purchases early.<br/>
        <strong>Limitations</strong>: Computationally more expensive than greedy insertion.</p>

        <h3 style={{ marginTop: '20px' }}>Product Anxiety</h3>
        <p><strong>Purpose</strong>: A robust heuristic for constrained instances.<br/>
        <strong>Algorithm</strong>: Prioritizes products based on scarcity ("anxiety"). Products available in very few markets are satisfied first, ensuring feasibility before optimizing costs for ubiquitous products.<br/>
        <strong>Strengths</strong>: Excellent for sparse instances or those with many constraints.<br/>
        <strong>Limitations</strong>: May produce sub-optimal cost solutions if scarcity is not the primary bottleneck.</p>

        <h3 style={{ marginTop: '20px' }}>Local Search</h3>
        <p><strong>Purpose</strong>: An improvement heuristic.<br/>
        <strong>Algorithm</strong>: Takes an existing solution and iteratively applies five local move operators: Adding a market, Dropping a market, Swapping two markets, Reassigning a product purchase, and 2-Opt routing. It only accepts moves that strictly improve the objective function.<br/>
        <strong>Strengths</strong>: Reliably improves any constructed solution.<br/>
        <strong>Limitations</strong>: Slowest of all algorithms; requires a starting solution.</p>

        <h2 style={{ marginTop: '30px', borderBottom: '1px solid #ccc' }}>3. Right Toolbar Guide</h2>
        <p>The right toolbar is divided into tabs:</p>
        <ul>
          <li><strong>Solve Tab</strong>: Contains the heuristic selector (Pill buttons), execution controls (Step, Run, Pause, Reset), speed slider, search mode (Strict vs Penalty), cost breakdown, and step-by-step execution log.</li>
          <li><strong>Instance Tab / Market Maker</strong>: Allows you to generate new problem instances. You can specify the number of markets, products, spatial distribution, and pricing models. Also includes the manual Market Maker for direct editing.</li>
          <li><strong>Rules Tab</strong>: The constraint editor. Here you can add new rules, load example rulebooks, and view any current violations in the active solution.</li>
        </ul>

        <h2 style={{ marginTop: '30px', borderBottom: '1px solid #ccc' }}>4. Rules Guide</h2>
        <p>
          Constraints can be hard (infeasible if broken) or soft (adds a penalty cost). 
          Available rules include Budget Limits, Max/Min Markets, Precedence (Market A before Market B), 
          Forbidden Edges, and Exclusivity (Market A and B cannot both be visited).
        </p>

        <h2 style={{ marginTop: '30px', borderBottom: '1px solid #ccc' }}>5. Instance and Market Generation</h2>
        <p>
          Instances can be generated randomly or edited manually using the Market Maker.
          <strong>Demand</strong> dictates how many units of a product must be bought.
          <strong>Pricing</strong> can be random, geographically correlated, or based on warehouse/specialist models.
        </p>

        <h2 style={{ marginTop: '30px', borderBottom: '1px solid #ccc' }}>6. Suggested Workflow</h2>
        <ol>
          <li>Open the <strong>Instance</strong> tab and generate or load a scenario.</li>
          <li>Open the <strong>Rules</strong> tab to apply any desired constraints.</li>
          <li>Switch to the <strong>Solve</strong> tab, select a construction heuristic (e.g., Regret) and click Run.</li>
          <li>Select the <strong>Local Search</strong> heuristic and click Run to optimize the initial solution.</li>
          <li>Click the <strong>Download PDF Guide</strong> to export your results.</li>
        </ol>
      </div>
    </>
  );
}
