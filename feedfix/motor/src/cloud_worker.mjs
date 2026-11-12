// Endpoint temporal de laboratorio sintético para Cloudflare Playground.
// Carece de autenticación, persistencia, colas, privacidad y operación comercial.
import {parseChunk} from './incremental_parser.mjs';
import {repairFeed} from './engine.mjs';

export default { async fetch(request) {
  const respond=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-feedfix-synthetic-only':'true'}});
  if (request.method!=='POST') return respond({error:'SYNTHETIC_POST_ONLY'},405);
  const p=new URL(request.url).pathname;
  if (!['/parse','/batch'].includes(p)) return respond({error:'NOT_FOUND'},404);
  try {
    const raw=await request.text();
    if (new TextEncoder().encode(raw).length>128*1024) return respond({error:'REQUEST_LIMIT'},413);
    const data=JSON.parse(raw);
    if (p==='/parse') {
      if (typeof data.chunk_base64!=='string'||data.chunk_base64.length>5464) return respond({error:'BLOQUE_INVALIDO'},400);
      let decoded; try { decoded=atob(data.chunk_base64); } catch {return respond({error:'BASE64_INVALIDO'},400);}
      const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
      return respond(parseChunk(data.state,bytes,data.final));
    }
    return respond(repairFeed(data.input,data.context));
  } catch(e) { return respond({error:e?.code||'INVALID_SYNTHETIC_REQUEST'},400); }
} };
