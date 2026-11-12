#!/usr/bin/env python3
"""Recorre un feed sintético íntegro vía Playground; NO despliega en cuenta ni prueba Free.
Local: coordinación, índices y montaje. Playground: cada parseChunk y cada lote de reglas.
No se guardan ni tokens/URL de sesión ni los cuerpos de las respuestas, solo métricas y hashes.
"""
import base64,datetime,hashlib,json,os,statistics,subprocess,sys,tempfile,threading,time,uuid
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import requests,websocket
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'results'/'playground_incremental.json'; BASE='https://workers.cloudflare.com/playground/'
work=json.loads((ROOT/'fixtures'/'500_casi_1MiB.json').read_text())
names=['cloud_worker.mjs','incremental_parser.mjs','engine.mjs','delimited.mjs']
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
res={'method':'Cloudflare Playground anónimo, protocolo trace-v1; solo datos sintéticos',
 'scope':'parseChunk y lotes remotos; coordinador, globalCounts y ensamblado en Node/Python local',
 'not_tested':['cuenta Free y enforcement','memoria isolate','orquestador durable cloud','storage cloud','entrada de cliente real'],
 'session_date_instructed':'2026-11-09','system_utc_observed':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'warning_clock':'El reloj del sistema difiere de la fecha local indicada para la sesión.',
 'compatibility_date':'2025-09-24','source_sha256':{n:hashfile(ROOT/'src'/n) for n in names},
 'invocations':[],'errors':[],'summary':{}}
