# Empório A.R. Beauty — Catálogo de Maquiagem

Catálogo estático (HTML + JS vanilla) no Netlify Free + dados em Gist (JSON) + GitHub Action para sync.

**Escopo:** somente maquiagens e cosméticos de maquiagem (bases, corretivos, batons, sombras, máscaras, pó, blush, delineadores, kits…).  
**Não** inclui perfumes, roupas ou acessórios do catálogo de perfumes.

---

## 1. Estrutura de pastas

```
catalogo-maquiagem/
├── index.html                 # UI principal (mobile-first)
├── js/
│   ├── app.js                 # Lógica do catálogo, filtros, favoritos, WhatsApp
│   └── prices.js              # Parse/validação de preços
├── scripts/
│   └── sync-catalog.mjs       # Scraper + geração do JSON (implementar site raiz)
├── .github/workflows/
│   └── sync-catalog.yml       # Action 1–2x/dia
├── assets/                    # logo.jpg, favicons, icons PWA
├── catalogo.model.json        # Modelo de dados (referência)
├── manifest.webmanifest       # PWA (raiz)
├── sw.js                      # Service Worker (raiz)
├── netlify.toml
└── README.md
```

---

## 2. Modelo de dados (Gist)

O Gist deve conter um único arquivo `catalogo.json` com esta forma:

```json
{
  "DATA": {
    "rosto": [
      {
        "cat": "Bases",
        "brand": "Marca X",
        "items": [
          {
            "nome": "Base Matte...",
            "volume": "30ml",
            "varejo": "89,90",
            "atacado": "69,90",
            "disponivel": "Sim",
            "notas": "Descrição / benefícios / tons",
            "foto": "https://...",
            "fotos": ["https://...", "https://..."],
            "badge": "NOVO"
          }
        ]
      }
    ],
    "olhos": [],
    "labios": [],
    "kits": [],
    "lancamentos": []
  },
  "WHATSAPP": "5562991134488",
  "BRAND": {
    "name": "Empório A.R. Beauty",
    "phone": "(62) 99113-4488",
    "tagline": "Maquiagem e Cosméticos — Varejo e Atacado"
  },
  "META": {
    "updated_at": "ISO-8601",
    "source": "...",
    "version": 1
  }
}
```

**Linhas sugeridas:** `rosto`, `olhos`, `labios`, `kits`, `lancamentos` (ou as que fizerem sentido no fornecedor).

**Regras de preço no front:**
- Se quantidade ≥ 6 → usa **só** preço de atacado + subtotal.
- Se quantidade < 6 → usa **só** preço de varejo + subtotal.

---

## 3. Passo a passo: GitHub → Gist → Netlify → Action

### A. Criar o repositório
1. Crie um repositório **novo** no GitHub (ex.: `catalogo-maquiagem` ou `emporio-ar-beauty`).
2. Faça upload desta pasta (ou `git init` + push).  
   **Não** misture com o repositório do catálogo de perfumes.

### B. Criar o Gist
1. Acesse https://gist.github.com e crie um Gist **secreto** ou público.
2. Nome do arquivo: `catalogo.json`
3. Cole o conteúdo de `catalogo.model.json` (ou o gerado pelo sync).
4. Copie a URL raw (ex.: `https://gist.githubusercontent.com/USER/GIST_ID/raw/catalogo.json`).
5. No `js/app.js`, substitua `GIST_CATALOG_URL` pela URL real.

### C. Deploy no Netlify
1. Conecte o repositório no Netlify (ou arraste a pasta).
2. Build settings: **Publish directory** = `.` (raiz). Sem comando de build.
3. Domínio sugerido: `emporioar-beauty.netlify.app` ou o que preferir.
4. Após o deploy, atualize o `canonical` e OG tags no `index.html`.

### D. GitHub Action (sync)
1. No repositório, vá em **Settings → Secrets and variables → Actions**.
2. Crie os secrets:
   - `GIST_ID` → ID do Gist
   - `GIST_TOKEN` → Personal Access Token com escopo `gist`
   - `SOURCE_URLS` → URLs do(s) site(s) fornecedor (separadas por vírgula)
3. Ajuste o workflow em `.github/workflows/sync-catalog.yml` quando o scraper estiver pronto.
4. Rode manualmente via **Actions → Sync Catálogo Maquiagem → Run workflow**.

