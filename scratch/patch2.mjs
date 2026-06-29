import fs from 'fs';

const filePath = 'app/api/dashboard/route.ts';
let code = fs.readFileSync(filePath, 'utf8');

const safeTimedStr = `  const safeTimed = async <T,>(label: string, fallback: T, op: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await op();
    } catch (err) {
      console.warn(\`[Dashboard] Safe query failed \${label}:\`, err instanceof Error ? err.message : String(err));
      return fallback;
    } finally {
      queryTimingsMs[label] = Number((performance.now() - startedAt).toFixed(2));
    }
  };
`;

if (!code.includes('const safeTimed')) {
  code = code.replace('  const timed = async', safeTimedStr + '\n  const timed = async');
}

// Create a regex to match the giant destructuring block
const regex = /const\s+\[([\s\S]*?)\]\s*=\s*await\s*Promise\.all\(\s*\[([\s\S]*?)\]\s*\);\s*const\s+billedRevenue/m;

const match = code.match(regex);
if (match) {
  const variables = match[1].split(',').map(v => v.trim()).filter(Boolean);
  
  // We need to split the queries. 
  // It's hard to split `match[2]` by comma because some queries have commas inside them.
  // We can use a parsing approach: count brackets and parentheses.
  
  const queryStrings = [];
  let currentQuery = "";
  let parenCount = 0;
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < match[2].length; i++) {
    const char = match[2][i];
    
    if (inString) {
      if (char === stringChar && match[2][i-1] !== '\\') {
        inString = false;
      }
      currentQuery += char;
    } else {
      if (char === '"' || char === "'" || char === '\`') {
        inString = true;
        stringChar = char;
        currentQuery += char;
      } else if (char === '(') {
        parenCount++;
        currentQuery += char;
      } else if (char === ')') {
        parenCount--;
        currentQuery += char;
      } else if (char === '{') {
        braceCount++;
        currentQuery += char;
      } else if (char === '}') {
        braceCount--;
        currentQuery += char;
      } else if (char === ',' && parenCount === 0 && braceCount === 0) {
        if (currentQuery.trim().length > 0) {
          queryStrings.push(currentQuery.trim());
        }
        currentQuery = "";
      } else {
        currentQuery += char;
      }
    }
  }
  if (currentQuery.trim().length > 0) {
    queryStrings.push(currentQuery.trim());
  }

  console.log("Found vars:", variables.length);
  console.log("Found queries:", queryStrings.length);
  
  if (variables.length === queryStrings.length) {
    // Modify specific queries to use safeTimed
    const safeQueriesMap = {
        'recentInvoices': '[]',
        'activities': '[]',
        'taxAudits': '[]',
        'taxReadinessSummary': 'null', // wait, taxReadinessSummary needs specific shape? It's fine to fall back to null if we handle it below. Wait, I will just return { hasReturns: false, totalOpenBlockers: 0, openBlockersBySeverity: {INFO:0, WARNING:0, CRITICAL:0}, nextReturn: null, recentReturns: [] }
        'notifications': '0',
        'fileImportFailures': '0',
    };
    
    for (let i = 0; i < variables.length; i++) {
        let v = variables[i];
        if (safeQueriesMap[v]) {
            queryStrings[i] = queryStrings[i].replace(/timed\(/, \`safeTimed(\${safeQueriesMap[v]}, \`).replace(/timed\(/, \`safeTimed(\`).replace(/\"([^"]+)\",\s*/, \`"$1", \${safeQueriesMap[v]}, \`);
        }
    }
    
    // Batching
    const batches = [];
    let currentBatchVars = [];
    let currentBatchQueries = [];
    
    const BATCH_SIZE = 8;
    
    for (let i = 0; i < variables.length; i++) {
        currentBatchVars.push(variables[i]);
        currentBatchQueries.push(queryStrings[i]);
        
        if (currentBatchVars.length >= BATCH_SIZE || i === variables.length - 1) {
            batches.push({ vars: currentBatchVars, queries: currentBatchQueries });
            currentBatchVars = [];
            currentBatchQueries = [];
        }
    }
    
    let replacement = "";
    for (let i = 0; i < batches.length; i++) {
        replacement += \`  const [
\${batches[i].vars.map(v => \`    \${v}\`).join(',\\n')}
  ] = await Promise.all([
\${batches[i].queries.map(q => \`    \${q}\`).join(',\\n')}
  ]);\\n\\n\`;
    }
    
    replacement += "  const billedRevenue";
    
    code = code.replace(match[0], replacement);
    fs.writeFileSync(filePath, code);
    console.log("Patched successfully.");
  } else {
    console.log("Mismatch! Vars:", variables.length, "Queries:", queryStrings.length);
  }
} else {
  console.log("Regex didn't match.");
}
