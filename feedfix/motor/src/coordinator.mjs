// Coordinador de laboratorio, de proceso único y memoria local. No es cola ni storage cloud.
// Primero valida TODO el archivo, calcula duplicados globales y solo después procesa.
import { FeedError, parseDelimited, serializeDelimited, auditCsv, objectRows } from './delimited.mjs';
import { newParser, parseChunk, tableMeta, CHUNK_BYTES } from './incremental_parser.mjs';
import { repairFeed, ENGINE_VERSION } from './engine.mjs';

export function parseLocally(raw, delimiter) {
  if (typeof raw !== 'string') throw new FeedError('TEXTO_REQUERIDO');
  const bytes=new TextEncoder().encode(raw); let state=newParser(delimiter), records=[];
  if (!bytes.length) { parseChunk(state,new Uint8Array(),true); }
  for (let i=0;i<bytes.length;i+=CHUNK_BYTES) {
    const r=parseChunk(state,bytes.subarray(i,i+CHUNK_BYTES),i+CHUNK_BYTES>=bytes.length);
    state=JSON.parse(JSON.stringify(r.state)); records.push(...r.records);
  }
  return {...tableMeta(state),records};
}

function byId(table, required) {
  if (!table) return new Map();
  const rows=objectRows(table,required), map=new Map();
  rows.forEach((r,i) => { const a=map.get(r.data.id)||[]; a.push({record:table.records[i],data:r.data}); map.set(r.data.id,a); });
  return map;
}
const textFor=(table,records) => table ? serializeDelimited({...table,bom:false,newline:'\n',terminalNewline:true,records}) : undefined;

export function createPlan(input, parsed, batchSize=5) {
  if (!input || !['csv','tsv'].includes(input.format) || !Number.isInteger(batchSize) || batchSize<1 || batchSize>10) throw new FeedError('PLAN_INVALIDO');
  const delimiter=input.format==='csv'?',':'\t';
  const feed=parsed?.feed || parseLocally(input.feed,delimiter);
  const source=parsed?.source || (input.source ? parseLocally(input.source,',') : null);
  const evidence=parsed?.evidence || (input.evidence ? parseLocally(input.evidence,',') : null);
  const ix=feed.headers.indexOf('id');
  if (ix<0 || !feed.headers.includes('price') || !feed.headers.includes('availability')) throw new FeedError('CABECERAS_REQUERIDAS');
  if (!feed.records.length) throw new FeedError('SIN_FILAS_DE_DATOS');
  const src=byId(source,['id','market','currency','price','availability','observed_at']);
  const ev=byId(evidence,['id','market','currency','landing_price','checkout_price','availability','observed_at']);
  const counts=new Map();
  for (const r of feed.records) counts.set(r.cells[ix],(counts.get(r.cells[ix])||0)+1);
  const p=input.policy || {}, batches=[];
  for (let off=0;off<feed.records.length;off+=batchSize) {
    const part=feed.records.slice(off,off+batchSize), ids=[...new Set(part.map(r=>r.cells[ix]))];
    // Para las reglas existentes, dos coincidencias bastan para comprobar duplicado;
    // una de otro ámbito basta para reportar scope mismatch. Se conservan líneas reales.
    const s=[],e=[];
    for (const id of ids) {
      const all=src.get(id)||[], match=all.filter(x=>x.data.market===p.market&&x.data.currency===p.currency);
      s.push(...(match.length ? match.slice(0,2) : all.slice(0,1)).map(x=>x.record));
      const em=(ev.get(id)||[]).filter(x=>x.data.market===p.market&&x.data.currency===p.currency);
      e.push(...em.slice(0,2).map(x=>x.record));
    }
    s.sort((a,b)=>a.line-b.line); e.sort((a,b)=>a.line-b.line);
    batches.push({input:{format:input.format,feed:textFor(feed,part),source:textFor(source,s),evidence:textFor(evidence,e),policy:p},
      context:{feedLines:part.map(r=>r.line),sourceLines:s.map(r=>r.line),evidenceLines:e.map(r=>r.line),globalCounts:ids.map(id=>[id,counts.get(id)])}});
  }
  return {input,feed,source,evidence,batches};
}

export function assemble(plan, batchResults) {
  if (!Array.isArray(batchResults) || batchResults.length!==plan.batches.length) throw new FeedError('LOTES_INCOMPLETOS');
  const records=[], changes=[], issues=[];
  for (let i=0;i<batchResults.length;i++) {
    const b=batchResults[i], expected=plan.batches[i];
    if (!b || b.rows!==expected.context.feedLines.length || b.job_id!==plan.input.policy.job_id || b.engine_version!==ENGINE_VERSION) throw new FeedError('LOTE_NO_COINCIDE');
    const partial=parseDelimited(b.corrected_feed,plan.feed.delimiter);
    if (JSON.stringify(partial.headers)!==JSON.stringify(plan.feed.headers) || partial.records.length!==b.rows) throw new FeedError('SALIDA_DE_LOTE_INVALIDA');
    records.push(...partial.records); changes.push(...b.changes); issues.push(...b.issues);
  }
  const corrected_feed=serializeDelimited({...plan.feed,records});
  const columns=['job_id','id','numero_linea_csv','campo','antes','despues','regla_de_prueba','categoria','fuente_de_prueba','evidencia','approved_by'];
  const safe_audit_csv=auditCsv(columns,changes.map(c=>columns.map(k=>c[k])));
  return {engine_version:ENGINE_VERSION, job_id:plan.input.policy.job_id, rows:records.length, changes, issues,
    status:issues.length?'BLOCKED_NEEDS_INPUT':'PARTIAL_REVIEW_REQUIRED', output_label:'NO_APTO',
    on_chain_submission_allowed:false,on_merchant_upload_allowed:false,
    unchecked:['autenticidad de la autorización y evidencias','todos los requisitos de Google','página y checkout reales','políticas y aprobación Google','permisos y entrega privada'],
    corrected_feed,safe_audit_csv};
}

export function runLocal(input,batchSize=5) {
  const plan=createPlan(input,null,batchSize);
  return assemble(plan,plan.batches.map(b=>repairFeed(b.input,b.context)));
}
