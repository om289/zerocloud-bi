import React, { useState, useEffect, useMemo, memo } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { BarChart2, TrendingUp, PieChart as PieIcon, AreaChart as AreaIcon, HelpCircle } from 'lucide-react';

const ChartBuilder = memo(function ChartBuilder({ result, onPinCard }) {
  const [chartType, setChartType] = useState('bar');
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');
  const [yAxis2, setYAxis2] = useState(''); // Secondary Y axis
  const [enableDualAxis, setEnableDualAxis] = useState(false);
  const [enableTrendline, setEnableTrendline] = useState(false);
  const [stackMode, setStackMode] = useState(false);
  const [colorTheme, setColorTheme] = useState('violet');

  const themeColors = {
    violet: { primary: '#8b5cf6', secondary: '#a78bfa', accent: '#7c3aed' },
    cyan: { primary: '#06b6d4', secondary: '#67e8f9', accent: '#0891b2' },
    green: { primary: '#10b981', secondary: '#6ee7b7', accent: '#059669' },
    rose: { primary: '#f43f5e', secondary: '#fda4af', accent: '#e11d48' },
    amber: { primary: '#f59e0b', secondary: '#fcd34d', accent: '#d97706' },
  };

  const colors = [
    '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', 
    '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#f43f5e'
  ];

  const columns = result?.columns || [];
  const rows = result?.rows || [];

  // Auto-guess columns on load
  useEffect(() => {
    if (columns.length > 0) {
      setXAxis(columns[0]);
      
      // Attempt to find a numeric column to guess Y-Axis
      const numericCol = columns.find((col, index) => {
        if (index === 0) return false;
        const testVal = rows[0]?.[col];
        return typeof testVal === 'number';
      });
      
      const primaryY = numericCol || columns[Math.min(1, columns.length - 1)];
      setYAxis(primaryY);

      // Guess secondary Y axis
      const secondaryY = columns.find(col => col !== columns[0] && col !== primaryY && typeof rows[0]?.[col] === 'number');
      setYAxis2(secondaryY || '');
    } else {
      setXAxis('');
      setYAxis('');
      setYAxis2('');
    }
  }, [result]);

  const activeTheme = themeColors[colorTheme] || themeColors.violet;

  // Calculate Linear Regression Trendline client-side (memoized)
  const regressionStats = useMemo(() => {
    if (!enableTrendline || !xAxis || !yAxis || rows.length < 2) return null;

    const n = rows.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    const parsedData = rows.map((row, idx) => {
      // If X axis is not a number, map it to indices for regression calculations
      const xVal = typeof row[xAxis] === 'number' ? row[xAxis] : idx;
      const yVal = Number(row[yAxis]) || 0;
      return { x: xVal, y: yVal };
    });

    parsedData.forEach(d => {
      sumX += d.x;
      sumY += d.y;
      sumXY += d.x * d.y;
      sumXX += d.x * d.x;
    });

    const meanX = sumX / n;
    const meanY = sumY / n;

    // Calculate Slope (m) and Intercept (c)
    const numerator = sumXY - (n * meanX * meanY);
    const denominator = sumXX - (n * meanX * meanX);
    
    if (denominator === 0) return null;
    
    const slope = numerator / denominator;
    const intercept = meanY - (slope * meanX);

    // Compute R-squared coefficient
    let totalVar = 0;
    let residVar = 0;
    parsedData.forEach(d => {
      const predY = (slope * d.x) + intercept;
      totalVar += Math.pow(d.y - meanY, 2);
      residVar += Math.pow(d.y - predY, 2);
    });

    const rSquared = totalVar === 0 ? 0 : 1 - (residVar / totalVar);

    return {
      slope,
      intercept,
      rSquared,
      equation: `y = ${slope.toFixed(2)}x + ${intercept.toFixed(1)}`,
      r2String: `R² = ${rSquared.toFixed(3)}`
    };
  }, [rows, xAxis, yAxis, enableTrendline]);

  // Pre-process chart data ensuring Y-axis values are parsed as numbers, adding trendline columns
  const chartData = useMemo(() => {
    return rows.map((row, idx) => {
      const d = { ...row };
      if (yAxis && d[yAxis] !== undefined) {
        const val = Number(d[yAxis]);
        d[yAxis] = isNaN(val) ? 0 : val;
      }
      if (yAxis2 && d[yAxis2] !== undefined) {
        const val = Number(d[yAxis2]);
        d[yAxis2] = isNaN(val) ? 0 : val;
      }

      // Append trendline value
      if (regressionStats) {
        const xVal = typeof row[xAxis] === 'number' ? row[xAxis] : idx;
        d.trendline = Number(((regressionStats.slope * xVal) + regressionStats.intercept).toFixed(2));
      }
      
      return d;
    });
  }, [rows, xAxis, yAxis, yAxis2, regressionStats]);

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

  const renderChart = () => {
    if (!xAxis || !yAxis) return null;

    const commonProps = {
      data: chartData,
      margin: { top: 15, right: 30, left: 10, bottom: 20 },
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsla(224, 15%, 18%, 0.5)" />
            <XAxis dataKey={xAxis} stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            <YAxis yAxisId="left" stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            {enableDualAxis && yAxis2 && <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--accent-secondary))" fontSize={11} tickLine={false} />}
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
              labelStyle={{ fontWeight: 600, color: 'hsl(var(--text-main))' }}
            />
            <Legend verticalAlign="top" height={36} />
            <Line yAxisId="left" type="monotone" dataKey={yAxis} stroke={activeTheme.primary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name={yAxis} />
            {enableDualAxis && yAxis2 && <Line yAxisId="right" type="monotone" dataKey={yAxis2} stroke="#06b6d4" strokeWidth={2} dot={{ r: 4 }} name={yAxis2} />}
            {enableTrendline && <Line yAxisId="left" type="monotone" dataKey="trendline" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} name="Trendline" />}
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
            <Area type="monotone" dataKey={yAxis} stroke={activeTheme.primary} strokeWidth={2} fillOpacity={1} fill="url(#colorArea)" stackId={stackMode ? "1" : undefined} />
            {enableTrendline && <Line type="monotone" dataKey="trendline" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} name="Trendline" />}
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
            <YAxis yAxisId="left" stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
            {enableDualAxis && yAxis2 && <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--accent-secondary))" fontSize={11} tickLine={false} />}
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
              labelStyle={{ fontWeight: 600, color: 'hsl(var(--text-main))' }}
            />
            <Legend verticalAlign="top" height={36} />
            <Bar yAxisId="left" dataKey={yAxis} fill={activeTheme.primary} radius={stackMode ? undefined : [4, 4, 0, 0]} maxBarSize={60} stackId={stackMode ? "1" : undefined} name={yAxis} />
            {enableDualAxis && yAxis2 && <Bar yAxisId="right" dataKey={yAxis2} fill="#06b6d4" radius={stackMode ? undefined : [4, 4, 0, 0]} maxBarSize={60} stackId={stackMode ? "1" : undefined} name={yAxis2} />}
            {enableTrendline && <Line yAxisId="left" type="monotone" dataKey="trendline" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} name="Trendline" />}
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

        {/* Dual Axis Toggle */}
        {['bar', 'line'].includes(chartType) && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox"
                checked={enableDualAxis}
                onChange={(e) => setEnableDualAxis(e.target.checked)}
                style={{ accentColor: 'hsl(var(--accent))' }}
              />
              <span>Dual Y-Axis</span>
            </label>
            {enableDualAxis && (
              <select
                className="form-select"
                value={yAxis2}
                onChange={(e) => setYAxis2(e.target.value)}
                style={{ marginTop: '4px' }}
              >
                <option value="">-- Select Axis 2 --</option>
                {columns.filter(c => c !== xAxis).map(col => <option key={col} value={col}>{col}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Trendline Toggle */}
        {['bar', 'line', 'area'].includes(chartType) && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox"
                checked={enableTrendline}
                onChange={(e) => setEnableTrendline(e.target.checked)}
                style={{ accentColor: 'hsl(var(--accent))' }}
              />
              <span>Show Trendline</span>
            </label>
          </div>
        )}

        {/* Stack Mode Toggle */}
        {['bar', 'area'].includes(chartType) && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox"
                checked={stackMode}
                onChange={(e) => setStackMode(e.target.checked)}
                style={{ accentColor: 'hsl(var(--accent))' }}
              />
              <span>Stacked Layout</span>
            </label>
          </div>
        )}

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
            <option value="rose">Rose Theme</option>
            <option value="amber">Amber Theme</option>
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
                  yAxis2: enableDualAxis ? yAxis2 : undefined,
                  enableTrendline,
                  stackMode,
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
        <div style={{ width: '100%', height: '100%', minHeight: '300px', position: 'relative' }}>
          {regressionStats && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '30px',
              backgroundColor: 'hsla(var(--bg-card), 0.85)',
              border: '1px solid hsl(var(--border))',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              color: 'hsl(var(--text-muted))',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <span style={{ color: '#ef4444', fontWeight: 600 }}>Regression Model</span>
              <span>{regressionStats.equation}</span>
              <span>{regressionStats.r2String}</span>
            </div>
          )}
          <ResponsiveContainer width="100%" height="90%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

export default ChartBuilder;
