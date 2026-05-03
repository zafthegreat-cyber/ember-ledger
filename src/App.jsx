import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import "./App.css";
import { supabase } from "./supabaseClient";

const IRS_MILEAGE_RATE = 0.725;
const PEOPLE = ["Zena", "Dillon", "Joint", "Other"];
const CATEGORIES = ["Pokemon", "Makeup", "Clothes", "Candy", "Collectibles", "Supplies", "Other"];
const STATUSES = ["In Stock", "Needs Photos", "Needs DeckTradr Check", "Ready to List", "Listed", "Sold", "Held", "Personal Collection", "Damaged"];
const PLATFORMS = ["eBay", "Mercari", "Whatnot", "Facebook Marketplace", "In-Store", "Instagram", "TikTok Shop", "Other"];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function statusClass(status) {
  return `status-badge ${String(status || "In Stock")
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("/", "-")}`;
}

function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const reader = new BrowserMultiFormatReader();
        controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && mounted) {
            onScan(result.getText());
            controlsRef.current?.stop();
          }
        });
      } catch {
        setScannerError("Camera could not start. Check permissions or use the manual barcode field.");
      }
    }

    start();

    return () => {
      mounted = false;
      controlsRef.current?.stop();
    };
  }, [onScan]);

  return (
    <div className="panel">
      <h2>Scan Barcode</h2>
      <p>Point your camera at the barcode. Use good lighting and hold the barcode flat.</p>
      {scannerError && <p>{scannerError}</p>}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          maxWidth: "420px",
          borderRadius: "16px",
          border: "1px solid #ddd7d2",
          background: "#000",
        }}
      />
      <button type="button" className="secondary-button" onClick={onClose}>Close Scanner</button>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const [treasureClicks, setTreasureClicks] = useState(0);
  const [showTreasure, setShowTreasure] = useState(false);

  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [mileageTrips, setMileageTrips] = useState([]);

  const [showInventoryScanner, setShowInventoryScanner] = useState(false);
  const [showCatalogScanner, setShowCatalogScanner] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState("All");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportPreview, setBulkImportPreview] = useState([]);

  const [editingItemId, setEditingItemId] = useState(null);
  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingSaleId, setEditingSaleId] = useState(null);

  const blankItem = {
    name: "",
    buyer: "Zena",
    category: "Pokemon",
    store: "",
    quantity: 1,
    unitCost: "",
    salePrice: "",
    receiptImage: "",
    itemImage: "",
    barcode: "",
    catalogProductId: "",
    externalProductId: "",
    decktradrUrl: "",
    marketPrice: "",
    lowPrice: "",
    midPrice: "",
    highPrice: "",
    status: "In Stock",
    listingPlatform: "",
    listingUrl: "",
    listedPrice: "",
    actionNotes: "",
  };

  const blankCatalog = {
    name: "",
    category: "Pokemon",
    setName: "",
    productType: "",
    barcode: "",
    externalProductId: "",
    marketUrl: "",
    imageUrl: "",
    marketPrice: "",
    lowPrice: "",
    midPrice: "",
    highPrice: "",
    notes: "",
  };

  const [itemForm, setItemForm] = useState(blankItem);
  const [catalogForm, setCatalogForm] = useState(blankCatalog);
  const [expenseForm, setExpenseForm] = useState({ vendor: "", category: "Supplies", buyer: "Zena", amount: "", notes: "", receiptImage: "" });
  const [vehicleForm, setVehicleForm] = useState({ name: "", owner: "Zena", averageMpg: "", wearCostPerMile: "", notes: "" });
  const [tripForm, setTripForm] = useState({ purpose: "", driver: "Zena", vehicleId: "", startMiles: "", endMiles: "", gasPrice: "", notes: "", gasReceiptImage: "" });
  const [saleForm, setSaleForm] = useState({ itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCost: "", platformFees: "", notes: "" });

  const navSections = [
    { title: "Overview", items: [{ key: "dashboard", label: "Dashboard" }, { key: "reports", label: "Reports" }, { key: "decktradr", label: "DeckTradr API" }] },
    { title: "Inventory", items: [{ key: "inventory", label: "Inventory" }, { key: "addInventory", label: "Add Inventory" }, { key: "catalog", label: "Catalog" }] },
    { title: "Sales & Money", items: [{ key: "sales", label: "Sales" }, { key: "addSale", label: "Add Sale" }, { key: "expenses", label: "Expenses" }] },
    { title: "Operations", items: [{ key: "mileage", label: "Mileage" }, { key: "vehicles", label: "Vehicles" }] },
  ];

  const activeTabLabel = navSections.flatMap((s) => s.items).find((i) => i.key === activeTab)?.label || "Dashboard";

  const updateItemForm = (field, value) => setItemForm((old) => ({ ...old, [field]: value }));
  const updateCatalogForm = (field, value) => setCatalogForm((old) => ({ ...old, [field]: value }));
  const updateExpenseForm = (field, value) => setExpenseForm((old) => ({ ...old, [field]: value }));
  const updateVehicleForm = (field, value) => setVehicleForm((old) => ({ ...old, [field]: value }));
  const updateTripForm = (field, value) => setTripForm((old) => ({ ...old, [field]: value }));
  const updateSaleForm = (field, value) => setSaleForm((old) => ({ ...old, [field]: value }));

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) loadAllData();
    else {
      setItems([]);
      setCatalogProducts([]);
      setExpenses([]);
      setSales([]);
      setVehicles([]);
      setMileageTrips([]);
    }
  }, [user]);

  async function checkUser() {
    const { data, error } = await supabase.auth.getUser();
    if (!error) setUser(data.user);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) return alert(error.message);
        if (!data.session) {
          alert("Account created. Please check your email, confirm your account, then log in.");
          setAuthMode("login");
          return;
        }
        setUser(data.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) return alert(error.message);
        setUser(data.user);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  async function loadAllData() {
    await Promise.all([loadInventory(), loadCatalog(), loadExpenses(), loadSales(), loadVehicles(), loadTrips()]);
  }

  function mapItem(row) {
    return {
      id: row.id,
      name: row.name || "",
      sku: row.sku || "",
      buyer: row.buyer || "Zena",
      category: row.category || "Pokemon",
      store: row.store || "",
      quantity: Number(row.quantity || 0),
      unitCost: Number(row.unit_cost || 0),
      salePrice: Number(row.sale_price || 0),
      receiptImage: row.receipt_image || "",
      itemImage: row.item_image || "",
      barcode: row.barcode || "",
      catalogProductId: row.catalog_product_id || "",
      catalogProductName: row.catalog_product_name || "",
      externalProductId: row.external_product_id || "",
      decktradrUrl: row.tcgplayer_url || "",
      externalProductSource: row.external_product_source || "DeckTradr",
      marketPrice: Number(row.market_price || 0),
      lowPrice: Number(row.low_price || 0),
      midPrice: Number(row.mid_price || 0),
      highPrice: Number(row.high_price || 0),
      status: row.status || "In Stock",
      listingPlatform: row.listing_platform || "",
      listingUrl: row.listing_url || "",
      listedPrice: Number(row.listed_price || 0),
      actionNotes: row.action_notes || "",
      lastPriceChecked: row.last_price_checked || "",
      createdAt: row.created_at,
    };
  }

  function mapCatalog(row) {
    return {
      id: row.id,
      name: row.name || "",
      category: row.category || "Pokemon",
      setName: row.set_name || "",
      productType: row.product_type || "",
      barcode: row.barcode || "",
      marketSource: row.market_source || "DeckTradr",
      externalProductId: row.external_product_id || "",
      marketUrl: row.market_url || "",
      imageUrl: row.image_url || "",
      marketPrice: Number(row.market_price || 0),
      lowPrice: Number(row.low_price || 0),
      midPrice: Number(row.mid_price || 0),
      highPrice: Number(row.high_price || 0),
      notes: row.notes || "",
      createdAt: row.created_at,
    };
  }

  function mapExpense(row) {
    return { id: row.id, vendor: row.vendor || "", category: row.category || "Supplies", buyer: row.buyer || "Zena", amount: Number(row.amount || 0), notes: row.notes || "", receiptImage: row.receipt_image || "", createdAt: row.created_at };
  }

  function mapVehicle(row) {
    return { id: row.id, name: row.name || "", owner: row.owner || "Zena", averageMpg: Number(row.average_mpg || 0), wearCostPerMile: Number(row.wear_cost_per_mile || 0), notes: row.notes || "", createdAt: row.created_at };
  }

  function mapTrip(row) {
    return { id: row.id, vehicleId: row.vehicle_id, vehicleName: row.vehicle_name || "", purpose: row.purpose || "", driver: row.driver || "Zena", startMiles: Number(row.start_miles || 0), endMiles: Number(row.end_miles || 0), businessMiles: Number(row.business_miles || 0), gasPrice: Number(row.gas_price || 0), fuelCost: Number(row.fuel_cost || 0), wearCost: Number(row.wear_cost || 0), totalVehicleCost: Number(row.total_vehicle_cost || 0), mileageValue: Number(row.mileage_value || 0), gasReceiptImage: row.gas_receipt_image || "", notes: row.notes || "", createdAt: row.created_at };
  }

  function mapSale(row) {
    return { id: row.id, itemId: row.item_id, itemName: row.item_name || "", sku: row.sku || "", platform: row.platform || "", quantitySold: Number(row.quantity_sold || 0), finalSalePrice: Number(row.final_sale_price || 0), grossSale: Number(row.gross_sale || 0), itemCost: Number(row.item_cost || 0), shippingCost: Number(row.shipping_cost || 0), platformFees: Number(row.platform_fees || 0), netProfit: Number(row.net_profit || 0), notes: row.notes || "", createdAt: row.created_at };
  }

  async function loadInventory() {
    const { data, error } = await supabase.from("inventory_items").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load inventory: " + error.message);
    setItems(data.map(mapItem));
  }

  async function loadCatalog() {
    const { data, error } = await supabase.from("product_catalog").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load catalog: " + error.message);
    setCatalogProducts(data.map(mapCatalog));
  }

  async function loadExpenses() {
    const { data, error } = await supabase.from("business_expenses").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load expenses: " + error.message);
    setExpenses(data.map(mapExpense));
  }

  async function loadSales() {
    const { data, error } = await supabase.from("sales_records").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load sales: " + error.message);
    setSales(data.map(mapSale));
  }

  async function loadVehicles() {
    const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load vehicles: " + error.message);
    setVehicles(data.map(mapVehicle));
  }

  async function loadTrips() {
    const { data, error } = await supabase.from("mileage_trips").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load mileage trips: " + error.message);
    setMileageTrips(data.map(mapTrip));
  }

  async function handleImageUpload(event, setter, folder = "misc") {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please upload an image file.");
    if (!user) return alert("Please log in before uploading images.");

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from("receipts").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    if (error) return alert("Could not upload image: " + error.message);

    const { data } = supabase.storage.from("receipts").getPublicUrl(filePath);
    setter(data.publicUrl);
  }

  function getMatchingItem(form) {
    const cleanName = form.name.trim().toLowerCase();
    const cleanBarcode = String(form.barcode || "").trim();

    return items.find((item) => {
      const sameCatalog = form.catalogProductId && item.catalogProductId === form.catalogProductId;
      const sameBarcode = cleanBarcode && item.barcode === cleanBarcode;
      const sameNameCategory = item.name.trim().toLowerCase() === cleanName && String(item.category || "").toLowerCase() === String(form.category || "").toLowerCase();
      return sameCatalog || sameBarcode || sameNameCategory;
    });
  }

  async function addItem(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!itemForm.name || !itemForm.unitCost || !itemForm.quantity) return alert("Please fill out item name, quantity, and unit cost.");

    const existing = getMatchingItem(itemForm);
    if (existing && !editingItemId) {
      const addedQty = Number(itemForm.quantity);
      const addedCost = Number(itemForm.unitCost);
      const oldQty = Number(existing.quantity || 0);
      const oldCost = Number(existing.unitCost || 0);
      const newQty = oldQty + addedQty;
      const weightedCost = newQty > 0 ? (oldQty * oldCost + addedQty * addedCost) / newQty : addedCost;

      const row = {
        quantity: newQty,
        unit_cost: weightedCost,
        sale_price: Number(itemForm.salePrice || existing.salePrice || 0),
        market_price: Number(itemForm.marketPrice || existing.marketPrice || 0),
        low_price: Number(itemForm.lowPrice || existing.lowPrice || 0),
        mid_price: Number(itemForm.midPrice || existing.midPrice || 0),
        high_price: Number(itemForm.highPrice || existing.highPrice || 0),
        receipt_image: itemForm.receiptImage || existing.receiptImage || "",
        item_image: itemForm.itemImage || existing.itemImage || "",
        barcode: itemForm.barcode || existing.barcode || "",
        external_product_source: "DeckTradr",
        external_product_id: itemForm.externalProductId || existing.externalProductId || "",
        tcgplayer_url: itemForm.decktradrUrl || existing.decktradrUrl || "",
        status: itemForm.status || existing.status || "In Stock",
        listing_platform: itemForm.listingPlatform || existing.listingPlatform || "",
        listing_url: itemForm.listingUrl || existing.listingUrl || "",
        listed_price: Number(itemForm.listedPrice || existing.listedPrice || 0),
        action_notes: itemForm.actionNotes || existing.actionNotes || "",
        last_price_checked: itemForm.marketPrice ? new Date().toISOString() : existing.lastPriceChecked || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from("inventory_items").update(row).eq("id", existing.id).select().single();
      if (error) return alert("Could not merge restock: " + error.message);
      setItems(items.map((item) => (item.id === existing.id ? mapItem(data) : item)));
      setItemForm(blankItem);
      setActiveTab("inventory");
      return;
    }

    const selectedCatalog = catalogProducts.find((product) => String(product.id) === String(itemForm.catalogProductId));

    const row = {
      user_id: user.id,
      name: itemForm.name,
      buyer: itemForm.buyer,
      category: itemForm.category,
      store: itemForm.store,
      quantity: Number(itemForm.quantity),
      unit_cost: Number(itemForm.unitCost),
      sale_price: Number(itemForm.salePrice || 0),
      sku: "ET-" + Date.now(),
      receipt_image: itemForm.receiptImage,
      item_image: itemForm.itemImage,
      barcode: itemForm.barcode,
      catalog_product_id: selectedCatalog?.id || null,
      catalog_product_name: selectedCatalog?.name || "",
      external_product_source: "DeckTradr",
      external_product_id: itemForm.externalProductId,
      tcgplayer_url: itemForm.decktradrUrl,
      market_price: Number(itemForm.marketPrice || 0),
      low_price: Number(itemForm.lowPrice || 0),
      mid_price: Number(itemForm.midPrice || 0),
      high_price: Number(itemForm.highPrice || 0),
      last_price_checked: itemForm.marketPrice ? new Date().toISOString() : null,
      status: itemForm.status,
      listing_platform: itemForm.listingPlatform,
      listing_url: itemForm.listingUrl,
      listed_price: Number(itemForm.listedPrice || 0),
      action_notes: itemForm.actionNotes,
    };

    const { data, error } = await supabase.from("inventory_items").insert(row).select().single();
    if (error) return alert("Could not add item: " + error.message);

    setItems([mapItem(data), ...items]);
    setItemForm(blankItem);
    setActiveTab("inventory");
  }

  async function saveEditedItem(event) {
    event.preventDefault();
    if (!itemForm.name || !itemForm.unitCost || !itemForm.quantity) return alert("Please fill out item name, quantity, and unit cost.");

    const row = {
      name: itemForm.name,
      buyer: itemForm.buyer,
      category: itemForm.category,
      store: itemForm.store,
      quantity: Number(itemForm.quantity),
      unit_cost: Number(itemForm.unitCost),
      sale_price: Number(itemForm.salePrice || 0),
      receipt_image: itemForm.receiptImage,
      item_image: itemForm.itemImage,
      barcode: itemForm.barcode,
      external_product_source: "DeckTradr",
      external_product_id: itemForm.externalProductId,
      tcgplayer_url: itemForm.decktradrUrl,
      market_price: Number(itemForm.marketPrice || 0),
      low_price: Number(itemForm.lowPrice || 0),
      mid_price: Number(itemForm.midPrice || 0),
      high_price: Number(itemForm.highPrice || 0),
      last_price_checked: itemForm.marketPrice ? new Date().toISOString() : null,
      status: itemForm.status,
      listing_platform: itemForm.listingPlatform,
      listing_url: itemForm.listingUrl,
      listed_price: Number(itemForm.listedPrice || 0),
      action_notes: itemForm.actionNotes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("inventory_items").update(row).eq("id", editingItemId).select().single();
    if (error) return alert("Could not update item: " + error.message);

    setItems(items.map((item) => (item.id === editingItemId ? mapItem(data) : item)));
    setEditingItemId(null);
    setItemForm(blankItem);
  }

  function startEditingItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      buyer: item.buyer,
      category: item.category,
      store: item.store,
      quantity: item.quantity,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
      receiptImage: item.receiptImage,
      itemImage: item.itemImage,
      barcode: item.barcode,
      catalogProductId: item.catalogProductId,
      externalProductId: item.externalProductId,
      decktradrUrl: item.decktradrUrl,
      marketPrice: item.marketPrice,
      lowPrice: item.lowPrice,
      midPrice: item.midPrice,
      highPrice: item.highPrice,
      status: item.status,
      listingPlatform: item.listingPlatform,
      listingUrl: item.listingUrl,
      listedPrice: item.listedPrice,
      actionNotes: item.actionNotes,
    });
    setActiveTab("inventory");
  }

  function prepareRestock(item) {
    setEditingItemId(null);
    setItemForm({
      ...blankItem,
      name: item.name,
      buyer: item.buyer,
      category: item.category,
      store: item.store,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
      itemImage: item.itemImage,
      barcode: item.barcode,
      catalogProductId: item.catalogProductId,
      externalProductId: item.externalProductId,
      decktradrUrl: item.decktradrUrl,
      marketPrice: item.marketPrice,
      lowPrice: item.lowPrice,
      midPrice: item.midPrice,
      highPrice: item.highPrice,
      status: item.status,
      listingPlatform: item.listingPlatform,
      listingUrl: item.listingUrl,
      listedPrice: item.listedPrice,
      actionNotes: item.actionNotes,
    });
    setActiveTab("addInventory");
  }

  async function deleteItem(id) {
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) return alert("Could not delete item: " + error.message);
    setItems(items.filter((item) => item.id !== id));
  }

  async function addCatalogProduct(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!catalogForm.name) return alert("Please enter a product name.");

    const row = {
      user_id: user.id,
      name: catalogForm.name,
      category: catalogForm.category,
      set_name: catalogForm.setName,
      product_type: catalogForm.productType,
      barcode: catalogForm.barcode,
      market_source: "DeckTradr",
      external_product_id: catalogForm.externalProductId,
      market_url: catalogForm.marketUrl,
      image_url: catalogForm.imageUrl,
      market_price: Number(catalogForm.marketPrice || 0),
      low_price: Number(catalogForm.lowPrice || 0),
      mid_price: Number(catalogForm.midPrice || 0),
      high_price: Number(catalogForm.highPrice || 0),
      notes: catalogForm.notes,
      last_price_checked: catalogForm.marketPrice ? new Date().toISOString() : null,
    };

    const { data, error } = editingCatalogId
      ? await supabase.from("product_catalog").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingCatalogId).select().single()
      : await supabase.from("product_catalog").insert(row).select().single();

    if (error) return alert("Could not save catalog product: " + error.message);

    const mapped = mapCatalog(data);
    setCatalogProducts(editingCatalogId ? catalogProducts.map((p) => (p.id === editingCatalogId ? mapped : p)) : [mapped, ...catalogProducts]);
    setEditingCatalogId(null);
    setCatalogForm(blankCatalog);
  }

  function startEditingCatalogProduct(product) {
    setEditingCatalogId(product.id);
    setCatalogForm({
      name: product.name,
      category: product.category,
      setName: product.setName,
      productType: product.productType,
      barcode: product.barcode,
      externalProductId: product.externalProductId,
      marketUrl: product.marketUrl,
      imageUrl: product.imageUrl,
      marketPrice: product.marketPrice,
      lowPrice: product.lowPrice,
      midPrice: product.midPrice,
      highPrice: product.highPrice,
      notes: product.notes,
    });
  }

  async function deleteCatalogProduct(id) {
    const { error } = await supabase.from("product_catalog").delete().eq("id", id);
    if (error) return alert("Could not delete catalog product: " + error.message);
    setCatalogProducts(catalogProducts.filter((product) => product.id !== id));
  }

  function applyCatalogProduct(productId) {
    updateItemForm("catalogProductId", productId);
    const product = catalogProducts.find((p) => String(p.id) === String(productId));
    if (!product) return;

    setItemForm((old) => ({
      ...old,
      catalogProductId: productId,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      externalProductId: product.externalProductId,
      decktradrUrl: product.marketUrl,
      marketPrice: product.marketPrice,
      lowPrice: product.lowPrice,
      midPrice: product.midPrice,
      highPrice: product.highPrice,
      itemImage: product.imageUrl,

      
    }));
    function parseBulkCatalogText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const parts = line
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      tempId: index + 1,
      name: parts[0] || "",
      category: parts[1] || "Pokemon",
      setName: parts[2] || "",
      productType: parts[3] || "",
      barcode: parts[4] || "",
      marketPrice: Number(parts[5] || 0),
      lowPrice: Number(parts[6] || 0),
      midPrice: Number(parts[7] || 0),
      highPrice: Number(parts[8] || 0),
      notes: parts[9] || "",
    };
  });
}

