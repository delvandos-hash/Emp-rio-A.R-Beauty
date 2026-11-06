/**
 * Empório A.R. Beauty — Catálogo completo
 * Melhorias: favoritos, nome/CEP lembrados, múltiplas variações, botões +/-,
 * voltar ao topo, badge "já no carrinho" e cálculo global de atacado.
 */
import { parsePrice, formatPriceBR as formatPrice } from './prices.js';

const GIST_RAW_URL = 'https://gist.githubusercontent.com/delvandos-hash/081d1d5efa2e2003cf859964a650dfb5/raw/catalogo.json';
const CATALOG_URLS = [GIST_RAW_URL, '/catalogo.json'];
const PAGE_SIZE = 48;
const STOCK_CACHE_MS = 10 * 60 * 1000;
const CANONICAL_HOME = 'https://emporioar-beauty.netlify.app/';

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
  const t = document.createElement('textarea');
  t.innerHTML = str;
  return t.value;
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

function setCanonical(url) {
  let l = document.querySelector('link[rel="canonical"]');
  if (!l) { l = document.createElement('link'); l.rel = 'canonical'; document.head.appendChild(l); }
  l.href = url;
}
function setMeta(selector, content) {
  let m = document.querySelector(selector);
  if (!m) return;
  m.setAttribute('content', content);
}
function updateSeoForProduct(p) {
  const canonicalUrl = window.location.href;
  setCanonical(canonicalUrl);
  setMeta('meta[property="og:url"]', canonicalUrl);
  setMeta('meta[property="og:title"]', displayName(p.nome) + ' | Empório A.R. Beauty');
  setMeta('meta[property="og:description"]', (decodeHtml(p.notas||'').slice(0, 150)) || displayName(p.nome));
  if (p.foto) setMeta('meta[property="og:image"]', p.foto);
}
function resetSeoToHome() {
  setCanonical(CANONICAL_HOME);
  setMeta('meta[property="og:url"]', CANONICAL_HOME);
  setMeta('meta[property="og:title"]', 'Empório A.R. Beauty | Catálogo de Maquiagem');
  setMeta('meta[property="og:description"]', 'Catálogo online de maquiagens e cosméticos. Preços de varejo e atacado. Pedido pelo WhatsApp.');
}

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const BUY_META_KEY = 'emporio_buy_meta_v3';
function loadBuyMeta() { return safeGet(BUY_META_KEY, { nome: '', cep: '' }); }
function saveBuyMeta(nome, cep) {
  const prev = loadBuyMeta();
  safeSet(BUY_META_KEY, {
    nome: (nome ?? prev.nome ?? '').trim(),
    cep: (cep ?? prev.cep ?? '').trim()
  });
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
let page = 1;
const favorites = new Set(safeGet('fav_maquiagem', []));
let favoritesSort = safeGet('fav_sort', 'added');
let cart = safeGet('cart_maquiagem', {});
const stockCache = new Map();
let allProductsCache = null;
let detailsNavList = [];
let detailsNavIndex = 0;
let detailsScrollY = 0;
let buyProduct = null;
let currentProduct = null;

document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.tagName === 'IMG' && img.dataset.fallback && img.src !== img.dataset.fallback) {
    img.src = img.dataset.fallback;
  }
}, true);

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

function isLojas10(p) {
  const b = (p.badge || '').toUpperCase();
  const d = (p.destaque || '').toLowerCase();
  return b.includes('LOJAS') || b.includes('R$10') || d === 'lojas10';
}
function isOferta(p) {
  const b = (p.badge || '').toUpperCase();
  const d = (p.destaque || '').toLowerCase();
  return b.includes('OFERTA') || d === 'ofertaslimitadas' || d === 'ofertas';
}
function isVitrineProduct(p) {
  return isLojas10(p) || isOferta(p);
}

function getDestaqueItems(key) {
  const fromDest = DESTAQUES[key]?.items || [];
  if (fromDest.length) {
    return fromDest.map(it => ({
      ...it,
      brand: it.brand || '',
      cat: it.cat || '',
      line: it.line || 'outros',
      badge: it.badge || (key === 'lojas10' ? 'LOJAS R$10' : 'OFERTA'),
      destaque: it.destaque || key
    }));
  }
  if (key === 'lojas10') return getAllProducts().filter(isLojas10);
  if (key === 'ofertasLimitadas') return getAllProducts().filter(isOferta);
  return [];
}

