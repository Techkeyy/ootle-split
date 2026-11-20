#!/usr/bin/env node
// Ootle Split helper for a LOCAL Tari Ootle wallet daemon (tari_ootle_walletd) JSON-RPC.
// Every command is a DRY RUN unless you pass --submit. Nothing here stores or prints secrets.
//
// Env:
//   WALLETD_URL     JSON-RPC endpoint (default http://127.0.0.1:5100/json_rpc)
//   WALLETD_TOKEN   a JWT copied from the wallet web UI (needed when the daemon uses passkey/webauthn auth)
//   WALLETD_COOKIE  path to the daemon's .cookie file (cookie auth), used as the bearer token
//   (none set)      falls back to auth.request with credentials "None" (only works on an auth "none" daemon)
//   FEE_ACCOUNT     account name or component_... that pays fees (default: the wallet's default account)
//   MAX_FEE         fee ceiling in microTARI (default: publish 3000000 = 3 TARI, other calls 100000 = 0.1 TARI)
//
// Commands:
//   node scripts/walletd.mjs info
//   node scripts/walletd.mjs publish dist/ootle_split.wasm [--submit]
//   node scripts/walletd.mjs create <template_hex|template_...> "<label>" <component_...>:<bps> ... [--submit]
//   node scripts/walletd.mjs deposit <split component_...> <microTARI> [--submit]
//   node scripts/walletd.mjs distribute <split component_...> [--submit]
//   node scripts/walletd.mjs result <transaction id>
import { readFileSync } from 'node:fs'

const URL_ = process.env.WALLETD_URL ?? 'http://127.0.0.1:5100/json_rpc'
const argv = process.argv.slice(2)
const submit = argv.includes('--submit')
const args = argv.filter((a) => a !== '--submit')
const [cmd, ...rest] = args
let id = 0
let token = process.env.WALLETD_TOKEN ?? (process.env.WALLETD_COOKIE ? readFileSync(process.env.WALLETD_COOKIE, 'utf8').trim() : null)

async function raw(method, params) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  })
  return r.json()
}
async function call(method, params = {}) {
  if (!token) {
    const a = await raw('auth.request', { credentials: 'None', permissions: ['Admin'] })
    if (a.error) throw new Error(`auth failed (${JSON.stringify(a.error)}). Set WALLETD_TOKEN or WALLETD_COOKIE.`)
    token = a.result.token
  }
  const j = await raw(method, params)
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 1200)}`)
  return j.result
}
const out = (x) => console.log(JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
const hex = (t) => t.replace(/^template_/, '')
const isComponent = (s) => /^component_[0-9a-f]{64}$/.test(s)

async function feeAccount() {
  if (process.env.FEE_ACCOUNT) return process.env.FEE_ACCOUNT
  const d = await call('accounts.get_default', {})
  const addr = JSON.stringify(d).match(/component_[0-9a-f]{64}/)
  if (!addr) throw new Error('could not find the default account; set FEE_ACCOUNT=component_...')
  return addr[0]
}
const feeRef = (a) => (isComponent(a) ? { ComponentAddress: a } : { Name: a })

async function guardNetwork() {
  const info = await call('wallet.get_info', {})
  const net = JSON.stringify(info).match(/"network"\s*:\s*"([^"]+)"/)?.[1] ?? 'unknown'
  console.error(`wallet daemon network: ${net}${submit ? '  (SUBMITTING)' : '  (dry run)'}`)
  return net
}

async function manifest(code, variables, maxFee) {
  await guardNetwork()
  const res = await call('transactions.submit_manifest', {
    manifest: code, variables, seal_signer_key_id: null, signing_key_ids: [], max_fee: maxFee, dry_run: !submit, blobs: {},
  })
  out(res)
  if (submit && res.transaction_id) await wait(res.transaction_id)
}

async function wait(transaction_id) {
  console.error(`submitted ${transaction_id}; waiting for finalization...`)
  const r = await call('transactions.wait_result', { transaction_id, timeout_secs: 180 })
  const s = JSON.stringify(r)
  console.error(`status: ${r.status ?? 'unknown'}`)
  const made = [...new Set(s.match(/(component|template|vault)_[0-9a-f]{64}/g) ?? [])]
  console.error('substates seen in result:\n  ' + made.join('\n  '))
  console.error(`explorer: https://explorer.tari.mw/tx/${transaction_id}`)
  console.error(`indexer:  https://indexer-a.ootle.tari.com/transactions/${transaction_id}`)
}

