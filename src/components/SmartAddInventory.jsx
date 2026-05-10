import { useState } from "react";
import SmartCatalogSearchBox from "./SmartCatalogSearchBox";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

function mapCatalogProduct(row = {}) {
  return {
    id: row.id,
    name: row.name || row.product_name || row.card_name || "",
    itemType: row.product_type || row.productType || "",
    expansion: row.set_name || row.expansion || "",
    setCode: row.set_code || row.setCode || "",
    productLine: row.product_line || row.productLine || "",
    packCount: row.pack_count || row.packCount || "",
    marketPrice: row.market_price ?? row.marketPrice ?? "",
    msrpPrice: row.msrp_price ?? row.msrpPrice ?? "",
    upcs: [row.barcode || row.upc || ""].filter(Boolean),
    rawCatalogProduct: row,
  };
}

export default function SmartAddInventory({ onAddInventory }) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [paidPriceEach, setPaidPriceEach] = useState("");
  const [sellingPriceEach, setSellingPriceEach] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!selectedProduct) return;
    onAddInventory?.({
      product: selectedProduct,
      quantity,
      paidPriceEach,
      sellingPriceEach,
    });
  }

  return (
    <div className="panel compact-panel">
      <h2>Catalog Picker</h2>
      <p>Search the live TideTradr catalog and prefill inventory details from a real product.</p>
      <form className="form" onSubmit={handleSubmit}>
        <SmartCatalogSearchBox
          value={query}
          onChange={setQuery}
          supabase={supabase}
          isSupabaseConfigured={isSupabaseConfigured}
          placeholder="Search product, UPC, SKU"
          maxSuggestions={6}
          onSelectSuggestion={(suggestion) => {
            if (!suggestion.product) return;
            const product = mapCatalogProduct(suggestion.product);
            setSelectedProduct(product);
            setQuery(product.name);
            setPaidPriceEach(product.msrpPrice || "");
            setSellingPriceEach(product.marketPrice || "");
          }}
        />
        {selectedProduct ? (
          <div className="inventory-card compact-card">
            <h3>{selectedProduct.name}</h3>
            <p>
              <strong>Type:</strong> {selectedProduct.itemType || "Unknown"}
            </p>
            <p>
              <strong>Set:</strong> {selectedProduct.expansion || "Unknown"}
            </p>
          </div>
        ) : null}
        <div className="form-grid two-column-grid">
          <label>
            Quantity
            <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label>
            Cost Each
            <input type="number" min="0" step="0.01" value={paidPriceEach} onChange={(event) => setPaidPriceEach(event.target.value)} />
          </label>
          <label>
            Sell Price Each
            <input type="number" min="0" step="0.01" value={sellingPriceEach} onChange={(event) => setSellingPriceEach(event.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={!selectedProduct}>
          Use Selected Product
        </button>
      </form>
    </div>
  );
}
