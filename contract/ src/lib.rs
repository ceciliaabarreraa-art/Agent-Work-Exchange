use near_sdk::{
    env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    borsh::{self, BorshDeserialize, BorshSerialize},
    collections::{LookupMap, UnorderedMap},
    json_types::U128,
};
use near_sdk::serde::{Deserialize, Serialize};

const FEE_BPS: u16 = 200; // 2% of the gross order amount.
const BPS_DENOMINATOR: u128 = 10_000;
const CALLBACK_GAS: Gas = Gas::from_tgas(5);

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub enum OrderStatus { Funded, Delivered, Released, Refunded }

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Order {
    pub id: u64,
    pub buyer: AccountId,
    pub seller: AccountId,
    pub verifier: AccountId,
    pub gross_amount: U128,
    pub fee_amount: U128,
    pub seller_amount: U128,
    pub status: OrderStatus,
    pub delivery_hash: Option<String>,
    pub delivery_ref: Option<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    treasury_id: AccountId,
    verifier_id: AccountId,
    paused: bool,
    next_order_id: u64,
    balances: LookupMap<AccountId, u128>,
    orders: UnorderedMap<u64, Order>,
    pending_withdrawals: LookupMap<AccountId, u128>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, treasury_id: AccountId, verifier_id: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        assert!(verifier_id != treasury_id && verifier_id != owner_id, "Verifier must be independent");
        Self {
            owner_id, treasury_id, verifier_id, paused: false, next_order_id: 0,
            balances: LookupMap::new(b"b"), orders: UnorderedMap::new(b"o"),
            pending_withdrawals: LookupMap::new(b"w"),
        }
    }

    /// Buyer (or any account) deposits native NEAR into its internal balance.
    #[payable]
    pub fn deposit(&mut self) {
        let amount = env::attached_deposit().as_yoctonear();
        assert!(amount > 0, "Deposit must be positive");
        let account = env::predecessor_account_id();
        let old = self.balances.get(&account).unwrap_or(0);
        self.balances.insert(&account, &(old + amount));
    }

    /// Creates an escrow order using the buyer's previously deposited balance.
    pub fn create_order(&mut self, seller: AccountId, verifier: AccountId, gross_amount: U128) -> u64 {
        self.assert_live();
        let buyer = env::predecessor_account_id();
        assert!(buyer != seller, "Buyer and seller must differ");
        assert!(buyer != verifier && seller != verifier, "Verifier must be independent");
        assert_eq!(verifier, self.verifier_id, "Unapproved verifier");
        let gross = gross_amount.0;
        assert!(gross > 0, "Amount must be positive");
        let available = self.balances.get(&buyer).unwrap_or(0);
        assert!(available >= gross, "Insufficient deposited balance");
        self.balances.insert(&buyer, &(available - gross));
        let fee = gross * FEE_BPS as u128 / BPS_DENOMINATOR;
        let seller_amount = gross - fee;
        let id = self.next_order_id;
        self.next_order_id += 1;
        self.orders.insert(&id, &Order {
            id, buyer, seller, verifier, gross_amount, fee_amount: U128(fee),
            seller_amount: U128(seller_amount), status: OrderStatus::Funded,
            delivery_hash: None, delivery_ref: None,
        });
        id
    }

    /// Seller records a content hash and an opaque delivery reference.
    pub fn submit_delivery(&mut self, order_id: u64, sha256_hex: String, delivery_ref: String) {
        assert_eq!(sha256_hex.len(), 64, "SHA-256 must be 64 hexadecimal characters");
        assert!(sha256_hex.chars().all(|c| c.is_ascii_hexdigit()), "Invalid SHA-256");
        assert!(!delivery_ref.is_empty() && delivery_ref.len() <= 2048, "Invalid delivery reference");
        let caller = env::predecessor_account_id();
        let mut order = self.orders.get(&order_id).expect("Order not found");
        assert_eq!(caller, order.seller, "Only seller can submit delivery");
        assert_eq!(order.status, OrderStatus::Funded, "Order is not awaiting delivery");
        order.delivery_hash = Some(sha256_hex.to_lowercase());
        order.delivery_ref = Some(delivery_ref);
        order.status = OrderStatus::Delivered;
        self.orders.insert(&order_id, &order);
    }

    /// Independent verifier approves delivery; funds become pull-withdrawable credits.
    pub fn approve_and_release(&mut self, order_id: u64) {
        assert_eq!(env::predecessor_account_id(), self.verifier_id, "Only verifier can approve");
        let mut order = self.orders.get(&order_id).expect("Order not found");
        assert_eq!(order.status, OrderStatus::Delivered, "Order is not delivered");
        let seller_old = self.balances.get(&order.seller).unwrap_or(0);
        self.balances.insert(&order.seller, &(seller_old + order.seller_amount.0));
        let treasury_old = self.balances.get(&self.treasury_id).unwrap_or(0);
        self.balances.insert(&self.treasury_id, &(treasury_old + order.fee_amount.0));
        order.status = OrderStatus::Released;
        self.orders.insert(&order_id, &order);
    }

    /// Independent verifier refunds buyer's full gross amount to internal balance.
    pub fn refund(&mut self, order_id: u64) {
        assert_eq!(env::predecessor_account_id(), self.verifier_id, "Only verifier can refund");
        let mut order = self.orders.get(&order_id).expect("Order not found");
        assert!(order.status == OrderStatus::Funded || order.status == OrderStatus::Delivered, "Order cannot be refunded");
        let old = self.balances.get(&order.buyer).unwrap_or(0);
        self.balances.insert(&order.buyer, &(old + order.gross_amount.0));
        order.status = OrderStatus::Refunded;
        self.orders.insert(&order_id, &order);
    }

    /// Withdraw caller's own internal balance. Failed transfers restore the balance.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let account = env::predecessor_account_id();
        self.start_withdrawal(account, amount.0)
    }

    /// Treasury withdrawal is restricted to the treasury account itself.
    pub fn withdraw_treasury(&mut self, amount: U128) -> Promise {
        let caller = env::predecessor_account_id();
        assert_eq!(caller, self.treasury_id, "Only treasury can withdraw fees");
        self.start_withdrawal(caller, amount.0)
    }

    fn start_withdrawal(&mut self, account: AccountId, amount: u128) -> Promise {
        assert!(amount > 0, "Amount must be positive");
        assert!(self.pending_withdrawals.get(&account).unwrap_or(0) == 0, "Withdrawal already pending");
        let old = self.balances.get(&account).unwrap_or(0);
        assert!(old >= amount, "Insufficient balance");
        self.balances.insert(&account, &(old - amount));
        self.pending_withdrawals.insert(&account, &amount);
        Promise::new(account.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(Promise::new(env::current_account_id()).function_call(
                "resolve_withdraw".to_string(),
                near_sdk::serde_json::to_vec(&(account, U128(amount))).unwrap(),
                NearToken::from_yoctonear(0), CALLBACK_GAS,
            ))
    }

    #[private]
    pub fn resolve_withdraw(&mut self, account: AccountId, amount: U128, #[callback_result] result: Result<(), PromiseError>) {
        let pending = self.pending_withdrawals.get(&account).unwrap_or(0);
        assert_eq!(pending, amount.0, "Pending withdrawal mismatch");
        self.pending_withdrawals.remove(&account);
        if result.is_err() {
            let old = self.balances.get(&account).unwrap_or(0);
            self.balances.insert(&account, &(old + amount.0));
        }
    }

    pub fn set_paused(&mut self, paused: bool) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Only owner");
        self.paused = paused;
    }

    pub fn get_balance(&self, account: AccountId) -> U128 { U128(self.balances.get(&account).unwrap_or(0)) }
    pub fn get_order(&self, order_id: u64) -> Option<Order> { self.orders.get(&order_id) }
    pub fn get_config(&self) -> (AccountId, AccountId, bool, u16) { (self.treasury_id.clone(), self.verifier_id.clone(), self.paused, FEE_BPS) }

    fn assert_live(&self) { assert!(!self.paused, "Marketplace is paused"); }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{testing_env, test_utils::{accounts, VMContextBuilder}};

    fn set_context(predecessor: AccountId, deposit: NearToken) {
        let mut context = VMContextBuilder::new();
        context.predecessor_account_id(predecessor);
        context.attached_deposit(deposit);
        testing_env!(context.build());
    }

    #[test]
    fn release_splits_fee_and_seller_payout() {
        let owner = accounts(0);
        let buyer = accounts(1);
        let seller = accounts(2);
        let verifier = accounts(3);
        let mut contract = Contract::new(owner.clone(), owner.clone(), verifier.clone());

        set_context(buyer.clone(), NearToken::from_near(1));
        contract.deposit();
        set_context(buyer.clone(), NearToken::from_yoctonear(0));
        let order_id = contract.create_order(seller.clone(), verifier.clone(), U128(10u128.pow(24)));
        set_context(seller.clone(), NearToken::from_yoctonear(0));
        contract.submit_delivery(order_id, "a".repeat(64), "r2://delivery/1".to_string());
        set_context(verifier.clone(), NearToken::from_yoctonear(0));
        contract.approve_and_release(order_id);

        assert_eq!(contract.get_balance(seller).0, 98 * 10u128.pow(22));
        assert_eq!(contract.get_balance(owner).0, 2 * 10u128.pow(22));
        assert_eq!(contract.get_order(order_id).unwrap().status, OrderStatus::Released);
    }

    #[test]
    #[should_panic(expected = "Only verifier can approve")]
    fn seller_cannot_approve_own_order() {
        let owner = accounts(0);
        let buyer = accounts(1);
        let seller = accounts(2);
        let verifier = accounts(3);
        let mut contract = Contract::new(owner.clone(), owner, verifier);
        set_context(buyer.clone(), NearToken::from_near(1));
        contract.deposit();
        set_context(buyer, NearToken::from_yoctonear(0));
        let order_id = contract.create_order(seller.clone(), accounts(3), U128(10u128.pow(24)));
        set_context(seller, NearToken::from_yoctonear(0));
        contract.approve_and_release(order_id);
    }
}
