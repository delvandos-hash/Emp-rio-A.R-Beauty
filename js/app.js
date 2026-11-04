/**
 * Empório A.R. Beauty — Catálogo completo
 * Gist + interações tipo perfumes + destaques + marcas
 */
const GIST_RAW_URL = 'https://gist.githubusercontent.com/delvandos-hash/ecc1bd47819ee300db14cdac8cfc0482/raw/b44c14045c519b12d5c29d861c23dfd27e423849/catalogo.json';
const CATALOG_URLS = [GIST_RAW_URL, '/catalogo.json'];
const PAGE_SIZE = 48;
const STOCK_CACHE_MS = 10 * 60 * 1000;

const LOCAL_FALLBACK = {
  DATA: {}, DESTAQUES: {}, BRANDS: [],
  WHATSAPP: '5562991134488',
  BRAND: { name: 'Empório A.R. Beauty', phone: '(62) 99113-4488', tagline: 'Maquiagem e Cosméticos — Varejo e Atacado' }
};

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function decodeHtml(str) {
  if (!str) return '';
  const t = document.createElement('textarea'); t.innerHTML = str; return t.value;
}
function parsePrice(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g,'').replace(',','.')) || 0;
}
function formatPrice(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function normId(s) {
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function productId(p) {
  return `${normId(p.brand)}-${normId(p.nome)}-${normId(p.volume)}`;
}
function displayName(nome) {
  return String(nome||'').replace(/\s*\|\s*Atacado\s*$/i,'').trim();
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
      const j = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
      if (j && j.DATA) { console.log('Catálogo de', url); return j; }
    } catch (e) { console.warn(url, e); }
  }
  return LOCAL_FALLBACK;
}

const dados = await loadCatalogData();
const { DATA, WHATSAPP, BRAND } = dados;
const DESTAQUES = dados.DESTAQUES || {};
const BRANDS = dados.BRANDS || [];
document.getElementById('bootStatus')?.remove();

let currentLine = 'all';
let searchTerm = '';
let filterDisp = 'all';
let filterPreco = 'all';
let sortBy = 'default';
let filterBrand = '';
let page = 1;
const favorites = new Set(JSON.parse(localStorage.getItem('fav_maquiagem') || '[]'));
let cart = JSON.parse(localStorage.getItem('cart_maquiagem') || '{}');
const stockCache = new Map();
let allProductsCache = null;
let detailsNavList = [];
let detailsNavIndex = 0;
let detailsScrollY = 0;
let buyProduct = null;

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
  if (filterBrand && (p.brand || '').toLowerCase() !== filterBrand.toLowerCase()) return false;
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
  if (sortBy === 'price-asc') arr.sort((a,b)=>parsePrice(a.somenteAtacado?a.atacado:a.varejo)-parsePrice(b.somenteAtacado?b.atacado:b.varejo));
  else if (sortBy === 'price-desc') arr.sort((a,b)=>parsePrice(b.somenteAtacado?b.atacado:b.varejo)-parsePrice(a.somenteAtacado?a.atacado:a.varejo));
  else if (sortBy === 'name') arr.sort((a,b)=>displayName(a.nome).localeCompare(displayName(b.nome),'pt-BR'));
  return arr;
}

