import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const [items, setItems] = useState(() => {
    const savedItems = localStorage.getItem("emberLedgerItems");
    return savedItems ? JSON.parse(savedItems) : [];
  });

  const [expenses, setExpenses] = useState(() => {
    const savedExpenses = localStorage.getItem("emberLedgerExpenses");
    return savedExpenses ? JSON.parse(savedExpenses) : [];
  });

  const [mileageTrips, setMileageTrips] = useState(() => {
    const savedTrips = localStorage.getItem("emberLedgerMileageTrips");
    return savedTrips ? JSON.parse(savedTrips) : [];
  });

  const [sales, setSales] = useState(() => {
    const savedSales = localStorage.getItem("emberLedgerSales");
    return savedSales ? JSON.parse(savedSales) : [];
  });

  const [itemName, setItemName] = useState("");
  const [buyer, setBuyer] = useState("Zena");
  const [category, setCategory] = useState("Pokemon");
  const [store, setStore] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [itemReceiptImage, setItemReceiptImage] = useState("");

  const [expenseVendor, setExpenseVendor] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Supplies");
  const [expenseBuyer, setExpenseBuyer] = useState("Zena");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseReceiptImage, setExpenseReceiptImage] = useState("");

  const [tripPurpose, setTripPurpose] = useState("");
  const [tripDriver, setTripDriver] = useState("Zena");
  const [startMiles, setStartMiles] = useState("");
  const [endMiles, setEndMiles] = useState("");
  const [gasCost, setGasCost] = useState("");
  const [tripNotes, setTripNotes] = useState("");

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

  useEffect(() => {
    localStorage.setItem("emberLedgerItems", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("emberLedgerExpenses", JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem("emberLedgerMileageTrips", JSON.stringify(mileageTrips));
  }, [mileageTrips]);

  useEffect(() => {
    localStorage.setItem("emberLedgerSales", JSON.stringify(sales));
  }, [sales]);

  function handleImageUpload(event, setterFunction) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = function (loadEvent) {
      setterFunction(loadEvent.target.result);
    };

    reader.readAsDataURL(file);
  }

  function addItem(event) {
    event.preventDefault();

    if (!itemName || !unitCost || !quantity) {
      alert("Please fill out item name, quantity, and unit cost.");
      return;
    }

    const newItem = {
      id: Date.now(),
      name: itemName,
      buyer,
      category,
      store,
      quantity: Number(quantity),
      unitCost: Number(unitCost),
      salePrice: Number(salePrice || 0),
      sku: "ET-" + Date.now(),
      receiptImage: itemReceiptImage,
      createdAt: new Date().toISOString(),
    };

    setItems([newItem, ...items]);

    setItemName("");
    setBuyer("Zena");
    setCategory("Pokemon");
    setStore("");
    setQuantity(1);
    setUnitCost("");
    setSalePrice("");
    setItemReceiptImage("");
    setActiveTab("inventory");
  }

  function deleteItem(id) {
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
  }

  function saveEditedItem(event) {
    event.preventDefault();

    if (!editName || !editUnitCost || !editQuantity) {
      alert("Please enter item name, quantity, and unit cost.");
      return;
    }

    const updatedItems = items.map((item) => {
      if (item.id === editingItemId) {
        return {
          ...item,
          name: editName,
          buyer: editBuyer,
          category: editCategory,
          store: editStore,
          quantity: Number(editQuantity),
          unitCost: Number(editUnitCost),
          salePrice: Number(editSalePrice || 0),
        };
      }

      return item;
    });

    setItems(updatedItems);
    cancelEditingItem();
  }

  function addExpense(event) {
    event.preventDefault();

    if (!expenseVendor || !expenseAmount) {
      alert("Please enter vendor and amount.");
      return;
    }

    const newExpense = {
      id: Date.now(),
      vendor: expenseVendor,
      category: expenseCategory,
      buyer: expenseBuyer,
      amount: Number(expenseAmount),
      notes: expenseNotes,
      receiptImage: expenseReceiptImage,
      createdAt: new Date().toISOString(),
    };

    setExpenses([newExpense, ...expenses]);

    setExpenseVendor("");
    setExpenseCategory("Supplies");
    setExpenseBuyer("Zena");
    setExpenseAmount("");
    setExpenseNotes("");
    setExpenseReceiptImage("");
  }

  function deleteExpense(id) {
    setExpenses(expenses.filter((expense) => expense.id !== id));
  }

  function addMileageTrip(event) {
    event.preventDefault();

    if (!tripPurpose || !startMiles || !endMiles) {
      alert("Please enter trip purpose, starting miles, and ending miles.");
      return;
    }

    const businessMiles = Number(endMiles) - Number(startMiles);

    if (businessMiles < 0) {
      alert("Ending mileage must be higher than starting mileage.");
      return;
    }

    const newTrip = {
      id: Date.now(),
      purpose: tripPurpose,
      driver: tripDriver,
      startMiles: Number(startMiles),
      endMiles: Number(endMiles),
      businessMiles,
      gasCost: Number(gasCost || 0),
      mileageValue: businessMiles * 0.725,
      notes: tripNotes,
      createdAt: new Date().toISOString(),
    };

    setMileageTrips([newTrip, ...mileageTrips]);

    setTripPurpose("");
    setTripDriver("Zena");
    setStartMiles("");
    setEndMiles("");
    setGasCost("");
    setTripNotes("");
  }

  function deleteMileageTrip(id) {
    setMileageTrips(mileageTrips.filter((trip) => trip.id !== id));
  }

  function addSale(event) {
    event.preventDefault();

    if (!soldItemId || !quantitySold || !finalSalePrice) {
      alert("Please choose an item, quantity sold, and final sale price.");
      return;
    }

    const itemSold = items.find((item) => String(item.id) === String(soldItemId));

    if (!itemSold) {
      alert("Item not found.");
      return;
    }

    const qtySold = Number(quantitySold);

    if (qtySold > itemSold.quantity) {
      alert("You cannot sell more than you have in inventory.");
      return;
    }

    const salePriceNumber = Number(finalSalePrice);
    const shipping = Number(shippingCost || 0);
    const fees = Number(platformFees || 0);
    const itemCost = itemSold.unitCost * qtySold;
    const grossSale = salePriceNumber * qtySold;
    const netProfit = grossSale - itemCost - shipping - fees;

    const newSale = {
      id: Date.now(),
      itemId: itemSold.id,
      itemName: itemSold.name,
      sku: itemSold.sku,
      originalBuyer: itemSold.buyer,
      category: itemSold.category,
      store: itemSold.store,
      platform: salePlatform,
      quantitySold: qtySold,
      finalSalePrice: salePriceNumber,
      grossSale,
      itemCost,
      shippingCost: shipping,
      platformFees: fees,
      netProfit,
      notes: saleNotes,
      createdAt: new Date().toISOString(),
    };

    setSales([newSale, ...sales]);

    const updatedItems = items
      .map((item) => {
        if (item.id === itemSold.id) {
          return {
            ...item,
            quantity: item.quantity - qtySold,
          };
        }

        return item;
      })
      .filter((item) => item.quantity > 0);

    setItems(updatedItems);

    setSoldItemId("");
    setSalePlatform("eBay");
    setQuantitySold(1);
    setFinalSalePrice("");
    setShippingCost("");
    setPlatformFees("");
    setSaleNotes("");
    setActiveTab("sales");
  }

  function deleteSale(id) {
    setSales(sales.filter((sale) => sale.id !== id));
  }

  function downloadCSV(filename, rows) {
    if (!rows || rows.length === 0) {
      alert("No data to export yet.");
      return;
    }

    const headers = Object.keys(rows[0]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header] ?? "";
            return `"${String(value).replaceAll('"', '""')}"`;
          })
          .join(",")
      ),
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
      version: "1.0",
      items,
      sales,
      expenses,
      mileageTrips,
    };

    const fileContent = JSON.stringify(backupData, null, 2);
    const blob = new Blob([fileContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "ember-ledger-backup.json";
    link.click();

    URL.revokeObjectURL(url);
  }

  function restoreBackup(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = function (loadEvent) {
      try {
        const backupData = JSON.parse(loadEvent.target.result);

        if (
          !backupData.items ||
          !backupData.sales ||
          !backupData.expenses ||
          !backupData.mileageTrips
        ) {
          alert("This does not look like a valid Ember Ledger backup file.");
          return;
        }

        const confirmRestore = window.confirm(
          "This will replace your current app data with the backup file. Are you sure?"
        );

        if (!confirmRestore) {
          return;
        }

        setItems(backupData.items);
        setSales(backupData.sales);
        setExpenses(backupData.expenses);
        setMileageTrips(backupData.mileageTrips);

        alert("Backup restored successfully.");
      } catch (error) {
        alert(
          "Could not restore backup. Make sure you selected the correct JSON backup file."
        );
      }
    };

    reader.readAsText(file);
  }

  function clearAllData() {
    const confirmClear = window.confirm(
      "This will delete all Ember Ledger data from this browser. Are you sure?"
    );

    if (!confirmClear) {
      return;
    }

    setItems([]);
    setSales([]);
    setExpenses([]);
    setMileageTrips([]);
    alert("All app data cleared.");
  }

  const totalSpent = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );

  const totalPotentialSales = items.reduce(
    (sum, item) => sum + item.quantity * item.salePrice,
    0
  );

  const estimatedProfit = totalPotentialSales - totalSpent;

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  const estimatedProfitAfterExpenses = estimatedProfit - totalExpenses;

  const totalBusinessMiles = mileageTrips.reduce(
    (sum, trip) => sum + trip.businessMiles,
    0
  );

  const totalGasCost = mileageTrips.reduce(
    (sum, trip) => sum + trip.gasCost,
    0
  );

  const totalMileageValue = mileageTrips.reduce(
    (sum, trip) => sum + trip.mileageValue,
    0
  );

  const totalSalesRevenue = sales.reduce(
    (sum, sale) => sum + sale.grossSale,
    0
  );

  const totalSalesProfit = sales.reduce(
    (sum, sale) => sum + sale.netProfit,
    0
  );

  const totalItemsSold = sales.reduce(
    (sum, sale) => sum + sale.quantitySold,
    0
  );

  const zenaSpent =
    items
      .filter((item) => item.buyer === "Zena")
      .reduce((sum, item) => sum + item.quantity * item.unitCost, 0) +
    expenses
      .filter((expense) => expense.buyer === "Zena")
      .reduce((sum, expense) => sum + expense.amount, 0) +
    mileageTrips
      .filter((trip) => trip.driver === "Zena")
      .reduce((sum, trip) => sum + trip.gasCost, 0);

  const dillonSpent =
    items
      .filter((item) => item.buyer === "Dillon")
      .reduce((sum, item) => sum + item.quantity * item.unitCost, 0) +
    expenses
      .filter((expense) => expense.buyer === "Dillon")
      .reduce((sum, expense) => sum + expense.amount, 0) +
    mileageTrips
      .filter((trip) => trip.driver === "Dillon")
      .reduce((sum, trip) => sum + trip.gasCost, 0);

  const jointSpent =
    items
      .filter((item) => item.buyer === "Joint")
      .reduce((sum, item) => sum + item.quantity * item.unitCost, 0) +
    expenses
      .filter((expense) => expense.buyer === "Joint")
      .reduce((sum, expense) => sum + expense.amount, 0) +
    mileageTrips
      .filter((trip) => trip.driver === "Joint")
      .reduce((sum, trip) => sum + trip.gasCost, 0);

  const otherSpent =
    items
      .filter((item) => item.buyer === "Other")
      .reduce((sum, item) => sum + item.quantity * item.unitCost, 0) +
    expenses
      .filter((expense) => expense.buyer === "Other")
      .reduce((sum, expense) => sum + expense.amount, 0) +
    mileageTrips
      .filter((trip) => trip.driver === "Other")
      .reduce((sum, trip) => sum + trip.gasCost, 0);

  const filteredItems = items.filter((item) => {
    const search = inventorySearch.toLowerCase();

    return (
      item.name.toLowerCase().includes(search) ||
      item.sku.toLowerCase().includes(search) ||
      item.buyer.toLowerCase().includes(search) ||
      item.category.toLowerCase().includes(search) ||
      String(item.store || "").toLowerCase().includes(search)
    );
  });

  return (
    <div className="app">
      <header className="header">
        <h1>Ember Ledger</h1>
        <p>Inventory, expenses, mileage, sales, and receipt tracker</p>
      </header>

      <nav className="nav">
        <button onClick={() => setActiveTab("dashboard")}>Dashboard</button>
        <button onClick={() => setActiveTab("addInventory")}>Add Inventory</button>
        <button onClick={() => setActiveTab("addSale")}>Add Sale</button>
        <button onClick={() => setActiveTab("expenses")}>Expenses</button>
        <button onClick={() => setActiveTab("mileage")}>Mileage</button>
        <button onClick={() => setActiveTab("inventory")}>Inventory</button>
        <button onClick={() => setActiveTab("sales")}>Sales</button>
      </nav>

      <main className="main">
        {activeTab === "dashboard" && (
          <>
            <section className="cards">
              <div className="card">
                <p>Current Inventory Cost</p>
                <h2>${totalSpent.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Potential Sales</p>
                <h2>${totalPotentialSales.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Estimated Inventory Profit</p>
                <h2>${estimatedProfit.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Business Expenses</p>
                <h2>${totalExpenses.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Profit After Expenses</p>
                <h2>${estimatedProfitAfterExpenses.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Sales Revenue</p>
                <h2>${totalSalesRevenue.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Real Sales Profit</p>
                <h2>${totalSalesProfit.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Items Sold</p>
                <h2>{totalItemsSold}</h2>
              </div>

              <div className="card">
                <p>Business Miles</p>
                <h2>{totalBusinessMiles.toFixed(1)}</h2>
              </div>

              <div className="card">
                <p>Gas Tracked</p>
                <h2>${totalGasCost.toFixed(2)}</h2>
              </div>

              <div className="card">
                <p>Mileage Value</p>
                <h2>${totalMileageValue.toFixed(2)}</h2>
              </div>
            </section>

            <section className="panel">
              <h2>Buyer Spending</h2>

              <div className="buyer-grid">
                <div className="buyer-card">
                  <p>Zena</p>
                  <h3>${zenaSpent.toFixed(2)}</h3>
                </div>

                <div className="buyer-card">
                  <p>Dillon</p>
                  <h3>${dillonSpent.toFixed(2)}</h3>
                </div>

                <div className="buyer-card">
                  <p>Joint</p>
                  <h3>${jointSpent.toFixed(2)}</h3>
                </div>

                <div className="buyer-card">
                  <p>Other</p>
                  <h3>${otherSpent.toFixed(2)}</h3>
                </div>
              </div>
            </section>

            <section className="panel">
              <h2>Export Reports</h2>
              <p>Download your records as CSV files for taxes, bookkeeping, or backup.</p>

              <div className="export-grid">
                <button onClick={() => downloadCSV("ember-ledger-inventory.csv", items)}>
                  Export Inventory
                </button>

                <button onClick={() => downloadCSV("ember-ledger-sales.csv", sales)}>
                  Export Sales
                </button>

                <button onClick={() => downloadCSV("ember-ledger-expenses.csv", expenses)}>
                  Export Expenses
                </button>

                <button
                  onClick={() =>
                    downloadCSV("ember-ledger-mileage-trips.csv", mileageTrips)
                  }
                >
                  Export Mileage
                </button>
              </div>
            </section>

            <section className="panel">
              <h2>Backup & Restore</h2>
              <p>
                Download one backup file with all your app data, or restore from a previous
                backup file.
              </p>

              <div className="backup-actions">
                <button onClick={downloadBackup}>Download Full Backup</button>

                <label className="restore-label">
                  Restore Backup
                  <input
                    type="file"
                    accept="application/json"
                    onChange={restoreBackup}
                  />
                </label>
              </div>
            </section>

            <section className="panel">
              <h2>Danger Zone</h2>
              <p>Only use this if you already downloaded a backup.</p>
              <button className="delete-button" onClick={clearAllData}>
                Clear All Data
              </button>
            </section>
          </>
        )}

        {activeTab === "addInventory" && (
          <section className="panel">
            <h2>Add Inventory</h2>

            <form onSubmit={addItem} className="form">
              <label>
                Item Name
                <input
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                  placeholder="Example: Perfect Order ETB"
                />
              </label>

              <label>
                Who Purchased It?
                <select
                  value={buyer}
                  onChange={(event) => setBuyer(event.target.value)}
                >
                  <option>Zena</option>
                  <option>Dillon</option>
                  <option>Joint</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option>Pokemon</option>
                  <option>Makeup</option>
                  <option>Clothes</option>
                  <option>Candy</option>
                  <option>Collectibles</option>
                  <option>Supplies</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                Store / Source
                <input
                  value={store}
                  onChange={(event) => setStore(event.target.value)}
                  placeholder="Target, Walmart, Sam's, Facebook, etc."
                />
              </label>

              <label>
                Quantity Purchased
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>

              <label>
                Unit Cost
                <input
                  type="number"
                  step="0.01"
                  value={unitCost}
                  onChange={(event) => setUnitCost(event.target.value)}
                  placeholder="49.99"
                />
              </label>

              <label>
                Planned Sale Price
                <input
                  type="number"
                  step="0.01"
                  value={salePrice}
                  onChange={(event) => setSalePrice(event.target.value)}
                  placeholder="74.99"
                />
              </label>

              <label>
                Receipt / Screenshot
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleImageUpload(event, setItemReceiptImage)}
                />
              </label>

              {itemReceiptImage && (
                <div className="receipt-preview">
                  <p>Receipt attached</p>
                  <img src={itemReceiptImage} alt="Inventory receipt preview" />
                </div>
              )}

              <button type="submit">Add Item</button>
            </form>
          </section>
        )}

        {activeTab === "addSale" && (
          <section className="panel">
            <h2>Add Sale</h2>

            <form onSubmit={addSale} className="form">
              <label>
                Item Sold
                <select
                  value={soldItemId}
                  onChange={(event) => setSoldItemId(event.target.value)}
                >
                  <option value="">Choose item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — Qty {item.quantity} — {item.sku}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Platform
                <select
                  value={salePlatform}
                  onChange={(event) => setSalePlatform(event.target.value)}
                >
                  <option>eBay</option>
                  <option>Mercari</option>
                  <option>Whatnot</option>
                  <option>Facebook Marketplace</option>
                  <option>In-Store</option>
                  <option>Instagram</option>
                  <option>TikTok Shop</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                Quantity Sold
                <input
                  type="number"
                  min="1"
                  value={quantitySold}
                  onChange={(event) => setQuantitySold(event.target.value)}
                />
              </label>

              <label>
                Final Sale Price Per Item
                <input
                  type="number"
                  step="0.01"
                  value={finalSalePrice}
                  onChange={(event) => setFinalSalePrice(event.target.value)}
                  placeholder="Example: 74.99"
                />
              </label>

              <label>
                Shipping Cost
                <input
                  type="number"
                  step="0.01"
                  value={shippingCost}
                  onChange={(event) => setShippingCost(event.target.value)}
                  placeholder="Optional"
                />
              </label>

              <label>
                Platform Fees
                <input
                  type="number"
                  step="0.01"
                  value={platformFees}
                  onChange={(event) => setPlatformFees(event.target.value)}
                  placeholder="Optional"
                />
              </label>

              <label>
                Notes
                <input
                  value={saleNotes}
                  onChange={(event) => setSaleNotes(event.target.value)}
                  placeholder="Buyer, tracking, local pickup, etc."
                />
              </label>

              <button type="submit">Add Sale</button>
            </form>
          </section>
        )}

        {activeTab === "expenses" && (
          <>
            <section className="panel">
              <h2>Add Business Expense</h2>

              <form onSubmit={addExpense} className="form">
                <label>
                  Vendor / Store
                  <input
                    value={expenseVendor}
                    onChange={(event) => setExpenseVendor(event.target.value)}
                    placeholder="Amazon, USPS, Walmart, Target, etc."
                  />
                </label>

                <label>
                  Expense Category
                  <select
                    value={expenseCategory}
                    onChange={(event) => setExpenseCategory(event.target.value)}
                  >
                    <option>Supplies</option>
                    <option>Shipping</option>
                    <option>Gas</option>
                    <option>Software</option>
                    <option>Storage</option>
                    <option>Equipment</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Who Paid?
                  <select
                    value={expenseBuyer}
                    onChange={(event) => setExpenseBuyer(event.target.value)}
                  >
                    <option>Zena</option>
                    <option>Dillon</option>
                    <option>Joint</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    value={expenseAmount}
                    onChange={(event) => setExpenseAmount(event.target.value)}
                    placeholder="25.00"
                  />
                </label>

                <label>
                  Notes
                  <input
                    value={expenseNotes}
                    onChange={(event) => setExpenseNotes(event.target.value)}
                    placeholder="Example: bubble mailers, tape, gas for sourcing"
                  />
                </label>

                <label>
                  Receipt / Screenshot
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleImageUpload(event, setExpenseReceiptImage)
                    }
                  />
                </label>

                {expenseReceiptImage && (
                  <div className="receipt-preview">
                    <p>Receipt attached</p>
                    <img src={expenseReceiptImage} alt="Expense receipt preview" />
                  </div>
                )}

                <button type="submit">Add Expense</button>
              </form>
            </section>

            <section className="panel">
              <h2>Business Expenses</h2>

              {expenses.length === 0 ? (
                <p>No expenses added yet.</p>
              ) : (
                <div className="inventory-list">
                  {expenses.map((expense) => (
                    <div className="inventory-card" key={expense.id}>
                      <h3>{expense.vendor}</h3>
                      <p>Category: {expense.category}</p>
                      <p>Paid By: {expense.buyer}</p>
                      <p>Amount: ${expense.amount.toFixed(2)}</p>
                      {expense.notes && <p>Notes: {expense.notes}</p>}

                      {expense.receiptImage && (
                        <div className="receipt-preview">
                          <p>Receipt / Screenshot:</p>
                          <a href={expense.receiptImage} target="_blank" rel="noreferrer">
                            <img src={expense.receiptImage} alt="Expense receipt" />
                          </a>
                        </div>
                      )}

                      <button
                        className="delete-button"
                        onClick={() => deleteExpense(expense.id)}
                      >
                        Delete Expense
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "mileage" && (
          <>
            <section className="panel">
              <h2>Add Mileage Trip</h2>

              <form onSubmit={addMileageTrip} className="form">
                <label>
                  Trip Purpose
                  <input
                    value={tripPurpose}
                    onChange={(event) => setTripPurpose(event.target.value)}
                    placeholder="Target run, post office, local sale, supply run"
                  />
                </label>

                <label>
                  Driver
                  <select
                    value={tripDriver}
                    onChange={(event) => setTripDriver(event.target.value)}
                  >
                    <option>Zena</option>
                    <option>Dillon</option>
                    <option>Joint</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Starting Odometer
                  <input
                    type="number"
                    value={startMiles}
                    onChange={(event) => setStartMiles(event.target.value)}
                    placeholder="Example: 10000"
                  />
                </label>

                <label>
                  Ending Odometer
                  <input
                    type="number"
                    value={endMiles}
                    onChange={(event) => setEndMiles(event.target.value)}
                    placeholder="Example: 10028"
                  />
                </label>

                <label>
                  Gas Cost
                  <input
                    type="number"
                    step="0.01"
                    value={gasCost}
                    onChange={(event) => setGasCost(event.target.value)}
                    placeholder="Optional, example: 8.00"
                  />
                </label>

                <label>
                  Notes
                  <input
                    value={tripNotes}
                    onChange={(event) => setTripNotes(event.target.value)}
                    placeholder="Stores visited, what you bought, etc."
                  />
                </label>

                <button type="submit">Add Mileage Trip</button>
              </form>
            </section>

            <section className="panel">
              <h2>Mileage Trips</h2>

              {mileageTrips.length === 0 ? (
                <p>No mileage trips added yet.</p>
              ) : (
                <div className="inventory-list">
                  {mileageTrips.map((trip) => (
                    <div className="inventory-card" key={trip.id}>
                      <h3>{trip.purpose}</h3>
                      <p>Driver: {trip.driver}</p>
                      <p>Business Miles: {trip.businessMiles}</p>
                      <p>Gas Cost: ${trip.gasCost.toFixed(2)}</p>
                      <p>Mileage Value: ${trip.mileageValue.toFixed(2)}</p>
                      {trip.notes && <p>Notes: {trip.notes}</p>}

                      <button
                        className="delete-button"
                        onClick={() => deleteMileageTrip(trip.id)}
                      >
                        Delete Trip
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "inventory" && (
          <section className="panel">
            <h2>Inventory</h2>

            <input
              className="search-input"
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
              placeholder="Search by item, SKU, buyer, category, or store..."
            />

            {filteredItems.length === 0 ? (
              <p>No inventory items found.</p>
            ) : (
              <div className="inventory-list">
                {filteredItems.map((item) => (
                  <div className="inventory-card" key={item.id}>
                    {editingItemId === item.id ? (
                      <form onSubmit={saveEditedItem} className="form">
                        <label>
                          Item Name
                          <input
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                          />
                        </label>

                        <label>
                          Buyer
                          <select
                            value={editBuyer}
                            onChange={(event) => setEditBuyer(event.target.value)}
                          >
                            <option>Zena</option>
                            <option>Dillon</option>
                            <option>Joint</option>
                            <option>Other</option>
                          </select>
                        </label>

                        <label>
                          Category
                          <select
                            value={editCategory}
                            onChange={(event) => setEditCategory(event.target.value)}
                          >
                            <option>Pokemon</option>
                            <option>Makeup</option>
                            <option>Clothes</option>
                            <option>Candy</option>
                            <option>Collectibles</option>
                            <option>Supplies</option>
                            <option>Other</option>
                          </select>
                        </label>

                        <label>
                          Store / Source
                          <input
                            value={editStore}
                            onChange={(event) => setEditStore(event.target.value)}
                          />
                        </label>

                        <label>
                          Quantity
                          <input
                            type="number"
                            min="0"
                            value={editQuantity}
                            onChange={(event) => setEditQuantity(event.target.value)}
                          />
                        </label>

                        <label>
                          Unit Cost
                          <input
                            type="number"
                            step="0.01"
                            value={editUnitCost}
                            onChange={(event) => setEditUnitCost(event.target.value)}
                          />
                        </label>

                        <label>
                          Planned Sale Price
                          <input
                            type="number"
                            step="0.01"
                            value={editSalePrice}
                            onChange={(event) => setEditSalePrice(event.target.value)}
                          />
                        </label>

                        <button type="submit">Save Changes</button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={cancelEditingItem}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <h3>{item.name}</h3>
                        <p>SKU: {item.sku}</p>
                        <p>Buyer: {item.buyer}</p>
                        <p>Category: {item.category || "Not listed"}</p>
                        <p>Store / Source: {item.store || "Not listed"}</p>
                        <p>Quantity: {item.quantity}</p>
                        <p>Unit Cost: ${item.unitCost.toFixed(2)}</p>
                        <p>Planned Sale Price: ${item.salePrice.toFixed(2)}</p>
                        <p>
                          Estimated Profit: $
                          {(
                            item.quantity * item.salePrice -
                            item.quantity * item.unitCost
                          ).toFixed(2)}
                        </p>

                        {item.receiptImage && (
                          <div className="receipt-preview">
                            <p>Receipt / Screenshot:</p>
                            <a href={item.receiptImage} target="_blank" rel="noreferrer">
                              <img src={item.receiptImage} alt="Inventory receipt" />
                            </a>
                          </div>
                        )}

                        <button
                          className="edit-button"
                          onClick={() => startEditingItem(item)}
                        >
                          Edit Item
                        </button>

                        <button
                          className="delete-button"
                          onClick={() => deleteItem(item.id)}
                        >
                          Delete Item
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "sales" && (
          <section className="panel">
            <h2>Sales</h2>

            {sales.length === 0 ? (
              <p>No sales added yet.</p>
            ) : (
              <div className="inventory-list">
                {sales.map((sale) => (
                  <div className="inventory-card" key={sale.id}>
                    <h3>{sale.itemName}</h3>
                    <p>SKU: {sale.sku}</p>
                    <p>Platform: {sale.platform}</p>
                    <p>Quantity Sold: {sale.quantitySold}</p>
                    <p>Sale Price Each: ${sale.finalSalePrice.toFixed(2)}</p>
                    <p>Gross Sale: ${sale.grossSale.toFixed(2)}</p>
                    <p>Item Cost: ${sale.itemCost.toFixed(2)}</p>
                    <p>Shipping: ${sale.shippingCost.toFixed(2)}</p>
                    <p>Fees: ${sale.platformFees.toFixed(2)}</p>
                    <p>Net Profit: ${sale.netProfit.toFixed(2)}</p>
                    {sale.notes && <p>Notes: {sale.notes}</p>}

                    <button
                      className="delete-button"
                      onClick={() => deleteSale(sale.id)}
                    >
                      Delete Sale
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;