import React, { useState, memo } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Trash2, Code, Printer, LayoutGrid } from 'lucide-react';

const DashboardCanvas = memo(function DashboardCanvas({ cards, onRemoveCard, onRenameCard }) {
  const [showSql, setShowSql] = useState({});

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

  const renderCardChart = (card) => {
    const { chartType, xAxis, yAxis, colorTheme, rows } = card;
    
    const themeColors = {
      violet: { primary: '#8b5cf6' },
      cyan: { primary: '#06b6d4' },
      green: { primary: '#10b981' },
    };

    const activeColor = themeColors[colorTheme]?.primary || '#8b5cf6';

    const commonProps = {
      data: rows,
      margin: { top: 5, right: 10, left: -20, bottom: 5 },
    };

    if (rows.length === 0) return <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-dark))' }}>No data points available.</div>;

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <YAxis stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Line type="monotone" dataKey={yAxis} stroke={activeColor} strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <YAxis stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Area type="monotone" dataKey={yAxis} stroke={activeColor} fill={activeColor} fillOpacity={0.15} />
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
            <YAxis stroke="hsl(var(--text-dark))" fontSize={9} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey={yAxis} fill={activeColor} radius={[2, 2, 0, 0]} />
          </BarChart>
        );
    }
  };

  if (cards.length === 0) {
    return (
      <div className="no-data-state">
        <LayoutGrid size={32} style={{ color: 'hsl(var(--text-dark))' }} />
        <h3>Empty Report Dashboard</h3>
        <p>Run query statements, design visualizations in the chart workspace, and click "Pin to Dashboard" to build custom reports here.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-canvas-container">
      {/* Top dashboard control bar */}
      <div className="dashboard-canvas-header no-print">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.05rem', fontFamily: 'Outfit' }}>Analytics Report Canvas</h3>
          <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>{cards.length} widgets pinned</span>
        </div>
        
        <button className="btn-run" onClick={handlePrint} id="btn-print-report" style={{ height: '32px' }}>
          <Printer size={14} />
          <span>Print / Export PDF</span>
        </button>
      </div>

      {/* Dashboard Print Header (visible in PDF print mode only) */}
      <div className="print-only-header">
        <h1>ZeroCloud BI Analytics Report</h1>
        <p>Generated Locally | Date: {new Date().toLocaleDateString()} | Offline Wasm Client Sandbox</p>
      </div>

      {/* Grid Canvas */}
      <div className="dashboard-grid-canvas">
        {cards.map(card => {
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