function saveCart() {
  localStorage.setItem('cart_maquiagem', JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  const total = Object.values(cart).reduce((s,i)=>s+i.qty,0);
  const badge = document.getElementById('cartBadge');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'flex' : 'none'; }
}
function addToCart(p, qty=1) {
  const id = productId(p);
  if (cart[id]) cart[id].qty += qty; else cart[id] = { product: p, qty };
  saveCart();
  showToast('Adicionado: ' + displayName(p.nome).slice(0,42));
}
function removeFromCart(id) { delete cart[id]; saveCart(); renderCart(); }
function setCartQty(id, qty) {
  qty = parseInt(qty,10);
  if (!qty || qty < 1) return removeFromCart(id);
  if (cart[id]) { cart[id].qty = qty; saveCart(); renderCart(); }
}
function clearCart() { cart = {}; saveCart(); renderCart(); }
function cartTotals() {
  let subtotal=0, totalItems=0; const lines=[];
  for (const [id, item] of Object.entries(cart)) {
    const { product:p, qty } = item;
    const { price, tipo } = unitPrice(p, qty);
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
  const prices = p.somenteAtacado
    ? `<div><span class="price-label">Atacado</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div>`
    : `<div><span class="price-label">Varejo</span><span class="price-v">R$ ${escapeHtml(p.varejo)}</span></div>
       <div><span class="price-label">Atacado (6+)</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div>`;
  return `<article class="card" data-id="${eid}">
    <button class="fav ${isFav?'active':''}" data-fav="${eid}" aria-label="Favoritar">♥</button>
    <div class="photo" data-open="${eid}">${badgeHtml}
      <img src="${foto}" alt="${nome}" width="72" height="72" loading="lazy" onerror="this.src='https://via.placeholder.com/150?text=Sem+foto'"/>
    </div>
    <div class="info">
      <div class="name" data-open="${eid}">${nome}</div>
      <div class="meta">${brand} · ${volume} · ${cat}</div>
      <div class="prices">${prices}</div>
      <div class="card-actions">
        <button class="btn-sm btn-details" data-details="${eid}">Detalhes</button>
        <button class="btn-sm btn-cart" data-cart="${eid}">Carrinho</button>
        <button class="btn-sm btn-buy" data-buy="${eid}">Comprar</button>
      </div>
    </div>
  </article>`;
}

function bindCardEvents(root) {
  root.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.fav;
      if (favorites.has(id)) { favorites.delete(id); btn.classList.remove('active'); }
      else { favorites.add(id); btn.classList.add('active'); }
      localStorage.setItem('fav_maquiagem', JSON.stringify([...favorites]));
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
}

function renderDestaques() {
  const host = document.getElementById('destaquesHost');
  if (!host) return;
  const lojas = DESTAQUES.lojas10?.items || [];
  const ofertas = DESTAQUES.ofertasLimitadas?.items || [];
  let html = '';
  if (ofertas.length) {
    html += `<section class="vitrine-section">
      <div class="vitrine-head"><h2>${escapeHtml(DESTAQUES.ofertasLimitadas.title || 'Ofertas por tempo limitado')}</h2></div>
      <div class="vitrine-track" id="vitrineOfertas">
        ${ofertas.map(p => `<div class="vitrine-card">${cardHtml(p)}</div>`).join('')}
      </div>
    </section>`;
  }
  if (lojas.length) {
    html += `<section class="section-block" id="secLojas10">
      <h2 class="section-title">${escapeHtml(DESTAQUES.lojas10.title || 'Lojas de R$10,00')}</h2>
      <div class="products-grid section-grid">${lojas.map(cardHtml).join('')}</div>
    </section>`;
  }
  host.innerHTML = html;
  bindCardEvents(host);
}

function renderBrandChips() {
  const box = document.getElementById('brandChips');
  if (!box) return;
  const brands = BRANDS.length ? BRANDS : [...new Set(getAllProducts().map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  box.innerHTML = `<button type="button" class="brand-chip ${!filterBrand?'active':''}" data-brand="">Todas</button>` +
    brands.map(b => `<button type="button" class="brand-chip ${filterBrand===b?'active':''}" data-brand="${escapeHtml(b)}">${escapeHtml(b)}</button>`).join('');
  box.querySelectorAll('[data-brand]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterBrand = btn.dataset.brand || '';
      renderBrandChips();
      renderProducts(true);
    });
  });
}

