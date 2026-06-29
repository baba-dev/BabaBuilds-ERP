import re

with open('app/api/dashboard/route.ts', 'r', encoding='utf-8') as f:
    code = f.read()

safe_timed_str = """  const safeTimed = async <T,>(label: string, fallback: T, op: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await op();
    } catch (err) {
      console.warn(`[Dashboard] Safe query failed ${label}:`, err instanceof Error ? err.message : String(err));
      return fallback;
    } finally {
      queryTimingsMs[label] = Number((performance.now() - startedAt).toFixed(2));
    }
  };
"""

if "const safeTimed =" not in code:
    code = code.replace("  const timed = async", safe_timed_str + "  const timed = async")

match = re.search(r'const\s+\[([\s\S]*?)\]\s*=\s*await\s*Promise\.all\(\s*\[([\s\S]*?)\]\s*\);\s*const\s+billedRevenue', code)
if not match:
    print("No match found")
    exit(1)

vars_str = match.group(1)
queries_str = match.group(2)

variables = [v.strip() for v in vars_str.split(',') if v.strip()]

# split queries safely
query_strings = []
current_query = ""
paren_count = 0
brace_count = 0
in_string = False
string_char = ''

i = 0
while i < len(queries_str):
    char = queries_str[i]
    if in_string:
        if char == string_char and queries_str[i-1] != '\\':
            in_string = False
        current_query += char
    else:
        if char in ('"', "'", "`"):
            in_string = True
            string_char = char
            current_query += char
        elif char == '(':
            paren_count += 1
            current_query += char
        elif char == ')':
            paren_count -= 1
            current_query += char
        elif char == '{':
            brace_count += 1
            current_query += char
        elif char == '}':
            brace_count -= 1
            current_query += char
        elif char == ',' and paren_count == 0 and brace_count == 0:
            if current_query.strip():
                query_strings.append(current_query.strip())
            current_query = ""
        else:
            current_query += char
    i += 1

if current_query.strip():
    query_strings.append(current_query.strip())

print(f"Vars: {len(variables)}, Queries: {len(query_strings)}")

if len(variables) == len(query_strings):
    safe_map = {
        'recentInvoices': '[]',
        'activities': '[]',
        'taxAudits': '[]',
        'taxReadinessSummary': '{ hasReturns: false, totalOpenBlockers: 0, openBlockersBySeverity: {INFO:0, WARNING:0, CRITICAL:0}, nextReturn: null, recentReturns: [] }',
        'notifications': '0',
        'fileImportFailures': '0',
    }
    
    for idx, var in enumerate(variables):
        if var in safe_map:
            # Replace timed( with safeTimed(
            q = query_strings[idx]
            q = re.sub(r'^(\s*)timed\(', r'\1safeTimed(', q)
            # Add fallback after the label string
            q = re.sub(r'safeTimed\("([^"]+)",\s*', f'safeTimed("\\1", {safe_map[var]}, ', q)
            query_strings[idx] = q

    batches = []
    batch_size = 10
    
    for i in range(0, len(variables), batch_size):
        batches.append({
            'vars': variables[i:i+batch_size],
            'queries': query_strings[i:i+batch_size]
        })
        
    replacement = ""
    for b in batches:
        vars_block = ",\n".join([f"    {v}" for v in b['vars']])
        queries_block = ",\n\n".join([f"    {q}" for q in b['queries']])
        
        replacement += f"""  const [
{vars_block}
  ] = await Promise.all([
{queries_block}
  ]);\n\n"""

    replacement += "  const billedRevenue"
    
    code = code.replace(match.group(0), replacement)
    
    with open('app/api/dashboard/route.ts', 'w', encoding='utf-8') as f:
        f.write(code)
    
    print("Patched successfully!")
else:
    print("Mismatch!")
