# Google Search Console + Merchant Center — Empório A.R. Beauty

## 1. Variáveis no Netlify

Site settings → Environment variables:

| Variável | Valor |
|----------|--------|
| `GIST_CATALOG_URL` | URL raw do `catalogo.json` público no Gist |
| `SITE_URL` | `https://emporioar-beauty.netlify.app` |

Sem `GIST_CATALOG_URL` o feed responde **501** (proposital).

## 2. Google Search Console

1. https://search.google.com/search-console
2. Adicionar propriedade **URL prefix**: `https://emporioar-beauty.netlify.app`
3. Verificação:
   - **Arquivo HTML**: baixe o arquivo do Google, coloque na raiz do projeto (substitua `google-site-verification.html`) e faça deploy; **ou**
   - **Meta tag**: cole a meta no `<head>` do `index.html`
4. Após verificar:
   - Envie o sitemap: `https://emporioar-beauty.netlify.app/sitemap.xml`
   - Use a ferramenta de inspeção de URL na home

**Nota SEO:** o catálogo é SPA. Produtos usam `?produto=id` (deep link). O sitemap lista só a home. JSON-LD de produto é injetado no cliente ao abrir o modal.

## 3. Google Merchant Center

1. https://merchants.google.com
2. Conta / país: Brasil · moeda: BRL
3. **Produtos → Feeds → Adicionar feed**
4. Método: **Agendado / URL do feed**
5. URL do feed:
   ```
   https://emporioar-beauty.netlify.app/feed.xml
   ```
6. Frequência sugerida: diária
7. Após o primeiro fetch, corrija avisos (GTIN, imagem, título)

### Campos do feed

| Campo | Origem |
|-------|--------|
| `g:id` | brand + nome + volume (normalizado) |
| `g:title` | nome do produto |
| `g:description` | notas ou nome |
| `g:link` | `/?produto=ID` |
| `g:image_link` | foto |
| `g:price` | `12.99 BRL` (ponto decimal) |
| `g:availability` | in_stock / out_of_stock |
| `g:brand` | marca |
| `g:condition` | new |
| `g:gtin` | quando existir no catálogo |
| `g:identifier_exists` | false se não houver GTIN |

### Teste rápido do feed

```bash
curl -sI "https://emporioar-beauty.netlify.app/feed.xml"
curl -s "https://emporioar-beauty.netlify.app/feed.xml" | head -40
```

Esperado: HTTP 200 e XML com `<g:price>12.99 BRL</g:price>` (ponto, não vírgula).

## 4. Checklist pré-deploy

- [ ] `GIST_CATALOG_URL` e `SITE_URL` configuradas no Netlify
- [ ] `catalogo.json` público **sem** `basePrice` / `sourceUrl`
- [ ] `/feed.xml` responde 200 após deploy
- [ ] `/sitemap.xml` e `/robots.txt` acessíveis
- [ ] Search Console verificado + sitemap enviado
- [ ] Merchant Center com feed agendado
