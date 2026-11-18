/* =====================================================================
   Administrace Gryfix Experience
   Obsah webu je v repozitáři (_data/programy.json, obsah.json, misto.json, fotky.json, site.json). Uložení = jeden commit
   přes backend webhunter-admin (Cloudflare Worker, přihlášení heslem); GitHub Action pak web přegeneruje.
   Fotky: v datech je buď soubor z img/ (např. „les-mapa.jpg“), nebo cesta nahrané fotky „img/uploads/…webp“.
   Poptávky z formuláře ukládá backend (KV), čtou se přes /forms.
   ===================================================================== */
'use strict';
(() => {
const CFG = {
  id: 'gryfix-3', site: '../',
  api: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.search.includes('local') ? 'http://localhost:8787' : 'https://webhunter-admin.webhunter.workers.dev',
};
const FILES = { programy: '_data/programy.json', obsah: '_data/obsah.json', misto: '_data/misto.json', fotky: '_data/fotky.json', site: '_data/site.json' };
const LABEL = { programy: 'programy', obsah: 'texty', misto: 'fotky místa', fotky: 'fotky', site: 'kontakty a vyhledávače' };
const SK = 'gryfix_admin';
const S = { sess: null, def: false, D: {}, snap: {}, orig: {}, pending: {}, preview: {}, saving: false, lib: null, libMap: {}, forms: null };

/* ---------------------------------------------------------------- ikony */
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  work: I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>'),
  story: I('<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6M9 18h3"/>'),
  quote: I('<path d="M7 17c-2 0-3-1.5-3-3.5C4 10 6 7 9 6M17 17c-2 0-3-1.5-3-3.5 0-3.5 2-6.5 5-7.5"/>'),
  layers: I('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  spark: I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  book: I('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>'),
  users: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.3.3 4 2.2 4.5 5.4"/>'),
  grid: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  phone: I('<path d="M4 6l8 6 8-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  text: I('<path d="M5 6h14M5 11h14M5 16h9"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-2.8 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.8-1.2 2 2 0 1 1-2.8-2.8A1.7 1.7 0 0 0 3.3 14a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.8 2 2 0 1 1 2.8-2.8A1.7 1.7 0 0 0 10 3.3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.8 1.2 2 2 0 1 1 2.8 2.8A1.7 1.7 0 0 0 20.7 10a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.3 1z"/>'),
  help: I('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h0"/>'),
  ext: I('<path d="M14 4h6v6M20 4L10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  x: I('<path d="M18 6L6 18M6 6l12 12"/>'),
  up: I('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  left: I('<path d="M15 18l-6-6 6-6"/>'),
  right: I('<path d="M9 18l6-6-6-6"/>'),
  trash: I('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  chev: I('<path d="M6 9l6 6 6-6"/>'),
  eye: I('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
  upload: I('<path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
  image: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  inbox: I('<path d="M3 13h5l1.5 3h5l1.5-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>'),
  refresh: I('<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>'),
};
const LOGO = '<img src="../img/gryfix-logo-tmave.png" alt="Gryfix Experience">';

/* ---------------------------------------------------------------- utils */
const $ = (s, c = document) => c.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 8);
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const UPL = /^img\/uploads\//;
const imgSrc = (k) => !k ? '' : S.preview[k] || (/^(https?:|blob:|data:)/.test(k) ? k : /^img\//.test(k) ? CFG.site + k : S.libMap[k] ? CFG.site + S.libMap[k] : '');
const plural = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);
const clone = (o) => JSON.parse(JSON.stringify(o));

function h(sel, props = {}, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
function toast(title, sub = '', type = '') {
  const el = h('div.toast' + (type ? '.' + type : ''), {}, h('b', {}, title), sub ? h('small', {}, sub) : null);
  $('#toasts').append(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, type === 'err' ? 7000 : 4000);
}
function modal({ title, body, actions = [] }) {
  return new Promise((resolve) => {
    const close = (v) => { bg.remove(); resolve(v); };
    const box = h('div.modal', { role: 'dialog', 'aria-modal': 'true' }, h('h2', {}, title));
    if (typeof body === 'string') box.append(h('div', { html: body })); else if (body) box.append(body);
    box.append(h('div.modal-actions', {}, actions.map((a) => h('button.btn' + (a.cls ? '.' + a.cls : ''), { type: 'button', onclick: () => close(typeof a.value === 'function' ? a.value(box) : a.value) }, a.label))));
    const bg = h('div.modal-bg', { onclick: (e) => { if (e.target === bg) close(null); } }, box);
    $('#modal-root').append(bg);
    const f = box.querySelector('input,textarea,select,button.btn-primary'); if (f) setTimeout(() => f.focus(), 50);
  });
}
const confirmDlg = (title, text, ok = 'Smazat', cls = 'btn-dark') => modal({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: 'Zrušit', value: false }, { label: ok, cls, value: true }] }).then((v) => v === true);

/* ---------------------------------------------------------------- API */
const b64e = (bytes) => { let s = ''; bytes = new Uint8Array(bytes); for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = (str) => b64e(new TextEncoder().encode(str));
function saveSess() { localStorage.setItem(SK, JSON.stringify({ t: S.sess, def: S.def, exp: Date.now() + 11.5 * 3600e3 })); }
async function api(path, opt = {}, retried = false) {
  const headers = { ...(typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {}) };
  if (S.sess) headers.Authorization = 'Bearer ' + S.sess;
  let r;
  try { r = await fetch(`${CFG.api}/api/${CFG.id}${path}`, { ...opt, headers, cache: 'no-store' }); }
  catch { throw new Error('Nelze se spojit se serverem. Zkontrolujte připojení k internetu.'); }
  if (r.status === 401 && path !== '/login' && !retried && S.D.site) { if (await reauth()) return api(path, opt, true); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error || m; } catch {} const e = new Error(m); e.status = r.status; throw e; }
  return opt.raw ? r.text() : r.json();
}
const readFile = (p) => api('/file?path=' + encodeURIComponent(p) + '&t=' + Date.now(), { raw: true });
async function commit(files, message) {
  const out = []; const queue = [...files];
  const worker = async () => { while (queue.length) { const f = queue.shift(); const { sha } = await api('/blob', { method: 'POST', body: JSON.stringify({ content: f.b64 ?? utf8b64(f.content), encoding: 'base64' }) }); out.push({ path: f.path, sha }); } };
  await Promise.all([worker(), worker(), worker()]);
  return (await api('/commit', { method: 'POST', body: JSON.stringify({ files: out, message }) })).sha;
}
async function reauth() {
  const inp = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Heslo' });
  const pw = await modal({ title: 'Přihlášení vypršelo', body: h('div', {}, h('p', {}, 'Zadejte prosím heslo znovu — rozdělaná práce zůstane zachovaná.'), inp), actions: [{ label: 'Zrušit', value: null }, { label: 'Přihlásit', cls: 'btn-primary', value: () => inp.value }] });
  if (!pw) return false;
  try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: pw }) }); S.sess = r.token; S.def = r.def; saveSess(); return true; }
  catch (e) { toast('Přihlášení se nepovedlo', e.message, 'err'); return false; }
}

/* ---------------------------------------------------------------- data */
async function loadAll() {
  const keys = Object.keys(FILES);
  const [res] = await Promise.all([Promise.all(keys.map((k) => readFile(FILES[k]).then(JSON.parse))), library()]);
  keys.forEach((k, i) => { S.D[k] = res[i]; S.orig[k] = JSON.stringify(res[i]); });
  snapshot();
}
/* prázdné texty a seznamy se při porovnání ignorují – samotné otevření formuláře není změna */
const norm = (o) => JSON.stringify(o, (k, v) => (k && (v === '' || (Array.isArray(v) && !v.length)) ? undefined : v));
function snapshot(keys = Object.keys(FILES)) { keys.forEach((k) => { S.snap[k] = norm(S.D[k]); }); }
const dirtyKeys = () => Object.keys(FILES).filter((k) => S.D[k] && norm(S.D[k]) !== S.snap[k]);
const changed = debounce(() => updateSavebar(), 100);
window.addEventListener('beforeunload', (e) => { if (dirtyKeys().length) { e.preventDefault(); e.returnValue = ''; } });
async function saveAll() {
  if (!dirtyKeys().length || S.saving) return;
  const err = validate(); if (err) return toast('Nelze uložit', err, 'err');
  S.saving = true; updateSavebar();
  const bar = h('div.progress-line'); document.body.append(bar);
  try {
    const keys2 = dirtyKeys();
    const files = keys2.map((k) => ({ path: FILES[k], content: JSON.stringify(S.D[k], null, 1) + '\n' }));
    const used = JSON.stringify(S.D);
    const imgs = Object.keys(S.pending).filter((p) => used.includes(p));
    imgs.forEach((p) => files.push({ path: p, b64: S.pending[p] }));
    const sha = await commit(files, keys2.map((k) => LABEL[k]).join(', ').replace(/^./, (c) => c.toUpperCase()) + (imgs.length ? ` (+${imgs.length} foto)` : ''));
    imgs.forEach((p) => delete S.pending[p]);
    snapshot(keys2); keys2.forEach((k) => { S.orig[k] = JSON.stringify(S.D[k]); });
    toast('Uloženo', 'Změny se na webu objeví zhruba za 2 minuty.', 'ok');
    watchPublish(sha);
  } catch (e) { toast('Uložení se nepovedlo', e.message, 'err'); }
  finally { S.saving = false; bar.remove(); updateSavebar(); }
}
function discard() { dirtyKeys().forEach((k) => { S.D[k] = JSON.parse(S.orig[k]); }); updateSavebar(); route(); toast('Změny zahozeny'); }

/* publikace — čeká, až version.json na webu obsahuje nový commit */
let pubTimer = null;
function setPub(state, text) { const el = $('.pub'); if (el) { el.className = 'pub ' + state; el.innerHTML = `<i></i><span>${esc(text)}</span>`; } }
function watchPublish(sha) {
  localStorage.setItem(SK + '_pub', JSON.stringify({ sha, t: Date.now() }));
  clearInterval(pubTimer); setPub('busy', 'Zveřejňuji změny…');
  const t0 = Date.now();
  pubTimer = setInterval(async () => {
    try {
      const v = await fetch(CFG.site + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
      if (v.sha === sha) { clearInterval(pubTimer); localStorage.removeItem(SK + '_pub'); setPub('', 'Web je aktuální'); S.lib = null; library(); toast('Změny jsou na webu', 'Web byl právě aktualizován.', 'ok'); return; }
    } catch {}
    if (Date.now() - t0 > 10 * 60000) { clearInterval(pubTimer); setPub('warn', 'Zveřejnění trvá déle'); }
  }, 6000);
}
function initPub() { const p = JSON.parse(localStorage.getItem(SK + '_pub') || 'null'); if (p && Date.now() - p.t < 12 * 60000) watchPublish(p.sha); else setPub('', 'Web je aktuální'); }

/* ---------------------------------------------------------------- fotky */
async function compress(file, max = 2000) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error(`Soubor „${file.name}“ nejde načíst. Použijte fotku JPG, PNG nebo WebP (fotky z iPhonu ve formátu HEIC nejdřív uložte jako JPG).`); }
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
  if (!blob || blob.type !== 'image/webp') throw new Error('Tento prohlížeč neumí fotku převést. Zkuste prosím Chrome, Safari nebo Edge.');
  return { blob, w: c.width, h: c.height };
}
async function upload(file, hint, max) {
  const { blob } = await compress(file, max);
  const d = new Date();
  const name = (slugify(hint) || slugify(file.name.replace(/\.[^.]+$/, '')) || 'foto').slice(0, 40);
  const path = `img/uploads/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${name}-${uid()}.webp`;
  S.pending[path] = b64e(await blob.arrayBuffer());
  S.preview[path] = URL.createObjectURL(blob);
  return path;
}
async function library() {
  if (!S.lib) {
    try { S.lib = await fetch(CFG.site + 'admin/images.json?t=' + Date.now()).then((r) => r.json()); } catch { S.lib = []; }
    S.libMap = Object.fromEntries(S.lib.map((x) => [x.k, x.src]));
  }
  return [...Object.keys(S.pending), ...S.lib.map((x) => x.k)];
}
async function pickFromLibrary(title = 'Vybrat fotku z webu') {
  const list = await library();
  return new Promise((resolve) => {
    let done = false;
    const grid = h('div.lib', {}, list.map((p) => h('button', { type: 'button', title: p, onclick: () => { done = true; resolve(p); document.querySelector('.modal-bg')?.remove(); } }, h('img', { src: imgSrc(p), loading: 'lazy', alt: '' }))));
    modal({ title, body: grid, actions: [{ label: 'Zavřít', value: null }] }).then(() => { if (!done) resolve(null); });
  });
}
function filePick(multiple) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple, hidden: true, onchange: () => { resolve([...inp.files]); inp.remove(); } });
    document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 120000);
  });
}

