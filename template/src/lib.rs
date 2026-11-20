//! Ootle Split: an immutable on-chain revenue / prize splitter for Tari Ootle.
//!
//! A creator instantiates a `Split` with a fixed list of recipient components (usually Ootle
//! accounts) and share weights in basis points that sum to 10_000. Anyone can deposit the split's
//! resource (TARI by default). Anyone can call `distribute()`, which pays every recipient its
//! pro-rata share of the current balance. Rounding dust stays in the vault for the next round.
//!
//! Trust property: recipients, shares and the resource are fixed at creation. The component has
//! no owner, no admin methods and no withdraw path other than `distribute()`.
use tari_template_lib::prelude::*;

/// Shares are expressed in basis points and must sum to exactly this value.
pub const TOTAL_BPS: u32 = 10_000;
/// Upper bound on recipients so `distribute()` always fits in one transaction.
pub const MAX_RECIPIENTS: usize = 32;
/// Upper bound on the label length (bytes).
pub const MAX_LABEL_LEN: usize = 64;

/// Pro-rata share of `balance` for `bps` basis points, rounded down.
pub fn share_of(balance: u128, bps: u32) -> u128 {
    balance * bps as u128 / TOTAL_BPS as u128
}

#[template]
mod split {
    use super::*;

    pub struct Split {
        label: String,
        recipients: Vec<ComponentAddress>,
        shares: Vec<u32>,
        resource: ResourceAddress,
        funds: Vault,
        total_deposited: Amount,
        total_distributed: Amount,
        distributions: u64,
    }

    impl Split {
        /// Creates a TARI splitter.
        pub fn new(label: String, recipients: Vec<ComponentAddress>, shares: Vec<u32>) -> Component<Self> {
            Self::new_for_resource(label, recipients, shares, TARI_TOKEN)
        }

        /// Creates a splitter for any fungible resource.
        pub fn new_for_resource(
            label: String,
            recipients: Vec<ComponentAddress>,
            shares: Vec<u32>,
            resource: ResourceAddress,
        ) -> Component<Self> {
            assert!(!recipients.is_empty(), "NoRecipients");
            assert!(recipients.len() <= MAX_RECIPIENTS, "TooManyRecipients");
            assert_eq!(recipients.len(), shares.len(), "SharesLengthMismatch");
            assert!(label.len() <= MAX_LABEL_LEN, "LabelTooLong");
            let mut sum: u32 = 0;
            for s in &shares {
                assert!(*s > 0, "ZeroShare");
                sum = sum.checked_add(*s).expect("SharesOverflow");
            }
            assert_eq!(sum, TOTAL_BPS, "SharesMustSumTo10000");
            for (i, r) in recipients.iter().enumerate() {
                assert!(!recipients[..i].contains(r), "DuplicateRecipient");
            }

            emit_event("SplitCreated", [
                ("label", label.clone()),
                ("recipients", recipients.len().to_string()),
                ("resource", resource.to_string()),
            ]);

            Component::new(Self {
                label,
                recipients,
                shares,
                resource,
                funds: Vault::new_empty(resource),
                total_deposited: Amount::zero(),
                total_distributed: Amount::zero(),
                distributions: 0,
            })
            // No owner, no upgrades, no rule changes: the split is immutable once created.
            .with_owner_rule(OwnerRule::None)
            .with_access_rules(AccessRules::allow_all())
            .create()
        }

        /// Anyone can fund the split.
        pub fn deposit(&mut self, payment: Bucket) {
            assert_eq!(payment.resource_address(), self.resource, "WrongResource");
            let amount = payment.amount();
            assert!(amount.is_positive(), "EmptyDeposit");
            self.funds.deposit(payment);
            self.total_deposited = self.total_deposited.saturating_add(amount);
            emit_event("SplitDeposit", [("amount", amount.to_string())]);
        }

        /// Anyone can trigger a payout. Each recipient receives floor(balance * bps / 10000).
        /// Returns the total amount paid out in this call.
        pub fn distribute(&mut self) -> Amount {
            let balance = self.funds.balance().to_u128();
            assert!(balance > 0, "NothingToDistribute");
            let mut paid: u128 = 0;
            for (recipient, bps) in self.recipients.iter().zip(self.shares.iter()) {
                let amount = share_of(balance, *bps);
                if amount == 0 {
                    continue;
                }
                let bucket = self.funds.withdraw(Amount::new(amount));
                ComponentManager::get(*recipient).invoke("deposit", args![bucket]);
                paid += amount;
            }
            assert!(paid > 0, "BalanceTooSmallToSplit");
            let paid = Amount::new(paid);
            self.total_distributed = self.total_distributed.saturating_add(paid);
            self.distributions += 1;
            emit_event("SplitDistributed", [
                ("paid", paid.to_string()),
                ("remaining", self.funds.balance().to_string()),
                ("round", self.distributions.to_string()),
            ]);
            paid
        }

        pub fn label(&self) -> String {
            self.label.clone()
        }

        /// (recipient, share in basis points) pairs, in creation order.
        pub fn recipients(&self) -> Vec<(ComponentAddress, u32)> {
            self.recipients.iter().copied().zip(self.shares.iter().copied()).collect()
        }

        pub fn resource(&self) -> ResourceAddress {
            self.resource
        }

        /// Undistributed balance (including rounding dust).
        pub fn balance(&self) -> Amount {
            self.funds.balance()
        }

        pub fn total_deposited(&self) -> Amount {
            self.total_deposited
        }

        pub fn total_distributed(&self) -> Amount {
            self.total_distributed
        }

        pub fn distributions(&self) -> u64 {
            self.distributions
        }
    }
}
