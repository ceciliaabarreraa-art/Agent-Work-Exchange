// Harness de ensayo solamente: sin autenticación, no desplegar ni usar con datos reales.
import { repairFeed, ENGINE_VERSION } from './engine.mjs';
import { FeedError } from './delimited.mjs';
const BODY_LIMIT = 3 * 1024 * 1024;
const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const response = (x, status=200) => new Response(JSON.stringify(x), {status,headers});
async function boundedBody(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length)>BODY_LIMIT)) throw new FeedError('CUERPO_DEMASIADO_GRANDE');
  if (!request.body) throw new FeedError('CUERPO_REQUERIDO');
  const reader = request.body.getReader(), parts = []; let size = 0;
  for (;;) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) { await reader.cancel(); throw new FeedError('CUERPO_DEMASIADO_GRANDE'); }
    parts.push(value);
  }
  const joined = new Uint8Array(size); let off=0;
  for (const p of parts) { joined.set(p,off); off+=p.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)); }
  catch { throw new FeedError('JSON_O_UTF8_INVALIDO'); }
}
export default {
  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/health') return response({ok:true, version:ENGINE_VERSION, mode:'solo-sintetico-no-produccion'});
      if (request.method !== 'POST' || path !== '/repair') return response({error:'RUTA_NO_DISPONIBLE'},404);
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return response({error:'JSON_REQUERIDO'},415);
      return response(repairFeed(await boundedBody(request)));
    } catch (e) {
      return e instanceof FeedError ? response({error:e.code},400) : response({error:'ERROR_INTERNO'},500);
    }
  }
};
