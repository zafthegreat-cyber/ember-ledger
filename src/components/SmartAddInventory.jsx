import { useMemo, useState } from "react";

import {
  PRODUCT_TYPES,
  EXPANSIONS,
  CATALOG_PRODUCTS,
  createInventoryItemFromCatalog,
  money,
} from "../data/catalogSeed";

export default function SmartAddInventory({ onAddInventory }) {
  const [selectedType, setSelectedType] = useState("");
  const [selectedExpansion, setSelectedExpansion] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");

  const [quantity, setQuantity] = useState(1);
  const [paidPriceEach, setPaidPriceEach] = useState("");
  const [sellingPriceEach, setSellingPriceEach] = useState("");
  const [purchaseSource, setPurchaseSource] = useState("");
  const [location, setLocation] = useState("Home");
  const [status, setStatus] = useState("Selling");

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

  function handleProductChange(catalogId) {
    setSelectedCatalogId(catalogId);

    const product = CATALOG_PRODUCTS.find((item) => item.id === catalogId);

    if (product) {
      setPaidPriceEach(product.msrpPrice || "");
      setSellingPriceEach(product.marketPrice || "");
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!selectedCatalogId) {
      alert("Please select a product first.");
      return;
    }

    const newInventoryItem = createInventoryItemFromCatalog({
      catalogId: selectedCatalogId,
      quantity,
      paidPriceEach,
      sellingPriceEach,
      purchaseSource,
      location,
      status,
    });

    onAddInventory(newInventoryItem);

    setSelectedType("");
    setSelectedExpansion("");
    setSelectedCatalogId("");
    setQuantity(1);
    setPaidPriceEach("");
    setSellingPriceEach("");
    setPurchaseSource("");
    setLocation("Home");
    setStatus("Selling");
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Smart Add Inventory</h2>
      <p style={styles.subtext}>
        Pick the type, expansion, and product. MSRP and market price will autofill.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Item Type
          <select
            value={selectedType}
            onChange={(event) => {
              setSelectedType(event.target.value);
              setSelectedCatalogId("");
            }}
            style={styles.input}
          >
            <option value="">All Types</option>
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Expansion
          <select
            value={selectedExpansion}
            onChange={(event) => {
              setSelectedExpansion(event.target.value);
              setSelectedCatalogId("");
            }}
            style={styles.input}
          >
            <option value="">All Expansions</option>
            {EXPANSIONS.map((expansion) => (
              <option key={expansion.id} value={expansion.name}>
                {expansion.name}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Product
          <select
            value={selectedCatalogId}
            onChange={(event) => handleProductChange(event.target.value)}
            style={styles.input}
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
          <div style={styles.previewBox}>
            <h3 style={styles.previewTitle}>{selectedProduct.name}</h3>

            <div style={styles.previewGrid}>
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
                <strong>Pack Count:</strong>{" "}
                {selectedProduct.packCount || "Unknown"}
              </p>
              <p>
                <strong>Condition:</strong>{" "}
                {selectedProduct.conditionDefault || "MT"}
              </p>
              <p>
                <strong>Language:</strong>{" "}
                {selectedProduct.languageDefault || "EN"}
              </p>
            </div>
          </div>
        )}

        <div style={styles.twoColumn}>
          <label style={styles.label}>
            Quantity
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            What We Paid Each
            <input
              type="number"
              min="0"
              step="0.01"
              value={paidPriceEach}
              onChange={(event) => setPaidPriceEach(event.target.value)}
              style={styles.input}
            />
          </label>
        </div>

        <div style={styles.twoColumn}>
          <label style={styles.label}>
            Selling Price Each
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellingPriceEach}
              onChange={(event) => setSellingPriceEach(event.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Purchase Source
            <input
              type="text"
              value={purchaseSource}
              onChange={(event) => setPurchaseSource(event.target.value)}
              placeholder="Target, Walmart, Sam's, trade..."
              style={styles.input}
            />
          </label>
        </div>

        <div style={styles.twoColumn}>
          <label style={styles.label}>
            Location
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              style={styles.input}
            >
              <option value="Selling">Selling</option>
              <option value="Holding">Holding</option>
              <option value="Personal Collection">Personal Collection</option>
              <option value="Sold">Sold</option>
            </select>
          </label>
        </div>

        <button type="submit" style={styles.button}>
          Add to Inventory
        </button>
      </form>
    </div>
  );
}

const styles = {
  card: {
    border: "1px solid #ddd",
    borderRadius: "16px",
    padding: "20px",
    background: "white",
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
    marginBottom: "24px",
  },
  heading: {
    margin: "0 0 6px",
    fontSize: "24px",
  },
  subtext: {
    margin: "0 0 16px",
    color: "#555",
  },
  form: {
    display: "grid",
    gap: "14px",
  },
  label: {
    display: "grid",
    gap: "6px",
    fontWeight: "600",
  },
  input: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    fontSize: "14px",
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  previewBox: {
    background: "#f7f7f7",
    borderRadius: "14px",
    padding: "14px",
    border: "1px solid #e5e5e5",
  },
  previewTitle: {
    margin: "0 0 10px",
  },
  previewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "6px 14px",
    fontSize: "14px",
  },
  button: {
    padding: "12px 16px",
    borderRadius: "12px",
    border: "none",
    background: "black",
    color: "white",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "15px",
  },
};