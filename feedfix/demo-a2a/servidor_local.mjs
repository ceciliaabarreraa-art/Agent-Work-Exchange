// Self-service local exclusivamente sintético: no acepta archivos diferentes de las fixtures.
// Ninguna firma, cobro, entrega o saldo es real. Node.js 20+, sin paquetes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha256,signDemo,QuoteBook,FakeEscrow,validatePolicy} from './lib.mjs';
const here=new URL('.',import.meta.url),fixtures=new URL('../04_Motor/fixtures/',import.meta.url);
const [policy,html,happy,blocked,source,evidence]=await Promise.all([
 readFile(new URL('politica_solo_simulacion.json',here),'utf8').then(JSON.parse),readFile(new URL('self_service.html',here),'utf8'),
 readFile(new URL('archivo_1_fila_ficticio.csv',here),'utf8'),readFile(new URL('feed_google_entrada.csv',fixtures),'utf8'),
 readFile(new URL('fuente_autorizada.csv',fixtures),'utf8'),readFile(new URL('evidencia_pagina_y_checkout_SIMULADA.csv',fixtures),'utf8')]);
validatePolicy(policy);
const allow=new Set([sha256(happy),sha256(blocked)]);
function envelope(job,feed){return {format:'csv',feed,source,evidence,policy:{job_id:job,market:'US',currency:'USD',evaluation_time:'2026-11-09T15:00:00Z',max_source_age_minutes:60,safe_rules:['CONDITION_CANONICAL_V1'],authorization:{market:'US',currency:'USD',fields:['price','availability'],approved_by:'operador-ficticio-solo-test',approval_ref:'autorizacion-ficticia',source_ref:'fuente_sintetica.csv',evidence_ref:'evidencia_sintetica.csv',revoked:false,valid_from:'2026-11-09T14:00:00Z',valid_until:'2026-11-09T16:00:00Z'}}};}
async function prepare(input){
 const child=fork(fileURLToPath(new URL('feedfix_agent.mjs',here)),[],{stdio:['ignore','ignore','inherit','ipc']});let n=0;
 function call(type,extra={}){return new Promise((resolve,reject)=>{
  const id='browser-msg-'+(++n);let finished=false;
  function done(error,value){if(finished)return;finished=true;clearTimeout(timer);child.off('message',receive);child.off('error',onError);child.off('exit',onExit);error?reject(error):resolve(value);}
  function receive(r){if(r?.id!==id)return;if(r.type==='ERROR')return done(Error('FEEDFIX_ERROR'));if(r.from!=='FeedFix'||r.to!=='FeedFix Sales'||r.mode!=='SYNTHETIC_ONLY')return done(Error('IPC_INVALID'));done(null,r);}
  function onError(){done(Error('IPC_FAILED'));}function onExit(){done(Error('FEEDFIX_EXIT'));}
  const timer=setTimeout(()=>done(Error('FEEDFIX_TIMEOUT')),10000);child.on('message',receive);child.once('error',onError);child.once('exit',onExit);
  child.send({id,from:'FeedFix Sales',to:'FeedFix',mode:'SYNTHETIC_ONLY',type,...extra});
 });}
 try{
  const c=await call('CAPABILITIES_REQUEST');for(const k of policy.capabilities_enabled)if(!c.capabilities.includes(k))throw Error('CAPABILITY_MISSING');
  const r=await call('PREPARE_SYNTHETIC_JOB',{input});return {...r,feedfix_pid:child.pid,sales_pid:process.pid};
 }finally{if(child.connected)child.disconnect();}
}
async function body(req){let size=0,large=false,parts=[];for await(const c of req){size+=c.length;if(size>16384)large=true;else parts.push(c);}if(large)throw Object.assign(Error('REQUEST_LIMIT'),{status:413});try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Object.assign(Error('JSON_INVALID'),{status:400});}}
function send(res,status,data,type='application/json; charset=utf-8'){
 res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','x-feedfix-synthetic-only':'true'});res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
export function createDemoServer(){
 const jobs=new Map(),quotes=new QuoteBook(policy);let requests=0;
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://demo.invalid').pathname;
   if(req.method==='GET'&&path==='/')return send(res,200,html,'text/html; charset=utf-8');
   if(req.method==='GET'&&path==='/fixture-1.csv')return send(res,200,happy,'text/csv; charset=utf-8');
   if(req.method==='GET'&&path==='/fixture-6.csv')return send(res,200,blocked,'text/csv; charset=utf-8');
   if(req.method==='POST'&&path==='/api/cotizar'){
    if(++requests>50)throw Object.assign(Error('DEMO_RUN_CAP'),{status:429});
    const data=await body(req);if(typeof data.feed!=='string'||!allow.has(sha256(data.feed)))throw Object.assign(Error('SOLO_SE_ADMITEN_FIXTURES_SINTETICOS_EXACTOS'),{status:400});
    const id='demo-'+randomUUID(),pre=await prepare(envelope(id,data.feed)),r=pre.result;
    if(!pre.feedfix_pid||pre.feedfix_pid===pre.sales_pid)throw Error('TWO_PROCESS_REQUIRED');
    const base={mode:'SYNTHETIC_ONLY',job_id:id,rows:r.rows,changes:r.changes.length,issues:r.issues.length,status:r.status,output_label:r.output_label,
     on_chain_submission_allowed:r.on_chain_submission_allowed,real_payment:false,real_near:false,procesos_separados:pre.feedfix_pid!==pre.sales_pid};
    if(r.issues.length||r.status!=='PARTIAL_REVIEW_REQUIRED'||!r.changes.length)return send(res,200,{...base,phase:'BLOCKED',note:'Sin cotización, sin cobro y sin entrega: el fixture tiene pendientes.'});
    const quote=quotes.quote(r.rows,Buffer.byteLength(data.feed));jobs.set(id,{quote,result:r,hash:pre.artifact_sha256});
    return send(res,200,{...base,phase:'QUOTED_FAKE',quote,artifact_sha256:pre.artifact_sha256,note:'Precio y pago ficticios. El archivo sigue NO_APTO.'});
   }
   if(req.method==='POST'&&path==='/api/pago-ficticio'){
    const d=await body(req),j=jobs.get(d.job_id);if(!j)throw Object.assign(Error('ORDEN_FICTICIA_NO_ENCONTRADA'),{status:404});
    if(j.response)return send(res,200,{...j.response,replay:true});
    const ledger=new FakeEscrow(d.job_id,j.quote,policy),event={id:'fake_payment_'+d.job_id,mode:'SYNTHETIC_ONLY',status:'PAID_FAKE',job_id:d.job_id,amount_cents:j.quote.amount_cents,currency:j.quote.currency};
    ledger.receive(event,signDemo(event));ledger.deliver(j.hash,j.result);ledger.releaseByDeterministicGuard();const seller=ledger.balanceSeller,treasury=ledger.balanceTreasury;ledger.withdrawSeller();
    j.response={mode:'SYNTHETIC_ONLY',job_id:d.job_id,phase:'WITHDRAWN_FAKE',real_payment:false,real_near:false,real_money_moved:false,
     on_chain_submission_allowed:false,output_label:'NO_APTO',artifact_sha256:j.hash,amount_cents:j.quote.amount_cents,seller_cents:seller,treasury_cents:treasury,
     corrected_feed:j.result.corrected_feed,audit_csv:j.result.safe_audit_csv,note:'Webhook, entrega, release y retiro ficticios. No son pago ni NEAR reales.'};
    return send(res,200,j.response);
   }
   return send(res,404,{error:'NOT_FOUND',mode:'SYNTHETIC_ONLY'});
  }catch(e){return send(res,e.status||400,{error:e.message||'ERROR_CLOSED',mode:'SYNTHETIC_ONLY'});}
 });
 server.requestTimeout=15000;server.headersTimeout=16000;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT||'8797');if(!Number.isInteger(port)||port<1||port>65535)throw Error('PUERTO_INVALIDO');
 createDemoServer().listen(port,'0.0.0.0',()=>console.log(`DEMO SINTETICA: puerto ${port}; solo fixtures; no usar datos reales.`));
}
