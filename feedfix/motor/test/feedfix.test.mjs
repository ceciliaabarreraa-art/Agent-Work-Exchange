import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, serializeDelimited, decodeUtf8, safeAuditCell, FeedError } from '../src/delimited.mjs';
import { repairFeed, validGtin } from '../src/engine.mjs';

const mkTable=(headers,rows,delimiter=',',options={})=>serializeDelimited({headers,records:rows.map(cells=>({cells})),delimiter,bom:!!options.bom,newline:options.newline || '\n',terminalNewline:!!options.terminalNewline});
const policy=()=>({job_id:'test-case',market:'US',currency:'USD',evaluation_time:'2026-11-09T15:00:00Z',max_source_age_minutes:60,
 safe_rules:['CONDITION_CANONICAL_V1'],authorization:{market:'US',currency:'USD',fields:['price','availability'],approved_by:'synthetic-operator',approval_ref:'synthetic-approval',source_ref:'catalog.csv',evidence_ref:'proof.csv',revoked:false,valid_from:'2026-11-09T14:00:00Z',valid_until:'2026-11-09T16:00:00Z'}});
const fields=['id','price','availability','condition','gtin','note'];
const feed=(row=['VAR-1','19.90 USD','In Stock','new','','no alterar'])=>mkTable(fields,[row],',',{terminalNewline:true});
const src=(rows=[['VAR-1','US','USD','24.90 USD','in_stock','2026-11-09T14:30:00Z']])=>mkTable(['id','market','currency','price','availability','observed_at'],rows,',',{terminalNewline:true});
const proof=(rows=[['VAR-1','US','USD','24.90 USD','24.90 USD','in_stock','2026-11-09T14:30:00Z']])=>mkTable(['id','market','currency','landing_price','checkout_price','availability','observed_at'],rows,',',{terminalNewline:true});
const req=(over={})=>({format:'csv',feed:feed(),source:src(),evidence:proof(),policy:policy(),...over});
const has=(r,code)=>r.issues.some(x=>x.codigo===code);
const parsedFeed=r=>parseDelimited(r.corrected_feed,',').records.map(x=>x.cells);
const expectError=(fn,code)=>assert.throws(fn,e=>e instanceof FeedError && e.code===code);

