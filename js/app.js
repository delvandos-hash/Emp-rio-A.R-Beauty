/**
 * Bootstrap: carrega app.js estável do GitHub e aplica seleção única nas variações.
 */
import { parsePrice, formatPriceBR as formatPrice } from './prices.js';

const GOOD_APP_URL = 'https://raw.githubusercontent.com/delvandos-hash/Emp-rio-A.R-Beauty/824a3f96b4/js/app.js';

async function boot() {
  const res = await fetch(GOOD_APP_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar app base: ' + res.status);
  let src = await res.text();

  src = src.replace(
    /from\s+['"]\.\/prices\.js['"]/,
    "from '/js/prices.js'"
  );

  const oldStart = 'function bindVariacaoSelector(p) {';
  const oldIdx = src.indexOf(oldStart);
  if (oldIdx < 0) {
    console.error('bindVariacaoSelector não encontrado no app base');
  } else {
    const after = src.slice(oldIdx + oldStart.length);
    let depth = 1, i = 0;
    for (; i < after.length && depth > 0; i++) {
      const ch = after[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const newFn = `
function bindVariacaoSelector(p) {
  const box = document.getElementById('variacoesBox');
  if (!box) return;
  let selectedId = null;
  const vars = Array.isArray(p.variacoes) ? p.variacoes : [];

  const refresh = () => {
    const chips = box.querySelectorAll('.var-chip');
    chips.forEach(chip => {
      const id = chip.getAttribute('data-var-id');
      const on = selectedId != null && id === selectedId;
      chip.classList.toggle('selected', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const btn = document.getElementById('btnAddMulti');
    const count = document.getElementById('multiCount');
    const hint = document.getElementById('varHint');
    if (btn) btn.style.display = selectedId ? '' : 'none';
    if (count) count.textContent = selectedId ? '1' : '0';
    if (hint) {
      if (selectedId) {
        const v = vars.find(x => String(x.id || x.nome) === selectedId);
        const nome = (v && v.nome) || selectedId;
        hint.textContent = 'Opção selecionada: ' + nome;
        hint.classList.add('ok');
      } else {
        hint.textContent = 'Toque numa opção para ver a foto e selecionar';
        hint.classList.remove('ok');
      }
    }
    if (selectedId) {
      const v = vars.find(x => String(x.id || x.nome) === selectedId) || null;
      p.variacaoSelecionada = v
        ? { id: String(v.id || v.nome || ''), nome: String(v.nome || ''), foto: v.foto || '' }
        : { id: selectedId, nome: selectedId, foto: '' };
      const foto = resolveVariationPhoto(p, v || { nome: selectedId });
      if (foto) applyDetailsPhoto(foto, (v && v.nome) || displayName(p.nome));
    } else {
      p.variacaoSelecionada = null;
      const base = p.foto || (p.fotos && p.fotos[0]) || '';
      if (base) applyDetailsPhoto(base, displayName(p.nome));
    }
  };

  box.querySelectorAll('.var-chip:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-var-id');
      selectedId = (selectedId === id) ? null : id;
      refresh();
    });
  });

  document.getElementById('btnAddMulti')?.addEventListener('click', () => {
    if (!selectedId) return;
    const v = vars.find(x => String(x.id || x.nome) === selectedId);
    if (!v) return;
    const fotoVar = resolveVariationPhoto(p, v);
    const clone = {
      ...p,
      foto: fotoVar || p.foto,
      fotos: fotoVar ? [fotoVar] : p.fotos,
      variacaoSelecionada: { id: String(v.id || ''), nome: String(v.nome || ''), foto: fotoVar || '' }
    };
    addToCart(clone, 1);
    showToast('Adicionado: ' + (v.nome || displayName(p.nome)));
  });

  const pNome = String(p.nome || '').toUpperCase();
  const match = vars.find(v => {
    const n = String(v.nome || '').toUpperCase();
    return n && pNome.includes(n);
  });
  if (match) selectedId = String(match.id || match.nome);
  refresh();
}
`;
    src = src.slice(0, oldIdx) + newFn + after.slice(i);
  }

  src = src.replace('Escolha as opções (pode marcar várias)', 'Escolha a opção / fragrância');
  src = src.replace('Selecione uma ou mais opções disponíveis', 'Toque numa opção para ver a foto e selecionar');
  src = src.replace('🛒 Adicionar <span id="multiCount">0</span> opção(ões) ao carrinho', '🛒 Adicionar opção ao carrinho');

  const blob = new Blob([src], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  await import(url);
}

boot().catch((err) => {
  console.error(err);
  const bootEl = document.getElementById('bootStatus');
  if (bootEl) {
    bootEl.style.display = 'block';
    bootEl.innerHTML = '<p style="padding:1rem;color:#b91c1c">Erro ao carregar o catálogo. Atualize a página ou restaure js/app.js no GitHub.</p>';
  }
});
