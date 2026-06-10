import React, { useState, useEffect, memo } from 'react';
import { runQuery } from '../lib/duckdb';
import { ClipboardList, ShieldAlert, Sparkles } from 'lucide-react';

const DataProfiler = memo(function DataProfiler({ activeTable }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSummary = async () => {
      if (!activeTable) {
        setProfileData(null);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const sql = `SUMMARIZE ${activeTable};`;
        const result = await runQuery(sql);
        if (result.success) {
          setProfileData(result);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [activeTable]);

  if (!activeTable) {
    return (
      <div className="no-data-state">
        <ClipboardList size={24} />
        <h3>No Table Selected</h3>
        <p>Drop a dataset file and select a table in the sidebar to inspect data profile statistics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="no-data-state">
        <div className="status-dot loading" style={{ width: '20px', height: '20px' }} />
        <p>Analyzing column cardinatlities and summary distributions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-panel" style={{ margin: '16px' }}>
        <ShieldAlert size={16} />
        <div>
          <strong>Profiler Error:</strong>
          <pre style={{ marginTop: '4px', fontSize: '0.8rem' }}>{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content" style={{ padding: '16px', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.9rem', fontFamily: 'Outfit', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Sparkles size={14} style={{ color: 'hsl(var(--accent-secondary))' }} />
            <span>Descriptive Statistics & Profile for "{activeTable}"</span>
          </h4>
          <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Powered by DuckDB SUMMARIZE engine</span>
        </div>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th>Nulls</th>
            <th>Min</th>
            <th>Max</th>
            <th>Approx Unique</th>
            <th>Avg</th>
            <th>StdDev</th>
            <th>Q25</th>
            <th>Median</th>
            <th>Q75</th>
          </tr>
        </thead>
        <tbody>
          {profileData?.rows.map((row, idx) => {
            const nullPct = parseFloat(row.null_percentage) || 0;
            return (
              <tr key={idx}>
                <td style={{ fontWeight: 600, fontFamily: 'monospace', color: 'hsl(var(--text-main))' }}>
                  {row.column_name}
                </td>
                <td style={{ fontFamily: 'monospace', color: 'hsl(var(--accent-secondary))' }}>
                  {row.column_type}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      width: '50px', 
                      height: '6px', 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{ 
                        width: `${nullPct}%`, 
                        height: '100%', 
                        backgroundColor: nullPct > 20 ? 'hsl(var(--error))' : 'hsl(var(--success))' 
                      }} />
                    </div>
                    <span>{nullPct.toFixed(1)}%</span>
                  </div>
                </td>
                <td>{row.min === null ? <span style={{ opacity: 0.3 }}>-</span> : String(row.min)}</td>
                <td>{row.max === null ? <span style={{ opacity: 0.3 }}>-</span> : String(row.max)}</td>
                <td>{(parseInt(row.approx_unique, 10) || 0).toLocaleString()}</td>
                <td>{row.avg === null ? <span style={{ opacity: 0.3 }}>-</span> : Number(row.avg).toFixed(2)}</td>
                <td>{row.stddev === null ? <span style={{ opacity: 0.3 }}>-</span> : Number(row.stddev).toFixed(2)}</td>
                <td>{row.q25 === null ? <span style={{ opacity: 0.3 }}>-</span> : String(row.q25)}</td>
                <td>{row.q50 === null ? <span style={{ opacity: 0.3 }}>-</span> : String(row.q50)}</td>
                <td>{row.q75 === null ? <span style={{ opacity: 0.3 }}>-</span> : String(row.q75)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default DataProfiler;
