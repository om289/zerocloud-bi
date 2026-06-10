import React, { useState, useEffect, memo } from 'react';
import { Copy, Plus, X, Trash2, Heart } from 'lucide-react';

const SqlSnippets = memo(function SqlSnippets({ activeTable, columns, onInjectQuery, onClose }) {
  const table = activeTable || 'your_table';
  
  // States for dynamic column mapping
  const [selectedDateCol, setSelectedDateCol] = useState('');
  const [selectedNumCol, setSelectedNumCol] = useState('');
  const [selectedGroupCol, setSelectedGroupCol] = useState('');

  // States for custom snippet builder
  const [customSnippets, setCustomSnippets] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSql, setNewSql] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Initial guesses on load or table change
  useEffect(() => {
    if (columns && columns.length > 0) {
      const dateC = columns.find(c => 
        c.type.includes('DATE') || 
        c.type.includes('TIME') || 
        c.name.toLowerCase().includes('date') ||
        c.name.toLowerCase().includes('year')
      )?.name || columns[0].name;

      const numC = columns.find(c => 
        c.type.includes('INT') || 
        c.type.includes('DOUBLE') || 
        c.type.includes('FLOAT') || 
        c.type.includes('NUMERIC') ||
        c.name.toLowerCase().includes('sales') || 
        c.name.toLowerCase().includes('quantity') ||
        c.name.toLowerCase().includes('id') ||
        c.name.toLowerCase().includes('power')
      )?.name || columns[Math.min(1, columns.length - 1)]?.name || columns[0].name;

      const groupC = columns.find(c => 
        c.type.includes('VARCHAR') || 
        c.type.includes('TEXT') ||
        c.name.toLowerCase().includes('category') || 
        c.name.toLowerCase().includes('region') ||
        c.name.toLowerCase().includes('publisher') ||
        c.name.toLowerCase().includes('alignment')
      )?.name || columns[0].name;

      setSelectedDateCol(dateC);
      setSelectedNumCol(numC);
      setSelectedGroupCol(groupC);
    }
  }, [columns]);

  // Load custom snippets on mount
  useEffect(() => {
    const saved = localStorage.getItem('duckdb_custom_snippets');
    if (saved) {
      try {
        setCustomSnippets(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const dateCol = selectedDateCol || 'date_column';
  const numericCol = selectedNumCol || 'numeric_column';
  const groupCol = selectedGroupCol || 'category_column';

  const defaultSnippets = [
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

  const handleSaveCustomSnippet = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSql.trim()) return;

    const newSnippet = {
      id: Date.now(),
      title: newTitle,
      description: newDesc,
      sql: newSql
    };

    const updated = [newSnippet, ...customSnippets];
    setCustomSnippets(updated);
    localStorage.setItem('duckdb_custom_snippets', JSON.stringify(updated));

    // Reset Form
    setNewTitle('');
    setNewDesc('');
    setNewSql('');
    setShowAddForm(false);
  };

  const handleDeleteCustomSnippet = (id) => {
    const updated = customSnippets.filter(s => s.id !== id);
    setCustomSnippets(updated);
    localStorage.setItem('duckdb_custom_snippets', JSON.stringify(updated));
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

      {/* Interactive Column Mapper */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid hsl(var(--border))', backgroundColor: 'rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'hsl(var(--text-muted))', textTransform: 'uppercase' }}>Template Column Mapping</span>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-dark))' }}>Date Field</span>
            <select className="form-select" style={{ fontSize: '0.7rem', padding: '2px 4px', height: '24px' }} value={selectedDateCol} onChange={(e) => setSelectedDateCol(e.target.value)}>
              {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-dark))' }}>Numeric Field</span>
            <select className="form-select" style={{ fontSize: '0.7rem', padding: '2px 4px', height: '24px' }} value={selectedNumCol} onChange={(e) => setSelectedNumCol(e.target.value)}>
              {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-dark))' }}>Category Field</span>
            <select className="form-select" style={{ fontSize: '0.7rem', padding: '2px 4px', height: '24px' }} value={selectedGroupCol} onChange={(e) => setSelectedGroupCol(e.target.value)}>
              {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="snippets-content">
        {/* Custom Snippets Manager Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--accent-secondary))' }}>Custom Templates</span>
          <button 
            className="table-action-btn" 
            style={{ fontSize: '0.7rem', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus size={10} />
            <span>{showAddForm ? 'Cancel' : 'New'}</span>
          </button>
        </div>

        {/* Custom Snippet Add Form */}
        {showAddForm && (
          <form onSubmit={handleSaveCustomSnippet} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', border: '1px dashed hsl(var(--border))', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
            <input 
              type="text" 
              placeholder="Template Name" 
              className="form-select" 
              style={{ fontSize: '0.75rem', padding: '4px 6px', height: '28px', backgroundColor: 'hsl(var(--bg-main))' }}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
            <input 
              type="text" 
              placeholder="Description" 
              className="form-select" 
              style={{ fontSize: '0.75rem', padding: '4px 6px', height: '28px', backgroundColor: 'hsl(var(--bg-main))' }}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <textarea 
              placeholder="SQL Statement" 
              className="form-select" 
              style={{ fontSize: '0.75rem', padding: '6px', height: '60px', resize: 'none', backgroundColor: 'hsl(var(--bg-main))', fontFamily: 'monospace' }}
              value={newSql}
              onChange={(e) => setNewSql(e.target.value)}
              required
            />
            <button type="submit" className="btn-run" style={{ fontSize: '0.75rem', height: '26px', justifyContent: 'center', boxShadow: 'none' }}>
              Save Snippet
            </button>
          </form>
        )}

        {/* Render Custom Snippets */}
        {customSnippets.map((item) => (
          <div key={item.id} className="snippet-card" style={{ borderLeft: '3px solid hsl(var(--accent-secondary))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'hsl(var(--text-main))', fontWeight: 600, fontFamily: 'Outfit', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <Heart size={10} fill="hsl(var(--accent-secondary))" stroke="none" />
                <span>{item.title}</span>
              </h4>
              <button 
                className="table-action-btn" 
                onClick={() => handleDeleteCustomSnippet(item.id)}
                style={{ color: 'hsl(var(--error))', padding: '2px' }}
              >
                <Trash2 size={10} />
              </button>
            </div>
            {item.description && (
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', margin: '4px 0 8px 0' }}>
                {item.description}
              </p>
            )}
            
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

        <div style={{ height: '1px', backgroundColor: 'hsl(var(--border))', margin: '8px 0' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--accent))' }}>Default Analytical Snippets</span>

        {defaultSnippets.map((item, idx) => (
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
