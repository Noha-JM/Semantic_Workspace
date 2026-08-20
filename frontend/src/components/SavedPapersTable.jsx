import React from 'react';
import { Star, FileText, Grid, List, MoreVertical, ExternalLink, Trash2 } from 'lucide-react';

export default function SavedPapersTable({ papers, onSelectPaper, onDeletePaper }) {
  return (
    <div className="ui-card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
            Saved Workspace Papers ({papers ? papers.length : 0})
          </h3>
          <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 600, background: '#eff6ff', padding: '2px 8px', borderRadius: '10px' }}>
            PostgreSQL Vector Index
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
            <button style={{ padding: '4px 8px', background: '#ffffff', border: 'none', cursor: 'pointer' }}><List size={14} color="#2563eb" /></button>
            <button style={{ padding: '4px 8px', background: '#f8fafc', border: 'none', cursor: 'pointer' }}><Grid size={14} color="#94a3b8" /></button>
          </div>
        </div>
      </div>

      {/* Real Papers Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {papers && papers.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px' }}>Title</th>
                <th style={{ padding: '8px' }}>Year</th>
                <th style={{ padding: '8px' }}>Venue</th>
                <th style={{ padding: '8px' }}>Vector Chunks</th>
                <th style={{ padding: '8px' }}>Source</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s ease' }}
                  onClick={() => onSelectPaper(p)}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 8px', fontWeight: 600, color: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Star size={13} color="#f59e0b" fill="#f59e0b" />
                      <span>{p.title}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', color: '#475569' }}>{p.publication_year || 'N/A'}</td>
                  <td style={{ padding: '10px 8px', color: '#475569', fontWeight: 500 }}>{p.venue || 'ArXiv'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#dcfce7', color: '#15803d' }}>
                      {p.chunk_count || 1} Vectors
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', color: '#94a3b8', fontSize: '0.75rem' }}>{p.source || 'Local DB'}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeletePaper && onDeletePaper(p.id); }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                      onMouseOver={(e) => e.target.style.color = '#ef4444'}
                      onMouseOut={(e) => e.target.style.color = '#94a3b8'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.85rem' }}>
            <FileText size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <p>No papers ingested yet.</p>
            <p style={{ fontSize: '0.78rem', marginTop: '4px' }}>Use the Literature Search tab to search OpenAlex/ArXiv and click "Ingest to Vector DB".</p>
          </div>
        )}
      </div>
    </div>
  );
}
