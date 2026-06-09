import React, { useState, memo } from 'react';
import { Sparkles, ArrowRight, Play, FileCode } from 'lucide-react';

const NlqAssistant = memo(function NlqAssistant({ activeTable, columns, onRunQuery }) {
  const [inputText, setInputText] = useState('');
  const [compiledSql, setCompiledSql] = useState('');
  const [explanations, setExplanations] = useState([]);

  const handleTranslate = () => {
    if (!inputText.trim() || !activeTable) return;

    // Helper to compute edit distance locally
    const getLevenshteinDistance = (a, b) => {
      const tmp = [];
      let i, j, alen = a.length, blen = b.length;
      if (alen === 0) return blen;
      if (blen === 0) return alen;
      for (i = 0; i <= alen; i++) tmp[i] = [i];
      for (j = 0; j <= blen; j++) tmp[0][j] = j;
      for (i = 1; i <= alen; i++) {
        for (j = 1; j <= blen; j++) {
          tmp[i][j] = Math.min(
            tmp[i - 1][j] + 1,
            tmp[i][j - 1] + 1,
            tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
          );
        }
      }
      return tmp[alen][blen];
    };

    const handleTranslate = () => {
      if (!inputText.trim() || !activeTable) return;

      let query = inputText.toLowerCase().trim();
      const explanationList = [];

      // Local spelling autocorrect mapping columns
      const queryWords = query.split(/[\s,()=+\-*/]+/);
      queryWords.forEach(word => {
        if (word.length < 3) return;
        // Skip common SQL syntax words
        if (['show', 'select', 'from', 'where', 'group', 'order', 'limit', 'count', 'sum', 'average', 'avg', 'min', 'max'].includes(word)) return;

        // Find closest column name matching within Levenshtein edit distance <= 2
        let closestCol = null;
        let minDistance = 3; // threshold of max 2 corrections

        columns.forEach(col => {
          const colNameLower = col.name.toLowerCase();
          const dist = getLevenshteinDistance(word, colNameLower);
          if (dist < minDistance) {
            minDistance = dist;
            closestCol = col.name;
          }
        });

        if (closestCol && closestCol.toLowerCase() !== word) {
          // Replace misspelled word with exact column name
          const regex = new RegExp(`\\b${word}\\b`, 'g');
          query = query.replace(regex, closestCol.toLowerCase());
          explanationList.push(`Autocorrected spelling: "${word}" → "${closestCol}"`);
        }
      });

      let selectFields = [];
      let whereFilters = [];
      let orderBy = '';
      let limit = 50;
      let groupBy = [];

      // 1. Detect Aggregations
      let isAggregated = false;
      let aggFunction = '';
      let aggColumn = '';

      const countTriggers = ['count', 'how many', 'number of', 'total count'];
      const sumTriggers = ['sum', 'total amount', 'cumulative', 'sum of'];
      const avgTriggers = ['average', 'mean', 'avg', 'average of'];
      const maxTriggers = ['max', 'highest', 'maximum', 'most', 'largest'];
      const minTriggers = ['min', 'lowest', 'minimum', 'least', 'smallest'];

      let matchedAgg = null;
      if (countTriggers.some(t => query.includes(t))) matchedAgg = 'COUNT';
      else if (sumTriggers.some(t => query.includes(t))) matchedAgg = 'SUM';
      else if (avgTriggers.some(t => query.includes(t))) matchedAgg = 'AVG';
      else if (maxTriggers.some(t => query.includes(t))) matchedAgg = 'MAX';
      else if (minTriggers.some(t => query.includes(t))) matchedAgg = 'MIN';

      // Try to find target column for aggregation
      if (matchedAgg) {
        isAggregated = true;
        aggFunction = matchedAgg;

        // Look for a numeric column mentioned near the agg trigger
        const numericCol = columns.find(c =>
          query.includes(c.name.toLowerCase()) &&
          (c.type.includes('INT') || c.type.includes('DOUBLE') || c.type.includes('FLOAT') || c.type.includes('NUMERIC'))
        );

        if (numericCol) {
          aggColumn = numericCol.name;
          explanationList.push(`Detected aggregation: ${matchedAgg} of column "${numericCol.name}"`);
        } else {
          // Fallback
          aggColumn = '*';
          explanationList.push(`Detected aggregation: ${matchedAgg} (defaulted to count rows)`);
        }
      }

      // 2. Identify dimensions & columns mentioned in query
      const mentionedColumns = columns.filter(col => {
        // Check if word is in query
        const colNameLower = col.name.toLowerCase();
        // Match exact boundary or inside text
        return query.includes(colNameLower);
      });

      mentionedColumns.forEach(col => {
        if (col.name !== aggColumn) {
          selectFields.push(col.name);
        }
      });

      if (selectFields.length > 0) {
        explanationList.push(`Identified query columns: ${selectFields.map(f => `"${f}"`).join(', ')}`);
        if (isAggregated) {
          groupBy = [...selectFields];
          explanationList.push(`Auto-grouping by dimensions: ${groupBy.map(g => `"${g}"`).join(', ')}`);
        }
      }

      // 3. Filters Parsing
      // Look for patterns like "where <column> is <value>" or "<column> = <value>" or "<column> contains <value>"
      columns.forEach(col => {
        const colNameLower = col.name.toLowerCase();
        if (query.includes(colNameLower)) {
          // Look for values matching string columns or numbers
          // Simple search for strings after keywords: 'is', '=', 'equals', 'like'
          const regexes = [
            new RegExp(`${colNameLower}\\s+(?:is|=)\\s+([a-zA-Z0-9_-]+)`, 'i'),
            new RegExp(`${colNameLower}\\s+contains\\s+([a-zA-Z0-9_-]+)`, 'i'),
            new RegExp(`${colNameLower}\\s+(?:greater\\s+than|>)\\s+([0-9.]+)`, 'i'),
            new RegExp(`${colNameLower}\\s+(?:less\\s+than|<)\\s+([0-9.]+)`, 'i')
          ];

          let filterAdded = false;

          // Try regex match
          const matchIs = query.match(new RegExp(`${colNameLower}\\s+(?:is|=|equals)\\s+['"]?([a-zA-Z0-9_\\s\\.-]+)['"]?`, 'i'));
          if (matchIs && matchIs[1]) {
            const val = matchIs[1].trim();
            const isString = col.type.includes('VARCHAR') || col.type.includes('TEXT') || isNaN(Number(val));
            const formattedVal = isString ? `'${val}'` : val;
            whereFilters.push(`${col.name} = ${formattedVal}`);
            explanationList.push(`Applied filter: ${col.name} matches "${val}"`);
            filterAdded = true;
          }

          if (!filterAdded) {
            const matchContains = query.match(new RegExp(`${colNameLower}\\s+(?:contains|like)\\s+['"]?([a-zA-Z0-9_\\s\\.-]+)['"]?`, 'i'));
            if (matchContains && matchContains[1]) {
              const val = matchContains[1].trim();
              whereFilters.push(`${col.name} LIKE '%${val}%'`);
              explanationList.push(`Applied filter: ${col.name} contains "${val}"`);
              filterAdded = true;
            }
          }

          if (!filterAdded) {
            const matchGt = query.match(new RegExp(`${colNameLower}\\s*(?:>|greater\\s+than)\\s*([0-9.]+)`, 'i'));
            if (matchGt && matchGt[1]) {
              whereFilters.push(`${col.name} > ${matchGt[1]}`);
              explanationList.push(`Applied filter: ${col.name} greater than ${matchGt[1]}`);
              filterAdded = true;
            }
          }

          if (!filterAdded) {
            const matchLt = query.match(new RegExp(`${colNameLower}\\s*(?:<|less\\s+than)\\s*([0-9.]+)`, 'i'));
            if (matchLt && matchLt[1]) {
              whereFilters.push(`${col.name} < ${matchLt[1]}`);
              explanationList.push(`Applied filter: ${col.name} less than ${matchLt[1]}`);
              filterAdded = true;
            }
          }
        }
      });

      // 4. Order By parsing
      const orderCol = columns.find(c => query.includes(`by ${c.name.toLowerCase()}`) || query.includes(`sort by ${c.name.toLowerCase()}`));
      if (orderCol) {
        const isAsc = query.includes('asc') || query.includes('lowest') || query.includes('ascending');
        orderBy = `ORDER BY ${orderCol.name} ${isAsc ? 'ASC' : 'DESC'}`;
        explanationList.push(`Sorting results by: ${orderCol.name} (${isAsc ? 'ascending' : 'descending'})`);
      } else if (aggColumn && aggColumn !== '*' && isAggregated) {
        // Sort by aggregate column descending by default if aggregate exists
        orderBy = `ORDER BY ${aggFunction.toLowerCase()}_${aggColumn} DESC`;
        explanationList.push(`Default sorting: aggregated metric descending`);
      }

      // 5. Limit parsing
      const limitMatch = query.match(/(?:limit|top|first)\s+([0-9]+)/i);
      if (limitMatch && limitMatch[1]) {
        limit = parseInt(limitMatch[1], 10);
        explanationList.push(`Applied row limit: ${limit}`);
      }

      // Assemble SQL
      let selectClause = 'SELECT ';
      if (isAggregated) {
        const selectParts = [];
        selectFields.forEach(f => selectParts.push(f));

        const alias = aggColumn === '*' ? 'count_rows' : `${aggFunction.toLowerCase()}_${aggColumn}`;
        selectParts.push(`${aggFunction}(${aggColumn}) AS ${alias}`);
        selectClause += selectParts.join(', ');
      } else if (selectFields.length > 0) {
        selectClause += selectFields.join(', ');
      } else {
        selectClause += '*';
      }

      let sql = `${selectClause}\nFROM ${activeTable}`;
      if (whereFilters.length > 0) {
        sql += `\nWHERE ${whereFilters.join(' AND ')}`;
      }
      if (groupBy.length > 0) {
        sql += `\nGROUP BY ${groupBy.join(', ')}`;
      }
      if (orderBy) {
        sql += `\n${orderBy}`;
      }
      sql += `\nLIMIT ${limit};`;

      setCompiledSql(sql);
      setExplanations(explanationList);
    };

    return (
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
        <div className="nlq-container">
          <Sparkles size={20} style={{ color: 'hsl(var(--accent-secondary))' }} />
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask in English (e.g. 'show count of characters grouped by publisher where alignment is good')"
            className="nlq-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTranslate();
            }}
          />
          <button className="btn-run" onClick={handleTranslate} style={{ height: '34px', padding: '0 16px' }} id="btn-translate-nlq">
            <span>Analyze</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px', flex: 1 }}>
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
            <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '6px', fontFamily: 'Outfit' }}>
              NLP Parsing Heuristics
            </h4>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
              {explanations.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-dark))', fontStyle: 'italic' }}>
                  Heuristic mapping tokens will display here once parsed.
                </span>
              ) : (
                explanations.map((exp, idx) => (
                  <div key={idx} style={{ fontSize: '0.75rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'hsl(var(--accent-secondary))' }} />
                    <span>{exp}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '0.85rem', display: 'flex', gap: '6px', alignItems: 'center', fontFamily: 'Outfit' }}>
                <FileCode size={14} style={{ color: 'hsl(var(--accent))' }} />
                <span>Compiled SQL Output</span>
              </h4>
              <button
                className="btn-run"
                onClick={() => onRunQuery(compiledSql)}
                disabled={!compiledSql}
                style={{ height: '28px', fontSize: '0.75rem', padding: '0 12px' }}
                id="btn-run-nlq-sql"
              >
                <Play size={10} fill="#fff" />
                <span>Execute SQL</span>
              </button>
            </div>
            <pre className="generated-sql-block" style={{ flex: 1, minHeight: '120px' }}>
              {compiledSql || '-- SQL statement will generate here.'}
            </pre>
          </div>
        </div>
      </div>
    );
  });

export default NlqAssistant;
