"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { useFormat } from "@/hooks/use-format";

type ProductCatalogItem = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  baselinePrice?: number | string | null;
  currentStock?: number;
  status?: string;
  showInShop?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type ShopOrder = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  amount: number | string;
  status: string;
  currency: string;
  gateway?: string;
  createdAt: string;
  items: Array<{ productName: string; quantity: number }>;
};

type ShopOverview = {
  totalOrders: number;
  statusCounts: {
    PAID: number;
    PENDING: number;
    FAILED: number;
    REFUNDED: number;
  };
  paidRevenue: number;
};

const ORDER_STATUSES = ["ALL", "PAID", "PENDING", "FAILED", "REFUNDED"];
const ACCENT_SWATCHES = ["#6366f1", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#111827"];
const SETTINGS_REQUIRED_FIELDS = [
  "companyName",
  "proprietorName",
  "address",
  "email",
  "panNumber",
  "bankName",
  "accountName",
  "accountNumber",
  "ifscCode",
  "invoiceTheme",
  "defaultSacCode",
] as const;

const DATA_SEGMENTS = ["ALL", "ORDERS", "CATALOG"] as const;
type DataSegment = (typeof DATA_SEGMENTS)[number];

type OrderRow = { kind: "order"; id: string; order: ShopOrder };
type CatalogRow = { kind: "catalog"; id: string; product: ProductCatalogItem };
type ShopRow = OrderRow | CatalogRow;

export default function ShopDashboardPage() {
  const { fCurrency } = useFormat();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [shopOverview, setShopOverview] = useState<ShopOverview>({
    totalOrders: 0,
    statusCounts: { PAID: 0, PENDING: 0, FAILED: 0, REFUNDED: 0 },
    paidRevenue: 0,
  });
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [shopAccentColor, setShopAccentColor] = useState("#6366f1");
  const [accentDraft, setAccentDraft] = useState("#6366f1");
  const [isSavingAccent, setIsSavingAccent] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [orderFilter, setOrderFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");
  const [dataSegment, setDataSegment] = useState<DataSegment>("ALL");
  const [orderSearch, setOrderSearch] = useState("");
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ordersRes, productsRes, settingsRes] = await Promise.all([
        fetch("/api/shop/orders?status=ALL"),
        fetch("/api/inventory/products?limit=200"),
        fetch("/api/settings"),
      ]);

      const [ordersData, productsData, settingsData] = await Promise.all([
        ordersRes.json().catch(() => null),
        productsRes.json().catch(() => null),
        settingsRes.json().catch(() => null),
      ]);

      if (!ordersRes.ok) throw new Error((ordersData as any)?.error || "Failed to load orders.");
      if (!productsRes.ok) throw new Error((productsData as any)?.error || "Failed to load products.");
      if (!settingsRes.ok) throw new Error((settingsData as any)?.error || "Failed to load shop settings.");

      setOrders(Array.isArray(ordersData.orders) ? ordersData.orders : []);
      setShopOverview(ordersData.overview ?? { totalOrders: 0, statusCounts: { PAID: 0, PENDING: 0, FAILED: 0, REFUNDED: 0 }, paidRevenue: 0 });
      const parsedProducts = Array.isArray(productsData)
        ? productsData.filter((product: ProductCatalogItem) => Boolean(product.showInShop))
        : [];
      setProducts(parsedProducts);
      setShopSlug(settingsData?.shopSlug || null);
      const accent = settingsData?.shopAccentColor || "#6366f1";
      setShopAccentColor(accent);
      setAccentDraft(accent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load shop details.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const productFilterOptions = useMemo(() => {
    const names = products
      .map((product) => product.name)
      .sort((a, b) => a.localeCompare(b));

    return ["ALL", ...new Set(names)];
  }, [products]);

  useEffect(() => {
    if (!productFilterOptions.includes(productFilter)) {
      setProductFilter("ALL");
    }
  }, [productFilter, productFilterOptions]);

  const filteredRows = useMemo<ShopRow[]>(() => {
    const q = orderSearch.toLowerCase();
    const orderRows: OrderRow[] = orders
      .filter((o) => {
        const matchesSearch =
          o.buyerName.toLowerCase().includes(q) ||
          o.buyerEmail.toLowerCase().includes(q) ||
          o.items.some((item) => item.productName.toLowerCase().includes(q));
        const matchesFilter = orderFilter === "ALL" ? true : o.status === orderFilter;
        const matchesProduct =
          productFilter === "ALL" ? true : o.items.some((item) => item.productName === productFilter);
        return matchesSearch && matchesFilter && matchesProduct;
      })
      .map((order) => ({ kind: "order", id: order.id, order }));

    const catalogRows: CatalogRow[] = products
      .filter((p) => {
        const searchable = [
          p.name,
          p.description ?? "",
          p.sku ?? "",
          p.category ?? "",
        ].join(" ").toLowerCase();
        const matchesSearch = searchable.includes(q);
        const matchesProduct = productFilter === "ALL" ? true : p.name === productFilter;
        return matchesSearch && matchesProduct;
      })
      .map((product) => ({ kind: "catalog", id: product.id, product }));

    if (dataSegment === "ORDERS") return orderRows;
    if (dataSegment === "CATALOG") return catalogRows;
    return [...catalogRows, ...orderRows];
  }, [orderSearch, orderFilter, productFilter, orders, products, dataSegment]);

  const stats = useMemo(() => ({
    totalOrders: shopOverview.totalOrders,
    paidOrders: shopOverview.statusCounts.PAID,
    pendingOrders: shopOverview.statusCounts.PENDING,
    failedOrders: shopOverview.statusCounts.FAILED,
    refundedOrders: shopOverview.statusCounts.REFUNDED,
    totalProducts: products.length,
    grossRevenue: Number(shopOverview.paidRevenue || 0),
  }), [shopOverview, products]);

  const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    PAID: { label: "Paid", className: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400", icon: <Check className="w-3 h-3" /> },
    PENDING: { label: "Pending", className: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400", icon: <Clock className="w-3 h-3" /> },
    FAILED: { label: "Failed", className: "bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-400", icon: <X className="w-3 h-3" /> },
    REFUNDED: { label: "Refunded", className: "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-400", icon: <AlertCircle className="w-3 h-3" /> },
  };

  const getEmptyState = () => {
    if (orderSearch.trim()) {
      return {
        title: "No matches found",
        description: "Try a different keyword for buyers, products, or catalog metadata.",
      };
    }
    if (dataSegment === "ORDERS") {
      return {
        title: "No orders yet",
        description: "When customers buy from your shop, orders will appear here.",
      };
    }
    if (dataSegment === "CATALOG") {
      return {
        title: "No catalog products yet",
        description: "Add products in Inventory to sell them in your shop.",
      };
    }
    return {
      title: "No shop data yet",
      description: "Orders and service catalog items will appear here once available.",
    };
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const res = await fetch(`/api/shop/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      toast.success("Order updated.");
      fetchData();
    } else {
      toast.error("Failed to update order.");
    }
  };

  const deleteOrder = async (orderId: string) => {
    const res = await fetch(`/api/shop/orders/${orderId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Order deleted.");
      fetchData();
    } else {
      toast.error("Failed to delete order.");
    }
    setDeletingOrderId(null);
  };

  const saveAccentColor = async () => {
    const previous = shopAccentColor;
    setIsSavingAccent(true);
    setShopAccentColor(accentDraft);
    const toastId = toast.loading("Saving branding color...");

    try {
      const settingsRes = await fetch("/api/settings");
      if (!settingsRes.ok) {
        setShopAccentColor(previous);
        toast.error("Failed to load current settings.", { id: toastId });
        return;
      }
      const settingsData = await settingsRes.json();

      const missingRequired = SETTINGS_REQUIRED_FIELDS.filter((field) => {
        if (
          ["bankName", "accountName", "accountNumber", "ifscCode"].includes(field) &&
          settingsData?.primaryBankAccount?.source === "BANK_ACCOUNT"
        ) {
          return false;
        }
        const value = settingsData?.[field];
        return value === null || value === undefined || value === "";
      });
      if (missingRequired.length > 0) {
        setShopAccentColor(previous);
        toast.error("Complete business profile setup in Settings before updating branding.", { id: toastId });
        return;
      }

      const body = new FormData();
      SETTINGS_REQUIRED_FIELDS.forEach((field) => {
        body.append(field, String(settingsData[field]));
      });
      body.append("shopAccentColor", accentDraft);
      body.append("shopSlug", settingsData?.shopSlug || "");
      body.append("shopTagline", settingsData?.shopTagline || "");
      body.append("shopEnabled", String(!!settingsData?.shopEnabled));
      const res = await fetch("/api/settings", { method: "POST", body });

      if (!res.ok) {
        setShopAccentColor(previous);
        toast.error("Failed to save branding color.", { id: toastId });
        return;
      }

      toast.success("Branding color saved.", { id: toastId });
    } catch {
      setShopAccentColor(previous);
      toast.error("Network error while saving branding color.", { id: toastId });
    } finally {
      setIsSavingAccent(false);
    }
  };

  return (
    <DashboardPageShell
      title="Shop Command Center"
      icon={<Store className="w-6 h-6 text-accent-strong" />}
      description="Monitor storefront performance, manage incoming orders, and keep your public shop healthy."
      primaryAction={
        <div className="flex flex-wrap items-center gap-3">
          {shopSlug ? (
            <Button
              onClick={() => window.open(`/shop/${shopSlug}`, "_blank")}
              variant="outline"
              className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-wider h-11"
            >
              <ExternalLink className="w-4 h-4" /> View Live Shop
            </Button>
          ) : null}
          <Button
            onClick={() => window.location.assign("/inventory")}
            className="btn-primary w-full md:w-auto shrink-0 text-xs uppercase tracking-wider h-11"
          >
            <ShoppingBag className="w-4 h-4 md:mr-2" /> <span className="md:inline">Manage Products</span>
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Card className="border-indigo-200/60 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50/70 to-white dark:from-indigo-950/30 dark:to-zinc-900">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-zinc-500 flex items-center gap-2"><ShoppingCart className="w-3.5 h-3.5" />Total Orders</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">{stats.totalOrders}</p></CardContent>
        </Card>
        <Card className="border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/70 to-white dark:from-emerald-950/20 dark:to-zinc-900">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-zinc-500 flex items-center gap-2"><Wallet className="w-3.5 h-3.5" />Gross Revenue</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">{fCurrency(stats.grossRevenue)}</p><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mt-1">{stats.paidOrders} paid orders</p></CardContent>
        </Card>
        <Card className="border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/70 to-white dark:from-amber-950/20 dark:to-zinc-900">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-zinc-500 flex items-center gap-2"><Clock className="w-3.5 h-3.5" />Pending</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">{stats.pendingOrders}</p><p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mt-1">{stats.failedOrders} failed · {stats.refundedOrders} refunded</p></CardContent>
        </Card>
        <Card className="border-sky-200/60 dark:border-sky-800/40 bg-gradient-to-br from-sky-50/70 to-white dark:from-sky-950/20 dark:to-zinc-900">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-zinc-500 flex items-center gap-2"><Store className="w-3.5 h-3.5" />Shop Catalog</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {stats.totalProducts}
            </p>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mt-1">
              Products in Inventory
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">Branding</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentDraft}
                  onChange={(e) => setAccentDraft(e.target.value)}
                  className="h-10 w-10 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent cursor-pointer"
                  aria-label="Shop accent color"
                />
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold">Current Value</p>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{accentDraft.toUpperCase()}</p>
                </div>
                <span className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="h-4 w-4 rounded-full border border-zinc-300 dark:border-zinc-600" style={{ backgroundColor: shopAccentColor }} />
                  Live
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setAccentDraft(swatch)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${accentDraft.toLowerCase() === swatch.toLowerCase() ? "border-zinc-900 dark:border-zinc-100 scale-105" : "border-transparent hover:scale-105"}`}
                    style={{ backgroundColor: swatch }}
                    aria-label={`Use ${swatch} accent`}
                    title={swatch}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2 lg:ml-auto">
                <Button type="button" onClick={saveAccentColor} disabled={isSavingAccent || accentDraft === shopAccentColor} className="h-9 text-xs font-bold uppercase tracking-wider">
                  {isSavingAccent ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Save
                </Button>
                {shopSlug ? (
                  <Button type="button" variant="outline" onClick={() => window.open(`/shop/${shopSlug}`, "_blank")} className="h-9 text-xs font-bold uppercase tracking-wider">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    View Shop
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input placeholder="Search buyers, products, or catalog metadata..." value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} className="pl-9 h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-bold focus-visible:ring-indigo-500" />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-300"
            >
              {productFilterOptions.map((productName) => (
                <option key={productName} value={productName}>
                  {productName === "ALL" ? "All Products" : productName}
                </option>
              ))}
            </select>
            <div className="flex bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 gap-1 h-10">
              {DATA_SEGMENTS.map((segment) => (
                <button key={segment} onClick={() => setDataSegment(segment)} className={`px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${dataSegment === segment ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
                  {segment}
                </button>
              ))}
            </div>
          </div>
        </div>

        {dataSegment !== "CATALOG" && (
          <div className="flex bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 gap-1 h-10 w-fit">
            {ORDER_STATUSES.map((s) => (
              <button key={s} onClick={() => setOrderFilter(s)} className={`px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${orderFilter === s ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500/50" /></div>
        ) : (
          <div className="bg-white dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <tr>{["Type", "Date", "Buyer / Visibility", "Products", "Amount", "Channel", "Status", "Actions"].map((h) => (<th key={h} className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{h}</th>))}</tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {filteredRows.map((row) => {
                    if (row.kind === "order") {
                      const o = row.order;
                      const sc = statusConfig[o.status] || statusConfig.PENDING;
                      const orderAmount = Number(o.amount || 0);
                      return (
                        <tr key={`order-${o.id}`} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                          <td className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Order</td>
                          <td className="px-4 py-4 text-xs text-zinc-500 whitespace-nowrap">{format(new Date(o.createdAt), "dd MMM yyyy")}</td>
                          <td className="px-4 py-4"><p className="font-bold text-[13px] text-zinc-900 dark:text-zinc-100">{o.buyerName}</p><p className="text-[11px] text-zinc-500">{o.buyerEmail}</p></td>
                          <td className="px-4 py-4 text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 max-w-[260px] truncate">
                            {o.items.map((item) => `${item.productName} x${item.quantity}`).join(", ")}
                          </td>
                          <td className="px-4 py-4 font-bold text-[13px] text-zinc-800 dark:text-zinc-200">{fCurrency(orderAmount)}</td>
                          <td className="px-4 py-4"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{o.gateway || "—"}</span></td>
                          <td className="px-4 py-4"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${sc.className}`}>{sc.icon} {sc.label}</span></td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <select value={o.status} onChange={(e) => updateOrderStatus(o.id, e.target.value)} className="text-[10px] font-bold uppercase border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 cursor-pointer">
                                {["PENDING", "PAID", "FAILED", "REFUNDED"].map((s) => (<option key={s} value={s}>{s}</option>))}
                              </select>
                              <button onClick={() => setDeletingOrderId(o.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const p = row.product;
                    const productAmount = Number(p.baselinePrice || 0);
                    return (
                      <tr key={`catalog-${p.id}`} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                        <td className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Catalog</td>
                        <td className="px-4 py-4 text-xs text-zinc-500 whitespace-nowrap">
                          {format(new Date(p.updatedAt || p.createdAt || Date.now()), "dd MMM yyyy")}
                        </td>
                        <td className="px-4 py-4 text-[11px] text-zinc-500">
                          <span className="font-bold uppercase tracking-wider">Product</span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[13px] text-zinc-700 dark:text-zinc-300 max-w-[240px] truncate">{p.name}</p>
                          <p className="text-[11px] text-zinc-500 max-w-[260px] truncate">{p.description || p.category || "No description provided"}</p>
                        </td>
                        <td className="px-4 py-4 font-bold text-[13px] text-zinc-800 dark:text-zinc-200">{fCurrency(productAmount)}</td>
                        <td className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Catalog</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${Number(p.currentStock ?? 0) > 0 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
                            {Number(p.currentStock ?? 0) > 0 ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />} {Number(p.currentStock ?? 0) > 0 ? "In Stock" : "Out of Stock"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase tracking-widest" onClick={() => window.location.assign("/inventory")}>
                            Manage
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <ShoppingBag className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                        <p className="font-bold text-sm uppercase tracking-widest text-zinc-400">{getEmptyState().title}</p>
                        <p className="text-xs text-zinc-400 mt-1">{getEmptyState().description}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingOrderId} onOpenChange={(o) => !o && setDeletingOrderId(null)}>
        <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this order record. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingOrderId && deleteOrder(deletingOrderId)} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPageShell>
  );
}
