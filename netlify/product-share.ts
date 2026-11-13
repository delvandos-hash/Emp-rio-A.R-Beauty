function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSlug(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productSlugBase(product: any): string {
  return (
    [normalizeSlug(product?.nome), normalizeSlug(product?.brand), normalizeSlug(product?.volume)]
      .filter(Boolean)
      .join("-") || normalizeSlug(product?.public_id)
  );
}

function findProduct(data: any, routeKey: string): any | null {
  if (!data || typeof data !== "object") return null;
  const products: any[] = [];
  for (const groups of Object.values(data)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups as any[]) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        products.push({ ...item, brand: group?.brand || item?.brand || "", cat: group?.cat || "" });
      }
    }
  }

  const key = routeKey.toLowerCase();

  // Compatibilidade com links antigos por productId (brand-nome-volume)
  const byLegacyId = products.find((product) => {
    const id = [normalizeSlug(product?.brand), normalizeSlug(product?.nome), normalizeSlug(product?.volume)]
      .filter(Boolean)
      .join("-");
    return id === key;
  });
  if (byLegacyId) return byLegacyId;

  const counts = new Map<string, number>();
  for (const product of products) {
    const base = productSlugBase(product);
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  for (const product of products) {
    const base = productSlugBase(product);
    const suffix =
      normalizeSlug(product?.public_id).slice(-6) ||
      normalizeSlug(product?.nome).slice(-6) ||
      "item";
    const slug = counts.get(base)! > 1 ? `${base}-${suffix}` : base;
    if (slug === key) return product;
  }
  return null;
}

function setMeta(html: string, attribute: string, key: string, value: string): string {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, "i");
  const replacement = `<meta ${attribute}="${key}" content="${escaped}" />`;
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace("</head>", `  ${replacement}\n</head>`);
}

function setCanonical(html: string, url: string): string {
  const replacement = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  const pattern = new RegExp("<link[^>]*canonical[^>]*>", "i");
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `  ${replacement}\n</head>`);
}

export default async (request: Request, context: any) => {
  const response = await context.next();
  if (!response.ok) return response;

  const url = new URL(request.url);
  const match = url.pathname.match(new RegExp("^/p/([^/]+)/?$"));
  if (!match) return response;

  let routeKey = "";
  try {
    routeKey = decodeURIComponent(match[1]);
  } catch {
    return response;
  }
  if (!routeKey || routeKey.length > 180) return response;

  try {
    // Prefer local public catalog; fallback to Gist raw
    const candidates = [
      new URL("/catalogo.json", url.origin).toString(),
      "https://gist.githubusercontent.com/delvandos-hash/081d1d5efa2e2003cf859964a650dfb5/raw/catalogo.json",
    ];

    let payload: any = null;
    for (const catalogUrl of candidates) {
      try {
        const catalogResponse = await fetch(catalogUrl, {
          headers: { Accept: "application/json" },
        });
        if (!catalogResponse.ok) continue;
        const text = (await catalogResponse.text()).replace(/^\uFEFF/, "");
        const json = JSON.parse(text);
        if (json?.DATA && Object.keys(json.DATA).length) {
          payload = json;
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!payload) return response;

    const product = findProduct(payload.DATA, routeKey);
    if (!product) return response;

    const productUrl = new URL(`/p/${encodeURIComponent(routeKey)}`, url.origin).toString();
    const rawImage = String(product.foto || product.fotos?.[0] || "/assets/logo.jpg");
    let imageUrl: string;
    try {
      const parsed = new URL(rawImage, url.origin);
      // Allow same-origin assets and known product CDN
      if (
        parsed.origin === url.origin ||
        parsed.hostname.endsWith("makimakes.jetassets.com.br") ||
        parsed.hostname.endsWith("makimakesoficial.com.br") ||
        parsed.hostname === "via.placeholder.com"
      ) {
        imageUrl = parsed.toString();
      } else {
        imageUrl = new URL("/assets/logo.jpg", url.origin).toString();
      }
    } catch {
      imageUrl = new URL("/assets/logo.jpg", url.origin).toString();
    }

    const title = `${product.nome || "Produto"} | Empório A.R. Beauty`;
    const details = [
      product.brand,
      product.volume && product.volume !== "—" ? product.volume : "",
      product.varejo ? `Varejo: R$ ${product.varejo}` : "",
      product.atacado && product.atacado !== "—" ? `Atacado (6+): R$ ${product.atacado}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const description = details
      ? `${details}. Confira este produto no catálogo Empório A.R. Beauty.`
      : `Confira ${product.nome || "este produto"} no catálogo Empório A.R. Beauty.`;

    let html = await response.text();
    html = html.replace(new RegExp("<title>[^<]*</title>", "i"), "<title>" + escapeHtml(title) + "</title>");
    html = setMeta(html, "property", "og:title", title);
    html = setMeta(html, "property", "og:description", description);
    html = setMeta(html, "property", "og:url", productUrl);
    html = setMeta(html, "property", "og:image", imageUrl);
    html = setMeta(html, "property", "og:image:alt", `Foto de ${product.nome || "produto"}`);
    html = setMeta(html, "name", "twitter:card", "summary_large_image");
    html = setMeta(html, "name", "twitter:title", title);
    html = setMeta(html, "name", "twitter:description", description);
    html = setMeta(html, "name", "twitter:image", imageUrl);
    html = setCanonical(html, productUrl);

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
};
