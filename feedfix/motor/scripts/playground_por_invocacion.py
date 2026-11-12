#!/usr/bin/env python3
"""Muestras con pausas por invocación en Playground. No es cuenta Free ni pruebas de memoria."""
import datetime,hashlib,json,statistics,subprocess,sys,tempfile,time,uuid
from pathlib import Path
from urllib.parse import parse_qs,urlparse
import requests,websocket
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'results'/'playground_muestras_1_fila.json';BASE='https://workers.cloudflare.com/playground/'
names=['cloud_worker.mjs','incremental_parser.mjs','engine.mjs','delimited.mjs'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rpt={'method':'Cloudflare Playground anónimo; trace-v1; muestras sintéticas por invocación',
 'session_date_instructed':'2026-11-09','system_utc_observed':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'clock_warning':'El reloj del sistema difiere de la fecha local indicada en la sesión.',
 'warning':'Ni cuenta Free ni enforcement ni isolate/memoria; NO prueba el coordinador/ensamblado cloud.',
 'sources':{n:sha(ROOT/'src'/n) for n in names},'attempts':[],'summary':{},'errors':[]}
def save():OUT.write_text(json.dumps(rpt,indent=2,ensure_ascii=False)+'\n')
s=requests.Session();s.headers['User-Agent']='Mozilla/5.0 FeedFixSyntheticSamples/1.0';ws=None
try:
 with tempfile.TemporaryDirectory(prefix='feedfix-samples-') as td:
  casesfile=Path(td)/'cases.json';subprocess.run(['node',str(ROOT/'scripts'/'make_cloud_cases.mjs'),str(casesfile)],check=True,timeout=60);cases=json.loads(casesfile.read_text())
  r=s.get(BASE,timeout=25);r.raise_for_status();files={'metadata':('metadata',json.dumps({'main_module':'cloud_worker.mjs','compatibility_date':'2025-09-24'}),'application/json')}
  for n in names:files[n]=(n,(ROOT/'src'/n).read_bytes(),'application/javascript+module')
  r=s.post(BASE+'api/worker',files=files,headers={'Origin':'https://workers.cloudflare.com','Referer':BASE},timeout=60);r.raise_for_status();d=r.json()
  ws=websocket.create_connection(d['tail'],timeout=4,origin='https://workers.cloudflare.com',subprotocols=['trace-v1']);host='https://bench-'+uuid.uuid4().hex[:12]+'.cloudflarepreviews.com'
  for case,variants in cases.items():
   accepted=0
   for attempt in range(20):
    if accepted>=12:break
    sample=f'{case}-{attempt}';variant=variants[attempt%len(variants)];path='/parse' if case=='parse' else '/batch'
    start=time.monotonic();r=s.post(host+path+'?sample='+sample,json=variant['body'],headers={'cf-raw-http':'true','x-cf-token':d['preview']},timeout=40)
    item={'case':case,'attempt':attempt,'http_status':r.status_code,'http_elapsed_ms_with_network':round((time.monotonic()-start)*1000,2),'trace':None}
    if r.status_code!=200 or r.headers.get('cf-ew-status')!='200':raise RuntimeError(f'{sample}: HTTP {r.status_code}, {r.text[:120]}')
    if r.json()!=variant['expected']:raise RuntimeError(f'{sample}: resultado distinto al motor local')
    item['functional_match']=True
    try:
     deadline=time.monotonic()+4
     while time.monotonic()<deadline:
      raw=ws.recv();evt=json.loads(raw.decode() if isinstance(raw,bytes) else raw);q=parse_qs(urlparse(evt.get('event',{}).get('request',{}).get('url','')).query)
      if q.get('sample')==[sample]:
       item['trace']={'cpu_ms':evt.get('cpuTime'),'wall_ms':evt.get('wallTime'),'outcome':evt.get('outcome')};break
    except websocket.WebSocketTimeoutException:pass
    if item['trace'] and item['trace']['outcome']=='ok' and isinstance(item['trace']['cpu_ms'],(int,float)):
     item['warmup']=accepted<2;accepted+=1
    rpt['attempts'].append(item);save();print(case,attempt,'trace',item['trace'],flush=True);time.sleep(.15)
  for case in cases:
   attempts=[i for i in rpt['attempts'] if i['case']==case];measured=[i['trace']['cpu_ms'] for i in attempts if i.get('trace') and i['trace']['outcome']=='ok' and not i.get('warmup',False)]
   rpt['summary'][case]={'http_calls':len(attempts),'http_success':sum(i['http_status']==200 for i in attempts),'traces_received':sum(bool(i['trace']) for i in attempts),
    'missing_trace':sum(not i['trace'] for i in attempts),'warmups':sum(i.get('warmup',False) for i in attempts),
    'measured':len(measured),'min_cpu_ms':min(measured) if measured else None,'median_cpu_ms':statistics.median(measured) if measured else None,'max_cpu_ms':max(measured) if measured else None,'over_10ms':sum(x>10 for x in measured)}
except Exception as e:
 rpt['errors'].append({'type':type(e).__name__,'message':str(e)[:200]});print('ERROR',str(e)[:200],file=sys.stderr);save();raise
finally:
 if ws:
  try:ws.close()
  except Exception:pass
 rpt['system_ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
print('SUMMARY',json.dumps(rpt['summary'],ensure_ascii=False),flush=True)
