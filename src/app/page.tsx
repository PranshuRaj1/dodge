import GraphCanvas from '@/components/GraphCanvas';
import ChatPanel from '@/components/ChatPanel';

interface GraphNode {
  id: string;
  label: string;
  props: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  src: string;
  dst: string;
  type: string;
}

async function getInitialGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  try {
    // Use absolute URL for server-side fetching
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/graph`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Graph API ${res.status}`);
    return res.json();
  } catch {
    return { nodes: [], edges: [] };
  }
}

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

export default async function HomePage() {
  const initialData = await getInitialGraph();

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

          <GraphCanvas initialData={initialData} />
        </div>

        {/* Divider */}
        <div className="chat-divider" />

        {/* Chat pane */}
        <ChatPanel />
      </main>
    </div>
  );
}
