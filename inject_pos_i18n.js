const fs = require('fs');
const path = require('path');

const locales = ['ar.json', 'en-IN.json', 'es.json', 'hi.json'];
const dir = path.join(__dirname, 'messages');

const posTranslations = {
  "title": "Point of Sale",
  "subtitle": "Select items to add to cart",
  "tab_services": "Services",
  "tab_products": "Products",
  "search_placeholder": "Search {mode}...",
  "btn_custom_item": "Custom Item",
  "no_items": "No items found.",
  "current_order": "Current Order",
  "select_client_ph": "Select Client (Optional)",
  "cart_empty": "Cart is empty",
  "subtotal": "Subtotal",
  "discount": "Discount",
  "total": "Total",
  "btn_park": "Park Sale",
  "btn_clear": "Clear",
  "btn_checkout": "Checkout",
  "modal_checkout_title": "Omni-Checkout",
  "modal_checkout_desc": "Select how you want to process this order.",
  "amount_due": "Amount Due:",
  "btn_pay_now": "Pay Now (Cash/Card)",
  "btn_send_invoice": "Send as Invoice",
  "btn_convert_proposal": "Convert to Proposal",
  "btn_make_recurring": "Make Recurring",
  "modal_custom_title": "Add Custom Item",
  "modal_custom_desc": "Instantly add an ad-hoc line item to the cart.",
  "label_item_name": "Item Name",
  "placeholder_item_name": "e.g. 1 Hour CSS Fix",
  "label_price": "Price",
  "btn_cancel": "Cancel",
  "btn_add_to_cart": "Add to Cart",
  "toast_catalog_fail": "Failed to load catalog",
  "toast_order_parked": "Order placed on hold",
  "toast_checkout_fail": "Checkout failed"
};

const retainerNewTranslations = {
  "mrr_impact": "MRR Impact",
  "arr": "ARR: {currency}{amount}",
  "select_client_builder": "Select Client",
  "select_client_builder_ph": "Select a client",
  "billing_freq": "Billing Frequency",
  "first_invoice_date": "First Invoice Date",
  "mid_month_start": "Mid-Month Start:",
  "prorated_msg": "The first invoice generated will automatically be prorated to <strong>{currency}{amount}</strong> for the remainder of this month.",
  "recurring_services": "Recurring Services",
  "btn_add_item": "Add Item",
  "col_service_template": "Service Template",
  "custom_service": "Custom Service",
  "custom_service_opt": "-- Custom Service --",
  "col_description": "Description",
  "ph_description": "Line item description",
  "col_qty": "Qty",
  "col_unit_price": "Unit Price"
};

for (const locale of locales) {
  const filePath = path.join(dir, locale);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Inject POS
    data["POS"] = posTranslations;
    
    // Inject Retainers enhancements
    if (!data["Retainers"]) data["Retainers"] = {};
    Object.assign(data["Retainers"], retainerNewTranslations);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Updated ${locale}`);
  }
}
