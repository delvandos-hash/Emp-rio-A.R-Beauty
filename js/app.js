/**
 * Empório A.R. Beauty — Catálogo completo
 */
import { parsePrice, formatPriceBR as formatPrice } from './prices.js';

const GIST_RAW_URL = 'https://gist.githubusercontent.com/delvandos-hash/081d1d5efa2e2003cf859964a650dfb5/raw/catalogo.json';
const CATALOG_URLS = [GIST_RAW_URL, '/catalogo.json'];
const PAGE_SIZE = 48;
const STOCK_CACHE_MS = 10 * 60 * 1000;
const CANONICAL_HOME = 'https://emporioar-beauty.netlify.app/';

const LOCAL_FALLBACK = { DATA: {}, DESTAQUES: {}, BRANDS: [], WHATSAPP: '5562991134488', BRAND: { name: 'Empório A.R. Beauty', phone: '(62) 99113-4488' } };

function escapeHtml(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function decodeHtml(str) { if (!str) return ''; const t = document.createElement('textarea'); t.innerHTML = str; return t.value; }
function normId(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function productId(p) { return `${normId(p.brand)}-${normId(p.nome)}-${normId(p.volume)}`; }
function displayName(nome) { return String(nome||'').replace(/\s*\|\s*Atacado\s*$/i,'').trim(); }

function unitPrice(p, itemQty, globalQty) {
  if (p.somenteAtacado) return { price: parsePrice(p.atacado), tipo: 'Atacado' };
  if (globalQty >= 6) return { price: parsePrice(p.atacado), tipo: 'Atacado' };
  if (itemQty >= 6) return { price: parsePrice(p.atacado), tipo: 'Atacado' };
  return { price: parsePrice(p.varejo), tipo: 'Varejo' };
}

function safeGet(key, fallback) { try { const raw = localStorage.getItem(key); if (raw == null) return fallback; return JSON.parse(raw) ?? fallback; } catch { return fallback; } }
function safeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

const BUY_META_KEY = 'emporio_buy_meta_v3';
function loadBuyMeta() { return safeGet(BUY_META_KEY, { nome: '', cep: '', cidade: '', uf: '' }); }
function saveBuyMeta(nome, cep, cidade = '', uf = '') {
  const prev = loadBuyMeta();
  safeSet(BUY_META_KEY, { nome: (nome ?? prev.nome ?? '').trim(), cep: (cep ?? prev.cep ?? '').trim(), cidade: cidade || prev.cidade, uf: uf || prev.uf });
}

// Estado global
let DATA = {}, DESTAQUES = {}, WHATSAPP = '5562991134488';
let currentLine = 'all', searchTerm = '', filterDisp = 'all', filterPreco = 'all', filterMarca = 'all', sortBy = 'default', page = 1;
const favorites = new Set(safeGet('fav_maquiagem', []));
let favoritesSort = safeGet('fav_sort', 'added');
let cart = safeGet('cart_maquiagem', {});
const stockCache = new Map();
let allProductsCache = null;
let detailsNavList = [], detailsNavIndex = 0, detailsScrollY = 0;
let buyProduct = null, currentProduct = null, preloadedImageLink = null;

function setSeo(title, desc, url, img) {
  document.title = title;
  document.getElementById('metaDescription')?.setAttribute('content', desc);
  document.getElementById('canonicalLink')?.setAttribute('href', url);
  document.getElementById('ogTitle')?.setAttribute('content', title);
  document.getElementById('ogDescription')?.setAttribute('content', desc);
  document.getElementById('ogUrl')?.setAttribute('content', url);
  document.getElementById('ogImage')?.setAttribute('content', img || CANONICAL_HOME + 'assets/logo.jpg');
}
function updateSeoForProduct(p) {
  const url = window.location.href;
  setSeo(displayName(p.nome) + ' | Empório A.R. Beauty', (decodeHtml(p.notas||'').slice(0, 150)) || displayName(p.nome), url, p.foto);
  if (preloadedImageLink) preloadedImageLink.remove();
  if (p.foto) {
    preloadedImageLink = document.createElement('link');
    preloadedImageLink.rel = 'preload'; preloadedImageLink.as = 'image'; preloadedImageLink.href = p.foto;
    document.head.appendChild(preloadedImageLink);
  }
}
function resetSeoToHome() {
  setSeo('Empório A.R. Beauty | Catálogo de Maquiagem', 'Catálogo online de maquiagens e cosméticos. Preços de varejo e atacado. Pedido pelo WhatsApp.', CANONICAL_HOME, CANONICAL_HOME + 'assets/logo.jpg');
  if (preloadedImageLink) { preloadedImageLink.remove(); preloadedImageLink = null; }
}

async function loadCatalogData() {
  for (const url of CATALOG_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
      if (j && j.DATA && Object.keys(j.DATA).length > 0) return j;
    } catch (e) { console.warn(url, e); }
  }
  return null;
}

async function init() {
  const boot = document.getElementById('bootStatus');
  if (boot) {
    boot.style.display = 'grid';
    boot.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      boot.innerHTML += `<div class="skeleton-card"><div class="skeleton-photo"></div><div class="skeleton-lines"><div class="skeleton-line w-80"></div><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div></div></div>`;
    }
  }

  const dados = await loadCatalogData();
  
  if (!dados) {
    if (boot) boot.style.display = 'none';
    document.getElementById('errorFallback').style.display = 'block';
    return;
  }

  DATA = dados.DATA;
  DESTAQUES = dados.DESTAQUES || {};
  WHATSAPP = dados.WHATSAPP || '5562991134488';
  allProductsCache = null;

  if (boot) boot.style.display = 'none';
  
  const savedFilters = safeGet('emporio_filters', {});
  currentLine = savedFilters.line || 'all';
  searchTerm = savedFilters.search || '';
  filterMarca = savedFilters.marca || 'all';
  
  document.getElementById('searchInput').value = searchTerm;
  document.querySelectorAll('#tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.line === currentLine));
  
  populateBrands();
  updateSessionCounters();
  updateCartBadge();
  updateFavBadge();
  renderDestaques();
  renderProducts(true);
  initSwipeDetails();
  openProductFromUrl();
  initPwa();
  setupCepAutoFill('buyCep', 'buyNome', 'cepStatus');
  setupCepAutoFill('checkoutCep', 'checkoutNome', 'checkoutCepStatus');
  bindGlobalEvents();
}

function getAllProducts() {
  if (allProductsCache) return allProductsCache;
  const list = [];
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const g of groups || []) {
      for (const it of g.items || []) {
        list.push({ ...it, brand: g.brand, cat: g.cat, line });
      }
    }
  }
  allProductsCache = list;
  return list;
}
function findProduct(id) { return getAllProducts().find(p => productId(p) === id) || null; }

function isLojas10(p) { const b = (p.badge || '').toUpperCase(); const d = (p.destaque || '').toLowerCase(); return b.includes('LOJAS') || b.includes('R$10') || d === 'lojas10'; }
function isOferta(p) { const b = (p.badge || '').toUpperCase(); const d = (p.destaque || '').toLowerCase(); return b.includes('OFERTA') || d === 'ofertaslimitadas' || d === 'ofertas'; }
function isVitrineProduct(p) { return isLojas10(p) || isOferta(p); }

function getDestaqueItems(key) {
  const fromDest = DESTAQUES[key]?.items || [];
  if (fromDest.length) return fromDest.map(it => ({ ...it, brand: it.brand || '', cat: it.cat || '', line: it.line || 'outros', badge: it.badge || (key === 'lojas10' ? 'LOJAS R$10' : 'OFERTA'), destaque: it.destaque || key }));
  if (key === 'lojas10') return getAllProducts().filter(isLojas10);
  if (key === 'ofertasLimitadas') return getAllProducts().filter(isOferta);
  return [];
}

