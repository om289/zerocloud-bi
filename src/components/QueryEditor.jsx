import React, { useState, useEffect, memo } from 'react';
import { Play, RotateCcw, Clock, Database, History } from 'lucide-react';

const QueryEditor = memo(function QueryEditor({ query, setQuery, onRunQuery, isRunning, lastExecutionResult }) {
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('duckdb_query_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save new query to history upon execution
  const executeQuery = () => {
    if (!query.trim() || isRunning) return;
    
    // Run parent callback
    onRunQuery(query);

    // Save to history
    setHistory(prev => {
      const filtered = prev.filter(q => q !== query); // remove duplicate
      const updated = [query, ...filtered].slice(0, 30); // limit to 30 items
      localStorage.setItem('duckdb_query_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleKeyDown = (e) => {
    // Ctrl+Enter or Cmd+Enter to run query
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
    }
  };

  const clearQuery = () => {
    setQuery('');
  };

  const selectHistoryItem = (item) => {
    setQuery(item);
    setShowHistory(false);
  };

  return (
    <div className="glass-panel editor-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Database size={16} style={{ color: 'hsl(var(--accent))' }} />
          <span>SQL Query Workspace</span>
        </div>
        
        <div className="editor-controls">
          <button 
            className="btn-outline"
            title="View query history"
            onClick={() => setShowHistory(!showHistory)}
            id="btn-history"
          >
            <History size={14} />
            <span>History</span>
          </button>
          
          <button 
            className="btn-outline" 
            title="Clear editor"
            onClick={clearQuery}
            disabled={isRunning || !query}
            id="btn-clear"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
          
          <button 
            className="btn-run"
            onClick={executeQuery}
            disabled={isRunning || !query.trim()}
            id="btn-run-query"
          >
            <Play size={14} fill="#fff" />
            <span>{isRunning ? "Running..." : "Run (Ctrl+Enter)"}</span>
          </button>
        </div>
      </div>

      <div className="editor-wrapper" style={{ position: 'relative' }}>
        <textarea
          className="sql-textarea"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="-- Write your SQL queries here...&#10;-- Example: SELECT * FROM your_table LIMIT 10;"
          disabled={isRunning}
          id="sql-editor-textarea"
        />

        {showHistory && (
          <div className="history-dropdown" style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '320px',
            height: '100%',
            backgroundColor: 'hsl(var(--bg-card))',
            borderLeft: '1px solid hsl(var(--border))',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div className="panel-header" style={{ padding: '10px 16px', borderBottom: '1px solid hsl(var(--border))' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Query History</span>
              <button 
                onClick={() => setShowHistory(false)} 
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Close
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {history.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-dark))', textAlign: 'center', padding: '20px 0' }}>
                  No queries run yet.
                </div>
              ) : (
                history.map((hQuery, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => selectHistoryItem(hQuery)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxHeight: '80px',
                      transition: '0.2s',
                    }}
                    className="history-item-row"
                  >
                    {hQuery}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="editor-status-bar">
        <div>
          {lastExecutionResult && lastExecutionResult.success && (
            <span style={{ color: 'hsl(var(--accent-secondary))' }}>
              {lastExecutionResult.rows.length} rows returned.
            </span>
          )}
          {lastExecutionResult && !lastExecutionResult.success && (
            <span style={{ color: 'hsl(var(--error))' }}>
              Query failed.
            </span>
          )}
        </div>
        
        {lastExecutionResult && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} />
            <span>Took {lastExecutionResult.executionTimeMs}ms</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default QueryEditor;