/* ---------------------------------------------------------------- pole formulářů */
const bump = () => changed();
function fText(obj, key, label, o = {}) {
  const inp = o.multi
    ? h('textarea', { rows: o.rows || 4, placeholder: o.ph || '', oninput: (e) => { obj[key] = e.target.value; bump(); o.on?.(); } })
    : h('input', { type: o.type || 'text', placeholder: o.ph || '', inputmode: o.inputmode, autocomplete: 'off', oninput: (e) => { obj[key] = e.target.value; bump(); o.on?.(); } });
  inp.value = obj[key] ?? '';
  return h('label.field', {}, h('span', {}, label), inp, o.hint ? h('small', {}, o.hint) : null);
}
function fSelect(obj, key, label, options, o = {}) {
  if (obj[key] != null && obj[key] !== '' && !options.some(([v]) => String(v) === String(obj[key]))) options = [[obj[key], String(obj[key])], ...options];
  const sel = h('select', { onchange: (e) => { obj[key] = e.target.value; bump(); o.on?.(); } }, options.map(([v, t]) => h('option', { value: v }, t)));
  sel.value = String(obj[key] ?? options[0][0]);
  return h('label.field', {}, h('span', {}, label), sel, o.hint ? h('small', {}, o.hint) : null);
}
function fCheck(obj, key, label, on) {
  return h('label.check', {}, h('input', { type: 'checkbox', checked: obj[key], onchange: (e) => { if (e.target.checked) obj[key] = true; else delete obj[key]; bump(); on?.(); } }), h('span', {}, label));
}
/** jedna fotka: obj[key] = klíč obrázku nebo cesta nahrané fotky */
function fImg(obj, key, label, o = {}) {
  const prev = h('img.prev' + (o.foto ? '.foto' : ''), { src: imgSrc(obj[key]), alt: '' });
  const set = (k) => { obj[key] = k; prev.src = imgSrc(k); bump(); o.on?.(); };
  return h('div.field', {}, h('span', {}, label),
    h('div.img-field', {}, prev, h('div.acts', {},
      h('button.btn.btn-sm', { type: 'button', html: IC.upload + 'Nahrát novou', onclick: async () => {
        const [f] = await filePick(false); if (!f) return;
        try { set(await upload(f, o.name || label, o.max)); toast('Fotka připravena', 'Na web se nahraje po uložení.'); } catch (er) { toast('Fotku se nepodařilo načíst', er.message, 'err'); }
      } }),
      h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: async () => { const p = await pickFromLibrary(); if (p) set(p); }, html: IC.image + 'Vybrat z webu' }))),
    o.hint ? h('small', {}, o.hint) : null);
}
/** seznam položek s rozbalováním, řazením a mazáním */
function fList(arr, o) {
  const wrap = h('div');
  const render = (openIdx = -1) => {
    wrap.replaceChildren();
    const items = h('div.items');
    if (!arr.length) items.append(h('p.empty', {}, o.empty || 'Zatím tu nic není.'));
    arr.forEach((it, i) => {
      const title = h('b'), sub = h('small'), thumb = o.thumb ? h('img.thumb', { alt: '' }) : null;
      const refresh = () => { title.textContent = String(o.title(it) || '').replace(/\*/g, '') || '(bez názvu)'; sub.textContent = o.sub ? o.sub(it) || '' : ''; if (thumb) { const u = imgSrc(o.thumb(it)); if (u) thumb.src = u; else thumb.removeAttribute('src'); thumb.style.visibility = u ? '' : 'hidden'; } };
      const body = h('div.item-body');
      let built = false;
      const el = h('div.item');
      const toggle = () => { if (!built) { o.body(it, body, refresh, i); built = true; } el.classList.toggle('open'); };
      const head = h('div.item-head', {},
        thumb, h('div.t', { onclick: toggle }, title, sub),
        h('div.item-tools', {},
          o.noSort ? null : h('button.btn.btn-icon.btn-ghost', { type: 'button', title: 'Posunout nahoru', 'aria-label': 'Posunout nahoru', disabled: i === 0, onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); bump(); render(); }, html: IC.up }),
          o.noSort ? null : h('button.btn.btn-icon.btn-ghost', { type: 'button', title: 'Posunout dolů', 'aria-label': 'Posunout dolů', disabled: i === arr.length - 1, onclick: () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); bump(); render(); }, html: IC.down }),
          o.noDelete ? null : h('button.btn.btn-icon.btn-ghost', { type: 'button', title: 'Smazat', 'aria-label': 'Smazat', onclick: async () => { if (await confirmDlg('Smazat položku?', `„${String(o.title(it) || 'bez názvu').replace(/\*/g, '')}“ bude odstraněna.`)) { arr.splice(i, 1); o.onDelete?.(it); bump(); render(); } }, html: IC.trash }),
          h('button.btn.btn-icon.btn-ghost.chev', { type: 'button', 'aria-label': 'Rozbalit', onclick: toggle, html: IC.chev })));
      el.append(head, body); items.append(el); refresh();
      if (i === openIdx) toggle();
    });
    wrap.append(...[items, o.make ? h('button.btn.add', { type: 'button', onclick: () => { arr.push(o.make()); bump(); render(arr.length - 1); }, html: IC.plus + (o.addLabel || 'Přidat') }) : null].filter(Boolean));
  };
  render(o.open ?? -1);
  return wrap;
}
/** seznam textů (odrážky / odstavce) */
function fStrList(arr, label, o = {}) {
  const box = h('div.field', {}, h('span', {}, label));
  const list = h('div');
  const render = () => {
    list.replaceChildren(...arr.map((v, i) => {
      const inp = o.multi ? h('textarea', { rows: o.rows || 3 }) : h('input', { type: 'text', placeholder: o.ph || '' });
      inp.value = v; inp.addEventListener('input', (e) => { arr[i] = e.target.value; bump(); });
      return h('div', { style: 'display:flex;gap:.4rem;align-items:flex-start;margin-bottom:.45rem' }, inp,
        h('button.btn.btn-icon.btn-ghost', { type: 'button', 'aria-label': 'Posunout nahoru', disabled: i === 0, onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); bump(); render(); }, html: IC.up }),
        h('button.btn.btn-icon.btn-ghost', { type: 'button', 'aria-label': 'Smazat', onclick: () => { arr.splice(i, 1); bump(); render(); }, html: IC.trash }));
    }), h('button.btn.btn-sm', { type: 'button', onclick: () => { arr.push(''); bump(); render(); }, html: IC.plus + (o.add || 'Přidat') }));
  };
  render(); box.append(...[list, o.hint ? h('small', {}, o.hint) : null].filter(Boolean));
  return box;
}
/** seznam dvojic/trojic [nadpis, text, …] */
const card = (title, hint, ...kids) => h('section.card', {}, title ? h('h2', {}, title) : null, hint ? h('p.hint', {}, hint) : null, ...kids);
const row2 = (...kids) => h('div.row2', {}, ...kids);
const subH = (t) => h('h3.sub-h', {}, t);
const note = (html) => h('p.note', { html });
const view = (title, lead, ...kids) => { const m = $('main.view'); m.replaceChildren(h('div.view-head', {}, h('h1', {}, title), lead ? h('p', {}, lead) : null), ...kids.filter((k) => k != null && k !== false)); window.scrollTo(0, 0); };
/** textová pole: defs = [[klíč, popisek, 'm' víceřádkové | 't', nápověda]] */
const fields = (obj, defs) => defs.map(([k, label, type, hint]) => { return fText(obj, k, label, { multi: type === 'm', rows: type === 'm' ? 3 : undefined, hint }); });
/* ---------------------------------------------------------------- poptávky (backend KV) */
async function loadForms(force) { if (!S.forms || force) S.forms = await api('/forms'); return S.forms; }
const fmtD = (iso) => { try { return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
async function vPoptavky() {
  const list = h('div', {}, h('p.empty', {}, 'Načítám…'));
  const filt = { s: '' };
  view('Poptávky', 'Všechno, co návštěvníci odešlou kontaktním formulářem na webu. Kliknutím otevřete detail, změníte stav nebo si připíšete poznámku.',
    h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center' },
      ...[['', 'Vše'], ['nova', 'Nové'], ['potvrzena', 'Rozpracované'], ['vyrizena', 'Vyřízené'], ['zrusena', 'Zrušené']].map(([v, t]) => h('button.btn.btn-sm' + (v === '' ? '.btn-dark' : '.btn-ghost'), { type: 'button', 'data-f': v, onclick: (e) => { filt.s = v; e.target.parentNode.querySelectorAll('[data-f]').forEach((b) => { b.className = 'btn btn-sm ' + (b === e.target ? 'btn-dark' : 'btn-ghost'); }); render(); } }, t)),
      h('button.btn.btn-sm', { type: 'button', style: 'margin-left:auto', onclick: async () => { await loadForms(true).catch((e) => toast('Nepodařilo se načíst', e.message, 'err')); D = S.forms; render(); }, html: IC.refresh + 'Obnovit' })),
    card(null, null, list));
  let D;
  const STAT_CZ = { nova: 'Nová', potvrzena: 'Rozpracovaná', vyrizena: 'Vyřízená', zrusena: 'Zrušená' };
  const render = () => {
    if (!D) return;
    const rows = D.forms.filter((f) => !filt.s || f.s === filt.s);
    if (!rows.length) return list.replaceChildren(h('p.empty', {}, D.forms.length ? 'Tady nic není.' : 'Zatím žádné poptávky. Jakmile někdo odešle formulář na webu, objeví se tady.'));
    list.replaceChildren(h('div.forms', {}, rows.map((f) => h('button.frow' + (f.s === 'nova' ? '.new' : ''), { type: 'button', onclick: () => detail(f.key) },
      h('span.fst.st-' + f.s, {}, STAT_CZ[f.s] || f.s), h('b', {}, f.n || '(bez jména)'),
      h('span', {}, f.w || 'Zpráva z webu'), h('span', {}, ''), h('small', {}, fmtD(f.d))))));
  };
  const detail = async (key) => {
    let r; try { r = await api('/forms?key=' + encodeURIComponent(key)); } catch (e) { return toast('Nepodařilo se načíst', e.message, 'err'); }
    const st = { status: r.status, note: r.note || '' };
    const body = h('div', {},
      h('table.ftable', {}, h('tbody', {},
        ...r.fields.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, /e-?mail/i.test(k) ? h('a', { href: 'mailto:' + v }, v) : /^Telefon/i.test(k) ? h('a', { href: 'tel:' + v.replace(/\s/g, '') }, v) : v))),
        h('tr', {}, h('th', {}, 'Odesláno'), h('td', {}, fmtD(r.created))))),
      fSelect(st, 'status', 'Stav', Object.entries(STAT_CZ)), fText(st, 'note', 'Poznámka (vidíte jen vy)', { multi: true, rows: 3 }));
    const res = await modal({ title: 'Poptávka z webu', body, actions: [{ label: 'Smazat', value: 'del', cls: 'btn-ghost' }, { label: 'Zavřít', value: null }, { label: 'Uložit', cls: 'btn-primary', value: 'save' }] });
    try {
      if (res === 'save') { await api('/forms', { method: 'POST', body: JSON.stringify({ key, status: st.status, note: st.note }) }); toast('Uloženo', '', 'ok'); }
      if (res === 'del' && await confirmDlg('Smazat poptávku?', 'Poptávka bude z přehledu trvale odstraněna.')) { await api('/forms', { method: 'POST', body: JSON.stringify({ key, delete: true }) }); toast('Smazáno'); }
      if (res) { D = await loadForms(true); render(); }
    } catch (e) { toast('Nepodařilo se uložit', e.message, 'err'); }
  };
  try { D = await loadForms(true); render(); } catch (e) { list.replaceChildren(h('p.empty', {}, 'Poptávky se nepodařilo načíst: ' + e.message)); }
}

