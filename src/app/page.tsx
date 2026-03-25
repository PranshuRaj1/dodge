import ClientDashboard from '@/components/ClientDashboard';

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

export default async function HomePage() {
  const initialData = await getInitialGraph();

  return <ClientDashboard initialData={initialData} />;
}
