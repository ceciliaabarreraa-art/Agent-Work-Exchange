// Ejecuta dos actores en procesos separados. No pide interacción tras arrancar.
// Todo dato/identidad/precio/pago/saldo es sintético. No abre red ni toca NEAR.
import {fork} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseDelimited,serializeDelimited} from '../04_Motor/src/delimited.mjs';
import {sha256,signDemo,QuoteBook,FakeEscrow,validatePolicy} from './lib.mjs';
const here=new URL('.',import.meta.url), fixtures=new URL('../04_Motor/fixtures/',import.meta.url), out=new URL('./resultados/',import.meta.url);
const arg=process.argv.includes('--bloqueado')?'blocked':'happy';
const read=async n=>readFile(new URL(n,fixtures),'utf8');
const policy=validatePolicy(JSON.parse(await readFile(new URL('politica_solo_simulacion.json',here),'utf8')));
const job='demo-'+(arg==='happy'?'001':'blocked');
const original=await read('feed_google_entrada.csv');const table=parseDelimited(original);
if(arg==='happy')table.records=table.records.slice(0,1);
const feed=serializeDelimited(table);
const input={format:'csv',feed,source:await read('fuente_autorizada.csv'),evidence:await read('evidencia_pagina_y_checkout_SIMULADA.csv'),
 policy:{job_id:job,market:'US',currency:'USD',evaluation_time:'2026-11-09T15:00:00Z',max_source_age_minutes:60,safe_rules:['CONDITION_CANONICAL_V1'],
 authorization:{market:'US',currency:'USD',fields:['price','availability'],approved_by:'operador-ficticio-solo-test',approval_ref:'autorizacion-ficticia',source_ref:'fuente_sintetica.csv',evidence_ref:'evidencia_sintetica.csv',revoked:false,valid_from:'2026-11-09T14:00:00Z',valid_until:'2026-11-09T16:00:00Z'}}};
const trace=[];const emit=(type,data={})=>{trace.push({seq:trace.length+1,mode:'SYNTHETIC_ONLY',type,...data});console.log(`${String(trace.length).padStart(2,'0')} ${type}`,JSON.stringify(data));};
const child=fork(fileURLToPath(new URL('./feedfix_agent.mjs',here)),[],{stdio:['ignore','ignore','inherit','ipc']});
let seq=0;
function call(type,extra={}){return new Promise((resolve,reject)=>{
 const id='msg-'+(++seq), timer=setTimeout(()=>{child.off('message',recv);reject(Error('FEEDFIX_TIMEOUT'));},10000);
 function recv(r){if(r?.id!==id)return;clearTimeout(timer);child.off('message',recv);if(r.type==='ERROR')return reject(Error(r.code));if(r.from!=='FeedFix'||r.to!=='FeedFix Sales'||r.mode!=='SYNTHETIC_ONLY')return reject(Error('INVALID_RESPONSE'));resolve(r);}
 child.on('message',recv);child.send({id,from:'FeedFix Sales',to:'FeedFix',mode:'SYNTHETIC_ONLY',type,...extra});
});}
try {
 emit('POLITICA_DEMO_PREDEFINIDA',{policy_id:policy.policy_id,real_payment_enabled:false,real_email_enabled:false,real_near_signing_enabled:false});
 emit('CLIENTE_FICTICIO_SUBE_FEED',{rows:table.records.length,input_sha256:sha256(feed),note:'El comercio real solo está modelado; no hay formulario ni cuenta real.'});
 const cap=await call('CAPABILITIES_REQUEST');
 for(const required of policy.capabilities_enabled)if(!cap.capabilities.includes(required))throw Error('CAPABILITY_NOT_ENABLED');
 emit('A2A_SALES_CONSULTA_FEEDFIX',{engine_version:cap.engine_version,capabilities:cap.capabilities,sales_pid:process.pid,feedfix_pid:child.pid,procesos_separados:process.pid!==child.pid});
 const pre=await call('PREPARE_SYNTHETIC_JOB',{input});const result=pre.result;
 emit('A2A_FEEDFIX_PREPARA_ARCHIVO',{rows:result.rows,changes:result.changes.length,issues:result.issues.length,status:result.status,output_label:result.output_label,can_submit_real_near:result.on_chain_submission_allowed,artifact_sha256:pre.artifact_sha256});
 await mkdir(out,{recursive:true});
 if(result.issues.length || result.status!=='PARTIAL_REVIEW_REQUIRED' || !result.changes.length){
  emit('BLOQUEADO_SIN_COBRO_NI_PAGO',{reason:'La tarea tiene incidencias, no hay un resultado parcial sin bloqueos que el simulador pueda evaluar.',fake_payment:false});
 }else{
  const quote=new QuoteBook(policy).quote(result.rows,Buffer.byteLength(feed));
  emit('COTIZACION_FICTICIA_POR_TABLA',{amount_cents:quote.amount_cents,currency:quote.currency,discount_bps:0,note:'Precio ficticio no aprobado; NO promesa de aptitud Google.'});
  emit('LINK_DE_PAGO_FICTICIO',{url:`https://checkout.example.invalid/synthetic/${job}`,real_link:false});
  const ledger=new FakeEscrow(job,quote,policy);
  const event={id:'fake_payment_001',mode:'SYNTHETIC_ONLY',status:'PAID_FAKE',job_id:job,amount_cents:quote.amount_cents,currency:quote.currency};
  ledger.receive(event,signDemo(event));
  emit('WEBHOOK_FICTICIO_VERIFICADO',{signature:'HMAC de prueba; no firma de Stripe ni Mercado Pago',state:ledger.state});
  ledger.deliver(pre.artifact_sha256,result);
  emit('ENTREGA_FICTICIA',{state:ledger.state,artifact_sha256:pre.artifact_sha256,label:'NO_APTO',note:'Entrega parcial sintética sin aprobación Google ni autorización on-chain.'});
  ledger.releaseByDeterministicGuard();
  emit('RELEASE_FAKE_SALDOS_INTERNOS',{state:ledger.state,seller_cents:ledger.balanceSeller,treasury_cents:ledger.balanceTreasury,note:'Guardia determinista ficticia, no verifier NEAR; contradicción con permiso on-chain evitada: no se envía.'});
  const withdrawn=ledger.withdrawSeller();
  emit('WITHDRAW_FAKE',{state:ledger.state,seller_cents:withdrawn,note:'Asiento simulado: no es retiro NEAR, transferencia ni dinero.'});
  await writeFile(new URL('NO_APTO_feed_sintetico.csv',out),result.corrected_feed);
  await writeFile(new URL('auditoria_sintetica.csv',out),result.safe_audit_csv);
 }
 const summary={mode:'SYNTHETIC_ONLY',scenario:arg,actors:['FeedFix Sales','FeedFix'],operator_interventions_after_start:0,
  buyer:'fixture sintética, no un agente',real_money_moved:false,real_email_sent:false,real_near_transaction:false,
  real_marketplace_call:false,real_on_chain_submission_allowed:false,result_status:result.status,rows:result.rows,changes:result.changes.length,issues:result.issues.length,trace};
 await writeFile(new URL(arg==='happy'?'traza_sintetica.json':'traza_bloqueado.json',out),JSON.stringify(summary,null,2)+'\n');
 console.log('\nFIN: toda la cadena es sintética; la ausencia de incidencias parciales no certifica Google ni autoriza NEAR.');
}catch(e){emit('ERROR_DEMO_CERRADA',{error:String(e.message).slice(0,100)});process.exitCode=1;}
finally{child.disconnect();}
