/**
 * Empório A.R. Beauty - Catálogo de Maquiagem
 * Carrinho completo + Modal Comprar (nome, CEP, qtd)
 */

const CATALOG_URLS = ['/catalogo.json'];

const LOCAL_FALLBACK = {
  DATA: { rosto: [], olhos: [], labios: [], corpo: [], cabelo: [], acessorios: [] },
  WHATSAPP: '5562991134488',
  BRAND: { name: 'Empório A.R. Beauty', phone: '(62) 99113-4488', tagline: 'Maquiagem e Cosméticos — Varejo e Atacado' }
};

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

const boot = document.getElementById('bootStatus');
if (boot) boot.remove();

// ========== Helpers ==========
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

function unitPrice(p, qty) {
  if (p.somenteAtacado) return { price: parsePrice(p.atacado), tipo: 'Atacado' };
  if (qty >= 6) return { price: parsePrice(p.atacado), tipo: 'Atacado' };
  return { price: parsePrice(p.varejo), tipo: 'Varejo' };
}

// ========== State ==========
let currentLine = 'all';
let searchTerm = '';
let filterDisp = 'all';
let filterPreco = 'all';
const favorites = new Set(JSON.parse(localStorage.getItem('fav_maquiagem') || '[]'));

// Carrinho: { [id]: { product, qty } }
let cart = JSON.parse(localStorage.getItem('cart_maquiagem') || '{}');

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

// ========== Products ==========
function getAllProducts() {
  const list = [];
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const g of groups || []) {
      for (const it of g.items || []) {
        list.push({ ...it, brand: g.brand, cat: g.cat, line });
      }
    }
  }
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

