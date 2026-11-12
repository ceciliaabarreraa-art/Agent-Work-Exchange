#!/usr/bin/env python3
"""Lee contrato público de NEAR Testnet; no requiere claves ni realiza cambios."""
import base64,datetime,json,urllib.request,urllib.error
from pathlib import Path
RPC='https://rpc.testnet.near.org'
CONTRACT='escrow.mi-tiendita-madre.testnet'
OUT=Path(__file__).with_name('testnet_solo_lectura_resultado.json')
record={'session_date_instructed':'2026-11-09','system_utc_observed':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'clock_warning':'Reloj del sandbox no coincide con la fecha local de sesión; verificar hora externa antes de inferir vigencias.',
 'rpc':RPC,'contract':CONTRACT,'read_only':True,'transactions_sent':0,'cases':[]}
for method,args in [('get_config',{}),('get_order',{'order_id':0})]:
 case={'method':method,'args':args}
 try:
  b64=base64.b64encode(json.dumps(args,separators=(',',':')).encode()).decode()
  payload={'jsonrpc':'2.0','id':'readonly-feedfix','method':'query','params':{'request_type':'call_function','finality':'final','account_id':CONTRACT,'method_name':method,'args_base64':b64}}
  req=urllib.request.Request(RPC,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST')
  with urllib.request.urlopen(req,timeout=25) as r: response=json.load(r);case['http_status']=r.status
  if 'error' in response:case['error']=response['error']
  elif 'result' in response and 'result' in response['result']:
   case['block_height']=response['result'].get('block_height');case['block_hash']=response['result'].get('block_hash')
   case['value']=json.loads(bytes(response['result']['result']).decode())
  else:case['error']='respuesta inesperada'
 except Exception as e:case['error']=type(e).__name__+': '+str(e)[:300]
 record['cases'].append(case)
OUT.write_text(json.dumps(record,indent=2,ensure_ascii=False)+'\n')
for c in record['cases']:print(c['method'], 'OK' if 'value' in c else 'ERROR',str(c.get('value',c.get('error')))[:500])
