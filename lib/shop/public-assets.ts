const PRIVATE_LOGO_PREFIX = '/logos/';
const PRIVATE_PRODUCT_PREFIX = '/products/';

type StorefrontAssetKind = 'logo' | 'product';

export function isAbsoluteAssetUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function isPrivateLogoPath(value: string | null | undefined) {
  return Boolean(value?.startsWith(PRIVATE_LOGO_PREFIX));
}

export function isPrivateProductPath(value: string | null | undefined) {
  return Boolean(value?.startsWith(PRIVATE_PRODUCT_PREFIX));
}

export function privateAssetPathSegments(value: string, kind: 'logos' | 'products') {
  const prefix = kind === 'logos' ? PRIVATE_LOGO_PREFIX : PRIVATE_PRODUCT_PREFIX;
  if (!value.startsWith(prefix)) return null;
  const segments = value.slice(prefix.length).split('/').filter(Boolean);
  return segments.length > 0 ? segments : null;
}

export function buildStorefrontAssetUrl(args: {
  slug: string;
  kind: StorefrontAssetKind;
  productId?: string;
}) {
  const encodedSlug = encodeURIComponent(args.slug.toLowerCase());
  if (args.kind === 'logo') return `/api/shop/${encodedSlug}/assets/logo`;
  if (!args.productId) return null;
  return `/api/shop/${encodedSlug}/assets/product/${encodeURIComponent(args.productId)}`;
}

export function publicStorefrontAssetUrl(args: {
  slug: string;
  url: string | null | undefined;
  kind: StorefrontAssetKind;
  productId?: string;
}) {
  const { slug, url, kind, productId } = args;
  if (!url) return null;
  if (isAbsoluteAssetUrl(url)) return url;

  if (kind === 'logo' && isPrivateLogoPath(url)) {
    return buildStorefrontAssetUrl({ slug, kind });
  }

  if (kind === 'product' && isPrivateProductPath(url)) {
    return buildStorefrontAssetUrl({ slug, kind, productId });
  }

  return url;
}