function renderProducts(resetPage=true) {
  if (resetPage) page = 1;
  const container = document.getElementById('products');
  const empty = document.getElementById('empty');
  const moreWrap = document.getElementById('loadMoreWrap');
  const stats = document.getElementById('resultStats');
  const filtered = sortProducts(getAllProducts().filter(matchesFilters));
  detailsNavList = filtered;
  const total = filtered.length;
  const visible = filtered.slice(0, page * PAGE_SIZE);
  if (stats) stats.textContent = total ? `${Math.min(visible.length,total)} de ${total} produtos` : '';
  if (!total) {
    container.style.display = 'none';
    empty.style.display = 'block';
    if (moreWrap) moreWrap.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  container.style.display = 'grid';
  container.innerHTML = visible.map(cardHtml).join('');
  if (moreWrap) moreWrap.style.display = visible.length < total ? 'flex' : 'none';
  bindCardEvents(container);
}

function openDetails(p, opts={}) {
  if (!opts.fromNav) {
    detailsScrollY = window.scrollY || 0;
    const filtered = detailsNavList.length ? detailsNavList : sortProducts(getAllProducts().filter(matchesFilters));
    detailsNavList = filtered;
    detailsNavIndex = Math.max(0, filtered.findIndex(x => productId(x)===productId(p)));
  }
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
    : `<div class="details-price"><div><span class="price-label">Varejo</span><span class="price-v">R$ ${escapeHtml(p.varejo)}</span></div>
       <div><span class="price-label">Atacado (6+)</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div></div>`;
  const thumbs = fotos.slice(1).map((f,i)=>`<img src="${escapeHtml(f)}" alt="" width="48" height="48" loading="lazy" data-full="${escapeHtml(f)}"/>`).join('');
  injectProductJsonLd(p);
  document.getElementById('detailsContent').innerHTML = `
    <div class="details-nav">
      <button type="button" class="nav-btn" id="detPrev" ${detailsNavIndex<=0?'disabled':''}>‹</button>
      <span class="nav-pos">${detailsNavIndex+1}/${Math.max(detailsNavList.length,1)}</span>
      <button type="button" class="nav-btn" id="detNext" ${detailsNavIndex>=detailsNavList.length-1?'disabled':''}>›</button>
    </div>
    <div class="details-photo">
      <img src="${mainFoto}" alt="${nome}" id="detailsMainImg" width="280" height="280" onerror="this.src='https://via.placeholder.com/400?text=Sem+foto'"/>
      ${thumbs?`<div class="details-thumbs">${thumbs}</div>`:''}
    </div>
    <h3 class="details-title">${nome}</h3>
    <p class="details-meta">${brand} · ${volume} · ${cat}</p>
    <p class="details-stock" id="detailsStock">${dispInicial?'<span class="stock-ok">● Disponível</span>':'<span class="stock-out">● Esgotado</span>'}<span class="stock-check"> · verificando…</span></p>
    ${precoHtml}
    <p class="details-desc">${desc}</p>
    <div class="details-actions">
      <button class="btn-sm btn-cart" id="detailsAddCart">Carrinho</button>
      <button class="btn-sm btn-buy" id="detailsBuy">Comprar</button>
    </div>`;
  document.querySelectorAll('.details-thumbs img').forEach(img => {
    img.addEventListener('click', () => { const m=document.getElementById('detailsMainImg'); if(m) m.src=img.dataset.full||img.src; });
  });
  document.getElementById('detailsAddCart')?.addEventListener('click', () => { addToCart(p,1); closeModal('detailsModal'); });
  document.getElementById('detailsBuy')?.addEventListener('click', () => { closeModal('detailsModal'); openBuyModal(p); });
  document.getElementById('detPrev')?.addEventListener('click', () => showDetailsAt(detailsNavIndex-1,'right'));
  document.getElementById('detNext')?.addEventListener('click', () => showDetailsAt(detailsNavIndex+1,'left'));
  openModal('detailsModal');
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('produto', productId(p));
    history.pushState({ emporioModal: true }, '', url.pathname + url.search);
  } catch(_){}
  checkLiveStock(p).then(disp => {
    const el = document.getElementById('detailsStock');
    if (!el) return;
    const ok = (disp||'').toLowerCase()==='sim';
    el.innerHTML = ok
      ? '<span class="stock-ok">● Disponível</span><span class="stock-check"> · atualizado agora</span>'
      : '<span class="stock-out">● Esgotado</span><span class="stock-check"> · atualizado agora</span>';
    p.disponivel = ok ? 'Sim' : 'Não';
  });
}

function showDetailsAt(index, direction) {
  if (index < 0 || index >= detailsNavList.length) return;
  detailsNavIndex = index;
  openDetails(detailsNavList[index], { fromNav: true });
}

function injectProductJsonLd(p) {
  let el = document.getElementById('product-jsonld');
  if (!el) { el = document.createElement('script'); el.type='application/ld+json'; el.id='product-jsonld'; document.head.appendChild(el); }
  const price = p.somenteAtacado ? p.atacado : p.varejo;
  el.textContent = JSON.stringify({
    '@context':'https://schema.org','@type':'Product',
    name: displayName(p.nome), image: p.foto||'', description: decodeHtml(p.notas||displayName(p.nome)),
    brand: { '@type':'Brand', name: p.brand||'' },
    offers: { '@type':'Offer', priceCurrency:'BRL', price:String(parsePrice(price)),
      availability: (p.disponivel||'').toLowerCase()==='sim'?'https://schema.org/InStock':'https://schema.org/OutOfStock' }
  });
}

