import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import "./App.css";
import { supabase } from "./supabaseClient";

const IRS_MILEAGE_RATE = 0.725;

function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function startScanner() {
      try {
        const codeReader = new BrowserMultiFormatReader();

        controlsRef.current = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (result && isMounted) {
              onScan(result.getText());

              if (controlsRef.current) {
                controlsRef.current.stop();
              }
            }
          }
        );
      } catch (error) {
        setScannerError(
          "Camera could not start. Check browser camera permissions or try the live HTTPS site."
        );
      }
    }

    startScanner();

    return () => {
      isMounted = false;

      if (controlsRef.current) {
        controlsRef.current.stop();
      }
    };
  }, [onScan]);

  return (
    <div className="panel">
      <h2>Scan Barcode</h2>
      <p>Point your camera at the barcode. Use good lighting and hold the barcode flat.</p>
      {scannerError && <p>{scannerError}</p>}
      <video
        ref={videoRef}
        style={{
          width: "100%",
          maxWidth: "420px",
          borderRadius: "16px",
          border: "1px solid #ddd7d2",
          background: "#000",
        }}
      />
      <button type="button" className="secondary-button" onClick={onClose}>
        Close Scanner
      </button>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [mileageTrips, setMileageTrips] = useState([]);
  const [sales, setSales] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);

  const [showInventoryScanner, setShowInventoryScanner] = useState(false);
  const [showCatalogScanner, setShowCatalogScanner] = useState(false);

  const [itemName, setItemName] = useState("");
  const [buyer, setBuyer] = useState("Zena");
  const [category, setCategory] = useState("Pokemon");
  const [store, setStore] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [itemReceiptImage, setItemReceiptImage] = useState("");
  const [itemImage, setItemImage] = useState("");
  const [barcode, setBarcode] = useState("");
  const [catalogProductId, setCatalogProductId] = useState("");
  const [externalProductSource, setExternalProductSource] = useState("Manual");
  const [externalProductId, setExternalProductId] = useState("");
  const [tcgplayerProductId, setTcgplayerProductId] = useState("");
  const [tcgplayerUrl, setTcgplayerUrl] = useState("");
  const [marketPrice, setMarketPrice] = useState("");
  const [lowPrice, setLowPrice] = useState("");
  const [midPrice, setMidPrice] = useState("");
  const [highPrice, setHighPrice] = useState("");

  const [catalogName, setCatalogName] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("Pokemon");
  const [catalogSetName, setCatalogSetName] = useState("");
  const [catalogProductType, setCatalogProductType] = useState("");
  const [catalogBarcode, setCatalogBarcode] = useState("");
  const [catalogMarketSource, setCatalogMarketSource] = useState("Manual");
  const [catalogExternalProductId, setCatalogExternalProductId] = useState("");
  const [catalogTcgplayerProductId, setCatalogTcgplayerProductId] = useState("");
  const [catalogMarketUrl, setCatalogMarketUrl] = useState("");
  const [catalogImageUrl, setCatalogImageUrl] = useState("");
  const [catalogMarketPrice, setCatalogMarketPrice] = useState("");
  const [catalogLowPrice, setCatalogLowPrice] = useState("");
  const [catalogMidPrice, setCatalogMidPrice] = useState("");
  const [catalogHighPrice, setCatalogHighPrice] = useState("");
  const [catalogNotes, setCatalogNotes] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");

  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [editCatalogName, setEditCatalogName] = useState("");
  const [editCatalogCategory, setEditCatalogCategory] = useState("Pokemon");
  const [editCatalogSetName, setEditCatalogSetName] = useState("");
  const [editCatalogProductType, setEditCatalogProductType] = useState("");
  const [editCatalogBarcode, setEditCatalogBarcode] = useState("");
  const [editCatalogMarketSource, setEditCatalogMarketSource] = useState("Manual");
  const [editCatalogExternalProductId, setEditCatalogExternalProductId] = useState("");
  const [editCatalogTcgplayerProductId, setEditCatalogTcgplayerProductId] = useState("");
  const [editCatalogMarketUrl, setEditCatalogMarketUrl] = useState("");
  const [editCatalogImageUrl, setEditCatalogImageUrl] = useState("");
  const [editCatalogMarketPrice, setEditCatalogMarketPrice] = useState("");
  const [editCatalogLowPrice, setEditCatalogLowPrice] = useState("");
  const [editCatalogMidPrice, setEditCatalogMidPrice] = useState("");
  const [editCatalogHighPrice, setEditCatalogHighPrice] = useState("");
  const [editCatalogNotes, setEditCatalogNotes] = useState("");

  const [expenseVendor, setExpenseVendor] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Supplies");
  const [expenseBuyer, setExpenseBuyer] = useState("Zena");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseReceiptImage, setExpenseReceiptImage] = useState("");

  const [tripPurpose, setTripPurpose] = useState("");
  const [tripDriver, setTripDriver] = useState("Zena");
  const [tripVehicleId, setTripVehicleId] = useState("");
  const [startMiles, setStartMiles] = useState("");
  const [endMiles, setEndMiles] = useState("");
  const [tripGasPrice, setTripGasPrice] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [tripGasReceiptImage, setTripGasReceiptImage] = useState("");

  const [vehicleName, setVehicleName] = useState("");
  const [vehicleOwner, setVehicleOwner] = useState("Zena");
  const [vehicleMpg, setVehicleMpg] = useState("");
  const [vehicleWearCost, setVehicleWearCost] = useState("");
  const [vehicleNotes, setVehicleNotes] = useState("");

  const [soldItemId, setSoldItemId] = useState("");
  const [salePlatform, setSalePlatform] = useState("eBay");
  const [quantitySold, setQuantitySold] = useState(1);
  const [finalSalePrice, setFinalSalePrice] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [platformFees, setPlatformFees] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  const [inventorySearch, setInventorySearch] = useState("");

  const [editingItemId, setEditingItemId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editBuyer, setEditBuyer] = useState("Zena");
  const [editCategory, setEditCategory] = useState("Pokemon");
  const [editStore, setEditStore] = useState("");
  const [editQuantity, setEditQuantity] = useState(1);
  const [editUnitCost, setEditUnitCost] = useState("");
  const [editSalePrice, setEditSalePrice] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editExternalProductSource, setEditExternalProductSource] = useState("Manual");
  const [editExternalProductId, setEditExternalProductId] = useState("");
  const [editTcgplayerProductId, setEditTcgplayerProductId] = useState("");
  const [editTcgplayerUrl, setEditTcgplayerUrl] = useState("");
  const [editMarketPrice, setEditMarketPrice] = useState("");
  const [editLowPrice, setEditLowPrice] = useState("");
  const [editMidPrice, setEditMidPrice] = useState("");
  const [editHighPrice, setEditHighPrice] = useState("");

  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editExpenseVendor, setEditExpenseVendor] = useState("");
  const [editExpenseCategory, setEditExpenseCategory] = useState("Supplies");
  const [editExpenseBuyer, setEditExpenseBuyer] = useState("Zena");
  const [editExpenseAmount, setEditExpenseAmount] = useState("");
  const [editExpenseNotes, setEditExpenseNotes] = useState("");

  const [editingTripId, setEditingTripId] = useState(null);
  const [editTripPurpose, setEditTripPurpose] = useState("");
  const [editTripDriver, setEditTripDriver] = useState("Zena");
  const [editTripVehicleId, setEditTripVehicleId] = useState("");
  const [editStartMiles, setEditStartMiles] = useState("");
  const [editEndMiles, setEditEndMiles] = useState("");
  const [editTripGasPrice, setEditTripGasPrice] = useState("");
  const [editTripNotes, setEditTripNotes] = useState("");

  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editSalePlatform, setEditSalePlatform] = useState("eBay");
  const [editQuantitySold, setEditQuantitySold] = useState(1);
  const [editFinalSalePrice, setEditFinalSalePrice] = useState("");
  const [editShippingCost, setEditShippingCost] = useState("");
  const [editPlatformFees, setEditPlatformFees] = useState("");
  const [editSaleNotes, setEditSaleNotes] = useState("");

  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editVehicleName, setEditVehicleName] = useState("");
  const [editVehicleOwner, setEditVehicleOwner] = useState("Zena");
  const [editVehicleMpg, setEditVehicleMpg] = useState("");
  const [editVehicleWearCost, setEditVehicleWearCost] = useState("");
  const [editVehicleNotes, setEditVehicleNotes] = useState("");

  useEffect(() => {
    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadAllCloudData();
    } else {
      setItems([]);
      setExpenses([]);
      setMileageTrips([]);
      setSales([]);
      setVehicles([]);
      setCatalogProducts([]);
    }
  }, [user]);

  async function checkUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setUser(null);
      return;
    }
    setUser(data.user);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });

        if (error) {
          alert(error.message);
          return;
        }

        if (!data.session) {
          alert("Account created. Please check your email, confirm your account, then come back and log in.");
          setAuthMode("login");
          return;
        }

        setUser(data.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });

        if (error) {
          alert(error.message);
          return;
        }

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

  function dbItemToAppItem(row) {
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      buyer: row.buyer,
      category: row.category,
      store: row.store,
      quantity: Number(row.quantity || 0),
      unitCost: Number(row.unit_cost || 0),
      salePrice: Number(row.sale_price || 0),
      receiptImage: row.receipt_image || "",
      itemImage: row.item_image || "",
      barcode: row.barcode || "",
      catalogProductId: row.catalog_product_id || "",
      catalogProductName: row.catalog_product_name || "",
      externalProductId: row.external_product_id || "",
      externalProductSource: row.external_product_source || "Manual",
      tcgplayerProductId: row.tcgplayer_product_id || "",
      tcgplayerUrl: row.tcgplayer_url || "",
      marketPrice: Number(row.market_price || 0),
      lowPrice: Number(row.low_price || 0),
      midPrice: Number(row.mid_price || 0),
      highPrice: Number(row.high_price || 0),
      lastPriceChecked: row.last_price_checked || "",
      createdAt: row.created_at,
    };
  }

  function dbCatalogToAppProduct(row) {
    return {
      id: row.id,
      name: row.name,
      category: row.category || "Pokemon",
      setName: row.set_name || "",
      productType: row.product_type || "",
      barcode: row.barcode || "",
      marketSource: row.market_source || "Manual",
      externalProductId: row.external_product_id || "",
      tcgplayerProductId: row.tcgplayer_product_id || "",
      marketUrl: row.market_url || "",
      imageUrl: row.image_url || "",
      marketPrice: Number(row.market_price || 0),
      lowPrice: Number(row.low_price || 0),
      midPrice: Number(row.mid_price || 0),
      highPrice: Number(row.high_price || 0),
      notes: row.notes || "",
      lastPriceChecked: row.last_price_checked || "",
      createdAt: row.created_at,
    };
  }

  function dbExpenseToAppExpense(row) {
    return {
      id: row.id,
      vendor: row.vendor,
      category: row.category,
      buyer: row.buyer,
      amount: Number(row.amount || 0),
      notes: row.notes || "",
      receiptImage: row.receipt_image || "",
      createdAt: row.created_at,
    };
  }

  function dbVehicleToAppVehicle(row) {
    return {
      id: row.id,
      name: row.name,
      owner: row.owner,
      averageMpg: Number(row.average_mpg || 0),
      wearCostPerMile: Number(row.wear_cost_per_mile || 0),
      notes: row.notes || "",
      createdAt: row.created_at,
    };
  }

  function dbTripToAppTrip(row) {
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      vehicleName: row.vehicle_name || "",
      purpose: row.purpose,
      driver: row.driver,
      startMiles: Number(row.start_miles || 0),
      endMiles: Number(row.end_miles || 0),
      businessMiles: Number(row.business_miles || 0),
      gasPrice: Number(row.gas_price || 0),
      fuelCost: Number(row.fuel_cost || 0),
      wearCostPerMile: Number(row.wear_cost_per_mile || 0),
      wearCost: Number(row.wear_cost || 0),
      totalVehicleCost: Number(row.total_vehicle_cost || 0),
      mileageValue: Number(row.mileage_value || 0),
      gasReceiptImage: row.gas_receipt_image || "",
      notes: row.notes || "",
      createdAt: row.created_at,
    };
  }

  function dbSaleToAppSale(row) {
    return {
      id: row.id,
      itemId: row.item_id,
      itemName: row.item_name,
      sku: row.sku,
      originalBuyer: row.original_buyer,
      category: row.category,
      store: row.store,
      platform: row.platform,
      quantitySold: Number(row.quantity_sold || 0),
      finalSalePrice: Number(row.final_sale_price || 0),
      grossSale: Number(row.gross_sale || 0),
      itemCost: Number(row.item_cost || 0),
      shippingCost: Number(row.shipping_cost || 0),
      platformFees: Number(row.platform_fees || 0),
      netProfit: Number(row.net_profit || 0),
      notes: row.notes || "",
      createdAt: row.created_at,
    };
  }

  async function loadAllCloudData() {
    await Promise.all([
      loadInventory(),
      loadExpenses(),
      loadMileageTrips(),
      loadSales(),
      loadVehicles(),
      loadCatalogProducts(),
    ]);
  }

  async function loadInventory() {
    const { data, error } = await supabase.from("inventory_items").select("*").order("created_at", { ascending: false });
    if (error) {
      alert("Could not load inventory: " + error.message);
      return;
    }
    setItems(data.map(dbItemToAppItem));
  }

  async function loadCatalogProducts() {
    const { data, error } = await supabase.from("product_catalog").select("*").order("created_at", { ascending: false });
    if (error) {
      alert("Could not load catalog products: " + error.message);
      return;
    }
    setCatalogProducts(data.map(dbCatalogToAppProduct));
  }

  async function loadExpenses() {
    const { data, error } = await supabase.from("business_expenses").select("*").order("created_at", { ascending: false });
    if (error) {
      alert("Could not load expenses: " + error.message);
      return;
    }
    setExpenses(data.map(dbExpenseToAppExpense));
  }

  async function loadMileageTrips() {
    const { data, error } = await supabase.from("mileage_trips").select("*").order("created_at", { ascending: false });
    if (error) {
      alert("Could not load mileage trips: " + error.message);
      return;
    }
    setMileageTrips(data.map(dbTripToAppTrip));
  }

  async function loadSales() {
    const { data, error } = await supabase.from("sales_records").select("*").order("created_at", { ascending: false });
    if (error) {
      alert("Could not load sales: " + error.message);
      return;
    }
    setSales(data.map(dbSaleToAppSale));
  }

  async function loadVehicles() {
    const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    if (error) {
      alert("Could not load vehicles: " + error.message);
      return;
    }
    setVehicles(data.map(dbVehicleToAppVehicle));
  }

  async function handleImageUpload(event, setterFunction, folderName = "misc") {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    if (!user) {
      alert("Please log in before uploading images.");
      return;
    }

    const fileExt = file.name.split(".").pop();
    const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `${user.id}/${folderName}/${safeFileName}`;

    const { error: uploadError } = await supabase.storage.from("receipts").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    if (uploadError) {
      alert("Could not upload image: " + uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("receipts").getPublicUrl(filePath);
    setterFunction(data.publicUrl);
  }

  function calculateTripCosts({ businessMiles, vehicle, gasPrice }) {
    const mpg = Number(vehicle?.averageMpg || 0);
    const wearRate = Number(vehicle?.wearCostPerMile || 0);
    const gasPriceNumber = Number(gasPrice || 0);
    const fuelCost = mpg > 0 ? (businessMiles / mpg) * gasPriceNumber : 0;
    const wearCost = businessMiles * wearRate;
    const totalVehicleCost = fuelCost + wearCost;
    const mileageValue = businessMiles * IRS_MILEAGE_RATE;
    return { fuelCost, wearCost, totalVehicleCost, mileageValue, wearRate, gasPriceNumber };
  }

  function applyCatalogProduct(productId) {
    setCatalogProductId(productId);
    const product = catalogProducts.find((p) => String(p.id) === String(productId));
    if (!product) return;
    setItemName(product.name);
    setCategory(product.category || "Pokemon");
    setBarcode(product.barcode || "");
    setExternalProductSource(product.marketSource || "Manual");
    setExternalProductId(product.externalProductId || "");
    setTcgplayerProductId(product.tcgplayerProductId || "");
    setTcgplayerUrl(product.marketUrl || "");
    setMarketPrice(product.marketPrice || "");
    setLowPrice(product.lowPrice || "");
    setMidPrice(product.midPrice || "");
    setHighPrice(product.highPrice || "");
    setItemImage(product.imageUrl || "");
  }

  function resetInventoryForm() {
    setItemName("");
    setBuyer("Zena");
    setCategory("Pokemon");
    setStore("");
    setQuantity(1);
    setUnitCost("");
    setSalePrice("");
    setItemReceiptImage("");
    setItemImage("");
    setBarcode("");
    setCatalogProductId("");
    setExternalProductSource("Manual");
    setExternalProductId("");
    setTcgplayerProductId("");
    setTcgplayerUrl("");
    setMarketPrice("");
    setLowPrice("");
    setMidPrice("");
    setHighPrice("");
  }

  function findMatchingInventoryItem() {
    const cleanName = itemName.trim().toLowerCase();
    const cleanBarcode = String(barcode || "").trim();

    return items.find((item) => {
      const sameCatalog = catalogProductId && item.catalogProductId === catalogProductId;
      const sameBarcode = cleanBarcode && item.barcode === cleanBarcode;
      const sameNameCategory =
        item.name.trim().toLowerCase() === cleanName &&
        String(item.category || "").toLowerCase() === String(category || "").toLowerCase();

      return sameCatalog || sameBarcode || sameNameCategory;
    });
  }

  async function mergeIntoExistingInventory(existingItem) {
    const addedQty = Number(quantity);
    const addedUnitCost = Number(unitCost);
    const oldQty = Number(existingItem.quantity || 0);
    const oldUnitCost = Number(existingItem.unitCost || 0);
    const newQty = oldQty + addedQty;
    const weightedAverageCost = newQty > 0 ? ((oldQty * oldUnitCost) + (addedQty * addedUnitCost)) / newQty : addedUnitCost;

    const row = {
      quantity: newQty,
      unit_cost: weightedAverageCost,
      sale_price: Number(salePrice || existingItem.salePrice || 0),
      market_price: Number(marketPrice || existingItem.marketPrice || 0),
      low_price: Number(lowPrice || existingItem.lowPrice || 0),
      mid_price: Number(midPrice || existingItem.midPrice || 0),
      high_price: Number(highPrice || existingItem.highPrice || 0),
      receipt_image: itemReceiptImage || existingItem.receiptImage || "",
      item_image: itemImage || existingItem.itemImage || "",
      barcode: barcode || existingItem.barcode || "",
      external_product_source: externalProductSource || existingItem.externalProductSource || "Manual",
      external_product_id: externalProductId || existingItem.externalProductId || "",
      tcgplayer_product_id: tcgplayerProductId || existingItem.tcgplayerProductId || "",
      tcgplayer_url: tcgplayerUrl || existingItem.tcgplayerUrl || "",
      last_price_checked: marketPrice ? new Date().toISOString() : existingItem.lastPriceChecked || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("inventory_items")
      .update(row)
      .eq("id", existingItem.id)
      .select()
      .single();

    if (error) {
      alert("Could not merge restock: " + error.message);
      return false;
    }

    setItems(items.map((item) => item.id === existingItem.id ? dbItemToAppItem(data) : item));
    return true;
  }

  function prepareRestock(item) {
    setCatalogProductId(item.catalogProductId || "");
    setItemName(item.name || "");
    setBuyer(item.buyer || "Zena");
    setCategory(item.category || "Pokemon");
    setStore(item.store || "");
    setQuantity(1);
    setUnitCost(item.unitCost || "");
    setSalePrice(item.salePrice || "");
    setItemImage(item.itemImage || "");
    setBarcode(item.barcode || "");
    setExternalProductSource(item.externalProductSource || "Manual");
    setExternalProductId(item.externalProductId || "");
    setTcgplayerProductId(item.tcgplayerProductId || "");
    setTcgplayerUrl(item.tcgplayerUrl || "");
    setMarketPrice(item.marketPrice || "");
    setLowPrice(item.lowPrice || "");
    setMidPrice(item.midPrice || "");
    setHighPrice(item.highPrice || "");
    setItemReceiptImage("");
    setActiveTab("addInventory");
  }

  function resetCatalogForm() {
    setCatalogName("");
    setCatalogCategory("Pokemon");
    setCatalogSetName("");
    setCatalogProductType("");
    setCatalogBarcode("");
    setCatalogMarketSource("Manual");
    setCatalogExternalProductId("");
    setCatalogTcgplayerProductId("");
    setCatalogMarketUrl("");
    setCatalogImageUrl("");
    setCatalogMarketPrice("");
    setCatalogLowPrice("");
    setCatalogMidPrice("");
    setCatalogHighPrice("");
    setCatalogNotes("");
  }

  async function addCatalogProduct(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!catalogName) return alert("Please enter a product name.");

    const row = {
      user_id: user.id,
      name: catalogName,
      category: catalogCategory,
      set_name: catalogSetName,
      product_type: catalogProductType,
      barcode: catalogBarcode,
      market_source: catalogMarketSource,
      external_product_id: catalogExternalProductId,
      tcgplayer_product_id: catalogTcgplayerProductId,
      market_url: catalogMarketUrl,
      image_url: catalogImageUrl,
      market_price: Number(catalogMarketPrice || 0),
      low_price: Number(catalogLowPrice || 0),
      mid_price: Number(catalogMidPrice || 0),
      high_price: Number(catalogHighPrice || 0),
      notes: catalogNotes,
      last_price_checked: catalogMarketPrice ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase.from("product_catalog").insert(row).select().single();
    if (error) return alert("Could not add catalog product: " + error.message);
    setCatalogProducts([dbCatalogToAppProduct(data), ...catalogProducts]);
    resetCatalogForm();
  }

  async function deleteCatalogProduct(id) {
    const { error } = await supabase.from("product_catalog").delete().eq("id", id);
    if (error) return alert("Could not delete catalog product: " + error.message);
    setCatalogProducts(catalogProducts.filter((p) => p.id !== id));
  }

  function startEditingCatalogProduct(product) {
    setEditingCatalogId(product.id);
    setEditCatalogName(product.name || "");
    setEditCatalogCategory(product.category || "Pokemon");
    setEditCatalogSetName(product.setName || "");
    setEditCatalogProductType(product.productType || "");
    setEditCatalogBarcode(product.barcode || "");
    setEditCatalogMarketSource(product.marketSource || "Manual");
    setEditCatalogExternalProductId(product.externalProductId || "");
    setEditCatalogTcgplayerProductId(product.tcgplayerProductId || "");
    setEditCatalogMarketUrl(product.marketUrl || "");
    setEditCatalogImageUrl(product.imageUrl || "");
    setEditCatalogMarketPrice(product.marketPrice || "");
    setEditCatalogLowPrice(product.lowPrice || "");
    setEditCatalogMidPrice(product.midPrice || "");
    setEditCatalogHighPrice(product.highPrice || "");
    setEditCatalogNotes(product.notes || "");
  }

  function cancelEditingCatalogProduct() {
    setEditingCatalogId(null);
    setEditCatalogName("");
    setEditCatalogCategory("Pokemon");
    setEditCatalogSetName("");
    setEditCatalogProductType("");
    setEditCatalogBarcode("");
    setEditCatalogMarketSource("Manual");
    setEditCatalogExternalProductId("");
    setEditCatalogTcgplayerProductId("");
    setEditCatalogMarketUrl("");
    setEditCatalogImageUrl("");
    setEditCatalogMarketPrice("");
    setEditCatalogLowPrice("");
    setEditCatalogMidPrice("");
    setEditCatalogHighPrice("");
    setEditCatalogNotes("");
  }

  async function saveEditedCatalogProduct(event) {
    event.preventDefault();
    if (!editCatalogName) return alert("Please enter a product name.");

    const row = {
      name: editCatalogName,
      category: editCatalogCategory,
      set_name: editCatalogSetName,
      product_type: editCatalogProductType,
      barcode: editCatalogBarcode,
      market_source: editCatalogMarketSource,
      external_product_id: editCatalogExternalProductId,
      tcgplayer_product_id: editCatalogTcgplayerProductId,
      market_url: editCatalogMarketUrl,
      image_url: editCatalogImageUrl,
      market_price: Number(editCatalogMarketPrice || 0),
      low_price: Number(editCatalogLowPrice || 0),
      mid_price: Number(editCatalogMidPrice || 0),
      high_price: Number(editCatalogHighPrice || 0),
      notes: editCatalogNotes,
      last_price_checked: editCatalogMarketPrice ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("product_catalog").update(row).eq("id", editingCatalogId).select().single();
    if (error) return alert("Could not update catalog product: " + error.message);

    const updatedProduct = dbCatalogToAppProduct(data);
    setCatalogProducts(catalogProducts.map((product) => product.id === editingCatalogId ? updatedProduct : product));
    cancelEditingCatalogProduct();
  }

  async function addItem(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!itemName || !unitCost || !quantity) return alert("Please fill out item name, quantity, and unit cost.");

    const existingItem = findMatchingInventoryItem();

    if (existingItem) {
      const merged = await mergeIntoExistingInventory(existingItem);
      if (merged) {
        resetInventoryForm();
        setActiveTab("inventory");
      }
      return;
    }

    const selectedCatalogProduct = catalogProducts.find((p) => String(p.id) === String(catalogProductId));

    const row = {
      user_id: user.id,
      name: itemName,
      buyer,
      category,
      store,
      quantity: Number(quantity),
      unit_cost: Number(unitCost),
      sale_price: Number(salePrice || 0),
      sku: "ET-" + Date.now(),
      receipt_image: itemReceiptImage,
      item_image: itemImage,
      barcode,
      catalog_product_id: selectedCatalogProduct?.id || null,
      catalog_product_name: selectedCatalogProduct?.name || "",
      external_product_source: externalProductSource,
      external_product_id: externalProductId,
      tcgplayer_product_id: tcgplayerProductId,
      tcgplayer_url: tcgplayerUrl,
      market_price: Number(marketPrice || 0),
      low_price: Number(lowPrice || 0),
      mid_price: Number(midPrice || 0),
      high_price: Number(highPrice || 0),
      last_price_checked: marketPrice ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase.from("inventory_items").insert(row).select().single();
    if (error) return alert("Could not add item: " + error.message);
    setItems([dbItemToAppItem(data), ...items]);
    resetInventoryForm();
    setActiveTab("inventory");
  }

  async function deleteItem(id) {
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) return alert("Could not delete item: " + error.message);
    setItems(items.filter((item) => item.id !== id));
  }

  function startEditingItem(item) {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditBuyer(item.buyer);
    setEditCategory(item.category || "Pokemon");
    setEditStore(item.store || "");
    setEditQuantity(item.quantity);
    setEditUnitCost(item.unitCost);
    setEditSalePrice(item.salePrice);
    setEditBarcode(item.barcode || "");
    setEditExternalProductSource(item.externalProductSource || "Manual");
    setEditExternalProductId(item.externalProductId || "");
    setEditTcgplayerProductId(item.tcgplayerProductId || "");
    setEditTcgplayerUrl(item.tcgplayerUrl || "");
    setEditMarketPrice(item.marketPrice || "");
    setEditLowPrice(item.lowPrice || "");
    setEditMidPrice(item.midPrice || "");
    setEditHighPrice(item.highPrice || "");
  }

  function cancelEditingItem() {
    setEditingItemId(null);
    setEditName("");
    setEditBuyer("Zena");
    setEditCategory("Pokemon");
    setEditStore("");
    setEditQuantity(1);
    setEditUnitCost("");
    setEditSalePrice("");
    setEditBarcode("");
    setEditExternalProductSource("Manual");
    setEditExternalProductId("");
    setEditTcgplayerProductId("");
    setEditTcgplayerUrl("");
    setEditMarketPrice("");
    setEditLowPrice("");
    setEditMidPrice("");
    setEditHighPrice("");
  }

  async function saveEditedItem(event) {
    event.preventDefault();
    if (!editName || !editUnitCost || !editQuantity) return alert("Please enter item name, quantity, and unit cost.");

    const row = {
      name: editName,
      buyer: editBuyer,
      category: editCategory,
      store: editStore,
      quantity: Number(editQuantity),
      unit_cost: Number(editUnitCost),
      sale_price: Number(editSalePrice || 0),
      barcode: editBarcode,
      external_product_source: editExternalProductSource,
      external_product_id: editExternalProductId,
      tcgplayer_product_id: editTcgplayerProductId,
      tcgplayer_url: editTcgplayerUrl,
      market_price: Number(editMarketPrice || 0),
      low_price: Number(editLowPrice || 0),
      mid_price: Number(editMidPrice || 0),
      high_price: Number(editHighPrice || 0),
      last_price_checked: editMarketPrice ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("inventory_items").update(row).eq("id", editingItemId).select().single();
    if (error) return alert("Could not update item: " + error.message);
    setItems(items.map((item) => (item.id === editingItemId ? dbItemToAppItem(data) : item)));
    cancelEditingItem();
  }

  async function addExpense(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!expenseVendor || !expenseAmount) return alert("Please enter vendor and amount.");

    const row = {
      user_id: user.id,
      vendor: expenseVendor,
      category: expenseCategory,
      buyer: expenseBuyer,
      amount: Number(expenseAmount),
      notes: expenseNotes,
      receipt_image: expenseReceiptImage,
    };

    const { data, error } = await supabase.from("business_expenses").insert(row).select().single();
    if (error) return alert("Could not add expense: " + error.message);
    setExpenses([dbExpenseToAppExpense(data), ...expenses]);
    setExpenseVendor("");
    setExpenseCategory("Supplies");
    setExpenseBuyer("Zena");
    setExpenseAmount("");
    setExpenseNotes("");
    setExpenseReceiptImage("");
  }

  async function deleteExpense(id) {
    const { error } = await supabase.from("business_expenses").delete().eq("id", id);
    if (error) return alert("Could not delete expense: " + error.message);
    setExpenses(expenses.filter((expense) => expense.id !== id));
  }

  function startEditingExpense(expense) {
    setEditingExpenseId(expense.id);
    setEditExpenseVendor(expense.vendor);
    setEditExpenseCategory(expense.category || "Supplies");
    setEditExpenseBuyer(expense.buyer || "Zena");
    setEditExpenseAmount(expense.amount);
    setEditExpenseNotes(expense.notes || "");
  }

  function cancelEditingExpense() {
    setEditingExpenseId(null);
    setEditExpenseVendor("");
    setEditExpenseCategory("Supplies");
    setEditExpenseBuyer("Zena");
    setEditExpenseAmount("");
    setEditExpenseNotes("");
  }

  async function saveEditedExpense(event) {
    event.preventDefault();
    if (!editExpenseVendor || !editExpenseAmount) return alert("Please enter vendor and amount.");

    const row = {
      vendor: editExpenseVendor,
      category: editExpenseCategory,
      buyer: editExpenseBuyer,
      amount: Number(editExpenseAmount),
      notes: editExpenseNotes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("business_expenses").update(row).eq("id", editingExpenseId).select().single();
    if (error) return alert("Could not update expense: " + error.message);
    setExpenses(expenses.map((expense) => (expense.id === editingExpenseId ? dbExpenseToAppExpense(data) : expense)));
    cancelEditingExpense();
  }

  async function addVehicle(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!vehicleName || !vehicleMpg) return alert("Please enter vehicle name and average MPG.");

    const row = {
      user_id: user.id,
      name: vehicleName,
      owner: vehicleOwner,
      average_mpg: Number(vehicleMpg),
      wear_cost_per_mile: Number(vehicleWearCost || 0),
      notes: vehicleNotes,
    };

    const { data, error } = await supabase.from("vehicles").insert(row).select().single();
    if (error) return alert("Could not add vehicle: " + error.message);
    setVehicles([dbVehicleToAppVehicle(data), ...vehicles]);
    setVehicleName("");
    setVehicleOwner("Zena");
    setVehicleMpg("");
    setVehicleWearCost("");
    setVehicleNotes("");
  }

  async function deleteVehicle(id) {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) return alert("Could not delete vehicle: " + error.message);
    setVehicles(vehicles.filter((vehicle) => vehicle.id !== id));
  }

  function startEditingVehicle(vehicle) {
    setEditingVehicleId(vehicle.id);
    setEditVehicleName(vehicle.name);
    setEditVehicleOwner(vehicle.owner || "Zena");
    setEditVehicleMpg(vehicle.averageMpg);
    setEditVehicleWearCost(vehicle.wearCostPerMile);
    setEditVehicleNotes(vehicle.notes || "");
  }

  function cancelEditingVehicle() {
    setEditingVehicleId(null);
    setEditVehicleName("");
    setEditVehicleOwner("Zena");
    setEditVehicleMpg("");
    setEditVehicleWearCost("");
    setEditVehicleNotes("");
  }

  async function saveEditedVehicle(event) {
    event.preventDefault();
    if (!editVehicleName || !editVehicleMpg) return alert("Please enter vehicle name and average MPG.");

    const row = {
      name: editVehicleName,
      owner: editVehicleOwner,
      average_mpg: Number(editVehicleMpg),
      wear_cost_per_mile: Number(editVehicleWearCost || 0),
      notes: editVehicleNotes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("vehicles").update(row).eq("id", editingVehicleId).select().single();
    if (error) return alert("Could not update vehicle: " + error.message);
    setVehicles(vehicles.map((vehicle) => (vehicle.id === editingVehicleId ? dbVehicleToAppVehicle(data) : vehicle)));
    cancelEditingVehicle();
  }

  async function addMileageTrip(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!tripPurpose || !startMiles || !endMiles) return alert("Please enter trip purpose, starting miles, and ending miles.");
    if (!tripGasPrice) return alert("Please enter the gas price paid for this trip.");

    const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(tripVehicleId));
    const businessMiles = Number(endMiles) - Number(startMiles);
    if (businessMiles < 0) return alert("Ending mileage must be higher than starting mileage.");
    const costs = calculateTripCosts({ businessMiles, vehicle: selectedVehicle, gasPrice: tripGasPrice });

    const row = {
      user_id: user.id,
      vehicle_id: selectedVehicle?.id || null,
      vehicle_name: selectedVehicle?.name || "",
      purpose: tripPurpose,
      driver: tripDriver,
      start_miles: Number(startMiles),
      end_miles: Number(endMiles),
      business_miles: businessMiles,
      gas_price: costs.gasPriceNumber,
      fuel_cost: costs.fuelCost,
      wear_cost_per_mile: costs.wearRate,
      wear_cost: costs.wearCost,
      total_vehicle_cost: costs.totalVehicleCost,
      mileage_value: costs.mileageValue,
      gas_receipt_image: tripGasReceiptImage,
      notes: tripNotes,
    };

    const { data, error } = await supabase.from("mileage_trips").insert(row).select().single();
    if (error) return alert("Could not add mileage trip: " + error.message);
    setMileageTrips([dbTripToAppTrip(data), ...mileageTrips]);
    setTripPurpose("");
    setTripDriver("Zena");
    setTripVehicleId("");
    setStartMiles("");
    setEndMiles("");
    setTripGasPrice("");
    setTripNotes("");
    setTripGasReceiptImage("");
  }

  async function deleteMileageTrip(id) {
    const { error } = await supabase.from("mileage_trips").delete().eq("id", id);
    if (error) return alert("Could not delete mileage trip: " + error.message);
    setMileageTrips(mileageTrips.filter((trip) => trip.id !== id));
  }

  function startEditingTrip(trip) {
    setEditingTripId(trip.id);
    setEditTripPurpose(trip.purpose);
    setEditTripDriver(trip.driver || "Zena");
    setEditTripVehicleId(trip.vehicleId || "");
    setEditStartMiles(trip.startMiles);
    setEditEndMiles(trip.endMiles);
    setEditTripGasPrice(trip.gasPrice);
    setEditTripNotes(trip.notes || "");
  }

  function cancelEditingTrip() {
    setEditingTripId(null);
    setEditTripPurpose("");
    setEditTripDriver("Zena");
    setEditTripVehicleId("");
    setEditStartMiles("");
    setEditEndMiles("");
    setEditTripGasPrice("");
    setEditTripNotes("");
  }

  async function saveEditedTrip(event) {
    event.preventDefault();
    if (!editTripPurpose || !editStartMiles || !editEndMiles) return alert("Please enter trip purpose, starting miles, and ending miles.");
    if (!editTripGasPrice) return alert("Please enter the gas price paid for this trip.");

    const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(editTripVehicleId));
    const businessMiles = Number(editEndMiles) - Number(editStartMiles);
    if (businessMiles < 0) return alert("Ending mileage must be higher than starting mileage.");
    const costs = calculateTripCosts({ businessMiles, vehicle: selectedVehicle, gasPrice: editTripGasPrice });

    const row = {
      vehicle_id: selectedVehicle?.id || null,
      vehicle_name: selectedVehicle?.name || "",
      purpose: editTripPurpose,
      driver: editTripDriver,
      start_miles: Number(editStartMiles),
      end_miles: Number(editEndMiles),
      business_miles: businessMiles,
      gas_price: costs.gasPriceNumber,
      fuel_cost: costs.fuelCost,
      wear_cost_per_mile: costs.wearRate,
      wear_cost: costs.wearCost,
      total_vehicle_cost: costs.totalVehicleCost,
      mileage_value: costs.mileageValue,
      notes: editTripNotes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("mileage_trips").update(row).eq("id", editingTripId).select().single();
    if (error) return alert("Could not update mileage trip: " + error.message);
    setMileageTrips(mileageTrips.map((trip) => (trip.id === editingTripId ? dbTripToAppTrip(data) : trip)));
    cancelEditingTrip();
  }

  async function addSale(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!soldItemId || !quantitySold || !finalSalePrice) return alert("Please choose an item, quantity sold, and final sale price.");

    const itemSold = items.find((item) => String(item.id) === String(soldItemId));
    if (!itemSold) return alert("Item not found.");
    const qtySold = Number(quantitySold);
    if (qtySold > itemSold.quantity) return alert("You cannot sell more than you have in inventory.");

    const salePriceNumber = Number(finalSalePrice);
    const shipping = Number(shippingCost || 0);
    const fees = Number(platformFees || 0);
    const itemCost = itemSold.unitCost * qtySold;
    const grossSale = salePriceNumber * qtySold;
    const netProfit = grossSale - itemCost - shipping - fees;
    const remainingQuantity = itemSold.quantity - qtySold;

    const saleRow = {
      user_id: user.id,
      item_id: itemSold.id,
      item_name: itemSold.name,
      sku: itemSold.sku,
      original_buyer: itemSold.buyer,
      category: itemSold.category,
      store: itemSold.store,
      platform: salePlatform,
      quantity_sold: qtySold,
      final_sale_price: salePriceNumber,
      gross_sale: grossSale,
      item_cost: itemCost,
      shipping_cost: shipping,
      platform_fees: fees,
      net_profit: netProfit,
      notes: saleNotes,
    };

    const { data: saleData, error: saleError } = await supabase.from("sales_records").insert(saleRow).select().single();
    if (saleError) return alert("Could not add sale: " + saleError.message);

    if (remainingQuantity > 0) {
      const { data: updatedInventoryItem, error: updateError } = await supabase
        .from("inventory_items")
        .update({ quantity: remainingQuantity, updated_at: new Date().toISOString() })
        .eq("id", itemSold.id)
        .select()
        .single();
      if (updateError) {
        alert("Sale saved, but inventory quantity did not update: " + updateError.message);
        await loadAllCloudData();
        return;
      }
      setItems(items.map((item) => (item.id === itemSold.id ? dbItemToAppItem(updatedInventoryItem) : item)));
    } else {
      const { error: deleteError } = await supabase.from("inventory_items").delete().eq("id", itemSold.id);
      if (deleteError) {
        alert("Sale saved, but sold-out inventory item did not delete: " + deleteError.message);
        await loadAllCloudData();
        return;
      }
      setItems(items.filter((item) => item.id !== itemSold.id));
    }

    setSales([dbSaleToAppSale(saleData), ...sales]);
    setSoldItemId("");
    setSalePlatform("eBay");
    setQuantitySold(1);
    setFinalSalePrice("");
    setShippingCost("");
    setPlatformFees("");
    setSaleNotes("");
    setActiveTab("sales");
  }

  async function deleteSale(id) {
    const { error } = await supabase.from("sales_records").delete().eq("id", id);
    if (error) return alert("Could not delete sale: " + error.message);
    setSales(sales.filter((sale) => sale.id !== id));
  }

  function startEditingSale(sale) {
    setEditingSaleId(sale.id);
    setEditSalePlatform(sale.platform || "eBay");
    setEditQuantitySold(sale.quantitySold);
    setEditFinalSalePrice(sale.finalSalePrice);
    setEditShippingCost(sale.shippingCost);
    setEditPlatformFees(sale.platformFees);
    setEditSaleNotes(sale.notes || "");
  }

  function cancelEditingSale() {
    setEditingSaleId(null);
    setEditSalePlatform("eBay");
    setEditQuantitySold(1);
    setEditFinalSalePrice("");
    setEditShippingCost("");
    setEditPlatformFees("");
    setEditSaleNotes("");
  }

  async function saveEditedSale(event) {
    event.preventDefault();
    const saleBeingEdited = sales.find((sale) => sale.id === editingSaleId);
    if (!saleBeingEdited) return alert("Sale not found.");
    if (!editQuantitySold || !editFinalSalePrice) return alert("Please enter quantity sold and final sale price.");

    const qtySold = Number(editQuantitySold);
    const salePriceNumber = Number(editFinalSalePrice);
    const shipping = Number(editShippingCost || 0);
    const fees = Number(editPlatformFees || 0);
    const costPerItem = saleBeingEdited.quantitySold > 0 ? saleBeingEdited.itemCost / saleBeingEdited.quantitySold : 0;
    const itemCost = costPerItem * qtySold;
    const grossSale = salePriceNumber * qtySold;
    const netProfit = grossSale - itemCost - shipping - fees;

    const row = {
      platform: editSalePlatform,
      quantity_sold: qtySold,
      final_sale_price: salePriceNumber,
      gross_sale: grossSale,
      item_cost: itemCost,
      shipping_cost: shipping,
      platform_fees: fees,
      net_profit: netProfit,
      notes: editSaleNotes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("sales_records").update(row).eq("id", editingSaleId).select().single();
    if (error) return alert("Could not update sale: " + error.message);
    setSales(sales.map((sale) => (sale.id === editingSaleId ? dbSaleToAppSale(data) : sale)));
    cancelEditingSale();
  }

  function downloadCSV(filename, rows) {
    if (!rows || rows.length === 0) return alert("No data to export yet.");
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadBackup() {
    const backupData = {
      createdAt: new Date().toISOString(),
      appName: "Ember Ledger",
      version: "1.5-scan-catalog-reports",
      items,
      sales,
      expenses,
      mileageTrips,
      vehicles,
      catalogProducts,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ember-ledger-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const totalSpent = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const totalPotentialSales = items.reduce((sum, item) => sum + item.quantity * item.salePrice, 0);
  const totalMarketValue = items.reduce((sum, item) => sum + item.quantity * item.marketPrice, 0);
  const estimatedProfit = totalPotentialSales - totalSpent;
  const estimatedMarketProfit = totalMarketValue - totalSpent;
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const estimatedProfitAfterExpenses = estimatedProfit - totalExpenses;
  const totalBusinessMiles = mileageTrips.reduce((sum, trip) => sum + trip.businessMiles, 0);
  const totalFuelCost = mileageTrips.reduce((sum, trip) => sum + trip.fuelCost, 0);
  const totalWearCost = mileageTrips.reduce((sum, trip) => sum + trip.wearCost, 0);
  const totalVehicleCost = mileageTrips.reduce((sum, trip) => sum + trip.totalVehicleCost, 0);
  const totalMileageValue = mileageTrips.reduce((sum, trip) => sum + trip.mileageValue, 0);
  const totalSalesRevenue = sales.reduce((sum, sale) => sum + sale.grossSale, 0);
  const totalSalesProfit = sales.reduce((sum, sale) => sum + sale.netProfit, 0);
  const totalItemsSold = sales.reduce((sum, sale) => sum + sale.quantitySold, 0);

  const spendingFor = (person) =>
    items.filter((item) => item.buyer === person).reduce((sum, item) => sum + item.quantity * item.unitCost, 0) +
    expenses.filter((expense) => expense.buyer === person).reduce((sum, expense) => sum + expense.amount, 0) +
    mileageTrips.filter((trip) => trip.driver === person).reduce((sum, trip) => sum + trip.totalVehicleCost, 0);

  const salesByPlatform = sales.reduce((acc, sale) => {
    acc[sale.platform] = (acc[sale.platform] || 0) + sale.grossSale;
    return acc;
  }, {});

  const expensesByCategory = expenses.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
    return acc;
  }, {});

  const inventoryByCategory = items.reduce((acc, item) => {
    acc[item.category || "Uncategorized"] = (acc[item.category || "Uncategorized"] || 0) + item.quantity;
    return acc;
  }, {});

  const inventoryByMarketSource = items.reduce((acc, item) => {
    acc[item.externalProductSource || "Manual"] = (acc[item.externalProductSource || "Manual"] || 0) + item.quantity;
    return acc;
  }, {});

  const lowStockItems = items.filter((item) => item.quantity <= 1);

  const filteredItems = items.filter((item) => {
    const search = inventorySearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(search) ||
      item.sku.toLowerCase().includes(search) ||
      item.buyer.toLowerCase().includes(search) ||
      item.category.toLowerCase().includes(search) ||
      String(item.store || "").toLowerCase().includes(search) ||
      String(item.barcode || "").toLowerCase().includes(search) ||
      String(item.externalProductSource || "").toLowerCase().includes(search)
    );
  });

  const filteredCatalogProducts = catalogProducts.filter((product) => {
    const search = catalogSearch.toLowerCase();
    return (
      product.name.toLowerCase().includes(search) ||
      product.category.toLowerCase().includes(search) ||
      String(product.setName || "").toLowerCase().includes(search) ||
      String(product.barcode || "").toLowerCase().includes(search) ||
      String(product.marketSource || "").toLowerCase().includes(search)
    );
  });

  if (!user) {
    return (
      <div className="app">
        <header className="header">
          <h1>Ember Ledger</h1>
          <p>Log in to sync your business records across devices.</p>
        </header>
        <main className="main">
          <section className="panel">
            <h2>{authMode === "login" ? "Log In" : "Create Account"}</h2>
            <form onSubmit={handleAuth} className="form">
              <label>Email<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label>
              <label>Password<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" /></label>
              <button type="submit" disabled={authLoading}>{authLoading ? "Working..." : authMode === "login" ? "Log In" : "Create Account"}</button>
            </form>
            <button className="secondary-button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}</button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Ember Ledger</h1>
        <p>Cloud sync active for: {user.email}</p>
        <button className="secondary-button" onClick={signOut}>Sign Out</button>
      </header>

      <nav className="nav">
        <button onClick={() => setActiveTab("dashboard")}>Dashboard</button>
        <button onClick={() => setActiveTab("catalog")}>Catalog</button>
        <button onClick={() => setActiveTab("vehicles")}>Vehicles</button>
        <button onClick={() => setActiveTab("addInventory")}>Add Inventory</button>
        <button onClick={() => setActiveTab("addSale")}>Add Sale</button>
        <button onClick={() => setActiveTab("expenses")}>Expenses</button>
        <button onClick={() => setActiveTab("mileage")}>Mileage</button>
        <button onClick={() => setActiveTab("inventory")}>Inventory</button>
        <button onClick={() => setActiveTab("sales")}>Sales</button>
        <button onClick={() => setActiveTab("reports")}>Reports</button>
      </nav>

      <main className="main">
        {activeTab === "dashboard" && (
          <>
            <section className="cards">
              <div className="card"><p>Inventory Cost</p><h2>${totalSpent.toFixed(2)}</h2></div>
              <div className="card"><p>Potential Sales</p><h2>${totalPotentialSales.toFixed(2)}</h2></div>
              <div className="card"><p>Market Value</p><h2>${totalMarketValue.toFixed(2)}</h2></div>
              <div className="card"><p>Planned Profit</p><h2>${estimatedProfit.toFixed(2)}</h2></div>
              <div className="card"><p>Market Profit</p><h2>${estimatedMarketProfit.toFixed(2)}</h2></div>
              <div className="card"><p>Expenses</p><h2>${totalExpenses.toFixed(2)}</h2></div>
              <div className="card"><p>Profit After Expenses</p><h2>${estimatedProfitAfterExpenses.toFixed(2)}</h2></div>
              <div className="card"><p>Sales Revenue</p><h2>${totalSalesRevenue.toFixed(2)}</h2></div>
              <div className="card"><p>Real Sales Profit</p><h2>${totalSalesProfit.toFixed(2)}</h2></div>
              <div className="card"><p>Items Sold</p><h2>{totalItemsSold}</h2></div>
              <div className="card"><p>Business Miles</p><h2>{totalBusinessMiles.toFixed(1)}</h2></div>
              <div className="card"><p>Total Vehicle Cost</p><h2>${totalVehicleCost.toFixed(2)}</h2></div>
            </section>

            <section className="panel">
              <h2>Buyer Spending</h2>
              <div className="buyer-grid">
                <div className="buyer-card"><p>Zena</p><h3>${spendingFor("Zena").toFixed(2)}</h3></div>
                <div className="buyer-card"><p>Dillon</p><h3>${spendingFor("Dillon").toFixed(2)}</h3></div>
                <div className="buyer-card"><p>Joint</p><h3>${spendingFor("Joint").toFixed(2)}</h3></div>
                <div className="buyer-card"><p>Other</p><h3>${spendingFor("Other").toFixed(2)}</h3></div>
              </div>
            </section>

            <section className="panel">
              <h2>Export Reports</h2>
              <div className="export-grid">
                <button onClick={() => downloadCSV("ember-ledger-inventory.csv", items)}>Export Inventory</button>
                <button onClick={() => downloadCSV("ember-ledger-catalog.csv", catalogProducts)}>Export Catalog</button>
                <button onClick={() => downloadCSV("ember-ledger-sales.csv", sales)}>Export Sales</button>
                <button onClick={() => downloadCSV("ember-ledger-expenses.csv", expenses)}>Export Expenses</button>
                <button onClick={() => downloadCSV("ember-ledger-mileage.csv", mileageTrips)}>Export Mileage</button>
                <button onClick={() => downloadCSV("ember-ledger-vehicles.csv", vehicles)}>Export Vehicles</button>
              </div>
            </section>

            <section className="panel">
              <h2>Backup</h2>
              <button onClick={downloadBackup}>Download Full Backup</button>
            </section>
          </>
        )}

        {activeTab === "catalog" && (
          <>
            <section className="panel">
              <h2>Add Product Catalog Item</h2>
              {showCatalogScanner && (
                <BarcodeScanner
                  onScan={(code) => {
                    setCatalogBarcode(code);
                    setShowCatalogScanner(false);
                  }}
                  onClose={() => setShowCatalogScanner(false)}
                />
              )}
              <form onSubmit={addCatalogProduct} className="form">
                <label>Product Name<input value={catalogName} onChange={(e) => setCatalogName(e.target.value)} placeholder="Perfect Order ETB" /></label>
                <label>Category<select value={catalogCategory} onChange={(e) => setCatalogCategory(e.target.value)}><option>Pokemon</option><option>Makeup</option><option>Clothes</option><option>Candy</option><option>Collectibles</option><option>Supplies</option><option>Other</option></select></label>
                <label>Set / Collection<input value={catalogSetName} onChange={(e) => setCatalogSetName(e.target.value)} placeholder="Example: Perfect Order" /></label>
                <label>Product Type<input value={catalogProductType} onChange={(e) => setCatalogProductType(e.target.value)} placeholder="ETB, Booster Bundle, Tin, Blister" /></label>
                <label>Barcode / UPC<input value={catalogBarcode} onChange={(e) => setCatalogBarcode(e.target.value)} placeholder="Scan or type barcode" /></label>
                <button type="button" className="secondary-button" onClick={() => setShowCatalogScanner(true)}>Scan Catalog Barcode</button>
                <label>Product Image<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setCatalogImageUrl, "catalog-products")} /></label>
                {catalogImageUrl && <div className="receipt-preview"><p>Catalog photo attached</p><img src={catalogImageUrl} alt="Catalog preview" /></div>}
                <label>Market Source<select value={catalogMarketSource} onChange={(e) => setCatalogMarketSource(e.target.value)}><option>Manual</option><option>TCGplayer</option><option>PriceCharting</option><option>Collectr</option><option>eBay Sold</option><option>Other</option></select></label>
                <label>External Product ID<input value={catalogExternalProductId} onChange={(e) => setCatalogExternalProductId(e.target.value)} /></label>
                <label>TCGplayer Product ID<input value={catalogTcgplayerProductId} onChange={(e) => setCatalogTcgplayerProductId(e.target.value)} /></label>
                <label>Market URL<input value={catalogMarketUrl} onChange={(e) => setCatalogMarketUrl(e.target.value)} /></label>
                <label>Market Price<input type="number" step="0.01" value={catalogMarketPrice} onChange={(e) => setCatalogMarketPrice(e.target.value)} /></label>
                <label>Low Price<input type="number" step="0.01" value={catalogLowPrice} onChange={(e) => setCatalogLowPrice(e.target.value)} /></label>
                <label>Mid Price<input type="number" step="0.01" value={catalogMidPrice} onChange={(e) => setCatalogMidPrice(e.target.value)} /></label>
                <label>High Price<input type="number" step="0.01" value={catalogHighPrice} onChange={(e) => setCatalogHighPrice(e.target.value)} /></label>
                <label>Notes<input value={catalogNotes} onChange={(e) => setCatalogNotes(e.target.value)} /></label>
                <button type="submit">Add Catalog Product</button>
              </form>
            </section>

            <section className="panel">
              <h2>Product Catalog</h2>
              <input className="search-input" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search catalog by name, set, barcode, or source..." />
              {filteredCatalogProducts.length === 0 ? <p>No catalog products found.</p> : (
                <div className="inventory-list">
                  {filteredCatalogProducts.map((product) => (
                    <div className="inventory-card" key={product.id}>
                      {editingCatalogId === product.id ? (
                        <form onSubmit={saveEditedCatalogProduct} className="form">
                          <label>Product Name<input value={editCatalogName} onChange={(e) => setEditCatalogName(e.target.value)} /></label>
                          <label>Category<select value={editCatalogCategory} onChange={(e) => setEditCatalogCategory(e.target.value)}><option>Pokemon</option><option>Makeup</option><option>Clothes</option><option>Candy</option><option>Collectibles</option><option>Supplies</option><option>Other</option></select></label>
                          <label>Set / Collection<input value={editCatalogSetName} onChange={(e) => setEditCatalogSetName(e.target.value)} /></label>
                          <label>Product Type<input value={editCatalogProductType} onChange={(e) => setEditCatalogProductType(e.target.value)} /></label>
                          <label>Barcode / UPC<input value={editCatalogBarcode} onChange={(e) => setEditCatalogBarcode(e.target.value)} /></label>
                          <label>Market Source<select value={editCatalogMarketSource} onChange={(e) => setEditCatalogMarketSource(e.target.value)}><option>Manual</option><option>TCGplayer</option><option>PriceCharting</option><option>Collectr</option><option>eBay Sold</option><option>Other</option></select></label>
                          <label>External Product ID<input value={editCatalogExternalProductId} onChange={(e) => setEditCatalogExternalProductId(e.target.value)} /></label>
                          <label>TCGplayer Product ID<input value={editCatalogTcgplayerProductId} onChange={(e) => setEditCatalogTcgplayerProductId(e.target.value)} /></label>
                          <label>Market URL<input value={editCatalogMarketUrl} onChange={(e) => setEditCatalogMarketUrl(e.target.value)} /></label>
                          <label>Image URL<input value={editCatalogImageUrl} onChange={(e) => setEditCatalogImageUrl(e.target.value)} /></label>
                          <label>Market Price<input type="number" step="0.01" value={editCatalogMarketPrice} onChange={(e) => setEditCatalogMarketPrice(e.target.value)} /></label>
                          <label>Low Price<input type="number" step="0.01" value={editCatalogLowPrice} onChange={(e) => setEditCatalogLowPrice(e.target.value)} /></label>
                          <label>Mid Price<input type="number" step="0.01" value={editCatalogMidPrice} onChange={(e) => setEditCatalogMidPrice(e.target.value)} /></label>
                          <label>High Price<input type="number" step="0.01" value={editCatalogHighPrice} onChange={(e) => setEditCatalogHighPrice(e.target.value)} /></label>
                          <label>Notes<input value={editCatalogNotes} onChange={(e) => setEditCatalogNotes(e.target.value)} /></label>
                          <button type="submit">Save Catalog Product</button>
                          <button type="button" className="secondary-button" onClick={cancelEditingCatalogProduct}>Cancel</button>
                        </form>
                      ) : (
                        <>
                          {product.imageUrl && <div className="receipt-preview"><p>Product Photo:</p><img src={product.imageUrl} alt={product.name} /></div>}
                          <h3>{product.name}</h3>
                          <p>Category: {product.category}</p>
                          <p>Set: {product.setName || "Not listed"}</p>
                          <p>Type: {product.productType || "Not listed"}</p>
                          <p>Barcode: {product.barcode || "Not listed"}</p>
                          <p>Source: {product.marketSource}</p>
                          <p>Market Price: ${product.marketPrice.toFixed(2)}</p>
                          <p>Low / Mid / High: ${product.lowPrice.toFixed(2)} / ${product.midPrice.toFixed(2)} / ${product.highPrice.toFixed(2)}</p>
                          {product.marketUrl && <p><a href={product.marketUrl} target="_blank" rel="noreferrer">Open Market Link</a></p>}
                          {product.notes && <p>Notes: {product.notes}</p>}
                          <button className="edit-button" onClick={() => {
                            applyCatalogProduct(product.id);
                            setActiveTab("addInventory");
                          }}>Use for Inventory</button>
                          <button className="edit-button" onClick={() => startEditingCatalogProduct(product)}>Edit Catalog Product</button>
                          <button className="delete-button" onClick={() => deleteCatalogProduct(product.id)}>Delete Catalog Product</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "vehicles" && (
          <>
            <section className="panel"><h2>Add Vehicle</h2><form onSubmit={addVehicle} className="form">
              <label>Vehicle Name<input value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} placeholder="Zena SUV" /></label>
              <label>Owner / Driver<select value={vehicleOwner} onChange={(e) => setVehicleOwner(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label>
              <label>Average MPG<input type="number" step="0.1" value={vehicleMpg} onChange={(e) => setVehicleMpg(e.target.value)} /></label>
              <label>Maintenance / Wear Cost Per Mile<input type="number" step="0.01" value={vehicleWearCost} onChange={(e) => setVehicleWearCost(e.target.value)} /></label>
              <label>Notes<input value={vehicleNotes} onChange={(e) => setVehicleNotes(e.target.value)} /></label>
              <button type="submit">Add Vehicle</button>
            </form></section>
            <section className="panel"><h2>Vehicles</h2>{vehicles.length === 0 ? <p>No vehicles added yet.</p> : <div className="inventory-list">{vehicles.map((vehicle) => <div className="inventory-card" key={vehicle.id}>{editingVehicleId === vehicle.id ? <form onSubmit={saveEditedVehicle} className="form"><label>Vehicle Name<input value={editVehicleName} onChange={(e) => setEditVehicleName(e.target.value)} /></label><label>Owner<select value={editVehicleOwner} onChange={(e) => setEditVehicleOwner(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label><label>Average MPG<input type="number" step="0.1" value={editVehicleMpg} onChange={(e) => setEditVehicleMpg(e.target.value)} /></label><label>Wear Cost Per Mile<input type="number" step="0.01" value={editVehicleWearCost} onChange={(e) => setEditVehicleWearCost(e.target.value)} /></label><label>Notes<input value={editVehicleNotes} onChange={(e) => setEditVehicleNotes(e.target.value)} /></label><button type="submit">Save Vehicle</button><button type="button" className="secondary-button" onClick={cancelEditingVehicle}>Cancel</button></form> : <><h3>{vehicle.name}</h3><p>Owner: {vehicle.owner}</p><p>Average MPG: {vehicle.averageMpg}</p><p>Wear / Maintenance: ${vehicle.wearCostPerMile.toFixed(2)} per mile</p>{vehicle.notes && <p>Notes: {vehicle.notes}</p>}<button className="edit-button" onClick={() => startEditingVehicle(vehicle)}>Edit Vehicle</button><button className="delete-button" onClick={() => deleteVehicle(vehicle.id)}>Delete Vehicle</button></>}</div>)}</div>}</section>
          </>
        )}

        {activeTab === "addInventory" && (
          <section className="panel">
            <h2>Add Inventory</h2>
            {showInventoryScanner && <BarcodeScanner onScan={(code) => { setBarcode(code); setShowInventoryScanner(false); }} onClose={() => setShowInventoryScanner(false)} />}
            <form onSubmit={addItem} className="form">
              <label>Choose Saved Catalog Product<select value={catalogProductId} onChange={(e) => applyCatalogProduct(e.target.value)}><option value="">No catalog product selected</option>{catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name} — ${product.marketPrice.toFixed(2)}</option>)}</select></label>
              <label>Item Name<input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Perfect Order ETB" /></label>
              <label>Product Photo<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setItemImage, "item-photos")} /></label>
              {itemImage && <div className="receipt-preview"><p>Product photo attached</p><img src={itemImage} alt="Product preview" /></div>}
              <label>Who Purchased It?<select value={buyer} onChange={(e) => setBuyer(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label>
              <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Pokemon</option><option>Makeup</option><option>Clothes</option><option>Candy</option><option>Collectibles</option><option>Supplies</option><option>Other</option></select></label>
              <label>Store / Source<input value={store} onChange={(e) => setStore(e.target.value)} /></label>
              <label>Barcode / UPC<input value={barcode} onChange={(e) => setBarcode(e.target.value)} /></label>
              <button type="button" className="secondary-button" onClick={() => setShowInventoryScanner(true)}>Scan Item Barcode</button>
              <label>Quantity Purchased<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
              <label>Unit Cost<input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></label>
              <label>Planned Sale Price<input type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} /></label>
              <label>Market Source<select value={externalProductSource} onChange={(e) => setExternalProductSource(e.target.value)}><option>Manual</option><option>TCGplayer</option><option>PriceCharting</option><option>Collectr</option><option>eBay Sold</option><option>Other</option></select></label>
              <label>External Product ID<input value={externalProductId} onChange={(e) => setExternalProductId(e.target.value)} /></label>
              <label>TCGplayer Product ID<input value={tcgplayerProductId} onChange={(e) => setTcgplayerProductId(e.target.value)} /></label>
              <label>Market URL<input value={tcgplayerUrl} onChange={(e) => setTcgplayerUrl(e.target.value)} /></label>
              <label>Market Price<input type="number" step="0.01" value={marketPrice} onChange={(e) => setMarketPrice(e.target.value)} /></label>
              <label>Low Price<input type="number" step="0.01" value={lowPrice} onChange={(e) => setLowPrice(e.target.value)} /></label>
              <label>Mid Price<input type="number" step="0.01" value={midPrice} onChange={(e) => setMidPrice(e.target.value)} /></label>
              <label>High Price<input type="number" step="0.01" value={highPrice} onChange={(e) => setHighPrice(e.target.value)} /></label>
              <label>Receipt / Screenshot<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setItemReceiptImage, "inventory")} /></label>
              {itemReceiptImage && <div className="receipt-preview"><p>Receipt attached</p><img src={itemReceiptImage} alt="Receipt preview" /></div>}
              <button type="submit">Add Item</button>
            </form>
          </section>
        )}

        {activeTab === "addSale" && (
          <section className="panel"><h2>Add Sale</h2><form onSubmit={addSale} className="form">
            <label>Item Sold<select value={soldItemId} onChange={(e) => setSoldItemId(e.target.value)}><option value="">Choose item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} — Qty {item.quantity} — {item.sku}</option>)}</select></label>
            <label>Platform<select value={salePlatform} onChange={(e) => setSalePlatform(e.target.value)}><option>eBay</option><option>Mercari</option><option>Whatnot</option><option>Facebook Marketplace</option><option>In-Store</option><option>Instagram</option><option>TikTok Shop</option><option>Other</option></select></label>
            <label>Quantity Sold<input type="number" min="1" value={quantitySold} onChange={(e) => setQuantitySold(e.target.value)} /></label>
            <label>Final Sale Price Per Item<input type="number" step="0.01" value={finalSalePrice} onChange={(e) => setFinalSalePrice(e.target.value)} /></label>
            <label>Shipping Cost<input type="number" step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} /></label>
            <label>Platform Fees<input type="number" step="0.01" value={platformFees} onChange={(e) => setPlatformFees(e.target.value)} /></label>
            <label>Notes<input value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} /></label>
            <button type="submit">Add Sale</button>
          </form></section>
        )}

        {activeTab === "expenses" && (
          <>
            <section className="panel"><h2>Add Business Expense</h2><form onSubmit={addExpense} className="form"><label>Vendor / Store<input value={expenseVendor} onChange={(e) => setExpenseVendor(e.target.value)} /></label><label>Expense Category<select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}><option>Supplies</option><option>Shipping</option><option>Gas</option><option>Software</option><option>Storage</option><option>Equipment</option><option>Other</option></select></label><label>Who Paid?<select value={expenseBuyer} onChange={(e) => setExpenseBuyer(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label><label>Amount<input type="number" step="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} /></label><label>Notes<input value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} /></label><label>Receipt / Screenshot<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setExpenseReceiptImage, "expenses")} /></label>{expenseReceiptImage && <div className="receipt-preview"><p>Receipt attached</p><img src={expenseReceiptImage} alt="Expense receipt preview" /></div>}<button type="submit">Add Expense</button></form></section>
            <section className="panel"><h2>Business Expenses</h2>{expenses.length === 0 ? <p>No expenses added yet.</p> : <div className="inventory-list">{expenses.map((expense) => <div className="inventory-card" key={expense.id}>{editingExpenseId === expense.id ? <form onSubmit={saveEditedExpense} className="form"><label>Vendor<input value={editExpenseVendor} onChange={(e) => setEditExpenseVendor(e.target.value)} /></label><label>Category<select value={editExpenseCategory} onChange={(e) => setEditExpenseCategory(e.target.value)}><option>Supplies</option><option>Shipping</option><option>Gas</option><option>Software</option><option>Storage</option><option>Equipment</option><option>Other</option></select></label><label>Who Paid?<select value={editExpenseBuyer} onChange={(e) => setEditExpenseBuyer(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label><label>Amount<input type="number" step="0.01" value={editExpenseAmount} onChange={(e) => setEditExpenseAmount(e.target.value)} /></label><label>Notes<input value={editExpenseNotes} onChange={(e) => setEditExpenseNotes(e.target.value)} /></label><button type="submit">Save Expense</button><button type="button" className="secondary-button" onClick={cancelEditingExpense}>Cancel</button></form> : <><h3>{expense.vendor}</h3><p>Category: {expense.category}</p><p>Paid By: {expense.buyer}</p><p>Amount: ${expense.amount.toFixed(2)}</p>{expense.notes && <p>Notes: {expense.notes}</p>}{expense.receiptImage && <div className="receipt-preview"><p>Receipt:</p><img src={expense.receiptImage} alt="Expense receipt" /></div>}<button className="edit-button" onClick={() => startEditingExpense(expense)}>Edit Expense</button><button className="delete-button" onClick={() => deleteExpense(expense.id)}>Delete Expense</button></>}</div>)}</div>}</section>
          </>
        )}

        {activeTab === "mileage" && (
          <>
            <section className="panel"><h2>Add Mileage Trip</h2><form onSubmit={addMileageTrip} className="form"><label>Trip Purpose<input value={tripPurpose} onChange={(e) => setTripPurpose(e.target.value)} /></label><label>Driver<select value={tripDriver} onChange={(e) => setTripDriver(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label><label>Vehicle<select value={tripVehicleId} onChange={(e) => setTripVehicleId(e.target.value)}><option value="">No vehicle selected</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.averageMpg} MPG</option>)}</select></label><label>Starting Odometer<input type="number" value={startMiles} onChange={(e) => setStartMiles(e.target.value)} /></label><label>Ending Odometer<input type="number" value={endMiles} onChange={(e) => setEndMiles(e.target.value)} /></label><label>Gas Price Paid<input type="number" step="0.01" value={tripGasPrice} onChange={(e) => setTripGasPrice(e.target.value)} /></label><label>Gas Receipt<input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setTripGasReceiptImage, "gas")} /></label>{tripGasReceiptImage && <div className="receipt-preview"><p>Gas receipt attached</p><img src={tripGasReceiptImage} alt="Gas receipt preview" /></div>}<label>Notes<input value={tripNotes} onChange={(e) => setTripNotes(e.target.value)} /></label><button type="submit">Add Mileage Trip</button></form></section>
            <section className="panel"><h2>Mileage Trips</h2>{mileageTrips.length === 0 ? <p>No mileage trips added yet.</p> : <div className="inventory-list">{mileageTrips.map((trip) => <div className="inventory-card" key={trip.id}>{editingTripId === trip.id ? <form onSubmit={saveEditedTrip} className="form"><label>Trip Purpose<input value={editTripPurpose} onChange={(e) => setEditTripPurpose(e.target.value)} /></label><label>Driver<select value={editTripDriver} onChange={(e) => setEditTripDriver(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label><label>Vehicle<select value={editTripVehicleId} onChange={(e) => setEditTripVehicleId(e.target.value)}><option value="">No vehicle selected</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.averageMpg} MPG</option>)}</select></label><label>Start<input type="number" value={editStartMiles} onChange={(e) => setEditStartMiles(e.target.value)} /></label><label>End<input type="number" value={editEndMiles} onChange={(e) => setEditEndMiles(e.target.value)} /></label><label>Gas Price<input type="number" step="0.01" value={editTripGasPrice} onChange={(e) => setEditTripGasPrice(e.target.value)} /></label><label>Notes<input value={editTripNotes} onChange={(e) => setEditTripNotes(e.target.value)} /></label><button type="submit">Save Trip</button><button type="button" className="secondary-button" onClick={cancelEditingTrip}>Cancel</button></form> : <><h3>{trip.purpose}</h3><p>Driver: {trip.driver}</p><p>Vehicle: {trip.vehicleName || "Not selected"}</p><p>Business Miles: {trip.businessMiles}</p><p>Gas Price Paid: ${trip.gasPrice.toFixed(2)}</p><p>Fuel Cost: ${trip.fuelCost.toFixed(2)}</p><p>Wear / Maintenance: ${trip.wearCost.toFixed(2)}</p><p>Total Vehicle Cost: ${trip.totalVehicleCost.toFixed(2)}</p><p>IRS Mileage Value: ${trip.mileageValue.toFixed(2)}</p>{trip.notes && <p>Notes: {trip.notes}</p>}{trip.gasReceiptImage && <div className="receipt-preview"><p>Gas Receipt:</p><img src={trip.gasReceiptImage} alt="Gas receipt" /></div>}<button className="edit-button" onClick={() => startEditingTrip(trip)}>Edit Trip</button><button className="delete-button" onClick={() => deleteMileageTrip(trip.id)}>Delete Trip</button></>}</div>)}</div>}</section>
          </>
        )}

        {activeTab === "inventory" && (
          <section className="panel"><h2>Inventory</h2><input className="search-input" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder="Search by item, SKU, buyer, category, store, barcode, or market source..." />{filteredItems.length === 0 ? <p>No inventory items found.</p> : <div className="inventory-list">{filteredItems.map((item) => <div className="inventory-card" key={item.id}>{editingItemId === item.id ? <form onSubmit={saveEditedItem} className="form"><label>Item Name<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label><label>Buyer<select value={editBuyer} onChange={(e) => setEditBuyer(e.target.value)}><option>Zena</option><option>Dillon</option><option>Joint</option><option>Other</option></select></label><label>Category<select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}><option>Pokemon</option><option>Makeup</option><option>Clothes</option><option>Candy</option><option>Collectibles</option><option>Supplies</option><option>Other</option></select></label><label>Store<input value={editStore} onChange={(e) => setEditStore(e.target.value)} /></label><label>Barcode<input value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} /></label><label>Quantity<input type="number" min="0" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} /></label><label>Unit Cost<input type="number" step="0.01" value={editUnitCost} onChange={(e) => setEditUnitCost(e.target.value)} /></label><label>Planned Sale Price<input type="number" step="0.01" value={editSalePrice} onChange={(e) => setEditSalePrice(e.target.value)} /></label><label>Market Source<select value={editExternalProductSource} onChange={(e) => setEditExternalProductSource(e.target.value)}><option>Manual</option><option>TCGplayer</option><option>PriceCharting</option><option>Collectr</option><option>eBay Sold</option><option>Other</option></select></label><label>External Product ID<input value={editExternalProductId} onChange={(e) => setEditExternalProductId(e.target.value)} /></label><label>TCGplayer Product ID<input value={editTcgplayerProductId} onChange={(e) => setEditTcgplayerProductId(e.target.value)} /></label><label>Market URL<input value={editTcgplayerUrl} onChange={(e) => setEditTcgplayerUrl(e.target.value)} /></label><label>Market Price<input type="number" step="0.01" value={editMarketPrice} onChange={(e) => setEditMarketPrice(e.target.value)} /></label><label>Low<input type="number" step="0.01" value={editLowPrice} onChange={(e) => setEditLowPrice(e.target.value)} /></label><label>Mid<input type="number" step="0.01" value={editMidPrice} onChange={(e) => setEditMidPrice(e.target.value)} /></label><label>High<input type="number" step="0.01" value={editHighPrice} onChange={(e) => setEditHighPrice(e.target.value)} /></label><button type="submit">Save Changes</button><button type="button" className="secondary-button" onClick={cancelEditingItem}>Cancel</button></form> : <>{item.itemImage && <div className="receipt-preview"><p>Product Photo:</p><img src={item.itemImage} alt={item.name} /></div>}<h3>{item.name}</h3><p>SKU: {item.sku}</p><p>Catalog: {item.catalogProductName || "Not linked"}</p><p>Barcode / UPC: {item.barcode || "Not listed"}</p><p>Buyer: {item.buyer}</p><p>Category: {item.category}</p><p>Store: {item.store || "Not listed"}</p><p>Quantity: {item.quantity}</p><p>Avg Unit Cost: ${item.unitCost.toFixed(2)}</p><p>Total Cost Basis: ${(item.quantity * item.unitCost).toFixed(2)}</p><p>Planned Sale Price: ${item.salePrice.toFixed(2)}</p><p>Market Source: {item.externalProductSource}</p><p>Market Price: ${item.marketPrice.toFixed(2)}</p><p>Low / Mid / High: ${item.lowPrice.toFixed(2)} / ${item.midPrice.toFixed(2)} / ${item.highPrice.toFixed(2)}</p><p>Planned Profit: ${(item.quantity * item.salePrice - item.quantity * item.unitCost).toFixed(2)}</p><p>Market Profit: ${(item.quantity * item.marketPrice - item.quantity * item.unitCost).toFixed(2)}</p>{item.tcgplayerUrl && <p><a href={item.tcgplayerUrl} target="_blank" rel="noreferrer">Open Market Link</a></p>}{item.receiptImage && <div className="receipt-preview"><p>Receipt:</p><img src={item.receiptImage} alt="Inventory receipt" /></div>}<button className="edit-button" onClick={() => prepareRestock(item)}>Restock / Rebuy</button><button className="edit-button" onClick={() => startEditingItem(item)}>Edit Item</button><button className="delete-button" onClick={() => deleteItem(item.id)}>Delete Item</button></>}</div>)}</div>}</section>
        )}

        {activeTab === "sales" && (
          <section className="panel"><h2>Sales</h2>{sales.length === 0 ? <p>No sales added yet.</p> : <div className="inventory-list">{sales.map((sale) => <div className="inventory-card" key={sale.id}>{editingSaleId === sale.id ? <form onSubmit={saveEditedSale} className="form"><label>Platform<select value={editSalePlatform} onChange={(e) => setEditSalePlatform(e.target.value)}><option>eBay</option><option>Mercari</option><option>Whatnot</option><option>Facebook Marketplace</option><option>In-Store</option><option>Instagram</option><option>TikTok Shop</option><option>Other</option></select></label><label>Quantity Sold<input type="number" min="1" value={editQuantitySold} onChange={(e) => setEditQuantitySold(e.target.value)} /></label><label>Final Sale Price<input type="number" step="0.01" value={editFinalSalePrice} onChange={(e) => setEditFinalSalePrice(e.target.value)} /></label><label>Shipping<input type="number" step="0.01" value={editShippingCost} onChange={(e) => setEditShippingCost(e.target.value)} /></label><label>Fees<input type="number" step="0.01" value={editPlatformFees} onChange={(e) => setEditPlatformFees(e.target.value)} /></label><label>Notes<input value={editSaleNotes} onChange={(e) => setEditSaleNotes(e.target.value)} /></label><button type="submit">Save Sale</button><button type="button" className="secondary-button" onClick={cancelEditingSale}>Cancel</button></form> : <><h3>{sale.itemName}</h3><p>SKU: {sale.sku}</p><p>Platform: {sale.platform}</p><p>Quantity Sold: {sale.quantitySold}</p><p>Sale Price Each: ${sale.finalSalePrice.toFixed(2)}</p><p>Gross Sale: ${sale.grossSale.toFixed(2)}</p><p>Item Cost: ${sale.itemCost.toFixed(2)}</p><p>Shipping: ${sale.shippingCost.toFixed(2)}</p><p>Fees: ${sale.platformFees.toFixed(2)}</p><p>Net Profit: ${sale.netProfit.toFixed(2)}</p>{sale.notes && <p>Notes: {sale.notes}</p>}<button className="edit-button" onClick={() => startEditingSale(sale)}>Edit Sale</button><button className="delete-button" onClick={() => deleteSale(sale.id)}>Delete Sale</button></>}</div>)}</div>}</section>
        )}

        {activeTab === "reports" && (
          <>
            <section className="panel"><h2>Reports</h2><div className="cards"><div className="card"><p>Inventory Units</p><h2>{items.reduce((s, i) => s + i.quantity, 0)}</h2></div><div className="card"><p>Catalog Products</p><h2>{catalogProducts.length}</h2></div><div className="card"><p>Avg Profit / Sale</p><h2>${sales.length ? (totalSalesProfit / sales.length).toFixed(2) : "0.00"}</h2></div><div className="card"><p>Fuel Cost</p><h2>${totalFuelCost.toFixed(2)}</h2></div><div className="card"><p>Wear Cost</p><h2>${totalWearCost.toFixed(2)}</h2></div><div className="card"><p>IRS Mileage Value</p><h2>${totalMileageValue.toFixed(2)}</h2></div></div></section>
            <section className="panel"><h2>Sales by Platform</h2>{Object.keys(salesByPlatform).length === 0 ? <p>No sales yet.</p> : Object.entries(salesByPlatform).map(([platform, amount]) => <p key={platform}>{platform}: ${amount.toFixed(2)}</p>)}</section>
            <section className="panel"><h2>Expenses by Category</h2>{Object.keys(expensesByCategory).length === 0 ? <p>No expenses yet.</p> : Object.entries(expensesByCategory).map(([cat, amount]) => <p key={cat}>{cat}: ${amount.toFixed(2)}</p>)}</section>
            <section className="panel"><h2>Inventory by Category</h2>{Object.keys(inventoryByCategory).length === 0 ? <p>No inventory yet.</p> : Object.entries(inventoryByCategory).map(([cat, qty]) => <p key={cat}>{cat}: {qty} units</p>)}</section>
            <section className="panel"><h2>Inventory by Market Source</h2>{Object.keys(inventoryByMarketSource).length === 0 ? <p>No inventory yet.</p> : Object.entries(inventoryByMarketSource).map(([source, qty]) => <p key={source}>{source}: {qty} units</p>)}</section>
            <section className="panel"><h2>Low Stock / Sold Out</h2>{lowStockItems.length === 0 ? <p>No low-stock items.</p> : <div className="inventory-list">{lowStockItems.map((item) => <div className="inventory-card" key={item.id}><h3>{item.name}</h3><p>Qty: {item.quantity}</p><p>Store: {item.store || "Not listed"}</p><p>Market Price: ${item.marketPrice.toFixed(2)}</p><button className="edit-button" onClick={() => prepareRestock(item)}>Restock / Rebuy</button></div>)}</div>}</section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
