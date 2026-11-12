import { FeedError, parseDelimited, serializeDelimited, objectRows, auditCsv } from './delimited.mjs';

export const ENGINE_VERSION = '0.3.0-synthetic';
const RULE_A = 'CONDITION_CANONICAL_V1';
const allowedAvailability = new Set(['in_stock','out_of_stock','preorder','backorder']);
const allowedCondition = new Set(['new','used','refurbished']);
const actions = {
  GTIN_INVALID_CHECK_DIGIT:'Pedir GTIN asignado o evidencia aplicable',
  GTIN_INVALID_FORMAT:'Pedir GTIN asignado o evidencia aplicable',
  PRICE_MISSING:'Pedir precio de la variante y fuente autorizada',
  PRICE_INVALID_FORMAT:'Pedir precio de la variante y fuente autorizada',
  DUPLICATE_ID:'Pedir mapeo verificado sin renumerar ni eliminar',
  AVAILABILITY_AMBIGUOUS:'Pedir disponibilidad concreta y fuente',
  AVAILABILITY_MISSING:'Pedir disponibilidad concreta y fuente',
  ID_MISSING:'Pedir ID estable sin inventarlo',
  CONDITION_UNKNOWN:'Pedir condición válida y evidencia aplicable',
  SOURCE_DUPLICATE:'Resolver las fuentes duplicadas de la misma variante',
  SOURCE_SCOPE_MISMATCH:'Confirmar variante, mercado y moneda de la fuente',
  SOURCE_NOT_FRESH:'Renovar la fuente autorizada',
  APPROVAL_REQUIRED:'Confirmar autorización del campo y vigencia del alcance',
  EVIDENCE_MISSING_OR_DUPLICATE:'Aportar una sola evidencia de página y checkout para la variante',
  EVIDENCE_NOT_FRESH:'Renovar la evidencia de página y checkout',
  PRICE_SOURCE_INVALID:'Aportar precio válido y autorizado en la moneda del encargo',
  PRICE_EVIDENCE_MISMATCH:'Conciliar precio de fuente, página y checkout',
  AVAILABILITY_SOURCE_INVALID:'Aportar disponibilidad válida y autorizada',
  AVAILABILITY_EVIDENCE_MISMATCH:'Conciliar disponibilidad de fuente y evidencia'
};

// Prueba matemática GS1: no demuestra asignación al producto ni autenticidad.
export function validGtin(gtin) {
  if (!/^\d+$/.test(gtin) || ![8,12,13,14].includes(gtin.length)) return false;
  let sum = 0, weight = 3;
  for (let i = gtin.length - 2; i >= 0; i--) { sum += Number(gtin[i]) * weight; weight = weight === 3 ? 1 : 3; }
  return (10 - (sum % 10)) % 10 === Number(gtin[gtin.length - 1]);
}
function validPrice(price, currency) {
  if (typeof price !== 'string' || !/^(0|[1-9]\d{0,11})\.\d{2} [A-Z]{3}$/.test(price)) return false;
  const [num, unit] = price.split(' ');
  return unit === currency && /[1-9]/.test(num);
}
function isIsoSecond(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s)) return false;
  const n = Date.parse(s);
  return Number.isFinite(n) && new Date(n).toISOString() === s.replace('Z', '.000Z');
}
function isFresh(timestamp, nowMs, maxAge) {
  if (!isIsoSecond(timestamp)) return false;
  const delta = nowMs - Date.parse(timestamp);
  return delta >= 0 && delta <= maxAge * 60000;
}
function parseAux(text, required) {
  if (text === undefined || text === null || text === '') return [];
  return objectRows(parseDelimited(text, ','), required);
}
function indexById(rows) {
  const m = new Map();
  for (const r of rows) { const prior = m.get(r.data.id) || []; prior.push(r); m.set(r.data.id, prior); }
  return m;
}
function okText(v, max = 180) { return typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v); }
function normalizeNow(v) {
  const s = v ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (!isIsoSecond(s)) throw new FeedError('RELOJ_INVALIDO');
  return s;
}

/**
 * Procesa parcialmente un feed Google CSV/TSV sin I/O y sin acceso a redes.
 * Las autorizaciones y evidencias son declaraciones externas, NO se autentican.
 * evaluation_time es inyectable para tests y no es reloj confiable de producción.
 */
