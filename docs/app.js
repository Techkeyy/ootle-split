// Ootle Split web page: reads template + split state from the public Ootle indexer.
// No keys are held here. The optional Sapient button asks the user's wallet to sign one call.
const $ = (id) => document.getElementById(id);
const TARI_DECIMALS = 6;
let cfg = { indexer: 'https://indexer-a.ootle.tari.com', explorer: 'https://explorer.tari.mw' };

// ---- minimal CBOR decoder (ints, bigints, bytes, text, arrays, maps, tags, simple) ----
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function decodeCbor(bytes) {
  let i = 0;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = (ai) => {
    if (ai < 24) return ai;
    if (ai === 24) return bytes[i++];
    if (ai === 25) { const v = dv.getUint16(i); i += 2; return v; }
    if (ai === 26) { const v = dv.getUint32(i); i += 4; return v; }
    if (ai === 27) { const v = dv.getBigUint64(i); i += 8; return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v; }
    throw new Error('indefinite-length CBOR is not supported');
  };
  const item = () => {
    const b = bytes[i++], mt = b >> 5, ai = b & 31;
    switch (mt) {
      case 0: return len(ai);
      case 1: { const n = len(ai); return typeof n === 'bigint' ? -1n - n : -1 - n; }
      case 2: { const n = len(ai); const v = bytes.slice(i, i + n); i += n; return v; }
      case 3: { const n = len(ai); const v = new TextDecoder().decode(bytes.subarray(i, i + n)); i += n; return v; }
      case 4: { const n = len(ai); return Array.from({ length: n }, item); }
      case 5: { const n = len(ai); const m = new Map(); for (let k = 0; k < n; k++) { const key = item(); m.set(key instanceof Uint8Array ? hex(key) : key, item()); } return m; }
      case 6: {
        const tag = len(ai), value = item();
        if (tag === 2 && value instanceof Uint8Array) return BigInt('0x' + (hex(value) || '0')); // bignum
        return { tag, value };
      }
      case 7: if (ai === 20) return false; if (ai === 21) return true; if (ai === 22 || ai === 23) return null; throw new Error('unsupported CBOR simple value ' + ai);
    }
  };
  return item();
}

// ---- indexer ----
async function get(path) {
  const r = await fetch(cfg.indexer.replace(/\/+$/, '') + path, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`indexer HTTP ${r.status} for ${path}`);
  return r.json();
}
const substateUrl = (id) => `${cfg.indexer}/substates/${id}?local_search_only=false`;
async function substate(id) {
  const j = await get(`/substates/${encodeURIComponent(id)}?local_search_only=false`);
  const raw = j?.state?.up?.substate;
  if (!raw) throw new Error(`${id} is not a live substate on this network`);
  return { value: decodeCbor(b64(raw)), version: j.version };
}

const toBig = (v) => (typeof v === 'bigint' ? v : typeof v === 'number' ? BigInt(v) : typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : null);
function fmtTari(v) {
  const n = toBig(v);
  if (n === null) return String(v);
  const d = 10n ** BigInt(TARI_DECIMALS);
  const frac = (n % d).toString().padStart(TARI_DECIMALS, '0').replace(/0+$/, '');
  return `${(n / d).toLocaleString('en-US')}${frac ? '.' + frac : ''} TARI`;
}
const tagged = (v) => (v && typeof v === 'object' && v.value instanceof Uint8Array ? v.value : v instanceof Uint8Array ? v : null);

// Split struct field order (template/src/lib.rs):
// [label, recipients, shares, resource, funds(vault ref), total_deposited, total_distributed, distributions]
function findState(v, depth = 0) {
  if (depth > 8 || v === null || typeof v !== 'object') return null;
  if (Array.isArray(v)) {
    if (v.length === 8 && typeof v[0] === 'string' && Array.isArray(v[1]) && Array.isArray(v[2])) return v;
    for (const x of v) { const f = findState(x, depth + 1); if (f) return f; }
  } else if (v instanceof Map) {
    for (const x of v.values()) { const f = findState(x, depth + 1); if (f) return f; }
  } else if ('value' in v) return findState(v.value, depth + 1);
  return null;
}
function findAmount(value) {
  if (!Array.isArray(value)) return null;
  const [resource, amount] = value;
  if (resource?.tag !== undefined && toBig(amount) !== null && value.length >= 2 && tagged(resource)?.length === 32) return toBig(amount);
  for (const item of value) { const n = findAmount(item); if (n !== null) return n; }
  return null;
}