function matchesFilters(p) {
  if (currentLine === 'lojas10') {
    if (!isLojas10(p)) return false;
  } else {
    if (isVitrineProduct(p)) return false;
    if (currentLine !== 'all' && p.line !== currentLine) return false;
  }
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
  safeSet('cart_maquiagem', cart);
  updateCartBadge();
  refreshInCartBadges();
}
function updateCartBadge() {
  const total = Object.values(cart).reduce((s,i)=>s+i.qty,0);
  const badge = document.getElementById('cartBadge');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'flex' : 'none'; }
}
function isProductInCart(p) {
  const baseId = productId(p);
  if (cart[baseId]) return true;
  for (const id of Object.keys(cart)) {
    if (id === baseId || id.startsWith(baseId + '|')) return true;
  }
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
    if (btn) {
      btn.classList.toggle('in-cart', inCart);
      btn.textContent = inCart ? '✓ No carrinho' : 'Carrinho';
    }
    const existingBadge = card.querySelector('.badge-in-cart');
    if (inCart && !existingBadge) {
      const badge = document.createElement('span');
      badge.className = 'badge-in-cart';
      badge.textContent = 'NO CARRINHO';
      const photo = card.querySelector('.photo');
      if (photo) photo.appendChild(badge);
    } else if (!inCart && existingBadge) {
      existingBadge.remove();
    }
  });
}