function populateBrands() {
  const sel = document.getElementById('filterMarca');
  if (!sel) return;
  const brands = new Set();
  const pool = getAllProducts();
  pool.forEach(p => {
    if (isVitrineProduct(p) && currentLine !== 'lojas10') return;
    if (currentLine !== 'all' && currentLine !== 'lojas10' && p.line !== currentLine) return;
    if (p.brand) brands.add(p.brand);
  });
  const sorted = [...brands].sort();
  sel.innerHTML = '<option value="all">Todas as marcas</option>' + sorted.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  if (sorted.includes(filterMarca)) sel.value = filterMarca; else filterMarca = 'all';
}

function updateSessionCounters() {
  const pool = getAllProducts();
  const counts = { all: 0, lojas10: 0, rosto: 0, olhos: 0, labios: 0, corpo: 0, cabelo: 0, acessorios: 0 };
  pool.forEach(p => {
    if (isLojas10(p)) counts.lojas10++;
    if (!isVitrineProduct(p)) {
      counts.all++;
      if (counts[p.line] !== undefined) counts[p.line]++;
    }
  });
  document.querySelectorAll('#tabs .tab').forEach(btn => {
    const line = btn.dataset.line;
    const baseName = btn.textContent.split('(')[0].trim();
    if (counts[line] !== undefined) btn.textContent = `${baseName} (${counts[line]})`;
  });
}

function matchesFilters(p) {
  if (currentLine === 'lojas10') { if (!isLojas10(p)) return false; } 
  else { if (isVitrineProduct(p)) return false; if (currentLine !== 'all' && p.line !== currentLine) return false; }
  if (filterMarca !== 'all' && p.brand !== filterMarca) return false;
  if (searchTerm) { const q = searchTerm.toLowerCase(); const hay = `${p.nome} ${p.brand} ${p.cat} ${p.volume}`.toLowerCase(); if (!hay.includes(q)) return false; }
  const disp = (p.disponivel || '').toLowerCase() === 'sim';
  if (filterDisp === 'sim' && !disp) return false;
  if (filterDisp === 'nao' && disp) return false;
  const preco = parsePrice(p.somenteAtacado ? p.atacado : p.varejo);
  if (filterPreco === 'ate50' && preco > 50) return false;
  if (filterPreco === '50a100' && (preco < 50 || preco > 100)) return false;
  if (filterPreco === 'acima100' && preco <= 100) return false;
  return true;
}
function sortProducts(list) {
  const arr = list.slice();
  if (sortBy === 'price-asc') arr.sort((a,b)=>parsePrice(a.somenteAtacado?a.atacado:a.varejo)-parsePrice(b.somenteAtacado?b.atacado:b.varejo));
  else if (sortBy === 'price-desc') arr.sort((a,b)=>parsePrice(b.somenteAtacado?b.atacado:b.varejo)-parsePrice(a.somenteAtacado?a.atacado:a.varejo));
  else if (sortBy === 'name') arr.sort((a,b)=>displayName(a.nome).localeCompare(displayName(b.nome),'pt-BR'));
  return arr;
}

function saveFilters() { safeSet('emporio_filters', { line: currentLine, search: searchTerm, marca: filterMarca }); }

function saveCart() { safeSet('cart_maquiagem', cart); updateCartBadge(); refreshInCartBadges(); updateMobileCartBar(); }
function updateCartBadge() { const total = Object.values(cart).reduce((s,i)=>s+i.qty,0); const badge = document.getElementById('cartBadge'); if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'flex' : 'none'; } }
function updateMobileCartBar() {
  const bar = document.getElementById('mobileCartBar');
  if (!bar) return;
  const { subtotal, totalItems } = cartTotals();
  const countEl = document.getElementById('mobileCartCount');
  const totalEl = document.getElementById('mobileCartTotal');
  if (countEl) countEl.textContent = totalItems;
  if (totalEl) totalEl.textContent = formatPrice(subtotal);
  const show = totalItems > 0;
  bar.classList.toggle('show', show);
  document.body.classList.toggle('has-mobile-cart', show);
}

function isProductInCart(p) {
  const baseId = productId(p);
  if (cart[baseId]) return true;
  for (const id of Object.keys(cart)) if (id === baseId || id.startsWith(baseId + '|')) return true;
  return false;
}
function refreshInCartBadges() {
  document.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;
    if (!id) return;
    const p = findProduct(id);
    if (!p) return;
    const inCart = isProductInCart(p);
    const btn = card.querySelector('[data-cart]');
    if (btn) { btn.classList.toggle('in-cart', inCart); btn.textContent = inCart ? '✓ No carrinho' : 'Carrinho'; }
    const existingBadge = card.querySelector('.badge-in-cart');
    if (inCart && !existingBadge) { const badge = document.createElement('span'); badge.className = 'badge-in-cart'; badge.textContent = 'NO CARRINHO'; card.querySelector('.photo')?.appendChild(badge); }
    else if (!inCart && existingBadge) { existingBadge.remove(); }
  });
}

function addToCart(p, qty=1) {
  const id = productId(p) + (p.variacaoSelecionada ? '|' + p.variacaoSelecionada.nome : '');
  if (cart[id]) cart[id].qty += qty; else cart[id] = { product: p, qty };
  saveCart(); showToast('Adicionado: ' + displayName(p.nome).slice(0,42));
}
function removeFromCart(id) { delete cart[id]; saveCart(); renderCart(); }
function setCartQty(id, qty) { qty = parseInt(qty,10); if (!qty || qty < 1) return removeFromCart(id); if (cart[id]) { cart[id].qty = qty; saveCart(); renderCart(); } }
function clearCart() { cart = {}; saveCart(); renderCart(); }

function cartTotals() {
  let subtotal=0, totalItems=0; const lines=[];
  const globalQty = Object.values(cart).reduce((s,i)=>s+i.qty,0);

  for (const [id, item] of Object.entries(cart)) {
    const { product:p, qty } = item;
    const { price, tipo } = unitPrice(p, qty, globalQty);
    const lineTotal = price * qty;
    subtotal += lineTotal; totalItems += qty;
    lines.push({ id, p, qty, price, tipo, lineTotal });
  }
  return { subtotal, totalItems, lines };
}

async function checkLiveStock(p) {
  const url = p.sourceUrl;
  if (!url) return p.disponivel;
  const cached = stockCache.get(url);
  if (cached && Date.now()-cached.ts < STOCK_CACHE_MS) return cached.disponivel;
  try {
    const res = await fetch('/.netlify/functions/stock?url='+encodeURIComponent(url), { cache:'no-store' });
    if (!res.ok) throw new Error('fn');
    const data = await res.json();
    const disponivel = data.disponivel || p.disponivel;
    stockCache.set(url, { disponivel, ts: Date.now() });
    return disponivel;
  } catch { return p.disponivel; }
}

