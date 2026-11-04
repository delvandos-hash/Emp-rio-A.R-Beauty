/**
 * Empório A.R. Beauty — Catálogo de Maquiagem
 * P0–P5: segurança, UX, performance, SEO helpers, estoque ao vivo
 * Regras comerciais (markup, box=só atacado) preservadas.
 */

// Fonte principal: Gist (atualiza sem redeploy Netlify)
// Fallback: arquivo local do deploy
const GIST_RAW_URL = 'https://gist.githubusercontent.com/delvandos-hash/081d1d5efa2e2003cf859964a650dfb5/raw/catalogo.json';
const CATALOG_URLS = [
  ...(GIST_RAW_URL ? [GIST_RAW_URL] : []),
  '/catalogo.json'
];
const PAGE_SIZE = 48;
const STOCK_CACHE_MS = 10 * 60 * 1000;

const LOCAL_FALLBACK = {
  DATA: { rosto: [], olhos: [], labios: [], corpo: [], cabelo: [], acessorios: [], outros: [] },
  WHATSAPP: '5562991134488',
  BRAND: {
    name: 'Empório A.R. Beauty',
    phone: '(62) 99113-4488',
    tagline: 'Maquiagem e Cosméticos — Varejo e Atacado'
  }
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtml(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function parsePrice(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

function formatPrice(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normId(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function productId(p) {
  return `${normId(p.brand)}-${normId(p.nome)}-${normId(p.volume)}`;
}

function displayName(nome) {
  return String(nome || '').replace(/\s*\|\s*Atacado\s*$/i, '').trim();
}

function unitPrice(p, qty) {
  if (p.somenteAtacado) return { price: parsePrice(p.atacado), tipo: 'Atacado' };
  if (qty >= 6) return { price: parsePrice(p.atacado), tipo: 'Atacado' };
  return { price: parsePrice(p.varejo), tipo: 'Varejo' };
}

async function loadCatalogData() {
  for (const url of CATALOG_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      const j = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (j && j.DATA) return j;
    } catch (e) {
      console.warn('Falha ao carregar', url, e);
    }
  }
  return LOCAL_FALLBACK;
}

const dados = await loadCatalogData();
const { DATA, WHATSAPP, BRAND } = dados;
document.getElementById('bootStatus')?.remove();

let currentLine = 'all';
let searchTerm = '';
let filterDisp = 'all';
let filterPreco = 'all';
let sortBy = 'default';
let page = 1;
const favorites = new Set(JSON.parse(localStorage.getItem('fav_maquiagem') || '[]'));
let cart = JSON.parse(localStorage.getItem('cart_maquiagem') || '{}');
const stockCache = new Map();
let allProductsCache = null;

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

function findProduct(id) {
  return getAllProducts().find(p => productId(p) === id) || null;
}

function matchesFilters(p) {
  if (currentLine !== 'all' && p.line !== currentLine) return false;
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    const hay = `${p.nome} ${p.brand} ${p.cat} ${p.volume}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
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
  if (sortBy === 'price-asc') {
    arr.sort((a, b) => parsePrice(a.somenteAtacado ? a.atacado : a.varejo) - parsePrice(b.somenteAtacado ? b.atacado : b.varejo));
  } else if (sortBy === 'price-desc') {
    arr.sort((a, b) => parsePrice(b.somenteAtacado ? b.atacado : b.varejo) - parsePrice(a.somenteAtacado ? a.atacado : a.varejo));
  } else if (sortBy === 'name') {
    arr.sort((a, b) => displayName(a.nome).localeCompare(displayName(b.nome), 'pt-BR'));
  }
  return arr;
}

function saveCart() {
  localStorage.setItem('cart_maquiagem', JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const total = Object.values(cart).reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';
  }
}

function addToCart(p, qty = 1) {
  const id = productId(p);
  if (cart[id]) cart[id].qty += qty;
  else cart[id] = { product: p, qty };
  saveCart();
  showToast('Adicionado: ' + displayName(p.nome).slice(0, 42) + (displayName(p.nome).length > 42 ? '…' : ''));
}

function removeFromCart(id) {
  delete cart[id];
  saveCart();
  renderCart();
}

function setCartQty(id, qty) {
  qty = parseInt(qty, 10);
  if (!qty || qty < 1) return removeFromCart(id);
  if (cart[id]) {
    cart[id].qty = qty;
    saveCart();
    renderCart();
  }
}

function clearCart() {
  cart = {};
  saveCart();
  renderCart();
}

function cartTotals() {
  let subtotal = 0, totalItems = 0;
  const lines = [];
  for (const [id, item] of Object.entries(cart)) {
    const { product: p, qty } = item;
    const { price, tipo } = unitPrice(p, qty);
    const lineTotal = price * qty;
    subtotal += lineTotal;
    totalItems += qty;
    lines.push({ id, p, qty, price, tipo, lineTotal });
  }
  return { subtotal, totalItems, lines };
}

async function checkLiveStock(p) {
  const url = p.sourceUrl;
  if (!url) return p.disponivel;
  const cached = stockCache.get(url);
  if (cached && Date.now() - cached.ts < STOCK_CACHE_MS) return cached.disponivel;
  try {
    const endpoint = '/.netlify/functions/stock?url=' + encodeURIComponent(url);
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) throw new Error('fn');
    const data = await res.json();
    const disponivel = data.disponivel || p.disponivel;
    stockCache.set(url, { disponivel, ts: Date.now() });
    return disponivel;
  } catch {
    return p.disponivel;
  }
}

function renderProducts(resetPage = true) {
  if (resetPage) page = 1;
  const container = document.getElementById('products');
  const empty = document.getElementById('empty');
  const moreWrap = document.getElementById('loadMoreWrap');
  const stats = document.getElementById('resultStats');

  let filtered = sortProducts(getAllProducts().filter(matchesFilters));
  const total = filtered.length;
  const visible = filtered.slice(0, page * PAGE_SIZE);

  if (stats) stats.textContent = total ? (Math.min(visible.length, total) + ' de ' + total + ' produtos') : '';

  if (total === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    if (moreWrap) moreWrap.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  container.style.display = 'grid';

  container.innerHTML = visible.map(p => {
    const id = productId(p);
    const isFav = favorites.has(id);
    const disponivel = (p.disponivel || '').toLowerCase() === 'sim';
    const isNovo = (p.badge || '').toUpperCase().includes('NOVO');
    const nome = escapeHtml(displayName(p.nome));
    const brand = escapeHtml(p.brand || '');
    const volume = escapeHtml(p.volume || '');
    const cat = escapeHtml(p.cat || '');
    const foto = escapeHtml(p.foto || (p.fotos && p.fotos[0]) || '');
    const eid = escapeHtml(id);

    return '<article class="card" data-id="' + eid + '">' +
      '<button class="fav ' + (isFav ? 'active' : '') + '" data-fav="' + eid + '" aria-label="Favoritar">♥</button>' +
      '<div class="photo">' +
        (isNovo ? '<span class="badge-novo">NOVO</span>' : '') +
        (!disponivel ? '<span class="badge-esgotado">ESGOTADO</span>' : '') +
        '<img src="' + foto + '" alt="' + nome + '" width="72" height="72" loading="lazy" onerror="this.src=\'https://via.placeholder.com/150?text=Sem+foto\'" />' +
      '</div>' +
      '<div class="info">' +
        '<div class="name">' + nome + '</div>' +
        '<div class="meta">' + brand + ' · ' + volume + ' · ' + cat + '</div>' +
        '<div class="prices">' +
          (p.somenteAtacado
            ? '<div><span class="price-label">Atacado</span><span class="price-a">R$ ' + escapeHtml(p.atacado) + '</span></div>'
            : '<div><span class="price-label">Varejo</span><span class="price-v">R$ ' + escapeHtml(p.varejo) + '</span></div>' +
              '<div><span class="price-label">Atacado (6+)</span><span class="price-a">R$ ' + escapeHtml(p.atacado) + '</span></div>') +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="btn-sm btn-details" data-details="' + eid + '">Detalhes</button>' +
          '<button class="btn-sm btn-cart" data-cart="' + eid + '">Carrinho</button>' +
          '<button class="btn-sm btn-buy" data-buy="' + eid + '">Comprar</button>' +
        '</div>' +
      '</div></article>';
  }).join('');

  if (moreWrap) moreWrap.style.display = visible.length < total ? 'flex' : 'none';
  bindCardEvents(container);
}

function bindCardEvents(container) {
  container.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.fav;
      if (favorites.has(id)) { favorites.delete(id); btn.classList.remove('active'); }
      else { favorites.add(id); btn.classList.add('active'); }
      localStorage.setItem('fav_maquiagem', JSON.stringify([...favorites]));
    });
  });
  container.querySelectorAll('[data-details]').forEach(btn => {
    btn.addEventListener('click', () => { const p = findProduct(btn.dataset.details); if (p) openDetails(p); });
  });
  container.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', () => { const p = findProduct(btn.dataset.buy); if (p) openBuyModal(p); });
  });
  container.querySelectorAll('[data-cart]').forEach(btn => {
    btn.addEventListener('click', () => { const p = findProduct(btn.dataset.cart); if (p) addToCart(p, 1); });
  });
}

function openDetails(p) {
  const fotos = (p.fotos && p.fotos.length) ? p.fotos : (p.foto ? [p.foto] : []);
  const mainFoto = escapeHtml(fotos[0] || '');
  const thumbs = fotos.slice(1);
  const desc = escapeHtml(decodeHtml(p.notas || '').trim() || 'Sem descrição adicional.');
  const dispInicial = (p.disponivel || '').toLowerCase() === 'sim';
  const nome = escapeHtml(displayName(p.nome));
  const brand = escapeHtml(p.brand || '');
  const volume = escapeHtml(p.volume || '');
  const cat = escapeHtml(p.cat || '');

  const precoHtml = p.somenteAtacado
    ? '<div class="details-price"><span class="price-label">Atacado</span><span class="price-a">R$ ' + escapeHtml(p.atacado) + '</span></div>'
    : '<div class="details-price"><div><span class="price-label">Varejo</span><span class="price-v">R$ ' + escapeHtml(p.varejo) + '</span></div>' +
      '<div><span class="price-label">Atacado (6+)</span><span class="price-a">R$ ' + escapeHtml(p.atacado) + '</span></div></div>';

  const thumbsHtml = thumbs.length
    ? '<div class="details-thumbs">' + thumbs.map(f => '<img src="' + escapeHtml(f) + '" alt="" width="48" height="48" loading="lazy" />').join('') + '</div>'
    : '';

  injectProductJsonLd(p);

  document.getElementById('detailsContent').innerHTML =
    '<div class="details-photo"><img src="' + mainFoto + '" alt="' + nome + '" id="detailsMainImg" width="280" height="280" onerror="this.src=\'https://via.placeholder.com/400x400?text=Sem+foto\'" />' + thumbsHtml + '</div>' +
    '<h3 class="details-title">' + nome + '</h3>' +
    '<p class="details-meta">' + brand + ' · ' + volume + ' · ' + cat + '</p>' +
    '<p class="details-stock" id="detailsStock">' +
      (dispInicial ? '<span class="stock-ok">● Disponível</span>' : '<span class="stock-out">● Esgotado</span>') +
      '<span class="stock-check"> · verificando…</span></p>' +
    precoHtml +
    '<p class="details-desc">' + desc + '</p>' +
    '<div class="details-actions">' +
      '<button class="btn-sm btn-cart" id="detailsAddCart">Carrinho</button>' +
      '<button class="btn-sm btn-buy" id="detailsBuy">Comprar</button></div>';

  document.querySelectorAll('.details-thumbs img').forEach(img => {
    img.addEventListener('click', () => {
      const main = document.getElementById('detailsMainImg');
      if (main) main.src = img.src;
    });
  });
  document.getElementById('detailsAddCart')?.addEventListener('click', () => { addToCart(p, 1); closeModal('detailsModal'); });
  document.getElementById('detailsBuy')?.addEventListener('click', () => { closeModal('detailsModal'); openBuyModal(p); });
  openModal('detailsModal');

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('produto', productId(p));
    history.replaceState({}, '', url.pathname + url.search);
  } catch (_) {}

  checkLiveStock(p).then(disp => {
    const stockEl = document.getElementById('detailsStock');
    if (!stockEl) return;
    const ok = (disp || '').toLowerCase() === 'sim';
    stockEl.innerHTML = ok
      ? '<span class="stock-ok">● Disponível</span><span class="stock-check"> · atualizado agora</span>'
      : '<span class="stock-out">● Esgotado</span><span class="stock-check"> · atualizado agora</span>';
    p.disponivel = ok ? 'Sim' : 'Não';
  });
}

function injectProductJsonLd(p) {
  let el = document.getElementById('product-jsonld');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'product-jsonld';
    document.head.appendChild(el);
  }
  const price = p.somenteAtacado ? p.atacado : p.varejo;
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: displayName(p.nome),
    image: p.foto || (p.fotos && p.fotos[0]) || '',
    description: decodeHtml(p.notas || displayName(p.nome)),
    brand: { '@type': 'Brand', name: p.brand || '' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BRL',
      price: String(parsePrice(price)),
      availability: (p.disponivel || '').toLowerCase() === 'sim'
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock'
    }
  });
}

let buyProduct = null;

function openBuyModal(p) {
  buyProduct = p;
  document.getElementById('buyProductName').textContent = displayName(p.nome);
  document.getElementById('buyProductMeta').textContent = (p.brand || '') + ' · ' + (p.volume || '') + ' · ' + (p.cat || '');
  document.getElementById('buyQty').value = '1';
  updateBuyPricePreview();
  openModal('buyModal');
}

function updateBuyPricePreview() {
  if (!buyProduct) return;
  const qty = parseInt(document.getElementById('buyQty')?.value || '1', 10) || 1;
  const { price, tipo } = unitPrice(buyProduct, qty);
  const el = document.getElementById('buyPricePreview');
  if (!el) return;
  let hint = '';
  if (!buyProduct.somenteAtacado && qty < 6) {
    hint = '<span class="price-hint">Faltam ' + (6 - qty) + ' para preço de atacado</span>';
  }
  el.innerHTML = '<span class="price-tipo">' + escapeHtml(tipo) + '</span>' +
    '<span class="price-unit">R$ ' + formatPrice(price) + ' / un</span>' +
    '<strong class="price-sub">Subtotal: R$ ' + formatPrice(price * qty) + '</strong>' + hint;
}

function confirmBuy() {
  if (!buyProduct) return;
  const nome = document.getElementById('buyNome')?.value?.trim() || '';
  const cep = document.getElementById('buyCep')?.value?.trim() || '';
  const qty = parseInt(document.getElementById('buyQty')?.value || '1', 10) || 1;
  const { price, tipo } = unitPrice(buyProduct, qty);
  let msg = '*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n';
  msg += '*' + displayName(buyProduct.nome) + '*\n';
  msg += (buyProduct.brand || '') + ' · ' + (buyProduct.volume || '') + '\n';
  msg += 'Qtd: ' + qty + '\nPreço (' + tipo + '): R$ ' + formatPrice(price) + '\n';
  msg += 'Subtotal: R$ ' + formatPrice(price * qty) + '\n\n';
  if (nome) msg += 'Nome: ' + nome + '\n';
  if (cep) msg += 'CEP: ' + cep + '\n';
  window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg), '_blank');
  closeModal('buyModal');
}

function renderCart() {
  const list = document.getElementById('cartList');
  const summary = document.getElementById('cartSummary');
  if (!list) return;
  const { subtotal, totalItems, lines } = cartTotals();
  if (!lines.length) {
    list.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.</p>';
    if (summary) summary.innerHTML = '';
    return;
  }
  list.innerHTML = lines.map(({ id, p, qty, price, tipo, lineTotal }) =>
    '<div class="cart-item">' +
      '<img src="' + escapeHtml(p.foto || '') + '" alt="" width="52" height="52" onerror="this.style.display=\'none\'" />' +
      '<div class="cart-item-info">' +
        '<div class="cart-item-name">' + escapeHtml(displayName(p.nome)) + '</div>' +
        '<div class="cart-item-meta">' + escapeHtml(p.brand || '') + ' · ' + escapeHtml(p.volume || '') + ' · ' + escapeHtml(tipo) + '</div>' +
        '<div class="cart-item-price">R$ ' + formatPrice(price) + ' × <input type="number" min="1" value="' + qty + '" data-qty="' + escapeHtml(id) + '" class="cart-qty" /> = <strong>R$ ' + formatPrice(lineTotal) + '</strong></div>' +
      '</div>' +
      '<button class="cart-remove" data-remove="' + escapeHtml(id) + '" aria-label="Remover">✕</button></div>'
  ).join('');

  if (summary) {
    summary.innerHTML =
      '<div class="cart-total"><span>' + totalItems + ' item(ns)</span><strong>Total: R$ ' + formatPrice(subtotal) + '</strong></div>' +
      '<div class="cart-actions">' +
        '<button type="button" class="btn-outline" id="btnClearCart">Limpar pedido</button>' +
        '<button type="button" class="btn-wa" id="btnCheckout">Finalizar no WhatsApp</button></div>';
  }
  list.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => removeFromCart(btn.dataset.remove)));
  list.querySelectorAll('[data-qty]').forEach(inp => inp.addEventListener('change', () => setCartQty(inp.dataset.qty, inp.value)));
  document.getElementById('btnClearCart')?.addEventListener('click', () => { if (confirm('Limpar todo o pedido?')) clearCart(); });
  document.getElementById('btnCheckout')?.addEventListener('click', openCartCheckout);
}

function openCart() {
  renderCart();
  document.getElementById('cartOverlay')?.classList.add('open');
  document.getElementById('cartPanel')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.getElementById('cartPanel')?.classList.remove('open');
  if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
}

function openCartCheckout() {
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  const summaryEl = document.getElementById('checkoutSummary');
  if (summaryEl) {
    summaryEl.innerHTML = lines.map(l =>
      '• ' + escapeHtml(displayName(l.p.nome).slice(0, 40)) + ' — ' + l.qty + 'x R$ ' + formatPrice(l.price) + ' (' + escapeHtml(l.tipo) + ') = R$ ' + formatPrice(l.lineTotal)
    ).join('<br>') + '<br><br><strong>Total (' + totalItems + ' itens): R$ ' + formatPrice(subtotal) + '</strong>';
  }
  openModal('checkoutModal');
  closeCart();
}

function confirmCartCheckout() {
  const nome = document.getElementById('checkoutNome')?.value?.trim() || '';
  const cep = document.getElementById('checkoutCep')?.value?.trim() || '';
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  let msg = '*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n';
  for (const l of lines) {
    msg += '• *' + displayName(l.p.nome) + '*\n';
    msg += '  ' + (l.p.brand || '') + ' · ' + (l.p.volume || '') + ' — ' + l.qty + 'x R$ ' + formatPrice(l.price) + ' (' + l.tipo + ') = R$ ' + formatPrice(l.lineTotal) + '\n\n';
  }
  msg += '*Total (' + totalItems + ' itens): R$ ' + formatPrice(subtotal) + '*\n\n';
  if (nome) msg += 'Nome: ' + nome + '\n';
  if (cep) msg += 'CEP: ' + cep + '\n';
  window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg), '_blank');
  closeModal('checkoutModal');
}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (!document.querySelector('.modal.open, #cartPanel.open')) document.body.style.overflow = '';
  if (id === 'detailsModal') {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('produto');
      history.replaceState({}, '', url.pathname + url.search);
    } catch (_) {}
  }
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

function applySeasonalTheme() {
  const m = new Date().getMonth() + 1;
  document.documentElement.dataset.theme = m === 12 ? 'natal' : (m === 10 ? 'outubro' : 'default');
}

document.getElementById('tabs')?.addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  currentLine = btn.dataset.line || 'all';
  renderProducts(true);
});
document.getElementById('searchInput')?.addEventListener('input', e => { searchTerm = e.target.value.trim(); renderProducts(true); });
document.getElementById('filterDisponivel')?.addEventListener('change', e => { filterDisp = e.target.value; renderProducts(true); });
document.getElementById('filterPreco')?.addEventListener('change', e => { filterPreco = e.target.value; renderProducts(true); });
document.getElementById('sortBy')?.addEventListener('change', e => { sortBy = e.target.value; renderProducts(true); });
document.getElementById('btnLoadMore')?.addEventListener('click', () => { page += 1; renderProducts(false); });
document.getElementById('btnOpenCart')?.addEventListener('click', openCart);
document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
document.getElementById('btnCloseCart')?.addEventListener('click', closeCart);
document.getElementById('buyQty')?.addEventListener('input', updateBuyPricePreview);
document.getElementById('btnConfirmBuy')?.addEventListener('click', confirmBuy);
document.getElementById('btnConfirmCheckout')?.addEventListener('click', confirmCartCheckout);
document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => closeModal(el.dataset.close)));
document.getElementById('fabWhatsApp')?.addEventListener('click', () => {
  const { lines } = cartTotals();
  if (lines.length) { openCart(); return; }
  window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Olá! Vim pelo catálogo Empório A.R. Beauty e gostaria de atendimento.'), '_blank');
});

function openProductFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('produto');
    if (!id) return;
    const p = findProduct(id);
    if (p) openDetails(p);
  } catch (_) {}
}

applySeasonalTheme();
updateCartBadge();
renderProducts(true);
openProductFromUrl();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
