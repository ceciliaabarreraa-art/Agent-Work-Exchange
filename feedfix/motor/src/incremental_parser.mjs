// Prototipo sintético: parsing CSV/TSV incremental con estado serializable.
// No recibe red, credenciales ni archivos privados; el coordinador debe ser confiable.
import { FeedError, LIMITS } from './delimited.mjs';
export const CHUNK_BYTES = 4096;
export const MAX_RECORD_CODE_UNITS = 8192; // límite adicional respecto de la versión monolítica

export function newParser(delimiter = ',') {
  if (delimiter !== ',' && delimiter !== '\t') throw new FeedError('DELIMITADOR_INVALIDO');
  return {v:1, delimiter, mode:'start', field:'', cells:[], line:1, recordLine:1,
    recordUnits:0, rows:0, headers:null, bom:false, atStart:true, totalBytes:0,
    pendingUtf8:[], pendingCR:'', firstNewline:null, endedNewline:false, done:false};
}

// Guardar como máximo tres bytes incompletos entre invocaciones y validar el resto con
// TextDecoder fatal. El BOM se conserva explícitamente; no se reparan bytes inválidos.
function utf8Partition(bytes, final) {
  if (final || !bytes.length) return [bytes, new Uint8Array()];
  let p = bytes.length - 1;
  while (p >= 0 && (bytes[p] & 0xC0) === 0x80) p--;
  if (p < 0) return [bytes, new Uint8Array()]; // inválido: fatal decoder lo rechazará
  const b = bytes[p];
  const n = b < 0x80 ? 1 : ((b & 0xE0) === 0xC0 ? 2 : ((b & 0xF0) === 0xE0 ? 3 : ((b & 0xF8) === 0xF0 ? 4 : 1)));
  return bytes.length - p < n ? [bytes.subarray(0,p), bytes.subarray(p)] : [bytes, new Uint8Array()];
}

export function parseChunk(saved, bytes, final = false) {
  if (!saved || saved.v !== 1 || saved.done || !(bytes instanceof Uint8Array) || bytes.length > CHUNK_BYTES || typeof final !== 'boolean') throw new FeedError('BLOQUE_INVALIDO');
  // Clonar: quien ejecuta cada invocación persiste exactamente el nuevo estado y registros.
  const s = structuredClone(saved), emitted = [];
  s.totalBytes += bytes.length;
  if (s.totalBytes > LIMITS.bytes) throw new FeedError('ARCHIVO_DEMASIADO_GRANDE');
  const joined = new Uint8Array(s.pendingUtf8.length + bytes.length);
  joined.set(s.pendingUtf8); joined.set(bytes,s.pendingUtf8.length);
  const [whole,carry] = utf8Partition(joined,final);
  s.pendingUtf8 = Array.from(carry);
  let text;
  try { text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(whole); }
  catch { throw new FeedError('UTF8_INVALIDO'); }
  if (s.atStart && text.length) {
    s.bom = text.startsWith('\ufeff');
    if (s.bom) text = text.slice(1);
    s.atStart = false;
  }
  function pushField() {
    s.cells.push(s.field); s.field=''; s.mode='start';
    if (s.cells.length > LIMITS.columns) throw new FeedError('DEMASIADAS_COLUMNAS');
  }
  function pushRecord() {
    pushField();
    if (s.headers === null) {
      if (s.cells.every(x => x === '')) throw new FeedError('CABECERA_VACIA');
      const seen = new Set();
      for (const h of s.cells) {
        const k=h.trim().toLowerCase();
        if (!k) throw new FeedError('CABECERA_VACIA');
        if (seen.has(k)) throw new FeedError('CABECERA_DUPLICADA');
        seen.add(k);
      }
      s.headers=s.cells;
    } else {
      if (s.cells.length !== s.headers.length) throw new FeedError('COLUMNAS_INCONSISTENTES');
      s.rows++;
      if (s.rows > LIMITS.rows) throw new FeedError('DEMASIADAS_FILAS');
      emitted.push({line:s.recordLine,cells:s.cells});
    }
    s.cells=[]; s.recordUnits=0;
  }
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c === '\0') throw new FeedError('NUL_NO_PERMITIDO');
    if (s.pendingCR) {
      const pending=s.pendingCR; s.pendingCR='';
      if (c === '\n') {
        if (pending === 'quoted') { s.field+='\n'; s.recordUnits++; }
        else if (pending === 'first-record') s.firstNewline='\r\n';
        continue;
      }
    }
    s.recordUnits++;
    if (s.recordUnits > MAX_RECORD_CODE_UNITS) throw new FeedError('REGISTRO_DEMASIADO_LARGO_PARA_MODO_INCREMENTAL');
    if (s.mode === 'quoted') {
      if (c === '"') s.mode='quote-pending';
      else if (c === '\r') { s.field+=c; s.line++; s.pendingCR='quoted'; }
      else if (c === '\n') { s.field+=c; s.line++; }
      else s.field+=c;
      s.endedNewline=false; continue;
    }
    if (s.mode === 'quote-pending') {
      if (c === '"') { s.field+='"'; s.mode='quoted'; s.endedNewline=false; continue; }
      s.mode='afterquote';
    }
    if (c === s.delimiter) { pushField(); s.endedNewline=false; continue; }
    if (c === '\r' || c === '\n') {
      const first=s.firstNewline === null;
      if (first) s.firstNewline=c;
      pushRecord(); s.line++; s.recordLine=s.line; s.endedNewline=true;
      if (c === '\r') s.pendingCR=first ? 'first-record' : 'record';
      continue;
    }
    s.endedNewline=false;
    if (s.mode === 'afterquote') throw new FeedError('CARACTER_DESPUES_DE_COMILLA');
    if (c === '"') {
      if (s.mode !== 'start') throw new FeedError('COMILLA_EN_CAMPO_NO_ENTRECOMILLADO');
      s.mode='quoted';
    } else { s.field+=c; s.mode='plain'; }
  }
  if (final) {
    if (s.atStart || (s.bom && s.totalBytes===3)) throw new FeedError('ARCHIVO_VACIO');
    if (s.mode === 'quoted') throw new FeedError('COMILLA_SIN_CERRAR');
    if (s.mode === 'quote-pending') s.mode='afterquote';
    if (!s.endedNewline) pushRecord();
    if (s.headers === null) throw new FeedError('CABECERA_VACIA');
    s.done=true; s.pendingCR='';
  }
  return {state:s,records:emitted};
}

export function tableMeta(state) {
  if (!state?.done) throw new FeedError('PARSER_NO_FINALIZADO');
  return {headers:state.headers,delimiter:state.delimiter,bom:state.bom,
    newline:state.firstNewline || '\n',terminalNewline:state.endedNewline};
}