function cardHtml(p) {
  const id = productId(p);
  const isFav = favorites.has(id);
  const inCart = isProductInCart(p);
  const disponivel = (p.disponivel||'').toLowerCase()==='sim';
  const badge = (p.badge||'').toUpperCase();
  const nome = escapeHtml(displayName(p.nome));
  const brand = escapeHtml(p.brand||'');
  const volume = escapeHtml(p.volume||'');
  const cat = escapeHtml(p.cat||'');
  const foto = escapeHtml(p.foto || (p.fotos&&p.fotos[0]) || '');
  const eid = escapeHtml(id);
  let badgeHtml = '';
  if (badge.includes('LOJAS') || badge.includes('R$10')) badgeHtml = '<span class="badge-novo" style="background:#0d9488">R$10</span>';
  else if (badge.includes('OFERTA')) badgeHtml = '<span class="badge-novo" style="background:#ea580c">OFERTA</span>';
  else if (badge.includes('NOVO')) badgeHtml = '<span class="badge-novo">NOVO</span>';
  if (!disponivel) badgeHtml += '<span class="badge-esgotado">ESGOTADO</span>';
  const estoque = p.total_estoque !== undefined ? Number(p.total_estoque) : (p.estoque !== undefined ? Number(p.estoque) : null);
  const lowStockHtml = (estoque !== null && estoque > 0 && estoque <= 3) ? '<span class="badge-low-stock">Últimas un.</span>' : '';
  const cartBadgeHtml = inCart ? '<span class="badge-in-cart">NO CARRINHO</span>' : '';
  
  const prices = p.somenteAtacado
    ? `<div><span class="price-label">Atacado</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div>`
    : `<div><span class="price-label">Varejo</span><span class="price-v">R$ ${escapeHtml(p.varejo)}</span></div><div><span class="price-label">Atacado (6+)</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div>`;
  
  const cartBtnLabel = inCart ? '✓ No carrinho' : 'Carrinho';
  const cartBtnClass = inCart ? 'btn-sm btn-cart in-cart' : 'btn-sm btn-cart';
  
  return `<article class="card" data-id="${eid}">
    <button class="fav ${isFav?'active':''}" data-fav="${eid}" aria-label="Favoritar" aria-pressed="${isFav?'true':'false'}">♥</button>
    <div class="photo" data-open="${eid}">${badgeHtml}${lowStockHtml}${cartBadgeHtml}
      <img src="${foto}" alt="${nome}" width="72" height="72" loading="lazy" decoding="async" data-fallback="https://via.placeholder.com/150?text=Sem+foto"/>
    </div>
    <div class="info">
      <div class="name" data-open="${eid}">${nome}</div>
      <div class="meta">${brand} · ${volume} · ${cat}</div>
      <div class="prices">${prices}</div>
      <div class="card-actions">
        <button class="btn-sm btn-details" data-details="${eid}">Detalhes</button>
        <button class="${cartBtnClass}" data-cart="${eid}">${cartBtnLabel}</button>
        <button class="btn-sm btn-buy" data-buy="${eid}">Comprar</button>
        <button class="btn-sm btn-share" data-share="${eid}" title="Compartilhar">🔗</button>
      </div>
    </div>
  </article>`;
}

function bindCardEvents(root) {
  root.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.fav;
      if (favorites.has(id)) { favorites.delete(id); btn.classList.remove('active'); btn.setAttribute('aria-pressed','false'); }
      else { favorites.add(id); btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
      safeSet('fav_maquiagem', [...favorites]);
      updateFavBadge();
      if (document.getElementById('favoritesModal')?.classList.contains('open')) renderFavoritesList();
    });
  });
  root.querySelectorAll('[data-open],[data-details]').forEach(el => {
    el.addEventListener('click', e => {
      if (el.classList.contains('fav')) return;
      const id = el.dataset.open || el.dataset.details;
      const p = findProduct(id);
      if (p) openDetails(p);
    });
  });
  root.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); const p = findProduct(btn.dataset.buy); if (p) openBuyModal(p); });
  });
  root.querySelectorAll('[data-cart]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); const p = findProduct(btn.dataset.cart); if (p) addToCart(p,1); });
  });
  root.querySelectorAll('[data-share]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); const p = findProduct(btn.dataset.share); if (p) shareProduct(p); });
  });
}

function renderDestaques() {
  const host = document.getElementById('destaquesHost');
  if (!host) return;
  const ofertas = getDestaqueItems('ofertasLimitadas');
  const titleOfertas = DESTAQUES.ofertasLimitadas?.title || 'Ofertas por tempo limitado';
  let html = '';
  if (ofertas.length) {
    html += `<section class="vitrine-section" id="vitrineOfertasSection"><div class="vitrine-head"><h2>${escapeHtml(titleOfertas)}</h2></div><div class="vitrine-track" id="vitrineOfertas">${ofertas.map(p => `<div class="vitrine-card">${cardHtml(p)}</div>`).join('')}</div></section>`;
  }
  host.innerHTML = html;
  if (html) bindCardEvents(host);
}

function getLojas10Products() { return getDestaqueItems('lojas10'); }

function renderProducts(resetPage=true) {
  if (resetPage) page = 1;
  const container = document.getElementById('products');
  const empty = document.getElementById('empty');
  const moreWrap = document.getElementById('loadMoreWrap');
  const stats = document.getElementById('resultStats');

  const pool = currentLine === 'lojas10' ? getLojas10Products() : getAllProducts();
  const filtered = sortProducts(pool.filter(matchesFilters));
  detailsNavList = filtered;
  const total = filtered.length;
  const visible = filtered.slice(0, page * PAGE_SIZE);

  if (stats) stats.textContent = total ? `${Math.min(visible.length,total)} de ${total} produtos` : '';
  if (!total) {
    container.style.display = 'none'; empty.style.display = 'block'; if (moreWrap) moreWrap.style.display = 'none'; return;
  }
  empty.style.display = 'none'; container.style.display = 'grid';
  container.innerHTML = visible.map(cardHtml).join('');
  if (moreWrap) moreWrap.style.display = visible.length < total ? 'flex' : 'none';
  bindCardEvents(container);
}

function buildVariacoesHtml(p) {
  const vars = Array.isArray(p.variacoes) ? p.variacoes : [];
  if (!vars.length) return '';
  const chips = vars.map(v => {
    const ok = v.estoque === undefined || Number(v.estoque) > 0;
    const id = String(v.id || v.nome || '');
    const label = escapeHtml(v.nome || '—');
    const disabled = ok ? '' : ' disabled';
    return `<button type="button" class="var-chip${ok?'':' var-chip-out'}" data-var-id="${id}" data-var-nome="${label}"${disabled} aria-pressed="false"><span class="var-chip-name">${label}</span></button>`;
  }).join('');
  return `<div class="variacoes-box" id="variacoesBox"><strong>Escolha as opções (pode marcar várias)</strong><div class="var-chips">${chips}</div><p class="var-hint" id="varHint">Selecione uma ou mais opções disponíveis</p><button type="button" id="btnAddMulti" class="btn-add-multi" style="display:none">🛒 Adicionar <span id="multiCount">0</span> opção(ões) ao carrinho</button></div>`;
}

function bindVariacaoSelector(p) {
  const box = document.getElementById('variacoesBox');
  if (!box) return;
  const selected = new Set();
  const refresh = () => {
    const chips = box.querySelectorAll('.var-chip');
    chips.forEach(chip => {
      const id = chip.getAttribute('data-var-id');
      const on = selected.has(id);
      chip.classList.toggle('selected', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const btn = document.getElementById('btnAddMulti');
    const count = document.getElementById('multiCount');
    const hint = document.getElementById('varHint');
    if (btn) btn.style.display = selected.size ? '' : 'none';
    if (count) count.textContent = selected.size;
    if (hint) {
      if (selected.size) { hint.textContent = `${selected.size} opção(ões) selecionada(s)`; hint.classList.add('ok'); }
      else { hint.textContent = 'Selecione uma ou mais opções disponíveis'; hint.classList.remove('ok'); }
    }
    if (selected.size === 1) {
      const id = [...selected][0];
      const chip = box.querySelector(`[data-var-id="${CSS.escape(id)}"]`);
      p.variacaoSelecionada = chip ? { id, nome: chip.getAttribute('data-var-nome') || '' } : null;
    } else { p.variacaoSelecionada = null; }
  };

  box.querySelectorAll('.var-chip:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-var-id');
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      refresh();
    });
  });

  document.getElementById('btnAddMulti')?.addEventListener('click', () => {
    if (!selected.size) return;
    const vars = Array.isArray(p.variacoes) ? p.variacoes : [];
    let added = 0;
    selected.forEach(id => {
      const v = vars.find(x => String(x.id || x.nome) === id);
      if (!v) return;
      const clone = { ...p, variacaoSelecionada: { id: String(v.id || ''), nome: String(v.nome || '') } };
      addToCart(clone, 1); added++;
    });
    if (added) { showToast(`${added} opção(ões) adicionada(s) ao carrinho`); selected.clear(); refresh(); }
  });
  refresh();
}