/* ---------------------------------------------------------------- kontrola před uložením */
const num = (v) => { if (typeof v === 'number') return v; const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? NaN : Number(s); };
/** čas „15:30“, „15,5“, „15.5“ nebo „15“ → 15.5 */
const parseCas = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s*h$/, '');
  let m = s.match(/^(\d{1,2})[:.,](\d{2})$/); if (m && +m[2] < 60) return +m[1] + +m[2] / 60;
  m = s.match(/^(\d{1,2})(?:[.,](\d))?$/); if (m) return +m[1] + (m[2] ? +m[2] / 10 : 0);
  return NaN;
};
const fmtCas = (v) => { const n = parseCas(v); if (!isFinite(n)) return String(v ?? ''); const hh = Math.floor(n), mm = Math.round((n - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')}`; };
function validate() {
  for (const p of S.D.programy) {
    const jm = p.nazev || 'bez názvu';
    if (!String(p.nazev || '').trim()) return 'Jeden program nemá název.';
    if (!p.dny?.length) return `Program ${jm} musí mít aspoň jeden den.`;
    for (const d of p.dny) {
      if (!String(d.n || '').trim()) return `V programu ${jm} je den bez názvu.`;
      if (!d.foto?.f) return `${jm} – ${d.n}: chybí fotka.`;
      if (!d.b?.length) return `${jm} – ${d.n}: rozvrh je prázdný, přidejte aspoň jeden blok.`;
      for (const b of d.b) {
        const od = parseCas(b.od), dd = parseCas(b.do);
        if (!String(b.n || '').trim()) return `${jm} – ${d.n}: jeden blok rozvrhu nemá název.`;
        if (!isFinite(od) || !isFinite(dd) || od < 0 || dd > 24) return `${jm} – ${d.n}, „${b.n}“: čas zapište jako 15:30.`;
        if (od >= dd) return `${jm} – ${d.n}, „${b.n}“: konec musí být po začátku.`;
        b.od = Math.round(od * 100) / 100; b.do = Math.round(dd * 100) / 100;
      }
      d.b.sort((a, b2) => a.od - b2.od);
    }
    if (p.varianty) p.varianty = p.varianty.filter((v) => String(v).trim());
    if (p.rocni && !p.rocni.foto?.f) return 'Roční spolupráce nemá fotku.';
  }
  const o = S.D.obsah;
  if (!o.h1 || o.h1.length !== 2 || o.h1.some((x) => !String(x || '').trim())) return 'Hlavní nadpis musí mít oba řádky.';
  const sec = num(o.test.sekundy); if (!isFinite(sec) || sec < 3 || sec > 30) return 'Test: čas na zapamatování fotky musí být 3–30 sekund.';
  o.test.sekundy = Math.round(sec);
  for (const q of o.test.otazky) {
    q.ok = Number(q.ok);
    if (!String(q.q || '').trim() || q.a.some((a) => !String(a || '').trim())) return 'Test: každá otázka musí mít text a všechny tři odpovědi.';
    if (!(q.ok >= 0 && q.ok <= 2)) return 'Test: u otázky chybí správná odpověď.';
  }
  if (!o.test.foto) return 'Test nemá fotku.';
  for (const k of ['schopnosti', 'okruhy', 'misto_fakta', 'vize', 'odbornost']) o[k] = (o[k] || []).filter((x) => String(x).trim());
  if (o.schopnosti.length < 4) return 'Schopností musí být aspoň 4 (první čtyři jsou v úvodu webu).';
  if (!o.okruhy.length) return 'Musí zůstat aspoň jeden okruh vlastního programu.';
  if (S.D.misto.length !== 6 || S.D.misto.some((m) => !m.f)) return 'Fotky místa: všech šest míst musí mít fotku.';
  for (const [k, t] of FOTKY) if (!S.D.fotky[k]?.f) return `Chybí fotka: ${t}.`;
  const c = S.D.site.kontakt;
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return 'E-mail v Kontaktech nevypadá správně.';
  if (!String(S.D.site.popis || '').trim()) return 'Vyhledávače: popis webu nesmí být prázdný.';
  return null;
}

/* ---------------------------------------------------------------- pohledy */
const NAV = [
  ['', 'Přehled', 'home'], ['poptavky', 'Poptávky', 'inbox'], ['-'],
  ['programy', 'Programy', 'work', 'programy'], ['fotky', 'Fotky', 'image', 'fotky'], ['texty', 'Texty', 'text', 'obsah'],
  ['kontakty', 'Kontakty', 'phone', 'site'], ['seo', 'Vyhledávače', 'search', 'site'], ['-'],
  ['napoveda', 'Návod', 'help'], ['nastaveni', 'Heslo a odhlášení', 'gear'],
];
const FOTKY = [
  ['uvod', 'Úvod – velká fotka přes celou šířku', false, 'Hlavní fotka nahoře na webu. Na šířku, co nejostřejší.'],
  ['vize', 'Vize – fotka přes celou šířku', false, 'Fotka pod textem o vizi (teď briefing ve stodole).'],
  ['hra', 'Prověřte schopnosti – vystřižení lidé', true, 'Vystřižená skupina lidí na průhledném pozadí (PNG). Obyčejná fotka by tu byla jako obdélník.'],
  ['odbornost', 'Odbornost – fotka vedle oborů', false, 'Fotka na výšku nebo čtverec (teď les za soumraku).'],
  ['kontakt', 'Poptávka – Vaše fotka u formuláře', true, 'Vystřižená postava na průhledném pozadí (PNG).'],
];
const CUT = 'Vystřižená postava nebo skupina na průhledném pozadí (PNG) – na webu stojí přímo na barevné ploše.';

function vDash() {
  const tiles = [['poptavky', 'Poptávky', 'inbox', 'Zprávy z formuláře na webu'], ['programy', 'Programy', 'work', 'Alpha, Beta, Charlie – ceny a rozvrh'], ['fotky', 'Fotky', 'image', 'Výměna všech fotek na webu'],
    ['texty', 'Texty', 'text', 'Nadpis, vize, schopnosti, test'], ['kontakty', 'Kontakty', 'phone', 'Telefon, e-mail, adresa'], ['seo', 'Vyhledávače', 'search', 'Jak web ukazuje Google']]
    .map(([id, label, ic, sub]) => h('a.tile', { href: '#/' + id }, h('span', { html: IC[ic] }), h('b', {}, label), h('small', {}, sub)));
  const newBox = h('div');
  view('Dobrý den', 'Tady upravujete web Gryfix Experience: programy a jejich rozvrh, ceny, všechny fotky, texty a kontakty. Změny uložíte tlačítkem „Uložit změny“ dole – na webu se objeví zhruba za 2 minuty.',
    newBox, h('div.tiles', {}, tiles),
    card('Jak to funguje', null, h('div.help', { html: '<ol><li>Vlevo (na mobilu v menu ☰) vyberte, co chcete upravit.</li><li>Dole se objeví lišta – klikněte na <b>Uložit změny</b>.</li><li>Nahoře uvidíte „Zveřejňuji změny…“ a za chvíli „Web je aktuální“.</li></ol>' })),
    h('a.btn.btn-dark', { href: CFG.site, target: '_blank', rel: 'noopener', style: 'margin-top:.5rem', html: IC.ext + 'Otevřít web' }));
  loadForms().then((d) => { const n = d.forms.filter((f) => f.s === 'nova').length; if (n) newBox.replaceChildren(h('a.alert', { href: '#/poptavky' }, h('span', { html: IC.inbox }), h('b', {}, `${n} ${plural(n, 'nová poptávka', 'nové poptávky', 'nových poptávek')}`), h('small', {}, 'Zobrazit →'))); }).catch(() => {});
}

/* ---------------------------------------------------------------- programy */
function fCas(obj, key, label, on) {
  const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: '15:30', autocomplete: 'off', oninput: (e) => { const n = parseCas(e.target.value); obj[key] = isFinite(n) ? Math.round(n * 100) / 100 : e.target.value; bump(); on?.(); } });
  inp.value = fmtCas(obj[key]);
  return h('label.field', {}, h('span', {}, label), inp);
}
function vProgramy(arg) {
  const P = S.D.programy;
  const open = Math.max(-1, P.findIndex((p) => p.id === arg));
  view('Programy', 'Tři programy na webu. Rozklikněte program: nahoře je cena a popis, pod tím jednotlivé dny s fotkou a rozvrhem. Rozvrh na webu se sám poskládá podle časů.',
    fList(P, {
      noSort: true, noDelete: true, open,
      title: (p) => p.nazev + ' Experience', sub: (p) => [p.cena, p.delka, p.kapacita].filter(Boolean).join(' · '), thumb: (p) => p.dny?.[0]?.foto?.f,
      body: (p, b, r) => {
        b.append(
          row2(fText(p, 'nazev', 'Název (na webu se doplní „Experience“)', { on: r }), fText(p, 'cena', 'Cena', { ph: 'od 190 000 Kč', on: r })),
          row2(fText(p, 'dph', 'Poznámka k ceně', { ph: 'bez DPH' }), fText(p, 'delka', 'Délka', { ph: '2 noci', on: r })),
          fText(p, 'kapacita', 'Počet lidí', { ph: 'do 12 lidí', on: r }),
          fText(p, 'perex', 'Krátký popis na kartě', { multi: true, rows: 3 }),
          fText(p, 'vcene', 'Co je v ceně', { multi: true, rows: 3 }),
          p.varianty ? fStrList(p.varianty, 'Varianty programu', { add: 'Přidat variantu' }) : null,
          subH('Dny a rozvrh'),
          note('Fotka <b>prvního dne</b> je zároveň obrázek na kartě programu. Fotky dalších dnů jsou u rozvrhu s popiskem dne. ' + esc(CUT)),
          fList(p.dny, {
            addLabel: 'Přidat den', make: () => ({ n: `Den ${p.dny.length + 1}`, pozn: '', b: [], foto: { f: '', alt: '' } }),
            title: (d) => d.n, sub: (d) => [d.pozn, d.b.length ? `${d.b.length} ${plural(d.b.length, 'blok', 'bloky', 'bloků')}` : 'prázdný rozvrh'].filter(Boolean).join(' · '), thumb: (d) => d.foto?.f,
            body: (d, db, dr) => {
              d.foto = d.foto || { f: '', alt: '' };
              db.append(
                row2(fText(d, 'n', 'Název dne', { ph: 'Den 1', on: dr }), fText(d, 'pozn', 'Poznámka', { ph: 'příjezd ve 12 h', on: dr })),
                fImg(d.foto, 'f', 'Fotka dne', { name: `${p.id}-${d.n}`, max: 1600, hint: CUT, on: () => { dr(); r(); } }),
                fText(d.foto, 'alt', 'Popis fotky (co je na ní)'),
                h('div.field', {}, h('span', {}, 'Rozvrh dne'), fList(d.b, {
                  addLabel: 'Přidat blok', empty: 'Rozvrh je zatím prázdný.',
                  make: () => { const last = d.b[d.b.length - 1]; const od = last ? parseCas(last.do) : 9; return { od, do: Math.min(24, od + 1), n: '', t: 'p' }; },
                  title: (x) => x.n || '(bez názvu)', sub: (x) => `${fmtCas(x.od)}–${fmtCas(x.do)} · ${x.t === 'j' ? 'jídlo / pauza' : 'program'}`,
                  body: (x, xb, xr) => xb.append(
                    h('div.cas-row', {}, fCas(x, 'od', 'Od', xr), fCas(x, 'do', 'Do', xr)),
                    fText(x, 'n', 'Co se děje', { on: () => { xr(); dr(); } }),
                    fSelect(x, 't', 'Druh', [['p', 'Program'], ['j', 'Jídlo / pauza']], { on: xr, hint: 'Jídlo a pauzy jsou v rozvrhu světlejší.' })),
                }), h('small', {}, 'Časy pište jako 15:30. Pořadí se při uložení samo seřadí podle času.')),
              );
            },
          }),
          p.rocni ? subH('Roční spolupráce (široký pás pod programy)') : null,
          ...(p.rocni ? [fText(p.rocni, 'nazev', 'Nadpis'), fText(p.rocni, 'text', 'Text', { multi: true, rows: 3 }), fText(p.rocni, 'text2', 'Druhý odstavec', { multi: true, rows: 3 }),
            fText(p.rocni, 'cena', 'Cena'), fImg(p.rocni.foto, 'f', 'Fotka', { name: 'rocni', max: 1600, hint: CUT }), fText(p.rocni.foto, 'alt', 'Popis fotky')] : []),
        );
      },
    }));
}

/* ---------------------------------------------------------------- fotky */
function vFotky() {
  const F = S.D.fotky, M = S.D.misto, T = S.D.obsah.test;
  const MISTO = ['Velká fotka vlevo nahoře', 'Řada tří fotek – 1.', 'Řada tří fotek – 2.', 'Řada tří fotek – 3.', 'Čtverec vpravo dole', 'Široká fotka dole'];
  view('Fotky', 'Všechny fotky na webu. U každé klikněte na „Nahrát novou“ (fotka se sama zmenší a připraví pro mobil) nebo vyberte některou, která už na webu je. Fotky lidí u programů najdete v sekci Programy.',
    card('Fotky v sekcích', null, ...FOTKY.flatMap(([k, t, cut, hint]) => { F[k] = F[k] || { f: '', alt: '' }; return [fImg(F[k], 'f', t, { name: k, max: cut ? 1600 : 2400, hint, foto: !cut }), fText(F[k], 'alt', 'Popis fotky (co je na ní)')]; })),
    card('Místo – Kutná Hora', 'Šest fotek prostor. Popisek se ukazuje přímo na fotce.', ...M.map((m, i) => h('div', { style: i ? 'border-top:1px solid var(--line);padding-top:1rem;margin-top:1rem' : '' },
      fImg(m, 'f', `${i + 1}. ${MISTO[i]}`, { name: 'misto', max: 2400, foto: true }), row2(fText(m, 'p', 'Popisek na fotce'), fText(m, 'alt', 'Popis pro vyhledávače'))))),
    card('Test situační pozornosti', null,
      note('<b>Pozor:</b> otázky testu se ptají na to, co je na této fotce. Když ji vyměníte, upravte i otázky v sekci <a href="#/texty">Texty</a>. Fotka je zároveň malý náhled na kartě v úvodu webu.'),
      fImg(T, 'foto', 'Fotka k testu', { name: 'test', max: 2000, foto: true }), fText(T, 'alt', 'Popis fotky')),
    note('Fotky lidí u jednotlivých dnů a u roční spolupráce: <a href="#/programy">Programy</a>.'));
}

/* ---------------------------------------------------------------- texty */
function vTexty() {
  const o = S.D.obsah, t = o.test;
  view('Texty', 'Texty na webu odshora dolů. Názvy a ceny programů jsou v sekci Programy.',
    card('Úvod', null, row2(fText(o.h1, 0, 'Velký nadpis – 1. řádek'), fText(o.h1, 1, 'Velký nadpis – 2. řádek')), fText(o, 'uvod', 'Text pod nadpisem', { multi: true, rows: 3 })),
    card('Vize', null, fText(o, 'vize_titulek', 'Velká věta', { multi: true, rows: 2 }), fStrList(o.vize, 'Odstavce', { multi: true, rows: 4, add: 'Přidat odstavec' })),
    card('Prověřte schopnosti', null, fStrList(o.schopnosti, 'Schopnosti', { add: 'Přidat schopnost', hint: 'První čtyři se ukazují i v úvodu webu.' })),
    card('Test situační pozornosti', 'Návštěvník si fotku prohlédne, pak dostane tři otázky. Otázky musí sedět na fotku (fotka je v sekci Fotky).',
      fText(t, 'sekundy', 'Kolik sekund je fotka vidět', { type: 'number', inputmode: 'numeric', hint: '3–30 sekund' }),
      ...t.otazky.map((q, i) => h('div', { style: 'border-top:1px solid var(--line);padding-top:1rem;margin-top:1rem' }, subH(`Otázka ${i + 1}`),
        fText(q, 'q', 'Otázka'), ...[0, 1, 2].map((j) => fText(q.a, j, `Odpověď ${'ABC'[j]}`)),
        fSelect(q, 'ok', 'Správná odpověď', [[0, 'A'], [1, 'B'], [2, 'C']], { on: () => { q.ok = Number(q.ok); } })))),
    card('Sestavte si vlastní program', null, fStrList(o.okruhy, 'Okruhy', { add: 'Přidat okruh', hint: 'Okruhy jsou i zaškrtávátka ve formuláři poptávky.' })),
    card('Místo', null, note('První řádek se na webu neukazuje (je to podtitulek pro vyhledávače), zobrazují se řádky od druhého.'), fStrList(o.misto_fakta, 'Fakta o místě', { add: 'Přidat řádek' })),
    card('Odbornost', null, fText(o, 'odbornost_uvod', 'Úvodní věta', { multi: true, rows: 2 }), fStrList(o.odbornost, 'Obory', { multi: true, rows: 2, add: 'Přidat obor' })));
}

/* ---------------------------------------------------------------- kontakty */
function vKontakty() {
  const c = S.D.site.kontakt; c.adresa = c.adresa || {};
  view('Kontakty', 'Kontakty v hlavičce, patičce a u formuláře. Kam chodí poptávky z formuláře, nastavujeme my – stačí napsat.',
    card('Kontakt', null, fText(c, 'osoba', 'Jméno'), row2(fText(c, 'email', 'E-mail', { type: 'email' }), fText(c, 'telefon', 'Telefon', { type: 'tel', ph: '773 515 703' })), fText(c, 'web', 'Web (jen text)')),
    card('Adresa', 'Pro vyhledávače a mapy.', fText(c.adresa, 'ulice', 'Ulice'), row2(fText(c.adresa, 'psc', 'PSČ'), fText(c.adresa, 'mesto', 'Město'))));
}

/* ---------------------------------------------------------------- vyhledávače */
function vSeo() {
  const s = S.D.site;
  const cnt = h('small'); const upd = () => { cnt.textContent = `Titulek ${String(s.titulek || '').length} znaků · popis ${String(s.popis || '').length} znaků`; }; upd();
  view('Vyhledávače', 'Titulek a popis, které Google ukazuje ve výsledcích hledání a sítě při sdílení odkazu. Titulek ideálně do 60 znaků, popis 120–160 znaků. Web má navíc strukturovaná data a souhrn pro AI vyhledávače (ChatGPT, Perplexity) – ty se z programů a kontaktů skládají samy.',
    card('Celý web', null, fText(s, 'titulek', 'Titulek', { on: upd, ph: s.nazev }), fText(s, 'popis', 'Popis', { multi: true, rows: 3, on: upd }), cnt));
}

function vNapoveda() {
  view('Návod', null,
    card('Výměna fotky', null, h('div.help', { html: '<ol><li>Otevřete <b>Fotky</b> (nebo <b>Programy</b> u fotek lidí k jednotlivým dnům).</li><li>U fotky klikněte na <b>Nahrát novou</b>, nebo <b>Vybrat z webu</b> pro fotku, která už na webu je.</li><li>Napište krátký popis, co je na fotce – pomáhá vyhledávačům.</li><li>Dole klikněte na <b>Uložit změny</b>.</li></ol><p>U programů a u sekce „Prověřte schopnosti“ jsou vystřižení lidé na průhledném pozadí (PNG). Obyčejná fotka by tam byla jako obdélník – rádi Vám postavu vystřihneme.</p>' })),
    card('Změna programu', null, h('div.help', { html: '<ol><li>V <b>Programech</b> rozklikněte program. Upravíte název, cenu, počet lidí a popis.</li><li>Rozklikněte den a v něm jednotlivé bloky rozvrhu. Časy pište jako <code>15:30</code>.</li><li>Den přidáte tlačítkem <b>Přidat den</b>, blok tlačítkem <b>Přidat blok</b>, smažete je ikonou koše.</li><li>Rozvrh na webu se sám seřadí a roztáhne podle časů.</li></ol>' })),
    card('Poptávky', null, h('div.help', { html: '<ol><li>Poptávky z formuláře chodí na Váš e-mail a zároveň je najdete v sekci <b>Poptávky</b>.</li><li>Kliknutím otevřete detail, nastavíte stav a připíšete si poznámku.</li></ol>' })),
    card('Něco nejde?', null, h('p', {}, 'Napište nám na info.webhunter@email.cz – rádi pomůžeme.')));
}

function vSettings() {
  const f = { old: '', pw: '', pw2: '' };
  const msg = h('p', { style: 'color:var(--err);font-size:.9rem;min-height:1.2rem' });
  const pwInput = (key, label, ac) => h('label.field', {}, h('span', {}, label), h('input', { type: 'password', autocomplete: ac, oninput: (e) => { f[key] = e.target.value; } }));
  view('Heslo a odhlášení', null,
    card('Změnit heslo', 'Po změně hesla se odhlásí všechna ostatní zařízení. Heslo musí mít alespoň 8 znaků.',
      pwInput('old', 'Současné heslo', 'current-password'), pwInput('pw', 'Nové heslo', 'new-password'), pwInput('pw2', 'Nové heslo znovu', 'new-password'), msg,
      h('button.btn.btn-primary', { type: 'button', onclick: async (e) => {
        msg.textContent = '';
        if (f.pw.length < 8) return (msg.textContent = 'Nové heslo musí mít alespoň 8 znaků.');
        if (f.pw !== f.pw2) return (msg.textContent = 'Nová hesla se neshodují.');
        e.target.disabled = true;
        try { const r = await api('/password', { method: 'POST', body: JSON.stringify({ old: f.old, password: f.pw }) }); S.sess = r.token; S.def = false; saveSess(); toast('Heslo změněno', 'Příště se přihlaste novým heslem.', 'ok'); route(); }
        catch (er) { msg.textContent = er.message; } finally { e.target.disabled = false; }
      } }, 'Uložit nové heslo')),
    card('Odhlásit se', null, h('button.btn', { type: 'button', onclick: logout, html: IC.logout + 'Odhlásit' })));
}

/* ---------------------------------------------------------------- shell */
function renderShell() {
  const nav = h('nav.nav', { id: 'nav', 'aria-label': 'Sekce administrace' },
    h('button.btn.btn-icon.btn-ghost.nav-close', { type: 'button', 'aria-label': 'Zavřít menu', onclick: () => nav.classList.remove('open'), html: IC.x }),
    NAV.map(([id, label, ic, key]) => id === '-' ? h('hr') : h('a', { href: '#/' + id, 'data-id': id, 'data-key': key || '', onclick: () => nav.classList.remove('open'), html: IC[ic] + `<span>${esc(label)}</span>` })),
    h('hr'), h('a', { href: CFG.site, target: '_blank', rel: 'noopener', html: IC.ext + '<span>Zobrazit web</span>' }));
  const bar = h('div.savebar', { id: 'savebar' }, h('span', {}, ''),
    h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: async () => { if (await confirmDlg('Zahodit změny?', 'Neuložené úpravy se ztratí.', 'Zahodit')) discard(); } }, 'Zahodit'),
    h('button.btn.btn-primary', { type: 'button', onclick: saveAll }, 'Uložit změny'));
  $('#app').replaceChildren(h('div.shell', {},
    h('header.top', {},
      h('button.btn.btn-icon.btn-ghost.menu-btn', { type: 'button', 'aria-label': 'Menu', onclick: () => nav.classList.add('open'), html: IC.menu }),
      h('a.top-logo.brand', { href: '#/', html: LOGO + '<span>Administrace</span>' }),
      h('div.pub'), h('a.btn.btn-sm', { href: CFG.site, target: '_blank', rel: 'noopener', html: IC.eye + '<span>Web</span>' })),
    h('div.layout', {}, nav, h('main.view'))), bar);
  initPub();
}
function updateSavebar() {
  const keys = dirtyKeys(); const bar = $('#savebar'); if (!bar) return;
  bar.classList.toggle('on', keys.length > 0 || S.saving);
  bar.querySelector('span').textContent = S.saving ? 'Ukládám…' : `Neuložené změny: ${keys.map((k) => LABEL[k]).join(', ')}`;
  bar.querySelectorAll('button').forEach((b) => { b.disabled = S.saving; });
}
const VIEWS = { '': vDash, poptavky: vPoptavky, programy: vProgramy, fotky: vFotky, texty: vTexty, kontakty: vKontakty, seo: vSeo, napoveda: vNapoveda, nastaveni: vSettings };
function route() {
  const [id, arg] = location.hash.replace(/^#\/?/, '').split('/');
  (VIEWS[id] || vDash)(arg);
  document.querySelectorAll('.nav a[data-id]').forEach((a) => a.classList.toggle('on', a.dataset.id === (VIEWS[id] ? id : '')));
  updateSavebar();
}
window.addEventListener('hashchange', route);

/* ---------------------------------------------------------------- přihlášení */
function renderLogin(msg = '') {
  const inp = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', placeholder: 'Heslo', required: true });
  const err = h('p.login-err', {}, msg);
  const btn = h('button.btn.btn-primary', { type: 'submit' }, 'Přihlásit se');
  const form = h('form.login-card', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = 'Přihlašuji…';
    try {
      const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: inp.value }) });
      S.sess = r.token; S.def = r.def; saveSess(); await start();
    } catch (er) { err.textContent = er.message; btn.disabled = false; btn.textContent = 'Přihlásit se'; inp.select(); }
  } },
  h('div.brand', { html: LOGO }), h('h1', {}, 'Administrace webu'), h('p', {}, 'Přihlaste se heslem k administraci.'),
  h('label.field', {}, h('span', {}, 'Heslo'), h('div.pw-wrap', {}, inp, h('button.pw-eye', { type: 'button', 'aria-label': 'Zobrazit heslo', onclick: () => { inp.type = inp.type === 'password' ? 'text' : 'password'; }, html: IC.eye }))),
  btn, err);
  $('#app').replaceChildren(h('div.login', {}, form));
  setTimeout(() => inp.focus(), 50);
}
function logout() {
  if (dirtyKeys().length && !confirm('Máte neuložené změny. Opravdu se odhlásit?')) return;
  localStorage.removeItem(SK); S.sess = null; S.D = {}; renderLogin();
}
async function start() {
  $('#app').innerHTML = `<div class="boot"><div class="brand">${LOGO}</div><span class="spin"></span></div>`;
  try { await loadAll(); } catch (e) {
    if (e.status === 401) { localStorage.removeItem(SK); S.sess = null; return renderLogin('Přihlášení vypršelo, přihlaste se prosím znovu.'); }
    return renderLogin('Obsah webu se nepodařilo načíst: ' + e.message);
  }
  renderShell(); route();
}
function boot() {
  const s = JSON.parse(localStorage.getItem(SK) || 'null');
  if (s && s.exp > Date.now()) { S.sess = s.t; S.def = s.def; start(); } else renderLogin();
}
boot();
})();