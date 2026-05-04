// src/components/SmartAddCatalog.jsx

import { useMemo, useState } from "react";

import {
  PRODUCT_TYPES,
  EXPANSIONS,
  CATALOG_PRODUCTS,
  money,
} from "../data/catalogSeed";

export default function SmartAddCatalog({ onUseProduct }) {
  const [selectedType, setSelectedType] = useState("");
  const [selectedExpansion, setSelectedExpansion] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");

  const filteredProducts = useMemo(() => {
    return CATALOG_PRODUCTS.filter((product) => {
      const matchesType = selectedType
        ? product.itemType === selectedType
        : true;

      const matchesExpansion = selectedExpansion
        ? product.expansion === selectedExpansion
        : true;

      return matchesType && matchesExpansion;
    });
  }, [selectedType, selectedExpansion]);

  const selectedProduct = useMemo(() => {
    return CATALOG_PRODUCTS.find((product) => product.id === selectedCatalogId);
  }, [selectedCatalogId]);

  function handleUseProduct() {
    if (!selectedProduct) {
      alert("Please select a product first.");
      return;
    }

    onUseProduct(selectedProduct);
  }

  return (
    <div className="panel">
      <h2>Smart Add Catalog</h2>
      <p>
        Pick a preset product, then use it to fill the catalog form below.
      </p>

      <div className="form">
        <label>
          Item Type
          <select
            value={selectedType}
            onChange={(event) => {
              setSelectedType(event.target.value);
              setSelectedCatalogId("");
            }}
          >
            <option value="">All Types</option>
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label>
          Expansion
          <select
            value={selectedExpansion}
            onChange={(event) => {
              setSelectedExpansion(event.target.value);
              setSelectedCatalogId("");
            }}
          >
            <option value="">All Expansions</option>
            {EXPANSIONS.map((expansion) => (
              <option key={expansion.id} value={expansion.name}>
                {expansion.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Product
          <select
            value={selectedCatalogId}
            onChange={(event) => setSelectedCatalogId(event.target.value)}
          >
            <option value="">Select Product</option>
            {filteredProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        {selectedProduct && (
          <div className="inventory-card compact-card">
            <h3>{selectedProduct.name}</h3>
            <p>
              <strong>Type:</strong> {selectedProduct.itemType}
            </p>
            <p>
              <strong>Expansion:</strong> {selectedProduct.expansion}
            </p>
            <p>
              <strong>Set Code:</strong> {selectedProduct.setCode}
            </p>
            <p>
              <strong>MSRP:</strong> {money(selectedProduct.msrpPrice)}
            </p>
            <p>
              <strong>Market:</strong> {money(selectedProduct.marketPrice)}
            </p>
            <p>
              <strong>UPC:</strong>{" "}
              {selectedProduct.upcs?.length
                ? selectedProduct.upcs.join(", ")
                : "Not listed"}
            </p>
            <p>
              <strong>Pack Count:</strong>{" "}
              {selectedProduct.packCount || "Unknown"}
            </p>
          </div>
        )}

        <button type="button" onClick={handleUseProduct}>
          Use This Product in Catalog Form
        </button>
      </div>
    </div>
  );
}