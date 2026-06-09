import React, { useState, useEffect, useCallback } from 'react';
import { Database, Table, BarChart2, AlertCircle, FileCode2, Play, LayoutGrid, Terminal, Sparkles } from 'lucide-react';
import { initDuckDB, runQuery, getDB, getConn } from './lib/duckdb';
import FileLoader from './components/FileLoader';
import SchemaBrowser from './components/SchemaBrowser';
import QueryEditor from './components/QueryEditor';
import ResultsGrid from './components/ResultsGrid';
import ChartBuilder from './components/ChartBuilder';
import VisualQueryBuilder from './components/VisualQueryBuilder';
import DashboardCanvas from './components/DashboardCanvas';
import SqlSnippets from './components/SqlSnippets';
import PivotBuilder from './components/PivotBuilder';
import NlqAssistant from './components/NlqAssistant';
import DbTerminal from './components/DbTerminal';

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [tables, setTables] = useState([]);
  const [query, setQuery] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('data');
  
  // Advanced BI Expansion States
  const [workspaceMode, setWorkspaceMode] = useState('sql'); // sql, builder, pivot, nlq, terminal, dashboard
  const [dashboardCards, setDashboardCards] = useState([]);
  const [showSnippets, setShowSnippets] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });

  const showNotification = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => prev.message === message ? { message: '', type: '' } : prev);
    }, 3000);
  }, []);

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

  // Run a SQL query in the background worker thread
  const handleRunQuery = useCallback(async (sqlString) => {
    if (!sqlString.trim()) return;
    
    setIsRunning(true);
    setResult(null);
    
    try {
      const queryResult = await runQuery(sqlString);
      // Attach the query string to the result object for down-stream dashboard cards
      queryResult.sql = sqlString;
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
      const filtered = prev.filter(t => t.name !== newTable.name);
      return [...filtered, newTable];
    });
    
    const initialQuery = `SELECT * FROM ${newTable.name} LIMIT 50;`;
    setQuery(initialQuery);
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

  // Dashboard Card Pinning callback
  const handlePinCard = useCallback((cardConfig) => {
    if (!result || !result.success) return;

    const newCard = {
      id: Date.now(),
      title: cardConfig.title,
      chartType: cardConfig.chartType,
      xAxis: cardConfig.xAxis,
      yAxis: cardConfig.yAxis,
      yAxis2: cardConfig.yAxis2,
      enableTrendline: cardConfig.enableTrendline,
      stackMode: cardConfig.stackMode,
      colorTheme: cardConfig.colorTheme,
      rows: result.rows,
      sql: result.sql || query
    };

    setDashboardCards(prev => [...prev, newCard]);
    showNotification(`Pinned "${cardConfig.title}" to your Dashboard Report!`, 'success');
  }, [result, query, showNotification]);

  const handleRemoveDashboardCard = useCallback((cardId) => {
    setDashboardCards(prev => prev.filter(c => c.id !== cardId));
  }, []);

  const handleRenameDashboardCard = useCallback((cardId, newTitle) => {
    setDashboardCards(prev => prev.map(c => c.id === cardId ? { ...c, title: newTitle } : c));
  }, []);

  const handleReorderDashboardCards = useCallback((newCards) => {
    setDashboardCards(newCards);
  }, []);

  // Inject analytical SQL template and switch to console view
  const handleInjectSnippet = useCallback((sqlString) => {
    setQuery(sqlString);
    setWorkspaceMode('sql');
    handleRunQuery(sqlString);
  }, [handleRunQuery]);

  // Save the entire active workspace (tables schemas, tables contents, and widgets) as a JSON file
  const handleSaveWorkspace = async () => {
    setIsRunning(true);
    try {
      const savedTables = [];
      for (const table of tables) {
        const queryRes = await runQuery(`SELECT * FROM ${table.name}`);
        if (queryRes.success) {
          savedTables.push({
            name: table.name,
            columns: table.columns,
            rows: queryRes.rows
          });
        }
      }

      const workspaceData = {
        version: "1.0.0",
        cards: dashboardCards,
        tables: savedTables
      };

      const jsonString = JSON.stringify(workspaceData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `zerocloud_bi_workspace_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification("Workspace saved successfully!", "success");
    } catch (err) {
      showNotification("Failed to save workspace: " + err.message, "error");
    } finally {
      setIsRunning(false);
    }
  };

  // Restore workspace JSON, register tables in DuckDB and load visual widgets
  const handleLoadWorkspace = async (file) => {
    setIsRunning(true);
    try {
      const text = await file.text();
      const workspaceData = JSON.parse(text);

      if (!workspaceData.tables || !workspaceData.cards) {
        throw new Error("Invalid workspace structure.");
      }

      const database = await getDB();
      const conn = await getConn();

      const restoredTables = [];
      for (const table of workspaceData.tables) {
        const jsonStr = JSON.stringify(table.rows);
        const encoder = new TextEncoder();
        const buffer = encoder.encode(jsonStr);
        const virtualFile = `${table.name}_restored.json`;

        await database.registerFileBuffer(virtualFile, buffer);
        await conn.query(`CREATE OR REPLACE TABLE ${table.name} AS SELECT * FROM read_json_auto('${virtualFile}')`);
        
        restoredTables.push({
          name: table.name,
          fileName: virtualFile,
          columns: table.columns
        });
      }

      setTables(restoredTables);
      setDashboardCards(workspaceData.cards);

      if (restoredTables.length > 0) {
        const lastTable = restoredTables[restoredTables.length - 1];
        setQuery(`SELECT * FROM ${lastTable.name} LIMIT 50;`);
      }

      showNotification("Workspace restored successfully!", "success");
    } catch (err) {
      showNotification("Failed to load workspace: " + err.message, "error");
    } finally {
      setIsRunning(false);
    }
  };

  // Find the active table details for snippets and other configurations
  const activeTableObj = tables.length > 0 ? tables[tables.length - 1] : null;

  return (
    <div className="app-container">
      {/* Sidebar Controls */}
      <aside className="sidebar no-print">
        <div className="sidebar-header">
          <h1>
            ZeroCloud BI
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

      {/* Main Analysis Workspace */}
      <main className="workspace">
        {/* Workspace Title bar */}
        <header className="workspace-header no-print">
          <h2>
            <Database size={18} style={{ color: 'hsl(var(--accent-secondary))' }} />
            <span>Serverless Analytical Database</span>
          </h2>
          
          <div className="db-status">
            <span className={`status-dot ${dbReady ? 'connected' : 'loading'}`}></span>
            <span>{dbReady ? "DuckDB Engine Online" : "Connecting to local Wasm engine..."}</span>
          </div>
        </header>

        {/* Navigation Mode Sub-Header */}
        <div className="workspace-mode-bar no-print" style={{ overflowX: 'auto', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              className={`mode-btn ${workspaceMode === 'sql' ? 'active' : ''}`}
              onClick={() => setWorkspaceMode('sql')}
            >
              SQL Console
            </button>
            <button 
              className={`mode-btn ${workspaceMode === 'builder' ? 'active' : ''}`}
              onClick={() => setWorkspaceMode('builder')}
            >
              Visual Builder
            </button>
            <button 
              className={`mode-btn ${workspaceMode === 'pivot' ? 'active' : ''}`}
              onClick={() => setWorkspaceMode('pivot')}
            >
              Pivot Grid
            </button>
            <button 
              className={`mode-btn ${workspaceMode === 'nlq' ? 'active' : ''}`}
              onClick={() => setWorkspaceMode('nlq')}
            >
              <Sparkles size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              NLQ Assistant
            </button>
            <button 
              className={`mode-btn ${workspaceMode === 'terminal' ? 'active' : ''}`}
              onClick={() => setWorkspaceMode('terminal')}
            >
              <Terminal size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              CLI Terminal
            </button>
            <button 
              className={`mode-btn ${workspaceMode === 'dashboard' ? 'active' : ''}`}
              onClick={() => setWorkspaceMode('dashboard')}
            >
              DashboardCanvas ({dashboardCards.length})
            </button>
          </div>

          {activeTableObj && (
            <button 
              className={`btn-outline ${showSnippets ? 'active' : ''}`}
              onClick={() => setShowSnippets(!showSnippets)}
              style={{ height: '30px', fontSize: '0.8rem', padding: '0 10px', flexShrink: 0 }}
              id="btn-toggle-snippets"
            >
              <FileCode2 size={12} />
              <span>SQL Templates</span>
            </button>
          )}
        </div>

        {/* Workspace views split pane */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div className="workspace-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            
            {workspaceMode === 'dashboard' ? (
              <DashboardCanvas 
                cards={dashboardCards} 
                onRemoveCard={handleRemoveDashboardCard} 
                onRenameCard={handleRenameDashboardCard} 
                onReorderCards={handleReorderDashboardCards}
                tables={tables}
                dbReady={dbReady}
                onSaveWorkspace={handleSaveWorkspace}
                onLoadWorkspace={handleLoadWorkspace}
              />
            ) : workspaceMode === 'pivot' ? (
              <PivotBuilder 
                activeTable={activeTableObj?.name}
                columns={activeTableObj?.columns || []}
              />
            ) : workspaceMode === 'nlq' ? (
              <NlqAssistant 
                activeTable={activeTableObj?.name}
                columns={activeTableObj?.columns || []}
                onRunQuery={handleInjectSnippet}
              />
            ) : workspaceMode === 'terminal' ? (
              <DbTerminal 
                activeTable={activeTableObj?.name}
                tables={tables}
              />
            ) : (
              <>
                {/* Switch top pane based on mode */}
                {workspaceMode === 'sql' ? (
                  <QueryEditor 
                    query={query} 
                    setQuery={setQuery} 
                    onRunQuery={handleRunQuery} 
                    isRunning={isRunning} 
                    lastExecutionResult={result} 
                    activeTable={activeTableObj?.name}
                    columns={activeTableObj?.columns || []}
                  />
                ) : (
                  <VisualQueryBuilder 
                    activeTable={activeTableObj?.name}
                    columns={activeTableObj?.columns || []}
                    tables={tables}
                    onRunQuery={handleRunQuery}
                    isRunning={isRunning}
                  />
                )}

                {/* Results grid / single Chart workspace at the bottom */}
                <div className="glass-panel tabs-container">
                  <div className="tabs-header no-print">
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
                    <ChartBuilder result={result} onPinCard={handlePinCard} />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right-floating Slide-out Templates reference drawer */}
          {showSnippets && activeTableObj && (
            <SqlSnippets 
              activeTable={activeTableObj.name}
              columns={activeTableObj.columns}
              onInjectQuery={handleInjectSnippet}
              onClose={() => setShowSnippets(false)}
            />
          )}
        </div>
      </main>
      {toast.message && (
        <div className={`toast-notification ${toast.type} no-print`} id="toast-notify">
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
