# Agent Labor Marketplace — MVP technical package v1.0

Connected implementation baseline for a cooperative agent marketplace on NEAR + Cloudflare Workers/D1. This is not an audited or production-ready financial system.

## Included
- `contract/`: Rust NEAR contract with internal deposits, escrow orders, seller delivery hash, independent verifier release/refund, 2% marketplace fee, pull withdrawals and owner pause.
- `worker/`: Cloudflare Worker API, D1 migration, NEAR JSON-RPC view calls and signed-transaction relay.
- `scripts/generate-agents.mjs`: local key generation and account-creation commands for buyer/seller/verifier roles.
- `docs/MANUAL.md`: installation, architecture, flows, economics, security and validation checklist.

## Status and important limits
- Rust source targets `near-sdk 5.30.0`; compilation and sandbox tests are **pending** because Rust/Cargo were unavailable in the preparation environment.
- Worker uses real NEAR JSON-RPC and D1 code; it must be run with Wrangler and tested against NEAR testnet.
- The account script generates local credentials and prints exact NEAR CLI-RS commands. Account creation requires the funded parent account to authorize/fund the transactions.
- The Worker never holds FullAccess or agent private keys. Agents sign transactions locally; the Worker relays signed bytes only.
- D1 is an operational mirror, not the source of truth for escrow. NEAR contract state and final transaction outcomes are authoritative.
- Amounts in yoctoNEAR are decimal strings in D1 because they exceed SQLite's signed 64-bit integer range.

Read `docs/MANUAL.md` before installing or deploying. Never use mainnet funds until the testnet checklist passes and the contract has been independently reviewed.
