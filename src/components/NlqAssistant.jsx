import React, { useState, useEffect, memo } from 'react';
import { Sparkles, ArrowRight, Play, FileCode, Clock, Trash2, Settings } from 'lucide-react';

const NlqAssistant = memo(function NlqAssistant({ activeTable, columns, onRunQuery }) {
  const [inputText, setInputText] = useState('');
  const [compiledSql, setCompiledSql] = useState('');
  const [explanations, setExplanations] = useState([]);
  const [queryHistory, setQueryHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Gemini API states
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load API key from local storage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  // Helper to compute edit distance locally
  const getLevenshteinDistance = (a, b) => {
    const tmp = [];
    let i, j, alen = a.length, blen = b.length;
    if (alen === 0) return blen;
    if (blen === 0) return alen;
    for (i = 0; i <= alen; i++) tmp[i] = [i];
    for (j = 0; j <= blen; j++) tmp[0][j] = j;
    for (i = 1; i <= alen; i++) {
      for (j = 1; j <= blen; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[alen][blen];
  };

  const handleTranslate = async () => {
    if (!inputText.trim() || !activeTable) return;

    if (apiKey.trim()) {
      setLoading(true);
      setExplanations(["Sending request to Gemini model for schema-aware SQL translation..."]);
      setCompiledSql('');
      
      const schemaDescription = columns.map(c => `"${c.name}" (${c.type})`).join(', ');
      const prompt = `You are a professional text-to-SQL compiler translating natural queries to DuckDB SQL.
Active Table Name: "${activeTable}"
Columns & Types: ${schemaDescription}

User Request: "${inputText}"

Generate a single valid DuckDB SQL query. Follow these rules strictly:
1. Output ONLY the raw SQL statement.
2. Do NOT wrap it in markdown code blocks (\`\`\`sql).
3. Do NOT explain the query or output anything else.
4. Ensure all table and column names match the schema exactly.
5. Limit the results to a maximum of 100 rows unless specified otherwise.`;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const data = await response.json();
        if (response.ok) {
          let sql = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          sql = sql.trim().replace(/^```sql\s*/i, '').replace(/```$/, '').trim();
          
          setCompiledSql(sql);
          setExplanations([
            `Gemini AI translation successful.`,
            `Model used: gemini-2.5-flash`,
            `Context schema: "${activeTable}" (${columns.length} columns)`
          ]);
          
          setQueryHistory(prev => {
            const entry = { id: Date.now(), naturalText: inputText, sql, timestamp: new Date().toLocaleTimeString() };
            return [entry, ...prev].slice(0, 20);
          });
        } else {
          const errMessage = data.error?.message || JSON.stringify(data);
          throw new Error(errMessage);
        }
      } catch (err) {
        console.error(err);
        setExplanations([
          `Gemini API Error: ${err.message}`,
          `Falling back to local heuristic translation...`
        ]);
        runLocalHeuristics();
      } finally {
        setLoading(false);
      }
    } else {
      runLocalHeuristics();
    }
  };

  const runLocalHeuristics = () => {
    let query = inputText.toLowerCase().trim();
    const explanationList = [
      "Using local offline heuristic engine.",
      "Enter a Gemini API Key in the settings toggle to activate advanced AI translations."
    ];

    // Local spelling autocorrect mapping columns
    const queryWords = query.split(/[\s,()=+\-*/]+/);
    queryWords.forEach(word => {
      if (word.length < 3) return;
      if (['show', 'select', 'from', 'where', 'group', 'order', 'limit', 'count', 'sum', 'average', 'avg', 'min', 'max', 'by', 'and', 'or', 'not', 'the', 'all', 'each', 'for', 'with', 'grouped', 'sorted'].includes(word)) return;

      let closestCol = null;
      let minDistance = 3;

      columns.forEach(col => {
        const colNameLower = col.name.toLowerCase();
        const dist = getLevenshteinDistance(word, colNameLower);
        if (dist < minDistance) {
          minDistance = dist;
          closestCol = col.name;
        }
      });

      if (closestCol && closestCol.toLowerCase() !== word) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        query = query.replace(regex, closestCol.toLowerCase());
        explanationList.push(`Autocorrected spelling: "${word}" → "${closestCol}"`);
      }
    });

    let selectFields = [];
    let whereFilters = [];
    let orderBy = '';
    let limit = 50;
    let groupBy = [];

    // 1. Detect Aggregations
    let isAggregated = false;
    let aggFunction = '';
    let aggColumn = '';

    const countTriggers = ['count', 'how many', 'number of', 'total count'];
    const sumTriggers = ['sum', 'total amount', 'cumulative', 'sum of'];
    const avgTriggers = ['average', 'mean', 'avg', 'average of'];
    const maxTriggers = ['max', 'highest', 'maximum', 'most', 'largest'];
    const minTriggers = ['min', 'lowest', 'minimum', 'least', 'smallest'];

    let matchedAgg = null;
    if (countTriggers.some(t => query.includes(t))) matchedAgg = 'COUNT';
    else if (sumTriggers.some(t => query.includes(t))) matchedAgg = 'SUM';
    else if (avgTriggers.some(t => query.includes(t))) matchedAgg = 'AVG';
    else if (maxTriggers.some(t => query.includes(t))) matchedAgg = 'MAX';
    else if (minTriggers.some(t => query.includes(t))) matchedAgg = 'MIN';

    if (matchedAgg) {
      isAggregated = true;
      aggFunction = matchedAgg;

      const numericCol = columns.find(c =>
        query.includes(c.name.toLowerCase()) &&
        (c.type.includes('INT') || c.type.includes('DOUBLE') || c.type.includes('FLOAT') || c.type.includes('NUMERIC'))
      );

      if (numericCol) {
        aggColumn = numericCol.name;
        explanationList.push(`Detected aggregation: ${matchedAgg} of column "${numericCol.name}"`);
      } else {
        aggColumn = '*';
        explanationList.push(`Detected aggregation: ${matchedAgg} (defaulted to count rows)`);
      }
    }

    const mentionedColumns = columns.filter(col => {
      const colNameLower = col.name.toLowerCase();
      return query.includes(colNameLower);
    });

    mentionedColumns.forEach(col => {
      if (col.name !== aggColumn) {
        selectFields.push(col.name);
      }
    });

    if (selectFields.length > 0) {
      explanationList.push(`Identified query columns: ${selectFields.map(f => `"${f}"`).join(', ')}`);
      if (isAggregated) {
        groupBy = [...selectFields];
        explanationList.push(`Auto-grouping by dimensions: ${groupBy.map(g => `"${g}"`).join(', ')}`);
      }
    }

    // 3. Filters Parsing
    columns.forEach(col => {
      const colNameLower = col.name.toLowerCase();
      if (query.includes(colNameLower)) {
        let filterAdded = false;

        const matchIs = query.match(new RegExp(`${colNameLower}\\s+(?:is|=|equals)\\s+['"]?([a-zA-Z0-9_\\s\\.-]+)['"]?`, 'i'));
        if (matchIs && matchIs[1]) {
          const val = matchIs[1].trim();
          const isString = col.type.includes('VARCHAR') || col.type.includes('TEXT') || isNaN(Number(val));
          const formattedVal = isString ? `'${val}'` : val;
          whereFilters.push(`${col.name} = ${formattedVal}`);
          explanationList.push(`Applied filter: ${col.name} matches "${val}"`);
          filterAdded = true;
        }

        if (!filterAdded) {
          const matchContains = query.match(new RegExp(`${colNameLower}\\s+(?:contains|like)\\s+['"]?([a-zA-Z0-9_\\s\\.-]+)['"]?`, 'i'));
          if (matchContains && matchContains[1]) {
            const val = matchContains[1].trim();
            whereFilters.push(`${col.name} LIKE '%${val}%'`);
            explanationList.push(`Applied filter: ${col.name} contains "${val}"`);
            filterAdded = true;
          }
        }

        if (!filterAdded) {
          const matchGt = query.match(new RegExp(`${colNameLower}\\s*(?:>|greater\\s+than)\\s*([0-9.]+)`, 'i'));
          if (matchGt && matchGt[1]) {
            whereFilters.push(`${col.name} > ${matchGt[1]}`);
            explanationList.push(`Applied filter: ${col.name} greater than ${matchGt[1]}`);
            filterAdded = true;
          }
        }

        if (!filterAdded) {
          const matchLt = query.match(new RegExp(`${colNameLower}\\s*(?:<|less\\s+than)\\s*([0-9.]+)`, 'i'));
          if (matchLt && matchLt[1]) {
            whereFilters.push(`${col.name} < ${matchLt[1]}`);
            explanationList.push(`Applied filter: ${col.name} less than ${matchLt[1]}`);
            filterAdded = true;
          }
        }
      }
    });

    // 4. Order By parsing
    const orderCol = columns.find(c => query.includes(`by ${c.name.toLowerCase()}`) || query.includes(`sort by ${c.name.toLowerCase()}`));
    if (orderCol) {
      const isAsc = query.includes('asc') || query.includes('lowest') || query.includes('ascending');
      orderBy = `ORDER BY ${orderCol.name} ${isAsc ? 'ASC' : 'DESC'}`;
      explanationList.push(`Sorting results by: ${orderCol.name} (${isAsc ? 'ascending' : 'descending'})`);
    } else if (aggColumn && aggColumn !== '*' && isAggregated) {
      orderBy = `ORDER BY ${aggFunction.toLowerCase()}_${aggColumn} DESC`;
      explanationList.push(`Default sorting: aggregated metric descending`);
    }

    // 5. Limit parsing
    const limitMatch = query.match(/(?:limit|top|first)\s+([0-9]+)/i);
    if (limitMatch && limitMatch[1]) {
      limit = parseInt(limitMatch[1], 10);
      explanationList.push(`Applied row limit: ${limit}`);
    }

    // Assemble SQL
    let selectClause = 'SELECT ';
    if (isAggregated) {
      const selectParts = [];
      selectFields.forEach(f => selectParts.push(f));

      const alias = aggColumn === '*' ? 'count_rows' : `${aggFunction.toLowerCase()}_${aggColumn}`;
      selectParts.push(`${aggFunction}(${aggColumn}) AS ${alias}`);
      selectClause += selectParts.join(', ');
    } else if (selectFields.length > 0) {
      selectClause += selectFields.join(', ');
    } else {
      selectClause += '*';
    }

    let sql = `${selectClause}\nFROM ${activeTable}`;
    if (whereFilters.length > 0) {
      sql += `\nWHERE ${whereFilters.join(' AND ')}`;
    }
    if (groupBy.length > 0) {
      sql += `\nGROUP BY ${groupBy.join(', ')}`;
    }
    if (orderBy) {
      sql += `\n${orderBy}`;
    }
    sql += `\nLIMIT ${limit};`;

    setCompiledSql(sql);
    setExplanations(explanationList);

    setQueryHistory(prev => {
      const entry = { id: Date.now(), naturalText: inputText, sql, timestamp: new Date().toLocaleTimeString() };
      return [entry, ...prev].slice(0, 20);
    });
  };

  const handleReplayHistory = (entry) => {
    setInputText(entry.naturalText);
    setCompiledSql(entry.sql);
    setShowHistory(false);
  };

  if (!activeTable) {
    return (
      <div className="no-data-state">
        <Sparkles size={24} />
        <h3>No Table Selected</h3>
        <p>Drop a dataset file and select a table to use the Natural Language Query assistant.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
      <div className="nlq-container">
        <Sparkles size={20} style={{ color: 'hsl(var(--accent-secondary))' }} />
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask in English (e.g. 'show count of characters grouped by publisher where alignment is good')"
          className="nlq-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTranslate();
          }}
        />
        <button className="btn-run" onClick={handleTranslate} style={{ height: '34px', padding: '0 16px' }} id="btn-translate-nlq" disabled={loading}>
          <span>{loading ? "Translating..." : "Analyze"}</span>
          <ArrowRight size={14} />
        </button>
        <button
          className={`btn-outline ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          style={{ height: '34px', padding: '0 10px', flexShrink: 0 }}
          title="Gemini API key settings"
        >
          <Settings size={14} />
        </button>
        <button
          className="btn-outline"
          onClick={() => setShowHistory(!showHistory)}
          style={{ height: '34px', padding: '0 10px', flexShrink: 0, position: 'relative' }}
          title="Query History"
        >
          <Clock size={14} />
          {queryHistory.length > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px',
              borderRadius: '50%', backgroundColor: 'hsl(var(--accent-secondary))',
              fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700
            }}>{queryHistory.length}</span>
          )}
        </button>
      </div>

      {showSettings && (
        <div className="glass-panel" style={{
          padding: '16px',
          border: '1px dashed hsl(var(--border))',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          backgroundColor: 'rgba(0,0,0,0.15)',
          animation: 'fadeIn var(--transition-normal)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-muted))' }}>Gemini API Key</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="password" 
                placeholder="Enter Gemini API Key..."
                className="form-select"
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
                style={{ flex: 1, height: '30px', padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'hsl(var(--bg-main))' }}
              />
              {apiKey && (
                <button 
                  className="table-action-btn"
                  onClick={() => saveApiKey('')}
                  style={{ color: 'hsl(var(--error))', fontSize: '0.75rem', padding: '0 8px' }}
                >
                  Clear Key
                </button>
              )}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-dark))' }}>
              Your API key is saved locally in your browser's local storage and used directly to communicate with Gemini.
            </span>
          </div>
        </div>
      )}

      {/* Query History Dropdown */}
      {showHistory && queryHistory.length > 0 && (
        <div className="glass-panel" style={{
          padding: '12px', maxHeight: '200px', overflowY: 'auto',
          border: '1px solid hsl(var(--accent-secondary))',
          display: 'flex', flexDirection: 'column', gap: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--accent-secondary))' }}>Recent NLQ Queries</span>
            <button className="table-action-btn" onClick={() => setQueryHistory([])} style={{ fontSize: '0.65rem', padding: '2px 4px' }}>
              <Trash2 size={10} /> Clear
            </button>
          </div>
          {queryHistory.map(entry => (
            <div
              key={entry.id}
              onClick={() => handleReplayHistory(entry)}
              style={{
                padding: '8px 10px', borderRadius: '4px', cursor: 'pointer',
                backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid hsl(var(--border))',
                transition: 'all 0.15s ease', fontSize: '0.75rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'hsl(var(--accent-secondary))'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'hsl(var(--border))'}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                "{entry.naturalText}"
              </span>
              <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-dark))', flexShrink: 0 }}>
                {entry.timestamp}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px', flex: 1 }}>
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit' }}>
            NLP Parsing Heuristics
          </h4>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
            {explanations.length === 0 ? (
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-dark))', fontStyle: 'italic' }}>
                Heuristic mapping tokens will display here once parsed.
              </span>
            ) : (
              explanations.map((exp, idx) => (
                <div key={idx} style={{ fontSize: '0.75rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'hsl(var(--accent-secondary))' }} />
                  <span>{exp}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ fontSize: '0.85rem', display: 'flex', gap: '6px', alignItems: 'center', fontFamily: 'Outfit' }}>
              <FileCode size={14} style={{ color: 'hsl(var(--accent))' }} />
              <span>Compiled SQL Output</span>
            </h4>
            <button
              className="btn-run"
              onClick={() => onRunQuery(compiledSql)}
              disabled={!compiledSql}
              style={{ height: '28px', fontSize: '0.75rem', padding: '0 12px' }}
              id="btn-run-nlq-sql"
            >
              <Play size={10} fill="#fff" />
              <span>Execute SQL</span>
            </button>
          </div>
          <pre className="generated-sql-block" style={{ flex: 1, minHeight: '120px' }}>
            {compiledSql || '-- SQL statement will generate here.'}
          </pre>
        </div>
      </div>
    </div>
  );
});

export default NlqAssistant;
