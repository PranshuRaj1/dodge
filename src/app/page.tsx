import ClientDashboard from '@/components/ClientDashboard';
import { getGraphData } from '@/lib/graphService';

export default async function HomePage() {
  let initialData: Awaited<ReturnType<typeof getGraphData>> = { nodes: [], edges: [] };

  try {
    initialData = await getGraphData();
  } catch (err) {
    console.error('Failed to load graph data:', err);
  }

  return <ClientDashboard initialData={initialData} />;
}
