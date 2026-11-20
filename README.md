# Ootle Split

An on-chain revenue and prize splitter for teams, written as a Tari Ootle template.

A creator makes a `Split` with a fixed list of recipients and their shares in basis points, which must sum to 10000. After that, anyone can deposit TARI or another fungible resource into it, and anyone can call `distribute()`, which pays each recipient their pro-rata share. Rounding dust stays in the vault and is paid out in the next round.

**Why:** a hackathon team wins a prize, or a group shares revenue. Today one person receives the money and the others have to trust them to pay it out. With Ootle Split, the prize goes to the split's address and the split pays everyone. The recipient list is fixed when the split is created. The component has no owner (`OwnerRule::None`), no admin methods and no upgrade path. The only way funds leave is `distribute()`, and it can only pay the recipients set at creation.

Built for the Tari November Build Contest (MVP) on Ootle mainnet.

## Mainnet deployment

Published on Tari Ootle mainnet on **2026-11-20 at 19:57:45 UTC (epoch 39100)**.

| | |
|---|---|
| Template | `template_6494a4fe7ea2de9276aada3b77086dfc14242fe4b96629a694745b24e49fb2d2` ([indexer](https://indexer-a.ootle.tari.com/substates/template_6494a4fe7ea2de9276aada3b77086dfc14242fe4b96629a694745b24e49fb2d2?local_search_only=false)) |
| Publish tx | `c2648d777dba9d6c063f02b91f02d92b016b020a2551ac7e2edfcb027822b150` |
| Proof links | [explorer](https://explorer.tari.mw/tx/c2648d777dba9d6c063f02b91f02d92b016b020a2551ac7e2edfcb027822b150) · [indexer](https://indexer-a.ootle.tari.com/transactions/c2648d777dba9d6c063f02b91f02d92b016b020a2551ac7e2edfcb027822b150) |
| Status | Accepted (Commit). Final fee 1,254,804 µT (about 1.25 TARI). |
| Template name | `Split`, 150,442 bytes on chain |
| Publisher | account `component_bbec55ccd1f4191208a4cb572e87a5b54eeb9c476f200cc12eda5ee26a26a0fc` |
| Demo split | `component_FILL` ([state](https://indexer-a.ootle.tari.com/substates/component_FILL?local_search_only=false)) |

**Which binary is on chain.**
- `scripts/build.sh` produces `dist/ootle_split.wasm`: 180,720 bytes, sha256 `0552dbc887d1072d11039b405981d36a5d04369d8d380fb154449b918ad0416e`. That is the file uploaded in the wallet.
- The wallet daemon runs a wasm optimizer before it publishes, so the template substate holds a smaller binary: 150,442 bytes, sha256 `67b42d684ee01448b885fe98672019bf823639dac612384e2314bd0261f510ca`. It is saved as `evidence/mainnet/onchain-template.wasm`.
- Both binaries carry the same `tari_tdef` template definition section, byte for byte. Both have the same imports and the same `/build/.cargo` path remap, which only `scripts/build.sh` produces.
- The code section shrank from 165,720 to 136,078 bytes, and a DataCount section was added, which is typical of a Binaryen wasm-opt pass.
- The ghostline entry documents the same walletd behaviour.

The evidence is in `evidence/mainnet/`:
- the wallet receipt (`tx-c2648d777dba9d6c063f02b91f02d92b016b020a2551ac7e2edfcb027822b150.json`);
- the indexer's transaction and template answers (`indexer-tx.json`, `indexer-template.json`);
- the on-chain binary (`onchain-template.wasm`).

## Template API

| Call | Who | What it does |
|---|---|---|
| `Split::new(label: String, recipients: Vec<ComponentAddress>, shares: Vec<u32>)` | anyone | Creates a TARI split. The shares are basis points and must sum to exactly 10000. Each share must be above 0. Recipients must be unique, with 1 to 32 of them. The label can be up to 64 bytes. |
| `Split::new_for_resource(label, recipients, shares, resource: ResourceAddress)` | anyone | The same, for any fungible resource. |
| `deposit(payment: Bucket)` | anyone | Adds funds. The bucket must be the split's resource and must not be empty. |
| `distribute() -> Amount` | anyone | Pays each recipient `floor(balance * bps / 10000)` by calling `deposit` on the recipient component. Returns the total paid. |
| `label()`, `recipients() -> Vec<(ComponentAddress, u32)>`, `resource()` | read | The fixed configuration. |
| `balance()`, `total_deposited()`, `total_distributed()`, `distributions()` | read | Accounting. |

Events: `SplitCreated`, `SplitDeposit` and `SplitDistributed`. Each carries its amounts and the round number.

Error strings are `NoRecipients`, `TooManyRecipients`, `SharesLengthMismatch`, `LabelTooLong`, `ZeroShare`, `SharesMustSumTo10000`, `DuplicateRecipient`, `WrongResource`, `EmptyDeposit`, `NothingToDistribute` and `BalanceTooSmallToSplit`.

**Limits.**
- Each recipient must be a component with a public `deposit(Bucket)` method, as standard Ootle accounts have. If a recipient cannot accept a deposit, `distribute()` fails as a whole and nobody is paid. Because recipients cannot be changed, that split stays stuck. Use account component addresses.
- Amounts and recipients are public.
- There is no audit.

## Build

Requirements: Rust 1.97.1 (pinned in `rust-toolchain.toml`) with the `wasm32-unknown-unknown` target.

```bash
bash scripts/build.sh          # -> dist/ootle_split.wasm and dist/ootle_split.wasm.sha256
```

The script remaps local paths (cargo home and repo root) to `/build/...`, so the published binary does not carry the builder's home folder. Dependency: `tari_template_lib = "=0.41.0"`, the same version used by other templates published on mainnet in November 2026.

## Test

```bash
cd template && cargo test
```

Result (WSL Ubuntu, 2026-11-20): 4 passed, 0 failed (`evidence/engine-tests.txt`). The tests use `tari_template_test_tooling = "=0.54.0"`, which runs the real Ootle engine. That engine depends on the Cranelift wasm compiler, which does not build on Windows, so run the tests on Linux, macOS or WSL. They cover:
- a 50/30/20 split of 1001 units, which pays 500/300/200 and keeps 1 unit of dust;
- a second round that pays the dust out;
- the read methods;
- refusal to distribute an empty split;
- rejection of bad share configurations.

## Publish on mainnet (Tari Ootle wallet app)

You need an Ootle mainnet account with about 2 TARI of **public (revealed)** balance. The publish fee is roughly 1 TARI.

1. Open the Tari Ootle wallet, check that it is on **mainnet**, and select the funded account.
2. On the Home page, click **Publish Template**.
3. Under **Pay Fee From Account**, choose the funded account.
4. Drop in `dist/ootle_split.wasm`. Leave the metadata field empty.
5. Click **Estimate fee**. This is a dry run and fills **Max Fee** in microTARI.
6. Click **Publish**.
7. Under **Transactions**, open the new transaction and wait for it to be accepted. Copy the transaction id and the `template_...` address from its result.
8. Fill in `docs/config.json` and the table above. Save the raw answer from `https://indexer-a.ootle.tari.com/transactions/<tx>` into `evidence/mainnet/`.

If fee estimation fails with a missing substate or vault error, the account either does not exist on chain yet or holds only sealed (stealth) TARI. Send a small public transfer to yourself, then try again.

**CLI alternative.** This uses the same local wallet daemon over JSON-RPC. It is a dry run unless you add `--submit`.

```bash
export WALLETD_URL=http://127.0.0.1:5100/json_rpc   # your daemon's JSON-RPC address
export WALLETD_TOKEN=<JWT from the wallet UI>       # or WALLETD_COOKIE=/path/to/.cookie
node scripts/walletd.mjs publish dist/ootle_split.wasm            # prints fee estimate
node scripts/walletd.mjs publish dist/ootle_split.wasm --submit   # publishes (max fee = estimate + 20%)
```

## Create, fund and distribute a split

Recipients are **account component addresses** (`component_...`), shown on the wallet's Accounts page. The `otl_1...` address is a different format.

```bash
node scripts/walletd.mjs create template_<hex> "Team Prize" component_<A>:5000 component_<B>:3000 component_<C>:2000 --submit
node scripts/walletd.mjs deposit component_<split> 1000000 --submit    # 1 TARI
node scripts/walletd.mjs distribute component_<split> --submit
```

You can also use the wallet app's **Manifest** page. Paste a manifest from `manifests/` and set the variables `account`, plus `split` where needed. Run it with Fee 0 for a dry run, then submit it with a fee.

## Web page

`docs/` is a static page with no build step. On GitHub Pages, choose Settings → Pages → Deploy from branch → `main` → `/docs`. It also deploys as-is on Vercel, with `docs` as the output directory. Addresses live in `docs/config.json`.
- It shows the template address and the publish transaction, with explorer and indexer links. It also checks that the template is live on the indexer.
- It reads any split's state from the public indexer (`/substates/<component>`): label, recipients, shares, the undistributed balance, totals, and what each recipient would receive if `distribute()` ran now.
- **Experimental:** it can connect to the Sapient browser wallet (`window.tari`) and request a `distribute()` call. Creating a split and depositing are not wired to Sapient. The page shows wallet-app manifests for those steps instead.

To serve it locally, run `npx serve docs` or `python -m http.server -d docs`.

## License

MIT. See `LICENSE`.