function addToCart(p, qty=1) {
  const id = productId(p) + (p.variacaoSelecionada ? '|' + p.variacaoSelecionada.nome : '');
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
  const cartBadgeHtml = inCart ? '<span class="badge-in-cart">NO CARRINHO</span>' : '';
  const prices = p.somenteAtacado
    ? `<div><span class="price-label">Atacado</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div>`
    : `<div><span class="price-label">Varejo</span><span class="price-v">R$ ${escapeHtml(p.varejo)}</span></div>
       <div><span class="price-label">Atacado (6+)</span><span class="price-a">R$ ${escapeHtml(p.atacado)}</span></div>`;
  const cartBtnLabel = inCart ? '✓ No carrinho' : 'Carrinho';
  const cartBtnClass = inCart ? 'btn-sm btn-cart in-cart' : 'btn-sm btn-cart';
  return `<article class="card" data-id="${eid}">
    <button class="fav ${isFav?'active':''}" data-fav="${eid}" aria-label="Favoritar" aria-pressed="${isFav?'true':'false'}">♥</button>
    <div class="photo" data-open="${eid}">${badgeHtml}${cartBadgeHtml}
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
}

function renderDestaques() {
  const host = document.getElementById('destaquesHost');
  if (!host) return;

  const ofertas = getDestaqueItems('ofertasLimitadas');
  const titleOfertas = DESTAQUES.ofertasLimitadas?.title || 'Ofertas por tempo limitado';

  let html = '';
  if (ofertas.length) {
    html += `<section class="vitrine-section" id="vitrineOfertasSection">
      <div class="vitrine-head"><h2>${escapeHtml(titleOfertas)}</h2></div>
      <div class="vitrine-track" id="vitrineOfertas">
        ${ofertas.map(p => `<div class="vitrine-card">${cardHtml(p)}</div>`).join('')}
      </div>
    </section>`;
  }

  host.innerHTML = html;
  if (html) bindCardEvents(host);
}

function getLojas10Products() {
  return getDestaqueItems('lojas10');
}

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

function buildVariacoesHtml(p) {
  const vars = Array.isArray(p.variacoes) ? p.variacoes : [];
  if (!vars.length) return '';
  const chips = vars.map(v => {
    const ok = v.estoque === undefined || Number(v.estoque) > 0;
    const id = String(v.id || v.nome || '');
    const label = escapeHtml(v.nome || '—');
    const disabled = ok ? '' : ' disabled';
    return `<button type="button" class="var-chip${ok?'':' var-chip-out'}" data-var-id="${id}" data-var-nome="${label}"${disabled} aria-pressed="false">
      <span class="var-chip-name">${label}</span>
    </button>`;
  }).join('');
  return `<div class="variacoes-box" id="variacoesBox">
    <strong>Escolha as opções (pode marcar várias)</strong>
    <div class="var-chips">${chips}</div>
    <p class="var-hint" id="varHint">Selecione uma ou mais opções disponíveis</p>
    <button type="button" id="btnAddMulti" class="btn-add-multi" style="display:none">
      🛒 Adicionar <span id="multiCount">0</span> opção(ões) ao carrinho
    </button>
  </div>`;
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
    } else {
      p.variacaoSelecionada = null;
    }
  };

  box.querySelectorAll('.var-chip:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-var-id');
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
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
      addToCart(clone, 1);
      added++;
    });
    if (added) {
      showToast(`${added} opção(ões) adicionada(s) ao carrinho`);
      selected.clear();
      refresh();
    }
  });

  refresh();
}

function openDetails(p, opts={}) {
  if (!opts.fromNav) {
    detailsScrollY = window.scrollY || 0;
    const filtered = detailsNavList.length ? detailsNavList : sortProducts(getAllProducts().filter(matchesFilters));
    detailsNavList = filtered;
    detailsNavIndex = Math.max(0, filtered.findIndex(x => productId(x)===productId(p)));
  }
  currentProduct = p;
  p.variacaoSelecionada = null;

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
  const variacoesHtml = buildVariacoesHtml(p);

  document.getElementById('detailsContent').innerHTML = `
    <div class="details-nav">
      <button type="button" class="nav-btn" id="detPrev" ${detailsNavIndex<=0?'disabled':''} aria-label="Anterior">‹</button>
      <span class="nav-pos">${detailsNavIndex+1}/${Math.max(detailsNavList.length,1)}</span>
      <button type="button" class="nav-btn" id="detNext" ${detailsNavIndex>=detailsNavList.length-1?'disabled':''} aria-label="Próximo">›</button>
    </div>
    <div class="details-photo">
      <img src="${mainFoto}" alt="${nome}" id="detailsMainImg" width="280" height="280" loading="lazy" data-fallback="https://via.placeholder.com/400?text=Sem+foto"/>
      ${thumbs?`<div class="details-thumbs">${thumbs}</div>`:''}
    </div>
    <h3 class="details-title">${nome}</h3>
    <p class="details-meta">${brand} · ${volume} · ${cat}</p>
    <p class="details-stock" id="detailsStock">${dispInicial?'<span class="stock-ok">● Disponível</span>':'<span class="stock-out">● Esgotado</span>'}<span class="stock-check"> · verificando…</span></p>
    ${precoHtml}
    ${variacoesHtml}
    <p class="details-desc" style="margin-top:1rem">${desc}</p>
    <div class="details-actions">
      <button class="btn-sm btn-cart" id="detailsAddCart">Carrinho</button>
      <button class="btn-sm btn-buy" id="detailsBuy">Comprar</button>
    </div>`;

  document.querySelectorAll('.details-thumbs img').forEach(img => {
    img.addEventListener('click', () => { const m=document.getElementById('detailsMainImg'); if(m) m.src=img.dataset.full||img.src; });
  });
  bindVariacaoSelector(p);

  document.getElementById('detailsAddCart')?.addEventListener('click', () => {
    if (p.variacoes && p.variacoes.length > 0 && !p.variacaoSelecionada) {
      showToast('Selecione uma opção (ou use o botão de adicionar várias).');
      return;
    }
    addToCart(p,1);
    closeModal('detailsModal');
  });

  document.getElementById('detailsBuy')?.addEventListener('click', () => {
    if (p.variacoes && p.variacoes.length > 0 && !p.variacaoSelecionada) {
      showToast('Selecione uma única opção para comprar direto. Para várias, use o carrinho.');
      return;
    }
    closeModal('detailsModal');
    openBuyModal(p);
  });

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
    el.innerHTML = ok
      ? '<span class="stock-ok">● Disponível</span><span class="stock-check"> · atualizado agora</span>'
      : '<span class="stock-out">● Esgotado</span><span class="stock-check"> · atualizado agora</span>';
    p.disponivel = ok ? 'Sim' : 'Não';
  });
}

function showDetailsAt(index, direction) {
  if (index < 0 || index >= detailsNavList.length) return;
  detailsNavIndex = index;
  const p = detailsNavList[index];
  openDetails(p, { fromNav: true });
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('produto', productId(p));
    history.replaceState({ emporioModal: true }, '', url.pathname + url.search);
    updateSeoForProduct(p);
  } catch(_){}
}

function injectProductJsonLd(p) {
  let el = document.getElementById('product-jsonld');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'product-jsonld';
    document.head.appendChild(el);
  }
  const priceRaw = p.somenteAtacado ? p.atacado : p.varejo;
  const priceNum = parsePrice(priceRaw);
  const priceSchema = priceNum > 0 ? priceNum.toFixed(2) : '0.00';
  const payload = {
    '@context':'https://schema.org',
    '@type':'Product',
    name: displayName(p.nome),
    image: p.foto || '',
    description: decodeHtml(p.notas||displayName(p.nome)),
    brand: { '@type':'Brand', name: p.brand||'' },
    offers: {
      '@type':'Offer',
      priceCurrency:'BRL',
      price: priceSchema,
      availability: (p.disponivel||'').toLowerCase()==='sim'?'https://schema.org/InStock':'https://schema.org/OutOfStock',
      url: window.location.href
    }
  };
  if (p.gtin) payload.gtin = String(p.gtin).replace(/\D/g, '');
  el.textContent = JSON.stringify(payload).replace(/</g, '\\u003c');
}

function openBuyModal(p) {
  buyProduct = p;
  const metaText = `${p.brand||''} · ${p.volume||''} · ${p.cat||''}`;
  document.getElementById('buyProductName').textContent = displayName(p.nome);
  document.getElementById('buyProductMeta').textContent = metaText;
  document.getElementById('buyQty').value = '1';
  const saved = loadBuyMeta();
  document.getElementById('buyNome').value = saved.nome || '';
  document.getElementById('buyCep').value = saved.cep || '';
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
function validateCheckout(nome, cep) {
  const nomeOk = (nome || '').trim().length >= 2;
  const cepOk  = (cep  || '').replace(/\D/g,'').length === 8;
  if (!nomeOk) { showToast('Informe seu nome (mín. 2 letras).'); return false; }
  if (!cepOk)  { showToast('CEP inválido (8 dígitos).'); return false; }
  return true;
}
function confirmBuy() {
  if (!buyProduct) return;
  const nome = document.getElementById('buyNome')?.value?.trim()||'';
  const cep = document.getElementById('buyCep')?.value?.trim()||'';
  const qty = parseInt(document.getElementById('buyQty')?.value||'1',10)||1;
  if (!validateCheckout(nome, cep)) return;
  saveBuyMeta(nome, cep);
  const { price, tipo } = unitPrice(buyProduct, qty);

  let varText = buyProduct.variacaoSelecionada ? `\nVariação: ${buyProduct.variacaoSelecionada.nome}` : '';

  let msg = `*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n*${displayName(buyProduct.nome)}*${varText}\n${buyProduct.brand||''} · ${buyProduct.volume||''}\nQtd: ${qty}\nPreço (${tipo}): R$ ${formatPrice(price)}\nSubtotal: R$ ${formatPrice(price*qty)}\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep}\n`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
  closeModal('buyModal');
}

// ===== Carrinho (painel) =====
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

  const resumoHtml = `
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:.75rem .9rem;margin-bottom:.75rem;color:#065f46">
      <div style="font-size:.78rem;font-weight:600;opacity:.8">Resumo do pedido</div>
      <div style="font-size:1rem;font-weight:800;margin-top:.15rem">Itens: ${totalItems} · Total: R$ ${formatPrice(subtotal)}</div>
    </div>`;

  // LÓGICA DE AVISO NO TOPO: Verifica se há itens de varejo pendentes
  const GLOBAL_ATACADO_TARGET = 6;
  let temItemVarejoPendente = false;

  lines.forEach(l => {
    if (!l.p.somenteAtacado && l.qty < GLOBAL_ATACADO_TARGET) {
      temItemVarejoPendente = true;
    }
  });

  let avisoHtml = '';
  
  if (temItemVarejoPendente && totalItems < GLOBAL_ATACADO_TARGET) {
    // Se tem item de varejo que não bateu a meta E o carrinho todo não chegou a 6
    const faltam = GLOBAL_ATACADO_TARGET - totalItems;
    avisoHtml = `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:.55rem .8rem;margin-bottom:.75rem;color:#92400e;font-size:.82rem;font-weight:700">⚠️ Faltam ${faltam} item(ns) para liberar o preço de atacado nos produtos de varejo.</div>`;
  } else if (lines.some(l => l.tipo === 'Atacado')) {
    // Se todos os itens de varejo já estão em atacado (ou não tem varejo)
    avisoHtml = `<div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:10px;padding:.55rem .8rem;margin-bottom:.75rem;color:#065f46;font-size:.82rem;font-weight:700">✓ Preço de ATACADO aplicado</div>`;
  }

  const itemsHtml = lines.map(({id,p,qty,price,tipo,lineTotal}) => {
    let varHtml = p.variacaoSelecionada
      ? `<br><span style="font-size:0.75rem;color:#6b7280">Opção: ${escapeHtml(p.variacaoSelecionada.nome)}</span>`
      : '';
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
      <div class="cart-actions"><button type="button" class="btn-outline" id="btnClearCart">Limpar pedido</button>
      <button type="button" class="btn-wa" id="btnCheckout">Finalizar no WhatsApp</button></div>`;
  }

  list.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>removeFromCart(b.dataset.remove)));

  list.querySelectorAll('[data-qty-minus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.qtyMinus;
      const item = cart[id];
      if (!item) return;
      if (item.qty <= 1) {
        if (confirm('Remover este item do carrinho?')) removeFromCart(id);
        return;
      }
      setCartQty(id, item.qty - 1);
    });
  });

  list.querySelectorAll('[data-qty-plus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.qtyPlus;
      const item = cart[id];
      if (!item) return;
      setCartQty(id, item.qty + 1);
    });
  });

  document.getElementById('btnClearCart')?.addEventListener('click',()=>{ if(confirm('Limpar todo o pedido?')) clearCart(); });
  document.getElementById('btnCheckout')?.addEventListener('click', openCartCheckout);
}
function openCart() {
  renderCart();
  document.getElementById('cartOverlay')?.classList.add('open');
  document.getElementById('cartPanel')?.classList.add('open');
  document.getElementById('cartPanel')?.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.getElementById('cartPanel')?.classList.remove('open');
  document.getElementById('cartPanel')?.setAttribute('aria-hidden','true');
  if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
}
function openCartCheckout() {
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  const summaryEl = document.getElementById('checkoutSummary');
  if (summaryEl) {
    summaryEl.innerHTML = lines.map(l=>{
      let v = l.p.variacaoSelecionada ? ` (${escapeHtml(l.p.variacaoSelecionada.nome)})` : '';
      return `• ${escapeHtml(displayName(l.p.nome).slice(0,30))}${v} — ${l.qty}x R$ ${formatPrice(l.price)} (${escapeHtml(l.tipo)}) = R$ ${formatPrice(l.lineTotal)}`;
    }).join('<br>')
      + `<br><br><strong>Total (${totalItems} itens): R$ ${formatPrice(subtotal)}</strong>`;
  }
  const saved = loadBuyMeta();
  document.getElementById('checkoutNome').value = saved.nome || '';
  document.getElementById('checkoutCep').value = saved.cep || '';
  openModal('checkoutModal'); closeCart();
}
function confirmCartCheckout() {
  const nome = document.getElementById('checkoutNome')?.value?.trim()||'';
  const cep = document.getElementById('checkoutCep')?.value?.trim()||'';
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;
  if (!validateCheckout(nome, cep)) return;
  saveBuyMeta(nome, cep);
  let msg = `*Pedido Empório A.R. Beauty*\n\nOlá! Gostaria de fazer um pedido:\n\n`;
  for (const l of lines) {
    let v = l.p.variacaoSelecionada ? ` (${l.p.variacaoSelecionada.nome})` : '';
    msg += `• *${displayName(l.p.nome)}*${v}\n  ${l.p.brand||''} — ${l.qty}x R$ ${formatPrice(l.price)} (${l.tipo}) = R$ ${formatPrice(l.lineTotal)}\n\n`;
  }
  msg += `*Total (${totalItems} itens): R$ ${formatPrice(subtotal)}*\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep}\n`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
  closeModal('checkoutModal');
}

function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const focusable = m.querySelector('button, [href], input, select, textarea');
  focusable?.focus();
}
function closeModal(id) {
  const m = document.getElementById(id);
  m?.classList.remove('open');
  m?.setAttribute('aria-hidden','true');
  if (!document.querySelector('.modal.open, #cartPanel.open')) document.body.style.overflow = '';
  if (id === 'detailsModal') {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('produto');
      history.replaceState({}, '', url.pathname + url.search);
      resetSeoToHome();
    } catch(_){}
    requestAnimationFrame(() => window.scrollTo(0, detailsScrollY||0));
  }
}
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t=document.createElement('div'); t.id='toast'; t.setAttribute('role','status'); t.setAttribute('aria-live','polite'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 2400);
}

// ===== Favoritos =====
function updateFavBadge() {
  const badge = document.getElementById('favBadge');
  if (badge) {
    const n = favorites.size;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'flex' : 'none';
  }
}

function openFavoritesModal() {
  renderFavoritesList();
  openModal('favoritesModal');
}

function sortFavoriteProducts(list) {
  const arr = list.slice();
  if (favoritesSort === 'name-asc') arr.sort((a,b)=>displayName(a.nome).localeCompare(displayName(b.nome),'pt-BR'));
  else if (favoritesSort === 'name-desc') arr.sort((a,b)=>displayName(b.nome).localeCompare(displayName(a.nome),'pt-BR'));
  else if (favoritesSort === 'price-asc') arr.sort((a,b)=>parsePrice(a.somenteAtacado?a.atacado:a.varejo)-parsePrice(b.somenteAtacado?b.atacado:b.varejo));
  else if (favoritesSort === 'price-desc') arr.sort((a,b)=>parsePrice(b.somenteAtacado?b.atacado:b.varejo)-parsePrice(a.somenteAtacado?a.atacado:a.varejo));
  return arr;
}

function renderFavoritesList() {
  const list = document.getElementById('favoritesList');
  const toolbar = document.getElementById('favoritesToolbar');
  const countLabel = document.getElementById('favoritesCountLabel');
  const addAllBtn = document.getElementById('btnAddAllFav');
  const titleEl = document.getElementById('favoritesTitle');
  if (!list) return;

  if (titleEl) {
    titleEl.textContent = favorites.size
      ? `♥ Meus Favoritos (${favorites.size})`
      : '♥ Meus Favoritos';
  }

  const ids = [...favorites];
  if (!ids.length) {
    list.innerHTML = '<p class="cart-empty">Nenhum produto favoritado ainda.<br><small>Toque no ♥ de qualquer produto para salvar.</small></p>';
    if (toolbar) toolbar.style.display = 'none';
    if (addAllBtn) addAllBtn.style.display = 'none';
    return;
  }
  const products = ids.map(id => findProduct(id)).filter(Boolean);
  if (!products.length) {
    list.innerHTML = '<p class="cart-empty">Nenhum produto favoritado ainda.</p>';
    if (toolbar) toolbar.style.display = 'none';
    if (addAllBtn) addAllBtn.style.display = 'none';
    return;
  }

  if (toolbar) toolbar.style.display = 'flex';
  if (countLabel) countLabel.textContent = `${products.length} item(ns)`;
  if (addAllBtn) addAllBtn.style.display = '';
  const sortSelect = document.getElementById('favoritesSort');
  if (sortSelect) sortSelect.value = favoritesSort;

  const sorted = sortFavoriteProducts(products);

  list.innerHTML = sorted.map(p => {
    const id = productId(p);
    const foto = escapeHtml(p.foto || (p.fotos && p.fotos[0]) || '');
    const disp = (p.disponivel||'').toLowerCase()==='sim';
    const priceHtml = p.somenteAtacado
      ? `<span class="price-a">R$ ${escapeHtml(p.atacado)}</span>`
      : `Varejo R$ ${escapeHtml(p.varejo)} · Atacado R$ ${escapeHtml(p.atacado)}`;
    return `<div class="cart-item">
      <img src="${foto}" alt="" width="52" height="52" data-fallback="https://via.placeholder.com/52?text=?"/>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(displayName(p.nome))}</div>
        <div class="cart-item-meta">${escapeHtml(p.brand||'')} · ${escapeHtml(p.volume||'')} ${disp?'':' · <span class="stock-out">Esgotado</span>'}</div>
        <div class="cart-item-price">${priceHtml}</div>
        <div style="display:flex;gap:.35rem;margin-top:.35rem;flex-wrap:wrap">
          <button type="button" class="btn-sm btn-details" data-fav-open="${escapeHtml(id)}">Detalhes</button>
          <button type="button" class="btn-sm btn-cart" data-fav-addcart="${escapeHtml(id)}">Carrinho</button>
          <button type="button" class="btn-sm" style="background:#fee2e2;color:#b91c1c" data-fav-remove="${escapeHtml(id)}">Remover</button>
        </div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-fav-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = findProduct(btn.dataset.favOpen);
      if (!p) return;
      closeModal('favoritesModal');
      openDetails(p);
    });
  });
  list.querySelectorAll('[data-fav-addcart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = findProduct(btn.dataset.favAddcart);
      if (p) { addToCart(p, 1); renderFavoritesList(); }
    });
  });
  list.querySelectorAll('[data-fav-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      favorites.delete(btn.dataset.favRemove);
      safeSet('fav_maquiagem', [...favorites]);
      updateFavBadge();
      const cardFav = document.querySelector(`[data-fav="${CSS.escape(btn.dataset.favRemove)}"]`);
      if (cardFav) { cardFav.classList.remove('active'); cardFav.setAttribute('aria-pressed','false'); }
      renderFavoritesList();
    });
  });
}

