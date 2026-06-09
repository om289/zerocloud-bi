import React, { memo } from 'react';
import { Copy, Plus, X } from 'lucide-react';

const SqlSnippets = memo(function SqlSnippets({ activeTable, columns, onInjectQuery, onClose }) {
  const table = activeTable || 'your_table';
  
  // Intelligently guess the best matching columns from active schema types
  const numericCol = columns?.find(c => 
    c.type.includes('INT') || 
    c.type.includes('DOUBLE') || 
    c.type.includes('FLOAT') || 
    c.type.includes('NUMERIC') ||
    c.name.toLowerCase() === 'sales' || 
    c.name.toLowerCase() === 'quantity'
  )?.name || 'numeric_column';
  
  const dateCol = columns?.find(c => 
    c.type.includes('DATE') || 
    c.type.includes('TIME') || 
    c.name.toLowerCase().includes('date')
  )?.name || 'date_column';
  
  const groupCol = columns?.find(c => 
    c.type.includes('VARCHAR') || 
    c.name.toLowerCase().includes('category') || 
    c.name.toLowerCase().includes('region')
  )?.name || 'category_column';

  const snippets = [
    {
      title: "Cumulative Sum (Running Total)",
      description: "Calculates the running sum of a numeric column ordered by date.",
      sql: `SELECT \n  ${dateCol},\n  ${numericCol},\n  SUM(${numericCol}) OVER (ORDER BY ${dateCol}) AS running_total\nFROM ${table};`
    },
    {
      title: "Percentage of Grand Total",
      description: "Calculates totals per category and their percentage weight relative to the global sum.",
      sql: `SELECT \n  ${groupCol},\n  SUM(${numericCol}) AS total_amount,\n  ROUND(SUM(${numericCol}) / SUM(SUM(${numericCol})) OVER () * 100, 2) AS percent_of_total\nFROM ${table}\nGROUP BY ${groupCol}\nORDER BY total_amount DESC;`
    },
    {
      title: "Moving Average (3-Period Roll)",
      description: "Applies a rolling window average to smooth variations in sequential data rows.",
      sql: `SELECT \n  ${dateCol},\n  ${numericCol},\n  ROUND(AVG(${numericCol}) OVER (\n    ORDER BY ${dateCol} \n    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW\n  ), 2) AS rolling_avg_3_periods\nFROM ${table};`
    },
    {
      title: "Rank Items inside Group",
      description: "Groups rows and ranks items descendingly within each group.",
      sql: `SELECT \n  ${groupCol},\n  ${numericCol},\n  RANK() OVER (\n    PARTITION BY ${groupCol} \n    ORDER BY ${numericCol} DESC\n  ) AS rank_in_group\nFROM ${table};`
    },
    {
      title: "Period-Over-Period Growth Rates",
      description: "Uses LAG to evaluate percent growth compared to the immediately preceding time period.",
      sql: `SELECT \n  ${dateCol},\n  SUM(${numericCol}) AS current_period_sales,\n  LAG(SUM(${numericCol})) OVER (ORDER BY ${dateCol}) AS previous_period_sales,\n  ROUND((SUM(${numericCol}) - LAG(SUM(${numericCol})) OVER (ORDER BY ${dateCol})) / LAG(SUM(${numericCol})) OVER (ORDER BY ${dateCol}) * 100, 2) AS growth_percentage\nFROM ${table}\nGROUP BY ${dateCol};`
    }
  ];

  const handleCopy = (sql) => {
    navigator.clipboard.writeText(sql);
  };

  return (
    <div className="snippets-drawer">
      <div className="snippets-header">
        <div>
          <h3>Analytical Templates</h3>
          <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', fontFamily: 'monospace' }}>
            Table: {table}
          </span>
        </div>
        <button className="table-action-btn" onClick={onClose} style={{ padding: '6px' }}>
          <X size={16} />
        </button>
      </div>

      <div className="snippets-content">
        {snippets.map((item, idx) => (
          <div key={idx} className="snippet-card">
            <h4 style={{ fontSize: '0.85rem', color: 'hsl(var(--text-main))', fontWeight: 600, fontFamily: 'Outfit' }}>
              {item.title}
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', margin: '4px 0 8px 0' }}>
              {item.description}
            </p>
            
            <pre className="snippet-code-block">{item.sql}</pre>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                className="btn-outline" 
                style={{ padding: '4px 8px', fontSize: '0.7rem', height: '24px' }}
                onClick={() => handleCopy(item.sql)}
              >
                <Copy size={10} />
                <span>Copy</span>
              </button>
              
              <button 
                className="btn-run" 
                style={{ padding: '4px 8px', fontSize: '0.7rem', height: '24px', boxShadow: 'none' }}
                onClick={() => onInjectQuery(item.sql)}
              >
                <Plus size={10} />
                <span>Inject</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default SqlSnippets;
