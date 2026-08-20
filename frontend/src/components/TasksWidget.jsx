import React from 'react';
import { CheckSquare, Plus, ChevronDown, Trash2 } from 'lucide-react';

export default function TasksWidget({ tasks, setTasks }) {
  const toggleTask = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleAddTask = () => {
    const text = prompt("Enter new task description:");
    if (!text || !text.trim()) return;
    const newTask = {
      id: `task_${Date.now()}`,
      text: text.trim(),
      priority: "Medium",
      date: "Today",
      completed: false
    };
    setTasks([newTask, ...tasks]);
  };

  const handleDeleteTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const completedCount = tasks ? tasks.filter(t => t.completed).length : 0;

  return (
    <div className="ui-card" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
              Tasks Checklist ({tasks ? tasks.length : 0})
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleAddTask}
              style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
            >
              <Plus size={14} color="#2563eb" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Tasks List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
          {tasks && tasks.map((task) => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleTask(task.id)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: task.completed ? '#94a3b8' : '#334155', textDecoration: task.completed ? 'line-through' : 'none', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {task.text}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span className={`tag-pill priority-${(task.priority || 'Medium').toLowerCase()}`}>
                  {task.priority || 'Medium'}
                </span>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                  onMouseOver={(e) => e.target.style.color = '#ef4444'}
                  onMouseOut={(e) => e.target.style.color = '#94a3b8'}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Completed Count Footer */}
      <div style={{ paddingTop: '10px', marginTop: '10px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
        <span>✓ {completedCount} completed</span>
        <ChevronDown size={14} />
      </div>
    </div>
  );
}
