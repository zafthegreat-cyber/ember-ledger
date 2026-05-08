import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { pool, testDbConnection } from "./db";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

type Day = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type Confidence = "Low" | "Medium" | "High";
type ItemStatus = "Unknown" | "In Stock" | "Out of Stock";
type StoreStatus = "Unknown" | "Found" | "Sold Out" | "Called" | "Skip Today";

type AlertSettings = {
  online: boolean;
  inPerson: boolean;
  predicted: boolean;
};

type TrackedItem = {
  id: string;
  storeId?: string;
  category?: string;
  name: string;
  retailerItemNumber?: string;
  sku?: string;
  upc?: string;
  productUrl?: string;
  status: ItemStatus;
  price?: number | null;
  inStock?: boolean | null;
  lastCheckedAt?: string | null;
  lastSeenInStockAt?: string | null;
  sourceType?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Report = {
  id: string;
  itemName?: string;
  note: string;
  reportDate: string;
  reportTime?: string;
  reportedBy?: string;
  verified: boolean;
  lat?: number;
  lng?: number;
  imageUrl?: string;
  ocrText?: string;
  createdAt: string;
};

type Contact = {
  id: string;
  name: string;
  source?: string;
  phone?: string;
  city?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

type Notification = {
  id: string;
  title: string;
  body: string;
  channel: "push" | "email" | "sms" | "in_app";
  createdAt: string;
};

const contacts: Contact[] = [];
const notifications: Notification[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function toDay(dateString: string): Day {
  const date = new Date(`${dateString}T00:00:00`);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()] as Day;
}

function nextOccurrence(targetDay: Day): string {
  const days: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  const current = now.getDay();
  const target = days.indexOf(targetDay);
  const delta = (target - current + 7) % 7 || 7;
  const result = new Date(now);
  result.setDate(now.getDate() + delta);
  return result.toISOString().slice(0, 10);
}
const seed757Stores = [
  {
    name: "Target Greenbrier",
    chain: "Target",
    type: "Big Box",
    city: "Chesapeake",
    address: "",
    stockDays: ["Tue", "Fri"],
    truckDays: ["Mon", "Tue"],
    bestTime: "08:00",
    routeZone: "Primary",
    notes: "Greenbrier target",
    priority: true,
  },
  {
    name: "Walmart Hillcrest",
    chain: "Walmart",
    type: "Big Box",
    city: "Norfolk",
    address: "",
    stockDays: ["Wed"],
    truckDays: ["Wed"],
    bestTime: "09:00",
    routeZone: "Primary",
    notes: "Hillcrest Walmart",
    priority: true,
  },
  {
    name: "Target Hillcrest",
    chain: "Target",
    type: "Big Box",
    city: "Norfolk",
    address: "",
    stockDays: ["Mon", "Fri"],
    truckDays: [],
    bestTime: "08:00",
    routeZone: "Primary",
    notes: "Hillcrest Target",
    priority: true,
  },
  {
    name: "Target Independence",
    chain: "Target",
    type: "Big Box",
    city: "Virginia Beach",
    address: "",
    stockDays: ["Tue", "Thu"],
    truckDays: [],
    bestTime: "08:00",
    routeZone: "Primary",
    notes: "Independence Target",
    priority: true,
  },
  {
    name: "Target South Independence",
    chain: "Target",
    type: "Big Box",
    city: "Virginia Beach",
    address: "",
    stockDays: ["Thu"],
    truckDays: [],
    bestTime: "08:00",
    routeZone: "Primary",
    notes: "South Independence Target",
    priority: true,
  },
  {
    name: "Target Red Mill",
    chain: "Target",
    type: "Big Box",
    city: "Virginia Beach",
    address: "",
    stockDays: ["Mon", "Thu"],
    truckDays: [],
    bestTime: "08:00",
    routeZone: "Secondary",
    notes: "Red Mill Target",
    priority: true,
  },
  {
    name: "Target Hampton",
    chain: "Target",
    type: "Big Box",
    city: "Hampton",
    address: "",
    stockDays: ["Thu", "Fri"],
    truckDays: [],
    bestTime: "08:00",
    routeZone: "Secondary",
    notes: "Hampton Target",
    priority: true,
  },
  {
    name: "Target Newport News",
    chain: "Target",
    type: "Big Box",
    city: "Newport News",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "08:00",
    routeZone: "Secondary",
    notes: "Newport News Target",
    priority: true,
  },
  {
    name: "Walmart Grassfield",
    chain: "Walmart",
    type: "Big Box",
    city: "Chesapeake",
    address: "",
    stockDays: ["Fri"],
    truckDays: ["Fri"],
    bestTime: "17:00",
    routeZone: "Primary",
    notes: "Grassfield Walmart",
    priority: true,
  },
  {
    name: "Walmart Chesapeake Square",
    chain: "Walmart",
    type: "Big Box",
    city: "Chesapeake",
    address: "",
    stockDays: ["Thu"],
    truckDays: ["Thu"],
    bestTime: "11:00",
    routeZone: "Primary",
    notes: "Chesapeake Square Walmart",
    priority: true,
  },
  {
    name: "Walmart Portsmouth",
    chain: "Walmart",
    type: "Big Box",
    city: "Portsmouth",
    address: "",
    stockDays: ["Thu"],
    truckDays: ["Thu"],
    bestTime: "12:00",
    routeZone: "Primary",
    notes: "Portsmouth Walmart",
    priority: true,
  },
  {
    name: "Walmart Suffolk",
    chain: "Walmart",
    type: "Big Box",
    city: "Suffolk",
    address: "",
    stockDays: ["Wed"],
    truckDays: ["Wed"],
    bestTime: "09:00",
    routeZone: "Primary",
    notes: "Suffolk Walmart",
    priority: true,
  },
  {
    name: "Walmart Northern Suffolk",
    chain: "Walmart",
    type: "Big Box",
    city: "Suffolk",
    address: "",
    stockDays: ["Fri"],
    truckDays: ["Fri"],
    bestTime: "09:00",
    routeZone: "Primary",
    notes: "Northern Suffolk Walmart",
    priority: true,
  },
  {
    name: "Walmart Military Highway",
    chain: "Walmart",
    type: "Big Box",
    city: "Norfolk",
    address: "",
    stockDays: ["Wed"],
    truckDays: ["Wed"],
    bestTime: "09:00",
    routeZone: "Primary",
    notes: "Military Highway Walmart",
    priority: true,
  },
  {
    name: "Walmart Yorktown",
    chain: "Walmart",
    type: "Big Box",
    city: "Yorktown",
    address: "",
    stockDays: ["Fri"],
    truckDays: ["Fri"],
    bestTime: "09:00",
    routeZone: "Secondary",
    notes: "Yorktown Walmart",
    priority: true,
  },
  {
    name: "Best Buy Chesapeake",
    chain: "Best Buy",
    type: "Electronics",
    city: "Chesapeake",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "10:00",
    routeZone: "Secondary",
    notes: "Best Buy Chesapeake",
    priority: false,
  },
  {
    name: "Best Buy Virginia Beach",
    chain: "Best Buy",
    type: "Electronics",
    city: "Virginia Beach",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "10:00",
    routeZone: "Secondary",
    notes: "Best Buy Virginia Beach",
    priority: false,
  },
  {
    name: "Costco Norfolk",
    chain: "Costco",
    type: "Warehouse",
    city: "Norfolk",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "10:00",
    routeZone: "Secondary",
    notes: "Costco Norfolk",
    priority: true,
  },
  {
    name: "Sam's Club Norfolk",
    chain: "Sam's Club",
    type: "Warehouse",
    city: "Norfolk",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "10:00",
    routeZone: "Secondary",
    notes: "Sam's Club Norfolk",
    priority: true,
  },
  {
    name: "BJ's Chesapeake",
    chain: "BJ's",
    type: "Warehouse",
    city: "Chesapeake",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "10:00",
    routeZone: "Secondary",
    notes: "BJ's Chesapeake",
    priority: false,
  },
  {
    name: "Five Below Chesapeake",
    chain: "Five Below",
    type: "Discount",
    city: "Chesapeake",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "11:00",
    routeZone: "Secondary",
    notes: "Five Below Chesapeake",
    priority: false,
  },
  {
    name: "Five Below Virginia Beach",
    chain: "Five Below",
    type: "Discount",
    city: "Virginia Beach",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "11:00",
    routeZone: "Secondary",
    notes: "Five Below Virginia Beach",
    priority: false,
  },
  {
    name: "Kohl's Chesapeake",
    chain: "Kohl's",
    type: "Department",
    city: "Chesapeake",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "11:00",
    routeZone: "Secondary",
    notes: "Kohl's Chesapeake",
    priority: false,
  },
  {
    name: "Dick's Virginia Beach",
    chain: "Dick's Sporting Goods",
    type: "Sporting Goods",
    city: "Virginia Beach",
    address: "",
    stockDays: [],
    truckDays: [],
    bestTime: "11:00",
    routeZone: "Secondary",
    notes: "Dick's Virginia Beach",
    priority: false,
  },
];

function estimateTimeWindowFromReports(
  reports: { report_date?: string; report_time?: string; verified?: boolean }[],
  fallback?: string | null
): string {
  const reportTimes = reports
    .filter((r) => r.verified)
    .map((r) => r.report_time)
    .filter(Boolean) as string[];

  if (reportTimes.length === 0) return fallback || "Morning";

  const buckets: Record<string, number> = {
    "6-9 AM": 0,
    "9-12 PM": 0,
    "12-4 PM": 0,
    "4-8 PM": 0,
  };

  for (const t of reportTimes) {
    const hour = Number(t.split(":")[0]);
    if (hour >= 6 && hour < 9) buckets["6-9 AM"] += 1;
    else if (hour >= 9 && hour < 12) buckets["9-12 PM"] += 1;
    else if (hour >= 12 && hour < 16) buckets["12-4 PM"] += 1;
    else buckets["4-8 PM"] += 1;
  }

  return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
}

function predictRestockFromDbRow(
  store: {
    stock_days?: string[] | null;
    truck_days?: string[] | null;
    best_time?: string | null;
  },
  verifiedReports: { report_date?: string; report_time?: string; verified?: boolean }[]
): {
  nextRestockGuess?: string;
  nextRestockReason?: string;
  confidenceLevel: Confidence;
} {
  if (verifiedReports.length >= 2) {
    const counts: Record<string, number> = {};
    for (const report of verifiedReports) {
      if (!report.report_date) continue;
      const d = toDay(report.report_date);
      counts[d] = (counts[d] || 0) + 1;
    }

    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as
      | Day
      | undefined;

    if (best) {
      return {
        nextRestockGuess: nextOccurrence(best),
        nextRestockReason: `Based on ${verifiedReports.length} verified reports, ${best} is the strongest pattern around ${estimateTimeWindowFromReports(
          verifiedReports,
          store.best_time
        )}.`,
        confidenceLevel: verifiedReports.length >= 4 ? "High" : "Medium",
      };
    }
  }

  if (store.stock_days && store.stock_days.length > 0) {
    return {
      nextRestockGuess: nextOccurrence(store.stock_days[0] as Day),
      nextRestockReason: `Using saved stock-day pattern: ${store.stock_days.join(", ")} around ${store.best_time || "morning"}.`,
      confidenceLevel: "Medium",
    };
  }

  if (store.truck_days && store.truck_days.length > 0) {
    return {
      nextRestockGuess: nextOccurrence(store.truck_days[0] as Day),
      nextRestockReason: `Fallback to truck-day pattern: ${store.truck_days.join(", ")}.`,
      confidenceLevel: "Low",
    };
  }

  return {
    nextRestockGuess: undefined,
    nextRestockReason: "Not enough data yet.",
    confidenceLevel: "Low",
  };
}

function sendNotification(
  channel: Notification["channel"],
  title: string,
  body: string
) {
  notifications.unshift({
    id: randomUUID(),
    title,
    body,
    channel,
    createdAt: nowIso(),
  });
}

function mapStoreRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    chain: row.chain,
    type: row.type,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    shelfLocation: row.shelf_location,
    truckDays: row.truck_days || [],
    stockDays: row.stock_days || [],
    bestTime: row.best_time,
    routeZone: row.route_zone,
    notes: row.notes,
    truckInfo: row.truck_info,
    websiteCheckStatus: row.website_check_status,
    liveStockMode: row.live_stock_mode,
    priority: row.priority,
    discoveredByUser: row.discovered_by_user,
    confidenceLevel: row.confidence_level,
    nextRestockGuess: row.next_restock_guess,
    nextRestockReason: row.next_restock_reason,
    lastSeenAt: row.last_seen_at,
    lastUpdatedAt: row.last_updated_at,
    lastSyncAt: row.last_sync_at,
    status: row.status,
    alertSettings: row.alert_settings || {
      online: true,
      inPerson: true,
      predicted: false,
    },
  };
}