export function repairFeed(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FeedError('ENTRADA_INVALIDA');
  const policy = input.policy || {};
  const jobId = policy.job_id;
  if (!okText(jobId, 100)) throw new FeedError('JOB_ID_REQUERIDO');
  const market = policy.market, currency = policy.currency;
  if (!/^[A-Z]{2}$/.test(market || '') || !/^[A-Z]{3}$/.test(currency || '')) throw new FeedError('MERCADO_O_MONEDA_INVALIDOS');
  const now = normalizeNow(policy.evaluation_time), nowMs = Date.parse(now);
  const maxAge = policy.max_source_age_minutes ?? 60;
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 60) throw new FeedError('EDAD_FUENTE_FUERA_DE_RANGO');
  if (!['csv','tsv'].includes(input.format)) throw new FeedError('FORMATO_REQUERIDO');
  const table = parseDelimited(input.feed, input.format === 'csv' ? ',' : '\t');
  const ix = Object.fromEntries(table.headers.map((h,i) => [h,i]));
  for (const name of ['id','price','availability']) if (!(name in ix)) throw new FeedError('FALTA_CABECERA_' + name.toUpperCase());
  if (table.records.length === 0) throw new FeedError('SIN_FILAS_DE_DATOS');
  const sourceRows = parseAux(input.source, ['id','market','currency','price','availability','observed_at']);
  const evidenceRows = parseAux(input.evidence, ['id','market','currency','landing_price','checkout_price','availability','observed_at']);
  const sources = indexById(sourceRows), evidences = indexById(evidenceRows);
  const counts = new Map();
  for (const row of table.records) { const id = row.cells[ix.id]; counts.set(id, (counts.get(id) || 0) + 1); }
  const a = policy.authorization;
  const aTimeValid = a && a.revoked === false && isIsoSecond(a.valid_from) && isIsoSecond(a.valid_until)
    && Date.parse(a.valid_from) <= nowMs && nowMs <= Date.parse(a.valid_until);
  const approvalValid = Boolean(aTimeValid && a.market === market && a.currency === currency && Array.isArray(a.fields)
    && okText(a.approved_by) && okText(a.approval_ref) && okText(a.source_ref) && okText(a.evidence_ref));
  const canChange = field => approvalValid && a.fields.includes(field);
  const safeA = Array.isArray(policy.safe_rules) && policy.safe_rules.includes(RULE_A);
  const changes = [], issues = [];
  const addIssue = (record, field, code) => issues.push({id:record.cells[ix.id], numero_linea_csv:record.line, campo:field, codigo:code,
    estado:'NEEDS_INFORMATION', severidad:'blocking', categoria:'D_BLOQUEO', accion:actions[code]});
  const addChange = (record, field, next, rule, category, source, evidence) => {
    const before = record.cells[ix[field]];
    if (before === next) return;
    changes.push({job_id:jobId, id:record.cells[ix.id], numero_linea_csv:record.line, campo:field, antes:before, despues:next,
      regla_de_prueba:rule, rule_version:ENGINE_VERSION, categoria:category,
      fuente_de_prueba:source, evidencia:evidence, fecha_evaluacion:now,
      approved_by:category === 'B_AUTORIZADO_CON_EVIDENCIA' ? a.approved_by : 'mapeo-determinista-permitido',
      approval_ref:category === 'B_AUTORIZADO_CON_EVIDENCIA' ? a.approval_ref : 'politica-local'});
    record.cells[ix[field]] = next;
  };
  for (const row of table.records) {
    const id = row.cells[ix.id];
    if (!id.trim()) { addIssue(row,'id','ID_MISSING'); continue; }
    if ((counts.get(id) || 0) > 1) { addIssue(row,'id','DUPLICATE_ID'); continue; }
    if (ix.condition !== undefined) {
      const original = row.cells[ix.condition];
      const canonical = original.trim().toLowerCase();
      if (safeA && allowedCondition.has(canonical) && canonical !== original) {
        addChange(row, 'condition', canonical, RULE_A, 'A_SEGURO_AUTOMATICO', 'mapeo-explicito:condition', 'equivalencia-de-enumeracion');
      } else if (original && !allowedCondition.has(original)) addIssue(row, 'condition', 'CONDITION_UNKNOWN');
    }
    const allSource = sources.get(id) || [];
    const sMatches = allSource.filter(x => x.data.market === market && x.data.currency === currency);
    if (sMatches.length > 1) addIssue(row, 'id', 'SOURCE_DUPLICATE');
    else if (allSource.length && !sMatches.length) addIssue(row, 'id', 'SOURCE_SCOPE_MISMATCH');
    else if (sMatches.length === 1) {
      const s = sMatches[0], d = s.data;
      if (!isFresh(d.observed_at, nowMs, maxAge)) addIssue(row, 'id', 'SOURCE_NOT_FRESH');
      else {
        const candidates = ['price','availability'].filter(f => d[f] !== row.cells[ix[f]]);
        const eMatches = (evidences.get(id) || []).filter(x => x.data.market === market && x.data.currency === currency);
        for (const field of candidates) {
          if (!canChange(field)) { addIssue(row, field, 'APPROVAL_REQUIRED'); continue; }
          if (eMatches.length !== 1) { addIssue(row, field, 'EVIDENCE_MISSING_OR_DUPLICATE'); continue; }
          const ev = eMatches[0], e = ev.data;
          if (!isFresh(e.observed_at, nowMs, maxAge)) { addIssue(row, field, 'EVIDENCE_NOT_FRESH'); continue; }
          if (field === 'price') {
            if (!validPrice(d.price,currency)) { addIssue(row, field, 'PRICE_SOURCE_INVALID'); continue; }
            if (e.landing_price !== d.price || e.checkout_price !== d.price) { addIssue(row, field, 'PRICE_EVIDENCE_MISMATCH'); continue; }
            addChange(row, field, d.price, 'PRICE_FROM_AUTHORIZED_MATCH', 'B_AUTORIZADO_CON_EVIDENCIA', `${a.source_ref}:${s.line}`, `${a.evidence_ref}:${ev.line}`);
          } else {
            if (!allowedAvailability.has(d.availability)) { addIssue(row, field, 'AVAILABILITY_SOURCE_INVALID'); continue; }
            if (e.availability !== d.availability) { addIssue(row, field, 'AVAILABILITY_EVIDENCE_MISMATCH'); continue; }
            addChange(row, field, d.availability, 'AVAILABILITY_FROM_AUTHORIZED_MATCH', 'B_AUTORIZADO_CON_EVIDENCIA', `${a.source_ref}:${s.line}`, `${a.evidence_ref}:${ev.line}`);
          }
        }
      }
    }
    const price = row.cells[ix.price], available = row.cells[ix.availability];
    if (!price) addIssue(row,'price','PRICE_MISSING');
    else if (!validPrice(price,currency)) addIssue(row,'price','PRICE_INVALID_FORMAT');
    if (!available) addIssue(row,'availability','AVAILABILITY_MISSING');
    else if (!allowedAvailability.has(available)) addIssue(row,'availability','AVAILABILITY_AMBIGUOUS');
    if (ix.gtin !== undefined) {
      const gtin = row.cells[ix.gtin];
      if (gtin && !/^\d{8}$|^\d{12,14}$/.test(gtin)) addIssue(row,'gtin','GTIN_INVALID_FORMAT');
      else if (gtin && !validGtin(gtin)) addIssue(row,'gtin','GTIN_INVALID_CHECK_DIGIT');
    }
  }
  const feed = serializeDelimited(table);
  const audit = auditCsv(['job_id','id','numero_linea_csv','campo','antes','despues','regla_de_prueba','categoria','fuente_de_prueba','evidencia','approved_by'],
    changes.map(c => ['job_id','id','numero_linea_csv','campo','antes','despues','regla_de_prueba','categoria','fuente_de_prueba','evidencia','approved_by'].map(k => c[k])));
  return { engine_version:ENGINE_VERSION, job_id:jobId, rows:table.records.length, changes, issues,
    status:issues.length ? 'BLOCKED_NEEDS_INPUT' : 'PARTIAL_REVIEW_REQUIRED', output_label:'NO_APTO',
    on_chain_submission_allowed:false, on_merchant_upload_allowed:false,
    unchecked:['autenticidad de la autorización y evidencias','todos los requisitos de Google','página y checkout reales','políticas y aprobación Google','permisos y entrega privada'],
    corrected_feed:feed, safe_audit_csv:audit };
}
