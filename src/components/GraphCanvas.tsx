'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

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

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface Props {
  initialData: GraphData;
  highlightedNodeIds?: Set<string>;
}

const LABEL_COLORS: Record<string, string> = {
  SalesOrder:      '#6366f1',
  SalesOrderItem:  '#8b5cf6',
  Delivery:        '#0ea5e9',
  BillingDocument: '#f59e0b',
  Customer:        '#10b981',
  Product:         '#f97316',
  JournalEntry:    '#ec4899',
  Payment:         '#14b8a6',
};
const DEFAULT_COLOR = '#94a3b8';

function getNodeColor(label: string): string {
  return LABEL_COLORS[label] ?? DEFAULT_COLOR;
}

function getNodeName(node: GraphNode): string {
  const p = node.props;
  return String(
    p.businessPartnerFullName ?? p.customerName ?? p.productDescription ??
    p.description ?? p.salesOrder ?? p.deliveryDocument ?? p.billingDocument ??
    p.product ?? p.accountingDocument ?? p.paymentDocument ?? node.id
  );
}

export default function GraphCanvas({ initialData, highlightedNodeIds = new Set() }: Props) {
  const [graphData, setGraphData] = useState<GraphData>(initialData);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Track mouse position WITHOUT React state to avoid re-renders on every move
  const tooltipRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef(new Set<string>());

  // Pulse ring constants
  const PULSE_MIN_RADIUS = 1.4;
  const PULSE_MAX_RADIUS = 2.2;
  const PULSE_SPEED = 2.4; // Multiplier for Date.now timestamp
  
  const graphRef = useRef<any>(null);

  // Update tooltip position directly in the DOM — zero re-renders
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 260)}px`;
        tooltipRef.current.style.top  = `${Math.min(e.clientY - 14, window.innerHeight - 220)}px`;
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const handleNodeClick = useCallback(async (node: { id?: string | number }) => {
    const id = String(node.id ?? '');
    if (expandedRef.current.has(id)) return;
    expandedRef.current.add(id);

    try {
      const res = await fetch('/api/graph/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: id }),
      });
      const data: { nodes?: GraphNode[]; edges?: GraphEdge[] } = await res.json();

      setGraphData(prev => {
        const existingNodeIds = new Set(prev.nodes.map(n => n.id));
        const existingEdgeIds = new Set(prev.edges.map(e => e.id));
        return {
          nodes: [...prev.nodes, ...(data.nodes ?? []).filter(n => !existingNodeIds.has(n.id))],
          edges: [...prev.edges, ...(data.edges ?? []).filter(e => !existingEdgeIds.has(e.id))],
        };
      });
    } catch {
      console.error('Failed to expand node', id);
    }
  }, []);

  // Memoize connection counts computation
  const connectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of graphData.edges) {
      counts[e.src] = (counts[e.src] || 0) + 1;
      counts[e.dst] = (counts[e.dst] || 0) + 1;
    }
    return counts;
  }, [graphData.edges]);

  // Stable node object cache — reuse existing objects so react-force-graph-2d
  // doesn't treat them as new nodes (which resets their simulated positions).
  const nodeCacheRef = useRef<Map<string, object>>(new Map());
  const edgeCacheRef = useRef<Map<string, object>>(new Map());

  const fgData = useMemo(() => {
    const nodeCache = nodeCacheRef.current;
    const edgeCache = edgeCacheRef.current;

    const nodes = graphData.nodes.map(n => {
      if (!nodeCache.has(n.id)) {
        nodeCache.set(n.id, {
          id: n.id,
          label: n.label,
          props: n.props,
          name: getNodeName(n),
          color: getNodeColor(n.label),
        });
      }
      return nodeCache.get(n.id)!;
    });

    const links = graphData.edges.map(e => {
      if (!edgeCache.has(e.id)) {
        edgeCache.set(e.id, {
          source: e.src,
          target: e.dst,
          label: e.type,
          id: e.id,
        });
      }
      return edgeCache.get(e.id)!;
    });

    return { nodes, links };
  }, [graphData]);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHighlighted = highlightedNodeIds.has(node.id);
      const hasHighlights = highlightedNodeIds.size > 0;
      const baseRadius = Math.max(3, 8 / globalScale);
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Dimming pass
      const alpha = hasHighlights && !isHighlighted ? 0.15 : 1.0;
      ctx.globalAlpha = alpha;

      // Base node circle
      ctx.beginPath();
      ctx.arc(x, y, baseRadius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color ?? '#888';
      ctx.fill();

      // Pulse ring for highlighted nodes
      if (isHighlighted) {
        ctx.globalAlpha = 1.0;
        const idHash = node.id.split('').reduce(
          (acc: number, ch: string) => acc + ch.charCodeAt(0), 0
        );
        const timePhase = (Date.now() / 1000) * PULSE_SPEED;
        const nodePhase = timePhase + (idHash % 20) * 0.1;
        const pulseFactor = PULSE_MIN_RADIUS +
          (Math.sin(nodePhase) * 0.5 + 0.5) * (PULSE_MAX_RADIUS - PULSE_MIN_RADIUS);
        const pulseRadius = baseRadius * pulseFactor;

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = node.color ?? '#888';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.globalAlpha = 0.5 * (1 - (pulseFactor - PULSE_MIN_RADIUS) /
          (PULSE_MAX_RADIUS - PULSE_MIN_RADIUS));
        ctx.stroke();

        // Bright inner stroke
        ctx.beginPath();
        ctx.arc(x, y, baseRadius + 1.5 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / globalScale;
        ctx.globalAlpha = 0.9;
        ctx.stroke();

        ctx.globalAlpha = 1.0;
      }
      ctx.globalAlpha = 1.0;
    },
    [highlightedNodeIds]
  );

  const handleNodeHover = useCallback((node: any) => {
    if (node) {
      const graphNode = graphData.nodes.find(n => n.id === String(node.id));
      setHoveredNode(graphNode || null);
    } else {
      setHoveredNode(null);
    }
  }, [graphData.nodes]);

  return (
    <div className="graph-canvas">
      {/* Tooltip — position updated directly via ref, no state re-renders */}
      <div
        ref={tooltipRef}
        className="graph-tooltip"
        style={{ display: hoveredNode ? 'block' : 'none', left: 0, top: 0 }}
      >
        {hoveredNode && (
          <>
            <div className="tooltip-header">
              <div className="tooltip-label">{hoveredNode.label}</div>
            </div>
            <div className="tooltip-body">
              <div className="tooltip-prop">
                <span className="tooltip-key">Entity:</span>
                <span className="tooltip-val">{hoveredNode.label}</span>
              </div>
              {Object.entries(hoveredNode.props)
                .filter(([, v]) => v !== null && v !== '' && v !== undefined)
                .slice(0, 10)
                .map(([k, v]) => (
                  <div key={k} className="tooltip-prop">
                    <span className="tooltip-key">{k}:</span>
                    <span className="tooltip-val">{String(v)}</span>
                  </div>
                ))}
              <div className="tooltip-muted-text">Additional fields hidden for readability</div>
              <div className="tooltip-prop tooltip-connections">
                <span className="tooltip-key">Connections:</span>
                <span className="tooltip-val">{connectionCounts[hoveredNode.id] || 0}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <ForceGraph2D
        ref={graphRef}
        graphData={fgData}
        autoPauseRedraw={highlightedNodeIds.size === 0}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        nodeLabel=""
        nodeColor="color"
        nodeRelSize={5}
        linkColor={() => 'rgba(100,116,139,0.6)'}
        linkVisibility={true}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.15}
        warmupTicks={80}
        cooldownTicks={0}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        backgroundColor="transparent"
        enableNodeDrag={false}
      />
    </div>
  );
}
