import React, { useState, useEffect, useCallback } from 'react';
import { Database, Table, BarChart2, AlertCircle } from 'lucide-react';
import { initDuckDB, runQuery } from './lib/duckdb';
import FileLoader from './components/FileLoader';
import SchemaBrowser from './components/SchemaBrowser';
import QueryEditor from './components/QueryEditor';
import ResultsGrid from './components/ResultsGrid';
import ChartBuilder from './components/ChartBuilder';

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [tables, setTables] = useState([]);
  const [query, setQuery] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('data');

  // Initialize DuckDB-Wasm once on component load
  useEffect(() => {
    initDuckDB()
      .then(() => {
        setDbReady(true);
      })
      .catch((err) => {
        console.error(err);
        setDbError("Failed to start DuckDB Wasm database: " + err.message);
      });
  }, []);

  const handleRunQuery = useCallback(async (sqlString) => {
    if (!sqlString.trim()) return;
    
    setIsRunning(true);
    setResult(null);
    
    try {
      const queryResult = await runQuery(sqlString);
      setResult(queryResult);
      
      // If user manually ran a DROP TABLE command, sync the schema browser
      if (queryResult.success && sqlString.toLowerCase().includes('drop table')) {
        const match = sqlString.match(/drop\s+table\s+(?:if\s+exists\s+)?([a-zA-Z0-9_]+)/i);
        if (match && match[1]) {
          const droppedName = match[1].toLowerCase();
          setTables(prev => prev.filter(t => t.name !== droppedName));
        }
      }
    } catch (err) {
      setResult({
        success: false,
        error: err.message,
        executionTimeMs: 0
      });
    } finally {
      setIsRunning(false);
    }
  }, []);

  const handleTableLoaded = useCallback((newTable) => {
    setTables(prev => {
      // Replace existing table if same name loaded again
      const filtered = prev.filter(t => t.name !== newTable.name);
      return [...filtered, newTable];
    });
    
    // Autofill query workspace with default selection
    const initialQuery = `SELECT * FROM ${newTable.name} LIMIT 50;`;
    setQuery(initialQuery);
    
    // Execute query automatically to preview details
    handleRunQuery(initialQuery);
  }, [handleRunQuery]);

  const handleSelectTable = useCallback((tableName) => {
    const defaultQuery = `SELECT * FROM ${tableName} LIMIT 50;`;
    setQuery(defaultQuery);
    handleRunQuery(defaultQuery);
  }, [handleRunQuery]);

  const handleDeleteTable = useCallback(async (tableName) => {
    setIsRunning(true);
    const dropQuery = `DROP TABLE ${tableName};`;
    const dropResult = await runQuery(dropQuery);
    
    setIsRunning(false);
    if (dropResult.success) {
      setTables(prev => prev.filter(t => t.name !== tableName));
      setQuery(prev => prev.includes(tableName) ? '' : prev);
      setResult(null);
    } else {
      setResult(dropResult);
    }
  }, []);

  return (
    <div className="app-container">
      {/* Sidebar controls */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>
            Local BI Analyzer
            <span>DuckDB SQL Engine</span>
          </h1>
        </div>
        
        <div className="sidebar-content">
          {dbError ? (
            <div style={{ color: 'hsl(var(--error))', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.05)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.1)' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{dbError}</span>
            </div>
          ) : (
            <FileLoader onTableLoaded={handleTableLoaded} dbReady={dbReady} />
          )}
          
          <SchemaBrowser 
            tables={tables} 
            onSelectTable={handleSelectTable} 
            onDeleteTable={handleDeleteTable} 
          />
        </div>
      </aside>

      {/* Primary database view */}
      <main className="workspace">
        <header className="workspace-header">
          <h2>
            <Database size={18} style={{ color: 'hsl(var(--accent-secondary))' }} />
            <span>SQL Analytics Workspace</span>
          </h2>
          
          <div className="db-status">
            <span className={`status-dot ${dbReady ? 'connected' : 'loading'}`}></span>
            <span>{dbReady ? "DuckDB Engine Online" : "Connecting to local Wasm engine..."}</span>
          </div>
        </header>

        <div className="workspace-content">
          {/* Query Editor component */}
          <QueryEditor 
            query={query} 
            setQuery={setQuery} 
            onRunQuery={handleRunQuery} 
            isRunning={isRunning} 
            lastExecutionResult={result} 
          />

          {/* Results grid / Chart viewports */}
          <div className="glass-panel tabs-container">
            <div className="tabs-header">
              <div className="tabs">
                <button 
                  className={`tab ${activeTab === 'data' ? 'active' : ''}`}
                  onClick={() => setActiveTab('data')}
                  id="tab-data"
                >
                  <Table size={14} />
                  <span>Data Table</span>
                </button>
                <button 
                  className={`tab ${activeTab === 'chart' ? 'active' : ''}`}
                  onClick={() => setActiveTab('chart')}
                  id="tab-chart"
                >
                  <BarChart2 size={14} />
                  <span>Visualizations</span>
                </button>
              </div>
            </div>

            {activeTab === 'data' ? (
              <ResultsGrid result={result} />
            ) : (
              <ChartBuilder result={result} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
