/**
 * Sanitiza URLs de imagem do Beauty para o proxy público.
 * Nunca expõe o domínio da CDN/loja raiz no HTML/JSON do cliente.
 */
const ALLOWED_CDN_HOSTS = new Set(["makimakes.jetassets.com.br"]);
const PROXY_PREFIX = "/api/product-image";

export function normalizeImagePath(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw */
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "";
  if (decoded.includes("..") || decoded.includes("\\") || decoded.includes("?") || decoded.includes("#")) return "";
  if (decoded.length > 1024) return "";
  // Apenas caminhos de produto da CDN conhecida
  if (!decoded.startsWith("/produto/")) return "";
  return decoded;
}

/**
 * Converte URL absoluta da CDN ou path relativo em URL de proxy same-origin.
 * @returns {string} ex: /api/product-image?source=m&path=%2Fproduto%2Fxxx.png
 */
export function sanitizePublicImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const raw = value.trim();

  // Já é proxy
  if (raw.startsWith(PROXY_PREFIX) || raw.startsWith("/.netlify/functions/product-image")) {
    try {
      const u = new URL(raw, "https://emporioar-beauty.netlify.app");
      const path = normalizeImagePath(u.searchParams.get("path") || "");
      const source = u.searchParams.get("source") || "m";
      if (source !== "m" || !path) return "";
      return `${PROXY_PREFIX}?source=m&path=${encodeURIComponent(path)}`;
    } catch {
      return "";
    }
  }

  // URL absoluta https
  if (/^https:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" || u.username || u.password) return "";
      if (!ALLOWED_CDN_HOSTS.has(u.hostname)) return "";
      const path = normalizeImagePath(u.pathname);
      if (!path) return "";
      return `${PROXY_PREFIX}?source=m&path=${encodeURIComponent(path)}`;
    } catch {
      return "";
    }
  }

  // Path relativo tipo /produto/...
  if (raw.startsWith("/produto/")) {
    const path = normalizeImagePath(raw.split("?")[0]);
    if (!path) return "";
    return `${PROXY_PREFIX}?source=m&path=${encodeURIComponent(path)}`;
  }

  return "";
}

export function toAbsoluteProxyImageUrl(value, siteUrl = "https://emporioar-beauty.netlify.app") {
  const rel = sanitizePublicImageUrl(value);
  if (!rel) return "";
  const base = String(siteUrl || "").replace(/\/$/, "");
  return base + rel;
}
