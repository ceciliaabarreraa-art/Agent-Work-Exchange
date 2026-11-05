PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('buyer','seller','verifier')),
  display_name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, seller_account_id TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', amount_yocto TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','awarded','cancelled','completed')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, chain_order_id INTEGER NOT NULL UNIQUE,
  buyer_account_id TEXT NOT NULL, seller_account_id TEXT NOT NULL, verifier_account_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chain_transactions (
  id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
  sender_account_id TEXT NOT NULL, tx_hash TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY, account TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('debit','credit')),
  amount_atomic TEXT NOT NULL, currency TEXT NOT NULL,
  reference TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offers_status_created ON offers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_account_created ON ledger_entries(account, created_at DESC);
