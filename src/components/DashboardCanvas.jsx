import React, { useState, useMemo, useRef, useEffect, memo } from 'react';
import { Rnd } from 'react-rnd';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Trash2, Code, Printer, LayoutGrid, Download, MoveLeft, MoveRight, HardDriveDownload, HardDriveUpload, Filter, RefreshCw, Maximize2, CornerDownLeft, CornerDownRight, CornerUpLeft, CornerUpRight, Sparkles } from 'lucide-react';
import { runQuery } from '../lib/duckdb';

const clientSideFilter = (rows, filter) => {
  if (!rows || !filter) return rows;
  return rows.filter(row => {
    const keys = Object.keys(row);
    const matchedKey = keys.find(k => 
      k.toLowerCase() === filter.column.toLowerCase() || 
      k.toLowerCase().endsWith('.' + filter.column.toLowerCase())
    );

    if (!matchedKey) return true; // Skip filtering if column is missing from this widget result

    const cellVal = String(row[matchedKey]).toLowerCase();
    const filterValStr = String(filter.value).toLowerCase();

    switch (filter.operator) {
      case '!=': return cellVal !== filterValStr;
      case '>': return Number(cellVal) > Number(filterValStr);
      case '<': return Number(cellVal) < Number(filterValStr);
      case 'LIKE': return cellVal.includes(filterValStr);
      case '=':
      default:
        return cellVal === filterValStr;
    }
  });
};

