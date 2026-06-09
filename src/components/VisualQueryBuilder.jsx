import React, { useState, useEffect, memo } from 'react';
import { Plus, Trash2, Code, Play } from 'lucide-react';

const VisualQueryBuilder = memo(function VisualQueryBuilder({ activeTable, columns, onRunQuery, isRunning }) {
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [aggregates, setAggregates] = useState([]);
  const [filters, setFilters] = useState([]);
  const [groupBy, setGroupBy] = useState([]);
  const [sortBy, setSortBy] = useState({ column: '', direction: 'DESC' });
  const [limit, setLimit] = useState(50);
  const [generatedSql, setGeneratedSql] = useState('');

  // Reset inputs when selected active table changes
  useEffect(() => {
    setSelectedColumns([]);
    setAggregates([]);
    setFilters([]);
    setGroupBy([]);
    setSortBy({ column: '', direction: 'DESC' });
  }, [activeTable]);

  // Re-generate SQL on any parameter changes
  useEffect(() => {
    if (!activeTable) {
      setGeneratedSql('');
      return;
    }

    let selectClause = '';
    let fromClause = `FROM ${activeTable}`;
    let whereClause = '';
    let groupByClause = '';
    let orderByClause = '';
    let limitClause = `LIMIT ${limit}`;

    // Select dimensions & aggregated metrics
    const selectParts = [];
    selectedColumns.forEach(col => {
      selectParts.push(col);
    });

    aggregates.forEach(agg => {
      if (agg.column && agg.function) {
        selectParts.push(`${agg.function}(${agg.column}) AS ${agg.function.toLowerCase()}_${agg.column}`);
      }
    });

    if (selectParts.length === 0) {
      selectClause = 'SELECT *';
    } else {
      selectClause = `SELECT \n  ${selectParts.join(',\n  ')}`;
    }

    // Filters (WHERE)
    if (filters.length > 0) {
      const filterParts = filters
        .filter(f => f.column && f.operator)
        .map(f => {
          let val = f.value;
          if (f.operator === 'LIKE') {
            return `${f.column} LIKE '%${val}%'`;
          }
          if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
            return `${f.column} ${f.operator}`;
          }
          
          // Identify if target column is a text string
          const colInfo = columns.find(c => c.name === f.column);
          const isString = colInfo && colInfo.type.includes('VARCHAR');
          if (isString) {
            return `${f.column} ${f.operator} '${val}'`;
          }
          return `${f.column} ${f.operator} ${val}`;
        });
      
      if (filterParts.length > 0) {
        whereClause = `WHERE ${filterParts.join(' AND ')}`;
      }
    }

    // Group By columns (only generated if aggregates exist)
    if (groupBy.length > 0 && aggregates.length > 0) {
      groupByClause = `GROUP BY ${groupBy.join(', ')}`;
    }

    // Order By
    if (sortBy.column) {
      orderByClause = `ORDER BY ${sortBy.column} ${sortBy.direction}`;
    }

    // Construct full SQL query
    const fullSql = [
      selectClause,
      fromClause,
      whereClause,
      groupByClause,
      orderByClause,
      limitClause
    ].filter(s => !!s).join('\n');

    setGeneratedSql(fullSql);
  }, [activeTable, selectedColumns, aggregates, filters, groupBy, sortBy, limit, columns]);

  const handleToggleColumn = (colName) => {
    setSelectedColumns(prev => 
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    );
  };

  const handleAddAggregate = () => {
    setAggregates(prev => [...prev, { column: columns[0]?.name || '', function: 'SUM' }]);
  };

  const handleRemoveAggregate = (index) => {
    setAggregates(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateAggregate = (index, field, value) => {
    setAggregates(prev => prev.map((agg, i) => i === index ? { ...agg, [field]: value } : agg));
  };

  const handleAddFilter = () => {
    setFilters(prev => [...prev, { column: columns[0]?.name || '', operator: '=', value: '' }]);
  };

  const handleRemoveFilter = (index) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateFilter = (index, field, value) => {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const handleToggleGroupBy = (colName) => {
    setGroupBy(prev => 
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    );
  };

  const handleRunBuildQuery = () => {
    if (!generatedSql || isRunning) return;
    onRunQuery(generatedSql);
  };

  if (!activeTable) {
    return (
      <div className="no-data-state">
        <h3>No Table Selected</h3>
        <p>Drop a dataset file and select a table in the sidebar to open the Visual Query Builder.</p>
      </div>
    );
  }

  return (
    <div className="visual-builder-container">
      <div className="builder-grid">
        
        {/* Dimensions checkboxes */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit' }}>
            1. Dimensions / Columns
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', flex: 1 }}>
            {columns.map(col => (
              <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={selectedColumns.includes(col.name)}
                  onChange={() => handleToggleColumn(col.name)}
                  style={{ accentColor: 'hsl(var(--accent))' }}
                />
                <span style={{ fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={col.name}>{col.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'hsl(var(--accent-secondary))', fontFamily: 'monospace' }}>({col.type})</span>
              </label>
            ))}
          </div>
        </div>

        {/* Metric Aggregates */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>2. Metrics / Aggregates</span>
            <button className="table-action-btn" onClick={handleAddAggregate} style={{ padding: '2px 6px', fontSize: '0.75rem', display: 'flex', gap: '4px', alignItems: 'center' }} id="btn-builder-add-metric">
              <Plus size={12} />
              <span>Add</span>
            </button>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto', flex: 1 }}>
            {aggregates.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-dark))', textAlign: 'center', padding: '20px 0' }}>
                No aggregations configured.
              </div>
            ) : (
              aggregates.map((agg, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select 
                    className="form-select" 
                    value={agg.function}
                    onChange={(e) => handleUpdateAggregate(idx, 'function', e.target.value)}
                    style={{ padding: '4px 6px', fontSize: '0.75rem', flex: 1, height: '28px' }}
                  >
                    <option value="SUM">SUM</option>
                    <option value="AVG">AVG</option>
                    <option value="COUNT">COUNT</option>
                    <option value="MIN">MIN</option>
                    <option value="MAX">MAX</option>
                  </select>
                  
                  <select 
                    className="form-select" 
                    value={agg.column}
                    onChange={(e) => handleUpdateAggregate(idx, 'column', e.target.value)}
                    style={{ padding: '4px 6px', fontSize: '0.75rem', flex: 1.5, height: '28px' }}
                  >
                    {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>

                  <button className="table-action-btn" onClick={() => handleRemoveAggregate(idx)} style={{ color: 'hsl(var(--error))', padding: '4px' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Filters Panel */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>3. Filters (WHERE)</span>
            <button className="table-action-btn" onClick={handleAddFilter} style={{ padding: '2px 6px', fontSize: '0.75rem', display: 'flex', gap: '4px', alignItems: 'center' }} id="btn-builder-add-filter">
              <Plus size={12} />
              <span>Add</span>
            </button>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto', flex: 1 }}>
            {filters.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-dark))', textAlign: 'center', padding: '20px 0' }}>
                No filters applied.
              </div>
            ) : (
              filters.map((filter, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <select 
                    className="form-select" 
                    value={filter.column}
                    onChange={(e) => handleUpdateFilter(idx, 'column', e.target.value)}
                    style={{ padding: '4px 6px', fontSize: '0.75rem', flex: 1.2, height: '28px' }}
                  >
                    {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  
                  <select 
                    className="form-select" 
                    value={filter.operator}
                    onChange={(e) => handleUpdateFilter(idx, 'operator', e.target.value)}
                    style={{ padding: '4px 6px', fontSize: '0.75rem', flex: 1, height: '28px' }}
                  >
                    <option value="=">=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value="LIKE">contains</option>
                    <option value="IS NULL">is null</option>
                    <option value="IS NOT NULL">is not null</option>
                  </select>

                  {!['IS NULL', 'IS NOT NULL'].includes(filter.operator) && (
                    <input 
                      type="text" 
                      className="form-select" 
                      placeholder="value"
                      value={filter.value}
                      onChange={(e) => handleUpdateFilter(idx, 'value', e.target.value)}
                      style={{ padding: '4px 6px', fontSize: '0.75rem', flex: 1.2, height: '28px', backgroundColor: 'hsl(var(--bg-main))' }}
                    />
                  )}

                  <button className="table-action-btn" onClick={() => handleRemoveFilter(idx)} style={{ color: 'hsl(var(--error))', padding: '4px' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Group By selector (only shown if metrics are active) */}
        {aggregates.length > 0 && (
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit' }}>
              4. Group By Fields
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', flex: 1 }}>
              {columns.map(col => (
                <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={groupBy.includes(col.name)}
                    onChange={() => handleToggleGroupBy(col.name)}
                    style={{ accentColor: 'hsl(var(--accent))' }}
                  />
                  <span style={{ fontFamily: 'monospace' }}>{col.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Sort and Row limits */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit' }}>
            {aggregates.length > 0 ? "5. Sort & Row Limits" : "4. Sort & Row Limits"}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', width: '60px' }}>Sort By</span>
              <select 
                className="form-select" 
                value={sortBy.column}
                onChange={(e) => setSortBy(prev => ({ ...prev, column: e.target.value }))}
                style={{ padding: '4px 6px', fontSize: '0.75rem', flex: 1.5, height: '28px' }}
              >
                <option value="">-- None --</option>
                {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              
              <select 
                className="form-select" 
                value={sortBy.direction}
                onChange={(e) => setSortBy(prev => ({ ...prev, direction: e.target.value }))}
                style={{ padding: '4px 6px', fontSize: '0.75rem', flex: 1, height: '28px' }}
                disabled={!sortBy.column}
              >
                <option value="ASC">ASC</option>
                <option value="DESC">DESC</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', width: '60px' }}>Row Limit</span>
              <input 
                type="number" 
                className="form-select" 
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                style={{ padding: '4px 6px', fontSize: '0.75rem', width: '90px', height: '28px', backgroundColor: 'hsl(var(--bg-main))' }}
                min={1}
                max={10000}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SQL Preview block */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: '0.85rem', display: 'flex', gap: '6px', alignItems: 'center', fontFamily: 'Outfit' }}>
            <Code size={14} style={{ color: 'hsl(var(--accent-secondary))' }} />
            <span>Generated SQL Statement</span>
          </h4>
          <button 
            className="btn-run"
            onClick={handleRunBuildQuery}
            disabled={isRunning || !generatedSql}
            id="btn-run-builder-query"
            style={{ height: '32px' }}
          >
            <Play size={12} fill="#fff" />
            <span>Run Query</span>
          </button>
        </div>
        <pre className="generated-sql-block">{generatedSql}</pre>
      </div>
    </div>
  );
});

export default VisualQueryBuilder;
