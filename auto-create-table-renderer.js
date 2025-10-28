const { ipcRenderer } = require('electron');
const XLSX = require('xlsx');

let workbook = null;
let sheetDataMap = {}; // { sheetName: 2D array }
let headersMap = {};   // { sheetName: headers[] }
let sheetNames = [];

const LAST_MAP_KEY = 'autoCreateTable:lastMapping';

function $(id) { return document.getElementById(id); }

function fillSelectOptions(select, options) {
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '选择页签与列';
  select.appendChild(placeholder);
  options.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    select.appendChild(opt);
  });
}

function escapeSqlLiteral(str) {
  if (str == null) return '';
  return String(str).replace(/'/g, "''");
}

function uniqueNonEmpty(values) {
  const set = new Set();
  values.forEach(v => {
    const val = (v == null ? '' : String(v).trim());
    if (val) set.add(val);
  });
  return Array.from(set);
}

function getColumnValuesByHeaderFromSheet(headerName, sheetName) {
  if (!headerName || !sheetName) return [];
  const headers = headersMap[sheetName] || [];
  const data = sheetDataMap[sheetName] || [];
  const idx = headers.indexOf(headerName);
  if (idx === -1) return [];
  return (data.slice(1) || []).map(row => row[idx]);
}

function isValidPeriod(str) {
  if (!str) return false;
  const s = String(str).trim();
  if (!/^\d{6}$/.test(s)) return false;
  const y = parseInt(s.slice(0,4), 10);
  const m = parseInt(s.slice(4,6), 10);
  return y >= 1900 && m >= 1 && m <= 12;
}

function parsePeriod(str) {
  const s = String(str).trim();
  if (!isValidPeriod(s)) return null;
  return { year: parseInt(s.slice(0,4), 10), month: parseInt(s.slice(4,6), 10) };
}

function fmtPeriod(year, month) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  return `${y}${m}`;
}

function nextMonth({ year, month }) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function lessThan(a, b) {
  return a.year * 100 + a.month < b.year * 100 + b.month;
}

function buildSqlPreview() {
  const schemaSheet = $('schemaSheet')?.value || sheetNames[0];
  const tableSheet = $('tableSheet')?.value || sheetNames[0];
  const columnSheet = $('columnSheet')?.value || sheetNames[0];
  const typeSheet = $('typeSheet')?.value || sheetNames[0];
  const commentSheet = $('commentSheet')?.value || sheetNames[0];
  const tableCommentSheet = $('tableCommentSheet')?.value || sheetNames[0];

  const schemaCol = $('schemaCol').value;
  const tableCol = $('tableCol').value;
  const columnCol = $('columnCol').value;
  const typeCol = $('typeCol').value;
  const commentCol = $('commentCol').value;
  const distributeInput = $('distributeKeyInput').value || '';
  const partitionMin = ($('partitionMinInput')?.value || '').trim();
  const partitionMax = ($('partitionMaxInput')?.value || '').trim();
  const tableCommentCol = $('tableCommentCol').value;

  const schemaVals = getColumnValuesByHeaderFromSheet(schemaCol, schemaSheet);
  const tableVals = getColumnValuesByHeaderFromSheet(tableCol, tableSheet);
  const tableCommentVals = getColumnValuesByHeaderFromSheet(tableCommentCol, tableCommentSheet);

  const schemaU = uniqueNonEmpty(schemaVals);
  const tableU = uniqueNonEmpty(tableVals);
  const tableCommentU = uniqueNonEmpty(tableCommentVals);

  const warn = [];
  if (schemaU.length > 1) warn.push(`SCHEMA存在多个唯一值：${schemaU.join(', ')}`);
  if (tableU.length > 1) warn.push(`表名存在多个唯一值：${tableU.join(', ')}`);

  const schema = schemaU[0] || '';
  const table = tableU[0] || '';
  const tableComment = tableCommentU[0] || '';

  // 列定义对齐并去重
  const colVals = getColumnValuesByHeaderFromSheet(columnCol, columnSheet);
  const typeVals = getColumnValuesByHeaderFromSheet(typeCol, typeSheet);
  const commentVals = getColumnValuesByHeaderFromSheet(commentCol, commentSheet);
  const colMap = new Map();
  const maxLen = Math.max(colVals.length, typeVals.length, commentVals.length);
  for (let i = 0; i < maxLen; i++) {
    const name = (colVals[i] == null ? '' : String(colVals[i]).trim());
    if (!name) continue;
    const type = (typeVals[i] == null ? '' : String(typeVals[i]).trim());
    const comment = (commentVals[i] == null ? '' : String(commentVals[i]).trim());
    if (!colMap.has(name)) {
      colMap.set(name, { type, comment });
    }
  }

  const columnDefs = Array.from(colMap.entries()).map(([name, v]) => `  ${name} ${v.type}`).join(',\n');

  let sql = '';
  if (schema) sql += `SET SEARCH_PATH = ${schema};\n`;
  if (schema && table) {
    sql += `CREATE TABLE ${schema}.${table} (\n`;
    sql += columnDefs + '\n';
    sql += `) WITH(ORIENTATION = COLUMN, COMPRESSION = LOW, COLVERSION = 2.0, ENABLE_DELTA = FALSE)\n`;
    const keys = distributeInput.split(',').map(s => String(s).trim()).filter(Boolean);
    if (keys.length > 0) {
      sql += `DISTRIBUTE BY HASH(${keys.join(', ')})\n`;
    } else {
      sql += `DISTRIBUTE BY ROUNDROBIN\n`;
    }

    // 判定分区是否有效，用于控制 TO GROUP 是否加分号
    let hasPartition = false;
    let pMin = null, pMax = null;
    if (partitionMin && partitionMax) {
      pMin = parsePeriod(partitionMin);
      pMax = parsePeriod(partitionMax);
      if (!pMin || !pMax) {
        warn.push('分区值格式需为YYYYMM，例如202501');
      } else if (!lessThan(pMin, pMax)) {
        warn.push('最小分区值需小于最大分区值');
      } else {
        hasPartition = true;
      }
    }

    sql += `TO GROUP \"LC_DW1\"${hasPartition ? '\n' : ';\n'}`;

    if (hasPartition) {
      const lines = [];
      // 固定最小分区名 P190001，小于最小分区值
      lines.push(`  PARTITION P190001 VALUES LESS THAN(${fmtPeriod(pMin.year, pMin.month)}) TABLESPACE PG_DEFAULT,`);
      // 中间按月分区：PYYYYMM < nextMonth
      let cur = { year: pMin.year, month: pMin.month };
      while (lessThan(cur, pMax)) {
        const nxt = nextMonth(cur);
        const curStr = fmtPeriod(cur.year, cur.month);
        const nxtStr = fmtPeriod(nxt.year, nxt.month);
        lines.push(`  PARTITION P${curStr} VALUES LESS THAN(${nxtStr}) TABLESPACE PG_DEFAULT,`);
        cur = nxt;
      }
      // 固定最大分区名 P471212，对应 MAXVALUE
      lines.push(`  PARTITION P471212 VALUES LESS THAN(MAXVALUE) TABLESPACE PG_DEFAULT`);
      sql += `PARTITION BY RANGE(PERIOD_ID)\n(\n${lines.join('\n')}\n);\n`;
    }
  }

  if (schema && table && tableComment) {
    sql += `COMMENT ON TABLE ${schema}.${table} IS '${escapeSqlLiteral(tableComment)}' ;\n`;
  }

  // 列注释
  for (const [name, v] of colMap.entries()) {
    if (v.comment) {
      sql += `COMMENT ON COLUMN ${schema}.${table}.${name} IS '${escapeSqlLiteral(v.comment)}' ;\n`;
    }
  }

  $('sqlPreview').textContent = sql || '请先选择映射文件并配置列映射';
  if (colVals.length !== typeVals.length || colVals.length !== commentVals.length) {
    warn.push('不同Sheet行数不一致，已按索引对齐');
  }
  $('mapWarn').textContent = warn.join('；');
}