function addAllFavoritesToCart() {
  const ids = [...favorites];
  if (!ids.length) return;
  let added = 0;
  ids.forEach(id => {
    const p = findProduct(id);
    if (!p) return;
    if ((p.disponivel||'').toLowerCase() !== 'sim') return;
    if (Array.isArray(p.variacoes) && p.variacoes.length) {
      const v = p.variacoes.find(x => x.estoque === undefined || Number(x.estoque) > 0);
      if (v) {
        const clone = { ...p, variacaoSelecionada: { id: String(v.id || ''), nome: String(v.nome || '') } };
        addToCart(clone, 1);
        added++;
      }
    } else {
      addToCart(p, 1);
      added++;
    }
  });
  if (added) {
    showToast(`${added} item(ns) adicionado(s) ao carrinho`);
    renderFavoritesList();
  } else {
    showToast('Nenhum favorito disponível para adicionar.');
  }
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

document.getElementById('tabs')?.addEventListener('click', e => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  currentLine = btn.dataset.line || 'all';
  const dest = document.getElementById('destaquesHost');
  if (dest) dest.style.display = currentLine === 'all' ? '' : 'none';
  renderProducts(true);
});
document.getElementById('searchInput')?.addEventListener('input', e => { searchTerm=e.target.value.trim(); renderProducts(true); });
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

