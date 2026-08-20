import React from 'react';
import { FileText, Download, FilePlus } from 'lucide-react';

export default function DraftsExportWidget({ onExport, projectName }) {
  // No hardcoded drafts — user creates them via Export
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>Drafts & Export</h3>
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: '1.5px dashed #e2e8f0', borderRadius: '10px', padding: '16px', textAlign: 'center', color: '#94a3b8'
      }}>
        <FilePlus size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
        <p style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
          Export your workspace to a LaTeX project using the button below.
        </p>
        {projectName && (
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#2563eb', marginTop: '6px' }}>
            {projectName}
          </p>
        )}
      </div>

      <button className="btn-blue" onClick={onExport} style={{ width: '100%', justifyContent: 'center' }}>
        <Download size={15} />
        <span>Export LaTeX Project</span>
      </button>
    </div>
  );
}
