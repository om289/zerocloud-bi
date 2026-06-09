import React, { useState, memo } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Trash2, Code, Printer, LayoutGrid, Download, MoveLeft, MoveRight, HardDriveDownload, HardDriveUpload } from 'lucide-react';

const DashboardCanvas = memo(function DashboardCanvas({ 
  cards, 
  onRemoveCard, 
  onRenameCard,
  onReorderCards, // callback to shift card indexes
  tables = [],
  dbReady,
  onSaveWorkspace,
  onLoadWorkspace
}) {
  const [showSql, setShowSql] = useState({});
  const [colsLayout, setColsLayout] = useState(2); // 1, 2, or 3 columns

  const colors = [
    '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', 
    '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#f43f5e'
  ];

  const toggleSql = (cardId) => {
    setShowSql(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const handlePrint = () => {
    window.print();
  };

  const downloadWidgetCSV = (card) => {
    if (!card.rows || card.rows.length === 0) return;
    
    // Generate CSV contents
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

  const renderCardChart = (card) => {
    const { chartType, xAxis, yAxis, yAxis2, colorTheme, rows, enableTrendline, stackMode } = card;
    
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

    if (!rows || rows.length === 0) return <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-dark))' }}>No data points available.</div>;

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
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
          <AreaChart {...commonProps}>
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <YAxis stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Area type="monotone" dataKey={yAxis} stroke={activeColor} fill={activeColor} fillOpacity={0.15} stackId={stackMode ? "1" : undefined} />
          </AreaChart>
        );
      case 'pie':
        const pieData = rows.slice(0, 10);
        return (
          <PieChart>
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius={55}
              fill="#8b5cf6"
              dataKey={yAxis}
              nameKey={xAxis}
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
          <BarChart {...commonProps}>
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
      if (c.rows) count += c.rows.length;
    });
    return count;
  }, [cards]);

  const fileUploaderRef = React.useRef(null);

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

  // Determine grid column class
  const colClass = colsLayout === 1 ? 'grid-cols-1' : colsLayout === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="dashboard-canvas-container">
      {/* Top dashboard control bar */}
      <div className="dashboard-canvas-header no-print">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.05rem', fontFamily: 'Outfit' }}>Analytics Report Canvas</h3>
          <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>{cards.length} widgets pinned</span>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Layout control buttons */}
          <div style={{ display: 'flex', border: '1px solid hsl(var(--border))', borderRadius: '6px', overflow: 'hidden' }}>
            <button className={`btn-outline ${colsLayout === 1 ? 'active' : ''}`} style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setColsLayout(1)}>1 Col</button>
            <button className={`btn-outline ${colsLayout === 2 ? 'active' : ''}`} style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setColsLayout(2)}>2 Col</button>
            <button className={`btn-outline ${colsLayout === 3 ? 'active' : ''}`} style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setColsLayout(3)}>3 Col</button>
          </div>

          {/* Workspace persist buttons */}
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
          <span className="kpi-subtitle">Represented data points</span>
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

      {/* Grid Canvas */}
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
                  {/* Widget reorder controls */}
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
    </div>
  );
});

export default DashboardCanvas;
