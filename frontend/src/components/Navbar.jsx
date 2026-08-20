import React from 'react';
import { Sparkles, Database, Cpu, Layers, BookOpen } from 'lucide-react';

export default function Navbar({ healthStats, activeTab, setActiveTab }) {
  return (
    <header style={{
      borderBottom: '1px solid var(--border-color)',
      background: 'rgba(9, 13, 22, 0.85)',
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      padding: '14px 28px'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)'
          }}>
            <Sparkles size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #ffffff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Semantic Workspace
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              pgvector & FastEmbed Engine
            </p>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '6px', background: 'rgba(255, 255, 255, 0.04)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          {[
            { id: 'explorer', label: 'Search & Explorer', icon: Sparkles },
            { id: 'graph', label: 'Semantic Graph', icon: Layers },
            { id: 'synthesis', label: 'Synthesis Matrix', icon: Cpu },
            { id: 'assistant', label: 'AI QA Assistant', icon: Sparkles },
            { id: 'library', label: 'Workspace Library', icon: BookOpen },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '9px',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                  boxShadow: isActive ? '0 2px 10px rgba(99, 102, 241, 0.3)' : 'none'
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* System Health Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: healthStats?.status === 'healthy' ? '#10b981' : '#f59e0b',
              boxShadow: healthStats?.status === 'healthy' ? '0 0 8px #10b981' : 'none'
            }} />
            <Database size={14} />
            <span>{healthStats?.total_papers || 0} Papers</span>
            <span style={{ color: 'var(--border-color)' }}>|</span>
            <span style={{ color: 'var(--accent-cyan)' }}>{healthStats?.total_vector_chunks || 0} Vectors</span>
          </div>

          <div style={{
            fontSize: '0.72rem',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#a5b4fc',
            fontFamily: 'var(--font-code)'
          }}>
            384d BGE-small
          </div>
        </div>
      </div>
    </header>
  );
}