---

## 4. Funcionalidades (status atual do esqueleto)

| # | Funcionalidade                          | Status      |
|---|-----------------------------------------|-------------|
| 1 | Busca por nome/marca                    | ✅ Básico   |
| 2 | Filtros (sessão, preço, disponíveis)    | ✅ Básico   |
| 3 | Cards (foto, preços, botões)            | ✅ Básico   |
| 4 | Favoritos (localStorage)                | ✅          |
| 5 | Carrinho completo                       | ⏳ TODO     |
| 6 | Modal Comprar (nome, CEP, qtd)          | ⏳ Simplificado (prompt) |
| 7 | Galeria de fotos                        | ⏳ TODO     |
| 8 | Estoque ao vivo                         | ⏳ TODO     |
| 9 | Deep link `?produto=`                   | ✅          |
|10 | Feed Google Merchant `/feed.xml`        | ⏳ TODO (function) |
|11 | PWA (manifest + sw.js na raiz)          | ✅          |
|12 | Temas sazonais                          | ⏳ TODO     |
|13 | UI mobile-first + contraste             | ✅          |
|14 | Selos NOVO/ESGOTADO                     | ✅          |
|15 | Coração favorito à direita              | ✅          |

---

## 5. Checklist de teste no celular

- [ ] Site abre rápido no 4G
- [ ] Busca funciona
- [ ] Filtros de sessão e “só disponíveis” funcionam
- [ ] Cards mostram foto, varejo e atacado
- [ ] Favorito persiste após recarregar
- [ ] Botão Comprar abre WhatsApp com mensagem correta (varejo < 6 / atacado ≥ 6)
- [ ] Deep link `?produto=marca-nome-volume` abre o produto
- [ ] PWA: “Adicionar à tela inicial” funciona
- [ ] Tema claro legível (e escuro se preferir-color-scheme)
- [ ] Não mistura produtos do catálogo de perfumes

---

## 6. Próximos passos

1. **Preencher marca final** e domínio Netlify.
2. **Informar URL(s) do site raiz** de maquiagem para implementarmos o scraper em `scripts/sync-catalog.mjs`.
3. Completar carrinho + modal Comprar + galeria.
4. Criar feed Google Merchant.
5. Adicionar logo e ícones em `/assets`.

---

WhatsApp padrão: **5562991134488**  
Dúvidas ou ajuste de regras de preço → avise.

---

## 6. Fonte de dados

**Site raiz:** https://www.makimakesoficial.com.br/

- Categorias extraídas: **Maquiagem**, **Cosméticos** e **Acessórios**
- **Excluído:** Perfumaria
- Estratégia do scraper: sitemap.xml → páginas de produto → JSON-LD (schema.org/Product)
- ~1470 produtos no sitemap

### Como rodar o sync localmente

```bash
# Teste rápido (só 30 produtos)
MAX_PRODUCTS=30 node scripts/sync-catalog.mjs

# Completo (pode demorar 15–40 min)
node scripts/sync-catalog.mjs
```

O arquivo gerado fica em `catalogo.generated.json`.  
**Importante:** revise os `PRICE_RULES` (markup varejo/atacado) no início do script antes de publicar no Gist.

---

## 7. Próximos passos

1. Definir **marca final** e domínio Netlify.
2. Ajustar **PRICE_RULES** (atualmente varejo ×1.90 (90%) e atacado ×1.50 (50%) sobre o preço do site).
3. Rodar o sync completo e revisar o JSON.
4. Criar o Gist e apontar a URL no `js/app.js`.
5. Completar carrinho + modal Comprar + galeria + feed Google.
6. Colocar logo e ícones em `/assets`.

WhatsApp padrão: **5562991134488**

---

## 8. Regras de preço (atualizado)

- **Itens vendidos em box/pack** (nome contém `24UN`, `12UN`, `Box` etc.):  
  → Mostra **somente o preço de atacado**

- **Itens vendidos na unidade**:  
  → Mostra **varejo + atacado**  
  → No WhatsApp: qtd < 6 = varejo | qtd ≥ 6 = atacado

- Markup atual: **+90% varejo** | **+50% atacado** sobre o preço do fornecedor

Repositório do projeto: https://github.com/delvandos-hash/Emp-rio-A.R-Beauty