def save():OUT.write_text(json.dumps(res,ensure_ascii=False,indent=2)+'\n')
s=requests.Session();s.headers['User-Agent']='Mozilla/5.0 FeedFixSyntheticIncremental/1.0'
ws=None; stop=threading.Event(); traces={}; lock=threading.Lock();received_nonmatching=0
try:
 r=s.get(BASE,timeout=25);r.raise_for_status()
 files={'metadata':('metadata',json.dumps({'main_module':'cloud_worker.mjs','compatibility_date':'2025-09-24'}),'application/json')}
 for n in names:files[n]=(n,(ROOT/'src'/n).read_bytes(),'application/javascript+module')
 r=s.post(BASE+'api/worker',files=files,headers={'Origin':'https://workers.cloudflare.com','Referer':BASE},timeout=60);r.raise_for_status();session=r.json()
 if not isinstance(session.get('tail'),str) or not isinstance(session.get('preview'),str):raise RuntimeError('Playground no devolvió preview y tail')
 ws=websocket.create_connection(session['tail'],timeout=1,origin='https://workers.cloudflare.com',subprotocols=['trace-v1'])
 def receive():
  global received_nonmatching
  while not stop.is_set():
   try:
    raw=ws.recv(); event=json.loads(raw.decode() if isinstance(raw,bytes) else raw)
    qs=parse_qs(urlparse(event.get('event',{}).get('request',{}).get('url','')).query); sid=qs.get('sample',[None])[0]
    if sid:
     with lock:traces[sid]={'cpu_ms':event.get('cpuTime'),'wall_ms':event.get('wallTime'),'outcome':event.get('outcome')}
    else:received_nonmatching+=1
   except websocket.WebSocketTimeoutException:continue
   except Exception:break
 thread=threading.Thread(target=receive,daemon=True);thread.start()
 host=f'https://bench-{uuid.uuid4().hex[:12]}.cloudflarepreviews.com'
 def post(path,data,sid):
  start=time.monotonic()
  r=s.post(host+path+'?sample='+sid,json=data,headers={'cf-raw-http':'true','x-cf-token':session['preview']},timeout=40)
  item={'id':sid,'phase':path[1:],'http_status':r.status_code,'http_elapsed_ms_with_network':round((time.monotonic()-start)*1000,2)}
  res['invocations'].append(item)
  if r.status_code!=200 or r.headers.get('cf-ew-status')!='200':raise RuntimeError(f'{sid}: HTTP {r.status_code}: {r.text[:150]}')
  return r.json()
 def new_state(delim):return {'v':1,'delimiter':delim,'mode':'start','field':'','cells':[],'line':1,'recordLine':1,'recordUnits':0,'rows':0,'headers':None,'bom':False,'atStart':True,'totalBytes':0,'pendingUtf8':[],'pendingCR':'','firstNewline':None,'endedNewline':False,'done':False}
 parsed={}
 for part in ['feed','source','evidence']:
  data=work[part].encode('utf8');state=new_state(',' if part!='feed' or work['format']=='csv' else '\t');records=[]
  for offset in range(0,len(data),4096):
   chunk=data[offset:offset+4096];sid=f'p-{part}-{offset//4096}'
   reply=post('/parse',{'state':state,'chunk_base64':base64.b64encode(chunk).decode(),'final':offset+4096>=len(data)},sid)
   state=reply['state'];records.extend(reply['records'])
   if offset//4096%50==0:print(part,offset,'/',len(data),flush=True)
  if not state['done'] or state['rows']!=len(records):raise RuntimeError('parse incompleto '+part)
  parsed[part]={'headers':state['headers'],'delimiter':state['delimiter'],'bom':state['bom'],'newline':state['firstNewline'] or '\n','terminalNewline':state['endedNewline'],'records':records}
 with tempfile.TemporaryDirectory(prefix='feedfix-cloud-') as td:
  raw=Path(td)/'parsed.json';planpath=Path(td)/'plan.json';raw.write_text(json.dumps(parsed,ensure_ascii=False))
  subprocess.run(['node',str(ROOT/'scripts'/'make_cloud_plan.mjs'),str(raw),str(planpath)],check=True,timeout=80,capture_output=True,text=True)
  plan=json.loads(planpath.read_text());assembled=plan['header']+plan['newline'];changes=issues=rows=0
  for i,(body,expected) in enumerate(zip(plan['batches'],plan['expected'])):
   reply=post('/batch',body,f'b-{i}')
   actual={k:reply.get(k) for k in expected}
   if actual!=expected:raise RuntimeError(f'diferencia respecto del motor local en lote {i}')
   first,tail=reply['corrected_feed'].split(plan['newline'],1)
   if first!=plan['header']:raise RuntimeError('cabecera lote diferente')
   assembled+=tail;changes+=len(reply['changes']);issues+=len(reply['issues']);rows+=reply['rows']
   if i%20==0:print('batch',i,'/',len(plan['batches']),flush=True)
  got=hashlib.sha256(assembled.encode()).hexdigest();expected=plan['expected_whole']
  if got!=expected['feed_sha256'] or (rows,changes,issues)!=(expected['rows'],expected['changes'],expected['issues']):raise RuntimeError('hash o totales de salida diferente')
  res['functional']={'input_bytes':len(work['feed'].encode()),'input_rows':len(parsed['feed']['records']),
    'source_rows':len(parsed['source']['records']),'evidence_rows':len(parsed['evidence']['records']),
    'batch_size':5,'batches':len(plan['batches']),'output_sha256':got,
    'changes':changes,'issues':issues,'status':expected['status'],
    'note':'Cada lote comparado íntegramente con motor local; hash/totales del resultado ensamblado; entrada sintética.'}
 # Dar tiempo al tail para drenar; no se reintentan ni se ocultan trazas ausentes.
 time.sleep(4)
 for item in res['invocations']:
  with lock:t=traces.get(item['id'])
  item['trace']=t
 for phase in ['parse','batch']:
  calls=[x for x in res['invocations'] if x['phase']==phase]
  cpus=[x['trace']['cpu_ms'] for x in calls if x.get('trace') and x['trace']['outcome']=='ok' and isinstance(x['trace'].get('cpu_ms'),(int,float))]
  res['summary'][phase]={'http_calls':len(calls),'successful_http':sum(x['http_status']==200 for x in calls),'traces_received':len(cpus),
   'trace_missing_or_invalid':len(calls)-len(cpus),'cpu_ms_min':min(cpus) if cpus else None,
   'cpu_ms_median':statistics.median(cpus) if cpus else None,'cpu_ms_max':max(cpus) if cpus else None,
   'cpu_over_10ms':sum(x>10 for x in cpus)}
except Exception as e:
 res['errors'].append({'type':type(e).__name__,'message':str(e)[:300]}); print('ERROR',type(e).__name__,str(e)[:300],file=sys.stderr);save();raise
finally:
 stop.set()
 if ws:
  try:ws.close()
  except Exception:pass
 res['system_ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
print('RESULT',json.dumps({'summary':res['summary'],'functional':res.get('functional')},ensure_ascii=False),flush=True)
