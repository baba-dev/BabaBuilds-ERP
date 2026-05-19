import { mkdtemp, writeFile, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const businessProfileFindUnique = vi.fn();
const businessProfileFindFirst = vi.fn();
const productFindFirst = vi.fn();
const clientFindFirst = vi.fn();
const isModuleEnabledMock = vi.fn();
const getServerSessionMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    businessProfile: {
      findUnique: (...args: unknown[]) => businessProfileFindUnique(...args),
      findFirst: (...args: unknown[]) => businessProfileFindFirst(...args),
    },
    product: {
      findFirst: (...args: unknown[]) => productFindFirst(...args),
    },
    client: {
      findFirst: (...args: unknown[]) => clientFindFirst(...args),
    },
  },
}));

vi.mock('@/lib/modules', () => ({
  isModuleEnabled: (...args: unknown[]) => isModuleEnabledMock(...args),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]);

let privateRoot: string;

async function writePrivateAsset(kind: 'logos' | 'products', workspaceId: string, filename: string) {
  const dir = path.join(privateRoot, kind, workspaceId);
  await writeFile(path.join(dir, filename), pngBytes, { flag: 'w' }).catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await import('fs/promises').then(({ mkdir }) => mkdir(dir, { recursive: true }));
    await writeFile(path.join(dir, filename), pngBytes);
  });
}

function activeProfile(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'ws_1',
    shopEnabled: true,
    logoUrl: '/logos/ws_1/logo.png',
    companyName: 'Acme',
    shopTagline: null,
    shopAccentColor: '#123456',
    email: 'hello@example.com',
    phone: null,
    website: null,
    address: 'Main Street',
    razorpayKeyId: null,
    razorpayKeySecret: null,
    stripePublishableKey: null,
    stripeSecretKey: null,
    defaultGateway: null,
    workspace: { products: [] },
    ...overrides,
  };
}