test('CSV: comillas escapadas, comas, saltos, BOM, CRLF y columnas se conservan semánticamente',()=>{
 const rows=[['X','uno, dos','linea\r\ndos "entre" comillas',''],['Y','áé✨','\t@formula','final']];
 const raw=mkTable(['id','x','y','z'],rows,',',{bom:true,newline:'\r\n',terminalNewline:true});
 const t=parseDelimited(raw);assert.equal(t.bom,true);assert.equal(t.newline,'\r\n');assert.equal(t.records[1].line,4);
 assert.deepEqual(t.records.map(x=>x.cells),rows);assert.deepEqual(parseDelimited(serializeDelimited(t)).records.map(x=>x.cells),rows);
 assert.equal(decodeUtf8(new TextEncoder().encode(raw)),raw);
});
test('TSV: separadores entrecomillados y líneas internas preservadas',()=>{
 const rows=[['A','1\t2','x\ny'],['B','"ok"','sin cambio']];const raw=mkTable(['id','a','b'],rows,'\t',{terminalNewline:true});
 assert.deepEqual(parseDelimited(raw,'\t').records.map(x=>x.cells),rows);
});
test('CSV rechaza comillas rotas, basura luego del cierre y comillas en no entrecomillados',()=>{
 expectError(()=>parseDelimited('id,x\na,"broken'), 'COMILLA_SIN_CERRAR');
 expectError(()=>parseDelimited('id,x\na,"b"junk'), 'CARACTER_DESPUES_DE_COMILLA');
 expectError(()=>parseDelimited('id,x\na,un"quoted'), 'COMILLA_EN_CAMPO_NO_ENTRECOMILLADO');
});
test('rechaza duplicación de cabeceras incluso por mayúsculas o espacios',()=>expectError(()=>parseDelimited('id, ID\nx,y'), 'CABECERA_DUPLICADA'));
test('rechaza filas con número de columnas distinto y archivo vacío',()=>{
 expectError(()=>parseDelimited('id,x\na,1,2'), 'COLUMNAS_INCONSISTENTES');
 expectError(()=>parseDelimited(''), 'ARCHIVO_VACIO');
 expectError(()=>parseDelimited('id,x\na'), 'COLUMNAS_INCONSISTENTES');
});
test('rechaza UTF-8 inválido, NUL y sustitutos Unicode sueltos',()=>{
 expectError(()=>decodeUtf8(new Uint8Array([0xc3,0x28])), 'UTF8_INVALIDO');
 expectError(()=>parseDelimited('id,x\na,\0'), 'NUL_NO_PERMITIDO');
 expectError(()=>parseDelimited('id,x\na,\ud800'), 'UNICODE_INVALIDO');
});
test('límites de ensayo: 500 filas permitidas, 501 y más de 1 MiB bloqueados',()=>{
 const good=mkTable(['id','value'],Array.from({length:500},(_,i)=>[String(i),'x']));assert.equal(parseDelimited(good).records.length,500);
 const bad=mkTable(['id','value'],Array.from({length:501},(_,i)=>[String(i),'x']));expectError(()=>parseDelimited(bad),'DEMASIADAS_FILAS');
 expectError(()=>parseDelimited('id,x\na,'+'x'.repeat(1048576)),'ARCHIVO_DEMASIADO_GRANDE');
});
test('A: canonicaliza condition solo si regla explícita habilitada',()=>{
 const input=feed(['VAR-1','19.90 USD','in_stock',' New ','','otra columna']);const r=repairFeed(req({feed:input,source:'',evidence:''}));
 assert.equal(r.changes.length,1);assert.equal(r.changes[0].categoria,'A_SEGURO_AUTOMATICO');assert.equal(parsedFeed(r)[0][3],'new');assert.equal(parsedFeed(r)[0][5],'otra columna');
 const p=policy();p.safe_rules=[];const no=repairFeed(req({feed:input,source:'',evidence:'',policy:p}));assert.equal(no.changes.length,0);assert(has(no,'CONDITION_UNKNOWN'));
});
test('B: precio y disponibilidad con coincidencia exacta, vigencia y autorización',()=>{
 const r=repairFeed(req());assert.deepEqual(r.changes.map(x=>x.campo),['price','availability']);assert(r.changes.every(x=>x.categoria==='B_AUTORIZADO_CON_EVIDENCIA'));
 assert.deepEqual(parsedFeed(r)[0],['VAR-1','24.90 USD','in_stock','new','','no alterar']);assert.equal(r.status,'PARTIAL_REVIEW_REQUIRED');
 assert.equal(r.on_merchant_upload_allowed,false);assert.equal(r.on_chain_submission_allowed,false);
});
test('B: sin aprobación no cambia ni precio ni disponibilidad',()=>{
 const p=policy();delete p.authorization;const r=repairFeed(req({policy:p}));assert.equal(r.changes.length,0);assert(has(r,'APPROVAL_REQUIRED'));
});
test('B: autorización revocada, vencida o con campo no permitido no habilita ese cambio',()=>{
 const p=policy();p.authorization.revoked=true;assert.equal(repairFeed(req({policy:p})).changes.length,0);
 const p2=policy();p2.authorization.valid_until='2026-11-09T14:59:59Z';assert.equal(repairFeed(req({policy:p2})).changes.length,0);
 const p3=policy();p3.authorization.fields=['price'];const r=repairFeed(req({policy:p3}));assert.deepEqual(r.changes.map(c=>c.campo),['price']);assert(has(r,'APPROVAL_REQUIRED'));
});
test('B: fuente vencida o futura se bloquea',()=>{
 for(const t of ['2026-11-09T13:59:00Z','2026-11-09T15:00:01Z']){const r=repairFeed(req({source:src([['VAR-1','US','USD','24.90 USD','in_stock',t]])}));assert.equal(r.changes.length,0);assert(has(r,'SOURCE_NOT_FRESH'));}
});
test('B: no usa variante distinta, moneda ni mercado distintos',()=>{
 const other=repairFeed(req({source:src([['VAR-2','US','USD','24.90 USD','in_stock','2026-11-09T14:30:00Z']])}));assert.equal(other.changes.length,0);
 for(const [country,money] of [['CA','USD'],['US','EUR']]){const r=repairFeed(req({source:src([['VAR-1',country,money,'24.90 USD','in_stock','2026-11-09T14:30:00Z']])}));assert.equal(r.changes.length,0);assert(has(r,'SOURCE_SCOPE_MISMATCH'));}
});
test('B: fuente duplicada o contradictoria bloquea; jamás elige una por orden',()=>{
 const r=repairFeed(req({source:src([['VAR-1','US','USD','24.90 USD','in_stock','2026-11-09T14:30:00Z'],['VAR-1','US','USD','25.90 USD','in_stock','2026-11-09T14:30:00Z']])}));assert.equal(r.changes.length,0);assert(has(r,'SOURCE_DUPLICATE'));
});
test('B: evidencia ausente, múltiple o vencida bloquea cambios',()=>{
 const missing=repairFeed(req({evidence:''}));assert.equal(missing.changes.length,0);assert(has(missing,'EVIDENCE_MISSING_OR_DUPLICATE'));
 const line=['VAR-1','US','USD','24.90 USD','24.90 USD','in_stock','2026-11-09T14:30:00Z'];const dup=repairFeed(req({evidence:proof([line,line])}));assert.equal(dup.changes.length,0);
 const stale=repairFeed(req({evidence:proof([['VAR-1','US','USD','24.90 USD','24.90 USD','in_stock','2026-11-09T13:00:00Z']])}));assert.equal(stale.changes.length,0);assert(has(stale,'EVIDENCE_NOT_FRESH'));
});
test('B: precio no cambia si la página o checkout contradicen la fuente',()=>{
 const r=repairFeed(req({evidence:proof([['VAR-1','US','USD','24.90 USD','25.90 USD','in_stock','2026-11-09T14:30:00Z']])}));
 assert(!r.changes.some(x=>x.campo==='price'));assert(has(r,'PRICE_EVIDENCE_MISMATCH'));assert.equal(parsedFeed(r)[0][1],'19.90 USD');
});
test('B: disponibilidad ambigua de fuente no se convierte adivinando',()=>{
 const r=repairFeed(req({source:src([['VAR-1','US','USD','24.90 USD','available','2026-11-09T14:30:00Z']])}));assert(!r.changes.some(c=>c.campo==='availability'));assert(has(r,'AVAILABILITY_SOURCE_INVALID'));
});
test('duplicados del feed preservan ambas filas y evitan incluso cambios A',()=>{
 const rows=[['DUP','19.90 USD','In Stock',' New ','','a'],['DUP','11.00 USD','in_stock',' New ','','b']];
 const r=repairFeed(req({feed:mkTable(fields,rows,',',{terminalNewline:true})}));assert.equal(r.issues.filter(x=>x.codigo==='DUPLICATE_ID').length,2);assert.equal(r.changes.length,0);assert.deepEqual(parsedFeed(r),rows);
});
test('GTIN solo comprueba dígito, no inventa ni asegura asignación',()=>{
 assert(validGtin('4006381333931'));assert(!validGtin('1234567890123'));assert(!validGtin('not-a-gtin'));
 const r=repairFeed(req({feed:feed(['VAR-1','19.90 USD','in_stock','new','1234567890123','x']),source:'',evidence:''}));assert(has(r,'GTIN_INVALID_CHECK_DIGIT'));assert.equal(parsedFeed(r)[0][4],'1234567890123');
});
test('CSV para planillas protege fórmulas sin cambiar el feed',()=>{
 assert.equal(safeAuditCell(' =cmd'),"' =cmd");assert.equal(safeAuditCell('\tfoo'),"'\tfoo");
 const r=repairFeed(req({feed:feed(['VAR-1','19.90 USD','in_stock','new','','=MALICIOUS()']),source:'',evidence:''}));assert.equal(parsedFeed(r)[0][5],'=MALICIOUS()');
 const badId='=ID';const src1=src([[badId,'US','USD','24.90 USD','in_stock','2026-11-09T14:30:00Z']]);const ev=proof([[badId,'US','USD','24.90 USD','24.90 USD','in_stock','2026-11-09T14:30:00Z']]);
 const changed=repairFeed(req({feed:feed([badId,'19.90 USD','in_stock','new','','x']),source:src1,evidence:ev}));assert(changed.safe_audit_csv.includes("'=ID"));assert.equal(parsedFeed(changed)[0][0],badId);
});
test('segunda ejecución con misma política y evidencia no duplica modificaciones',()=>{
 const first=repairFeed(req());const second=repairFeed(req({feed:first.corrected_feed}));assert.equal(second.changes.length,0);assert.equal(second.corrected_feed,first.corrected_feed);
});
test('TSV de feed admite reglas B sin modificar otras columnas',()=>{
 const original=mkTable(fields,[['VAR-1','19.90 USD','In Stock','new','','c\tnota']],'\t',{bom:true,newline:'\r\n',terminalNewline:true});
 const r=repairFeed(req({format:'tsv',feed:original}));const out=parseDelimited(r.corrected_feed,'\t');assert.equal(out.bom,true);assert.equal(out.records[0].cells[5],'c\tnota');assert.equal(out.records[0].cells[1],'24.90 USD');
});
test('se rechaza el reloj inválido y edades de evidencia superiores a 60 min',()=>{
 const p=policy();p.evaluation_time='2026-02-30T15:00:00Z';expectError(()=>repairFeed(req({policy:p})),'RELOJ_INVALIDO');
 const p2=policy();p2.max_source_age_minutes=61;expectError(()=>repairFeed(req({policy:p2})),'EDAD_FUENTE_FUERA_DE_RANGO');
});
test('propiedad: 200 tablas CSV/TSV deterministas conservan celdas y orden',()=>{
 let seed=1289;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};const atoms=['','a,b','c\td','\"q\"','line\nend','cr\r\nlf',' á ','=1','😀','z'];
 for(let n=0;n<200;n++){const delim=n%2?',':'\t';const rows=Array.from({length:1+random()%8},(_,i)=>[String(i),atoms[random()%atoms.length],atoms[random()%atoms.length]]);const text=mkTable(['id','x','y'],rows,delim,{bom:n%3===0,newline:n%2?'\r\n':'\n',terminalNewline:n%5===0});assert.deepEqual(parseDelimited(text,delim).records.map(x=>x.cells),rows);}
});
