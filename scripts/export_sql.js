import fs from 'node:fs';

const backupPath = './data/backup_neon.json';
if (!fs.existsSync(backupPath)) {
  console.error('File data/backup_neon.json không tồn tại.');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (Array.isArray(val) || typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

let sql = `-- Backup generated on ${backup.timestamp}\n-- Total tables: ${backup.tablesCount}\n\n`;

for (const tableName of Object.keys(backup.data)) {
  const rows = backup.data[tableName];
  sql += `-- Table: ${tableName} (${rows.length} rows)\n`;
  if (!rows || rows.length === 0) {
    sql += `\n`;
    continue;
  }

  const cols = Object.keys(rows[0]);
  const colsStr = cols.map(c => `"${c}"`).join(', ');

  for (const row of rows) {
    const valsStr = cols.map(c => escapeSql(row[c])).join(', ');
    sql += `INSERT INTO "${tableName}" (${colsStr}) VALUES (${valsStr}) ON CONFLICT DO NOTHING;\n`;
  }
  sql += `\n`;
}

fs.writeFileSync('./data/backup_neon.sql', sql, 'utf-8');
console.log('✅ Generated data/backup_neon.sql successfully!');
