import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseDelimited,serializeDelimited,FeedError} from '../src/delimited.mjs';
import {newParser,parseChunk,tableMeta,CHUNK_BYTES} from '../src/incremental_parser.mjs';
import {repairFeed} from '../src/engine.mjs';
import {runLocal,parseLocally} from '../src/coordinator.mjs';

const fixture = name => readFile(new URL('../fixtures/'+name,import.meta.url),'utf8');
const input500=JSON.parse(await fixture('500_casi_1MiB.json'));
const policy={job_id:'fixture-6-filas',market:'US',currency:'USD',evaluation_time:'2026-11-09T15:00:00Z',max_source_age_minutes:60,
 safe_rules:['CONDITION_CANONICAL_V1'],authorization:{market:'US',currency:'USD',fields:['price','availability'],approved_by:'operador-sintetico',approval_ref:'autorizacion-solo-fixture',source_ref:'fuente_autorizada.csv',evidence_ref:'evidencia_pagina_y_checkout_SIMULADA.csv',revoked:false,valid_from:'2026-11-09T14:00:00Z',valid_until:'2026-11-09T16:00:00Z'}};
const input6={format:'csv',feed:await fixture('feed_google_entrada.csv'),source:await fixture('fuente_autorizada.csv'),evidence:await fixture('evidencia_pagina_y_checkout_SIMULADA.csv'),policy};
function parseWith(raw,size,delimiter=',') {
 const bytes=new TextEncoder().encode(raw); let state=newParser(delimiter),records=[];
 for(let i=0;i<bytes.length;i+=size) { const r=parseChunk(state,bytes.subarray(i,i+size),i+size>=bytes.length); state=JSON.parse(JSON.stringify(r.state));records.push(...r.records); }
 return {...tableMeta(state),records};
}
const expectCode=(f,code)=>assert.throws(f,e=>e instanceof FeedError&&e.code===code);
const norm=r=>({feed:r.corrected_feed,changes:r.changes,issues:r.issues,status:r.status,audit:r.safe_audit_csv});

test('incremental: BOM y UTF-8 multibyte, comillas dobles, CRLF dentro/fuera, puntos de corte 1..31',()=>{
 const raw='\ufeffid,price,availability,note\r\nA,12.00 USD,in_stock,"maíz 😀, ""cita""\r\notra"\r\nB,3.00 USD,in_stock,"línea\ntres"\r\n';
 const expected=parseDelimited(raw);
 for(let n=1;n<=31;n++) assert.deepEqual(parseWith(raw,n),expected,`chunk=${n}`);
});
test('incremental: TSV, salto CR y sin newline terminal',()=>{
 const raw='id\tprice\tavailability\tnote\rα\t1.00 USD\tin_stock\t"a\tb\rtexto"\rβ\t2.00 USD\tin_stock\tfin';
 for(const n of [1,2,4,7,31,CHUNK_BYTES]) assert.deepEqual(parseWith(raw,n,'\t'),parseDelimited(raw,'\t'));
});
test('incremental: UTF-8 incompleto final e inválido se rechaza, no se sustituye',()=>{
 let s=newParser();s=parseChunk(s,new Uint8Array([0x69,0x64,0x0a,0xf0,0x9f]),false).state;
 expectCode(()=>parseChunk(s,new Uint8Array(),true),'UTF8_INVALIDO');
 expectCode(()=>parseChunk(newParser(),new Uint8Array([0x69,0x64,0x0a,0xff]),true),'UTF8_INVALIDO');
});
test('incremental: sintaxis y límites cierran por defecto',()=>{
 for(const raw of ['id,price\n1,"sin cerrar','id,price\n1,"a"x','id,price\n1,un"a','id,id\n1,2','id,price\n1,2,3']) assert.throws(()=>parseWith(raw,1));
 expectCode(()=>parseWith('id,price\n1,'+'x'.repeat(8193),100),'REGISTRO_DEMASIADO_LARGO_PARA_MODO_INCREMENTAL');
 expectCode(()=>parseChunk(newParser(),new Uint8Array(4097),false),'BLOQUE_INVALIDO');
 expectCode(()=>parseWith('',1),'PARSER_NO_FINALIZADO');
});
test('golden 6: lotes 1,2,5 conservan duplicados entre lotes, auditoría y fuente/líneas',async()=>{
 const ref=repairFeed(input6), expected=await fixture('NO_APTO_feed_esperado.csv');
 assert.equal(ref.corrected_feed,expected);
 for(const size of [1,2,5]) { const r=runLocal(input6,size);assert.deepEqual(norm(r),norm(ref));assert.equal(r.changes.length,2);assert.equal(r.issues.length,5); }
 const r=runLocal(input6,1);assert.deepEqual(r.issues.filter(x=>x.codigo==='DUPLICATE_ID').map(x=>x.numero_linea_csv),[5,6]);
});
test('500 casi 1 MiB: incremental equivale a monolítico incluyendo CSV, auditoría y hallazgos',()=>{
 const baseline=repairFeed(input500), incremental=runLocal(input500,5);
 assert.deepEqual(norm(incremental),norm(baseline));
 assert.equal(incremental.rows,500);
 console.log('sha256 feed 500:',createHash('sha256').update(incremental.corrected_feed).digest('hex'));
});
test('rechaza conteos globales incompletos o inferiores al lote',()=>{
 expectCode(()=>repairFeed(input6,{globalCounts:[]}), 'CONTEOS_GLOBALES_INVALIDOS');
});
test('propiedad: 100 tablas con Unicode y valores entrecomillados, seis tamaños de bloque',()=>{
 let seed=34123;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 const vals=['','texto','coma,','doble"','maíz😀','x\ny','a\rb','espacio ','\r\n','\\'];
 for(let k=0;k<100;k++){
  const delimiter=k%2?',':'\t', headers=['id','price','availability','note'];
  const records=Array.from({length:1+rnd()%8},(_,i)=>({cells:['id'+i,'2.00 USD','in_stock',vals[rnd()%vals.length]]}));
  const raw=serializeDelimited({headers,records,delimiter,bom:k%3===0,newline:k%4?'\n':'\r\n',terminalNewline:k%5!==0});
  for(const size of [1,2,3,7,32,99]) assert.deepEqual(parseWith(raw,size,delimiter),parseDelimited(raw,delimiter),`k=${k} size=${size}`);
 }
});
