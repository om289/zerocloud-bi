import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const LOCAL_BUNDLES = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

let db = null;
let connection = null;

// Initialize DuckDB-Wasm
export async function initDuckDB() {
  if (db) return db;

  try {
    let bundle;
    try {
      // First try to load locally compiled wasm bundles
      bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
      console.log('Using local DuckDB-Wasm bundles');
    } catch (e) {
      console.warn('Failed to load local bundles, falling back to CDN jsDelivr bundles', e);
      // Fallback to jsDelivr CDN bundles if local assets fail to load
      const CDN_BUNDLES = duckdb.getJsDelivrBundles();
      bundle = await duckdb.selectBundle(CDN_BUNDLES);
    }

    const worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    console.log('DuckDB-Wasm initialized successfully!');
    return db;
  } catch (error) {
    console.error('Failed to initialize DuckDB:', error);
    throw error;
  }
}

// Get or initialize the database instance
export async function getDB() {
  if (!db) {
    await initDuckDB();
  }
  return db;
}

// Helper to convert an Apache Arrow Table into standard JSON
export function arrowTableToJSON(table) {
  if (!table || table.numRows === undefined) return { columns: [], rows: [] };
  
  const columns = table.schema.fields.map(f => f.name);
  const rows = [];
  
  for (let i = 0; i < table.numRows; i++) {
    const row = {};
    columns.forEach(col => {
      let val = table.getChild(col)?.get(i);
      // Safely serialize BigInt values to Standard Numbers
      if (typeof val === 'bigint') {
        val = Number(val);
      }
      // Handle Date values
      if (val instanceof Date) {
        val = val.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      }
      row[col] = val;
    });
    rows.push(row);
  }
  
  return { columns, rows };
}

// Get or reuse a single connection instance
export async function getConn() {
  if (connection) return connection;
  const database = await getDB();
  connection = await database.connect();
  return connection;
}

// Register a file buffer (CSV/TSV/Parquet) as a DuckDB table
export async function registerFile(file, tableName) {
  const database = await getDB();
  
  // Read file as ArrayBuffer and load into DuckDB virtual file system
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  
  await database.registerFileBuffer(file.name, buffer);
  
  const conn = await getConn();
  
  const nameLower = file.name.toLowerCase();
  const isParquet = nameLower.endsWith('.parquet');
  const isJson = nameLower.endsWith('.json');
  const isTsv = nameLower.endsWith('.tsv') || nameLower.endsWith('.tab');
  
  try {
    if (isParquet) {
      await conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${file.name}')`);
    } else if (isJson) {
      await conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_json_auto('${file.name}')`);
    } else if (isTsv) {
      await conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}', delim='\t')`);
    } else {
      // CSV (read_csv_auto will auto-detect delimiter, header, types, quotes)
      await conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}')`);
    }
    
    // Get table schema using DESCRIBE
    const schemaResult = await conn.query(`DESCRIBE ${tableName}`);
    const { rows } = arrowTableToJSON(schemaResult);
    
    // Format schema for sidebar
    const columns = rows.map(r => ({
      name: r.column_name,
      type: r.column_type,
      nullable: r.null === 'YES'
    }));
    
    return columns;
  } catch (err) {
    throw err;
  }
}

// Execute a SQL query and return performance metrics
export async function runQuery(sql) {
  const conn = await getConn();
  const startTime = performance.now();
  
  try {
    const table = await conn.query(sql);
    const executionTimeMs = performance.now() - startTime;
    const { columns, rows } = arrowTableToJSON(table);
    
    return {
      success: true,
      columns,
      rows,
      executionTimeMs: Math.round(executionTimeMs)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }
}
