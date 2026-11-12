#!/usr/bin/env python3
"""Discovery de investigación: Exa MCP público o fixtures. Nunca envía email.

- No usa perfiles, comunidades ni plataformas para direcciones o contacto.
- Búsqueda devuelve señales, NO prueba que exista un problema actual ni que Google rechazó nada.
- En modo real, salida SIEMPRE RESEARCH_ONLY; no hay pasarela a envío ni almacenamiento de snippets.
- Modo sintético prueba las puertas de política con datos .invalid, sin representar permisos reales.
"""
import argparse,json,re,sys,urllib.error,urllib.parse,urllib.request

MCP='https://mcp.exa.ai/mcp?tools=web_search_exa'
BLOCKED={'linkedin.com','upwork.com','fiverr.com','freelancer.com','reddit.com','facebook.com','instagram.com','x.com','twitter.com','tiktok.com','youtube.com','community.shopify.com','shopify.com','myshopify.com','google.com','googleusercontent.com','pinterest.com'}
FEED=re.compile(r'\b(?:merchant cent(?:er|re)|google shopping|product feed|shopping feed|feed data)\b',re.I)
PROBLEM=re.compile(r'\b(?:errors?|issues?|mismatch(?:ed|es)?|incorrect|disapprov(?:ed|al)|invalid|outdated|stale|missing|broken|failed|reject(?:ed|ion))\b',re.I)
AI=re.compile(r'\b(?:artificial intelligence|machine learning|generative ai|ai agents?|ai-powered|\bai\b)\b',re.I)
RESOLVED=re.compile(r'\b(?:fixed|resolved|solved|reinstated|repaired)\b',re.I)
AGENCY=re.compile(r'\b(?:agency|agencies|marketing services|ecommerce consulting)\b',re.I)
STARTUP=re.compile(r'\b(?:startup|software|technology company|saas)\b',re.I)
STORE=re.compile(r'\b(?:our store|our shop|our products|buy now|add to cart|online store)\b',re.I)

# Do not reduce by naive eTLD: co.uk and sibling tenants would be accidentally merged.
def host_of(url):
 try:
  u=urllib.parse.urlsplit(url);host=(u.hostname or '').lower().rstrip('.')
  if u.scheme!='https' or not host or u.username or u.password:return ''
  return host[4:] if host.startswith('www.') else host
 except ValueError:return ''

def blocked(url):
 host=host_of(url)
 return not host or any(host==d or host.endswith('.'+d) for d in BLOCKED)

def evaluate(c, mode='real'):
 """Score 0/1/2. Solo fixtures sintéticas pueden probar la decisión hipotética."""
 text=(str(c.get('title',''))+' '+str(c.get('text','')))[:12000]
 feed_signal=bool(FEED.search(text) and PROBLEM.search(text))
 ai_signal=bool(AI.search(text))
 score=int(feed_signal)+int(ai_signal)
 kind=c.get('kind') or ('agency' if AGENCY.search(text) else 'startup' if STARTUP.search(text) else 'store')
 shop=bool(c.get('store_hint',STORE.search(text)))
 research_batch=1 if kind=='startup' and shop and ai_signal else 2 if kind=='agency' and ai_signal else 3
 reasons=[]
 if blocked(c.get('url','')):reasons.append('FUENTE_PLATAFORMA_O_URL_INVALIDA')
 if not feed_signal:reasons.append('SIN_SENAL_DE_PROBLEMA_FEED')
 if RESOLVED.search(text):reasons.append('POSIBLEMENTE_RESUELTO_NO_CONFIRMAR_ACTUALIDAD')
 if research_batch in (1,2) and not ai_signal:reasons.append('SIN_SENAL_IA_PARA_TANDA_1_O_2')
 if mode=='real':
  reasons += ['PROBLEMA_ACTUAL_NO_VERIFICADO_AUTOMATICAMENTE','EEUU_NO_VERIFICADO','DOMINIO_PROPIO_Y_EMAIL_NO_VERIFICADOS','PROVEEDOR_Y_REMITENTE_NO_APROBADOS']
  eligible=False
 elif mode=='synthetic':
  if not host_of(c.get('url','')).endswith('.invalid'):raise ValueError('modo sintético requiere dominio .invalid')
  proofs=c.get('proofs') or {}
  for k in ['issue_current_verified','us_verified','site_owner_verified','own_email_verified','within_scope','source_fresh','provider_permitted','sender_approved','not_suppressed']:
   if proofs.get(k) is not True:reasons.append('PRUEBA_FALTANTE_'+k.upper())
  if kind=='startup' and not shop:reasons.append('TIENDA_PROPIA_NO_COMPROBADA')
  if research_batch==3 and kind!='store':reasons.append('TANDA_3_REQUIERE_COMERCIO')
  eligible=not reasons
 else:raise ValueError('modo inválido')
 return {'domain':host_of(c.get('url','')),'source_url':c.get('url',''),'score':score,'feed_signal':feed_signal,
         'ai_signal':ai_signal,'research_batch':research_batch,'kind_hypothesis':kind,'eligible_to_send':False,
         'would_pass_synthetic_gate':bool(eligible and mode=='synthetic'),
         'mode':'SIMULACION_NO_ENVIA' if mode=='synthetic' else 'RESEARCH_ONLY_NO_ENVIA','reasons':sorted(set(reasons))}

