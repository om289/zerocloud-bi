import React, { useState, useEffect, memo } from 'react';
import { Download, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

const ResultsGrid = memo(function ResultsGrid({ result }) {
  const [page, setPage] = useState(1);
  const [gridSearch, setGridSearch] = useState('');
  const rowsPerPage = 50;

  // Reset page and search filter whenever a new query execution result arrives
  useEffect(() => {
    setPage(1);
    setGridSearch('');
  }, [result]);

  if (!result) {
    return (
      <div className="no-data-state">
        <AlertTriangle size={24} />
        <h3>No Query Run</h3>
        <p>Type a SQL query above and click Run to see the results here.</p>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="error-panel">
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ fontSize: '0.9rem', color: 'hsl(var(--error))' }}>SQL Query Exception:</strong>
          <div style={{ marginTop: '6px', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
            {result.error}
          </div>
        </div>
      </div>
    );
  }

  const { columns, rows } = result;

  if (columns.length === 0) {
    return (
      <div className="no-data-state">
        <h3>Statement Executed</h3>
        <p>Query ran successfully, but did not return any records (e.g., Table Created, Dropped, or Altered).</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="no-data-state">
        <h3>Empty Dataset</h3>
        <p>Query executed successfully, but returned 0 rows matching your criteria.</p>
      </div>
    );
  }

  // Client-side filtration of rows
  const filteredRows = React.useMemo(() => {
    if (!gridSearch.trim()) return rows;
    const queryLower = gridSearch.toLowerCase();
    return rows.filter(row => 
      columns.some(col => String(row[col] ?? '').toLowerCase().includes(queryLower))
    );
  }, [rows, columns, gridSearch]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + rowsPerPage);

  const handleExportCSV = () => {
    if (filteredRows.length === 0) return;
    
    const csvHeader = columns.join(',');
    const csvRows = filteredRows.map(row => 
      columns.map(col => {
        let val = row[col];
        if (val === null || val === undefined) return '';
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      }).join(',')
    );
    
    const blob = new Blob([[csvHeader, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `query_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (filteredRows.length === 0) return;
    
    const blob = new Blob([JSON.stringify(filteredRows, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `query_export_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderCellValue = (val) => {
    if (val === null || val === undefined) {
      return <span style={{ color: 'hsl(var(--text-dark))', fontStyle: 'italic' }}>null</span>;
    }
    if (typeof val === 'boolean') {
      return val ? (
        <span style={{ color: 'hsl(var(--accent-secondary))', fontWeight: 600 }}>true</span>
      ) : (
        <span style={{ color: 'hsl(var(--text-dark))', fontWeight: 600 }}>false</span>
      );
    }
    return String(val);
  };

  return (
    <div className="tab-content" style={{ height: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        borderBottom: '1px solid hsl(var(--border))',
        backgroundColor: 'rgba(0,0,0,0.08)',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
          Showing {filteredRows.length === 0 ? 0 : startIndex + 1} - {Math.min(filteredRows.length, startIndex + rowsPerPage)} of {filteredRows.length} rows
          {gridSearch && ` (filtered from ${rows.length})`}
          {result.executionTimeMs !== undefined && ` | Time: ${result.executionTimeMs}ms`}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Search rows..." 
            className="form-select" 
            value={gridSearch}
            onChange={(e) => { setGridSearch(e.target.value); setPage(1); }}
            style={{ 
              padding: '2px 8px', 
              fontSize: '0.75rem', 
              height: '28px', 
              width: '140px', 
              backgroundColor: 'hsl(var(--bg-main))' 
            }}
          />

          <button 
            className="btn-outline" 
            style={{ padding: '6px 10px', fontSize: '0.75rem', height: '28px' }}
            onClick={handleExportCSV}
            id="btn-export-csv"
          >
            <Download size={12} />
            <span>Export CSV</span>
          </button>

          <button 
            className="btn-outline" 
            style={{ padding: '6px 10px', fontSize: '0.75rem', height: '28px' }}
            onClick={handleExportJSON}
            id="btn-export-json"
          >
            <Download size={12} />
            <span>Export JSON</span>
          </button>
          
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button 
                className="btn-outline"
                style={{ padding: '0 4px', minWidth: '24px', height: '24px' }}
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                id="btn-prev-page"
              >
                <ChevronLeft size={12} />
              </button>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', minWidth: '40px', textAlign: 'center' }}>
                {page} / {totalPages}
              </span>
              <button 
                className="btn-outline"
                style={{ padding: '0 4px', minWidth: '24px', height: '24px' }}
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                id="btn-next-page"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="results-table">
          <thead>
            <tr>
              {columns.map(col => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {columns.map((col, cIdx) => (
                  <td key={cIdx} title={String(row[col] ?? '')}>
                    {renderCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default ResultsGrid;