async function loadSplit(component) {
  const st = $('read-status'), box = $('split');
  st.className = 'status'; st.textContent = 'Reading from the indexer…'; box.hidden = true;
  try {
    if (!/^component_[0-9a-f]{64}$/.test(component)) throw new Error('enter a component_<64 hex> address');
    const s = await substate(component);
    const state = findState(s.value);
    if (!state) throw new Error('this component does not look like an Ootle Split');
    const [label, recipients, shares, , funds, deposited, distributed, rounds] = state;
    let balance = null;
    const vaultBytes = tagged(funds);
    if (vaultBytes) {
      try { balance = findAmount((await substate('vault_' + hex(vaultBytes))).value); } catch { /* shown as unknown */ }
    }
    $('s-label').textContent = label;
    $('s-balance').textContent = balance === null ? 'unknown' : fmtTari(balance);
    $('s-deposited').textContent = fmtTari(deposited);
    $('s-distributed').textContent = fmtTari(distributed);
    $('s-rounds').textContent = String(rounds);
    $('s-version').textContent = String(s.version);
    $('s-raw').href = substateUrl(component);
    const tbody = $('s-recipients'); tbody.textContent = '';
    recipients.forEach((r, k) => {
      const addr = tagged(r) ? 'component_' + hex(tagged(r)) : JSON.stringify(r);
      const bps = Number(shares[k]);
      const next = balance === null ? '?' : fmtTari((balance * BigInt(bps)) / 10000n);
      const tr = document.createElement('tr');
      const a = document.createElement('td'); const c = document.createElement('code'); c.textContent = addr; a.append(c);
      const b = document.createElement('td'); b.className = 'num'; b.textContent = (bps / 100).toFixed(2) + '%';
      const n = document.createElement('td'); n.className = 'num'; n.textContent = next;
      tr.append(a, b, n); tbody.append(tr);
    });
    box.hidden = false;
    st.className = 'status ok'; st.textContent = 'Live state from ' + new URL(cfg.indexer).host;
    $('distribute').disabled = !wallet.account;
    history.replaceState(null, '', '#' + component);
  } catch (e) {
    st.className = 'status bad'; st.textContent = e.message;
  }
}

// ---- manifests shown for the wallet app ----
function manifests() {
  const t = /^template_[0-9a-f]{64}$/.test(cfg.templateAddress ?? '') ? cfg.templateAddress : 'template_<PUBLISHED_TEMPLATE_HEX>';
  const fee = 'fn fee_main() {\n    let account = var!["account"];\n    account.pay_fee(100000);\n}\n';
  $('m-create').textContent = `use ${t} as Split;\n${fee}fn main() {\n    Split::new("Team Prize", [address!("component_<ALICE>"), address!("component_<BOB>")], [5000u32, 5000u32]);\n}`;
  $('m-deposit').textContent = `${fee}fn main() {\n    let account = var!["account"];\n    let split = var!["split"];\n    let funds = account.withdraw(TARI, amount!(1000000));\n    split.deposit(funds);\n}`;
  $('m-distribute').textContent = `${fee}fn main() {\n    let split = var!["split"];\n    split.distribute();\n}`;
}