function openDetails(p, opts={}) {
  if (!opts.fromNav) { detailsScrollY = window.scrollY || 0; detailsNavList = detailsNavList.length ? detailsNavList : sortProducts(getAllProducts().filter(matchesFilters)); detailsNavIndex = Math.max(0, detailsNavList.findIndex(x => productId(x)===productId(p))); }
  currentProduct = p; p.variacaoSelecionada = null;
  const fotos = (p.fotos && p.fotos.length) ? p.fotos : (p.foto ? [p.foto] : []);
  const mainFoto = escapeHtml(fotos[0]||'');
  const desc = escapeHtml(decodeHtml(p.notas||'').trim() || 'Sem descrição adicional.');
  const dispInicial = (p.disponivel||'').toLowerCase()==='sim';
  const nome = escapeHtml(displayName(p.nome));
  const brand = escapeHtml(p.brand||'');
  const volume = escapeHtml(p.volume||'');
  const cat = escapeHtml(p.cat||'');
  const precoHtml = p.somenteAtacado
    ? `<div class="details-price"><span class="price-label">Atacado</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div>`
    : `<div class="details-price"><div><span class="price-label">Varejo</span><span class="price-v">R$ ${escapeHtml(p.varejo)}</span></div><div><span class="price-label">Atacado (6+)</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div></div>`;
  const thumbs = fotos.slice(1).map((f,i)=>`<img src="${escapeHtml(f)}" alt="" width="48" height="48" loading="lazy" data-full="${escapeHtml(f)}"/>`).join('');
  const estoque = p.total_estoque !== undefined ? Number(p.total_estoque) : (p.estoque !== undefined ? Number(p.estoque) : null);
  const lowStockHtml = (estoque !== null && estoque > 0 && estoque <= 3) ? '<span style="color:#f59e0b;font-weight:bold;font-size:0.8rem;margin-left:8px;">(Últimas unidades!)</span>' : '';

  injectProductJsonLd(p);
  const variacoesHtml = buildVariacoesHtml(p);
  const shareBtn = `<button class="btn-sm btn-share" id="detailsShareBtn" style="background:#e5e7eb;color:#111;margin-left:auto;">🔗 Compartilhar</button>`;

  document.getElementById('detailsContent').innerHTML = `
    <div class="details-nav"><button type="button" class="nav-btn" id="detPrev" ${detailsNavIndex<=0?'disabled':''} aria-label="Anterior">‹</button><span class="nav-pos">${detailsNavIndex+1}/${Math.max(detailsNavList.length,1)}</span><button type="button" class="nav-btn" id="detNext" ${detailsNavIndex>=detailsNavList.length-1?'disabled':''} aria-label="Próximo">›</button></div>
    <div class="details-photo"><img src="${mainFoto}" alt="${nome}" id="detailsMainImg" width="280" height="280" loading="lazy" data-fallback="https://via.placeholder.com/400?text=Sem+foto"/>${thumbs?`<div class="details-thumbs">${thumbs}</div>`:''}</div>
    <h3 class="details-title">${nome} ${lowStockHtml}</h3>
    <p class="details-meta">${brand} · ${volume} · ${cat}</p>
    <p class="details-stock" id="detailsStock">${dispInicial?'<span class="stock-ok">● Disponível</span>':'<span class="stock-out">● Esgotado</span>'}<span class="stock-check"> · verificando…</span></p>
    ${precoHtml}${variacoesHtml}
    <p class="details-desc" style="margin-top:1rem">${desc}</p>
    <div class="details-actions" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn-sm btn-cart" id="detailsAddCart">Carrinho</button>
      <button class="btn-sm btn-buy" id="detailsBuy">Comprar</button>
      ${shareBtn}
    </div>`;

  document.querySelectorAll('.details-thumbs img').forEach(img => {
    img.addEventListener('click', () => { const m=document.getElementById('detailsMainImg'); if(m) m.src=img.dataset.full||img.src; });
  });
  bindVariacaoSelector(p);

  document.getElementById('detailsAddCart')?.addEventListener('click', () => {
    if (p.variacoes && p.variacoes.length > 0 && !p.variacaoSelecionada) { showToast('Selecione uma opção (ou use o botão de adicionar várias).'); return; }
    addToCart(p,1); closeModal('detailsModal');
  });
  document.getElementById('detailsBuy')?.addEventListener('click', () => {
    if (p.variacoes && p.variacoes.length > 0 && !p.variacaoSelecionada) { showToast('Selecione uma única opção para comprar direto. Para várias, use o carrinho.'); return; }
    closeModal('detailsModal'); openBuyModal(p);
  });
  document.getElementById('detailsShareBtn')?.addEventListener('click', () => shareProduct(p));

  document.getElementById('detPrev')?.addEventListener('click', () => showDetailsAt(detailsNavIndex-1,'right'));
  document.getElementById('detNext')?.addEventListener('click', () => showDetailsAt(detailsNavIndex+1,'left'));
  openModal('detailsModal');
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('produto', productId(p));
    history.pushState({ emporioModal: true }, '', url.pathname + url.search);
    updateSeoForProduct(p);
  } catch(_){}
  checkLiveStock(p).then(disp => {
    const el = document.getElementById('detailsStock');
    if (!el) return;
    const ok = (disp||'').toLowerCase()==='sim';
    el.innerHTML = ok ? '<span class="stock-ok">● Disponível</span><span class="stock-check"> · atualizado agora</span>' : '<span class="stock-out">● Esgotado</span><span class="stock-check"> · atualizado agora</span>';
    p.disponivel = ok ? 'Sim' : 'Não';
  });
}

function showDetailsAt(index, direction) {
  if (index < 0 || index >= detailsNavList.length) return;
  detailsNavIndex = index; const p = detailsNavList[index];
  openDetails(p, { fromNav: true });
  try { const url = new URL(window.location.href); url.searchParams.set('produto', productId(p)); history.replaceState({ emporioModal: true }, '', url.pathname + url.search); updateSeoForProduct(p); } catch(_){}
}

function injectProductJsonLd(p) {
  let el = document.getElementById('product-jsonld');
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'product-jsonld'; document.head.appendChild(el); }
  const priceRaw = p.somenteAtacado ? p.atacado : p.varejo;
  const priceNum = parsePrice(priceRaw);
  const priceSchema = priceNum > 0 ? priceNum.toFixed(2) : '0.00';
  const payload = {
    '@context':'https://schema.org','@type':'Product',name: displayName(p.nome),image: p.foto || '',description: decodeHtml(p.notas||displayName(p.nome)),brand: { '@type':'Brand', name: p.brand||'' },
    offers: { '@type':'Offer', priceCurrency:'BRL', price: priceSchema, availability: (p.disponivel||'').toLowerCase()==='sim'?'https://schema.org/InStock':'https://schema.org/OutOfStock', url: window.location.href }
  };
  if (p.gtin) payload.gtin = String(p.gtin).replace(/\D/g, '');
  el.textContent = JSON.stringify(payload).replace(/</g, '\\u003c');
}

