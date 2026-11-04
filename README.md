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
