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

export default function SmartAddCatalog({ onUseProduct }) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);

  function handleUseProduct() {
    if (!selectedProduct) return;
    onUseProduct?.(selectedProduct);
  }

  return (
    <div className="panel">
      <h2>Catalog Match</h2>
      <p>Search the live TideTradr catalog and use a real Supabase product to prefill this form.</p>
      <div className="form">
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
            <p>
              <strong>UPC:</strong> {selectedProduct.upcs?.[0] || "Not listed"}
            </p>
          </div>
        ) : null}
        <button type="button" onClick={handleUseProduct} disabled={!selectedProduct}>
          Use Selected Catalog Product
        </button>
      </div>
    </div>
  );
}
