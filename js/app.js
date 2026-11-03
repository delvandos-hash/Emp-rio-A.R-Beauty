/**
 * Empório A.R. Beauty - Catálogo de Maquiagem
 * Dados: Gist (principal) + fallback local
 * Lógica adaptada do catálogo de perfumes (sem misturar dados)
 */

// Fonte principal: arquivo no próprio site (repo Netlify)
// Fallback: Gist (opcional) e depois dados embutidos
const CATALOG_URLS = [
  '/catalogo.json',                                          // Netlify / mesmo domínio
  // 'https://gist.githubusercontent.com/USER/GIST_ID/raw/catalogo.json',  // descomente se usar Gist
];

// Fallback local para desenvolvimento (poucos itens)
const LOCAL_FALLBACK = {
  DATA: {
    rosto: [
      {
        cat: "Bases",
        brand: "Exemplo",
        items: [
          {
            nome: "Base Matte Cobertura Alta",
            volume: "30ml",
            varejo: "89,90",
            atacado: "69,90",
            disponivel: "Sim",
            notas: "Acabamento matte, longa duração.",
            foto: "https://via.placeholder.com/300x300?text=Base",
            fotos: ["https://via.placeholder.com/300x300?text=Base"],
            badge: "NOVO"
          }
        ]
      }
    ],
    olhos: [],
    labios: [],
    kits: [],
    lancamentos: []
  },
  WHATSAPP: "5562991134488",
  BRAND: {
    name: "Empório A.R. Beauty",
    phone: "(62) 99113-4488",
    tagline: "Maquiagem e Cosméticos — Varejo e Atacado"
  }
};

async function loadCatalogData() {
  for (const url of CATALOG_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      const j = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (j && j.DATA) {
        console.log('Catálogo carregado de', url);
        return j;
      }
    } catch (e) {
      console.warn('Falha ao carregar', url, e);
    }
  }
  // Fallback local (só para dev)
  console.warn('Usando fallback local');
  return LOCAL_FALLBACK;
}

const dados = await loadCatalogData();
const { DATA, WHATSAPP, BRAND } = dados;

// Remove boot status
const boot = document.getElementById('bootStatus');
if (boot) boot.remove();

// ========== Helpers ==========
function parsePrice(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

function formatPrice(n) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// ========== State ==========
let currentLine = 'all';
let searchTerm = '';
let filterDisp = 'all';
let filterPreco = 'all';
const favorites = new Set(JSON.parse(localStorage.getItem('fav_maquiagem') || '[]'));

// ========== Render ==========
function getAllProducts() {
  const list = [];
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const g of groups || []) {
      for (const it of g.items || []) {
        list.push({
          ...it,
          brand: g.brand,
          cat: g.cat,
          line
        });
      }
    }
  }
  return list;
}

function matchesFilters(p) {
  // Line
  if (currentLine !== 'all' && p.line !== currentLine) return false;

  // Search
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    const hay = `${p.nome} ${p.brand} ${p.cat} ${p.volume}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  // Disponível
  const disp = (p.disponivel || '').toLowerCase() === 'sim';
  if (filterDisp === 'sim' && !disp) return false;
  if (filterDisp === 'nao' && disp) return false;

  // Preço (usa varejo)
  const preco = parsePrice(p.varejo);
  if (filterPreco === 'ate50' && preco > 50) return false;
  if (filterPreco === '50a100' && (preco < 50 || preco > 100)) return false;
  if (filterPreco === 'acima100' && preco <= 100) return false;

  return true;
}

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
          <img src="${p.foto || p.fotos?.[0] || ''}" alt="${p.nome}" loading="lazy" onerror="this.src='https://via.placeholder.com/150?text=Sem+foto'" />
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

  // Event listeners
  container.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
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
      const p = all.find(x => productId(x) === btn.dataset.details);
      if (p) openDetails(p);
    });
  });

  container.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = all.find(x => productId(x) === btn.dataset.buy);
      if (p) openBuyModal(p);
    });
  });

  container.querySelectorAll('[data-cart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = all.find(x => productId(x) === btn.dataset.cart);
      if (p) addToCart(p);
    });
  });
}

// ========== Placeholders for full features ==========
function openDetails(p) {
  alert(`Detalhes: ${p.nome}\n${p.brand} · ${p.volume}\n\n${p.notas || 'Sem descrição.'}\n\nVarejo: R$ ${p.varejo}\nAtacado: R$ ${p.atacado}`);
  // TODO: modal com galeria de fotos
}

function openBuyModal(p) {
  const qty = prompt(`Quantidade de "${p.nome}"?`, '1');
  if (!qty || isNaN(qty) || qty < 1) return;
  const q = parseInt(qty, 10);

  // Box / pack → sempre preço de atacado
  // Unidade → varejo se < 6, atacado se >= 6
  let precoUnit, tipo;
  if (p.somenteAtacado) {
    precoUnit = parsePrice(p.atacado);
    tipo = 'Atacado';
  } else {
    precoUnit = q >= 6 ? parsePrice(p.atacado) : parsePrice(p.varejo);
    tipo = q >= 6 ? 'Atacado' : 'Varejo';
  }

  const subtotal = precoUnit * q;
  const msg = encodeURIComponent(
    `*Pedido Empório A.R. Beauty*\n\n` +
    `*${p.nome}*\n` +
    `${p.brand} · ${p.volume || ''}\n` +
    `Qtd: ${q}\n` +
    `Preço (${tipo}): R$ ${formatPrice(precoUnit)}\n` +
    `Subtotal: R$ ${formatPrice(subtotal)}\n\n` +
    `Nome:\nCEP:`
  );
  window.open(`https://wa.me/${WHATSAPP}?text=${msg}`, '_blank');
}

function addToCart(p) {
  // TODO: implementar carrinho completo com localStorage
  alert(`Adicionado ao carrinho: ${p.nome}\n(Funcionalidade de carrinho completa em breve)`);
}

// ========== Events ==========
document.getElementById('tabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  currentLine = btn.dataset.line || 'all';
  renderProducts();
});

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  renderProducts();
});

document.getElementById('filterDisponivel')?.addEventListener('change', (e) => {
  filterDisp = e.target.value;
  renderProducts();
});

document.getElementById('filterPreco')?.addEventListener('change', (e) => {
  filterPreco = e.target.value;
  renderProducts();
});

// Deep link
function openProductFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('produto');
    if (!id) return;
    const p = getAllProducts().find(x => productId(x) === id);
    if (p) openDetails(p);
  } catch (e) {}
}

// Init
renderProducts();
openProductFromUrl();

// Service Worker registration (PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
