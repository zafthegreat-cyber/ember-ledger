import { useState } from "react";
import SmartCatalogSearchBox from "./SmartCatalogSearchBox";
import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { getProductImageFallback, getProductImageUrl } from "../utils/productDisplayUtils";

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
    imageUrl: getProductImageUrl(row),
    upcs: [row.barcode || row.upc || ""].filter(Boolean),
    rawCatalogProduct: row,
  };
}

export default function SmartAddCatalog({ onUseProduct, localCatalogProducts = [] }) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);

  function handleUseProduct() {
    if (!selectedProduct) return;
    onUseProduct?.(selectedProduct);
  }

  return (
    <div className="panel">
      <h2>Catalog Match</h2>
      <p>Search the Market Watch catalog and use a real product record to prefill this form.</p>
      <div className="form">
        <SmartCatalogSearchBox
          value={query}
          onChange={setQuery}
          supabase={supabase}
          isSupabaseConfigured={isSupabaseConfigured}
          placeholder="Search product, UPC, SKU"
          maxSuggestions={6}
          localCatalogProducts={localCatalogProducts}
          onSelectSuggestion={(suggestion) => {
            if (!suggestion.product) return;
            const product = mapCatalogProduct(suggestion.product);
            setSelectedProduct(product);
            setQuery(product.name);
          }}
        />
        {selectedProduct ? (
          <div className="inventory-card compact-card forge-selected-product-card">
            <div className="catalog-thumb">
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                  }}
                />
              ) : null}
              <span className="image-needed-placeholder branded-product-fallback" hidden={Boolean(selectedProduct.imageUrl)}>
                <strong>{selectedProduct.name}</strong>
                <small>{getProductImageFallback({ ...selectedProduct, productType: selectedProduct.itemType, setName: selectedProduct.expansion }).meta}</small>
              </span>
            </div>
            <div>
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
          </div>
        ) : null}
        <button type="button" onClick={handleUseProduct} disabled={!selectedProduct}>
          Use Selected Catalog Product
        </button>
      </div>
    </div>
  );
}
