# Ootle Split

An on-chain revenue and prize splitter for teams, written as a Tari Ootle template.

A creator makes a `Split` with a fixed list of recipients and their shares in basis points, which must sum to 10000. After that, anyone can deposit TARI or another fungible resource into it, and anyone can call `distribute()`, which pays each recipient their pro-rata share. Rounding dust stays in the vault and is paid out in the next round.

**Why:** a hackathon team wins a prize, or a group shares revenue. Today one person receives the money and the others have to trust them to pay it out. With Ootle Split, the prize goes to the split's address and the split pays everyone. The recipient list is fixed when the split is created. The component has no owner (`OwnerRule::None`), no admin methods and no upgrade path. The only way funds leave is `distribute()`, and it can only pay the recipients set at creation.

Built for the Tari November Build Contest (MVP) on Ootle mainnet.

## Mainnet deployment

| | |
|---|---|
| Network | Tari Ootle mainnet |
| Template | `template_FILL_AFTER_PUBLISH` |
| Publish tx | `FILL` · [explorer](https://explorer.tari.mw/tx/FILL) · [indexer](https://indexer-a.ootle.tari.com/transactions/FILL) |
| Published (UTC) | FILL (epoch FILL) |
| Demo split | `component_FILL` · [state](https://indexer-a.ootle.tari.com/substates/component_FILL?local_search_only=false) |
| Published wasm | `dist/ootle_split.wasm`, 180,720 bytes, sha256 `0552dbc887d1072d11039b405981d36a5d04369d8d380fb154449b918ad0416e` |

Raw indexer answers for these transactions are kept in `evidence/mainnet/`.

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

The tests use `tari_template_test_tooling = "=0.54.0"`, which runs the real Ootle engine. That engine depends on the Cranelift wasm compiler, which does not build on Windows, so run the tests on Linux, macOS or WSL. They cover:
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
8. Fill in `web/config.json` and the table above. Save the raw answer from `https://indexer-a.ootle.tari.com/transactions/<tx>` into `evidence/mainnet/`.

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

`web/` is a static page with no build step that can be served from GitHub Pages or Vercel. Set `web/config.json` after publishing.
- It shows the template address and the publish transaction, with explorer and indexer links. It also checks that the template is live on the indexer.
- It reads any split's state from the public indexer (`/substates/<component>`): label, recipients, shares, the undistributed balance, totals, and what each recipient would receive if `distribute()` ran now.
- **Experimental:** it can connect to the Sapient browser wallet (`window.tari`) and request a `distribute()` call. Creating a split and depositing are not wired to Sapient. The page shows wallet-app manifests for those steps instead.

To serve it locally, run `npx serve web` or `python -m http.server -d web`.

## License

MIT. See `LICENSE`.