// ---- Sapient (window.tari) — experimental ----
const wallet = { provider: null, account: null };
async function discover(timeout = 1500) {
  const ok = () => (window.tari?.isTariWallet === true && typeof window.tari.request === 'function' ? window.tari : null);
  if (ok()) return ok();
  return new Promise((res) => {
    const done = () => { if (ok()) { window.removeEventListener('tari#initialized', done); res(ok()); } };
    window.addEventListener('tari#initialized', done);
    setTimeout(() => res(ok()), timeout);
  });
}
const call = (method, params) => wallet.provider.request(params === undefined ? { method } : { method, params });
async function connect() {
  const ws = $('wallet-status');
  ws.className = 'status';
  wallet.provider = await discover();
  if (!wallet.provider) { ws.className = 'status bad'; ws.textContent = 'Sapient wallet extension not found in this browser.'; return; }
  try {
    const accounts = await call('tari_requestAccounts');
    const network = await call('tari_getNetwork');
    if (String(network) !== (cfg.network ?? 'mainnet')) throw new Error(`Sapient is on ${network}; switch it to ${cfg.network ?? 'mainnet'}.`);
    wallet.account = Array.isArray(accounts) ? accounts[0] : accounts;
    ws.className = 'status ok'; ws.textContent = `Connected: ${String(wallet.account).slice(0, 22)}… on ${network}`;
    $('distribute').disabled = $('split').hidden;
  } catch (e) { ws.className = 'status bad'; ws.textContent = e.message ?? String(e); }
}
async function distribute() {
  const ws = $('wallet-status'), component = $('comp').value.trim();
  ws.className = 'status';
  try {
    const created = await call('tari_createTransactionRequest', {
      kind: 'instructions',
      instructions: [{ CallMethod: { call: { Address: component }, method: 'distribute', args: [] } }],
      inputs: [{ substate_id: component, version: null }],
    });
    const id = created?.requestId;
    if (!id) throw new Error('wallet did not return a request id');
    ws.textContent = 'Approve the request in Sapient…';
    let submitted = false;
    for (let t = 0; t < 300; t++) {
      const rec = await call('tari_getTransactionRequest', { requestId: id });
      if (rec?.status === 'approved' && !submitted) { submitted = true; await call('tari_submitTransactionRequest', { requestId: id }); continue; }
      if (rec?.status === 'submitted' && rec.result?.transactionId) {
        const tx = rec.result.transactionId;
        ws.className = 'status ok';
        ws.innerHTML = `Submitted <a target="_blank" rel="noopener" href="${cfg.explorer}/tx/${tx}">${tx.slice(0, 16)}…</a>. Reloading state…`;
        setTimeout(() => loadSplit(component), 6000);
        return;
      }
      if (['rejected', 'failed', 'expired'].includes(rec?.status)) throw new Error(`request ${rec.status}${rec.error ? ': ' + rec.error : ''}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('timed out waiting for the wallet');
  } catch (e) { ws.className = 'status bad'; ws.textContent = e.message ?? String(e); }
}

// ---- boot ----
function setLink(id, href) { const a = $(id); if (href) a.href = href; else a.removeAttribute('href'); }
async function boot() {
  try { cfg = { ...cfg, ...(await (await fetch('config.json', { cache: 'no-store' })).json()) }; } catch { /* defaults */ }
  const tplOk = /^template_[0-9a-f]{64}$/.test(cfg.templateAddress ?? '');
  const txOk = /^[0-9a-f]{64}$/.test(cfg.publishTx ?? '');
  $('net-name').textContent = cfg.network ?? 'mainnet';
  $('tpl').textContent = tplOk ? cfg.templateAddress : 'not published yet';
  setLink('tpl-link', tplOk ? substateUrl(cfg.templateAddress) : null);
  $('ptx').textContent = txOk ? cfg.publishTx : 'not published yet';
  setLink('ptx-explorer', txOk ? `${cfg.explorer}/tx/${cfg.publishTx}` : null);
  setLink('ptx-indexer', txOk ? `${cfg.indexer}/transactions/${cfg.publishTx}` : null);
  $('pat').textContent = cfg.publishedAt || '—';
  setLink('repo', cfg.repo);
  manifests();
  get('/epoch-manager/stats').then((s) => { $('net-epoch').textContent = `epoch ${s.current_epoch}`; }).catch(() => { $('net-epoch').textContent = 'unreachable'; });
  if (tplOk) {
    get(`/substates/${cfg.templateAddress}?local_search_only=false`)
      .then((j) => { $('tpl-status').textContent = j?.state?.up ? 'yes, live on the indexer' : 'not found'; })
      .catch((e) => { $('tpl-status').textContent = e.message; });
  } else $('tpl-status').textContent = '—';
  const initial = location.hash.slice(1) || (/^component_[0-9a-f]{64}$/.test(cfg.demoSplit ?? '') ? cfg.demoSplit : '');
  if (initial) { $('comp').value = initial; loadSplit(initial); }
}
$('read-form').addEventListener('submit', (e) => { e.preventDefault(); loadSplit($('comp').value.trim()); });
$('connect').addEventListener('click', connect);
$('distribute').addEventListener('click', distribute);
boot();
