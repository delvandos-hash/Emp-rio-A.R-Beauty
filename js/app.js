/**
 * Loader de teste — app multifoto (zlib+base64 em 3 partes)
 * branch: test/variacao-multifoto-v2
 * Multi-seleção de variações + troca de foto ao clicar em cada uma.
 */
async function loadApp() {
  const parts = await Promise.all(
    [1,2,3].map(i => fetch('/js/app.b64.' + i + '.txt', { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('Falha part ' + i + ': ' + r.status);
      return r.text();
    }))
  );
  const b64 = parts.join('').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  let src = new TextDecoder().decode(ab);
  src = src.replace(/from\s+['"]\.\/prices\.js['"]/, "from '/js/prices.js'");
  const blob = new Blob([src], { type: 'text/javascript' });
  await import(URL.createObjectURL(blob));
}
loadApp().catch((e) => {
  console.error('[multifoto-v2]', e);
  const el = document.getElementById('bootStatus');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<p style="padding:1rem;color:#b91c1c">Erro no app de teste (multifoto): ' + (e && e.message) + '</p>';
  }
});