function previewBulkCatalogImport() {
  const parsed = parseBulkCatalogText(bulkImportText).filter(
    (item) => item.name
  );

  if (parsed.length === 0) {
    alert("No valid items found. Each line should start with a product name.");
    return;
  }

  setBulkImportPreview(parsed);
}

function handleBulkCatalogFileUpload(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const text = String(reader.result || "");
    setBulkImportText(text);
    const parsed = parseBulkCatalogText(text).filter((item) => item.name);
    setBulkImportPreview(parsed);
  };

  reader.readAsText(file);
}

async function importBulkCatalogProducts() {
  if (!user) {
    alert("Please log in first.");
    return;
  }

  if (bulkImportPreview.length === 0) {
    alert("Preview items before importing.");
    return;
  }

  const rows = bulkImportPreview.map((item) => ({
    user_id: user.id,
    name: item.name,
    category: item.category || "Pokemon",
    set_name: item.setName || "",
    product_type: item.productType || "",
    barcode: item.barcode || "",
    market_source: "DeckTradr",
    external_product_id: "",
    market_url: "",
    image_url: "",
    market_price: Number(item.marketPrice || 0),
    low_price: Number(item.lowPrice || 0),
    mid_price: Number(item.midPrice || 0),
    high_price: Number(item.highPrice || 0),
    notes: item.notes || "",
    last_price_checked: item.marketPrice ? new Date().toISOString() : null,
  }));

  const { data, error } = await supabase
    .from("product_catalog")
    .insert(rows)
    .select();

  if (error) {
    alert("Could not import catalog products: " + error.message);
    return;
  }

  setCatalogProducts([
    ...data.map(mapCatalog),
    ...catalogProducts,
  ]);

  setBulkImportText("");
  setBulkImportPreview([]);

  alert(`Imported ${data.length} catalog products.`);
}
  }

  async function addExpense(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!expenseForm.vendor || !expenseForm.amount) return alert("Please enter vendor and amount.");

    const row = {
      user_id: user.id,
      vendor: expenseForm.vendor,
      category: expenseForm.category,
      buyer: expenseForm.buyer,
      amount: Number(expenseForm.amount),
      notes: expenseForm.notes,
      receipt_image: expenseForm.receiptImage,
    };

    const { data, error } = editingExpenseId
      ? await supabase.from("business_expenses").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingExpenseId).select().single()
      : await supabase.from("business_expenses").insert(row).select().single();

    if (error) return alert("Could not save expense: " + error.message);

    const mapped = mapExpense(data);
    setExpenses(editingExpenseId ? expenses.map((e) => (e.id === editingExpenseId ? mapped : e)) : [mapped, ...expenses]);
    setEditingExpenseId(null);
    setExpenseForm({ vendor: "", category: "Supplies", buyer: "Zena", amount: "", notes: "", receiptImage: "" });
  }

  function startEditingExpense(expense) {
    setEditingExpenseId(expense.id);
    setExpenseForm(expense);
  }

  async function deleteExpense(id) {
    const { error } = await supabase.from("business_expenses").delete().eq("id", id);
    if (error) return alert("Could not delete expense: " + error.message);
    setExpenses(expenses.filter((expense) => expense.id !== id));
  }

  async function addVehicle(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!vehicleForm.name || !vehicleForm.averageMpg) return alert("Please enter vehicle name and average MPG.");

    const row = {
      user_id: user.id,
      name: vehicleForm.name,
      owner: vehicleForm.owner,
      average_mpg: Number(vehicleForm.averageMpg),
      wear_cost_per_mile: Number(vehicleForm.wearCostPerMile || 0),
      notes: vehicleForm.notes,
    };

    const { data, error } = editingVehicleId
      ? await supabase.from("vehicles").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingVehicleId).select().single()
      : await supabase.from("vehicles").insert(row).select().single();

    if (error) return alert("Could not save vehicle: " + error.message);

    const mapped = mapVehicle(data);
    setVehicles(editingVehicleId ? vehicles.map((v) => (v.id === editingVehicleId ? mapped : v)) : [mapped, ...vehicles]);
    setEditingVehicleId(null);
    setVehicleForm({ name: "", owner: "Zena", averageMpg: "", wearCostPerMile: "", notes: "" });
  }

  function startEditingVehicle(vehicle) {
    setEditingVehicleId(vehicle.id);
    setVehicleForm(vehicle);
  }

  async function deleteVehicle(id) {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) return alert("Could not delete vehicle: " + error.message);
    setVehicles(vehicles.filter((vehicle) => vehicle.id !== id));
  }

  function calculateTripCosts(form) {
    const vehicle = vehicles.find((v) => String(v.id) === String(form.vehicleId));
    const businessMiles = Number(form.endMiles) - Number(form.startMiles);
    const mpg = Number(vehicle?.averageMpg || 0);
    const wearRate = Number(vehicle?.wearCostPerMile || 0);
    const gasPrice = Number(form.gasPrice || 0);
    const fuelCost = mpg > 0 ? (businessMiles / mpg) * gasPrice : 0;
    const wearCost = businessMiles * wearRate;

    return { vehicle, businessMiles, gasPrice, fuelCost, wearCost, totalVehicleCost: fuelCost + wearCost, mileageValue: businessMiles * IRS_MILEAGE_RATE };
  }

  async function addTrip(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!tripForm.purpose || !tripForm.startMiles || !tripForm.endMiles) return alert("Please enter purpose, start miles, and end miles.");
    if (!tripForm.gasPrice) return alert("Please enter gas price paid.");

    const costs = calculateTripCosts(tripForm);
    if (costs.businessMiles < 0) return alert("Ending mileage must be higher than starting mileage.");

    const row = {
      user_id: user.id,
      vehicle_id: costs.vehicle?.id || null,
      vehicle_name: costs.vehicle?.name || "",
      purpose: tripForm.purpose,
      driver: tripForm.driver,
      start_miles: Number(tripForm.startMiles),
      end_miles: Number(tripForm.endMiles),
      business_miles: costs.businessMiles,
      gas_price: costs.gasPrice,
      fuel_cost: costs.fuelCost,
      wear_cost_per_mile: Number(costs.vehicle?.wearCostPerMile || 0),
      wear_cost: costs.wearCost,
      total_vehicle_cost: costs.totalVehicleCost,
      mileage_value: costs.mileageValue,
      gas_receipt_image: tripForm.gasReceiptImage,
      notes: tripForm.notes,
    };

    const { data, error } = editingTripId
      ? await supabase.from("mileage_trips").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingTripId).select().single()
      : await supabase.from("mileage_trips").insert(row).select().single();

    if (error) return alert("Could not save mileage trip: " + error.message);

    const mapped = mapTrip(data);
    setMileageTrips(editingTripId ? mileageTrips.map((t) => (t.id === editingTripId ? mapped : t)) : [mapped, ...mileageTrips]);
    setEditingTripId(null);
    setTripForm({ purpose: "", driver: "Zena", vehicleId: "", startMiles: "", endMiles: "", gasPrice: "", notes: "", gasReceiptImage: "" });
  }

  function startEditingTrip(trip) {
    setEditingTripId(trip.id);
    setTripForm({ purpose: trip.purpose, driver: trip.driver, vehicleId: trip.vehicleId || "", startMiles: trip.startMiles, endMiles: trip.endMiles, gasPrice: trip.gasPrice, notes: trip.notes, gasReceiptImage: trip.gasReceiptImage });
  }

  async function deleteTrip(id) {
    const { error } = await supabase.from("mileage_trips").delete().eq("id", id);
    if (error) return alert("Could not delete trip: " + error.message);
    setMileageTrips(mileageTrips.filter((trip) => trip.id !== id));
  }

  async function addSale(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!saleForm.itemId || !saleForm.quantitySold || !saleForm.finalSalePrice) return alert("Please choose item, quantity, and price.");

    const item = items.find((i) => String(i.id) === String(saleForm.itemId));
    if (!item) return alert("Item not found.");

    const qty = Number(saleForm.quantitySold);
    if (qty > item.quantity) return alert("You cannot sell more than you have.");

    const price = Number(saleForm.finalSalePrice);
    const shipping = Number(saleForm.shippingCost || 0);
    const fees = Number(saleForm.platformFees || 0);
    const itemCost = item.unitCost * qty;
    const grossSale = price * qty;
    const netProfit = grossSale - itemCost - shipping - fees;
    const remaining = item.quantity - qty;

    const row = {
      user_id: user.id,
      item_id: item.id,
      item_name: item.name,
      sku: item.sku,
      original_buyer: item.buyer,
      category: item.category,
      store: item.store,
      platform: saleForm.platform,
      quantity_sold: qty,
      final_sale_price: price,
      gross_sale: grossSale,
      item_cost: itemCost,
      shipping_cost: shipping,
      platform_fees: fees,
      net_profit: netProfit,
      notes: saleForm.notes,
    };

    const { data: saleData, error: saleError } = editingSaleId
      ? await supabase.from("sales_records").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingSaleId).select().single()
      : await supabase.from("sales_records").insert(row).select().single();

    if (saleError) return alert("Could not save sale: " + saleError.message);

    if (!editingSaleId) {
      const { data: updatedItem, error: updateError } = await supabase
        .from("inventory_items")
        .update({ quantity: remaining, status: remaining === 0 ? "Sold" : item.status, updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .select()
        .single();

      if (updateError) {
        alert("Sale saved, but inventory quantity did not update: " + updateError.message);
        await loadAllData();
        return;
      }

      setItems(items.map((i) => (i.id === item.id ? mapItem(updatedItem) : i)));
    }

    const mapped = mapSale(saleData);
    setSales(editingSaleId ? sales.map((s) => (s.id === editingSaleId ? mapped : s)) : [mapped, ...sales]);
    setEditingSaleId(null);
    setSaleForm({ itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCost: "", platformFees: "", notes: "" });
    setActiveTab("sales");
  }

  function startEditingSale(sale) {
    setEditingSaleId(sale.id);
    setSaleForm({ itemId: sale.itemId, platform: sale.platform, quantitySold: sale.quantitySold, finalSalePrice: sale.finalSalePrice, shippingCost: sale.shippingCost, platformFees: sale.platformFees, notes: sale.notes });
  }

  async function deleteSale(id) {
    const { error } = await supabase.from("sales_records").delete().eq("id", id);
    if (error) return alert("Could not delete sale: " + error.message);
    setSales(sales.filter((sale) => sale.id !== id));
  }

  function downloadCSV(filename, rows) {
    if (!rows.length) return alert("No data to export yet.");
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadBackup() {
    const backup = { createdAt: new Date().toISOString(), items, catalogProducts, expenses, sales, vehicles, mileageTrips };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ember-ledger-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const totalSpent = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const totalPotentialSales = items.reduce((s, i) => s + i.quantity * i.salePrice, 0);
  const totalMarketValue = items.reduce((s, i) => s + i.quantity * i.marketPrice, 0);
  const estimatedProfit = totalPotentialSales - totalSpent;
  const estimatedMarketProfit = totalMarketValue - totalSpent;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const estimatedProfitAfterExpenses = estimatedProfit - totalExpenses;
  const totalSalesRevenue = sales.reduce((s, sale) => s + sale.grossSale, 0);
  const totalSalesProfit = sales.reduce((s, sale) => s + sale.netProfit, 0);
  const totalItemsSold = sales.reduce((s, sale) => s + sale.quantitySold, 0);
  const totalBusinessMiles = mileageTrips.reduce((s, t) => s + t.businessMiles, 0);
  const totalFuelCost = mileageTrips.reduce((s, t) => s + t.fuelCost, 0);
  const totalWearCost = mileageTrips.reduce((s, t) => s + t.wearCost, 0);
  const totalVehicleCost = mileageTrips.reduce((s, t) => s + t.totalVehicleCost, 0);
  const totalMileageValue = mileageTrips.reduce((s, t) => s + t.mileageValue, 0);

  const spendingFor = (person) =>
    items.filter((i) => i.buyer === person).reduce((s, i) => s + i.quantity * i.unitCost, 0) +
    expenses.filter((e) => e.buyer === person).reduce((s, e) => s + e.amount, 0) +
    mileageTrips.filter((t) => t.driver === person).reduce((s, t) => s + t.totalVehicleCost, 0);

  const salesByPlatform = sales.reduce((a, s) => ({ ...a, [s.platform]: (a[s.platform] || 0) + s.grossSale }), {});
  const expensesByCategory = expenses.reduce((a, e) => ({ ...a, [e.category]: (a[e.category] || 0) + e.amount }), {});
  const inventoryByCategory = items.reduce((a, i) => ({ ...a, [i.category || "Uncategorized"]: (a[i.category || "Uncategorized"] || 0) + i.quantity }), {});
  const inventoryByStatus = items.reduce((a, i) => ({ ...a, [i.status || "In Stock"]: (a[i.status || "In Stock"] || 0) + i.quantity }), {});

  const lowStockItems = items.filter((i) => i.quantity <= 1);
  const needsPhotosItems = items.filter((i) => i.status === "Needs Photos" || !i.itemImage);
  const needsDeckTradrItems = items.filter((i) => i.status === "Needs DeckTradr Check" || Number(i.marketPrice) <= 0);
  const readyToListItems = items.filter((i) => i.status === "Ready to List");
  const listedItems = items.filter((i) => i.status === "Listed");

  const filteredItems = items.filter((item) => {
    const search = inventorySearch.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(search) ||
      item.sku.toLowerCase().includes(search) ||
      item.buyer.toLowerCase().includes(search) ||
      item.category.toLowerCase().includes(search) ||
      String(item.store || "").toLowerCase().includes(search) ||
      String(item.barcode || "").toLowerCase().includes(search) ||
      String(item.status || "").toLowerCase().includes(search);

    const matchesStatus = inventoryStatusFilter === "All" || item.status === inventoryStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredCatalogProducts = catalogProducts.filter((product) => {
    const search = catalogSearch.toLowerCase();
    return (
      product.name.toLowerCase().includes(search) ||
      product.category.toLowerCase().includes(search) ||
      String(product.setName || "").toLowerCase().includes(search) ||
      String(product.barcode || "").toLowerCase().includes(search)
    );
  });

  if (!user) {
    return (
      <div className="app">
        <header className="header">
          <h1
  onClick={() => {
    const nextClicks = treasureClicks + 1;
    setTreasureClicks(nextClicks);

    if (nextClicks >= 7) {
      setShowTreasure(true);
    }
  }}
  title="There might be something hidden here..."
>
  Ember Ledger
</h1>
          <p>Log in to sync your business records across devices.</p>
        </header>
        <main className="main">
          <section className="panel">
            <h2>{authMode === "login" ? "Log In" : "Create Account"}</h2>
            <form onSubmit={handleAuth} className="form">
              <Field label="Email"><input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} /></Field>
              <Field label="Password"><input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} /></Field>
              <button type="submit" disabled={authLoading}>{authLoading ? "Working..." : authMode === "login" ? "Log In" : "Create Account"}</button>
            </form>
            <button className="secondary-button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
              {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
    <header className="header">
  <h1
    onClick={() => {
      const nextClicks = treasureClicks + 1;
      setTreasureClicks(nextClicks);

      if (nextClicks >= 7) {
        setShowTreasure(true);
      }
    }}
    title="There might be something hidden here..."
  >
    Ember Ledger
  </h1>

  <p>Cloud sync active for: {user.email}</p>

  <button className="secondary-button" onClick={signOut}>
    Sign Out
  </button>

  {showTreasure && (
    <div className="hidden-treasure">
      <p>Hidden Treasure Found ✨</p>
      <h2>I love you Dillon — with you by my side I can do anything.</h2>
    </div>
  )}
</header>

      <div className="topbar">
        <button type="button" className="menu-button" onClick={() => setMenuOpen(true)}>☰ Menu</button>
        <div className="topbar-title"><p>Current Section</p><h2>{activeTabLabel}</h2></div>
        <div className="topbar-actions">
          <button type="button" className="secondary-button" onClick={() => setActiveTab("addInventory")}>+ Inventory</button>
          <button type="button" className="secondary-button" onClick={() => setActiveTab("addSale")}>+ Sale</button>
        </div>
      </div>

      {menuOpen && <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`drawer ${menuOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <div><p>Ember Ledger</p><h3>Navigation</h3></div>
          <button type="button" className="secondary-button" onClick={() => setMenuOpen(false)}>Close</button>
        </div>
        {navSections.map((section) => (
          <div className="drawer-section" key={section.title}>
            <p className="drawer-section-title">{section.title}</p>
            <div className="drawer-links">
              {section.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={activeTab === item.key ? "drawer-link active" : "drawer-link"}
                  onClick={() => {
                    setActiveTab(item.key);
                    setMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <main className="main">
        {activeTab === "dashboard" && (
          <>
            <section className="cards">
              <div className="card"><p>Inventory Cost</p><h2>{money(totalSpent)}</h2></div>
              <div className="card"><p>DeckTradr Value</p><h2>{money(totalMarketValue)}</h2></div>
              <div className="card"><p>DeckTradr Profit</p><h2>{money(estimatedMarketProfit)}</h2></div>
              <div className="card"><p>Potential Sales</p><h2>{money(totalPotentialSales)}</h2></div>
              <div className="card"><p>Planned Profit</p><h2>{money(estimatedProfit)}</h2></div>
              <div className="card"><p>Sales Revenue</p><h2>{money(totalSalesRevenue)}</h2></div>
              <div className="card"><p>Real Sales Profit</p><h2>{money(totalSalesProfit)}</h2></div>
              <div className="card"><p>Expenses</p><h2>{money(totalExpenses)}</h2></div>
              <div className="card"><p>Profit After Expenses</p><h2>{money(estimatedProfitAfterExpenses)}</h2></div>
              <div className="card"><p>Items Sold</p><h2>{totalItemsSold}</h2></div>
              <div className="card"><p>Business Miles</p><h2>{totalBusinessMiles.toFixed(1)}</h2></div>
              <div className="card"><p>Total Vehicle Cost</p><h2>{money(totalVehicleCost)}</h2></div>
            </section>
            <section className="panel">
              <h2>Action Center</h2>
              <div className="cards">
                <div className="card"><p>Needs Photos</p><h2>{needsPhotosItems.length}</h2></div>
                <div className="card"><p>Needs DeckTradr</p><h2>{needsDeckTradrItems.length}</h2></div>
                <div className="card"><p>Ready to List</p><h2>{readyToListItems.length}</h2></div>
                <div className="card"><p>Low Stock</p><h2>{lowStockItems.length}</h2></div>
              </div>
            </section>
            <section className="panel">
              <h2>Buyer Spending</h2>
              <div className="buyer-grid">
                {PEOPLE.map((person) => (
                  <div className="buyer-card" key={person}><p>{person}</p><h3>{money(spendingFor(person))}</h3></div>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>Exports</h2>
              <div className="export-grid">
                <button onClick={() => downloadCSV("ember-ledger-inventory.csv", items)}>Export Inventory</button>
                <button onClick={() => downloadCSV("ember-ledger-catalog.csv", catalogProducts)}>Export Catalog</button>
                <button onClick={() => downloadCSV("ember-ledger-sales.csv", sales)}>Export Sales</button>
                <button onClick={() => downloadCSV("ember-ledger-expenses.csv", expenses)}>Export Expenses</button>
                <button onClick={() => downloadCSV("ember-ledger-mileage.csv", mileageTrips)}>Export Mileage</button>
                <button onClick={() => downloadCSV("ember-ledger-vehicles.csv", vehicles)}>Export Vehicles</button>
                <button onClick={downloadBackup}>Full Backup</button>
              </div>
            </section>
          </>
        )}

        {activeTab === "decktradr" && (
          <>
            <section className="panel">
              <h2>DeckTradr API / Partnership Request</h2>
              <p>Use this page to explain what Ember Ledger needs from DeckTradr. The goal is to connect DeckTradr product data and market values directly into your reseller workflow.</p>
              <div className="cards">
                <div className="card"><p>Current Integration</p><h2>Manual</h2></div>
                <div className="card"><p>Needed Access</p><h2>API</h2></div>
                <div className="card"><p>Main Use</p><h2>Pricing</h2></div>
              </div>
            </section>
            <section className="panel">
              <h2>Message to DeckTradr</h2>
              <textarea
                readOnly
                className="search-input"
                style={{ minHeight: "360px" }}
                value={`Hi DeckTradr team,

My name is Zena, and I am building a reseller inventory app called Ember Ledger. The app is focused on tracking Pokémon/sealed product inventory, receipts, mileage, expenses, sales, listing status, and profit/loss for small resellers.

I would like to connect Ember Ledger with DeckTradr as the main market data source. Right now, the app lets users manually enter DeckTradr market values and product links, but I would like to request API access or partnership guidance so the app can pull DeckTradr product and pricing data directly.

The API access I am looking for would ideally include:

1. Product search by product name, sealed product name, barcode/UPC, set, and product type.
2. Product details including DeckTradr product ID, name, category, set, product type, image URL, and product URL.
3. Current market pricing including market price, low price, mid price, high price, and last updated timestamp.
4. Ability to match scanned inventory barcodes to DeckTradr products.

My goal is not to replace DeckTradr. I want Ember Ledger to use DeckTradr as the trusted pricing and product-data source while helping resellers track receipts, cost basis, mileage, listings, expenses, and true P/L.

Could you let me know whether DeckTradr currently offers API access, affiliate/partner access, or another approved way to connect product and market data into a third-party inventory workflow?

Thank you,
Zena`}
              />
            </section>
          </>
        )}

        {activeTab === "catalog" && (
          <>
          <section className="panel">
  <h2>Bulk Import Catalog Items</h2>
  <p>
    Paste a list or upload a CSV/text file. Format each line like:
  </p>

  <pre className="import-example">
Product Name, Category, Set, Product Type, Barcode, Market Price, Low, Mid, High, Notes
Perfect Order ETB, Pokemon, Perfect Order, ETB, 123456789, 49.99, 42, 49.99, 60, Target restock item
Perfect Order Booster Bundle, Pokemon, Perfect Order, Booster Bundle, 987654321, 24.99, 20, 24.99, 32, Good flip
  </pre>

  <div className="form">
    <Field label="Upload CSV / Text File">
      <input
        type="file"
        accept=".csv,.txt"
        onChange={handleBulkCatalogFileUpload}
      />
    </Field>

    <button type="button" onClick={previewBulkCatalogImport}>
      Preview Import
    </button>
  </div>

  <textarea
    className="search-input"
    style={{ minHeight: "220px" }}
    value={bulkImportText}
    onChange={(event) => setBulkImportText(event.target.value)}
    placeholder="Paste one item per line..."
  />

  {bulkImportPreview.length > 0 && (
    <div>
      <h3>Preview: {bulkImportPreview.length} items</h3>

      <div className="inventory-list">
        {bulkImportPreview.map((item) => (
          <div className="inventory-card compact-card" key={item.tempId}>
            <h3>{item.name}</h3>
            <p>Category: {item.category}</p>
            <p>Set: {item.setName || "Not listed"}</p>
            <p>Type: {item.productType || "Not listed"}</p>
            <p>Barcode: {item.barcode || "Not listed"}</p>
            <p>DeckTradr Value: ${Number(item.marketPrice || 0).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <button type="button" onClick={importBulkCatalogProducts}>
        Import {bulkImportPreview.length} Products to Catalog
      </button>
    </div>
  )}
</section>
            <section className="panel">
              <h2>{editingCatalogId ? "Edit Catalog Product" : "Add Product Catalog Item"}</h2>
              <button type="button" className="secondary-button" onClick={() => setShowCatalogScanner(true)}>Open Catalog Scanner</button>
              {showCatalogScanner && <BarcodeScanner onScan={(code) => { updateCatalogForm("barcode", code); setShowCatalogScanner(false); }} onClose={() => setShowCatalogScanner(false)} />}
              <form onSubmit={addCatalogProduct} className="form">
                <Field label="Product Name"><input value={catalogForm.name} onChange={(e) => updateCatalogForm("name", e.target.value)} /></Field>
                <Field label="Category"><select value={catalogForm.category} onChange={(e) => updateCatalogForm("category", e.target.value)}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Set / Collection"><input value={catalogForm.setName} onChange={(e) => updateCatalogForm("setName", e.target.value)} /></Field>
                <Field label="Product Type"><input value={catalogForm.productType} onChange={(e) => updateCatalogForm("productType", e.target.value)} /></Field>
                <Field label="Barcode / UPC"><input value={catalogForm.barcode} onChange={(e) => updateCatalogForm("barcode", e.target.value)} /></Field>
                <Field label="Product Image"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateCatalogForm("imageUrl", url), "catalog-products")} /></Field>
                {catalogForm.imageUrl && <div className="receipt-preview"><p>Catalog Photo</p><img src={catalogForm.imageUrl} alt="Catalog" /></div>}
                <Field label="DeckTradr Product ID"><input value={catalogForm.externalProductId} onChange={(e) => updateCatalogForm("externalProductId", e.target.value)} /></Field>
                <Field label="DeckTradr URL"><input value={catalogForm.marketUrl} onChange={(e) => updateCatalogForm("marketUrl", e.target.value)} /></Field>
                <Field label="DeckTradr Market Price"><input type="number" step="0.01" value={catalogForm.marketPrice} onChange={(e) => updateCatalogForm("marketPrice", e.target.value)} /></Field>
                <Field label="Low Price"><input type="number" step="0.01" value={catalogForm.lowPrice} onChange={(e) => updateCatalogForm("lowPrice", e.target.value)} /></Field>
                <Field label="Mid Price"><input type="number" step="0.01" value={catalogForm.midPrice} onChange={(e) => updateCatalogForm("midPrice", e.target.value)} /></Field>
                <Field label="High Price"><input type="number" step="0.01" value={catalogForm.highPrice} onChange={(e) => updateCatalogForm("highPrice", e.target.value)} /></Field>
                <Field label="Notes"><input value={catalogForm.notes} onChange={(e) => updateCatalogForm("notes", e.target.value)} /></Field>
                <button type="submit">{editingCatalogId ? "Save Catalog Product" : "Add Catalog Product"}</button>
                {editingCatalogId && <button type="button" className="secondary-button" onClick={() => { setEditingCatalogId(null); setCatalogForm(blankCatalog); }}>Cancel Edit</button>}
              </form>
            </section>
            <section className="panel">
              <h2>Product Catalog</h2>
              <input className="search-input" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search catalog..." />
              <div className="inventory-list">
                {filteredCatalogProducts.map((p) => (
                  <div className="inventory-card" key={p.id}>
                    {p.imageUrl && <div className="receipt-preview"><p>Product Photo</p><img src={p.imageUrl} alt={p.name} /></div>}
                    <h3>{p.name}</h3>
                    <p>Category: {p.category}</p>
                    <p>Set: {p.setName || "Not listed"}</p>
                    <p>Type: {p.productType || "Not listed"}</p>
                    <p>Barcode: {p.barcode || "Not listed"}</p>
                    <p>DeckTradr Market Price: {money(p.marketPrice)}</p>
                    <p>Low / Mid / High: {money(p.lowPrice)} / {money(p.midPrice)} / {money(p.highPrice)}</p>
                    {p.marketUrl && <p><a href={p.marketUrl} target="_blank" rel="noreferrer">Open DeckTradr Link</a></p>}
                    {p.notes && <p>Notes: {p.notes}</p>}
                    <button className="edit-button" onClick={() => { applyCatalogProduct(p.id); setActiveTab("addInventory"); }}>Use for Inventory</button>
                    <button className="edit-button" onClick={() => startEditingCatalogProduct(p)}>Edit Catalog Product</button>
                    <button className="delete-button" onClick={() => deleteCatalogProduct(p.id)}>Delete Catalog Product</button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "addInventory" && (
          <section className="panel">
            <h2>Add Inventory</h2>
            <button type="button" className="secondary-button" onClick={() => setShowInventoryScanner(true)}>Open Scanner</button>
            {showInventoryScanner && <BarcodeScanner onScan={(code) => { updateItemForm("barcode", code); setShowInventoryScanner(false); }} onClose={() => setShowInventoryScanner(false)} />}
            <InventoryForm
              form={itemForm}
              setForm={updateItemForm}
              catalogProducts={catalogProducts}
              applyCatalogProduct={applyCatalogProduct}
              handleImageUpload={handleImageUpload}
              onSubmit={addItem}
              submitLabel="Add Item"
            />
          </section>
        )}

        {activeTab === "inventory" && (
          <section className="panel">
            <h2>Inventory</h2>
            <input className="search-input" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder="Search inventory..." />
            <div className="export-grid">
              <button type="button" onClick={() => setInventoryStatusFilter("All")}>All</button>
              {STATUSES.map((x) => <button key={x} type="button" onClick={() => setInventoryStatusFilter(x)}>{x}</button>)}
            </div>
            <p>Current filter: {inventoryStatusFilter}</p>
            {editingItemId && (
              <section className="panel">
                <h2>Edit Item</h2>
                <InventoryForm
                  form={itemForm}
                  setForm={updateItemForm}
                  catalogProducts={catalogProducts}
                  applyCatalogProduct={applyCatalogProduct}
                  handleImageUpload={handleImageUpload}
                  onSubmit={saveEditedItem}
                  submitLabel="Save Changes"
                />
                <button type="button" className="secondary-button" onClick={() => { setEditingItemId(null); setItemForm(blankItem); }}>Cancel Edit</button>
              </section>
            )}
            <div className="inventory-list compact-inventory-list">
              {filteredItems.map((item) => (
                <CompactInventoryCard
                  key={item.id}
                  item={item}
                  onRestock={prepareRestock}
                  onEdit={startEditingItem}
                  onDelete={deleteItem}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === "addSale" && (
          <section className="panel">
            <h2>{editingSaleId ? "Edit Sale" : "Add Sale"}</h2>
            <form onSubmit={addSale} className="form">
              <Field label="Item Sold">
                <select value={saleForm.itemId} onChange={(e) => updateSaleForm("itemId", e.target.value)}>
                  <option value="">Choose item</option>
                  {items.filter((i) => i.quantity > 0).map((i) => <option key={i.id} value={i.id}>{i.name} — Qty {i.quantity} — {i.sku}</option>)}
                </select>
              </Field>
              <Field label="Platform"><select value={saleForm.platform} onChange={(e) => updateSaleForm("platform", e.target.value)}>{PLATFORMS.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Quantity Sold"><input type="number" min="1" value={saleForm.quantitySold} onChange={(e) => updateSaleForm("quantitySold", e.target.value)} /></Field>
              <Field label="Final Sale Price Per Item"><input type="number" step="0.01" value={saleForm.finalSalePrice} onChange={(e) => updateSaleForm("finalSalePrice", e.target.value)} /></Field>
              <Field label="Shipping Cost"><input type="number" step="0.01" value={saleForm.shippingCost} onChange={(e) => updateSaleForm("shippingCost", e.target.value)} /></Field>
              <Field label="Platform Fees"><input type="number" step="0.01" value={saleForm.platformFees} onChange={(e) => updateSaleForm("platformFees", e.target.value)} /></Field>
              <Field label="Notes"><input value={saleForm.notes} onChange={(e) => updateSaleForm("notes", e.target.value)} /></Field>
              <button type="submit">{editingSaleId ? "Save Sale" : "Add Sale"}</button>
              {editingSaleId && <button type="button" className="secondary-button" onClick={() => { setEditingSaleId(null); setSaleForm({ itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCost: "", platformFees: "", notes: "" }); }}>Cancel Edit</button>}
            </form>
          </section>
        )}

        {activeTab === "sales" && (
          <ListPanel title="Sales" emptyText="No sales added yet.">
            {sales.map((sale) => (
              <div className="inventory-card" key={sale.id}>
                <h3>{sale.itemName}</h3>
                <p>SKU: {sale.sku}</p>
                <p>Platform: {sale.platform}</p>
                <p>Quantity Sold: {sale.quantitySold}</p>
                <p>Sale Price Each: {money(sale.finalSalePrice)}</p>
                <p>Gross Sale: {money(sale.grossSale)}</p>
                <p>Item Cost: {money(sale.itemCost)}</p>
                <p>Shipping: {money(sale.shippingCost)}</p>
                <p>Fees: {money(sale.platformFees)}</p>
                <p>Net Profit: {money(sale.netProfit)}</p>
                {sale.notes && <p>Notes: {sale.notes}</p>}
                <button className="edit-button" onClick={() => { startEditingSale(sale); setActiveTab("addSale"); }}>Edit Sale</button>
                <button className="delete-button" onClick={() => deleteSale(sale.id)}>Delete Sale</button>
              </div>
            ))}
          </ListPanel>
        )}

        {activeTab === "expenses" && (
          <>
            <section className="panel">
              <h2>{editingExpenseId ? "Edit Expense" : "Add Business Expense"}</h2>
              <form onSubmit={addExpense} className="form">
                <Field label="Vendor / Store"><input value={expenseForm.vendor} onChange={(e) => updateExpenseForm("vendor", e.target.value)} /></Field>
                <Field label="Expense Category"><select value={expenseForm.category} onChange={(e) => updateExpenseForm("category", e.target.value)}><option>Supplies</option><option>Shipping</option><option>Gas</option><option>Software</option><option>Storage</option><option>Equipment</option><option>Other</option></select></Field>
                <Field label="Who Paid?"><select value={expenseForm.buyer} onChange={(e) => updateExpenseForm("buyer", e.target.value)}>{PEOPLE.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Amount"><input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => updateExpenseForm("amount", e.target.value)} /></Field>
                <Field label="Notes"><input value={expenseForm.notes} onChange={(e) => updateExpenseForm("notes", e.target.value)} /></Field>
                <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateExpenseForm("receiptImage", url), "expenses")} /></Field>
                {expenseForm.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={expenseForm.receiptImage} alt="Receipt" /></div>}
                <button type="submit">{editingExpenseId ? "Save Expense" : "Add Expense"}</button>
                {editingExpenseId && <button type="button" className="secondary-button" onClick={() => { setEditingExpenseId(null); setExpenseForm({ vendor: "", category: "Supplies", buyer: "Zena", amount: "", notes: "", receiptImage: "" }); }}>Cancel Edit</button>}
              </form>
            </section>
            <ListPanel title="Business Expenses" emptyText="No expenses added yet.">
              {expenses.map((expense) => (
                <div className="inventory-card" key={expense.id}>
                  <h3>{expense.vendor}</h3>
                  <p>Category: {expense.category}</p>
                  <p>Paid By: {expense.buyer}</p>
                  <p>Amount: {money(expense.amount)}</p>
                  {expense.notes && <p>Notes: {expense.notes}</p>}
                  {expense.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={expense.receiptImage} alt="Receipt" /></div>}
                  <button className="edit-button" onClick={() => startEditingExpense(expense)}>Edit Expense</button>
                  <button className="delete-button" onClick={() => deleteExpense(expense.id)}>Delete Expense</button>
                </div>
              ))}
            </ListPanel>
          </>
        )}

        {activeTab === "vehicles" && (
          <>
            <section className="panel">
              <h2>{editingVehicleId ? "Edit Vehicle" : "Add Vehicle"}</h2>
              <form onSubmit={addVehicle} className="form">
                <Field label="Vehicle Name"><input value={vehicleForm.name} onChange={(e) => updateVehicleForm("name", e.target.value)} /></Field>
                <Field label="Owner / Driver"><select value={vehicleForm.owner} onChange={(e) => updateVehicleForm("owner", e.target.value)}>{PEOPLE.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Average MPG"><input type="number" step="0.1" value={vehicleForm.averageMpg} onChange={(e) => updateVehicleForm("averageMpg", e.target.value)} /></Field>
                <Field label="Wear Cost Per Mile"><input type="number" step="0.01" value={vehicleForm.wearCostPerMile} onChange={(e) => updateVehicleForm("wearCostPerMile", e.target.value)} /></Field>
                <Field label="Notes"><input value={vehicleForm.notes} onChange={(e) => updateVehicleForm("notes", e.target.value)} /></Field>
                <button type="submit">{editingVehicleId ? "Save Vehicle" : "Add Vehicle"}</button>
                {editingVehicleId && <button type="button" className="secondary-button" onClick={() => { setEditingVehicleId(null); setVehicleForm({ name: "", owner: "Zena", averageMpg: "", wearCostPerMile: "", notes: "" }); }}>Cancel Edit</button>}
              </form>
            </section>
            <ListPanel title="Vehicles" emptyText="No vehicles added yet.">
              {vehicles.map((v) => (
                <div className="inventory-card" key={v.id}>
                  <h3>{v.name}</h3>
                  <p>Owner: {v.owner}</p>
                  <p>Average MPG: {v.averageMpg}</p>
                  <p>Wear / Maintenance: {money(v.wearCostPerMile)} per mile</p>
                  {v.notes && <p>Notes: {v.notes}</p>}
                  <button className="edit-button" onClick={() => startEditingVehicle(v)}>Edit Vehicle</button>
                  <button className="delete-button" onClick={() => deleteVehicle(v.id)}>Delete Vehicle</button>
                </div>
              ))}
            </ListPanel>
          </>
        )}

        {activeTab === "mileage" && (
          <>
            <section className="panel">
              <h2>{editingTripId ? "Edit Mileage Trip" : "Add Mileage Trip"}</h2>
              <form onSubmit={addTrip} className="form">
                <Field label="Trip Purpose"><input value={tripForm.purpose} onChange={(e) => updateTripForm("purpose", e.target.value)} /></Field>
                <Field label="Driver"><select value={tripForm.driver} onChange={(e) => updateTripForm("driver", e.target.value)}>{PEOPLE.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Vehicle"><select value={tripForm.vehicleId} onChange={(e) => updateTripForm("vehicleId", e.target.value)}><option value="">No vehicle selected</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.averageMpg} MPG</option>)}</select></Field>
                <Field label="Starting Odometer"><input type="number" value={tripForm.startMiles} onChange={(e) => updateTripForm("startMiles", e.target.value)} /></Field>
                <Field label="Ending Odometer"><input type="number" value={tripForm.endMiles} onChange={(e) => updateTripForm("endMiles", e.target.value)} /></Field>
                <Field label="Gas Price Paid"><input type="number" step="0.01" value={tripForm.gasPrice} onChange={(e) => updateTripForm("gasPrice", e.target.value)} /></Field>
                <Field label="Gas Receipt"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateTripForm("gasReceiptImage", url), "gas")} /></Field>
                {tripForm.gasReceiptImage && <div className="receipt-preview"><p>Gas Receipt</p><img src={tripForm.gasReceiptImage} alt="Gas Receipt" /></div>}
                <Field label="Notes"><input value={tripForm.notes} onChange={(e) => updateTripForm("notes", e.target.value)} /></Field>
                <button type="submit">{editingTripId ? "Save Trip" : "Add Mileage Trip"}</button>
                {editingTripId && <button type="button" className="secondary-button" onClick={() => { setEditingTripId(null); setTripForm({ purpose: "", driver: "Zena", vehicleId: "", startMiles: "", endMiles: "", gasPrice: "", notes: "", gasReceiptImage: "" }); }}>Cancel Edit</button>}
              </form>
            </section>
            <ListPanel title="Mileage Trips" emptyText="No mileage trips added yet.">
              {mileageTrips.map((t) => (
                <div className="inventory-card" key={t.id}>
                  <h3>{t.purpose}</h3>
                  <p>Driver: {t.driver}</p>
                  <p>Vehicle: {t.vehicleName || "Not selected"}</p>
                  <p>Business Miles: {t.businessMiles}</p>
                  <p>Gas Price Paid: {money(t.gasPrice)}</p>
                  <p>Fuel Cost: {money(t.fuelCost)}</p>
                  <p>Wear / Maintenance: {money(t.wearCost)}</p>
                  <p>Total Vehicle Cost: {money(t.totalVehicleCost)}</p>
                  <p>IRS Mileage Value: {money(t.mileageValue)}</p>
                  {t.notes && <p>Notes: {t.notes}</p>}
                  {t.gasReceiptImage && <div className="receipt-preview"><p>Gas Receipt</p><img src={t.gasReceiptImage} alt="Gas Receipt" /></div>}
                  <button className="edit-button" onClick={() => startEditingTrip(t)}>Edit Trip</button>
                  <button className="delete-button" onClick={() => deleteTrip(t.id)}>Delete Trip</button>
                </div>
              ))}
            </ListPanel>
          </>
        )}

        {activeTab === "reports" && (
          <>
            <section className="panel">
              <h2>Reports</h2>
              <div className="cards">
                <div className="card"><p>Inventory Units</p><h2>{items.reduce((s, i) => s + i.quantity, 0)}</h2></div>
                <div className="card"><p>Catalog Products</p><h2>{catalogProducts.length}</h2></div>
                <div className="card"><p>Avg Profit / Sale</p><h2>{money(sales.length ? totalSalesProfit / sales.length : 0)}</h2></div>
                <div className="card"><p>IRS Mileage Value</p><h2>{money(totalMileageValue)}</h2></div>
                <div className="card"><p>Fuel Cost</p><h2>{money(totalFuelCost)}</h2></div>
                <div className="card"><p>Wear Cost</p><h2>{money(totalWearCost)}</h2></div>
              </div>
            </section>

            <ReportList title="Sales by Platform" data={salesByPlatform} moneyValues />
            <ReportList title="Expenses by Category" data={expensesByCategory} moneyValues />
            <ReportList title="Inventory by Category" data={inventoryByCategory} />
            <ReportList title="Inventory by Status" data={inventoryByStatus} />

            <ActionReport title="Needs Photos" items={needsPhotosItems} button="Update Item" action={startEditingItem} />
            <ActionReport title="Needs DeckTradr Check" items={needsDeckTradrItems} button="Update Price" action={startEditingItem} />
            <ActionReport title="Ready to List" items={readyToListItems} button="Update Listing" action={startEditingItem} />
            <ActionReport title="Listed Items" items={listedItems} button="Update Item" action={startEditingItem} />
            <ActionReport title="Low Stock / Sold Out" items={lowStockItems} button="Restock / Rebuy" action={prepareRestock} />
          </>
        )}
      </main>
    </div>
  );
}

function CompactInventoryCard({ item, onRestock, onEdit, onDelete }) {
  const decktradrProfit = item.quantity * item.marketPrice - item.quantity * item.unitCost;
  const plannedProfit = item.quantity * item.salePrice - item.quantity * item.unitCost;

  return (
    <div className="inventory-card compact-card">
      <div className="compact-card-header">
        <div className="compact-title-block">
          <h3>{item.name}</h3>
          <p className="compact-subtitle">
            {item.category} • {item.buyer} • Qty {item.quantity}
          </p>
        </div>
        <span className={statusClass(item.status)}>{item.status || "In Stock"}</span>
      </div>

      {item.itemImage && (
        <div className="compact-image-wrap">
          <img src={item.itemImage} alt={item.name} />
        </div>
      )}

      <div className="compact-metrics">
        <div>
          <span>Avg Cost</span>
          <strong>{money(item.unitCost)}</strong>
        </div>
        <div>
          <span>DeckTradr</span>
          <strong>{money(item.marketPrice)}</strong>
        </div>
        <div>
          <span>Profit</span>
          <strong>{money(decktradrProfit)}</strong>
        </div>
      </div>

      <div className="compact-details">
        <p><strong>SKU:</strong> {item.sku}</p>
        <p><strong>Store:</strong> {item.store || "Not listed"}</p>
        <p><strong>Barcode:</strong> {item.barcode || "Not listed"}</p>
        <p><strong>Total Cost:</strong> {money(item.quantity * item.unitCost)}</p>
        <p><strong>Planned Profit:</strong> {money(plannedProfit)}</p>
        {item.listingPlatform && <p><strong>Listing:</strong> {item.listingPlatform}</p>}
        {item.listedPrice > 0 && <p><strong>Listed Price:</strong> {money(item.listedPrice)}</p>}
        {item.actionNotes && <p><strong>Action:</strong> {item.actionNotes}</p>}
      </div>

      <div className="compact-links">
        {item.decktradrUrl && <a href={item.decktradrUrl} target="_blank" rel="noreferrer">DeckTradr</a>}
        {item.listingUrl && <a href={item.listingUrl} target="_blank" rel="noreferrer">Listing</a>}
        {item.receiptImage && <a href={item.receiptImage} target="_blank" rel="noreferrer">Receipt</a>}
      </div>

      <div className="compact-actions">
        <button className="edit-button" onClick={() => onRestock(item)}>Restock</button>
        <button className="edit-button" onClick={() => onEdit(item)}>Edit</button>
        <button className="delete-button" onClick={() => onDelete(item.id)}>Delete</button>
      </div>
    </div>
  );
}

function InventoryForm({ form, setForm, catalogProducts, applyCatalogProduct, handleImageUpload, onSubmit, submitLabel }) {
  return (
    <form onSubmit={onSubmit} className="form">
      <Field label="Choose Saved Catalog Product">
        <select value={form.catalogProductId} onChange={(e) => applyCatalogProduct(e.target.value)}>
          <option value="">No catalog product selected</option>
          {catalogProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.marketPrice)}</option>)}
        </select>
      </Field>
      <Field label="Item Name"><input value={form.name} onChange={(e) => setForm("name", e.target.value)} /></Field>
      <Field label="Product Photo"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => setForm("itemImage", url), "item-photos")} /></Field>
      {form.itemImage && <div className="receipt-preview"><p>Product Photo</p><img src={form.itemImage} alt="Product" /></div>}
      <Field label="Who Purchased It?"><select value={form.buyer} onChange={(e) => setForm("buyer", e.target.value)}>{PEOPLE.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Category"><select value={form.category} onChange={(e) => setForm("category", e.target.value)}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Store / Source"><input value={form.store} onChange={(e) => setForm("store", e.target.value)} /></Field>
      <Field label="Barcode / UPC"><input value={form.barcode} onChange={(e) => setForm("barcode", e.target.value)} /></Field>
      <Field label="Quantity Purchased"><input type="number" min="0" value={form.quantity} onChange={(e) => setForm("quantity", e.target.value)} /></Field>
      <Field label="Unit Cost"><input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm("unitCost", e.target.value)} /></Field>
      <Field label="Planned Sale Price"><input type="number" step="0.01" value={form.salePrice} onChange={(e) => setForm("salePrice", e.target.value)} /></Field>
      <Field label="DeckTradr Product ID"><input value={form.externalProductId} onChange={(e) => setForm("externalProductId", e.target.value)} /></Field>
      <Field label="DeckTradr URL"><input value={form.decktradrUrl} onChange={(e) => setForm("decktradrUrl", e.target.value)} /></Field>
      <Field label="DeckTradr Market Price"><input type="number" step="0.01" value={form.marketPrice} onChange={(e) => setForm("marketPrice", e.target.value)} /></Field>
      <Field label="Low Price"><input type="number" step="0.01" value={form.lowPrice} onChange={(e) => setForm("lowPrice", e.target.value)} /></Field>
      <Field label="Mid Price"><input type="number" step="0.01" value={form.midPrice} onChange={(e) => setForm("midPrice", e.target.value)} /></Field>
      <Field label="High Price"><input type="number" step="0.01" value={form.highPrice} onChange={(e) => setForm("highPrice", e.target.value)} /></Field>
      <Field label="Status"><select value={form.status} onChange={(e) => setForm("status", e.target.value)}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Listing Platform"><input value={form.listingPlatform} onChange={(e) => setForm("listingPlatform", e.target.value)} /></Field>
      <Field label="Listing URL"><input value={form.listingUrl} onChange={(e) => setForm("listingUrl", e.target.value)} /></Field>
      <Field label="Listed Price"><input type="number" step="0.01" value={form.listedPrice} onChange={(e) => setForm("listedPrice", e.target.value)} /></Field>
      <Field label="Action Notes"><input value={form.actionNotes} onChange={(e) => setForm("actionNotes", e.target.value)} /></Field>
      <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => setForm("receiptImage", url), "inventory")} /></Field>
      {form.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={form.receiptImage} alt="Receipt" /></div>}
      <button type="submit">{submitLabel}</button>
    </form>
  );
}

function ListPanel({ title, emptyText, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {!hasChildren ? <p>{emptyText}</p> : <div className="inventory-list">{children}</div>}
    </section>
  );
}

function ReportList({ title, data, moneyValues = false }) {
  const entries = Object.entries(data);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {entries.length === 0 ? <p>No data yet.</p> : entries.map(([key, value]) => <p key={key}>{key}: {moneyValues ? money(value) : `${value} units`}</p>)}
    </section>
  );
}

function ActionReport({ title, items, button, action }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {items.length === 0 ? <p>No items.</p> : (
        <div className="inventory-list compact-inventory-list">
          {items.map((item) => (
            <div className="inventory-card compact-card" key={item.id}>
              <div className="compact-card-header">
                <div>
                  <h3>{item.name}</h3>
                  <p className="compact-subtitle">Qty {item.quantity} • {item.category}</p>
                </div>
                <span className={statusClass(item.status)}>{item.status || "In Stock"}</span>
              </div>
              <div className="compact-metrics">
                <div><span>Cost</span><strong>{money(item.unitCost)}</strong></div>
                <div><span>DeckTradr</span><strong>{money(item.marketPrice)}</strong></div>
                <div><span>Profit</span><strong>{money(item.quantity * item.marketPrice - item.quantity * item.unitCost)}</strong></div>
              </div>
              <button className="edit-button" onClick={() => action(item)}>{button}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
