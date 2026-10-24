// Word-list files people actually have: TSV, CSV (Excel / Numbers / Google
// Sheets), JSON, and Anki's "Notes in Plain Text" export (#separator / #html /
// #columns headers, HTML fields, [sound:…] tags). Pure text in, rows out; the
// card rules (length, duplicates, sources) stay in word-books.mjs.

const SEPARATORS = Object.freeze({ tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ', colon: ':' });

// RFC 4180 rows: quoted fields may hold the delimiter, doubled quotes and line breaks.
export function parseDelimited(text, delimiter = ',') {
  const source = String(text ?? '').replace(/^﻿/, '');
  const rows = []; let row = [], field = '', quoted = false, i = 0, touched = false;
  const endField = () => { row.push(field); field = ''; touched = false; };
  const endRow = () => { endField(); if (row.some((cell) => cell.trim() !== '')) rows.push(row); row = []; };
  while (i < source.length) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') { if (source[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && !touched && field === '') { quoted = true; touched = true; i++; continue; }
    if (ch === delimiter) { endField(); i++; continue; }
    if (ch === '\r' || ch === '\n') { endRow(); i += ch === '\r' && source[i + 1] === '\n' ? 2 : 1; continue; }
    field += ch; touched = true; i++;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

// Anki writes file headers such as "#separator:tab", "#html:true",
// "#columns:Front	Back	Tags", "#guid column:1", "#notetype column:2",
// "#deck column:3", "#tags column:5". Columns there are 1-based.
export function ankiHeaders(text) {
  const headers = { separator: '', html: false, columns: [], meta: [] };
  for (const line of String(text ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.startsWith('#')) break;
    const match = /^#([a-z ]+):(.*)$/i.exec(line.trim()); if (!match) continue;
    const key = match[1].trim().toLowerCase(), value = match[2].trim();
    if (key === 'separator') headers.separator = SEPARATORS[value.toLowerCase()] ?? (value.length === 1 ? value : '');
    else if (key === 'html') headers.html = value.toLowerCase() === 'true';
    else if (key === 'columns') headers.columns = value.split(/\t|,|;/).map((name) => name.trim());
    else if (/ column$/.test(key) && Number(value) > 0) headers.meta.push(Number(value) - 1);
  }
  return headers;
}
export const isAnkiExport = (text) => /^﻿?#(separator|html|columns|notetype|deck|guid|tags)[ a-z]*:/im.test(String(text ?? '').slice(0, 2000));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// An Anki field as plain text: line breaks kept as " / ", tags and sound/image references dropped.
export function cleanAnkiField(value) {
  return String(value ?? '')
    .replace(/\[sound:[^\]]*\]/gi, '')
    .replace(/<br\s*\/?>|<\/(div|p|li)>/gi, '\n')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => code[0] === '#' ? String.fromCodePoint(parseInt(code.slice(code[1].toLowerCase() === 'x' ? 2 : 1), code[1].toLowerCase() === 'x' ? 16 : 10) || 32) : ENTITIES[code.toLowerCase()] ?? all)
    .split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ');
}

// Guess the format from the file name and the first characters.
export function detectImportFormat(text, name = '') {
  const head = String(text ?? '').replace(/^﻿/, '').trimStart();
  if (/\.json$/i.test(name) || head.startsWith('[')) return 'json';
  if (isAnkiExport(head)) return 'anki';
  if (/\.csv$/i.test(name)) return 'csv';
  const first = head.split(/\r?\n/, 1)[0] || '';
  if (!first.includes('\t') && /,/.test(first) && !/\.(tsv|txt)$/i.test(name)) return 'csv';
  return 'tsv';
}

// The first two columns that are not Anki bookkeeping (guid, note type, deck, tags).
export function defaultColumns(text, format) {
  if (format !== 'anki') return { frontColumn: 0, backColumn: 1 };
  const { meta, columns } = ankiHeaders(text);
  const named = columns.map((name) => name.toLowerCase());
  const tags = named.indexOf('tags');
  const skip = new Set([...meta, ...(tags >= 0 ? [tags] : [])]);
  const free = []; for (let i = 0; free.length < 2 && i < 12; i++) if (!skip.has(i)) free.push(i);
  return { frontColumn: free[0] ?? 0, backColumn: free[1] ?? 1 };
}

// Rows of cells for 'tsv' | 'csv' | 'anki'. `header` drops the first row (CSV/TSV with titles).
export function importRows(text, format, { header = false } = {}) {
  if (format === 'anki') {
    const headers = ankiHeaders(text);
    const body = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((line) => !line.startsWith('#')).join('\n');
    const rows = parseDelimited(body, headers.separator || '\t');
    return { rows: headers.html ? rows.map((row) => row.map(cleanAnkiField)) : rows.map((row) => row.map((cell) => cell.trim())), headers: headers.columns };
  }
  const rows = parseDelimited(text, format === 'csv' ? (sniffCsvDelimiter(text)) : '\t');
  return header ? { rows: rows.slice(1), headers: (rows[0] || []).map((cell) => cell.trim()) } : { rows, headers: [] };
}
// European spreadsheets save "CSV" with semicolons.
function sniffCsvDelimiter(text) {
  const first = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}
