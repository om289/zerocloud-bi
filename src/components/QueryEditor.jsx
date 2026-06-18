import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Play, RotateCcw, Clock, Database, History, HelpCircle, Code } from 'lucide-react';
import { runQuery } from '../lib/duckdb';

const VisualExplainPlan = ({ planText }) => {
  const blocks = useMemo(() => {
    if (!planText) return [];
    const lines = planText.split('\n');
    const items = [];
    let currentBlock = [];
    let inBox = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (line.includes('┌') || line.includes('╔') || (trimmed.startsWith('+-') && trimmed.endsWith('-+'))) {
        inBox = true;
        if (currentBlock.length > 0) {
          items.push({ type: 'text', content: currentBlock.join('\n') });
          currentBlock = [];
        }
      } else if (line.includes('└') || line.includes('╚') || (inBox && trimmed.startsWith('+-') && trimmed.endsWith('-+'))) {
        inBox = false;
        items.push({ type: 'node', content: currentBlock });
        currentBlock = [];
      } else {
        if (inBox) {
          // Clean the box characters
          const cleanLine = line.replace(/[│┃║]/g, '').trim();
          if (cleanLine) {
            currentBlock.push(cleanLine);
          }
        } else {
          if (trimmed) {
            items.push({ type: 'connector', text: trimmed });
          }
        }
      }
    });

    if (currentBlock.length > 0) {
      items.push({ type: inBox ? 'node' : 'text', content: currentBlock });
    }

    return items;
  }, [planText]);

  if (blocks.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid hsl(var(--border))', overflowX: 'auto', maxHeight: '400px' }}>
      {blocks.map((block, idx) => {
        if (block.type === 'node') {
          const title = block.content[0] || 'OPERATOR';
          const details = block.content.slice(1);
          
          let headerColor = 'linear-gradient(135deg, #3b82f6, #1d4ed8)'; // default blue
          if (title.includes('SCAN')) headerColor = 'linear-gradient(135deg, #10b981, #047857)'; // green
          if (title.includes('FILTER')) headerColor = 'linear-gradient(135deg, #f59e0b, #b45309)'; // amber
          if (title.includes('JOIN')) headerColor = 'linear-gradient(135deg, #ef4444, #b91c1c)'; // red
          if (title.includes('AGGREGATE') || title.includes('GROUP') || title.includes('SUMMARIZE')) headerColor = 'linear-gradient(135deg, #8b5cf6, #6d28d9)'; // purple

          return (
            <div key={idx} className="explain-node-card" style={{
              width: '280px',
              backgroundColor: 'hsl(var(--bg-card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              overflow: 'hidden',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            }}>
              <div style={{
                background: headerColor,
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: '#fff',
                fontFamily: 'Outfit',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textAlign: 'center'
              }}>
                {title}
              </div>
              {details.length > 0 && (
                <div style={{
                  padding: '8px 12px',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: 'hsl(var(--text-muted))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}>
                  {details.map((d, i) => (
                    <div key={i} style={{ borderBottom: i < details.length - 1 ? '1px dashed rgba(255,255,255,0.03)' : 'none', paddingBottom: '2px', whiteSpace: 'pre-wrap' }}>{d}</div>
                  ))}
                </div>
              )}
            </div>
          );
        } else if (block.type === 'connector') {
          return (
            <div key={idx} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: 'hsl(var(--accent-secondary))',
              fontSize: '1rem',
              fontWeight: 'bold',
              margin: '2px 0'
            }}>
              {block.text === '│' || block.text === '┃' || block.text === '║' ? '↓' : block.text}
            </div>
          );
        } else {
          return (
            <pre key={idx} style={{
              fontSize: '0.7rem',
              color: 'hsl(var(--text-muted))',
              margin: 0,
              padding: '4px',
              fontFamily: 'monospace'
            }}>
              {block.content}
            </pre>
          );
        }
      })}
    </div>
  );
};

const QueryEditor = memo(function QueryEditor({ query, setQuery, onRunQuery, isRunning, lastExecutionResult, activeTable, columns = [] }) {
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [activeSugIdx, setActiveSugIdx] = useState(0);
  const [sugPosition, setSugPosition] = useState({ top: 0, left: 0 });
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Explain Plan state
  const [explainPlan, setExplainPlan] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState(null);

  const textareaRef = useRef(null);

  // Load history
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

  const executeQuery = () => {
    if (!query.trim() || isRunning) return;
    setExplainPlan(null); // clear plan on run
    onRunQuery(query);

    // Save to history
    setHistory(prev => {
      const filtered = prev.filter(q => q !== query);
      const updated = [query, ...filtered].slice(0, 30);
      localStorage.setItem('duckdb_query_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleExplain = async () => {
    if (!query.trim() || isRunning) return;
    setExplainLoading(true);
    setExplainError(null);
    setExplainPlan(null);

    const cleanedQuery = query.trim().replace(/;+$/, '');
    const explainQuery = `EXPLAIN ${cleanedQuery};`;
    try {
      const result = await runQuery(explainQuery);
      if (result.success && result.rows && result.rows.length > 0 && result.columns && result.columns.length > 0) {
        // Typically has "Explain Plan" or "value" column
        const planKey = result.columns[0];
        const planText = result.rows.map(r => r[planKey]).filter(val => val !== undefined && val !== null).join('\n');
        setExplainPlan(planText);
      } else {
        setExplainError(result.error || "Failed to retrieve execution plan.");
      }
    } catch (err) {
      setExplainError(err.message);
    } finally {
      setExplainLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    // Autocomplete navigation
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSugIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSugIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSuggestion(suggestions[activeSugIdx].value);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }

    // Ctrl+Enter to run query
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
      return;
    }

    // Intercept Tab inside textarea
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newQuery = query.substring(0, start) + "  " + query.substring(end);
      setQuery(newQuery);
      
      // Reset cursor
      setTimeout(() => {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursor);
    const words = textBeforeCursor.split(/[\s,()=+\-*/]+/);
    const lastWord = words[words.length - 1] || '';

    if (lastWord.length >= 2) {
      // Find matches in SQL Keywords and Columns/Tables
      const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'HAVING', 'PIVOT'];
      const columnNames = columns.map(c => c.name);
      const tableNames = activeTable ? [activeTable] : [];

      const list = [];
      keywords.forEach(k => {
        if (k.toLowerCase().startsWith(lastWord.toLowerCase())) {
          list.push({ type: 'keyword', value: k });
        }
      });
      columnNames.forEach(c => {
        if (c.toLowerCase().startsWith(lastWord.toLowerCase())) {
          list.push({ type: 'column', value: c });
        }
      });
      tableNames.forEach(t => {
        if (t.toLowerCase().startsWith(lastWord.toLowerCase())) {
          list.push({ type: 'table', value: t });
        }
      });

      if (list.length > 0) {
        setSuggestions(list.slice(0, 10));
        setActiveSugIdx(0);
        setShowSuggestions(true);

        // Approximate coordinates of dropdown list
        const lines = textBeforeCursor.split('\n');
        const currentLineIdx = lines.length - 1;
        const currentCharIdx = lines[currentLineIdx].length;
        
        setSugPosition({
          top: 35 + currentLineIdx * 20,
          left: 20 + currentCharIdx * 8
        });
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const insertSuggestion = (value) => {
    const start = textareaRef.current.selectionStart;
    const textBeforeCursor = query.substring(0, start);
    
    // Find the word being replaced
    const match = textBeforeCursor.match(/([a-zA-Z0-9_]+)$/);
    const wordLength = match ? match[1].length : 0;
    
    const newQuery = query.substring(0, start - wordLength) + value + query.substring(start);
    setQuery(newQuery);
    setShowSuggestions(false);

    const newCursorPos = start - wordLength + value.length;
    setTimeout(() => {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newCursorPos;
    }, 0);
  };

  const injectColumnAtCursor = (colName) => {
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const newQuery = query.substring(0, start) + colName + query.substring(end);
    setQuery(newQuery);

    setTimeout(() => {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + colName.length;
    }, 0);
  };

  const formatQuery = () => {
    if (!query) return;
    
    // Clean up extra spaces
    let sql = query.trim().replace(/\s+/g, ' ');
    
    // Replace standard keywords to uppercase and insert linebreaks
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 
      'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'FULL JOIN', 'ON', 'AND', 'OR', 
      'HAVING', 'PIVOT', 'USING', 'OVER', 'PARTITION BY'
    ];
    
    keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      sql = sql.replace(regex, kw);
    });

    // Format query structure with linebreaks and indentation
    sql = sql
      .replace(/\b(SELECT)\b/g, '$1')
      .replace(/\b(FROM|WHERE|GROUP BY|ORDER BY|LIMIT|HAVING|PIVOT|LEFT JOIN|INNER JOIN|RIGHT JOIN|FULL JOIN|JOIN)\b/g, '\n$1')
      .replace(/\b(AND|OR)\b/g, '\n  $1');

    // Remove any double line breaks or extra spaces near newlines
    sql = sql.split('\n').map(line => line.trimEnd()).join('\n');
    
    setQuery(sql);
  };

  const clearQuery = () => {
    setQuery('');
    setExplainPlan(null);
    setExplainError(null);
  };

  const selectHistoryItem = (item) => {
    setQuery(item);
    setShowHistory(false);
  };

  return (
    <div className="glass-panel editor-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Database size={16} style={{ color: 'hsl(var(--accent))' }} />
          <span>SQL Query Workspace</span>
        </div>
        
        <div className="editor-controls">
          <button className="btn-outline" onClick={formatQuery} title="Auto-uppercase standard keywords" id="btn-format">
            <span>Format</span>
          </button>

          <button 
            className="btn-outline"
            title="View execution tree"
            onClick={handleExplain}
            disabled={explainLoading || !query.trim()}
            id="btn-explain"
          >
            <span>Profile Explain</span>
          </button>

          <button 
            className="btn-outline"
            title="View query history"
            onClick={() => setShowHistory(!showHistory)}
            id="btn-history"
          >
            <Clock size={14} />
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

      {/* Quick Inject columns bar */}
      {activeTable && columns.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', padding: '6px 20px', borderBottom: '1px solid hsl(var(--border))', overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', alignSelf: 'center', whiteSpace: 'nowrap' }}>Columns:</span>
          {columns.map(col => (
            <button 
              key={col.name}
              onClick={() => injectColumnAtCursor(col.name)}
              className="table-action-btn"
              style={{ fontSize: '0.7rem', fontFamily: 'monospace', padding: '2px 6px', border: '1px solid hsl(var(--border))', borderRadius: '4px' }}
            >
              {col.name}
            </button>
          ))}
        </div>
      )}

      <div className="editor-wrapper" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <textarea
          ref={textareaRef}
          className="sql-textarea"
          value={query}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="-- Write your SQL queries here...&#10;-- Example: SELECT * FROM your_table LIMIT 10;"
          disabled={isRunning}
          id="sql-editor-textarea"
          style={{ flex: 1 }}
        />

        {/* Suggestion Dropdown overlay */}
        {showSuggestions && (
          <div 
            className="autocomplete-suggestions"
            style={{
              top: `${Math.min(sugPosition.top, 250)}px`,
              left: `${Math.min(sugPosition.left, 450)}px`
            }}
          >
            {suggestions.map((sug, idx) => (
              <div 
                key={idx}
                className={`autocomplete-item ${idx === activeSugIdx ? 'active' : ''}`}
                onClick={() => insertSuggestion(sug.value)}
              >
                <span>{sug.value}</span>
                <span className="autocomplete-type">{sug.type}</span>
              </div>
            ))}
          </div>
        )}

        {/* Explain profiling plan results overlay/panel */}
        {explainPlan && (
          <div className="explain-plan-container no-print" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '4px', marginBottom: '8px' }}>
              <span style={{ color: 'hsl(var(--accent-secondary))', fontWeight: 600, fontSize: '0.75rem' }}>Visual Execution Plan</span>
              <button 
                onClick={() => setExplainPlan(null)}
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', fontSize: '0.7rem' }}
              >
                Hide
              </button>
            </div>
            <VisualExplainPlan planText={explainPlan} />
          </div>
        )}

        {explainError && (
          <div className="error-panel" style={{ margin: '10px' }}>
            <span>Plan Profiling failed:</span>
            <pre style={{ margin: '4px 0 0 0', fontSize: '0.75rem' }}>{explainError}</pre>
          </div>
        )}

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
