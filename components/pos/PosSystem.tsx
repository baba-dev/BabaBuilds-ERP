"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, Plus, Minus, Trash2, ShoppingCart, User, X, FileText, Repeat } from "lucide-react";
import { toast } from "sonner";
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

type CatalogItem = {
  id: string;
  type: "SERVICE" | "PRODUCT";
  name: string;
  price: number;
  description?: string;
};

type CartItem = CatalogItem & {
  cartId: string; // unique ID for cart instance
  quantity: number;
};

export default function PosSystem({ catalog, clients, onSuccess }: any) {
  const t = useTranslations('POS');
  const [activeTab, setActiveTab] = useState<"SERVICES" | "PRODUCTS">("SERVICES");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: "" });

  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/pos/catalog?type=${activeTab}`);
        const data = await res.json();
        setItems(data);
      } catch (err) {
        toast.error("Failed to load catalog");
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  }, [activeTab]);

  const addToCart = (item: CatalogItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, cartId: Math.random().toString(), quantity: 1 }];
    });
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.cartId === cartId) {
        const newQ = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQ };
      }
      return i;
    }));
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(i => i.cartId !== cartId));
  };

  const handleAddCustomItem = () => {
    if (!customItem.name || !customItem.price) return;
    setCart(prev => [...prev, {
      id: `custom-${Date.now()}`,
      cartId: `custom-${Date.now()}`,
      type: activeTab === "SERVICES" ? "SERVICE" : "PRODUCT",
      name: customItem.name,
      price: parseFloat(customItem.price),
      quantity: 1,
      description: "Ad-Hoc Item"
    }]);
    setCustomItem({ name: "", price: "" });
    setIsCustomItemModalOpen(false);
  };

  const parkOrder = () => {
    if (cart.length === 0) return;
    localStorage.setItem("baba_pos_held_cart", JSON.stringify(cart));
    setCart([]);
    toast.success("Order placed on hold");
  };

  const handleCheckout = async (action: string) => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, items: cart, clientId: selectedClient })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      toast.success(data.message);
      setCart([]);
      setIsCheckoutModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Checkout failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background/50 overflow-hidden">
      
      {/* Left Pane - Catalog Grid */}
      <div className="flex-1 flex flex-col bg-background/50 border-r border-border/50">
        <div className="p-6 border-b border-border/50 bg-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-foreground">{t('title')}</h2>
              <p className="text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-64">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="SERVICES">{t('tab_services')}</TabsTrigger>
                <TabsTrigger value="PRODUCTS">{t('tab_products')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={t('search_placeholder', { mode: activeTab === 'SERVICES' ? 'services' : 'products' })}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 h-12 text-lg shadow-sm border-border/50 bg-background"
              />
            </div>
            <Button variant="outline" className="h-12 border-dashed border-accent-primary text-accent-primary" onClick={() => setIsCustomItemModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t('btn_custom_item')}
            </Button>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence>
                {filteredItems.map(item => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Card 
                      className="cursor-pointer hover:border-accent-primary transition-colors h-full border border-border/50 bg-card/80 backdrop-blur"
                      onClick={() => addToCart(item)}
                    >
                      <CardHeader className="p-4">
                        <CardTitle className="text-base line-clamp-2">{item.name}</CardTitle>
                        <div className="text-lg font-bold text-accent-primary mt-2">
                          ${item.price.toFixed(2)}
                        </div>
                      </CardHeader>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane - Cart Sidebar */}
      <div className="w-96 flex flex-col bg-card/50 backdrop-blur border-l border-border/50 relative z-10 shadow-2xl">
        <div className="p-4 border-b border-border/50 bg-card">
          <h3 className="font-bold text-lg mb-4 flex items-center"><ShoppingCart className="mr-2 h-5 w-5"/> {t('current_order')}</h3>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full bg-background border-border/50 h-10">
              <User className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder={t('select_client_ph')} />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <AnimatePresence>
            {cart.map(item => (
              <motion.div
                key={item.cartId}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-3 mb-2 rounded-lg border border-border/50 bg-background"
              >
                <div className="flex-1 mr-2">
                  <div className="font-medium text-sm leading-tight">{item.name}</div>
                  <div className="text-accent-primary text-sm font-semibold mt-1">${item.price.toFixed(2)}</div>
                </div>
                
                <div className="flex items-center space-x-2 bg-muted/50 rounded-md p-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.cartId, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.cartId, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeFromCart(item.cartId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground pt-20">
              <ShoppingCart className="h-12 w-12 mb-4 opacity-20" />
              <p>{t('cart_empty')}</p>
            </div>
          )}
        </div>

        {/* Totals & Actions */}
        <div className="p-6 border-t border-border/50 bg-card">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-muted-foreground">
              <span>{t('subtotal')}</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{t('discount')}</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between font-black text-2xl text-foreground pt-2 border-t border-border/50">
              <span>{t('total')}</span>
              <span className="text-accent-primary">${subtotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Button variant="outline" className="w-full" onClick={parkOrder} disabled={cart.length === 0}>
              {t('btn_park')}
            </Button>
            <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCart([])} disabled={cart.length === 0}>
              {t('btn_clear')}
            </Button>
          </div>
          
          <Button 
            className="w-full h-14 text-lg font-bold bg-accent-primary hover:bg-accent-secondary text-white shadow-lg"
            disabled={cart.length === 0}
            onClick={() => setIsCheckoutModalOpen(true)}
          >
            {t('btn_checkout')}
          </Button>
        </div>
      </div>

      {/* Checkout Modal */}
      <Dialog open={isCheckoutModalOpen} onOpenChange={setIsCheckoutModalOpen}>
        <DialogContent className="sm:max-w-[600px] border-border/50 bg-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">{t('modal_checkout_title')}</DialogTitle>
            <DialogDescription>{t('modal_checkout_desc')}</DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center border-b border-border/50 mb-6">
            <span className="text-sm font-bold uppercase text-muted-foreground tracking-widest">{t('amount_due')}</span>
            <span className="text-5xl font-black text-accent-primary">${subtotal.toFixed(2)}</span>
          </div>
            
            <div className="grid grid-cols-2 gap-4">
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-white" onClick={() => handleCheckout('PAY_NOW')} disabled={isProcessing}>
              <ShoppingCart className="h-5 w-5" />
              <span className="font-bold">{t('btn_pay_now')}</span>
            </Button>
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleCheckout('INVOICE')} disabled={isProcessing}>
              <FileText className="h-5 w-5" />
              <span className="font-bold">{t('btn_send_invoice')}</span>
            </Button>
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleCheckout('PROPOSAL')} disabled={isProcessing}>
              <FileText className="h-5 w-5" />
              <span className="font-bold">{t('btn_convert_proposal')}</span>
            </Button>
            <Button className="h-16 flex flex-col items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => handleCheckout('RETAINER')} disabled={isProcessing}>
              <Repeat className="h-5 w-5" />
              <span className="font-bold">{t('btn_make_recurring')}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ad-Hoc Item Modal */}
      <Dialog open={isCustomItemModalOpen} onOpenChange={setIsCustomItemModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('modal_custom_title')}</DialogTitle>
            <DialogDescription>{t('modal_custom_desc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('label_item_name')}</Label>
              <Input id="name" value={customItem.name} onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })} placeholder={t('placeholder_item_name')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('label_price', { currency: '$' })}</Label>
              <Input id="price" type="number" value={customItem.price} onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCustomItemModalOpen(false)}>{t('btn_cancel')}</Button>
            <Button onClick={handleAddCustomItem}>{t('btn_add_to_cart')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