document.getElementById('favoritesSort')?.addEventListener('change', e => {
  favoritesSort = e.target.value || 'added';
  safeSet('fav_sort', favoritesSort);
  renderFavoritesList();
});
document.getElementById('btnAddAllFav')?.addEventListener('click', addAllFavoritesToCart);

document.getElementById('fabWhatsApp')?.addEventListener('click', () => {
  if (cartTotals().lines.length) { openCart(); return; }
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Vim pelo catálogo Empório A.R. Beauty e gostaria de atendimento.')}`,'_blank');
});
window.addEventListener('popstate', () => {
  if (document.getElementById('detailsModal')?.classList.contains('open')) closeModal('detailsModal');
});
document.addEventListener('keydown', e => {
  const openModalEl = document.querySelector('.modal.open');
  if (openModalEl) {
    if (e.key === 'Escape') {
      const id = openModalEl.id;
      if (id) closeModal(id);
    }
    if (e.key === 'Tab') {
      const focusables = openModalEl.querySelectorAll('button, [href], input, select, textarea');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  if (!document.getElementById('detailsModal')?.classList.contains('open')) return;
  if (e.key === 'ArrowRight') showDetailsAt(detailsNavIndex+1,'left');
  if (e.key === 'ArrowLeft') showDetailsAt(detailsNavIndex-1,'right');
});

function openProductFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('produto');
    if (!id) return;
    const p = findProduct(id);
    if (p) openDetails(p);
  } catch(_){}
}

const btnBackToTop = document.getElementById('btnBackToTop');
if (btnBackToTop) {
  const onScrollTop = () => {
    if (window.scrollY > 450) btnBackToTop.style.display = 'flex';
    else btnBackToTop.style.display = 'none';
  };
  window.addEventListener('scroll', onScrollTop, { passive: true });
  btnBackToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  onScrollTop();
}

updateCartBadge();
updateFavBadge();
renderDestaques();
renderProducts(true);
initSwipeDetails();
openProductFromUrl();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
