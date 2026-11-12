import unittest
from discovery import evaluate,rank,blocked,host_of

def proof():return {k:True for k in ['issue_current_verified','us_verified','site_owner_verified','own_email_verified','within_scope','source_fresh','provider_permitted','sender_approved','not_suppressed']}
def candidate(kind='store',text='Our store has a Google Merchant Center product feed mismatch.',**more):
 return {'url':'https://seller.invalid/post','title':'test','text':text,'kind':kind,'store_hint':True,'proofs':proof(),**more}
class DiscoveryTests(unittest.TestCase):
 def test_batch3_does_not_require_ai(self):
  r=evaluate(candidate(),'synthetic');self.assertEqual(r['research_batch'],3);self.assertFalse(r['ai_signal']);self.assertTrue(r['would_pass_synthetic_gate']);self.assertFalse(r['eligible_to_send'])
 def test_bands_1_and_2_need_ai(self):
  r=evaluate(candidate('startup','Our store has a Google Merchant Center product feed error and AI tools.'),'synthetic');self.assertEqual(r['research_batch'],1)
  a=evaluate(candidate('agency','Our agency has Google Shopping feed errors and artificial intelligence.'),'synthetic');self.assertEqual(a['research_batch'],2)
 def test_score_0_1_2(self):
  self.assertEqual(evaluate(candidate(text='Our store sells shirts'),'synthetic')['score'],0)
  self.assertEqual(evaluate(candidate(),'synthetic')['score'],1)
  self.assertEqual(evaluate(candidate(text='Google Merchant Center product feed error with AI'),'synthetic')['score'],2)
 def test_never_treat_keyword_as_real_proof(self):
  r=evaluate(candidate(text='Google Merchant Center feed error and AI'),'real');self.assertFalse(r['eligible_to_send']);self.assertIn('PROBLEMA_ACTUAL_NO_VERIFICADO_AUTOMATICAMENTE',r['reasons'])
 def test_us_unverified_fails_synthetic_gate(self):
  p=proof();p['us_verified']=False;r=evaluate(candidate(proofs=p),'synthetic');self.assertFalse(r['would_pass_synthetic_gate'])
 def test_history_resolved_fails_synthetic(self):
  r=evaluate(candidate(text='Our Google Merchant Center feed issue was resolved yesterday'),'synthetic');self.assertFalse(r['would_pass_synthetic_gate'])
 def test_platform_and_credentials_blocked(self):
  self.assertTrue(blocked('https://community.shopify.com/post'));self.assertTrue(blocked('https://www.linkedin.com/in/a'));self.assertTrue(blocked('https://user:pass@shop.invalid/'));self.assertTrue(blocked('http://shop.invalid/'))
 def test_dedup_and_sort(self):
  a=[candidate(url='https://zz.invalid/a'),candidate('agency','Our agency has AI and Google shopping feed error',url='https://aa.invalid/a'),candidate(url='https://zz.invalid/b')]
  r=rank(a,'real');self.assertEqual(len(r),2);self.assertEqual(r[0]['research_batch'],2)
 def test_synthetic_rejects_real_domains(self):
  with self.assertRaises(ValueError):evaluate(candidate(url='https://example.com/test'),'synthetic')
if __name__=='__main__':unittest.main(verbosity=2)