const MAX = (d) => Number(process.env.MAX_FEE ?? d)

switch (cmd) {
  case 'info': {
    out(await call('wallet.get_info', {}))
    out(await call('accounts.get_default', {}))
    break
  }
  case 'publish': {
    const file = rest[0] ?? 'dist/ootle_split.wasm'
    await guardNetwork()
    const fee_account = feeRef(await feeAccount())
    const binary = readFileSync(file).toString('base64')
    const dry = await call('transactions.publish_template', { binary, fee_account, max_fee: MAX(3_000_000), detect_inputs: true, dry_run: true, metadata: null })
    console.error(`estimated publish fee: ${dry.dry_run_fee} microTARI (${Number(dry.dry_run_fee) / 1e6} TARI)`)
    if (!submit) { out(dry); break }
    const maxFee = process.env.MAX_FEE ? MAX(0) : Math.ceil(Number(dry.dry_run_fee) * 1.2)
    const sent = await call('transactions.publish_template', { binary, fee_account, max_fee: maxFee, detect_inputs: true, dry_run: false, metadata: null })
    out(sent)
    await wait(sent.transaction_id)
    break
  }
  case 'create': {
    const [tpl, label, ...pairs] = rest
    if (!tpl || !label || pairs.length === 0) throw new Error('usage: create <template> "<label>" component_...:<bps> ...')
    const recips = pairs.map((p) => p.split(':'))
    for (const [c, b] of recips) if (!isComponent(c) || !(Number(b) > 0)) throw new Error(`bad recipient ${c}:${b}`)
    const sum = recips.reduce((s, [, b]) => s + Number(b), 0)
    if (sum !== 10000) throw new Error(`shares sum to ${sum}, must be 10000`)
    const account = await feeAccount()
    const code = `use template_${hex(tpl)} as Split;
fn fee_main() {
    let account = var!["account"];
    account.pay_fee(${MAX(100_000)});
}
fn main() {
    Split::new(${JSON.stringify(label)}, [${recips.map(([c]) => `address!("${c}")`).join(', ')}], [${recips.map(([, b]) => `${Number(b)}u32`).join(', ')}]);
}`
    console.error(code)
    await manifest(code, { account }, MAX(100_000))
    break
  }
  case 'deposit': {
    const [split, amount] = rest
    if (!isComponent(split) || !(Number(amount) > 0)) throw new Error('usage: deposit <component_...> <microTARI>')
    const account = await feeAccount()
    const code = `fn fee_main() {
    let account = var!["account"];
    account.pay_fee(${MAX(100_000)});
}
fn main() {
    let account = var!["account"];
    let split = var!["split"];
    let funds = account.withdraw(TARI, amount!(${Number(amount)}));
    split.deposit(funds);
}`
    await manifest(code, { account, split }, MAX(100_000))
    break
  }
  case 'distribute': {
    const [split] = rest
    if (!isComponent(split)) throw new Error('usage: distribute <component_...>')
    const account = await feeAccount()
    const code = `fn fee_main() {
    let account = var!["account"];
    account.pay_fee(${MAX(100_000)});
}
fn main() {
    let split = var!["split"];
    split.distribute();
}`
    await manifest(code, { account, split }, MAX(100_000))
    break
  }
  case 'result': {
    out(await call('transactions.get_result', { transaction_id: rest[0] }))
    break
  }
  default:
    console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 20).join('\n'))
}
