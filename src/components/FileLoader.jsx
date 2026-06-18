import React, { useState, useCallback, memo } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { registerFile } from '../lib/duckdb';

const FileLoader = memo(function FileLoader({ onTableLoaded, dbReady }) {
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = async (file) => {
    if (!file) return;
    
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.csv') && !nameLower.endsWith('.tsv') && !nameLower.endsWith('.parquet') && !nameLower.endsWith('.tab') && !nameLower.endsWith('.json')) {
      setError("Unsupported file format. Please upload a .csv, .tsv, .parquet, or .json file.");
      return;
    }

    setLoading(true);
    setError(null);
    
    // Sanitize table name (replace non-alphanumeric characters, force lower, ensure starts with a letter)
    let tableName = file.name
      .split('.')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[^a-z]+/, ''); // ensure starts with letter
    
    if (!tableName) {
      tableName = "dataset_" + Math.floor(Math.random() * 1000);
    }

    try {
      const columns = await registerFile(file, tableName);
      onTableLoaded({
        name: tableName,
        fileName: file.name,
        columns: columns
      });
    } catch (err) {
      console.error(err);
      setError(`Failed to read file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [dbReady, onTableLoaded]);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="file-loader-container">
      <div 
        id="dropzone"
        className={`file-dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          if (dbReady && !loading) {
            document.getElementById('file-input').click();
          }
        }}
        style={{ opacity: dbReady ? 1 : 0.6, cursor: (dbReady && !loading) ? 'pointer' : 'not-allowed' }}
      >
        <input 
          type="file" 
          id="file-input" 
          style={{ display: 'none' }} 
          accept=".csv,.tsv,.parquet,.tab,.json"
          onChange={handleChange}
          disabled={!dbReady || loading}
        />
        
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={32} style={{ animation: 'pulse 1s infinite' }} />
            <p>Ingesting file into DuckDB...</p>
            <span>Compiling schema and indexing rows</span>
          </>
        ) : (
          <>
            <UploadCloud size={32} />
            <p>{dbReady ? "Drag & drop dataset file here" : "Initializing DuckDB..."}</p>
            <span>Supports CSV, TSV, Parquet, JSON (.json)</span>
          </>
        )}
      </div>
      {error && (
        <div className="error-text" style={{ color: 'hsl(var(--error))', fontSize: '0.8rem', marginTop: '8px', textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  );
});

export default FileLoader;
