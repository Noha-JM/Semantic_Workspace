import React, { useState } from 'react';
import { Layers, Sparkles, Move, Info } from 'lucide-react';

export default function SemanticGraphView({ papers, onInspectPaper }) {
  const [selectedNode, setSelectedNode] = useState(null);

  if (!papers || papers.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Layers size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
        <h3>No Papers to Graph</h3>
        <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>Perform a semantic vector search first to visualize relationship clusters in 2D space.</p>
      </div>
    );
  }

  // Position nodes in a 2D layout based on paper index and similarity score
  const nodes = papers.map((paper, idx) => {
    const angle = (idx / papers.length) * 2 * Math.PI;
    const radius = 180 - (paper.score || 50) * 1.2;
    const cx = 350 + Math.cos(angle) * Math.max(radius, 60);
    const cy = 250 + Math.sin(angle) * Math.max(radius, 60);
    return { ...paper, cx, cy, angle };
  });

  return (
    <div className="glass-panel" style={{ padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} color="var(--accent-cyan)" />
            2D Semantic Proximity Graph
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Nodes closer to center indicate higher vector cosine similarity to active query.
          </p>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Info size={14} /> Click any node to inspect details
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', height: '500px', background: 'rgba(5, 8, 15, 0.7)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 700 500">
          {/* Background Concentric Proximity Circles */}
          <circle cx="350" cy="250" r="80" fill="none" stroke="rgba(99, 102, 241, 0.15)" strokeDasharray="4 4" />
          <circle cx="350" cy="250" r="160" fill="none" stroke="rgba(99, 102, 241, 0.1)" strokeDasharray="4 4" />
          <circle cx="350" cy="250" r="230" fill="none" stroke="rgba(255, 255, 255, 0.04)" />

          {/* Central Query Focal Point */}
          <circle cx="350" cy="250" r="12" fill="var(--accent-cyan)" opacity="0.8" />
          <circle cx="350" cy="250" r="24" fill="none" stroke="var(--accent-cyan)" opacity="0.4" className="pulse-glow" />
          <text x="350" y="254" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">QUERY</text>

          {/* Connector Lines between center query and paper nodes */}
          {nodes.map((node) => (
            <line
              key={`link-${node.id}`}
              x1="350"
              y1="250"
              x2={node.cx}
              y2={node.cy}
              stroke={selectedNode?.id === node.id ? 'var(--accent-cyan)' : 'rgba(99, 102, 241, 0.25)'}
              strokeWidth={selectedNode?.id === node.id ? 2.5 : 1}
            />
          ))}

          {/* Paper Nodes */}
          {nodes.map((node) => {
            const isSel = selectedNode?.id === node.id;
            return (
              <g
                key={`node-${node.id}`}
                onClick={() => {
                  setSelectedNode(node);
                  onInspectPaper(node);
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Node Ring */}
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={isSel ? 22 : 16}
                  fill={isSel ? 'var(--primary)' : 'rgba(17, 24, 39, 0.9)'}
                  stroke={isSel ? '#ffffff' : (node.score >= 80 ? '#34d399' : '#a5b4fc')}
                  strokeWidth={isSel ? 3 : 2}
                  style={{ transition: 'all 0.2s ease' }}
                />
                
                {/* Node Score Label */}
                <text
                  x={node.cx}
                  y={node.cy + 4}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                >
                  {node.score ? `${Math.round(node.score)}%` : 'P'}
                </text>

                {/* Node Title Label */}
                <text
                  x={node.cx}
                  y={node.cy + (isSel ? 36 : 30)}
                  textAnchor="middle"
                  fill={isSel ? '#ffffff' : 'var(--text-muted)'}
                  fontSize="11"
                  fontWeight={isSel ? "600" : "400"}
                >
                  {node.title.length > 20 ? node.title.slice(0, 18) + '...' : node.title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
