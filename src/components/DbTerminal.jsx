import React, { useState, useEffect, useRef, memo } from 'react';
import { runQuery } from '../lib/duckdb';

const DbTerminal = memo(function DbTerminal({ activeTable, tables }) {
  const [consoleLogs, setConsoleLogs] = useState([
    { type: 'info', text: 'ZeroCloud DuckDB Terminal Console v1.0.0' },
    { type: 'info', text: 'Type .help to list available terminal commands, or write standard SQL queries.' }
  ]);
  const [cmdInput, setCmdInput] = useState('');
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  const handleCommand = async (e) => {
    if (e.key !== 'Enter' || !cmdInput.trim()) return;

    const fullCmd = cmdInput.trim();
    const cleanCmd = fullCmd.toLowerCase();
    
    // Add command to log
    setConsoleLogs(prev => [...prev, { type: 'cmd', text: `duckdb> ${fullCmd}` }]);
    setCmdInput('');

    // Handle dot-commands
    if (cleanCmd.startsWith('.')) {
      if (cleanCmd === '.help') {
        setConsoleLogs(prev => [...prev, {
          type: 'info',
          text: `Available commands:\n  .help                 - Show this help log\n  .tables               - List all tables registered in memory\n  .schema <table_name>   - Describe structure of specified table\n  .clear                - Clear console history`
        }]);
      } else if (cleanCmd === '.tables') {
        if (tables.length === 0) {
          setConsoleLogs(prev => [...prev, { type: 'output', text: 'No active tables registered.' }]);
        } else {
          const tableList = tables.map(t => `  * ${t.name} (${t.columns.length} columns)`).join('\n');
          setConsoleLogs(prev => [...prev, { type: 'output', text: `Active tables:\n${tableList}` }]);
        }
      } else if (cleanCmd.startsWith('.schema')) {
        const parts = fullCmd.split(' ');
        const targetTable = parts[1];
        if (!targetTable) {
          setConsoleLogs(prev => [...prev, { type: 'error', text: 'Error: table name required. Syntax: .schema <table_name>' }]);
        } else {
          const found = tables.find(t => t.name.toLowerCase() === targetTable.toLowerCase());
          if (!found) {
            setConsoleLogs(prev => [...prev, { type: 'error', text: `Error: table "${targetTable}" not found.` }]);
          } else {
            const schemaLines = found.columns.map(c => `  ${c.name} : ${c.type}`).join('\n');
            setConsoleLogs(prev => [...prev, { type: 'output', text: `Table "${found.name}" Schema:\n${schemaLines}` }]);
          }
        }
      } else if (cleanCmd === '.clear') {
        setConsoleLogs([{ type: 'info', text: 'Console cleared.' }]);
      } else {
        setConsoleLogs(prev => [...prev, { type: 'error', text: `Error: command "${fullCmd}" not recognized.` }]);
      }
      return;
    }

    // Otherwise run it as standard SQL query
    try {
      const result = await runQuery(fullCmd);
      if (result.success) {
        if (result.columns.length === 0) {
          setConsoleLogs(prev => [...prev, { type: 'output', text: `Statement executed successfully in ${result.executionTimeMs}ms. No records returned.` }]);
        } else {
          // Format rows as standard terminal ASCII grid or simple format
          const header = result.columns.join('\t|\t');
          const dataRows = result.rows.slice(0, 10).map(r => 
            result.columns.map(c => {
              const val = r[c];
              return val === null ? 'NULL' : String(val);
            }).join('\t|\t')
          );
          
          let outputText = `${header}\n${'-'.repeat(50)}`;
          if (dataRows.length > 0) {
            outputText += '\n' + dataRows.join('\n');
            if (result.rows.length > 10) {
              outputText += `\n... (and ${result.rows.length - 10} more rows)`;
            }
          } else {
            outputText += '\nEmpty dataset.';
          }
          
          setConsoleLogs(prev => [...prev, { 
            type: 'output', 
            text: `Success (${result.rows.length} rows, ${result.executionTimeMs}ms):\n${outputText}` 
          }]);
        }
      } else {
        setConsoleLogs(prev => [...prev, { type: 'error', text: `Query Exception: ${result.error}` }]);
      }
    } catch (err) {
      setConsoleLogs(prev => [...prev, { type: 'error', text: `Connection Error: ${err.message}` }]);
    }
  };

  return (
    <div className="cli-terminal" style={{ flex: 1, minHeight: '300px' }}>
      <div className="cli-log">
        {consoleLogs.map((log, idx) => (
          <div key={idx} className={`cli-row cli-${log.type}`}>
            {log.text}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      <div className="cli-input-container">
        <span className="cli-prompt">duckdb&gt;</span>
        <input 
          type="text" 
          value={cmdInput}
          onChange={(e) => setCmdInput(e.target.value)}
          onKeyDown={handleCommand}
          className="cli-input"
          placeholder="Enter query or dot-command..."
          id="cli-terminal-input"
        />
      </div>
    </div>
  );
});

export default DbTerminal;