const buildFilteredSql = (originalSql, column, operator, value) => {
  if (!originalSql || !column) return originalSql;
  const strippedSql = originalSql.trim().replace(/;+$/, '');
  
  if (operator === 'LIKE') {
    const escapedValue = String(value).replace(/'/g, "''");
    return `SELECT * FROM (${strippedSql}) AS subq WHERE CAST(subq."${column}" AS VARCHAR) ILIKE '%${escapedValue}%';`;
  }
  
  const isNumeric = !isNaN(Number(value)) && value.trim() !== '';
  let sqlValue;
  if (isNumeric) {
    sqlValue = Number(value);
  } else {
    sqlValue = `'${String(value).replace(/'/g, "''")}'`;
  }
  
  return `SELECT * FROM (${strippedSql}) AS subq WHERE subq."${column}" ${operator} ${sqlValue};`;
};

const DashboardCanvas = memo(function DashboardCanvas({ 
  cards, 
  onRemoveCard, 
  onRenameCard,
  onReorderCards,
  tables = [],
  dbReady,
  onSaveWorkspace,
  onLoadWorkspace
}) {
  const [showSql, setShowSql] = useState({});
  const [colsLayout, setColsLayout] = useState(2); // 1, 2, or 3 columns
  const [floatingMode, setFloatingMode] = useState(false); // Toggle floating widget mode
  const [widgetPositions, setWidgetPositions] = useState({}); // Track floating positions

  // Global Dashboard Filter States
  const [filterCol, setFilterCol] = useState('');
  const [filterOp, setFilterOp] = useState('=');
  const [filterVal, setFilterVal] = useState('');
  const [distinctValues, setDistinctValues] = useState([]);
  const [activeGlobalFilter, setActiveGlobalFilter] = useState(null);
  const [filteredCardData, setFilteredCardData] = useState({});
  const [loadingFilters, setLoadingFilters] = useState(false);

  useEffect(() => {
    const applyFilterQueries = async () => {
      if (!activeGlobalFilter) {
        setFilteredCardData({});
        return;
      }

      setLoadingFilters(true);
      const newFilteredData = {};

      for (const card of cards) {
        if (!card.sql) {
          newFilteredData[card.id] = clientSideFilter(card.rows, activeGlobalFilter);
          continue;
        }

        const modifiedSql = buildFilteredSql(card.sql, activeGlobalFilter.column, activeGlobalFilter.operator, activeGlobalFilter.value);
        try {
          const res = await runQuery(modifiedSql);
          if (res.success) {
            newFilteredData[card.id] = res.rows;
          } else {
            console.warn(`Query failed for card ${card.id}:`, res.error, "Modified SQL:", modifiedSql);
            newFilteredData[card.id] = clientSideFilter(card.rows, activeGlobalFilter);
          }
        } catch (e) {
          console.warn(`Error running query for card ${card.id}:`, e);
          newFilteredData[card.id] = clientSideFilter(card.rows, activeGlobalFilter);
        }
      }

      setFilteredCardData(newFilteredData);
      setLoadingFilters(false);
    };

    applyFilterQueries();
  }, [activeGlobalFilter, cards]);

  const colors = [
    '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', 
    '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#f43f5e'
  ];

  const activeTable = tables.length > 0 ? tables[tables.length - 1] : null;

  // Dynamically load distinct values of selected column for the dropdown list
  useEffect(() => {
    const loadDistinct = async () => {
      if (!filterCol || !activeTable) {
        setDistinctValues([]);
        return;
      }

      // Query top 100 unique values
      const sql = `SELECT DISTINCT ${filterCol} FROM ${activeTable.name} WHERE ${filterCol} IS NOT NULL ORDER BY 1 LIMIT 100;`;
      try {
        const result = await runQuery(sql);
        if (result.success) {
          const vals = result.rows.map(r => r[filterCol]);
          setDistinctValues(vals);
          setFilterVal(vals[0] ? String(vals[0]) : '');
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadDistinct();
  }, [filterCol, activeTable]);

  // Set default filter column when activeTable changes
  useEffect(() => {
    if (activeTable && activeTable.columns.length > 0) {
      setFilterCol(activeTable.columns[0].name);
    } else {
      setFilterCol('');
    }
    setActiveGlobalFilter(null);
  }, [activeTable]);

  const toggleSql = (cardId) => {
    setShowSql(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const handlePrint = () => {
    window.print();
  };

  const downloadWidgetCSV = (card) => {
    if (!card.rows || card.rows.length === 0) return;
    
    const keys = Object.keys(card.rows[0]);
    const csvHeader = keys.join(',');
    const csvRows = card.rows.map(row => 
      keys.map(k => {
        let val = row[k];
        if (val === null || val === undefined) return '';
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      }).join(',')
    );

    const csvContent = "data:text/csv;charset=utf-8," + [csvHeader, ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `widget_export_${card.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMoveCard = (index, direction) => {
    if (!onReorderCards) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= cards.length) return;
    
    const updated = [...cards];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    
    onReorderCards(updated);
  };

  const applyGlobalFilter = () => {
    if (!filterCol || !filterVal) return;
    setActiveGlobalFilter({
      column: filterCol,
      operator: filterOp,
      value: filterVal
    });
  };

  const clearGlobalFilter = () => {
    setActiveGlobalFilter(null);
    setFilterVal('');
  };

  const handleChartClick = (columnName, value) => {
    if (!columnName || value === undefined || value === null) return;
    setFilterCol(columnName);
    setFilterOp('=');
    setFilterVal(String(value));
    setActiveGlobalFilter({
      column: columnName,
      operator: '=',
      value: String(value)
    });
  };

  // Pre-process and apply global filters to cards data rows
  const getFilteredCardRows = (card) => {
    if (!activeGlobalFilter) return card.rows;
    return filteredCardData[card.id] || clientSideFilter(card.rows, activeGlobalFilter);
  };

  const renderCardChart = (card) => {
    const { chartType, xAxis, yAxis, yAxis2, colorTheme, enableTrendline, stackMode } = card;
    const rows = getFilteredCardRows(card);

    const themeColors = {
      violet: { primary: '#8b5cf6' },
      cyan: { primary: '#06b6d4' },
      green: { primary: '#10b981' },
      rose: { primary: '#f43f5e' },
      amber: { primary: '#f59e0b' },
    };

    const activeColor = themeColors[colorTheme]?.primary || '#8b5cf6';

    const commonProps = {
      data: rows,
      margin: { top: 5, right: 10, left: -20, bottom: 5 },
    };

    if (!rows || rows.length === 0) return <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-dark))', textAlign: 'center', padding: '40px 0' }}>No matching filter records.</div>;

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps} onClick={(state) => { if (state && state.activeLabel) handleChartClick(xAxis, state.activeLabel); }} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <YAxis yAxisId="left" stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            {yAxis2 && <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--accent-secondary))" fontSize={9} tickLine={false} />}
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Line yAxisId="left" type="monotone" dataKey={yAxis} stroke={activeColor} strokeWidth={2} dot={{ r: 2 }} name={yAxis} />
            {yAxis2 && <Line yAxisId="right" type="monotone" dataKey={yAxis2} stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} name={yAxis2} />}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps} onClick={(state) => { if (state && state.activeLabel) handleChartClick(xAxis, state.activeLabel); }} style={{ cursor: 'pointer' }}>
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <YAxis stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Area type="monotone" dataKey={yAxis} stroke={activeColor} fill={activeColor} fillOpacity={0.15} stackId={stackMode ? "1" : undefined} />
          </AreaChart>
        );
      case 'pie':
        const pieData = rows.slice(0, 10);
        return (
          <PieChart style={{ cursor: 'pointer' }}>
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius={55}
              fill="#8b5cf6"
              dataKey={yAxis}
              nameKey={xAxis}
              onClick={(data) => {
                if (data) {
                  const val = data.name || data.payload?.[xAxis] || data.payload?.name;
                  if (val !== undefined) handleChartClick(xAxis, val);
                }
              }}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        );
      case 'bar':
      default:
        return (
          <BarChart {...commonProps} onClick={(state) => { if (state && state.activeLabel) handleChartClick(xAxis, state.activeLabel); }} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <YAxis yAxisId="left" stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            {yAxis2 && <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--accent-secondary))" fontSize={9} tickLine={false} />}
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Bar yAxisId="left" dataKey={yAxis} fill={activeColor} radius={stackMode ? undefined : [2, 2, 0, 0]} stackId={stackMode ? "1" : undefined} name={yAxis} />
            {yAxis2 && <Bar yAxisId="right" dataKey={yAxis2} fill="#06b6d4" radius={stackMode ? undefined : [2, 2, 0, 0]} stackId={stackMode ? "1" : undefined} name={yAxis2} />}
          </BarChart>
        );
    }
  };

  // Compute KPI Summary statistics
  const totalRecordFootprint = useMemo(() => {
    let count = 0;
    cards.forEach(c => {
      const rows = getFilteredCardRows(c);
      if (rows) count += rows.length;
    });
    return count;
  }, [cards, activeGlobalFilter, filteredCardData]);

  const fileUploaderRef = useRef(null);

  const handleWorkspaceUpload = (e) => {
    if (e.target.files && e.target.files[0] && onLoadWorkspace) {
      onLoadWorkspace(e.target.files[0]);
    }
  };

  if (cards.length === 0) {
    return (
      <div className="no-data-state">
        <LayoutGrid size={32} style={{ color: 'hsl(var(--text-dark))' }} />
        <h3>Empty Report Dashboard</h3>
        <p>Run queries, design visualizations in the chart workspace, and click "Pin to Dashboard" to build custom reports here.</p>
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
          <button className="btn-outline" onClick={() => fileUploaderRef.current.click()}>
            <HardDriveUpload size={14} />
            <span>Load Saved Workspace</span>
          </button>
          <input type="file" ref={fileUploaderRef} onChange={handleWorkspaceUpload} accept=".json" style={{ display: 'none' }} />
        </div>
      </div>
    );
  }

  const colClass = colsLayout === 1 ? 'grid-cols-1' : colsLayout === 3 ? 'grid-cols-3' : 'grid-cols-2';

  const setWidgetPosition = (cardId, position) => {
    setWidgetPositions(prev => ({
      ...prev,
      [cardId]: position
    }));
  };

  const handleAutoInsights = async () => {
    if (!activeTable || !dbReady) return;
    
    const columns = activeTable.columns;
    
    const isNumericType = (type) => {
      const t = type.toUpperCase();
      return t.includes('INT') || t.includes('DOUBLE') || t.includes('FLOAT') || t.includes('DECIMAL') || t.includes('NUMERIC') || t.includes('REAL');
    };
    
    const isDateType = (name, type) => {
      const n = name.toLowerCase();
      const t = type.toUpperCase();
      return t.includes('DATE') || t.includes('TIME') || t.includes('TIMESTAMP') || n.includes('date') || n.includes('year') || n.includes('month');
    };
    
    const isCategoricalType = (type) => {
      const t = type.toUpperCase();
      return t.includes('VARCHAR') || t.includes('TEXT') || t.includes('CHAR') || t.includes('STRING');
    };

    const numCols = columns.filter(c => isNumericType(c.type)).map(c => c.name);
    const dateCols = columns.filter(c => isDateType(c.name, c.type)).map(c => c.name);
    const catCols = columns.filter(c => isCategoricalType(c.type) && !isDateType(c.name, c.type)).map(c => c.name);
    
    const fallbackNum = numCols[0] || (columns[0] ? columns[0].name : '');
    const fallbackCat = catCols[0] || (columns[0] ? columns[0].name : '');
    const fallbackDate = dateCols[0] || '';

    const newCards = [];
    let idCounter = Date.now();

    try {
      // 1. Bar Chart: Top 10 values by Category
      if (fallbackCat && fallbackNum) {
        const sql = `SELECT "${fallbackCat}", SUM("${fallbackNum}") AS "total_${fallbackNum}" FROM "${activeTable.name}" GROUP BY 1 ORDER BY 2 DESC LIMIT 10;`;
        const res = await runQuery(sql);
        if (res.success && res.rows.length > 0) {
          newCards.push({
            id: idCounter++,
            title: `Top ${fallbackCat} by Total ${fallbackNum}`,
            chartType: 'bar',
            xAxis: fallbackCat,
            yAxis: `total_${fallbackNum}`,
            colorTheme: 'violet',
            rows: res.rows,
            sql
          });
        }
      }

      // 2. Pie Chart: Record Count Distribution
      if (fallbackCat) {
        const sql = `SELECT "${fallbackCat}", COUNT(*) AS "record_count" FROM "${activeTable.name}" GROUP BY 1 ORDER BY 2 DESC LIMIT 6;`;
        const res = await runQuery(sql);
        if (res.success && res.rows.length > 0) {
          newCards.push({
            id: idCounter++,
            title: `Record Distribution by ${fallbackCat}`,
            chartType: 'pie',
            xAxis: fallbackCat,
            yAxis: 'record_count',
            colorTheme: 'cyan',
            rows: res.rows,
            sql
          });
        }
      }

      // 3. Line Chart: Trend Over Time
      if (fallbackDate && fallbackNum) {
        const sql = `SELECT "${fallbackDate}", SUM("${fallbackNum}") AS "daily_${fallbackNum}" FROM "${activeTable.name}" GROUP BY 1 ORDER BY 1 LIMIT 50;`;
        const res = await runQuery(sql);
        if (res.success && res.rows.length > 0) {
          newCards.push({
            id: idCounter++,
            title: `${fallbackNum} Trend Over Time`,
            chartType: 'line',
            xAxis: fallbackDate,
            yAxis: `daily_${fallbackNum}`,
            colorTheme: 'green',
            rows: res.rows,
            sql
          });
        }
      }

      // 4. Area Chart: Frequency Distribution
      if (fallbackNum) {
        const sql = `SELECT "${fallbackNum}", COUNT(*) AS "frequency" FROM "${activeTable.name}" GROUP BY 1 ORDER BY 1 LIMIT 30;`;
        const res = await runQuery(sql);
        if (res.success && res.rows.length > 0) {
          newCards.push({
            id: idCounter++,
            title: `Frequency Distribution of ${fallbackNum}`,
            chartType: 'area',
            xAxis: fallbackNum,
            yAxis: 'frequency',
            colorTheme: 'amber',
            rows: res.rows,
            sql
          });
        }
      }

      if (newCards.length > 0) {
        onReorderCards([...cards, ...newCards]);
      } else {
        alert("Could not generate recommendations from this table's schema.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const cornerPositions = {
    'top-left': { x: 20, y: 120 },
    'top-right': { x: window.innerWidth - 420, y: 120 },
    'bottom-left': { x: 20, y: window.innerHeight - 420 },
    'bottom-right': { x: window.innerWidth - 420, y: window.innerHeight - 420 }
  };

  return (
    <div className="dashboard-canvas-container">
      {/* Top dashboard control bar */}
      <div className="dashboard-canvas-header no-print">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.05rem', fontFamily: 'Outfit' }}>Analytics Report Canvas</h3>
          <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>{cards.length} widgets pinned</span>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {activeTable && (
            <button 
              className="btn-outline" 
              onClick={handleAutoInsights}
              title="Automatically generate recommendations based on table schema"
              style={{ padding: '6px 12px', borderColor: 'hsla(var(--accent-secondary), 0.4)', color: 'hsl(var(--accent-secondary))', backgroundColor: 'hsla(var(--accent-secondary), 0.05)' }}
            >
              <Sparkles size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              <span>Smart Insights</span>
            </button>
          )}
          {!floatingMode && (
            <div style={{ display: 'flex', border: '1px solid hsl(var(--border))', borderRadius: '6px', overflow: 'hidden' }}>
              <button className={`btn-outline ${colsLayout === 1 ? 'active' : ''}`} style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setColsLayout(1)}>1 Col</button>
              <button className={`btn-outline ${colsLayout === 2 ? 'active' : ''}`} style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setColsLayout(2)}>2 Col</button>
              <button className={`btn-outline ${colsLayout === 3 ? 'active' : ''}`} style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setColsLayout(3)}>3 Col</button>
            </div>
          )}
          
          <button 
            className={`btn-outline ${floatingMode ? 'active' : ''}`}
            onClick={() => setFloatingMode(!floatingMode)}
            title="Toggle floating widget mode (like LeetCode)"
            style={{ padding: '6px 12px' }}
          >
            <Maximize2 size={14} />
            <span>{floatingMode ? 'Grid Mode' : 'Floating Mode'}</span>
          </button>

          <button className="btn-outline" onClick={onSaveWorkspace} title="Download whole workspace JSON file">
            <HardDriveDownload size={14} />
            <span>Save Workspace</span>
          </button>

          <button className="btn-outline" onClick={() => fileUploaderRef.current.click()} title="Upload workspace JSON file">
            <HardDriveUpload size={14} />
            <span>Load Workspace</span>
          </button>
          <input type="file" ref={fileUploaderRef} onChange={handleWorkspaceUpload} accept=".json" style={{ display: 'none' }} />

          <button className="btn-run" onClick={handlePrint} id="btn-print-report" style={{ height: '32px' }}>
            <Printer size={14} />
            <span>Print / Export PDF</span>
          </button>
        </div>
      </div>

      {/* Global Interactive Filter bar */}
      {activeTable && (
        <div className="glass-panel no-print" style={{ padding: '12px 18px', display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
            {loadingFilters ? (
              <RefreshCw size={14} className="animate-spin" style={{ color: 'hsl(var(--accent-secondary))' }} />
            ) : (
              <Filter size={14} style={{ color: 'hsl(var(--accent-secondary))' }} />
            )}
            <span style={{ fontWeight: 600 }}>Global Filter:</span>
          </div>

          <select 
            className="form-select" 
            value={filterCol} 
            onChange={(e) => setFilterCol(e.target.value)}
            style={{ padding: '3px 8px', fontSize: '0.75rem', height: '26px' }}
          >
            {activeTable.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>

          <select 
            className="form-select" 
            value={filterOp} 
            onChange={(e) => setFilterOp(e.target.value)}
            style={{ padding: '3px 8px', fontSize: '0.75rem', height: '26px', width: '50px' }}
          >
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value="LIKE">contains</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>

          {distinctValues.length > 0 ? (
            <select 
              className="form-select" 
              value={filterVal} 
              onChange={(e) => setFilterVal(e.target.value)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', height: '26px', minWidth: '120px' }}
            >
              {distinctValues.map(v => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
            </select>
          ) : (
            <input 
              type="text" 
              placeholder="filter value" 
              className="form-select" 
              value={filterVal}
              onChange={(e) => setFilterVal(e.target.value)}
              style={{ padding: '3px 8px', fontSize: '0.75rem', height: '26px', width: '120px', backgroundColor: 'hsl(var(--bg-main))' }}
            />
          )}

          <button className="btn-run" onClick={applyGlobalFilter} style={{ height: '26px', padding: '0 10px', fontSize: '0.75rem', boxShadow: 'none' }}>
            Apply Filter
          </button>

          {activeGlobalFilter && (
            <button className="btn-outline" onClick={clearGlobalFilter} style={{ height: '26px', padding: '0 8px', fontSize: '0.75rem', color: 'hsl(var(--error))', borderColor: 'hsla(var(--error), 0.2)' }}>
              Clear ({activeGlobalFilter.column} = {activeGlobalFilter.value})
            </button>
          )}
        </div>
      )}

      {/* Top level KPI indicators */}
      <div className="kpi-container no-print">
        <div className="kpi-card">
          <span className="kpi-title">Widgets Pinned</span>
          <span className="kpi-value">{cards.length}</span>
          <span className="kpi-subtitle">Active visual panels</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">Active Datasets</span>
          <span className="kpi-value">{tables.length}</span>
          <span className="kpi-subtitle">DuckDB tables in memory</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">Records Pinned</span>
          <span className="kpi-value">{totalRecordFootprint.toLocaleString()}</span>
          <span className="kpi-subtitle">{activeGlobalFilter ? "Filtered records" : "Total data points"}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">Database Engine</span>
          <span className="kpi-value" style={{ fontSize: '1.2rem', paddingTop: '6px', color: 'hsl(var(--accent-secondary))' }}>Wasm-Client</span>
          <span className="kpi-subtitle">Serverless Sandbox</span>
        </div>
      </div>

      {/* Dashboard Print Header (visible in PDF print mode only) */}
      <div className="print-only-header">
        <h1>ZeroCloud BI Analytics Report</h1>
        <p>Generated Locally | Date: {new Date().toLocaleDateString()} | Offline Wasm Client Sandbox</p>
      </div>

      {/* Grid Canvas or Floating Canvas */}
      {floatingMode ? (
        <div className="floating-canvas-container">
          {cards.map((card, idx) => {
            const isSqlVisible = !!showSql[card.id];
            const pos = widgetPositions[card.id] || cornerPositions['top-left'];
            
            return (
              <Rnd
                key={card.id}
                default={{
                  x: pos.x,
                  y: pos.y,
                  width: 400,
                  height: 'auto'
                }}
                onDragStop={(e, d) => setWidgetPosition(card.id, { x: d.x, y: d.y })}
                minWidth={300}
                minHeight={250}
                className="floating-widget-wrapper"
              >
                <div className="floating-widget glass-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', cursor: 'move' }}>
                    <input 
                      type="text" 
                      value={card.title}
                      onChange={(e) => onRenameCard(card.id, e.target.value)}
                      className="dashboard-card-title-input"
                      placeholder="Untitled Visualization"
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }} className="no-print">
                      <div style={{ display: 'flex', gap: '2px' }} title="Move to corner">
                        <button 
                          className="corner-btn"
                          onClick={() => setWidgetPosition(card.id, cornerPositions['top-left'])}
                          title="Top-left"
                        >
                          <CornerUpLeft size={10} />
                        </button>
                        <button 
                          className="corner-btn"
                          onClick={() => setWidgetPosition(card.id, cornerPositions['top-right'])}
                          title="Top-right"
                        >
                          <CornerUpRight size={10} />
                        </button>
                        <button 
                          className="corner-btn"
                          onClick={() => setWidgetPosition(card.id, cornerPositions['bottom-left'])}
                          title="Bottom-left"
                        >
                          <CornerDownLeft size={10} />
                        </button>
                        <button 
                          className="corner-btn"
                          onClick={() => setWidgetPosition(card.id, cornerPositions['bottom-right'])}
                          title="Bottom-right"
                        >
                          <CornerDownRight size={10} />
                        </button>
                      </div>

                      <button className="table-action-btn" title="Download Widget Data" onClick={() => downloadWidgetCSV(card)}>
                        <Download size={12} />
                      </button>
                      <button className="table-action-btn" title="View Source SQL" onClick={() => toggleSql(card.id)}>
                        <Code size={12} />
                      </button>
                      <button className="table-action-btn" title="Remove from Dashboard" onClick={() => onRemoveCard(card.id)} style={{ color: 'hsl(var(--error))' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Chart container */}
                  <div style={{ width: '100%', height: '180px', marginTop: '6px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {renderCardChart(card)}
                    </ResponsiveContainer>
                  </div>

                  {/* Collapsible SQL Pre block */}
                  {isSqlVisible && (
                    <pre className="no-print" style={{
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      color: 'hsl(var(--text-muted))',
                      overflowX: 'auto',
                      border: '1px solid hsl(var(--border))',
                      marginTop: '8px',
                      whiteSpace: 'pre-wrap'
                    }}>{card.sql}</pre>
                  )}
                </div>
              </Rnd>
            );
          })}
        </div>
      ) : (
        <div className={`dashboard-grid-canvas ${colClass}`}>
          {cards.map((card, idx) => {
            const isSqlVisible = !!showSql[card.id];
            return (
              <div key={card.id} className="dashboard-card glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="text" 
                  value={card.title}
                  onChange={(e) => onRenameCard(card.id, e.target.value)}
                  className="dashboard-card-title-input"
                  placeholder="Untitled Visualization"
                />
                
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} className="no-print">
                  <button className="table-action-btn" title="Move Left / Up" onClick={() => handleMoveCard(idx, -1)} disabled={idx === 0} style={{ opacity: idx === 0 ? 0.3 : 1 }}>
                    <MoveLeft size={10} />
                  </button>
                  <button className="table-action-btn" title="Move Right / Down" onClick={() => handleMoveCard(idx, 1)} disabled={idx === cards.length - 1} style={{ opacity: idx === cards.length - 1 ? 0.3 : 1 }}>
                    <MoveRight size={10} />
                  </button>

                  <button className="table-action-btn" title="Download Widget Data" onClick={() => downloadWidgetCSV(card)}>
                    <Download size={12} />
                  </button>
                  <button className="table-action-btn" title="View Source SQL" onClick={() => toggleSql(card.id)}>
                    <Code size={12} />
                  </button>
                  <button className="table-action-btn" title="Remove from Dashboard" onClick={() => onRemoveCard(card.id)} style={{ color: 'hsl(var(--error))' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Chart container */}
              <div style={{ width: '100%', height: '180px', marginTop: '6px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  {renderCardChart(card)}
                </ResponsiveContainer>
              </div>

              {/* Collapsible SQL Pre block */}
              {isSqlVisible && (
                <pre className="no-print" style={{
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  color: 'hsl(var(--text-muted))',
                  overflowX: 'auto',
                  border: '1px solid hsl(var(--border))',
                  marginTop: '8px',
                  whiteSpace: 'pre-wrap'
                }}>{card.sql}</pre>
              )}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
});

export default DashboardCanvas;
