import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { LayoutGrid, Plus, Trash2, ArrowUpDown } from 'lucide-react';
import { runQuery } from '../lib/duckdb';

const PivotBuilder = memo(function PivotBuilder({ activeTable, columns }) {
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState([]);
  const [valCol, setValCol] = useState('');
  const [valFunc, setValFunc] = useState('COUNT'); // COUNT, SUM, AVG, MIN, MAX
  const [pivotData, setPivotData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Resize Width of the Configurator Panel
  const [configWidth, setConfigWidth] = useState(280);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let width = e.clientX - rect.left;
      
      // Enforce boundaries: min 220px, max 500px
      if (width < 220) width = 220;
      if (width > 500) width = 500;
      
      setConfigWidth(width);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  // Reset settings when table changes
  useEffect(() => {
    setRows([]);
    setCols([]);
    setValCol(columns[0]?.name || '');
    setValFunc('COUNT');
    setPivotData(null);
    setError(null);
  }, [activeTable, columns]);

  const handleRunPivot = async () => {
    if (!activeTable || rows.length === 0 || cols.length === 0 || !valCol) {
      setError("Please select at least one Row field, one Column field, and a Value field.");
      return;
    }

    setLoading(true);
    setError(null);
    setPivotData(null);

    const quoteIdentifier = (ident) => {
      if (!ident) return '';
      if (ident.includes('"') || ident.includes('(')) return ident;
      if (ident.includes('.')) {
        return ident.split('.').map(part => `"${part}"`).join('.');
      }
      return `"${ident}"`;
    };

    // Build DuckDB native PIVOT SQL with properly quoted identifiers:
    // PIVOT table ON columns USING function(val) GROUP BY rows
    const quotedTable = quoteIdentifier(activeTable);
    const rowString = rows.map(r => quoteIdentifier(r)).join(', ');
    const colString = cols.map(c => quoteIdentifier(c)).join(', ');
    const quotedValCol = quoteIdentifier(valCol);
    const sql = `PIVOT ${quotedTable} ON ${colString} USING ${valFunc.toUpperCase()}(${quotedValCol}) GROUP BY ${rowString};`;

    try {
      const result = await runQuery(sql);
      if (result.success) {
        setPivotData(result);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addRowField = (field) => {
    if (field && !rows.includes(field)) {
      setRows(prev => [...prev, field]);
    }
  };

  const removeRowField = (field) => {
    setRows(prev => prev.filter(f => f !== field));
  };

  const addColField = (field) => {
    if (field && !cols.includes(field)) {
      setCols(prev => [...prev, field]);
    }
  };

  const removeColField = (field) => {
    setCols(prev => prev.filter(f => f !== field));
  };

  return (
    <div 
      ref={containerRef}
      className="pivot-builder-grid"
      style={{ display: 'flex', gap: '0', width: '100%', overflow: 'hidden' }}
    >
      <div className="pivot-config" style={{ width: `${configWidth}px`, flexShrink: 0 }}>
        <h4 style={{ fontSize: '0.85rem', fontFamily: 'Outfit', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px' }}>
          Pivot Configurator
        </h4>

        {/* Rows Setup */}
        <div className="pivot-dropzone-group">
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-muted))' }}>Row Groupings</label>
          <div className="pivot-drop-target">
            {rows.map(field => (
              <span key={field} className="pivot-field-tag">
                {field}
                <button className="pivot-field-remove" onClick={() => removeRowField(field)}>
                  <Trash2 size={10} />
                </button>
              </span>
            ))}
            {rows.length === 0 && <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-dark))' }}>Add fields below</span>}
          </div>
          <select 
            className="form-select" 
            onChange={(e) => { addRowField(e.target.value); e.target.value = ''; }}
            style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px' }}
            defaultValue=""
          >
            <option value="" disabled>+ Add Row Field...</option>
            {columns.filter(c => !rows.includes(c.name) && !cols.includes(c.name)).map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Columns Setup */}
        <div className="pivot-dropzone-group">
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-muted))' }}>Column Pivots</label>
          <div className="pivot-drop-target">
            {cols.map(field => (
              <span key={field} className="pivot-field-tag">
                {field}
                <button className="pivot-field-remove" onClick={() => removeColField(field)}>
                  <Trash2 size={10} />
                </button>
              </span>
            ))}
            {cols.length === 0 && <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-dark))' }}>Add fields below</span>}
          </div>
          <select 
            className="form-select" 
            onChange={(e) => { addColField(e.target.value); e.target.value = ''; }}
            style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px' }}
            defaultValue=""
          >
            <option value="" disabled>+ Add Column Pivot...</option>
            {columns.filter(c => !rows.includes(c.name) && !cols.includes(c.name)).map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Value setup */}
        <div className="pivot-dropzone-group">
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-muted))' }}>Values Metric</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select 
              className="form-select" 
              value={valFunc}
              onChange={(e) => setValFunc(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px', flex: 1 }}
            >
              <option value="COUNT">COUNT</option>
              <option value="SUM">SUM</option>
              <option value="AVG">AVG</option>
              <option value="MIN">MIN</option>
              <option value="MAX">MAX</option>
            </select>
            <select 
              className="form-select" 
              value={valCol}
              onChange={(e) => setValCol(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '0.75rem', height: '28px', flex: 1.5 }}
            >
              {columns.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button 
          className="btn-run" 
          onClick={handleRunPivot}
          disabled={loading || rows.length === 0 || cols.length === 0}
          style={{ width: '100%', justifyContent: 'center', height: '34px', background: 'linear-gradient(135deg, hsl(var(--accent-secondary)), #0891b2)', boxShadow: 'none', marginTop: '10px' }}
        >
          {loading ? "Computing Pivot..." : "Generate Pivot"}
        </button>
      </div>

      {/* LeetCode style resizable vertical splitter (slider) */}
      <div 
        onMouseDown={handleMouseDown}
        className="sidebar-splitter"
        style={{ cursor: 'col-resize', margin: '0 10px', height: '100%', flexShrink: 0 }}
      />

      <div className="pivot-results-panel glass-panel" style={{ flex: 1, minWidth: 0 }}>
        {error && (
          <div className="error-panel" style={{ margin: '16px' }}>
            <span style={{ fontWeight: 600 }}>Pivot Error:</span>
            <p style={{ marginTop: '4px', fontFamily: 'monospace' }}>{error}</p>
          </div>
        )}

        {pivotData && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <table className="pivot-matrix-table">
              <thead>
                <tr>
                  {pivotData.columns.map(col => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivotData.rows.map((row, idx) => (
                  <tr key={idx}>
                    {pivotData.columns.map(col => {
                      const isRowHeader = rows.includes(col);
                      const isTotalCol = col.toLowerCase().includes('total');
                      let cellClass = '';
                      if (isRowHeader) cellClass = 'pivot-row-header';
                      if (isTotalCol) cellClass = 'pivot-col-total';
                      
                      const val = row[col];
                      return (
                        <td key={col} className={cellClass}>
                          {val === null || val === undefined ? (
                            <span style={{ opacity: 0.3 }}>0</span>
                          ) : (
                            typeof val === 'number' && !isRowHeader ? val.toLocaleString() : String(val)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!pivotData && !error && (
          <div className="no-data-state">
            <LayoutGrid size={32} style={{ color: 'hsl(var(--text-dark))' }} />
            <h3>Pivot Grid Canvas</h3>
            <p>Select row dimensions and column dimensions on the left, then click Generate Pivot to compute cross-tab aggregates.</p>
          </div>
        )}
      </div>
    </div>
  );
});

export default PivotBuilder;
