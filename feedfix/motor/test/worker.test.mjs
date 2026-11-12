import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/baseline_worker.mjs';
const url='https://example.invalid';
const post=(body,headers={'content-type':'application/json'})=>worker.fetch(new Request(url+'/repair',{method:'POST',headers,body}));

test('HTTP de ensayo: salud, rutas y cabeceras de no almacenar',async()=>{
 const h=await worker.fetch(new Request(url+'/health'));assert.equal(h.status,200);assert.equal((await h.json()).mode,'solo-sintetico-no-produccion');assert.equal(h.headers.get('cache-control'),'no-store');
 const missing=await worker.fetch(new Request(url+'/other'));assert.equal(missing.status,404);
});
test('HTTP rechaza tipo no JSON y JSON inválido sin reflejar contenido',async()=>{
 const x=await post('a',{'content-type':'text/plain'});assert.equal(x.status,415);
 const y=await post('private-marker {');assert.equal(y.status,400);const body=await y.text();assert(!body.includes('private-marker'));assert(body.includes('JSON_O_UTF8_INVALIDO'));
});
test('HTTP rechaza UTF-8 inválido y cuerpo superior a 3 MiB',async()=>{
 const bad=await post(new Uint8Array([0xc3,0x28]));assert.equal(bad.status,400);assert.equal((await bad.json()).error,'JSON_O_UTF8_INVALIDO');
 const large=await post('x'.repeat(3*1024*1024+1));assert.equal(large.status,400);assert.equal((await large.json()).error,'CUERPO_DEMASIADO_GRANDE');
});
test('HTTP procesa entrada mínima sintética, siempre sin permiso de subida',async()=>{
 const input={format:'csv',feed:'id,price,availability\nSYN-1,9.00 USD,in_stock\n',policy:{job_id:'http-test',market:'US',currency:'USD',evaluation_time:'2026-11-09T15:00:00Z'}};
 const r=await post(JSON.stringify(input));assert.equal(r.status,200);const x=await r.json();assert.equal(x.rows,1);assert.equal(x.on_merchant_upload_allowed,false);assert.equal(x.on_chain_submission_allowed,false);assert.equal(x.status,'PARTIAL_REVIEW_REQUIRED');
});
