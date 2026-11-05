import { viewFunction, broadcastSignedTransaction, getTransaction } from "./near.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders() },
});
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

async function body(request) {
  try { return await request.json(); } catch { throw new Error("Invalid JSON body"); }
}
function requireToken(request, env) {
  if (!env.API_TOKEN) throw new Error("API_TOKEN is not configured");
  if (request.headers.get("authorization") !== `Bearer ${env.API_TOKEN}`) {
    const error = new Error("Unauthorized"); error.status = 401; throw error;
  }
}
function validateAccount(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 && /^[a-z0-9._-]+$/.test(value);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "agent-marketplace-worker", network: env.NEAR_NETWORK || "testnet", time: now() });
      }
      if (request.method === "GET" && url.pathname === "/near/config") {
        return json({ network: env.NEAR_NETWORK || "testnet", contract_id: env.CONTRACT_ID || null, rpc: env.NEAR_RPC || "https://rpc.testnet.near.org" });
      }
      if (request.method === "GET" && url.pathname.startsWith("/near/order/")) {
        const orderId = Number(url.pathname.split("/").pop());
        if (!Number.isSafeInteger(orderId) || orderId < 0) return json({ error: "Invalid order id" }, 400);
        const result = await viewFunction(env, "get_order", { order_id: orderId });
        return json({ order: result });
      }
      if (request.method === "GET" && url.pathname === "/near/balance") {
        const account = url.searchParams.get("account_id");
        if (!validateAccount(account)) return json({ error: "Invalid account_id" }, 400);
        return json({ account_id: account, balance_yocto: await viewFunction(env, "get_balance", { account }) });
      }
      if (request.method === "POST" && url.pathname === "/near/broadcast") {
        requireToken(request, env);
        const data = await body(request);
        if (!data.signed_tx || !data.idempotency_key || !data.sender_account_id) return json({ error: "signed_tx, sender_account_id and idempotency_key are required" }, 400);
        const key = String(data.idempotency_key).slice(0, 128);
        const reservation = await env.DB.prepare(`INSERT OR IGNORE INTO chain_transactions
          (id, idempotency_key, sender_account_id, tx_hash, status, created_at)
          VALUES (?, ?, ?, NULL, 'broadcasting', ?)`)
          .bind(id(), key, data.sender_account_id, now()).run();
        if (!reservation.meta?.changes) {
          const existing = await env.DB.prepare("SELECT tx_hash, status FROM chain_transactions WHERE idempotency_key = ?").bind(key).first();
          return json({ ...existing, replay: true }, 202);
        }
        try {
          const result = await broadcastSignedTransaction(env, data.signed_tx);
          const txHash = result.transaction?.hash || result.transaction_outcome?.id || null;
          await env.DB.prepare("UPDATE chain_transactions SET tx_hash = ?, status = 'submitted' WHERE idempotency_key = ?")
            .bind(txHash, key).run();
          return json({ status: "submitted", tx_hash: txHash, near_result: result }, 202);
        } catch (error) {
          await env.DB.prepare("UPDATE chain_transactions SET status = 'failed' WHERE idempotency_key = ?").bind(key).run();
          throw error;
        }
      }
      if (request.method === "GET" && url.pathname.startsWith("/near/tx/")) {
        const txHash = url.pathname.split("/").pop();
        const sender = url.searchParams.get("sender");
        if (!sender || !validateAccount(sender)) return json({ error: "sender query parameter required" }, 400);
        return json(await getTransaction(env, txHash, sender));
      }
      if (request.method === "POST" && url.pathname === "/agents") {
        requireToken(request, env);
        const d = await body(request);
        if (!validateAccount(d.account_id) || !["buyer", "seller", "verifier"].includes(d.role)) return json({ error: "Valid account_id and role required" }, 400);
        const agentId = id();
        await env.DB.prepare("INSERT INTO agents (id, account_id, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(agentId, d.account_id, d.role, String(d.display_name || d.role).slice(0, 80), now()).run();
        return json({ id: agentId, account_id: d.account_id, role: d.role }, 201);
      }
      if (request.method === "GET" && url.pathname === "/agents") {
        const { results } = await env.DB.prepare("SELECT id, account_id, role, display_name, created_at FROM agents ORDER BY created_at DESC LIMIT 100").all();
        return json({ agents: results });
      }
      if (request.method === "POST" && url.pathname === "/offers") {
        requireToken(request, env);
        const d = await body(request);
        if (!validateAccount(d.seller_account_id) || !d.title || !/^\d+$/.test(String(d.amount_yocto)) || BigInt(d.amount_yocto) <= 0n) return json({ error: "seller_account_id, title and positive integer amount_yocto required" }, 400);
        const offerId = id();
        await env.DB.prepare("INSERT INTO offers (id, seller_account_id, title, description, amount_yocto, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)")
          .bind(offerId, d.seller_account_id, String(d.title).slice(0, 160), String(d.description || "").slice(0, 4000), d.amount_yocto, now()).run();
        return json({ id: offerId, status: "open" }, 201);
      }
      if (request.method === "GET" && url.pathname === "/offers") {
        const { results } = await env.DB.prepare("SELECT * FROM offers WHERE status = 'open' ORDER BY created_at DESC LIMIT 100").all();
        return json({ offers: results });
      }
      if (request.method === "POST" && url.pathname === "/orders/record") {
        requireToken(request, env);
        const d = await body(request);
        if (!d.order_id || !validateAccount(d.buyer_account_id) || !validateAccount(d.seller_account_id) || !validateAccount(d.verifier_account_id) || !d.idempotency_key) return json({ error: "order_id, buyer/seller/verifier account IDs and idempotency_key required" }, 400);
        if (d.buyer_account_id === d.seller_account_id || d.buyer_account_id === d.verifier_account_id || d.seller_account_id === d.verifier_account_id) return json({ error: "Buyer, seller and verifier must be distinct accounts" }, 400);
        await env.DB.prepare(`INSERT OR IGNORE INTO orders (id, chain_order_id, buyer_account_id, seller_account_id, verifier_account_id, idempotency_key, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'chain_pending', ?)`)
          .bind(id(), d.order_id, d.buyer_account_id, d.seller_account_id, d.verifier_account_id, d.idempotency_key, now()).run();
        return json({ recorded: true, chain_order_id: d.order_id }, 201);
      }
      if (request.method === "GET" && url.pathname === "/ledger") {
        requireToken(request, env);
        const { results } = await env.DB.prepare("SELECT * FROM ledger_entries ORDER BY created_at DESC LIMIT 250").all();
        return json({ entries: results, note: "Operational mirror only; on-chain balances and transaction receipts are authoritative." });
      }
      if (request.method === "POST" && url.pathname === "/ledger/entry") {
        requireToken(request, env);
        const d = await body(request);
        const allowed = ["customer_escrow", "seller_payable", "marketplace_fee", "gas_expense", "rail_expense", "refund", "operational_reserve"];
        if (!allowed.includes(d.account) || !/^\d+$/.test(String(d.amount_atomic)) || !d.reference || !d.idempotency_key) return json({ error: "Invalid ledger entry" }, 400);
        await env.DB.prepare(`INSERT OR IGNORE INTO ledger_entries (id, account, direction, amount_atomic, currency, reference, idempotency_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id(), d.account, d.direction === "debit" ? "debit" : "credit", d.amount_atomic, d.currency || "NEAR_yocto", String(d.reference).slice(0, 160), String(d.idempotency_key).slice(0, 128), now()).run();
        return json({ recorded: true }, 201);
      }
      if (request.method === "POST" && url.pathname === "/admin/pause") {
        requireToken(request, env);
        const d = await body(request);
        if (typeof d.paused !== "boolean") return json({ error: "paused boolean required" }, 400);
        await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('intake_paused', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
          .bind(String(d.paused), now()).run();
        return json({ paused_in_api: d.paused, warning: "On-chain pause must separately be submitted by the contract owner; this API flag does not freeze contract funds." });
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error.message || "Internal error" }, error.status || 500);
    }
  },
};

function corsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "authorization,content-type" };
}
