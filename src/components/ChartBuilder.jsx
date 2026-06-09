import React, { useState, useEffect, useMemo, memo } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { BarChart2, TrendingUp, PieChart as PieIcon, AreaChart as AreaIcon, HelpCircle } from 'lucide-react';

const ChartBuilder = memo(function ChartBuilder({ result, onPinCard }) {
  const [chartType, setChartType] = useState('bar'); // bar, line, area, pie
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');
  const [colorTheme, setColorTheme] = useState('violet'); // violet, cyan, green

  const themeColors = {
    violet: { primary: '#8b5cf6', secondary: '#a78bfa', accent: '#7c3aed' },
    cyan: { primary: '#06b6d4', secondary: '#67e8f9', accent: '#0891b2' },
    green: { primary: '#10b981', secondary: '#6ee7b7', accent: '#059669' },
  };

  const colors = [
    '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', 
    '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#f43f5e'
  ];

  const columns = result?.columns || [];
  const rows = result?.rows || [];

  // Automatically select default X and Y columns when query results change
  useEffect(() => {
    if (columns.length > 0) {
      setXAxis(columns[0]);
      
      // Attempt to find a numeric column to guess Y-Axis
      const numericCol = columns.find((col, index) => {
        if (index === 0) return false;
        const testVal = rows[0]?.[col];
        return typeof testVal === 'number';
      });
      setYAxis(numericCol || columns[Math.min(1, columns.length - 1)]);
    } else {
      setXAxis('');
      setYAxis('');
    }
  }, [result]);

  if (!result || !result.success) {
    return (
      <div className="no-data-state">
        <HelpCircle size={24} />
        <h3>No Query Data</h3>
        <p>Run a successful query to enable interactive visualizations.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="no-data-state">
        <h3>No Rows Available</h3>
        <p>Query returned 0 rows. Charts require matching data points.</p>
      </div>
    );
  }

  // Pre-process chart data ensuring Y-axis values are parsed as numbers (memoized)
  const chartData = useMemo(() => {
    return rows.map(row => {
      const d = { ...row };
      if (yAxis && d[yAxis] !== undefined) {
        const val = Number(d[yAxis]);
        d[yAxis] = isNaN(val) ? 0 : val;
      }
      return d;
    });
  }, [rows, yAxis]);

  const activeTheme = themeColors[colorTheme];

  const renderChart = () => {
    if (!xAxis || !yAxis) return null;

    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 30, left: 10, bottom: 20 },
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsla(224, 15%, 18%, 0.5)" />
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            <YAxis stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
              labelStyle={{ fontWeight: 600, color: 'hsl(var(--text-main))' }}
            />
            <Legend verticalAlign="top" height={36} />
            <Line type="monotone" dataKey={yAxis} stroke={activeTheme.primary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={activeTheme.primary} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={activeTheme.primary} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsla(224, 15%, 18%, 0.5)" />
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            <YAxis stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
              labelStyle={{ fontWeight: 600, color: 'hsl(var(--text-main))' }}
            />
            <Legend verticalAlign="top" height={36} />
            <Area type="monotone" dataKey={yAxis} stroke={activeTheme.primary} strokeWidth={2} fillOpacity={1} fill="url(#colorArea)" />
          </AreaChart>
        );
      case 'pie':
        const pieData = chartData.slice(0, 15);
        return (
          <PieChart>
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
              labelStyle={{ fontWeight: 600, color: 'hsl(var(--text-main))' }}
            />
            <Legend verticalAlign="top" height={36} />
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              outerRadius={90}
              fill="#8884d8"
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
            <CartesianGrid strokeDasharray="3 3" stroke="hsla(224, 15%, 18%, 0.5)" />
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            <YAxis stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
              labelStyle={{ fontWeight: 600, color: 'hsl(var(--text-main))' }}
            />
            <Legend verticalAlign="top" height={36} />
            <Bar dataKey={yAxis} fill={activeTheme.primary} radius={[4, 4, 0, 0]} maxBarSize={60} />
          </BarChart>
        );
    }
  };

  return (
    <div className="chart-builder-workspace">
      <div className="chart-config-panel">
        <h4 style={{ fontSize: '0.85rem', marginBottom: '4px' }}>Chart Options</h4>
        
        <div className="form-group">
          <label>X-Axis (Label)</label>
          <select 
            className="form-select" 
            value={xAxis} 
            onChange={(e) => setXAxis(e.target.value)}
            id="select-xaxis"
          >
            {columns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Y-Axis (Value)</label>
          <select 
            className="form-select" 
            value={yAxis} 
            onChange={(e) => setYAxis(e.target.value)}
            id="select-yaxis"
          >
            {columns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Color Theme</label>
          <select 
            className="form-select" 
            value={colorTheme} 
            onChange={(e) => setColorTheme(e.target.value)}
            id="select-color-theme"
          >
            <option value="violet">Violet Theme</option>
            <option value="cyan">Cyan Theme</option>
            <option value="green">Green Theme</option>
          </select>
        </div>

        <div className="form-group" style={{ marginTop: '12px' }}>
          <label>Chart Style</label>
          <div className="chart-type-selector">
            <button 
              className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
              onClick={() => setChartType('bar')}
              id="btn-chart-bar"
            >
              <BarChart2 size={14} />
              <span>Bar</span>
            </button>
            <button 
              className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
              onClick={() => setChartType('line')}
              id="btn-chart-line"
            >
              <TrendingUp size={14} />
              <span>Line</span>
            </button>
            <button 
              className={`chart-type-btn ${chartType === 'area' ? 'active' : ''}`}
              onClick={() => setChartType('area')}
              id="btn-chart-area"
            >
              <AreaIcon size={14} />
              <span>Area</span>
            </button>
            <button 
              className={`chart-type-btn ${chartType === 'pie' ? 'active' : ''}`}
              onClick={() => setChartType('pie')}
              id="btn-chart-pie"
            >
              <PieIcon size={14} />
              <span>Pie</span>
            </button>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '18px' }}>
          <button 
            className="btn-run" 
            style={{ width: '100%', justifyContent: 'center', height: '34px', background: 'linear-gradient(135deg, hsl(var(--accent-secondary)), #0891b2)', boxShadow: 'none' }}
            onClick={() => {
              if (onPinCard && xAxis && yAxis) {
                onPinCard({
                  chartType,
                  xAxis,
                  yAxis,
                  colorTheme,
                  title: `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} of ${yAxis} by ${xAxis}`
                });
              }
            }}
            id="btn-pin-to-dashboard"
          >
            <span>Pin to Dashboard</span>
          </button>
        </div>
      </div>

      <div className="chart-display-panel">
        <div style={{ width: '100%', height: '100%', minHeight: '300px' }}>
          <ResponsiveContainer width="100%" height="90%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

export default ChartBuilder;
