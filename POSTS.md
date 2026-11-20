# Post drafts

## 1. Bluesky (or Reddit r/tari) announcement

Ootle Split is live on Tari Ootle mainnet.

It is a trustless revenue and prize splitter for teams. You set the recipients and shares once, and nobody can change them afterwards. Anyone can deposit TARI, and anyone can trigger a payout that pays every member their exact share.

Template: template_6494a4fe7ea2de9276aada3b77086dfc14242fe4b96629a694745b24e49fb2d2
App: https://techkeyy.github.io/ootle-split/
Code (MIT): https://github.com/Techkeyy/ootle-split

My entry for the @tari.com November MVP build contest. #Tari #Ootle

## 2. Forum: November Build Contest Thread: MVP (topic 520)

**Ootle Split: trustless revenue and prize splitting on Ootle mainnet**

**What it is:** a team that wins a prize, a band that sells tickets, or a group of creators who share income needs someone to hold the money and pay everyone fairly. Ootle Split replaces that person with a contract. When the Split is created, it records the recipients and their share in basis points (summing to 10000). Nothing can change those afterwards, because the contract has no owner and no admin. Anyone can deposit TARI or any fungible resource. Anyone can call `distribute()`, which pays each recipient their exact pro-rata share. The contract emits SplitCreated, SplitDeposit and SplitDistributed events, so every payout can be audited on-chain.

**Template API:** `new(label, recipients, shares_bps)`, `new_for_resource(...)`, `deposit(bucket)`, `distribute()`, `recipients()`, `balance()`, `total_deposited()`, `total_distributed()`, `distributions()`.

- **Code (MIT):** https://github.com/Techkeyy/ootle-split
- **MVP app:** https://techkeyy.github.io/ootle-split/
- **Mainnet template:** `template_6494a4fe7ea2de9276aada3b77086dfc14242fe4b96629a694745b24e49fb2d2`
- **Social post:** <BLUESKY_LINK>
- **Tari payout address:** `12JM8ALwhKemSjMgEaUkZTuZzXu4goLGRGoMPUW1hLQ3nLHk1iydCMZTDG9CrjBTYEaPVZQefdCG3JtTexT8hqdUW9Z`

## 3. Forum: November Bonus Contest: First to Launch (topic 521)

**Ootle Split is live on Ootle mainnet**

November MVP entry: <LINK_TO_MY_520_POST>

| Item | Value |
|---|---|
| Template | `template_6494a4fe7ea2de9276aada3b77086dfc14242fe4b96629a694745b24e49fb2d2` |
| Publish transaction | `c2648d777dba9d6c063f02b91f02d92b016b020a2551ac7e2edfcb027822b150` |
| Result | Accept / Commit, epoch 39100 |
| Accepted | 2026-11-20 19:57:45 UTC |

- Proof: https://explorer.tari.mw/tx/c2648d777dba9d6c063f02b91f02d92b016b020a2551ac7e2edfcb027822b150
- Indexer: https://indexer-a.ootle.tari.com/transactions/c2648d777dba9d6c063f02b91f02d92b016b020a2551ac7e2edfcb027822b150
- Saved raw receipt: https://github.com/Techkeyy/ootle-split/tree/main/evidence/mainnet
- App (mainnet): https://techkeyy.github.io/ootle-split/
- Code (MIT): https://github.com/Techkeyy/ootle-split

Tari L1 payout address: `12JM8ALwhKemSjMgEaUkZTuZzXu4goLGRGoMPUW1hLQ3nLHk1iydCMZTDG9CrjBTYEaPVZQefdCG3JtTexT8hqdUW9Z`