function openBuyModal(p) {
  buyProduct = p;
  document.getElementById('buyProductName').textContent = displayName(p.nome);
  document.getElementById('buyProductMeta').textContent = `${p.brand||''} · ${p.volume||''} · ${p.cat||''}`;
  document.getElementById('buyQty').value = '1';
  const saved = loadBuyMeta();
  document.getElementById('buyNome').value = saved.nome || '';
  document.getElementById('buyCep').value = saved.cep || '';
  document.getElementById('cepStatus').textContent = saved.cidade ? `${saved.cidade} - ${saved.uf}` : '';
  updateBuyPricePreview(); openModal('buyModal');
}

function updateBuyPricePreview() {
  if (!buyProduct) return;
  const qty = parseInt(document.getElementById('buyQty')?.value||'1',10)||1;
  const { price, tipo } = unitPrice(buyProduct, qty, qty);
  const el = document.getElementById('buyPricePreview');
  if (el) {
    const hint = (!buyProduct.somenteAtacado && qty < 6) ? `<span class="price-hint">Faltam ${6-qty} para preço de atacado</span>` : '';
    el.innerHTML = `<span class="price-tipo">${escapeHtml(tipo)}</span><span class="price-unit">R$ ${formatPrice(price)} / un</span><strong class="price-sub">Subtotal: R$ ${formatPrice(price*qty)}</strong>${hint}`;
  }
}

function validateCheckout(nome, cep) {
  if (!(nome || '').trim() || nome.trim().length < 2) { showToast('Informe seu nome (mín. 2 letras).'); return false; }
  const digits = (cep || '').replace(/\D/g, '');
  if (digits.length !== 8) { showToast('CEP inválido (8 dígitos).'); return false; }
  return true;
}

function confirmBuy() {
  if (!buyProduct) return;
  const nome = document.getElementById('buyNome')?.value?.trim()||'';
  const cep = document.getElementById('buyCep')?.value?.trim()||'';
  const qty = parseInt(document.getElementById('buyQty')?.value||'1',10)||1;
  if (!validateCheckout(nome, cep)) return;
  saveBuyMeta(nome, cep, loadBuyMeta().cidade, loadBuyMeta().uf);
  const { price, tipo } = unitPrice(buyProduct, qty, qty);
  let varText = buyProduct.variacaoSelecionada ? `\nVariação: ${buyProduct.variacaoSelecionada.nome}` : '';
  let msg = `*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n*${displayName(buyProduct.nome)}*${varText}\n${buyProduct.brand||''} · ${buyProduct.volume||''}\nQtd: ${qty}\nPreço (${tipo}): R$ ${formatPrice(price)}\nSubtotal: R$ ${formatPrice(price*qty)}\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep} ${loadBuyMeta().cidade ? `(${loadBuyMeta().cidade}/${loadBuyMeta().uf})` : ''}\n`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
  closeModal('buyModal');
}

// Carrinho Painel
function renderCart() {
  const list = document.getElementById('cartList');
  const summary = document.getElementById('cartSummary');
  if (!list) return;
  
  const { subtotal, totalItems, lines } = cartTotals();
  
  if (!lines.length) {
    list.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.<br><small>Adicione produtos pelo catálogo para enviar o pedido no WhatsApp.</small></p>';
    if (summary) summary.innerHTML = '';
    updateMobileCartBar(); return;
  }
  const resumoHtml = `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:.55rem .75rem;margin-bottom:.45rem;color:#065f46"><div style="font-size:.78rem;font-weight:600;opacity:.8">Resumo do pedido</div><div style="font-size:1rem;font-weight:800;margin-top:.15rem">Itens: ${totalItems} · Total: R$ ${formatPrice(subtotal)}</div></div>`;
  
  const GLOBAL_ATACADO_TARGET = 6;
  let temItemVarejoPendente = false;
  
  lines.forEach(l => { 
    if (!l.p.somenteAtacado && l.tipo === 'Varejo') temItemVarejoPendente = true; 
  });
  
  let avisoHtml = '';
  if (temItemVarejoPendente && totalItems < GLOBAL_ATACADO_TARGET) {
    const faltam = GLOBAL_ATACADO_TARGET - totalItems;
    avisoHtml = `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:.45rem .7rem;margin-bottom:.4rem;color:#92400e;font-size:.82rem;font-weight:700">⚠️ Faltam ${faltam} item(ns) para liberar o preço de atacado nos produtos de varejo.</div>`;
  } else if (lines.some(l => l.tipo === 'Atacado')) {
    avisoHtml = `<div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:10px;padding:.45rem .7rem;margin-bottom:.4rem;color:#065f46;font-size:.82rem;font-weight:700">✓ Preço de ATACADO aplicado</div>`;
  }

  const itemsHtml = lines.map(({id,p,qty,price,tipo,lineTotal}) => {
    let varHtml = p.variacaoSelecionada ? `<br><span style="font-size:0.75rem;color:#6b7280">Opção: ${escapeHtml(p.variacaoSelecionada.nome)}</span>` : '';
    return `
    <div class="cart-item">
      <img src="${escapeHtml(p.foto||'')}" alt="" width="52" height="52" data-fallback="https://via.placeholder.com/52?text=?"/>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(displayName(p.nome))}</div>
        <div class="cart-item-meta">${escapeHtml(p.brand||'')} · ${escapeHtml(p.volume||'')} · ${escapeHtml(tipo)}: R$ ${formatPrice(price)}${varHtml}</div>
        <div class="cart-qty-controls">
          <button type="button" class="cart-qty-btn" data-qty-minus="${escapeHtml(id)}" aria-label="Diminuir">−</button>
          <span class="cart-qty-value">${qty}</span>
          <button type="button" class="cart-qty-btn" data-qty-plus="${escapeHtml(id)}" aria-label="Aumentar">+</button>
        </div>
        <div style="font-size:.78rem;margin-top:.35rem;font-weight:600">Subtotal: R$ ${formatPrice(lineTotal)}</div>
      </div>
      <button class="cart-remove" data-remove="${escapeHtml(id)}" aria-label="Remover">Remover</button>
    </div>`;
  }).join('');

  list.innerHTML = resumoHtml + avisoHtml + itemsHtml;

  if (summary) {
    summary.innerHTML = `<div class="cart-total"><span>${totalItems} item(ns)</span><strong>Total: R$ ${formatPrice(subtotal)}</strong></div>
      <div class="cart-actions">
        <button type="button" class="btn-outline" id="btnClearCart" style="flex:1 1 30%;">Limpar</button>
        <button type="button" class="btn-wa" id="btnCheckout" style="flex:1 1 60%;">Finalizar no WhatsApp</button>
        <button type="button" class="btn-quote" id="btnQuote">📋 Copiar Orçamento (Lista)</button>
      </div>`;
  }

  list.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>removeFromCart(b.dataset.remove)));
  list.querySelectorAll('[data-qty-minus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.qtyMinus; const item = cart[id];
      if (item.qty <= 1) { if (confirm('Remover este item?')) removeFromCart(id); return; }
      setCartQty(id, item.qty - 1);
    });
  });
  list.querySelectorAll('[data-qty-plus]').forEach(btn => {
    btn.addEventListener('click', () => { const id = btn.dataset.qtyPlus; setCartQty(id, cart[id].qty + 1); });
  });

  document.getElementById('btnClearCart')?.addEventListener('click',()=>{ if(confirm('Limpar todo o pedido?')) clearCart(); });
  document.getElementById('btnCheckout')?.addEventListener('click', openCartCheckout);
  document.getElementById('btnQuote')?.addEventListener('click', copyQuote);
  updateMobileCartBar();
}

