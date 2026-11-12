import {readFile,writeFile} from 'node:fs/promises';
import {newParser,parseChunk} from '../src/incremental_parser.mjs';
import {createPlan} from '../src/coordinator.mjs';
import {repairFeed} from '../src/engine.mjs';
const output=process.argv[2];if(!output)throw Error('output temporal requerido');
const input=JSON.parse(await readFile(new URL('../fixtures/500_casi_1MiB.json',import.meta.url),'utf8'));
const bytes=new TextEncoder().encode(input.feed);let state=newParser(','), parsers=[];
for(let pos=0;pos<bytes.length;pos+=4096){const chunk=bytes.slice(pos,pos+4096),isFinal=pos+4096>=bytes.length;
 const body={state,chunk_base64:Buffer.from(chunk).toString('base64'),final:isFinal};const expected=parseChunk(state,chunk,isFinal);
 if([0,1,64,128,192,255].includes(pos/4096))parsers.push({body,expected});state=expected.state;}
const plan=createPlan(input,null,1), repairs=[0,1,249,499].map(i=>({body:plan.batches[i],expected:repairFeed(plan.batches[i].input,plan.batches[i].context)}));
const single={...input,feed:'id,price,availability,condition,description\nSYN-WORST,19.90 USD,in_stock, New ,'+('x'.repeat(7980))+'\n',source:undefined,evidence:undefined};
const p=createPlan(single,null,1);const worst={body:p.batches[0],expected:repairFeed(p.batches[0].input,p.batches[0].context)};
await writeFile(output,JSON.stringify({parse:parsers,batch1:repairs,batch1_near_record_limit:[worst]}));
