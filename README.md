# Empório A.R. Beauty — Catálogo de Maquiagem

Catálogo estático (HTML + JS vanilla) no Netlify Free + dados no Gist (JSON) + GitHub Action para sync.

## Regras de preço (FONTE ÚNICA DA VERDADE)

| Grupo | varejoMarkup | atacadoMarkup |
|---|---|---|
| **Padrão** (todos os demais) | **2.5** | **2.0** |
| **`lojas10`** (Lojas de R$10,00) | **1.8** | **1.5** |
| **`ofertasLimitadas`** (Ofertas por tempo limitado) | **1.8** | **1.5** |

- `somenteAtacado: true` (box/pack) → exibe **só** atacado.
- `qty >= 6` → atacado; `qty < 6` → varejo (por item, não por carrinho).

Implementado em `scripts/sync-catalog.mjs` (`PRICE_RULES`, `SPECIAL_PRICE_RULES`). **Não duplicar** em README/JSON público.

## Estrutura

```text
catalogo-maquiagem/
├── index.html
├── js/
│   ├── app.js
│   └── prices.js
├── scripts/
│   └── sync-catalog.mjs
├── netlify/functions/
│   ├── feed.js
│   └── stock.js
├── assets/
├── data/                      # gitignored — não publicar
│   ├── catalogo.generated.json   (interno, com custo/markup)
│   ├── catalogo.public.json      (publicar no Gist + /catalogo.json)
│   └── linhas/*.json             (split por linha, lazy-load)
├── manifest.webmanifest
├── sw.js
├── netlify.toml
├── robots.txt
├── sitemap.xml
└── README.md

## Status das funcionalidades

| # | Funcionalidade | Status |
|---|---|---|
| 1 | Busca por nome/marca | ✅ |
| 2 | Filtros (sessão, preço, disponíveis, marca) | ✅ |
| 3 | Cards (foto, preços, botões) | ✅ |
| 4 | Favoritos (localStorage seguro) | ✅ |
| 5 | Carrinho completo (add/remove/qty/subtotal) | ✅ |
| 6 | Modal Comprar (qtd/nome/CEP validados) | ✅ |
| 7 | Galeria de fotos (thumbs no modal) | ✅ |
| 8 | Estoque ao vivo (`stock.js` allowlist) | ✅ |
| 9 | Deep link `?produto=` + canonical/og dinâmicos | ✅ |
| 10 | Feed Google Merchant `/feed.xml` | ✅ (env `GIST_CATALOG_URL`) |
| 11 | PWA (manifest + sw.js) | ✅ |
| 12 | Temas sazonais | ⏳ |
| 13 | UI mobile-first + contraste | ✅ |
| 14 | Selos NOVO/ESGOTADO/R$10/OFERTA | ✅ |
| 15 | Coração favorito à direita | ✅ |
| 16 | CSP + headers de segurança | ✅ |
| 17 | Acessibilidade (aria, focus trap) | ✅ |

## Segurança

- `catalogo.public.json` (Gist + `/catalogo.json`) **não** contém `basePrice`, `price_rules` nem `sourceUrl`.
- `catalogo.generated.json` completo fica em `data/` (gitignored).
- CSP restritiva em `netlify.toml`; `onerror` inline removido.
- `stock.js` com allowlist de host.
- `localStorage` com `try/catch` (não quebra com dado corrompido).
- JSON-LD com `</script>` escapado e `price` BRL.

## SEO

- `sitemap.xml` lista **apenas a home** (não há páginas de produto).
- `canonical`/`og:*` atualizados dinamicamente em `?produto=`.
- **SEO de produto = 0** até haver prerender. Documentado.
- JSON-LD `Product` injetado client-side com `price` BRL e escape de `</script>`.
- Feed Merchant real em `/feed.xml` (quando `GIST_CATALOG_URL` configurado).

## Env vars no Netlify

| Variável | Uso |
|---|---|
| `GIST_CATALOG_URL` | URL raw do `catalogo.public.json` no Gist (usada pelo `feed.js`) |
| `SITE_URL` | `https://emporioar-beauty.netlify.app` (links do feed) |

## Sync local

```bash
# Teste rápido (30 produtos)
MAX_PRODUCTS=30 node scripts/sync-catalog.mjs

# Completo
node scripts/sync-catalog.mjs

---

## 📄 10. `docs/HOMOLOGACAO.md`

```markdown
# Homologação — Empório A.R. Beauty

Executar **após** aplicar os patches e rodar `node scripts/sync-catalog.mjs`.

| # | Teste | Como validar | Critério de aceite | Evidência |
|---|---|---|---|---|
| 1 | Preço padrão | Produto fora de Lojas/Ofertas, qtd 5 e 6 | 5→varejo, 6→atacado; valores = `basePrice × 2.5 / × 2.0` | print WhatsApp + print JSON |
| 2 | Preço Lojas R$10 | Item `badge: "LOJAS R$10"`, qtd 5 e 6 | 5→varejo, 6→atacado; valores = `basePrice × 1.8 / × 1.5` | print + JSON |
| 3 | Preço Ofertas | Item `badge: "OFERTA"`, qtd 5 e 6 | idem 1.8/1.5 | print + JSON |
| 4 | Box/pack | Item `somenteAtacado: true` | Exibe **só** atacado; WhatsApp envia só atacado | print |
| 5 | WhatsApp mensagem | Item único qtd 6 | Mensagem contém `(Atacado)` e `Subtotal` corretos | print WhatsApp |
| 6 | Carrinho consolidado | 3 itens, mix de faixas | Subtotal = soma dos `lineTotal`; WhatsApp lista todos | print |
| 7 | CEP inválido | Checkout com `123` | Toast "CEP inválido"; não abre WhatsApp | print |
| 8 | Nome vazio | Checkout sem nome | Toast "Informe seu nome" | print |
| 9 | Deep link | `?produto=...` | Abre modal, canonical/og atualizados | DevTools Elements |
| 10 | Navegação ‹ › | Abrir produto e navegar | URL `?produto=` muda a cada ‹ › | DevTools URL |
| 11 | Voltar browser | Abrir modal, clicar voltar | Fecha modal e restaura URL | vídeo |
| 12 | Offline | DevTools → Offline | Home carrega do SW; catálogo do precache | print |
| 13 | JSON-LD | Ver `<head>` após abrir produto | `Product` com `price: "89,90"`, sem `</script>` injetado | print |
| 14 | CSP | Console | Sem erros de CSP; imagens carregam | print console |
| 15 | Lighthouse mobile | Home + produto | Performance ≥ 70, A11y ≥ 90, SEO ≥ 90 | PDF Lighthouse |
| 16 | Feed | `curl -I /feed.xml` | 200 + `<item>` com `g:id`, `g:price`, `g:availability` | print curl |
| 17 | Sitemap | `curl /sitemap.xml` | Válido, só home (documentado) | print |
| 18 | `catalogo.json` público | `curl /catalogo.json` | **Sem** `basePrice`, **sem** `price_rules`, **sem** `sourceUrl` | print |

## Google Search Console e Merchant Center

Guia completo: [`docs/GOOGLE_SETUP.md`](docs/GOOGLE_SETUP.md)

| Recurso | URL |
|---------|-----|
| Sitemap | https://emporioar-beauty.netlify.app/sitemap.xml |
| Robots | https://emporioar-beauty.netlify.app/robots.txt |
| Feed Merchant | https://emporioar-beauty.netlify.app/feed.xml |

Env no Netlify: `GIST_CATALOG_URL` + `SITE_URL`.

