// Agente FeedFix aislado en un proceso hijo de la demo. Sin red ni claves.
import {runLocal} from '../04_Motor/src/coordinator.mjs';
import {ENGINE_VERSION} from '../04_Motor/src/engine.mjs';
import {sha256} from './lib.mjs';
const capabilities=['CSV_TSV_INCREMENTAL_1M_500','CONDITION_CANONICAL_V1','AUTHORIZED_PRICE_AND_AVAILABILITY_WITH_SIMULATED_EVIDENCE'];
if(!process.send)throw Error('Este agente solo se inicia mediante demo.mjs en modo sintético');
process.on('message',msg=>{
 try{
  if(msg?.mode!=='SYNTHETIC_ONLY'||msg.from!=='FeedFix Sales'||msg.to!=='FeedFix'||typeof msg.id!=='string')throw Error('INVALID_MESSAGE');
  if(msg.type==='CAPABILITIES_REQUEST')return process.send({id:msg.id,from:'FeedFix',to:'FeedFix Sales',mode:'SYNTHETIC_ONLY',type:'CAPABILITIES_RESPONSE',engine_version:ENGINE_VERSION,capabilities});
  if(msg.type==='PREPARE_SYNTHETIC_JOB'){
   if(!msg.input?.policy?.job_id?.startsWith('demo-'))throw Error('NOT_SYNTHETIC_JOB');
   const result=runLocal(msg.input,1);
   return process.send({id:msg.id,from:'FeedFix',to:'FeedFix Sales',mode:'SYNTHETIC_ONLY',type:'JOB_RESULT',result,artifact_sha256:sha256(result.corrected_feed)});
  }
  throw Error('UNKNOWN_MESSAGE');
 }catch(e){process.send({id:msg?.id,from:'FeedFix',to:'FeedFix Sales',mode:'SYNTHETIC_ONLY',type:'ERROR',code:String(e?.code||e?.message||'ERROR').slice(0,80)});}
});
