import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/cloud_worker.mjs';
import {newParser} from '../src/incremental_parser.mjs';
const base='https://example.invalid';
const call=(path,body,method='POST')=>worker.fetch(new Request(base+path,{method,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
test('endpoint Playground sintético bloquea método, ruta, JSON inválido y cuerpo largo sin reflejar',async()=>{
 let r=await call('/parse',null,'GET');assert.equal(r.status,405);assert.equal(r.headers.get('cache-control'),'no-store');
 r=await call('/nope',{});assert.equal(r.status,404);
 r=await call('/parse','secret-marker {');assert.equal(r.status,400);assert(!(await r.text()).includes('secret-marker'));
 r=await call('/parse','x'.repeat(128*1024+1));assert.equal(r.status,413);
});
test('endpoint parse reproduce estado y registro, y rechaza chunk mayor de 4096',async()=>{
 const raw='id,price,availability\na,1 USD,in_stock\n';const r=await call('/parse',{state:newParser(),chunk_base64:Buffer.from(raw).toString('base64'),final:true});assert.equal(r.status,200);const x=await r.json();assert.equal(x.state.done,true);assert.equal(x.records[0].cells[0],'a');
 const big=await call('/parse',{state:newParser(),chunk_base64:Buffer.alloc(4097).toString('base64'),final:true});assert.equal(big.status,400);
});
test('endpoint batch no autentica el contexto: nunca exponerlo en producción',async()=>{
 const input={format:'csv',feed:'id,price,availability,condition\na,1.00 USD,in_stock,New\n',policy:{job_id:'laboratorio',market:'US',currency:'USD',evaluation_time:'2026-11-09T15:00:00Z',safe_rules:['CONDITION_CANONICAL_V1']}};
 const r=await call('/batch',{input,context:{feedLines:[2],sourceLines:[],evidenceLines:[],globalCounts:[['a',1]]}});assert.equal(r.status,200);const x=await r.json();assert.equal(x.changes.length,1);assert.equal(x.on_chain_submission_allowed,false);
 // Ese conteo podría omitir una fila 'a' en otro lote; la función no puede saberlo.
});
