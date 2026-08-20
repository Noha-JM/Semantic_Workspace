import React from 'react';
import { Database, Layers, Trash2, BookOpen, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function LibraryView({ papers, onInspectPaper, onDeletePaper, onRefresh }) {
  return (
    <div>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} color="var(--accent-cyan)" />
            Workspace Vector Library ({papers ? papers.length : 0} Papers Ingested)
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            All papers stored in PostgreSQL with 384-dimensional FastEmbed vector index.
          </p>
        </div>

        <button className="btn-secondary" onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>Refresh Library</span>
        </button>
      </div>

      {/* Paper Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 20px' }}>Title & DOI</th>
              <th style={{ padding: '14px 20px' }}>Year</th>
              <th style={{ padding: '14px 20px' }}>Source</th>
              <th style={{ padding: '14px 20px' }}>Vector Chunks</th>
              <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {papers && papers.map((paper) => (
              <tr
                key={paper.id}
                style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background 0.15s ease' }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ fontWeight: 600, color: '#fff', cursor: 'pointer', marginBottom: '4px' }} onClick={() => onInspectPaper(paper)}>
                    {paper.title}
                  </div>
                  {paper.doi && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                      doi:{paper.doi}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                  {paper.publication_year || 'N/A'}
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-muted)' }}>
                    {paper.source || 'Local DB'}
                  </span>
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.82rem', fontWeight: 600 }}>
                    <CheckCircle2 size={14} />
                    <span>{paper.chunk_count || 1} Chunks</span>
                  </div>
                </td>
                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => onInspectPaper(paper)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      <BookOpen size={12} />
                      Inspect
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px' }}
                      onClick={() => onDeletePaper(paper.id)}
                      onMouseOver={(e) => e.target.style.color = '#ef4444'}
                      onMouseOut={(e) => e.target.style.color = 'var(--text-subtle)'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
