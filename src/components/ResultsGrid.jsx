import React, { useState, useEffect, memo } from 'react';
import { Download, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

const ResultsGrid = memo(function ResultsGrid({ result }) {
  const [page, setPage] = useState(1);
  const rowsPerPage = 50;

  // Reset page to 1 whenever a new query execution result arrives
  useEffect(() => {
    setPage(1);
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

  const totalPages = Math.ceil(rows.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedRows = rows.slice(startIndex, startIndex + rowsPerPage);

  const handleExportCSV = () => {
    if (rows.length === 0) return;
    
    // Convert JSON array to CSV format
    const csvHeader = columns.join(',');
    const csvRows = rows.map(row => 
      columns.map(col => {
        let val = row[col];
        if (val === null || val === undefined) return '';
        // Escape double quotes by doubling them
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      }).join(',')
    );
    
    const csvContent = "data:text/csv;charset=utf-8," + [csvHeader, ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `query_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        backgroundColor: 'rgba(0,0,0,0.08)'
      }}>
        <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
          Showing {startIndex + 1} - {Math.min(rows.length, startIndex + rowsPerPage)} of {rows.length} rows
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className="btn-outline" 
            style={{ padding: '6px 10px', fontSize: '0.75rem', height: '28px' }}
            onClick={handleExportCSV}
            id="btn-export-csv"
          >
            <Download size={12} />
            <span>Export CSV</span>
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
