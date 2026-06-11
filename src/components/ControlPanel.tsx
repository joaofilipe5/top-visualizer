import { useState } from 'react';
import HeuristicControls from './HeuristicControls';
import CostBreakdown from './CostBreakdown';
import StepLog from './StepLog';
import InstanceControls from './InstanceControls';
import RulebookEditor from './RulebookEditor';
import ViolationsPanel from './ViolationsPanel';
import PdfExport from './PdfExport';

type TabId = 'solve' | 'instance' | 'rules';

const TABS: { id: TabId; label: string }[] = [
  { id: 'solve', label: 'Solve' },
  { id: 'instance', label: 'Instance' },
  { id: 'rules', label: 'Rules' },
];

export default function ControlPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('solve');

  return (
    <aside className="panel-right" aria-label="Control panel" id="control-panel">
      <nav className="tabs" aria-label="Control panel tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            id={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="tab-content" role="tabpanel">
        {activeTab === 'solve' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <HeuristicControls />
            <div className="divider" />
            <CostBreakdown />
            <div className="divider" />
            <StepLog />
            <PdfExport />
          </div>
        )}

        {activeTab === 'instance' && (
          <InstanceControls />
        )}

        {activeTab === 'rules' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <RulebookEditor />
            <div className="divider" />
            <ViolationsPanel />
          </div>
        )}
      </div>
    </aside>
  );
}
