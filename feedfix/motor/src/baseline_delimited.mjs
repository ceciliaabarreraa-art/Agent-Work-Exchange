// Parser CSV/TSV estricto, con límites de ensayo. No usa split sobre líneas o comas.
export class FeedError extends Error {
  constructor(code) { super(code); this.name = 'FeedError'; this.code = code; }
}
export const LIMITS = Object.freeze({ bytes: 1048576, rows: 500, columns: 256 });
const encoder = new TextEncoder();

export function decodeUtf8(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > LIMITS.bytes) throw new FeedError('ARCHIVO_DEMASIADO_GRANDE_O_NO_BINARIO');
  try {
    // ignoreBOM:true conserva U+FEFF para que el serializador lo reproduzca.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { throw new FeedError('UTF8_INVALIDO'); }
}

export function parseDelimited(raw, delimiter = ',', maxRows = LIMITS.rows) {
  if (delimiter !== ',' && delimiter !== '\t') throw new FeedError('DELIMITADOR_INVALIDO');
  if (typeof raw !== 'string') throw new FeedError('TEXTO_REQUERIDO');
  if (encoder.encode(raw).length > LIMITS.bytes) throw new FeedError('ARCHIVO_DEMASIADO_GRANDE');
  if (/\p{Surrogate}/u.test(raw)) throw new FeedError('UNICODE_INVALIDO');
  if (raw.includes('\0')) throw new FeedError('NUL_NO_PERMITIDO');
  const bom = raw.startsWith('\ufeff');
  const text = bom ? raw.slice(1) : raw;
  if (!text.length) throw new FeedError('ARCHIVO_VACIO');
  let line = 1, recordLine = 1, state = 'start', field = '', cells = [], records = [];
  let firstNewline = null, endedNewline = false;
  function pushField() {
    cells.push(field); field = ''; state = 'start';
    if (cells.length > LIMITS.columns) throw new FeedError('DEMASIADAS_COLUMNAS');
  }
  function pushRecord() {
    pushField(); records.push({ line: recordLine, cells }); cells = [];
    if (records.length > maxRows + 1) throw new FeedError('DEMASIADAS_FILAS');
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else state = 'afterquote';
      } else if (c === '\r') {
        field += c; if (text[i + 1] === '\n') { field += '\n'; i++; } line++;
      } else if (c === '\n') { field += c; line++; }
      else field += c;
      endedNewline = false;
      continue;
    }
    if (c === delimiter) { pushField(); endedNewline = false; continue; }
    if (c === '\r' || c === '\n') {
      const nl = c === '\r' && text[i + 1] === '\n' ? '\r\n' : c;
      if (nl === '\r\n') i++;
      firstNewline ??= nl;
      pushRecord(); line++; recordLine = line; endedNewline = true; continue;
    }
    endedNewline = false;
    if (state === 'afterquote') throw new FeedError('CARACTER_DESPUES_DE_COMILLA');
    if (c === '"') {
      if (state !== 'start') throw new FeedError('COMILLA_EN_CAMPO_NO_ENTRECOMILLADO');
      state = 'quoted';
    } else { field += c; state = 'plain'; }
  }
  if (state === 'quoted') throw new FeedError('COMILLA_SIN_CERRAR');
  if (!endedNewline) pushRecord();
  if (!records.length || records[0].cells.every(x => x === '')) throw new FeedError('CABECERA_VACIA');
  const headers = records.shift().cells;
  const seen = new Set();
  for (const h of headers) {
    const canonical = h.trim().toLowerCase();
    if (!canonical) throw new FeedError('CABECERA_VACIA');
    if (seen.has(canonical)) throw new FeedError('CABECERA_DUPLICADA');
    seen.add(canonical);
  }
  for (const r of records) if (r.cells.length !== headers.length) throw new FeedError('COLUMNAS_INCONSISTENTES');
  return { headers, records, delimiter, bom, newline: firstNewline || '\n', terminalNewline: endedNewline };
}

export function serializeDelimited(table) {
  const { delimiter, headers, records, bom, newline, terminalNewline } = table;
  if (delimiter !== ',' && delimiter !== '\t') throw new FeedError('DELIMITADOR_INVALIDO');
  const encodeCell = value => {
    if (typeof value !== 'string') throw new FeedError('CELDA_NO_TEXTO');
    return /["\r\n]/.test(value) || value.includes(delimiter) ? '"' + value.replaceAll('"', '""') + '"' : value;
  };
  const lines = [headers, ...records.map(r => r.cells)].map(row => row.map(encodeCell).join(delimiter));
  return (bom ? '\ufeff' : '') + lines.join(newline) + (terminalNewline ? newline : '');
}

export function objectRows(table, required) {
  const indices = new Map(table.headers.map((h, i) => [h, i]));
  for (const field of required) if (!indices.has(field)) throw new FeedError('FALTA_CABECERA_' + field.toUpperCase());
  return table.records.map(record => ({ line: record.line, data: Object.fromEntries(table.headers.map((h, i) => [h, record.cells[i]])) }));
}

// Para una auditoría abierta en una planilla, nunca para alterar el feed.
export function safeAuditCell(value) {
  const text = String(value ?? '');
  return /^[\t\r\n]/.test(text) || /^[\t\r\n ]*[=+\-@]/.test(text) ? "'" + text : text;
}
export function auditCsv(headers, rows) {
  const table = { headers: headers.map(safeAuditCell), records: rows.map(row => ({cells: row.map(safeAuditCell)})), delimiter: ',', bom: false, newline: '\r\n', terminalNewline: true };
  return serializeDelimited(table);
}