function openBuyModal(p) {
  buyProduct = p;
  document.getElementById('buyProductName').textContent = displayName(p.nome);
  document.getElementById('buyProductMeta').textContent = `${p.brand||''} · ${p.volume||''} · ${p.cat||''}`;
  document.getElementById('buyQty').value = '1';
  updateBuyPricePreview();
  openModal('buyModal');
}
function updateBuyPricePreview() {
  if (!buyProduct) return;
  const qty = parseInt(document.getElementById('buyQty')?.value||'1',10)||1;
  const { price, tipo } = unitPrice(buyProduct, qty);
  const el = document.getElementById('buyPricePreview');
  if (!el) return;
  let hint = '';
  if (!buyProduct.somenteAtacado && qty < 6) hint = `<span class="price-hint">Faltam ${6-qty} para preço de atacado</span>`;
  el.innerHTML = `<span class="price-tipo">${escapeHtml(tipo)}</span><span class="price-unit">R$ ${formatPrice(price)} / un</span><strong class="price-sub">Subtotal: R$ ${formatPrice(price*qty)}</strong>${hint}`;
}
function confirmBuy() {
  if (!buyProduct) return;
  const nome = document.getElementById('buyNome')?.value?.trim()||'';
  const cep = document.getElementById('buyCep')?.value?.trim()||'';
  const qty = parseInt(document.getElementById('buyQty')?.value||'1',10)||1;
  const { price, tipo } = unitPrice(buyProduct, qty);
  let msg = `*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n*${displayName(buyProduct.nome)}*\n${buyProduct.brand||''} · ${buyProduct.volume||''}\nQtd: ${qty}\nPreço (${tipo}): R$ ${formatPrice(price)}\nSubtotal: R$ ${formatPrice(price*qty)}\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep}\n`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
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
  list.innerHTML = lines.map(({id,p,qty,price,tipo,lineTotal}) =>
    `<div class="cart-item">
      <img src="${escapeHtml(p.foto||'')}" alt="" width="52" height="52" onerror="this.style.display='none'"/>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(displayName(p.nome))}</div>
        <div class="cart-item-meta">${escapeHtml(p.brand||'')} · ${escapeHtml(tipo)}</div>
        <div class="cart-item-price">R$ ${formatPrice(price)} × <input type="number" min="1" value="${qty}" data-qty="${escapeHtml(id)}" class="cart-qty"/> = <strong>R$ ${formatPrice(lineTotal)}</strong></div>
      </div>
      <button class="cart-remove" data-remove="${escapeHtml(id)}" aria-label="Remover">✕</button>
    </div>`).join('');
  if (summary) {
    summary.innerHTML = `<div class="cart-total"><span>${totalItems} item(ns)</span><strong>Total: R$ ${formatPrice(subtotal)}</strong></div>
      <div class="cart-actions"><button type="button" class="btn-outline" id="btnClearCart">Limpar pedido</button>
      <button type="button" class="btn-wa" id="btnCheckout">Finalizar no WhatsApp</button></div>`;
  }
  list.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>removeFromCart(b.dataset.remove)));
  list.querySelectorAll('[data-qty]').forEach(i=>i.addEventListener('change',()=>setCartQty(i.dataset.qty,i.value)));
  document.getElementById('btnClearCart')?.addEventListener('click',()=>{ if(confirm('Limpar todo o pedido?')) clearCart(); });
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
    summaryEl.innerHTML = lines.map(l=>`• ${escapeHtml(displayName(l.p.nome).slice(0,40))} — ${l.qty}x R$ ${formatPrice(l.price)} (${escapeHtml(l.tipo)}) = R$ ${formatPrice(l.lineTotal)}`).join('<br>')
      + `<br><br><strong>Total (${totalItems} itens): R$ ${formatPrice(subtotal)}</strong>`;
  }
  openModal('checkoutModal'); closeCart();
}
function confirmCartCheckout() {
  const nome = document.getElementById('checkoutNome')?.value?.trim()||'';
  const cep = document.getElementById('checkoutCep')?.value?.trim()||'';
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  let msg = `*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n`;
  for (const l of lines) {
    msg += `• *${displayName(l.p.nome)}*\n  ${l.p.brand||''} — ${l.qty}x R$ ${formatPrice(l.price)} (${l.tipo}) = R$ ${formatPrice(l.lineTotal)}\n\n`;
  }
  msg += `*Total (${totalItems} itens): R$ ${formatPrice(subtotal)}*\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep}\n`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
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
    } catch(_){}
    requestAnimationFrame(() => window.scrollTo(0, detailsScrollY||0));
  }
}
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 2400);
}

