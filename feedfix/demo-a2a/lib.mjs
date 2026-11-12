import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const DEMO_ONLY_KEY='PUBLIC_DEMO_SECRET_NOT_A_PAYMENT_PROVIDER';
export const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');
export const signDemo=event=>createHmac('sha256',DEMO_ONLY_KEY).update(JSON.stringify(event)).digest('hex');
function authenticDemo(event,signature){
 const want=Buffer.from(signDemo(event),'hex'); let got;
 try {got=Buffer.from(signature,'hex');}catch{return false;}
 return got.length===want.length && timingSafeEqual(want,got);
}
export function validatePolicy(p) {
 if (!p || p.mode!=='SYNTHETIC_ONLY'||p.real_email_enabled!==false||p.real_payment_enabled!==false||p.real_near_signing_enabled!==false || p.max_emails_per_run!==0 || p.max_discount_bps!==0 || p.currency!=='USD') throw Error('POLICY_NOT_SYNTHETIC');
 if(!Number.isInteger(p.max_rows)||p.max_rows<1||p.max_rows>500||!Number.isInteger(p.max_feed_bytes)||p.max_feed_bytes>1048576||p.max_feed_bytes<1||!Number.isInteger(p.max_quotes_per_run)||p.max_quotes_per_run<1||p.max_quotes_per_run>10) throw Error('INVALID_LIMITS');
 if(!Number.isInteger(p.marketplace_fee_demo_bps)||p.marketplace_fee_demo_bps<0||p.marketplace_fee_demo_bps>10000) throw Error('INVALID_FEE');
 let previous=0;
 for(const t of p.price_tiers_demo_cents||[]) {if(!Number.isInteger(t.up_to_rows)||t.up_to_rows<=previous||t.up_to_rows>500||!Number.isSafeInteger(t.price_cents)||t.price_cents<1) throw Error('INVALID_TIERS');previous=t.up_to_rows;}
 if(previous!==p.max_rows) throw Error('TIERS_DO_NOT_COVER_MAX');
 return p;
}
export class QuoteBook {
 constructor(policy){this.policy=validatePolicy(policy);this.count=0;}
 quote(rows,bytes){
  if(!Number.isInteger(rows)||rows<1||rows>this.policy.max_rows||!Number.isInteger(bytes)||bytes<1||bytes>this.policy.max_feed_bytes) throw Error('OUT_OF_SCOPE');
  if(this.count>=this.policy.max_quotes_per_run)throw Error('QUOTE_CAP');
  const tier=this.policy.price_tiers_demo_cents.find(x=>rows<=x.up_to_rows);
  this.count++;return {mode:'SYNTHETIC_ONLY',rows,currency:this.policy.currency,amount_cents:tier.price_cents,discount_bps:0};
 }
}
export class FakeEscrow {
 constructor(job,quote,policy){
  if(typeof job!=='string'||!job.startsWith('demo-')||quote?.mode!=='SYNTHETIC_ONLY'||quote.currency!=='USD'||!Number.isSafeInteger(quote.amount_cents)||quote.amount_cents<1||!Number.isInteger(quote.rows)||quote.rows<1)throw Error('INVALID_FAKE_ORDER');
  this.job=job;this.quote=quote;this.policy=validatePolicy(policy);this.state='WAITING_FOR_FAKE_PAYMENT';this.receipts=new Map();this.balanceSeller=0;this.balanceTreasury=0;this.withdrawn=0;
 }
 receive(event,signature){
  if(!authenticDemo(event,signature))throw Error('INVALID_DEMO_SIGNATURE');
  if(event?.mode!=='SYNTHETIC_ONLY'||event.status!=='PAID_FAKE'||event.job_id!==this.job||event.amount_cents!==this.quote.amount_cents||event.currency!==this.quote.currency||typeof event.id!=='string'||!event.id.startsWith('fake_'))throw Error('PAYMENT_MISMATCH');
  const digest=sha256(JSON.stringify(event));
  if(this.receipts.has(event.id)){if(this.receipts.get(event.id)!==digest)throw Error('REPLAY_CONFLICT');return 'IDEMPOTENT';}
  if(this.state!=='WAITING_FOR_FAKE_PAYMENT')throw Error('SECOND_PAYMENT_NOT_ACCEPTED');
  this.receipts.set(event.id,digest);this.state='FUNDED_FAKE';return 'FUNDED_FAKE';
 }
 deliver(hash,result){
  if(this.state!=='FUNDED_FAKE'||!result||result.job_id!==this.job||result.rows!==this.quote.rows||result.output_label!=='NO_APTO'||result.status!=='PARTIAL_REVIEW_REQUIRED'||!Array.isArray(result.issues)||result.issues.length!==0||!Array.isArray(result.changes)||result.changes.length<1 || result.on_chain_submission_allowed!==false || result.on_merchant_upload_allowed!==false)throw Error('NOT_A_VALID_FAKE_DEMO_ARTIFACT');
  if(hash!==sha256(result.corrected_feed))throw Error('HASH_MISMATCH');
  this.hash=hash;this.state='DELIVERED_FAKE';
 }
 releaseByDeterministicGuard(){
  // Infraestructura de verificación ficticia, NO tercer agente. No llama al verificador real.
  if(this.state!=='DELIVERED_FAKE'||this.policy.artificially_allow_simulated_escrow_for_partial_artifact!==true)throw Error('FAKE_RELEASE_NOT_ALLOWED');
  const fee=Math.floor(this.quote.amount_cents*this.policy.marketplace_fee_demo_bps/10000);
  this.balanceTreasury=fee;this.balanceSeller=this.quote.amount_cents-fee;this.state='RELEASED_FAKE';
 }
 withdrawSeller(){
  if(this.state!=='RELEASED_FAKE'||this.balanceSeller<=0)throw Error('NOT_WITHDRAWABLE');
  this.withdrawn=this.balanceSeller;this.balanceSeller=0;this.state='WITHDRAWN_FAKE';return this.withdrawn;
 }
}
