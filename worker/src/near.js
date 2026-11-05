const DEFAULT_RPC = "https://rpc.testnet.near.org";

async function rpc(env, method, params) {
  const response = await fetch(env.NEAR_RPC || DEFAULT_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "agent-marketplace", method, params }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || `NEAR RPC HTTP ${response.status}`);
  return body.result;
}

export async function viewFunction(env, methodName, args = {}) {
  const account_id = env.CONTRACT_ID;
  if (!account_id) throw new Error("CONTRACT_ID is not configured");
  const args_base64 = btoa(unescape(encodeURIComponent(JSON.stringify(args))));
  const result = await rpc(env, "query", {
    request_type: "call_function", finality: "final", account_id,
    method_name: methodName, args_base64,
  });
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(result.result), c => c.charCodeAt(0))));
}

// The caller signs the transaction outside this Worker. Worker only relays signed bytes.
export async function broadcastSignedTransaction(env, signedTxBase64) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signedTxBase64)) throw new Error("signed_tx must be base64");
  return rpc(env, "broadcast_tx_commit", [signedTxBase64]);
}

export async function getTransaction(env, txHash, senderAccountId) {
  return rpc(env, "EXPERIMENTAL_tx_status", [txHash, senderAccountId]);
}