def rank(items, mode='real'):
 out=[evaluate(c,mode) for c in items if not blocked(c.get('url',''))]
 # Primera aparición para conservar la fuente; mejor señal reemplaza la anterior del mismo host.
 best={}
 for c in out:
  old=best.get(c['domain'])
  if old is None or (c['score'],-c['research_batch'])>(old['score'],-old['research_batch']):best[c['domain']]=c
 return sorted(best.values(),key=lambda x:(x['research_batch'],-x['score'],x['domain']))

def _mcp_message(text):
 lines=[x[5:].strip() for x in text.splitlines() if x.startswith('data:')]
 return json.loads('\n'.join(lines) if lines else text) if text.strip() else None

def exa_search(query):
 # Protocolo MCP documentado; la cuota keyless es limitada y puede dejar de responder.
 headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','User-Agent':'FeedFix-research-only/0.1'}
 def send(obj):
  req=urllib.request.Request(MCP,data=json.dumps(obj).encode(),headers=headers,method='POST')
  with urllib.request.urlopen(req,timeout=40) as r:
   sid=r.headers.get('Mcp-Session-Id')
   if sid:headers['Mcp-Session-Id']=sid
   return _mcp_message(r.read().decode('utf-8'))
 send({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'feedfix-research','version':'0.1'}}})
 send({'jsonrpc':'2.0','method':'notifications/initialized'})
 r=send({'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'web_search_exa','arguments':{'query':query,'numResults':8,'type':'auto'}}})
 if not r or 'error' in r or r.get('result',{}).get('isError'):raise RuntimeError('MCP_SEARCH_ERROR')
 text='\n'.join(x.get('text','') for x in r.get('result',{}).get('content',[]) if x.get('type')=='text')
 results=[]
 for block in re.split(r'(?=^Title: )',text,flags=re.M):
  title=re.search(r'^Title:\s*(.+)$',block,re.M);url=re.search(r'^URL:\s*(https://\S+)',block,re.M)
  if title and url:results.append({'title':title.group(1).strip(),'url':url.group(1).strip(),'text':block[:12000]})
 return results

QUERIES=[
 'online store our Google Merchant Center product feed issue mismatch artificial intelligence',
 'ecommerce agency AI Google shopping feed client error mismatch issue',
 'our shop Google Merchant Center product feed mismatch issue site owner',
]

def main():
 ap=argparse.ArgumentParser();g=ap.add_mutually_exclusive_group(required=True)
 g.add_argument('--live-research',action='store_true');g.add_argument('--synthetic',action='store_true')
 ap.add_argument('--summary-only',action='store_true',help='solo contadores; no persiste ni imprime resultados del proveedor')
 a=ap.parse_args()
 if a.synthetic:
  from pathlib import Path
  items=json.loads(Path(__file__).with_name('fixtures_sinteticos.json').read_text());results=rank(items,'synthetic')
 else:
  items=[]
  for q in QUERIES:items.extend(exa_search(q))
  results=rank(items,'real')
 summary={'provider':'Exa MCP anónimo para investigación' if a.live_research else 'fixtures sintéticos .invalid',
          'queries':len(QUERIES) if a.live_research else 0,'returned_before_filter':len(items),
          'unique_nonplatform_candidates':len(results),'eligible_to_send':sum(r['eligible_to_send'] for r in results),
          'would_pass_synthetic_gate':sum(r['would_pass_synthetic_gate'] for r in results),
          'scores':{str(s):sum(r['score']==s for r in results) for s in [0,1,2]},
          'warning':'Señales heurísticas no son evidencia actual; el modo real nunca autoriza envío.'}
 if a.summary_only:print(json.dumps(summary,ensure_ascii=False,indent=2))
 else:print(json.dumps({'summary':summary,'candidates':results},ensure_ascii=False,indent=2))

if __name__=='__main__':
 try:main()
 except Exception as exc:print(json.dumps({'error':type(exc).__name__,'message':str(exc)[:160],'eligible_to_send':0},ensure_ascii=False),file=sys.stderr);sys.exit(2)