function copyQuote() {
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  let msg = `*Orçamento - Empório A.R. Beauty*\n\n`;
  for (const l of lines) {
    let v = l.p.variacaoSelecionada ? ` (${l.p.variacaoSelecionada.nome})` : '';
    msg += `• ${l.qty}x ${displayName(l.p.nome)}${v} — R$ ${formatPrice(l.price)} (${l.tipo}) = R$ ${formatPrice(l.lineTotal)}\n`;
  }
  msg += `\n*Total (${totalItems} itens): R$ ${formatPrice(subtotal)}*\n\n_Gerado em: catalogoemporio.netlify.app_`;
  if (navigator.share) {
    navigator.share({ title: 'Orçamento Empório A.R.', text: msg }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(msg).then(() => showToast('Orçamento copiado!')).catch(() => showToast('Falha ao copiar.'));
  }
}


function resetToHome(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  currentLine = 'all';
  searchTerm = '';
  filterDisp = 'all';
  filterPreco = 'all';
  sortBy = 'default';
  filterMarca = 'all';
  page = 1;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('searchInput', '');
  setVal('filterDisponivel', 'all');
  setVal('filterPreco', 'all');
  setVal('sortBy', 'default');
  setVal('filterMarca', 'all');
  document.querySelectorAll('#tabs .tab, .tab').forEach(tab => {
    tab.classList.toggle('active', (tab.dataset.line || 'all') === 'all');
  });
  try { saveFilters(); } catch (_) {}
  try { closeCart(); } catch (_) {}
  try { closeModal('detailsModal'); } catch (_) {}
  try { closeModal('buyModal'); } catch (_) {}
  try { closeModal('checkoutModal'); } catch (_) {}
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('produto');
    history.replaceState({}, '', url.pathname + (url.search || ''));
  } catch (_) {}
  const dest = document.getElementById('destaquesHost');
  if (dest) dest.style.display = '';
  try { populateBrands(); } catch (_) {}
  try { renderDestaques(); } catch (_) {}
  try { renderProducts(true); } catch (_) {}
  const forceTop = () => {
    try {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch (_) {}
  };
  forceTop();
  requestAnimationFrame(() => {
    forceTop();
    setTimeout(forceTop, 50);
    setTimeout(forceTop, 200);
  });
}
function openCart() { renderCart(); document.getElementById('cartOverlay')?.classList.add('open'); document.getElementById('cartPanel')?.classList.add('open'); document.getElementById('cartPanel')?.setAttribute('aria-hidden','false'); document.body.classList.add('cart-open'); document.body.style.overflow = 'hidden'; }
function closeCart() { document.getElementById('cartOverlay')?.classList.remove('open'); document.getElementById('cartPanel')?.classList.remove('open'); document.getElementById('cartPanel')?.setAttribute('aria-hidden','true'); if (!document.querySelector('.modal.open')) document.body.classList.remove('cart-open'); document.body.style.overflow = ''; }

function openCartCheckout() {
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  const summaryEl = document.getElementById('checkoutSummary');
  if (summaryEl) {
    summaryEl.innerHTML = lines.map(l=>{
      let v = l.p.variacaoSelecionada ? ` (${escapeHtml(l.p.variacaoSelecionada.nome)})` : '';
      return `• ${escapeHtml(displayName(l.p.nome).slice(0,30))}${v} — ${l.qty}x R$ ${formatPrice(l.price)} (${escapeHtml(l.tipo)}) = R$ ${formatPrice(l.lineTotal)}`;
    }).join('<br>') + `<br><br><strong>Total (${totalItems} itens): R$ ${formatPrice(subtotal)}</strong>`;
  }
  const saved = loadBuyMeta();
  document.getElementById('checkoutNome').value = saved.nome || '';
  document.getElementById('checkoutCep').value = saved.cep || '';
  document.getElementById('checkoutCepStatus').textContent = saved.cidade ? `${saved.cidade} - ${saved.uf}` : '';
  openModal('checkoutModal'); closeCart();
}

function confirmCartCheckout() {
  const nome = document.getElementById('checkoutNome')?.value?.trim()||'';
  const cep = document.getElementById('checkoutCep')?.value?.trim()||'';
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  if (!validateCheckout(nome, cep)) return;
  saveBuyMeta(nome, cep, loadBuyMeta().cidade, loadBuyMeta().uf);
  let msg = `*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n`;
  for (const l of lines) {
    let v = l.p.variacaoSelecionada ? ` (${l.p.variacaoSelecionada.nome})` : '';
    msg += `• *${displayName(l.p.nome)}*${v}\n  ${l.p.brand||''} — ${l.qty}x R$ ${formatPrice(l.price)} (${l.tipo}) = R$ ${formatPrice(l.lineTotal)}\n\n`;
  }
  msg += `*Total (${totalItems} itens): R$ ${formatPrice(subtotal)}*\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep} ${loadBuyMeta().cidade ? `(${loadBuyMeta().cidade}/${loadBuyMeta().uf})` : ''}\n`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
  closeModal('checkoutModal');
}

// Favoritos
function updateFavBadge() { const badge = document.getElementById('favBadge'); if (badge) { const n = favorites.size; badge.textContent = n; badge.style.display = n > 0 ? 'flex' : 'none'; } }
function openFavoritesModal() { renderFavoritesList(); openModal('favoritesModal'); }
function sortFavoriteProducts(list) {
  const arr = list.slice();
  if (favoritesSort === 'name-asc') arr.sort((a,b)=>displayName(a.nome).localeCompare(displayName(b.nome),'pt-BR'));
  else if (favoritesSort === 'name-desc') arr.sort((a,b)=>displayName(b.nome).localeCompare(displayName(a.nome),'pt-BR'));
  else if (favoritesSort === 'price-asc') arr.sort((a,b)=>parsePrice(a.somenteAtacado?a.atacado:a.varejo)-parsePrice(b.somenteAtacado?b.atacado:b.varejo));
  else if (favoritesSort === 'price-desc') arr.sort((a,b)=>parsePrice(b.somenteAtacado?b.atacado:b.varejo)-parsePrice(a.somenteAtacado?a.atacado:a.varejo));
  return arr;
}
function renderFavoritesList() {
  const list = document.getElementById('favoritesList'); const toolbar = document.getElementById('favoritesToolbar'); const countLabel = document.getElementById('favoritesCountLabel'); const addAllBtn = document.getElementById('btnAddAllFav'); const titleEl = document.getElementById('favoritesTitle');
  if (!list) return;
  if (titleEl) titleEl.textContent = favorites.size ? `♥ Meus Favoritos (${favorites.size})` : '♥ Meus Favoritos';
  const ids = [...favorites];
  if (!ids.length) { list.innerHTML = '<p class="cart-empty">Nenhum produto favoritado ainda.<br><small>Toque no ♥ de qualquer produto para salvar.</small></p>'; if (toolbar) toolbar.style.display = 'none'; if (addAllBtn) addAllBtn.style.display = 'none'; return; }
  const products = ids.map(id => findProduct(id)).filter(Boolean);
  if (!products.length) { list.innerHTML = '<p class="cart-empty">Nenhum produto favoritado ainda.</p>'; if (toolbar) toolbar.style.display = 'none'; if (addAllBtn) addAllBtn.style.display = 'none'; return; }
  if (toolbar) toolbar.style.display = 'flex'; if (countLabel) countLabel.textContent = `${products.length} item(ns)`; if (addAllBtn) addAllBtn.style.display = '';
  const sortSelect = document.getElementById('favoritesSort'); if (sortSelect) sortSelect.value = favoritesSort;
  const sorted = sortFavoriteProducts(products);
  list.innerHTML = sorted.map(p => {
    const id = productId(p); const foto = escapeHtml(p.foto || (p.fotos && p.fotos[0]) || ''); const disp = (p.disponivel||'').toLowerCase()==='sim';
    const priceHtml = p.somenteAtacado ? `<span class="price-a">R$ ${escapeHtml(p.atacado)}</span>` : `Varejo R$ ${escapeHtml(p.varejo)} · Atacado R$ ${escapeHtml(p.atacado)}`;
    return `<div class="cart-item"><img src="${foto}" alt="" width="52" height="52" data-fallback="https://via.placeholder.com/52?text=?"/><div class="cart-item-info"><div class="cart-item-name">${escapeHtml(displayName(p.nome))}</div><div class="cart-item-meta">${escapeHtml(p.brand||'')} · ${escapeHtml(p.volume||'')} ${disp?'':' · <span class="stock-out">Esgotado</span>'}</div><div class="cart-item-price">${priceHtml}</div><div style="display:flex;gap:.35rem;margin-top:.35rem;flex-wrap:wrap"><button type="button" class="btn-sm btn-details" data-fav-open="${escapeHtml(id)}">Detalhes</button><button type="button" class="btn-sm btn-cart" data-fav-addcart="${escapeHtml(id)}">Carrinho</button><button type="button" class="btn-sm" style="background:#fee2e2;color:#b91c1c" data-fav-remove="${escapeHtml(id)}">Remover</button></div></div></div>`;
  }).join('');
  list.querySelectorAll('[data-fav-open]').forEach(btn => btn.addEventListener('click', () => { const p = findProduct(btn.dataset.favOpen); if (p) { closeModal('favoritesModal'); openDetails(p); } }));
  list.querySelectorAll('[data-fav-addcart]').forEach(btn => btn.addEventListener('click', () => { const p = findProduct(btn.dataset.favAddcart); if (p) { addToCart(p, 1); renderFavoritesList(); } }));
  list.querySelectorAll('[data-fav-remove]').forEach(btn => btn.addEventListener('click', () => { favorites.delete(btn.dataset.favRemove); safeSet('fav_maquiagem', [...favorites]); updateFavBadge(); const cardFav = document.querySelector(`[data-fav="${CSS.escape(btn.dataset.favRemove)}"]`); if (cardFav) { cardFav.classList.remove('active'); cardFav.setAttribute('aria-pressed','false'); } renderFavoritesList(); }));
}
function addAllFavoritesToCart() {
  const ids = [...favorites]; if (!ids.length) return; let added = 0;
  ids.forEach(id => {
    const p = findProduct(id); if (!p || (p.disponivel||'').toLowerCase() !== 'sim') return;
    if (Array.isArray(p.variacoes) && p.variacoes.length) {
      const v = p.variacoes.find(x => x.estoque === undefined || Number(x.estoque) > 0);
      if (v) { addToCart({ ...p, variacaoSelecionada: { id: String(v.id || ''), nome: String(v.nome || '') } }, 1); added++; }
    } else { addToCart(p, 1); added++; }
  });
  if (added) { showToast(`${added} item(ns) adicionado(s) ao carrinho`); renderFavoritesList(); } else { showToast('Nenhum favorito disponível.'); }
}

// Compartilhar (com geração de imagem)
async function shareProduct(p) {
  const url = new URL(window.location.href); url.searchParams.set('produto', productId(p)); url.hash = '';
  const text = `Confira *${displayName(p.nome)}* no Empório A.R. Beauty!\nVarejo: R$ ${p.varejo || '—'}\nAtacado: R$ ${p.atacado || '—'}\n\n${url.toString()}`;
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, '#0f172a'); grad.addColorStop(0.5, '#14532d'); grad.addColorStop(1, '#052e16');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1920);
    
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 44px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Empório A.R. Beauty', 540, 110);
    
    ctx.fillStyle = '#0c0a09'; ctx.fillRect(60, 150, 960, 1100);
    
    if (p.foto) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try { 
          const scale = Math.max(960 / img.width, 1100 / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, 60 + (960 - w)/2, 150 + (1100 - h)/2, w, h);
        } catch(e){}
      };
      img.src = p.foto;
    } else {
      ctx.fillStyle = '#9ca3af'; ctx.font = '36px system-ui';
      ctx.fillText('Foto indisponível', 540, 700);
    }

    setTimeout(() => {
      ctx.fillStyle = '#fafaf9'; ctx.font = 'bold 46px system-ui';
      const nomeTxt = displayName(p.nome);
      const maxW = 900;
      let words = nomeTxt.split(' '); let line = ''; let lines = [];
      for (let w of words) {
        let test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else { line = test; }
      }
      if (line) lines.push(line);
      lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 540, 1350 + i * 54));
      
      let ty = 1350 + Math.min(lines.length, 3) * 54 + 30;
      ctx.fillStyle = '#d6d3d1'; ctx.font = '32px system-ui';
      ctx.fillText(`${p.brand || ''} · ${p.volume || ''}`, 540, ty);
      
      ty += 60;
      ctx.fillStyle = '#4ade80'; ctx.font = 'bold 52px system-ui';
      if (p.varejo) ctx.fillText(`R$ ${p.varejo}`, 540, ty);
      
      if (p.atacado && p.atacado !== '—') {
        ty += 55; ctx.fillStyle = '#86efac'; ctx.font = '36px system-ui';
        ctx.fillText(`Atacado (6+) R$ ${p.atacado}`, 540, ty);
      }
      
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '28px system-ui';
      ctx.fillText('Link na legenda · catalogoemporio.netlify.app', 540, 1850);

      canvas.toBlob((blob) => {
        if (!blob) { fallbackShare(text, url); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `emporio-ar-${normId(p.nome)}-story.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        alert('Imagem salva! Abra o Instagram ou WhatsApp, vá em Stories/Status e escolha esta imagem da galeria.');
      }, 'image/png', 0.92);
    }, 800);

  } catch (e) {
    fallbackShare(text, url);
  }

  function fallbackShare(text, url) {
    if (navigator.share) {
      navigator.share({ title: displayName(p.nome), text: text, url: url.toString() }).catch(()=>{});
    } else {
      navigator.clipboard.writeText(text).then(()=>showToast('Link copiado!')).catch(()=>alert('Erro ao copiar.'));
    }
  }
}

// CEP
function setupCepAutoFill(inputId, nameId, statusId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let lastCep = '';
  let timer = null;
  let inflight = 0;

  const setStatus = (msg) => {
    const status = document.getElementById(statusId);
    if (status) status.textContent = msg || '';
  };

  const lookup = async () => {
    const raw = input.value || '';
    let cep = raw.replace(/\D/g, '');
    // máscara 00000-000
    if (cep.length >= 5) {
      const masked = cep.slice(0, 5) + (cep.length > 5 ? '-' + cep.slice(5, 8) : '');
      if (raw !== masked && cep.length <= 8) {
        input.value = masked;
      }
    }
    cep = (input.value || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      if (cep.length < 8) setStatus('');
      return;
    }
    if (cep === lastCep) return;
    lastCep = cep;
    const reqId = ++inflight;
    setStatus('Buscando CEP...');
    try {
      // Proxy Netlify (estável) — não depende de CSP para viacep no browser
      const res = await fetch('/.netlify/functions/cep?cep=' + encodeURIComponent(cep), {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (reqId !== inflight) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.erro) {
        setStatus(data.message || 'CEP não encontrado.');
        lastCep = '';
        return;
      }
      const cidade = data.localidade || data.city || '';
      const uf = data.uf || data.state || '';
      setStatus(cidade && uf ? (cidade + ' - ' + uf) : (cidade || 'CEP encontrado'));
      try {
        saveBuyMeta(
          document.getElementById(nameId)?.value || loadBuyMeta().nome,
          input.value,
          cidade,
          uf
        );
      } catch (_) {}
    } catch (_) {
      if (reqId !== inflight) return;
      setStatus('Falha ao buscar CEP.');
      lastCep = '';
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(lookup, 300);
  });
  input.addEventListener('blur', () => {
    clearTimeout(timer);
    lookup();
  });
}


// PWA
let deferredPrompt;
function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    document.getElementById('pwaBanner').classList.add('show');
  });
  document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') document.getElementById('pwaBanner').classList.remove('show');
    deferredPrompt = null;
  });
  document.getElementById('pwaCloseBtn')?.addEventListener('click', () => document.getElementById('pwaBanner').classList.remove('show'));
}

// Modais e Utils
function openModal(id) { const m = document.getElementById(id); if (!m) return; m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; m.querySelector('button, input')?.focus(); }
function closeModal(id) {
  const m = document.getElementById(id); m?.classList.remove('open'); m?.setAttribute('aria-hidden','true');
  if (!document.querySelector('.modal.open, #cartPanel.open')) document.body.style.overflow = '';
  if (id === 'detailsModal') { try { const url = new URL(window.location.href); url.searchParams.delete('produto'); history.replaceState({}, '', url.pathname + url.search); resetSeoToHome(); } catch(_){} requestAnimationFrame(() => window.scrollTo(0, detailsScrollY||0)); }
}
function showToast(msg) { let t = document.getElementById('toast'); if (!t) { t=document.createElement('div'); t.id='toast'; t.setAttribute('role','status'); document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(showToast._timer); showToast._timer = setTimeout(()=>t.classList.remove('show'), 2400); }

function initSwipeDetails() {
  const overlay = document.getElementById('detailsModal'); if (!overlay || overlay.dataset.swipeReady) return; overlay.dataset.swipeReady = '1';
  const box = overlay.querySelector('.modal-box'); if (!box) return;
  let startY=0, startX=0, mode=null, dragging=false;
  const onStart = (y,x) => { if (!overlay.classList.contains('open')) return; startY=y; startX=x; mode=null; dragging=true; box.style.transition='none'; };
  const onMove = (y,x) => {
    if (!dragging) return; const dy=y-startY, dx=x-startX;
    if (!mode) { if (Math.abs(dy)>8 && Math.abs(dy)>Math.abs(dx)) mode='v'; else if (Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)) mode='h'; }
    if (mode==='v' && dy>0) { const p = Math.min(dy/280,1); box.style.transform = `translateY(${dy}px) scale(${1-p*0.03})`; box.style.opacity = String(1-p*0.35); }
    else if (mode==='h') { box.style.transform = `translateX(${dx}px)`; }
  };
  const onEnd = (y,x) => {
    if (!dragging) return; dragging=false; const dy=y-startY, dx=x-startX;
    box.style.transition = 'transform .28s ease, opacity .28s ease';
    if (mode==='v' && dy>110) { closeModal('detailsModal'); }
    else if (mode==='h' && Math.abs(dx)>70) {
      const next = dx<0 ? detailsNavIndex+1 : detailsNavIndex-1;
      if (next>=0 && next<detailsNavList.length) showDetailsAt(next, dx<0?'left':'right');
      else { box.style.transform=''; box.style.opacity=''; }
    } else { box.style.transform=''; box.style.opacity=''; }
    mode=null; setTimeout(()=>{ box.style.transition=''; box.style.transform=''; box.style.opacity=''; }, 300);
  };
  box.addEventListener('touchstart', e => onStart(e.touches[0].clientY, e.touches[0].clientX), {passive:true});
  box.addEventListener('touchmove', e => onMove(e.touches[0].clientY, e.touches[0].clientX), {passive:true});
  box.addEventListener('touchend', e => onEnd(e.changedTouches[0].clientY, e.changedTouches[0].clientX), {passive:true});
}

function openProductFromUrl() {
  try { const id = new URLSearchParams(window.location.search).get('produto'); if (!id) return; const p = findProduct(id); if (p) openDetails(p); } catch(_){}
}

function bindGlobalEvents() {
  document.getElementById('tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab'); if (!btn) return;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); btn.classList.add('active');
    currentLine = btn.dataset.line || 'all';
    const dest = document.getElementById('destaquesHost'); if (dest) dest.style.display = currentLine === 'all' ? '' : 'none';
    saveFilters(); populateBrands(); renderProducts(true);
  });
  document.getElementById('searchInput')?.addEventListener('input', e => { searchTerm=e.target.value.trim(); saveFilters(); renderProducts(true); });
  document.getElementById('filterMarca')?.addEventListener('change', e => { filterMarca=e.target.value; saveFilters(); renderProducts(true); });
  document.getElementById('filterDisponivel')?.addEventListener('change', e => { filterDisp=e.target.value; renderProducts(true); });
  document.getElementById('filterPreco')?.addEventListener('change', e => { filterPreco=e.target.value; renderProducts(true); });
  document.getElementById('sortBy')?.addEventListener('change', e => { sortBy=e.target.value; renderProducts(true); });
  document.getElementById('btnLoadMore')?.addEventListener('click', () => { page+=1; renderProducts(false); });
  document.getElementById('btnOpenCart')?.addEventListener('click', openCart);
  document.getElementById('btnOpenFavorites')?.addEventListener('click', openFavoritesModal);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  document.getElementById('btnCloseCart')?.addEventListener('click', closeCart);
  document.getElementById('buyQty')?.addEventListener('input', updateBuyPricePreview);
  document.getElementById('btnConfirmBuy')?.addEventListener('click', confirmBuy);
  document.getElementById('btnConfirmCheckout')?.addEventListener('click', confirmCartCheckout);
  document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => closeModal(el.dataset.close)));
  document.getElementById('favoritesSort')?.addEventListener('change', e => { favoritesSort = e.target.value || 'added'; safeSet('fav_sort', favoritesSort); renderFavoritesList(); });
  document.getElementById('btnAddAllFav')?.addEventListener('click', addAllFavoritesToCart);
  document.getElementById('fabWhatsApp')?.addEventListener('click', () => {
    if (cartTotals().lines.length) { openCart(); return; }
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Vim pelo catálogo Empório A.R. Beauty e gostaria de atendimento.')}`,'_blank');
  });
  window.addEventListener('popstate', () => { if (document.getElementById('detailsModal')?.classList.contains('open')) closeModal('detailsModal'); });
  document.addEventListener('keydown', e => {
    const openModalEl = document.querySelector('.modal.open');
    if (openModalEl) {
      if (e.key === 'Escape') { const id = openModalEl.id; if (id) closeModal(id); }
      if (e.key === 'Tab') {
        const focusables = openModalEl.querySelectorAll('button, [href], input, select, textarea'); if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    if (!document.getElementById('detailsModal')?.classList.contains('open')) return;
    if (e.key === 'ArrowRight') showDetailsAt(detailsNavIndex+1,'left');
    if (e.key === 'ArrowLeft') showDetailsAt(detailsNavIndex-1,'right');
  });
  
  const btnBackToTop = document.getElementById('btnBackToTop');
  if (btnBackToTop) {
    window.addEventListener('scroll', () => { btnBackToTop.style.display = window.scrollY > 450 ? 'flex' : 'none'; }, { passive: true });
    btnBackToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Logo: bindLogoHome() no final do arquivo
}

// Iniciar
init();


function bindLogoHome() {
  const logo = document.getElementById('brandHome') || document.querySelector('a.brand, .brand');
  if (!logo || logo.dataset.boundHome === '1') return;
  logo.dataset.boundHome = '1';
  const handler = (e) => { e.preventDefault(); e.stopPropagation(); resetToHome(e); };
  logo.addEventListener('click', handler, { passive: false });
  logo.addEventListener('touchend', (e) => { e.preventDefault(); resetToHome(e); }, { passive: false });
}
bindLogoHome();

