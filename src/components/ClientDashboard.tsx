'use client';

import { useState, useCallback } from 'react';
import GraphCanvas from '@/components/GraphCanvas';
import ChatPanel from '@/components/ChatPanel';

const LEGEND_ITEMS = [
  { label: 'SalesOrder',      color: '#6366f1' },
  { label: 'SalesOrderItem',  color: '#8b5cf6' },
  { label: 'Delivery',        color: '#0ea5e9' },
  { label: 'BillingDocument', color: '#f59e0b' },
  { label: 'Customer',        color: '#10b981' },
  { label: 'Product',         color: '#f97316' },
  { label: 'JournalEntry',    color: '#ec4899' },
  { label: 'Payment',         color: '#14b8a6' },
];

export default function ClientDashboard({ initialData }: { initialData: any }) {
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());

  const handleQueryResponse = useCallback((result: any) => {
    if (result && result.highlightedNodeIds?.length) {
      setHighlightedNodeIds(new Set(result.highlightedNodeIds));
    } else {
      setHighlightedNodeIds(new Set());
    }
  }, []);

  const handleNewQuery = useCallback(() => {
    setHighlightedNodeIds(new Set());
  }, []);

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <span className="app-logo">⬡ Dodge AI</span>
      </header>

      {/* Main content */}
      <main className="app-main">
        {/* Graph pane */}
        <div className="graph-pane">
          {/* Legend */}
          <div className="legend">
            <div className="legend-title">Node Types</div>
            {LEGEND_ITEMS.map(item => (
              <div key={item.label} className="legend-item">
                <div className="legend-dot" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>

          {/* Hint */}
          <div className="graph-hint">Click any node to expand its connections</div>

          <GraphCanvas 
            initialData={initialData} 
            highlightedNodeIds={highlightedNodeIds}
          />
        </div>

        {/* Divider */}
        <div className="chat-divider" />

        {/* Chat pane */}
        <ChatPanel 
          onResponse={handleQueryResponse}
          onQueryStart={handleNewQuery}
        />
      </main>
    </div>
  );
}
