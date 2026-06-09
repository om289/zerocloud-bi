import React, { useState, memo } from 'react';
import { Database, ChevronDown, ChevronRight, Play, Trash2 } from 'lucide-react';

const SchemaBrowser = memo(function SchemaBrowser({ tables, onSelectTable, onDeleteTable }) {
  const [expandedTables, setExpandedTables] = useState({});

  const toggleExpand = (tableName) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableName]: !prev[tableName]
    }));
  };

  return (
    <div className="schema-browser">
      <div className="schema-section-title">Ingested Tables ({tables.length})</div>
      
      {tables.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-dark))', textAlign: 'center', padding: '20px 0' }}>
          No active tables. Drop a file above to load it.
        </div>
      ) : (
        <div className="table-list">
          {tables.map((table) => {
            const isExpanded = !!expandedTables[table.name];
            return (
              <div className="table-item" key={table.name}>
                <div className="table-item-header">
                  <div className="table-title" onClick={() => toggleExpand(table.name)} style={{ flex: 1, cursor: 'pointer' }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Database size={14} style={{ color: 'hsl(var(--accent-secondary))', flexShrink: 0 }} />
                    <span title={table.name} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                      {table.name}
                    </span>
                  </div>
                  
                  <div className="table-actions" style={{ flexShrink: 0 }}>
                    <button 
                      className="table-action-btn"
                      title="Load default query"
                      onClick={() => onSelectTable(table.name)}
                      id={`select-${table.name}`}
                    >
                      <Play size={12} />
                    </button>
                    <button 
                      className="table-action-btn"
                      title="Drop table"
                      onClick={() => onDeleteTable(table.name)}
                      id={`delete-${table.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="columns-list">
                    {table.columns.map((col) => (
                      <div className="column-item" key={col.name}>
                        <span className="column-name" title={col.name}>{col.name}</span>
                        <span className="column-type" title={col.type}>{col.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default SchemaBrowser;