describe('public storefront media assets', () => {
  beforeEach(async () => {
    vi.resetModules();
    businessProfileFindUnique.mockReset();
    businessProfileFindFirst.mockReset();
    productFindFirst.mockReset();
    clientFindFirst.mockReset();
    isModuleEnabledMock.mockReset().mockResolvedValue(true);
    getServerSessionMock.mockReset().mockResolvedValue(null);
    privateRoot = await mkdtemp(path.join(os.tmpdir(), 'shop-assets-'));
    process.env.PRIVATE_UPLOADS_DIR = privateRoot;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(privateRoot, { recursive: true, force: true });
    delete process.env.PRIVATE_UPLOADS_DIR;
  });

  it('rewrites private logo and product image paths in the public shop payload', async () => {
    businessProfileFindUnique.mockResolvedValue(activeProfile({
      workspace: {
        products: [
          {
            id: 'prod_1',
            sku: 'SKU-1',
            name: 'Public product',
            description: 'Dashboard description',
            shopDescription: 'Shop description',
            category: 'General',
            shopImageUrl: '/products/ws_1/shop-product.png',
            imageUrl: '/products/ws_1/product.png',
            baselinePrice: 1200,
            currentStock: 3,
          },
          {
            id: 'prod_2',
            sku: 'SKU-2',
            name: 'CDN product',
            description: null,
            shopDescription: null,
            category: null,
            shopImageUrl: 'https://cdn.example.test/product.png',
            imageUrl: '/products/ws_1/unused.png',
            baselinePrice: 500,
            currentStock: 2,
          },
        ],
      },
    }));

    const { GET } = await import('@/app/api/shop/[slug]/route');
    const res = await GET(new Request('http://localhost/api/shop/acme'), {
      params: Promise.resolve({ slug: 'acme' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shop.logoUrl).toBe('/api/shop/acme/assets/logo');
    expect(body.products[0].imageUrl).toBe('/api/shop/acme/assets/product/prod_1');
    expect(body.products[1].imageUrl).toBe('https://cdn.example.test/product.png');
    expect(JSON.stringify(body)).not.toContain('/products/ws_1/shop-product.png');
    expect(JSON.stringify(body)).not.toContain('/products/ws_1/product.png');
    expect(JSON.stringify(body)).not.toContain('/logos/ws_1/logo.png');
  });

  it('serves an eligible shop logo to unauthenticated storefront visitors', async () => {
    await writePrivateAsset('logos', 'ws_1', 'logo.png');
    businessProfileFindUnique.mockResolvedValue(activeProfile());

    const { GET } = await import('@/app/api/shop/[slug]/assets/[...asset]/route');
    const res = await GET(new Request('http://localhost/api/shop/acme/assets/logo'), {
      params: Promise.resolve({ slug: 'acme', asset: ['logo'] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(getServerSessionMock).not.toHaveBeenCalled();
  });

  it('serves an eligible showInShop product image to unauthenticated storefront visitors', async () => {
    await writePrivateAsset('products', 'ws_1', 'product.png');
    businessProfileFindUnique.mockResolvedValue(activeProfile());
    productFindFirst.mockResolvedValue({
      id: 'prod_1',
      imageUrl: '/products/ws_1/product.png',
      shopImageUrl: null,
    });

    const { GET } = await import('@/app/api/shop/[slug]/assets/[...asset]/route');
    const res = await GET(new Request('http://localhost/api/shop/acme/assets/product/prod_1'), {
      params: Promise.resolve({ slug: 'acme', asset: ['product', 'prod_1'] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('max-age=300');
    expect(getServerSessionMock).not.toHaveBeenCalled();
    expect(productFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'prod_1',
        workspaceId: 'ws_1',
        showInShop: true,
        currentStock: { gt: 0 },
      }),
    }));
  });

  it('does not serve storefront assets for disabled shops or hidden products', async () => {
    businessProfileFindUnique.mockResolvedValue(activeProfile({ shopEnabled: false }));
    const { GET } = await import('@/app/api/shop/[slug]/assets/[...asset]/route');

    const disabledShopRes = await GET(new Request('http://localhost/api/shop/acme/assets/logo'), {
      params: Promise.resolve({ slug: 'acme', asset: ['logo'] }),
    });
    expect(disabledShopRes.status).toBe(404);

    businessProfileFindUnique.mockResolvedValue(activeProfile());
    productFindFirst.mockResolvedValue(null);
    const hiddenProductRes = await GET(new Request('http://localhost/api/shop/acme/assets/product/prod_hidden'), {
      params: Promise.resolve({ slug: 'acme', asset: ['product', 'prod_hidden'] }),
    });
    expect(hiddenProductRes.status).toBe(404);
  });
});

describe('private dashboard media routes', () => {
  beforeEach(async () => {
    vi.resetModules();
    businessProfileFindUnique.mockReset();
    businessProfileFindFirst.mockReset();
    productFindFirst.mockReset();
    clientFindFirst.mockReset();
    isModuleEnabledMock.mockReset();
    getServerSessionMock.mockReset();
    privateRoot = await mkdtemp(path.join(os.tmpdir(), 'private-product-assets-'));
    process.env.PRIVATE_UPLOADS_DIR = privateRoot;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(privateRoot, { recursive: true, force: true });
    delete process.env.PRIVATE_UPLOADS_DIR;
  });

  it('requires authentication for direct dashboard logos', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { GET } = await import('@/app/logos/[...path]/route');

    const res = await GET(new Request('http://localhost/logos/ws_1/logo.png'), {
      params: Promise.resolve({ path: ['ws_1', 'logo.png'] }),
    });

    expect(res.status).toBe(401);
    expect(businessProfileFindFirst).not.toHaveBeenCalled();
    expect(clientFindFirst).not.toHaveBeenCalled();
  });

  it('serves direct dashboard logos only to an authenticated owner workspace', async () => {
    await writePrivateAsset('logos', 'ws_1', 'logo.png');
    getServerSessionMock.mockResolvedValue({ workspaceId: 'ws_1' });
    businessProfileFindFirst.mockResolvedValue({ workspaceId: 'ws_1' });
    clientFindFirst.mockResolvedValue(null);
    const { GET } = await import('@/app/logos/[...path]/route');

    const res = await GET(new Request('http://localhost/logos/ws_1/logo.png'), {
      params: Promise.resolve({ path: ['ws_1', 'logo.png'] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(businessProfileFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'ws_1', logoUrl: '/logos/ws_1/logo.png' },
    }));
  });

  it('requires authentication for direct dashboard product images', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { GET } = await import('@/app/products/[...path]/route');

    const res = await GET(new Request('http://localhost/products/ws_1/product.png'), {
      params: Promise.resolve({ path: ['ws_1', 'product.png'] }),
    });

    expect(res.status).toBe(401);
    expect(productFindFirst).not.toHaveBeenCalled();
  });

  it('serves direct dashboard product images only to an authenticated owner workspace', async () => {
    await writePrivateAsset('products', 'ws_1', 'product.png');
    getServerSessionMock.mockResolvedValue({ workspaceId: 'ws_1' });
    productFindFirst.mockResolvedValue({ id: 'prod_1' });
    const { GET } = await import('@/app/products/[...path]/route');

    const res = await GET(new Request('http://localhost/products/ws_1/product.png'), {
      params: Promise.resolve({ path: ['ws_1', 'product.png'] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(productFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'ws_1', imageUrl: '/products/ws_1/product.png' },
    }));
  });
});