function populateSheetAndHeaderSelects() {
  const sheetSelectIds = ['schemaSheet','tableSheet','columnSheet','typeSheet','commentSheet','tableCommentSheet'];
  const headerSelectMap = {
    schemaSheet: 'schemaCol',
    tableSheet: 'tableCol',
    columnSheet: 'columnCol',
    typeSheet: 'typeCol',
    commentSheet: 'commentCol',
    tableCommentSheet: 'tableCommentCol'
  };
  sheetSelectIds.forEach(id => fillSelectOptions($(id), sheetNames));
  sheetSelectIds.forEach(sheetId => {
    const sheetName = $(sheetId).value || sheetNames[0];
    const headerId = headerSelectMap[sheetId];
    fillSelectOptions($(headerId), headersMap[sheetName] || []);
  });
}

function readLastMapping() {
  try {
    const raw = localStorage.getItem(LAST_MAP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveCurrentMapping() {
  try {
    const data = {
      schema: { sheet: $('schemaSheet')?.value || '', col: $('schemaCol')?.value || '' },
      table: { sheet: $('tableSheet')?.value || '', col: $('tableCol')?.value || '' },
      column: { sheet: $('columnSheet')?.value || '', col: $('columnCol')?.value || '' },
      type: { sheet: $('typeSheet')?.value || '', col: $('typeCol')?.value || '' },
      comment: { sheet: $('commentSheet')?.value || '', col: $('commentCol')?.value || '' },
      tableComment: { sheet: $('tableCommentSheet')?.value || '', col: $('tableCommentCol')?.value || '' }
    };
    localStorage.setItem(LAST_MAP_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('保存映射选择失败', e);
  }
}

function applyLastMapping() {
  const last = readLastMapping();
  if (!last) return;
  const pairs = [
    { sheetId: 'schemaSheet', colId: 'schemaCol', key: 'schema' },
    { sheetId: 'tableSheet', colId: 'tableCol', key: 'table' },
    { sheetId: 'columnSheet', colId: 'columnCol', key: 'column' },
    { sheetId: 'typeSheet', colId: 'typeCol', key: 'type' },
    { sheetId: 'commentSheet', colId: 'commentCol', key: 'comment' },
    { sheetId: 'tableCommentSheet', colId: 'tableCommentCol', key: 'tableComment' }
  ];
  pairs.forEach(p => {
    const wantedSheet = last[p.key]?.sheet;
    if (wantedSheet && sheetNames.includes(wantedSheet)) {
      $(p.sheetId).value = wantedSheet;
      const headers = headersMap[wantedSheet] || [];
      fillSelectOptions($(p.colId), headers);
      const wantedCol = last[p.key]?.col;
      if (wantedCol && headers.includes(wantedCol)) {
        $(p.colId).value = wantedCol;
      }
    }
  });
}

// 统一控制映射区下拉启用/禁用
function setMappingSelectsDisabled(disabled) {
  const ids = [
    'schemaSheet','schemaCol',
    'tableSheet','tableCol',
    'columnSheet','columnCol',
    'typeSheet','typeCol',
    'commentSheet','commentCol',
    'tableCommentSheet','tableCommentCol'
  ];
  ids.forEach(id => { const el = $(id); if (el) el.disabled = disabled; });
}

async function handleSelectExcel() {
  try {
    const result = await ipcRenderer.invoke('select-excel-file');
    if (!result || !result.success) { setMappingSelectsDisabled(true); return; }
    const filePath = result.path;
    $('excelPath').value = filePath;

    workbook = XLSX.readFile(filePath);
    sheetNames = workbook.SheetNames || [];
    sheetDataMap = {};
    headersMap = {};
    sheetNames.forEach(name => {
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      sheetDataMap[name] = data;
      headersMap[name] = (data[0] || []).map(h => String(h || ''));
    });
    if (!sheetNames.length) {
      $('excelInfo').textContent = '文件为空或无法解析';
      setMappingSelectsDisabled(true);
      return;
    }
    const info = sheetNames.map(n => `${n}：行数 ${Math.max((sheetDataMap[n]?.length || 1) - 1, 0)}`).join('，');
    $('excelInfo').textContent = `工作表：${info}`;

    populateSheetAndHeaderSelects();
    applyLastMapping();
    buildSqlPreview();
    setMappingSelectsDisabled(false);
  } catch (error) {
    $('excelInfo').textContent = `读取失败：${error.message}`;
    console.error(error);
    setMappingSelectsDisabled(true);
  }
}

function onMappingChange() { saveCurrentMapping(); buildSqlPreview(); }

async function exportSql() {
  const sql = $('sqlPreview').textContent || '';
  const schemaSheet = $('schemaSheet')?.value || sheetNames[0];
  const tableSheet = $('tableSheet')?.value || sheetNames[0];
  const schema = $('schemaCol').value ? uniqueNonEmpty(getColumnValuesByHeaderFromSheet($('schemaCol').value, schemaSheet))[0] : '';
  const table = $('tableCol').value ? uniqueNonEmpty(getColumnValuesByHeaderFromSheet($('tableCol').value, tableSheet))[0] : '';
  const defaultName = (schema && table) ? `${schema}.${table}.sql` : 'create_table.sql';
  const result = await ipcRenderer.invoke('save-sql-file', { defaultName, content: sql });
  if (result && result.success) {
    $('excelInfo').textContent = `已保存到：${result.path}`;
  }
}

function wireTitlebar() {
  $('autoCreateMinBtn').addEventListener('click', () => {
    ipcRenderer.invoke('auto-create-window-minimize');
  });
  $('autoCreateMaxBtn').addEventListener('click', () => {
    ipcRenderer.invoke('auto-create-window-maximize');
  });
  $('autoCreateCloseBtn').addEventListener('click', () => {
    ipcRenderer.invoke('close-auto-create-window');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireTitlebar();
  $('selectExcelBtn').addEventListener('click', handleSelectExcel);
  ['schemaCol','tableCol','columnCol','typeCol','commentCol','tableCommentCol']
    .forEach(id => $(id)?.addEventListener('change', onMappingChange));
  ['schemaSheet','tableSheet','columnSheet','typeSheet','commentSheet','tableCommentSheet']
    .forEach(id => $(id)?.addEventListener('change', () => {
      // 切换Sheet时联动对应列头选项
      const map = {
        schemaSheet: 'schemaCol',
        tableSheet: 'tableCol',
        columnSheet: 'columnCol',
        typeSheet: 'typeCol',
        commentSheet: 'commentCol',
        tableCommentSheet: 'tableCommentCol'
      };
      const headerId = map[id];
      const sheetName = $(id).value;
      fillSelectOptions($(headerId), headersMap[sheetName] || []);
      saveCurrentMapping();
      buildSqlPreview();
    }));
  $('distributeKeyInput').addEventListener('input', onMappingChange);
  $('partitionMinInput').addEventListener('input', onMappingChange);
  $('partitionMaxInput').addEventListener('input', onMappingChange);
  $('exportSqlBtn').addEventListener('click', exportSql);
  // 初始：禁用所有映射下拉（与HTML的disabled保持一致）
  setMappingSelectsDisabled(true);
});