import React, { useState, useEffect, useMemo, memo } from 'react';
import { Plus, Trash2, Code, Play } from 'lucide-react';

const quoteIdentifier = (ident) => {
  if (!ident) return '';
  if (ident.includes('"') || ident.includes('(')) return ident;
  if (ident.includes('.')) {
    return ident.split('.').map(part => `"${part}"`).join('.');
  }
  return `"${ident}"`;
};

const VisualQueryBuilder = memo(function VisualQueryBuilder({ activeTable, columns, tables = [], onRunQuery, isRunning }) {
  // Joins Configuration
  const [joins, setJoins] = useState([]); // Array of { joinTable: '', joinType: 'INNER JOIN', activeKey: '', joinKey: '' }
  // Calculated Fields
  const [calcFields, setCalcFields] = useState([]); // Array of { expression: '', alias: '' }

  const [selectedColumns, setSelectedColumns] = useState([]);
  const [aggregates, setAggregates] = useState([]);
  const [filters, setFilters] = useState([]);
  const [groupBy, setGroupBy] = useState([]);
  const [sortBy, setSortBy] = useState({ column: '', direction: 'DESC' });
  const [limit, setLimit] = useState(50);
  const [generatedSql, setGeneratedSql] = useState('');

  // Reset inputs when selected active table changes
  useEffect(() => {
    setJoins([]);
    setCalcFields([]);
    setSelectedColumns([]);
    setAggregates([]);
    setFilters([]);
    setGroupBy([]);
    setSortBy({ column: '', direction: 'DESC' });
  }, [activeTable]);

  // Combine columns from active table and joined tables
  const availableColumns = useMemo(() => {
    if (!activeTable) return [];
    
    // Add columns from active table, prefixed with table name
    const list = columns.map(c => ({
      name: `${activeTable}.${c.name}`,
      shortName: c.name,
      tableName: activeTable,
      type: c.type
    }));

    // Add columns from joined tables
    joins.forEach(join => {
      if (!join.joinTable) return;
      const joinedTableObj = tables.find(t => t.name === join.joinTable);
      if (joinedTableObj) {
        joinedTableObj.columns.forEach(c => {
          list.push({
            name: `${join.joinTable}.${c.name}`,
            shortName: c.name,
            tableName: join.joinTable,
            type: c.type
          });
        });
      }
    });

    return list;
  }, [activeTable, columns, joins, tables]);

  // Auto-Group By recommender: if aggregates exist, dimension columns should be in group by
  useEffect(() => {
    if (aggregates.length > 0) {
      // Find columns that are checked as dimensions
      const dimensionCols = selectedColumns.filter(c => !c.includes('('));
      // Auto-set them in Group By
      setGroupBy(dimensionCols);
    } else {
      setGroupBy([]);
    }
  }, [selectedColumns, aggregates]);

  // Re-generate SQL on any parameter changes
  useEffect(() => {
    if (!activeTable) {
      setGeneratedSql('');
      return;
    }

    let selectClause = '';
    let fromClause = `FROM ${quoteIdentifier(activeTable)}`;
    let joinClause = '';
    let whereClause = '';
    let groupByClause = '';
    let orderByClause = '';
    let limitClause = `LIMIT ${limit}`;

    // Select dimensions, metrics & calculated fields
    const selectParts = [];
    selectedColumns.forEach(col => {
      selectParts.push(quoteIdentifier(col));
    });

    aggregates.forEach(agg => {
      if (agg.column && agg.function) {
        const quotedCol = quoteIdentifier(agg.column);
        const safeAlias = `${agg.function.toLowerCase()}_${agg.column.replace(/[^a-zA-Z0-9]/g, '_')}`;
        selectParts.push(`${agg.function}(${quotedCol}) AS "${safeAlias}"`);
      }
    });

    calcFields.forEach(calc => {
      if (calc.expression && calc.alias) {
        selectParts.push(`${calc.expression} AS "${calc.alias}"`);
      }
    });

    if (selectParts.length === 0) {
      selectClause = 'SELECT *';
    } else {
      selectClause = `SELECT \n  ${selectParts.join(',\n  ')}`;
    }

    // Joins SQL Compilation
    joins.forEach(join => {
      if (join.joinTable && join.activeKey && join.joinKey) {
        const quotedJoinTable = `"${join.joinTable}"`;
        const quotedActiveKey = quoteIdentifier(join.activeKey);
        const quotedJoinKey = `"${join.joinTable}"."${join.joinKey}"`;
        joinClause += `\n${join.joinType} ${quotedJoinTable} ON ${quotedActiveKey} = ${quotedJoinKey}`;
      }
    });

    // Filters (WHERE)
    if (filters.length > 0) {
      const filterParts = filters
        .filter(f => f.column && f.operator)
        .map(f => {
          let val = f.value;
          const colInfo = availableColumns.find(c => c.name === f.column);
          const isString = colInfo && (colInfo.type.includes('VARCHAR') || colInfo.type.includes('TEXT'));
          const quotedCol = quoteIdentifier(f.column);

          if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
            return `${quotedCol} ${f.operator}`;
          }

          if (f.operator === 'BETWEEN') {
            const val2 = f.value2 || '';
            if (isString) {
              return `${quotedCol} BETWEEN '${val}' AND '${val2}'`;
            }
            return `${quotedCol} BETWEEN ${val} AND ${val2}`;
          }

          if (f.operator === 'IN') {
            // Split by comma
            const items = val.split(',').map(x => x.trim());
            const formattedItems = items.map(item => isString ? `'${item}'` : item).join(', ');
            return `${quotedCol} IN (${formattedItems})`;
          }

          if (f.operator === 'LIKE') {
            return `${quotedCol} LIKE '%${val}%'`;
          }
          
          if (isString) {
            return `${quotedCol} ${f.operator} '${val}'`;
          }
          return `${quotedCol} ${f.operator} ${val}`;
        });
      
      if (filterParts.length > 0) {
        whereClause = `WHERE ${filterParts.join(' AND ')}`;
      }
    }

    // Group By columns (only generated if aggregates exist)
    if (groupBy.length > 0 && aggregates.length > 0) {
      const quotedGroupBy = groupBy.map(col => quoteIdentifier(col));
      groupByClause = `GROUP BY ${quotedGroupBy.join(', ')}`;
    }

    // Order By
    if (sortBy.column) {
      orderByClause = `ORDER BY ${quoteIdentifier(sortBy.column)} ${sortBy.direction}`;
    }

    // Construct full SQL query
    const fullSql = [
      selectClause,
      fromClause + joinClause,
      whereClause,
      groupByClause,
      orderByClause,
      limitClause
    ].filter(s => !!s).join('\n');

    setGeneratedSql(fullSql);
  }, [activeTable, selectedColumns, aggregates, calcFields, joins, filters, groupBy, sortBy, limit, availableColumns]);

  const handleToggleColumn = (colName) => {
    setSelectedColumns(prev => 
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    );
  };

  const handleAddJoin = () => {
    const otherTables = tables.filter(t => t.name !== activeTable && !joins.some(j => j.joinTable === t.name));
    if (otherTables.length === 0) return;
    const targetTable = otherTables[0];
    setJoins(prev => [...prev, { 
      joinTable: targetTable.name, 
      joinType: 'INNER JOIN', 
      activeKey: columns[0]?.name ? `${activeTable}.${columns[0].name}` : '', 
      joinKey: targetTable.columns[0]?.name || '' 
    }]);
  };

  const handleRemoveJoin = (idx) => {
    setJoins(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateJoin = (idx, field, value) => {
    setJoins(prev => prev.map((j, i) => {
      if (i !== idx) return j;
      const updated = { ...j, [field]: value };
      
      // Auto-set join key if table changed
      if (field === 'joinTable') {
        const targetObj = tables.find(t => t.name === value);
        updated.joinKey = targetObj?.columns[0]?.name || '';
      }
      return updated;
    }));
  };

  const handleAddCalcField = () => {
    setCalcFields(prev => [...prev, { expression: '', alias: 'new_metric' }]);
  };

  const handleRemoveCalcField = (idx) => {
    setCalcFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateCalcField = (idx, field, value) => {
    setCalcFields(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const handleAddAggregate = () => {
    setAggregates(prev => [...prev, { column: availableColumns[0]?.name || '', function: 'SUM' }]);
  };

  const handleRemoveAggregate = (index) => {
    setAggregates(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateAggregate = (index, field, value) => {
    setAggregates(prev => prev.map((agg, i) => i === index ? { ...agg, [field]: value } : agg));
  };

  const handleAddFilter = () => {
    setFilters(prev => [...prev, { column: availableColumns[0]?.name || '', operator: '=', value: '', value2: '' }]);
  };

  const handleRemoveFilter = (index) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateFilter = (index, field, value) => {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const handleRunBuildQuery = () => {
    if (!generatedSql || isRunning) return;
    onRunQuery(generatedSql);
  };

  const renderFilterValueInput = (filter, idx) => {
    const colInfo = availableColumns.find(c => c.name === filter.column);
    const isBool = colInfo?.type.includes('BOOL');
    const isNum = colInfo?.type.includes('INT') || colInfo?.type.includes('DOUBLE') || colInfo?.type.includes('FLOAT') || colInfo?.type.includes('NUMERIC');
    const isDate = colInfo?.type.includes('DATE') || colInfo?.type.includes('TIME');

    if (['IS NULL', 'IS NOT NULL'].includes(filter.operator)) return null;

    if (isBool) {
      return (
        <select 
          className="form-select"
          value={filter.value}
          onChange={(e) => handleUpdateFilter(idx, 'value', e.target.value)}
          style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px', backgroundColor: 'hsl(var(--bg-main))', flex: 1.2 }}
        >
          <option value="true">TRUE</option>
          <option value="false">FALSE</option>
        </select>
      );
    }

    if (filter.operator === 'BETWEEN') {
      return (
        <div style={{ display: 'flex', gap: '4px', flex: 1.2 }}>
          <input 
            type={isNum ? "number" : isDate ? "date" : "text"} 
            className="form-select" 
            placeholder="min"
            value={filter.value}
            onChange={(e) => handleUpdateFilter(idx, 'value', e.target.value)}
            style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px', width: '60px', backgroundColor: 'hsl(var(--bg-main))' }}
          />
          <input 
            type={isNum ? "number" : isDate ? "date" : "text"} 
            className="form-select" 
            placeholder="max"
            value={filter.value2 || ''}
            onChange={(e) => handleUpdateFilter(idx, 'value2', e.target.value)}
            style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px', width: '60px', backgroundColor: 'hsl(var(--bg-main))' }}
          />
        </div>
      );
    }

    return (
      <input 
        type={isNum ? "number" : isDate ? "date" : "text"} 
        className="form-select" 
        placeholder={filter.operator === 'IN' ? "val1, val2..." : "value"}
        value={filter.value}
        onChange={(e) => handleUpdateFilter(idx, 'value', e.target.value)}
        style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px', flex: 1.2, backgroundColor: 'hsl(var(--bg-main))' }}
      />
    );
  };

  const otherTablesAvailable = tables.filter(t => t.name !== activeTable && !joins.some(j => j.joinTable === t.name)).length > 0;

  return (
    <div className="visual-builder-container">
      <div className="builder-grid">
        
        {/* Dimensions checkboxes */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit' }}>
            1. Fields / Columns
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', flex: 1 }}>
            {availableColumns.map(col => (
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
            <button 
              onClick={handleAddAggregate} 
              style={{ 
                padding: '2px 8px', 
                fontSize: '0.72rem', 
                height: '24px', 
                display: 'flex', 
                gap: '4px', 
                alignItems: 'center', 
                borderColor: 'hsla(var(--accent-secondary), 0.4)', 
                color: 'hsl(var(--accent-secondary))',
                backgroundColor: 'hsla(var(--accent-secondary), 0.08)',
                cursor: 'pointer',
                borderRadius: '4px',
                borderWidth: '1px',
                borderStyle: 'solid',
                transition: '0.15s ease-in-out'
              }} 
              id="btn-builder-add-metric"
            >
              <Plus size={12} />
              <span style={{ fontWeight: 600 }}>Add</span>
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
                    {availableColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>

                  <button className="table-action-btn" onClick={() => handleRemoveAggregate(idx)} style={{ color: 'hsl(var(--error))', padding: '4px' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Visual Joins */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>3. Visual Joins</span>
            <button 
              onClick={handleAddJoin} 
              disabled={!otherTablesAvailable}
              style={{ 
                padding: '2px 8px', 
                fontSize: '0.72rem', 
                height: '24px', 
                display: 'flex', 
                gap: '4px', 
                alignItems: 'center', 
                borderColor: otherTablesAvailable ? 'hsla(var(--accent-secondary), 0.4)' : 'hsl(var(--border))', 
                color: otherTablesAvailable ? 'hsl(var(--accent-secondary))' : 'hsl(var(--text-dark))',
                backgroundColor: otherTablesAvailable ? 'hsla(var(--accent-secondary), 0.08)' : 'transparent',
                cursor: otherTablesAvailable ? 'pointer' : 'not-allowed',
                borderRadius: '4px',
                borderWidth: '1px',
                borderStyle: 'solid',
                opacity: otherTablesAvailable ? 1 : 0.4,
                transition: '0.15s ease-in-out'
              }}
              id="btn-builder-add-join"
            >
              <Plus size={12} />
              <span style={{ fontWeight: 600 }}>Add</span>
            </button>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto', flex: 1 }}>
            {joins.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-dark))', textAlign: 'center', padding: '20px 0' }}>
                {otherTablesAvailable ? "No joins configured." : "Load more datasets to enable Joins."}
              </div>
            ) : (
              joins.map((join, idx) => {
                const targetObj = tables.find(t => t.name === join.joinTable);
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid hsl(var(--border))', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <select 
                        className="form-select" 
                        value={join.joinType}
                        onChange={(e) => handleUpdateJoin(idx, 'joinType', e.target.value)}
                        style={{ padding: '2px 4px', fontSize: '0.7rem', height: '24px', flex: 1 }}
                      >
                        <option value="INNER JOIN">INNER JOIN</option>
                        <option value="LEFT JOIN">LEFT JOIN</option>
                        <option value="RIGHT JOIN">RIGHT JOIN</option>
                        <option value="FULL JOIN">FULL JOIN</option>
                      </select>
                      
                      <select 
                        className="form-select" 
                        value={join.joinTable}
                        onChange={(e) => handleUpdateJoin(idx, 'joinTable', e.target.value)}
                        style={{ padding: '2px 4px', fontSize: '0.7rem', height: '24px', flex: 1 }}
                      >
                        {tables.filter(t => t.name !== activeTable && (!joins.some(j => j.joinTable === t.name) || j.joinTable === join.joinTable)).map(t => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      
                      <button className="table-action-btn" onClick={() => handleRemoveJoin(idx)} style={{ color: 'hsl(var(--error))', padding: '2px' }}>
                        <Trash2 size={10} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px', fontSize: '0.7rem' }}>
                      <select 
                        className="form-select" 
                        value={join.activeKey}
                        onChange={(e) => handleUpdateJoin(idx, 'activeKey', e.target.value)}
                        style={{ padding: '2px 4px', fontSize: '0.65rem', height: '22px', flex: 1 }}
                      >
                        {availableColumns.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <span>=</span>
                      <select 
                        className="form-select" 
                        value={join.joinKey}
                        onChange={(e) => handleUpdateJoin(idx, 'joinKey', e.target.value)}
                        style={{ padding: '2px 4px', fontSize: '0.65rem', height: '22px', flex: 1 }}
                      >
                        {targetObj?.columns.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Calculated Columns Setup */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>4. Calculated Fields</span>
            <button 
              onClick={handleAddCalcField} 
              style={{ 
                padding: '2px 8px', 
                fontSize: '0.72rem', 
                height: '24px', 
                display: 'flex', 
                gap: '4px', 
                alignItems: 'center', 
                borderColor: 'hsla(var(--accent-secondary), 0.4)', 
                color: 'hsl(var(--accent-secondary))',
                backgroundColor: 'hsla(var(--accent-secondary), 0.08)',
                cursor: 'pointer',
                borderRadius: '4px',
                borderWidth: '1px',
                borderStyle: 'solid',
                transition: '0.15s ease-in-out'
              }} 
              id="btn-builder-add-calc"
            >
              <Plus size={12} />
              <span style={{ fontWeight: 600 }}>Add</span>
            </button>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', flex: 1 }}>
            {calcFields.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-dark))', textAlign: 'center', padding: '20px 0' }}>
                No calculated fields.
              </div>
            ) : (
              calcFields.map((calc, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid hsl(var(--border))', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      className="form-select" 
                      placeholder="SQL Formula (e.g. price * 1.15)"
                      value={calc.expression}
                      onChange={(e) => handleUpdateCalcField(idx, 'expression', e.target.value)}
                      style={{ padding: '2px 4px', fontSize: '0.7rem', height: '24px', flex: 1.5, backgroundColor: 'hsl(var(--bg-main))' }}
                    />
                    <input 
                      type="text" 
                      className="form-select" 
                      placeholder="Alias"
                      value={calc.alias}
                      onChange={(e) => handleUpdateCalcField(idx, 'alias', e.target.value)}
                      style={{ padding: '2px 4px', fontSize: '0.7rem', height: '24px', flex: 1, backgroundColor: 'hsl(var(--bg-main))' }}
                    />
                    <button className="table-action-btn" onClick={() => handleRemoveCalcField(idx)} style={{ color: 'hsl(var(--error))', padding: '2px' }}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Filters Panel */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>5. Filters (WHERE)</span>
            <button 
              onClick={handleAddFilter} 
              style={{ 
                padding: '2px 8px', 
                fontSize: '0.72rem', 
                height: '24px', 
                display: 'flex', 
                gap: '4px', 
                alignItems: 'center', 
                borderColor: 'hsla(var(--accent-secondary), 0.4)', 
                color: 'hsl(var(--accent-secondary))',
                backgroundColor: 'hsla(var(--accent-secondary), 0.08)',
                cursor: 'pointer',
                borderRadius: '4px',
                borderWidth: '1px',
                borderStyle: 'solid',
                transition: '0.15s ease-in-out'
              }} 
              id="btn-builder-add-filter"
            >
              <Plus size={12} />
              <span style={{ fontWeight: 600 }}>Add</span>
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
                    {availableColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
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
                    <option value="IN">IN (list)</option>
                    <option value="BETWEEN">BETWEEN</option>
                    <option value="IS NULL">is null</option>
                    <option value="IS NOT NULL">is not null</option>
                  </select>

                  {renderFilterValueInput(filter, idx)}

                  <button className="table-action-btn" onClick={() => handleRemoveFilter(idx)} style={{ color: 'hsl(var(--error))', padding: '4px' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sort and Row limits */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit' }}>
            6. Sort & Row Limits
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
                {availableColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
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
