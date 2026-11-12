// Solo prueba sintética. Archivo temporal de plan: no contiene credenciales.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPlan} from '../src/coordinator.mjs';
import {repairFeed} from '../src/engine.mjs';
const [parsedPath,outPath]=process.argv.slice(2);
if(!parsedPath||!outPath) throw Error('uso: node make_cloud_plan.mjs parsed.json plan.json');
const input=JSON.parse(await readFile(new URL('../fixtures/500_casi_1MiB.json',import.meta.url),'utf8'));
const parsed=JSON.parse(await readFile(parsedPath,'utf8'));
const plan=createPlan(input,parsed,5), whole=repairFeed(input);
const expected=plan.batches.map(b=>{const r=repairFeed(b.input,b.context);return {rows:r.rows,changes:r.changes,issues:r.issues,corrected_feed:r.corrected_feed,status:r.status,on_chain_submission_allowed:r.on_chain_submission_allowed,on_merchant_upload_allowed:r.on_merchant_upload_allowed};});
const sha=x=>createHash('sha256').update(x).digest('hex');
await writeFile(outPath,JSON.stringify({batches:plan.batches,expected,expected_whole:{feed_sha256:sha(whole.corrected_feed),rows:whole.rows,changes:whole.changes.length,issues:whole.issues.length,status:whole.status},header:plan.feed.headers.join(plan.feed.delimiter),newline:plan.feed.newline}));
