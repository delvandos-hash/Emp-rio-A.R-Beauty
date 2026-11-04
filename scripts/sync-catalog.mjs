/**
 * sync-catalog.mjs — MakiMakes → catalogo.public.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ... (MANTENHA TODAS AS CONSTANTES E FUNÇÕES DE SCRAPING ACIMA: SITEMAP_URL, LINE_MAP, PRICE_RULES, etc.) ...
// Vou pular a repetição do código de scraping para focar na mudança.
// (Copie o resto do script normalmente até a função main).

async function main() {
  console.log('=== Sync Catálogo ===');
  const specialMaps = {};
  for (const [key, cfg] of Object.entries(SPECIAL_GROUPS)) {
    console.log('Buscando vitrine:', cfg.title);
    specialMaps[key] = await fetchGroupSlugs(cfg.url);
    console.log(`  → ${specialMaps[key].size} produtos encontrados.`);
  }

  let urls = await getProductUrlsFromSitemap();
  for (const set of Object.values(specialMaps)) { for (const slug of set) { const full = 'https://www.makimakesoficial.com.br/' + slug; if (!urls.includes(full)) urls.push(full); } }
  if (MAX_PRODUCTS < Infinity) urls = urls.slice(0, MAX_PRODUCTS);

  console.log(`Processando ${urls.length} páginas...`);
  const raw = await runPool(urls, CONCURRENCY, (url) => processProduct(url, specialMaps));
  
  const { internal, public: publicOutput, DATA_PUBLIC } = buildOutputs(raw, SPECIAL_GROUPS);

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  
  const publicPath = path.join(dataDir, 'catalogo.public.json');
  fs.writeFileSync(publicPath, JSON.stringify(publicOutput, null, 2));
  console.log('\n✅ Arquivo local gerado:', publicPath);

  // =========================================================
  // ENVIO AUTOMÁTICO PARA O GIST (SÓ RODA NO GITHUB ACTIONS)
  // =========================================================
  const gistId = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;

  if (gistId && gistToken) {
    console.log('🚀 Enviando atualização para o Gist...');
    try {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${gistToken}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'EmpórioAR-Beauty-Action'
        },
        body: JSON.stringify({
          files: {
            'catalogo.json': {
              content: JSON.stringify(publicOutput, null, 2)
            }
          }
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }
      console.log('🎉 Gist atualizado com sucesso! O site já vai puxar os novos dados.');
    } catch (err) {
      console.error('❌ Erro ao atualizar o Gist:', err.message);
      process.exit(1); // Falha a action se não conseguir atualizar o Gist
    }
  } else {
    console.log('⚠️ GIST_ID ou GIST_TOKEN não configurados. O Gist não foi atualizado (apenas arquivo local).');
  }
}

main().catch(console.error);