function mapTrackedItemRow(row: any): TrackedItem {
  return {
    id: row.id,
    storeId: row.store_id,
    category: row.category,
    name: row.name,
    retailerItemNumber: row.retailer_item_number,
    sku: row.sku,
    upc: row.upc,
    productUrl: row.product_url,
    status: row.status,
    price: row.price,
    inStock: row.in_stock,
    lastCheckedAt: row.last_checked_at,
    lastSeenInStockAt: row.last_seen_in_stock_at,
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
/** DB Test */
app.get("/db-test", async (_req: Request, res: Response) => {
  try {
    const dbTime = await testDbConnection();
    res.json({ ok: true, dbTime });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: "Database connection failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/** Health */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, time: nowIso() });
});

/** Stores */
app.get("/stores", async (_req: Request, res: Response) => {
  try {
    const storeResult = await pool.query(
      `
      select *
      from stores
      order by created_at desc
      `
    );

    const storesWithPredictions = await Promise.all(
      storeResult.rows.map(async (row) => {
        const reportResult = await pool.query(
          `
          select report_date, report_time, verified
          from reports
          where store_id = $1
          order by created_at desc
          `,
          [row.id]
        );

        const prediction = predictRestockFromDbRow(row, reportResult.rows);
        return {
          ...mapStoreRow(row),
          ...prediction,
        };
      })
    );

    res.json(storesWithPredictions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch stores" });
  }
});

app.post("/stores", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const result = await pool.query(
      `
      insert into stores (
        name,
        chain,
        type,
        address,
        city,
        state,
        zip,
        phone,
        lat,
        lng,
        shelf_location,
        truck_days,
        stock_days,
        best_time,
        route_zone,
        notes,
        truck_info,
        website_check_status,
        live_stock_mode,
        priority,
        discovered_by_user,
        confidence_level,
        status,
        alert_settings,
        last_updated_at
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24::jsonb,$25
      )
      returning *
      `,
      [
        body.name || "Unnamed Store",
        body.chain || null,
        body.type || null,
        body.address || null,
        body.city || null,
        body.state || null,
        body.zip || null,
        body.phone || null,
        body.lat || null,
        body.lng || null,
        body.shelfLocation || null,
        JSON.stringify(body.truckDays || []),
        JSON.stringify(body.stockDays || []),
        body.bestTime || null,
        body.routeZone || null,
        body.notes || null,
        body.truckInfo || null,
        body.websiteCheckStatus || null,
        body.liveStockMode || "manual",
        !!body.priority,
        body.discoveredByUser ?? true,
        body.confidenceLevel || "Low",
        body.status || "Unknown",
        JSON.stringify(
          body.alertSettings || {
            online: true,
            inPerson: true,
            predicted: false,
          }
        ),
        nowIso(),
      ]
    );

    res.status(201).json(mapStoreRow(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create store" });
  }
});

app.get("/stores/:id", async (req: Request, res: Response) => {
  try {
    const storeResult = await pool.query(
      `
      select *
      from stores
      where id = $1
      limit 1
      `,
      [req.params.id]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    const row = storeResult.rows[0];

    const reportResult = await pool.query(
      `
      select report_date, report_time, verified
      from reports
      where store_id = $1
      order by created_at desc
      `,
      [row.id]
    );

    const prediction = predictRestockFromDbRow(row, reportResult.rows);

    res.json({
      ...mapStoreRow(row),
      ...prediction,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch store" });
  }
});

app.patch("/stores/:id", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const result = await pool.query(
      `
      update stores
      set
        name = coalesce($2, name),
        chain = coalesce($3, chain),
        type = coalesce($4, type),
        address = coalesce($5, address),
        city = coalesce($6, city),
        state = coalesce($7, state),
        zip = coalesce($8, zip),
        phone = coalesce($9, phone),
        lat = coalesce($10, lat),
        lng = coalesce($11, lng),
        shelf_location = coalesce($12, shelf_location),
        truck_days = coalesce($13::jsonb, truck_days),
        stock_days = coalesce($14::jsonb, stock_days),
        best_time = coalesce($15, best_time),
        route_zone = coalesce($16, route_zone),
        notes = coalesce($17, notes),
        truck_info = coalesce($18, truck_info),
        website_check_status = coalesce($19, website_check_status),
        live_stock_mode = coalesce($20, live_stock_mode),
        priority = coalesce($21, priority),
        discovered_by_user = coalesce($22, discovered_by_user),
        confidence_level = coalesce($23, confidence_level),
        status = coalesce($24, status),
        alert_settings = coalesce($25::jsonb, alert_settings),
        last_updated_at = $26
      where id = $1
      returning *
      `,
      [
        req.params.id,
        body.name ?? null,
        body.chain ?? null,
        body.type ?? null,
        body.address ?? null,
        body.city ?? null,
        body.state ?? null,
        body.zip ?? null,
        body.phone ?? null,
        body.lat ?? null,
        body.lng ?? null,
        body.shelfLocation ?? null,
        body.truckDays ? JSON.stringify(body.truckDays) : null,
        body.stockDays ? JSON.stringify(body.stockDays) : null,
        body.bestTime ?? null,
        body.routeZone ?? null,
        body.notes ?? null,
        body.truckInfo ?? null,
        body.websiteCheckStatus ?? null,
        body.liveStockMode ?? null,
        typeof body.priority === "boolean" ? body.priority : null,
        typeof body.discoveredByUser === "boolean" ? body.discoveredByUser : null,
        body.confidenceLevel ?? null,
        body.status ?? null,
        body.alertSettings ? JSON.stringify(body.alertSettings) : null,
        nowIso(),
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    res.json(mapStoreRow(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update store" });
  }
});

app.delete("/stores/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      delete from stores
      where id = $1
      returning *
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    res.json(mapStoreRow(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete store" });
  }
});

/** Tracked items - now using PostgreSQL */
app.get("/stores/:id/items", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      select *
      from tracked_items
      where store_id = $1
      order by created_at desc
      `,
      [req.params.id]
    );

    res.json(result.rows.map(mapTrackedItemRow));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch tracked items" });
  }
});

app.post("/stores/:id/items", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<TrackedItem>;

    const result = await pool.query(
      `
      insert into tracked_items (
        store_id,
        category,
        name,
        retailer_item_number,
        sku,
        upc,
        product_url,
        source_type,
        status,
        price,
        in_stock,
        last_checked_at,
        last_seen_in_stock_at
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )
      returning *
      `,
      [
        req.params.id,
        body.category || "Pokémon",
        body.name || "Unnamed Item",
        body.retailerItemNumber || null,
        body.sku || null,
        body.upc || null,
        body.productUrl || null,
        body.sourceType || "manual",
        body.status || "Unknown",
        body.price ?? null,
        body.inStock ?? null,
        body.lastCheckedAt || null,
        body.lastSeenInStockAt || null,
      ]
    );

    await pool.query(
      `
      update stores
      set last_updated_at = $2
      where id = $1
      `,
      [req.params.id, nowIso()]
    );

    res.status(201).json(mapTrackedItemRow(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create tracked item" });
  }
});

app.patch("/stores/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<TrackedItem>;

    const result = await pool.query(
      `
      update tracked_items
      set
        name = coalesce($3, name),
        retailer_item_number = coalesce($4, retailer_item_number),
        sku = coalesce($5, sku),
        upc = coalesce($6, upc),
        product_url = coalesce($7, product_url),
        source_type = coalesce($8, source_type),
        status = coalesce($9, status),
        price = coalesce($10, price),
        in_stock = coalesce($11, in_stock),
        last_checked_at = coalesce($12, last_checked_at),
        last_seen_in_stock_at = coalesce($13, last_seen_in_stock_at)
      where id = $1 and store_id = $2
      returning *
      `,
      [
        req.params.itemId,
        req.params.id,
        body.name ?? null,
        body.retailerItemNumber ?? null,
        body.sku ?? null,
        body.upc ?? null,
        body.productUrl ?? null,
        body.sourceType ?? null,
        body.status ?? null,
        body.price ?? null,
        body.inStock ?? null,
        body.lastCheckedAt ?? null,
        body.lastSeenInStockAt ?? null,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tracked item not found" });
    }

    await pool.query(
      `
      update stores
      set last_updated_at = $2
      where id = $1
      `,
      [req.params.id, nowIso()]
    );

    res.json(mapTrackedItemRow(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update tracked item" });
  }
});

app.delete("/stores/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      delete from tracked_items
      where id = $1 and store_id = $2
      returning *
      `,
      [req.params.itemId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tracked item not found" });
    }

    await pool.query(
      `
      update stores
      set last_updated_at = $2
      where id = $1
      `,
      [req.params.id, nowIso()]
    );

    res.json(mapTrackedItemRow(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete tracked item" });
  }
});

/** Reports */
app.get("/stores/:id/reports", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      select *
      from reports
      where store_id = $1
      order by created_at desc
      `,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

app.post("/stores/:id/reports", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<Report>;

    const result = await pool.query(
      `
      insert into reports (
        store_id,
        item_name,
        note,
        report_date,
        report_time,
        reported_by,
        verified,
        lat,
        lng,
        image_url,
        ocr_text
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )
      returning *
      `,
      [
        req.params.id,
        body.itemName || null,
        body.note || "Stock seen",
        body.reportDate || nowIso().slice(0, 10),
        body.reportTime || null,
        body.reportedBy || null,
        !!body.verified,
        body.lat || null,
        body.lng || null,
        body.imageUrl || null,
        body.ocrText || null,
      ]
    );

    await pool.query(
      `
      update stores
      set
        last_seen_at = $2,
        last_updated_at = $3,
        status = 'Found'
      where id = $1
      `,
      [req.params.id, body.reportDate || nowIso().slice(0, 10), nowIso()]
    );

    sendNotification(
      "in_app",
      `Store report added`,
      `${body.note || "Stock seen"}`
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create report" });
  }
});

app.patch("/stores/:id/reports/:reportId", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<Report>;

    const result = await pool.query(
      `
      update reports
      set
        item_name = coalesce($3, item_name),
        note = coalesce($4, note),
        report_date = coalesce($5, report_date),
        report_time = coalesce($6, report_time),
        reported_by = coalesce($7, reported_by),
        verified = coalesce($8, verified),
        lat = coalesce($9, lat),
        lng = coalesce($10, lng),
        image_url = coalesce($11, image_url),
        ocr_text = coalesce($12, ocr_text)
      where id = $1 and store_id = $2
      returning *
      `,
      [
        req.params.reportId,
        req.params.id,
        body.itemName ?? null,
        body.note ?? null,
        body.reportDate ?? null,
        body.reportTime ?? null,
        body.reportedBy ?? null,
        typeof body.verified === "boolean" ? body.verified : null,
        body.lat ?? null,
        body.lng ?? null,
        body.imageUrl ?? null,
        body.ocrText ?? null,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    await pool.query(
      `
      update stores
      set last_updated_at = $2
      where id = $1
      `,
      [req.params.id, nowIso()]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update report" });
  }
});

app.delete("/stores/:id/reports/:reportId", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      delete from reports
      where id = $1 and store_id = $2
      returning *
      `,
      [req.params.reportId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    await pool.query(
      `
      update stores
      set last_updated_at = $2
      where id = $1
      `,
      [req.params.id, nowIso()]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

/** Contacts - still in-memory */
app.get("/contacts", (_req: Request, res: Response) => {
  res.json(contacts);
});

app.post("/contacts", (req: Request, res: Response) => {
  const body = req.body as Partial<Contact>;
  const contact: Contact = {
    id: randomUUID(),
    name: body.name || "Unnamed Contact",
    source: body.source,
    phone: body.phone,
    city: body.city,
    notes: body.notes,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  contacts.unshift(contact);
  res.status(201).json(contact);
});

/** Predictions */
app.get("/predictions/week", async (_req: Request, res: Response) => {
  try {
    const storeResult = await pool.query(
      `
      select *
      from stores
      order by created_at desc
      `
    );

    const projected = await Promise.all(
      storeResult.rows.map(async (row) => {
        const reportResult = await pool.query(
          `
          select report_date, report_time, verified
          from reports
          where store_id = $1
          order by created_at desc
          `,
          [row.id]
        );

        const prediction = predictRestockFromDbRow(row, reportResult.rows);

        return {
          storeId: row.id,
          storeName: row.name,
          address: row.address,
          city: row.city,
          bestTime: estimateTimeWindowFromReports(reportResult.rows, row.best_time),
          ...prediction,
        };
      })
    );

    res.json(projected);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch predictions" });
  }
});

/** Fake sync endpoint */
app.post("/sync/run", async (_req: Request, res: Response) => {
  try {
    const syncTime = nowIso();

    await pool.query(
      `
      update stores
      set
        last_sync_at = $1,
        last_updated_at = $1
      `,
      [syncTime]
    );

    sendNotification("in_app", "Sync completed", "Store sync finished successfully.");
    res.json({ ok: true, syncedAt: syncTime });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to run sync" });
  }
});

/** Notifications */
app.get("/notifications", (_req: Request, res: Response) => {
  res.json(notifications);
});

app.post("/notifications/test", (req: Request, res: Response) => {
  const channel = (req.body?.channel || "in_app") as Notification["channel"];
  sendNotification(channel, "Test alert", "This is a test notification.");
  res.json({ ok: true });
});

/** Seed */
app.post("/seed-757", async (_req: Request, res: Response) => {
  try {
    const inserted = [];
    const skipped = [];

    for (const store of seed757Stores) {
      const existing = await pool.query(
        `
        select id
        from stores
        where name = $1 and city = $2 and chain = $3
        limit 1
        `,
        [store.name, store.city, store.chain]
      );

      if (existing.rows.length > 0) {
        skipped.push({
          name: store.name,
          city: store.city,
          chain: store.chain,
        });
        continue;
      }

      const result = await pool.query(
        `
        insert into stores (
          name,
          chain,
          type,
          address,
          city,
          stock_days,
          truck_days,
          best_time,
          route_zone,
          notes,
          priority,
          discovered_by_user,
          confidence_level,
          status,
          alert_settings,
          last_updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16
        )
        returning *
        `,
        [
          store.name,
          store.chain,
          store.type,
          store.address,
          store.city,
          JSON.stringify(store.stockDays || []),
          JSON.stringify(store.truckDays || []),
          store.bestTime,
          store.routeZone,
          store.notes,
          store.priority,
          true,
          "Medium",
          "Unknown",
          JSON.stringify({
            online: true,
            inPerson: true,
            predicted: true,
          }),
          nowIso(),
        ]
      );

      inserted.push(result.rows[0]);
    }

    res.json({
      ok: true,
      insertedCount: inserted.length,
      skippedCount: skipped.length,
      inserted,
      skipped,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to seed 757 stores" });
  }
});
app.post("/seed", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      insert into stores (
        name,
        chain,
        type,
        address,
        city,
        state,
        zip,
        phone,
        lat,
        lng,
        shelf_location,
        truck_days,
        stock_days,
        best_time,
        route_zone,
        notes,
        truck_info,
        website_check_status,
        live_stock_mode,
        priority,
        discovered_by_user,
        confidence_level,
        status,
        alert_settings,
        last_updated_at
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24::jsonb,$25
      )
      returning *
      `,
      [
        "Target Greenbrier",
        "Target",
        "Big Box",
        "1401 Greenbrier Pkwy",
        "Chesapeake",
        "VA",
        "23320",
        null,
        36.78,
        -76.22,
        "Front card section",
        JSON.stringify(["Mon", "Tue"]),
        JSON.stringify(["Tue", "Fri"]),
        "08:00",
        "Primary",
        "Monday light, Tuesday stronger",
        "Manual notes only",
        "No backend source yet",
        "manual",
        true,
        false,
        "Medium",
        "Unknown",
        JSON.stringify({
          online: true,
          inPerson: true,
          predicted: true,
        }),
        nowIso(),
      ]
    );

    res.json(mapStoreRow(result.rows[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to seed store" });
  }
});

app.listen(PORT, () => {
  console.log(`Collector backend running on http://localhost:${PORT}`);
});