// ========== Render products ==========
function renderProducts() {
  const container = document.getElementById('products');
  const empty = document.getElementById('empty');
  const all = getAllProducts().filter(matchesFilters);

  if (all.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.style.display = 'grid';
  container.innerHTML = all.map(p => {
    const id = productId(p);
    const isFav = favorites.has(id);
    const disponivel = (p.disponivel || '').toLowerCase() === 'sim';
    const isNovo = (p.badge || '').toUpperCase().includes('NOVO');

    return `
      <article class="card" data-id="${id}">
        <button class="fav ${isFav ? 'active' : ''}" data-fav="${id}" aria-label="Favoritar">♥</button>
        <div class="photo">
          ${isNovo ? '<span class="badge-novo">NOVO</span>' : ''}
          ${!disponivel ? '<span class="badge-esgotado">ESGOTADO</span>' : ''}
          <img src="${p.foto || p.fotos?.[0] || ''}" alt="${p.nome}" loading="lazy"
               onerror="this.src='https://via.placeholder.com/150?text=Sem+foto'" />
        </div>
        <div class="info">
          <div class="name">${p.nome}</div>
          <div class="meta">${p.brand} · ${p.volume || ''} · ${p.cat || ''}</div>
          <div class="prices">
            ${p.somenteAtacado ? `
              <div>
                <span class="price-label">Atacado</span>
                <span class="price-a">R$ ${p.atacado}</span>
              </div>
            ` : `
              <div>
                <span class="price-label">Varejo</span>
                <span class="price-v">R$ ${p.varejo}</span>
              </div>
              <div>
                <span class="price-label">Atacado (6+)</span>
                <span class="price-a">R$ ${p.atacado}</span>
              </div>
            `}
          </div>
          <div class="card-actions">
            <button class="btn-sm btn-details" data-details="${id}">Detalhes</button>
            <button class="btn-sm btn-cart" data-cart="${id}">Carrinho</button>
            <button class="btn-sm btn-buy" data-buy="${id}">Comprar</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.fav;
      if (favorites.has(id)) {
        favorites.delete(id);
        btn.classList.remove('active');
      } else {
        favorites.add(id);
        btn.classList.add('active');
      }
      localStorage.setItem('fav_maquiagem', JSON.stringify([...favorites]));
    });
  });

  container.querySelectorAll('[data-details]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = findProduct(btn.dataset.details);
      if (p) openDetails(p);
    });
  });

  container.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = findProduct(btn.dataset.buy);
      if (p) openBuyModal(p);
    });
  });

  container.querySelectorAll('[data-cart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = findProduct(btn.dataset.cart);
      if (p) addToCart(p, 1);
    });
  });
}

// ========== Cart ==========
function addToCart(p, qty = 1) {
  const id = productId(p);
  if (cart[id]) {
    cart[id].qty += qty;
  } else {
    cart[id] = { product: p, qty };
  }
  saveCart();
  showToast(`Adicionado: ${p.nome.slice(0, 40)}${p.nome.length > 40 ? '…' : ''}`);
}

function removeFromCart(id) {
  delete cart[id];
  saveCart();
  renderCart();
}

function setCartQty(id, qty) {
  qty = parseInt(qty, 10);
  if (!qty || qty < 1) {
    removeFromCart(id);
    return;
  }
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
  let subtotal = 0;
  let totalItems = 0;
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

function renderCart() {
  const panel = document.getElementById('cartPanel');
  const list = document.getElementById('cartList');
  const summary = document.getElementById('cartSummary');
  if (!panel || !list) return;

  const { subtotal, totalItems, lines } = cartTotals();

  if (lines.length === 0) {
    list.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.</p>';
    summary.innerHTML = '';
    return;
  }

  list.innerHTML = lines.map(({ id, p, qty, price, tipo, lineTotal }) => `
    <div class="cart-item">
      <img src="${p.foto || ''}" alt="" onerror="this.style.display='none'" />
      <div class="cart-item-info">
        <div class="cart-item-name">${p.nome}</div>
        <div class="cart-item-meta">${p.brand} · ${p.volume || ''} · ${tipo}</div>
        <div class="cart-item-price">R$ ${formatPrice(price)} × 
          <input type="number" min="1" value="${qty}" data-qty="${id}" class="cart-qty" />
          = <strong>R$ ${formatPrice(lineTotal)}</strong>
        </div>
      </div>
      <button class="cart-remove" data-remove="${id}" aria-label="Remover">✕</button>
    </div>
  `).join('');

  summary.innerHTML = `
    <div class="cart-total">
      <span>${totalItems} item(ns)</span>
      <strong>Total: R$ ${formatPrice(subtotal)}</strong>
    </div>
    <div class="cart-actions">
      <button type="button" class="btn-outline" id="btnClearCart">Limpar pedido</button>
      <button type="button" class="btn-wa" id="btnCheckout">Finalizar no WhatsApp</button>
    </div>
  `;

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.remove));
  });
  list.querySelectorAll('[data-qty]').forEach(inp => {
    inp.addEventListener('change', () => setCartQty(inp.dataset.qty, inp.value));
  });
  document.getElementById('btnClearCart')?.addEventListener('click', () => {
    if (confirm('Limpar todo o pedido?')) clearCart();
  });
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
  document.body.style.overflow = '';
}

function openCartCheckout() {
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;

  // Preenche o modal de checkout do carrinho
  const modal = document.getElementById('checkoutModal');
  const summaryEl = document.getElementById('checkoutSummary');
  if (summaryEl) {
    summaryEl.innerHTML = lines.map(l =>
      `• ${l.p.nome.slice(0, 40)} — ${l.qty}x R$ ${formatPrice(l.price)} (${l.tipo}) = R$ ${formatPrice(l.lineTotal)}`
    ).join('<br>') + `<br><br><strong>Total (${totalItems} itens): R$ ${formatPrice(subtotal)}</strong>`;
  }
  modal.dataset.mode = 'cart';
  openModal('checkoutModal');
  closeCart();
}

// ========== Buy modal (single product) ==========
let buyProduct = null;

function openBuyModal(p) {
  buyProduct = p;
  const modal = document.getElementById('buyModal');
  document.getElementById('buyProductName').textContent = p.nome;
  document.getElementById('buyProductMeta').textContent = `${p.brand} · ${p.volume || ''} · ${p.cat || ''}`;
  document.getElementById('buyQty').value = '1';
  updateBuyPricePreview();
  openModal('buyModal');
}

function updateBuyPricePreview() {
  if (!buyProduct) return;
  const qty = parseInt(document.getElementById('buyQty')?.value || '1', 10) || 1;
  const { price, tipo } = unitPrice(buyProduct, qty);
  const el = document.getElementById('buyPricePreview');
  if (el) {
    el.innerHTML = `
      <span class="price-tipo">${tipo}</span>
      <span class="price-unit">R$ ${formatPrice(price)} / un</span>
      <strong class="price-sub">Subtotal: R$ ${formatPrice(price * qty)}</strong>
    `;
  }
}

function confirmBuy() {
  if (!buyProduct) return;
  const nome = document.getElementById('buyNome')?.value?.trim() || '';
  const cep = document.getElementById('buyCep')?.value?.trim() || '';
  const qty = parseInt(document.getElementById('buyQty')?.value || '1', 10) || 1;

  const { price, tipo } = unitPrice(buyProduct, qty);
  const subtotal = price * qty;

  let msg = `*Pedido Empório A.R. Beauty*\n\n`;
  msg += `*${buyProduct.nome}*\n`;
  msg += `${buyProduct.brand} · ${buyProduct.volume || ''}\n`;
  msg += `Qtd: ${qty}\n`;
  msg += `Preço (${tipo}): R$ ${formatPrice(price)}\n`;
  msg += `Subtotal: R$ ${formatPrice(subtotal)}\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep}\n`;

  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
  closeModal('buyModal');
}

function confirmCartCheckout() {
  const nome = document.getElementById('checkoutNome')?.value?.trim() || '';
  const cep = document.getElementById('checkoutCep')?.value?.trim() || '';
  const { lines, subtotal, totalItems } = cartTotals();
  if (!lines.length) return;

  let msg = `*Pedido Empório A.R. Beauty*\n\n`;
  for (const l of lines) {
    msg += `• *${l.p.nome}*\n`;
    msg += `  ${l.p.brand} · ${l.p.volume || ''} — ${l.qty}x R$ ${formatPrice(l.price)} (${l.tipo}) = R$ ${formatPrice(l.lineTotal)}\n\n`;
  }
  msg += `*Total (${totalItems} itens): R$ ${formatPrice(subtotal)}*\n\n`;
  if (nome) msg += `Nome: ${nome}\n`;
  if (cep) msg += `CEP: ${cep}\n`;

  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
  closeModal('checkoutModal');
}

// ========== Details (simple for now) ==========
function openDetails(p) {
  const fotos = (p.fotos && p.fotos.length) ? p.fotos : (p.foto ? [p.foto] : []);
  const fotosHtml = fotos.map(f => `<img src="${f}" alt="" style="max-width:100%;border-radius:8px;margin:4px 0" />`).join('');
  const precoHtml = p.somenteAtacado
    ? `<p><strong>Atacado:</strong> R$ ${p.atacado}</p>`
    : `<p><strong>Varejo:</strong> R$ ${p.varejo}<br><strong>Atacado (6+):</strong> R$ ${p.atacado}</p>`;

  document.getElementById('detailsContent').innerHTML = `
    <h3>${p.nome}</h3>
    <p class="meta">${p.brand} · ${p.volume || ''} · ${p.cat || ''}</p>
    ${precoHtml}
    <p style="margin:12px 0;white-space:pre-wrap">${p.notas || 'Sem descrição adicional.'}</p>
    <div class="details-gallery">${fotosHtml}</div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn-sm btn-cart" id="detailsAddCart">Carrinho</button>
      <button class="btn-sm btn-buy" id="detailsBuy">Comprar</button>
    </div>
  `;
  document.getElementById('detailsAddCart')?.addEventListener('click', () => {
    addToCart(p, 1);
    closeModal('detailsModal');
  });
  document.getElementById('detailsBuy')?.addEventListener('click', () => {
    closeModal('detailsModal');
    openBuyModal(p);
  });
  openModal('detailsModal');
}

// ========== Modal helpers ==========
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  // only restore scroll if no other modal/cart open
  if (!document.querySelector('.modal.open, #cartPanel.open')) {
    document.body.style.overflow = '';
  }
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ========== Events ==========
document.getElementById('tabs')?.addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  currentLine = btn.dataset.line || 'all';
  renderProducts();
});

document.getElementById('searchInput')?.addEventListener('input', e => {
  searchTerm = e.target.value.trim();
  renderProducts();
});

document.getElementById('filterDisponivel')?.addEventListener('change', e => {
  filterDisp = e.target.value;
  renderProducts();
});

document.getElementById('filterPreco')?.addEventListener('change', e => {
  filterPreco = e.target.value;
  renderProducts();
});

document.getElementById('btnOpenCart')?.addEventListener('click', openCart);
document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
document.getElementById('btnCloseCart')?.addEventListener('click', closeCart);

document.getElementById('buyQty')?.addEventListener('input', updateBuyPricePreview);
document.getElementById('btnConfirmBuy')?.addEventListener('click', confirmBuy);
document.getElementById('btnConfirmCheckout')?.addEventListener('click', confirmCartCheckout);

// Close modals on backdrop / X
document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', () => closeModal(el.dataset.close));
});

// Deep link
function openProductFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('produto');
    if (!id) return;
    const p = findProduct(id);
    if (p) openDetails(p);
  } catch (e) {}
}

// Init
updateCartBadge();
renderProducts();
openProductFromUrl();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
