"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, Plus, Minus, Trash2, ShoppingCart, User, FileText, Repeat } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-utils";

type CatalogItem = {
  id: string;
  type: "SERVICE" | "PRODUCT" | "CUSTOM";
  name: string;
  price: number;
  description?: string;
  taxRate?: number;
  stock?: number;
};

type ClientOption = { id: string; name: string };

type CartItem = CatalogItem & {
  cartId: string; // unique ID for cart instance
  quantity: number;
};

type PosSystemProps = {
  catalog?: CatalogItem[];
  clients: ClientOption[];
  onSuccess?: () => void;
  canCreateCustomItems?: boolean;
  canApplyDiscounts?: boolean;
  currencyCode?: string;
  locale?: string;
};

export default function PosSystem({
  clients,
  canCreateCustomItems = false,
  canApplyDiscounts = false,
  currencyCode = "INR",
  locale = "en-IN",
}: PosSystemProps) {
  const t = useTranslations("POS");
  const [activeTab, setActiveTab] = useState<"SERVICES" | "PRODUCTS">(
    "SERVICES",
  );
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: "" });
  const formatMoney = (amount: number) =>
    formatCurrency(amount, currencyCode, locale);
  const currencySymbol = getCurrencySymbol(currencyCode, locale);

  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/pos/catalog?type=${activeTab}`);
        const data = await res.json();
        setItems(data);
      } catch {
        toast.error(t("toast_catalog_fail"));
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional trigger list; callbacks are re-created each render and must not retrigger the effect
  }, [activeTab]);

  const addToCart = (item: CatalogItem) => {
    if (item.type === "PRODUCT" && Number(item.stock ?? 0) <= 0) {
      toast.warning(t("toast_out_of_stock", { item: item.name }));
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      const currentQuantity = existing?.quantity ?? 0;
      if (
        item.type === "PRODUCT" &&
        currentQuantity + 1 > Number(item.stock ?? 0)
      ) {
        toast.warning(
          t("toast_stock_limit", { count: item.stock ?? 0, item: item.name }),
        );
        return prev;
      }
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        { ...item, cartId: Math.random().toString(), quantity: 1 },
      ];
    });
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartId === cartId) {
          const requestedQuantity = Math.max(1, i.quantity + delta);
          if (i.type === "PRODUCT") {
            const availableStock = Number(i.stock ?? 0);
            if (availableStock <= 0) {
              toast.warning(t("toast_out_of_stock", { item: i.name }));
              return i;
            }
            const newQ = Math.min(requestedQuantity, availableStock);
            if (requestedQuantity !== newQ) {
              toast.warning(
                t("toast_stock_limit", { count: i.stock ?? 0, item: i.name }),
              );
            }
            return { ...i, quantity: newQ };
          }
          return { ...i, quantity: requestedQuantity };
        }
        return i;
      }),
    );
  };

  const removeFromCart = (cartId: string) => {
    setCart((prev) => prev.filter((i) => i.cartId !== cartId));
  };

  const handleAddCustomItem = () => {
    if (!canCreateCustomItems) {
      toast.error(t("toast_custom_item_denied"));
      return;
    }
    if (!customItem.name || !customItem.price) return;
    setCart((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        cartId: `custom-${Date.now()}`,
        type: "CUSTOM",
        name: customItem.name,
        price: parseFloat(customItem.price),
        quantity: 1,
        description: t("custom_item_description"),
      },
    ]);
    setCustomItem({ name: "", price: "" });
    setIsCustomItemModalOpen(false);
  };

  const parkOrder = () => {
    if (cart.length === 0) return;
    localStorage.setItem("baba_pos_held_cart", JSON.stringify(cart));
    setCart([]);
    toast.success(t("toast_order_parked"));
  };

  const checkoutPayloadItems = cart.map((item) => {
    if (item.type === "CUSTOM") {
      return {
        type: item.type,
        name: item.name,
        description: item.description,
        price: item.price,
        quantity: item.quantity,
        taxRate: item.taxRate ?? 0,
      };
    }

    return {
      id: item.id,
      type: item.type,
      quantity: item.quantity,
      taxRate: item.taxRate ?? 0,
    };
  });

  const handleCheckout = async (action: string) => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          items: checkoutPayloadItems,
          clientId: selectedClient || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success(data.message);
      setCart([]);
      setIsCheckoutModalOpen(false);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || t("toast_checkout_fail"));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return (
    <div className="grid min-h-[720px] grid-cols-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:grid-cols-[minmax(0,1fr)_24rem]">
      {/* Left Pane - Catalog Grid */}
      <div className="flex min-h-[640px] flex-col bg-zinc-50/50 dark:bg-zinc-950/30 lg:border-r lg:border-zinc-200/70 lg:dark:border-zinc-800/80">
        <div className="p-6 border-b border-zinc-200/70 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
          <div className="flex items-center gap-4 mb-4">
            <Tabs
              value={activeTab}
              onValueChange={(v: any) => setActiveTab(v)}
              className="w-64"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="SERVICES">{t("tab_services")}</TabsTrigger>
                <TabsTrigger value="PRODUCTS">{t("tab_products")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={t("search_placeholder", {
                  mode:
                    activeTab === "SERVICES" ? t("services") : t("products"),
                })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-12 text-base font-medium shadow-sm border-zinc-200 bg-white focus-visible:ring-accent-primary/30 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            {canCreateCustomItems ? (
              <Button
                variant="outline"
                className="h-12 border-dashed border-accent-primary/60 text-accent-primary hover:bg-accent-primary/10 font-bold"
                onClick={() => setIsCustomItemModalOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> {t("btn_custom_item")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="col-span-full flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white/70 text-sm font-medium text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/60">
              {t("no_items")}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence>
                {filteredItems.map((item) => {
                  const isOutOfStock =
                    item.type === "PRODUCT" && Number(item.stock ?? 0) <= 0;

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <Card
                        className={`h-full border border-zinc-200 bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900 ${isOutOfStock ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:-translate-y-1 hover:border-accent-primary/50 hover:shadow-lg"}`}
                        onClick={() => addToCart(item)}
                      >
                        <CardHeader className="p-4">
                          <CardTitle className="text-base line-clamp-2">
                            {item.name}
                          </CardTitle>
                          <div className="text-lg font-bold text-accent-primary mt-2">
                            {formatMoney(item.price)}
                          </div>
                          {item.type === "PRODUCT" && (
                            <div
                              className={`text-xs font-bold uppercase tracking-widest ${isOutOfStock ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {isOutOfStock
                                ? t("out_of_stock")
                                : t("in_stock", { count: item.stock ?? 0 })}
                            </div>
                          )}
                        </CardHeader>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane - Cart Sidebar */}
      <div className="flex min-h-[640px] flex-col bg-white/90 backdrop-blur dark:bg-zinc-900/90">
        <div className="p-4 border-b border-zinc-200/70 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <ShoppingCart className="mr-2 h-5 w-5" /> {t("current_order")}
          </h3>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full bg-white border-zinc-200 h-10 dark:bg-zinc-950 dark:border-zinc-800">
              <User className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder={t("select_client_ph")} />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c: ClientOption) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <AnimatePresence>
            {cart.map((item) => (
              <motion.div
                key={item.cartId}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-3 mb-2 rounded-lg border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/50"
              >
                <div className="flex-1 mr-2">
                  <div className="font-medium text-sm leading-tight">
                    {item.name}
                  </div>
                  <div className="text-accent-primary text-sm font-semibold mt-1">
                    {formatMoney(item.price)}
                  </div>
                  {item.type === "PRODUCT" && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {t("stock_count", { count: item.stock ?? 0 })}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 bg-muted/50 rounded-md p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => updateQuantity(item.cartId, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-medium w-4 text-center">
                    {item.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => updateQuantity(item.cartId, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 ml-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeFromCart(item.cartId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground pt-20">
              <ShoppingCart className="h-12 w-12 mb-4 opacity-20" />
              <p>{t("cart_empty")}</p>
            </div>
          )}
        </div>

        {/* Totals & Actions */}
        <div className="p-6 border-t border-zinc-200/70 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-muted-foreground">
              <span>{t("subtotal")}</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>
                {t("discount")}
                {canApplyDiscounts ? "" : ` (${t("restricted")})`}
              </span>
              <span>{formatMoney(0)}</span>
            </div>
            <div className="flex justify-between font-black text-2xl text-foreground pt-2 border-t border-border/50">
              <span>{t("total")}</span>
              <span className="text-accent-primary">
                {formatMoney(subtotal)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={parkOrder}
              disabled={cart.length === 0}
            >
              {t("btn_park")}
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCart([])}
              disabled={cart.length === 0}
            >
              {t("btn_clear")}
            </Button>
          </div>

          <Button
            className="w-full h-14 text-lg font-bold bg-accent-primary hover:bg-accent-strong text-accent-primary-foreground shadow-lg shadow-accent-primary/20"
            disabled={cart.length === 0}
            onClick={() => setIsCheckoutModalOpen(true)}
          >
            {t("btn_checkout")}
          </Button>
        </div>
      </div>

      {/* Checkout Modal */}
      <Dialog open={isCheckoutModalOpen} onOpenChange={setIsCheckoutModalOpen}>
        <DialogContent className="sm:max-w-[600px] border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              {t("modal_checkout_title")}
            </DialogTitle>
            <DialogDescription>{t("modal_checkout_desc")}</DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center border-b border-zinc-200 dark:border-zinc-800 mb-6">
            <span className="text-sm font-bold uppercase text-muted-foreground tracking-widest">
              {t("amount_due")}
            </span>
            <span className="text-5xl font-black text-accent-primary">
              {formatMoney(subtotal)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button
              className="h-16 flex flex-col items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-white"
              onClick={() => handleCheckout("PAY_NOW")}
              disabled={isProcessing}
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="font-bold">{t("btn_pay_now")}</span>
            </Button>
            <Button
              className="h-16 flex flex-col items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleCheckout("INVOICE")}
              disabled={isProcessing}
            >
              <FileText className="h-5 w-5" />
              <span className="font-bold">{t("btn_send_invoice")}</span>
            </Button>
            <Button
              className="h-16 flex flex-col items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleCheckout("PROPOSAL")}
              disabled={isProcessing}
            >
              <FileText className="h-5 w-5" />
              <span className="font-bold">{t("btn_convert_proposal")}</span>
            </Button>
            <Button
              className="h-16 flex flex-col items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => handleCheckout("RETAINER")}
              disabled={isProcessing}
            >
              <Repeat className="h-5 w-5" />
              <span className="font-bold">{t("btn_make_recurring")}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ad-Hoc Item Modal */}
      <Dialog
        open={isCustomItemModalOpen}
        onOpenChange={setIsCustomItemModalOpen}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("modal_custom_title")}</DialogTitle>
            <DialogDescription>{t("modal_custom_desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("label_item_name")}</Label>
              <Input
                id="name"
                value={customItem.name}
                onChange={(e) =>
                  setCustomItem({ ...customItem, name: e.target.value })
                }
                placeholder={t("placeholder_item_name")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("label_price", { currency: currencySymbol })}</Label>
              <Input
                id="price"
                type="number"
                value={customItem.price}
                onChange={(e) =>
                  setCustomItem({ ...customItem, price: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCustomItemModalOpen(false)}
            >
              {t("btn_cancel")}
            </Button>
            <Button onClick={handleAddCustomItem}>
              {t("btn_add_to_cart")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