function initSwipeDetails() {
  const overlay = document.getElementById('detailsModal');
  if (!overlay || overlay.dataset.swipeReady) return;
  overlay.dataset.swipeReady = '1';
  const box = overlay.querySelector('.modal-box');
  if (!box) return;
  let startY=0, startX=0, mode=null, dragging=false;
  const onStart = (y,x) => { if (!overlay.classList.contains('open')) return; startY=y; startX=x; mode=null; dragging=true; box.style.transition='none'; };
  const onMove = (y,x) => {
    if (!dragging) return;
    const dy=y-startY, dx=x-startX;
    if (!mode) {
      if (Math.abs(dy)>8 && Math.abs(dy)>Math.abs(dx)) mode='v';
      else if (Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)) mode='h';
    }
    if (mode==='v' && dy>0) {
      const p = Math.min(dy/280,1);
      box.style.transform = `translateY(${dy}px) scale(${1-p*0.03})`;
      box.style.opacity = String(1-p*0.35);
    } else if (mode==='h') {
      box.style.transform = `translateX(${dx}px)`;
    }
  };
  const onEnd = (y,x) => {
    if (!dragging) return;
    dragging=false;
    const dy=y-startY, dx=x-startX;
    box.style.transition = 'transform .28s ease, opacity .28s ease';
    if (mode==='v' && dy>110) { closeModal('detailsModal'); }
    else if (mode==='h' && Math.abs(dx)>70) {
      const next = dx<0 ? detailsNavIndex+1 : detailsNavIndex-1;
      if (next>=0 && next<detailsNavList.length) showDetailsAt(next, dx<0?'left':'right');
      else { box.style.transform=''; box.style.opacity=''; }
    } else { box.style.transform=''; box.style.opacity=''; }
    mode=null;
    setTimeout(()=>{ box.style.transition=''; box.style.transform=''; box.style.opacity=''; }, 300);
  };
  box.addEventListener('touchstart', e => onStart(e.touches[0].clientY, e.touches[0].clientX), {passive:true});
  box.addEventListener('touchmove', e => onMove(e.touches[0].clientY, e.touches[0].clientX), {passive:true});
  box.addEventListener('touchend', e => onEnd(e.changedTouches[0].clientY, e.changedTouches[0].clientX), {passive:true});
}

// Events
document.getElementById('tabs')?.addEventListener('click', e => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  currentLine = btn.dataset.line || 'all';
  renderProducts(true);
});
document.getElementById('searchInput')?.addEventListener('input', e => { searchTerm=e.target.value.trim(); renderProducts(true); });
document.getElementById('filterDisponivel')?.addEventListener('change', e => { filterDisp=e.target.value; renderProducts(true); });
document.getElementById('filterPreco')?.addEventListener('change', e => { filterPreco=e.target.value; renderProducts(true); });
document.getElementById('sortBy')?.addEventListener('change', e => { sortBy=e.target.value; renderProducts(true); });
document.getElementById('btnLoadMore')?.addEventListener('click', () => { page+=1; renderProducts(false); });
document.getElementById('btnOpenCart')?.addEventListener('click', openCart);
document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
document.getElementById('btnCloseCart')?.addEventListener('click', closeCart);
document.getElementById('buyQty')?.addEventListener('input', updateBuyPricePreview);
document.getElementById('btnConfirmBuy')?.addEventListener('click', confirmBuy);
document.getElementById('btnConfirmCheckout')?.addEventListener('click', confirmCartCheckout);
document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => closeModal(el.dataset.close)));
document.getElementById('fabWhatsApp')?.addEventListener('click', () => {
  if (cartTotals().lines.length) { openCart(); return; }
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Vim pelo catálogo Empório A.R. Beauty e gostaria de atendimento.')}`,'_blank');
});
document.getElementById('btnToggleBrands')?.addEventListener('click', () => {
  const panel = document.getElementById('brandPanel');
  if (panel) panel.classList.toggle('open');
});
window.addEventListener('popstate', () => {
  if (document.getElementById('detailsModal')?.classList.contains('open')) closeModal('detailsModal');
});
document.addEventListener('keydown', e => {
  if (!document.getElementById('detailsModal')?.classList.contains('open')) return;
  if (e.key === 'ArrowRight') showDetailsAt(detailsNavIndex+1,'left');
  if (e.key === 'ArrowLeft') showDetailsAt(detailsNavIndex-1,'right');
  if (e.key === 'Escape') closeModal('detailsModal');
});

function openProductFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('produto');
    if (!id) return;
    const p = findProduct(id);
    if (p) openDetails(p);
  } catch(_){}
}

updateCartBadge();
renderDestaques();
renderBrandChips();
renderProducts(true);
initSwipeDetails();
openProductFromUrl();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
