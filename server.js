const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "owner";
const ADMIN_PASSWORD = "restaurant123";
const ADMIN_TOKEN = "owner-demo-token";

const MENU_CATEGORIES = [
  "Chef Specials",
  "Starters",
  "Mains",
  "Desserts",
  "Drinks",
];

const ORDER_TYPES = ["Dine In", "Takeaway", "Pickup"];

const ORDER_STATUS = {
  NEW: "New",
  PREPARING: "Preparing",
  READY: "Ready to Serve",
  SERVED: "Served",
};

const KITCHEN_STATIONS = 4;
const EXTRA_UNIT_PREP_FACTOR = 0.35;
const PER_UNIT_SERVICE_BUFFER = 0.35;
const DISTINCT_DISH_BUFFER = 2;
const ACTIVE_QUEUE_FACTOR = 0.4;

const VALID_ORDER_STATUSES = new Set(Object.values(ORDER_STATUS));

app.use(express.json());
app.use(express.static(__dirname));

let nextMenuId = 9;
let nextOrderId = 1001;

let menu = [
  {
    id: 1,
    name: "Fire Grill Burger",
    price: 13.5,
    description: "Beef patty, smoked cheddar, onion jam, pickles, and pepper aioli.",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
    category: "Chef Specials",
    prepTime: 18,
    featured: true,
    available: true,
  },
  {
    id: 2,
    name: "Truffle Parmesan Fries",
    price: 6.75,
    description: "Crisp fries with truffle oil, parmesan, parsley, and garlic mayo.",
    image:
      "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=1200&q=80",
    category: "Starters",
    prepTime: 9,
    featured: true,
    available: true,
  },
  {
    id: 3,
    name: "Garden Pesto Pasta",
    price: 11.25,
    description: "Penne with basil pesto, blistered tomatoes, olive crumbs, and parmesan.",
    image:
      "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=1200&q=80",
    category: "Mains",
    prepTime: 14,
    featured: false,
    available: true,
  },
  {
    id: 4,
    name: "Citrus Herb Salmon",
    price: 18.5,
    description: "Pan-seared salmon with lemon butter, charred greens, and roasted potatoes.",
    image:
      "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1200&q=80",
    category: "Chef Specials",
    prepTime: 20,
    featured: true,
    available: true,
  },
  {
    id: 5,
    name: "Mango Mint Cooler",
    price: 4.5,
    description: "Fresh mango, lime, mint, and sparkling water over crushed ice.",
    image:
      "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1200&q=80",
    category: "Drinks",
    prepTime: 4,
    featured: false,
    available: true,
  },
  {
    id: 6,
    name: "Chocolate Lava Slice",
    price: 7.25,
    description: "Warm chocolate cake with vanilla bean cream and sea salt caramel.",
    image:
      "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=1200&q=80",
    category: "Desserts",
    prepTime: 8,
    featured: false,
    available: true,
  },
  {
    id: 7,
    name: "Roasted Chicken Bowl",
    price: 12.75,
    description: "Herb chicken, fragrant rice, charred corn, greens, and tahini drizzle.",
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80",
    category: "Mains",
    prepTime: 13,
    featured: true,
    available: true,
  },
  {
    id: 8,
    name: "Sparkling Berry Tea",
    price: 4.25,
    description: "Black tea, mixed berries, citrus, and a chilled sparkling finish.",
    image:
      "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80",
    category: "Drinks",
    prepTime: 4,
    featured: false,
    available: false,
  },
];

let orders = [];

function toMoney(value) {
  return Number(Number(value).toFixed(2));
}

function cleanText(value) {
  return String(value || "").trim();
}

function asBoolean(value, defaultValue = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return defaultValue;
}

function buildStatusHistoryEntry(status, note, timestamp) {
  return { status, note, timestamp };
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  next();
}

function normalizeMenuItem(payload = {}) {
  const name = cleanText(payload.name);
  const description = cleanText(payload.description);
  const image = cleanText(payload.image);
  const category = cleanText(payload.category) || "Mains";
  const price = Number(payload.price);
  const prepTime = Number(payload.prepTime);

  if (!name) {
    return { error: "Food name is required." };
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Price must be a number greater than 0." };
  }

  if (!Number.isInteger(prepTime) || prepTime <= 0) {
    return { error: "Prep time must be a whole number greater than 0." };
  }

  if (!MENU_CATEGORIES.includes(category)) {
    return { error: "Please choose a valid category." };
  }

  return {
    item: {
      name,
      description,
      image,
      category,
      prepTime,
      featured: asBoolean(payload.featured, false),
      available: asBoolean(payload.available, true),
      price: toMoney(price),
    },
  };
}

function normalizeOrder(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const customerName = cleanText(payload.customerName);
  const tableLabel = cleanText(payload.tableLabel);
  const notes = cleanText(payload.notes);
  const orderType = cleanText(payload.orderType) || "Dine In";

  if (!items.length) {
    return { error: "Order must include at least one item." };
  }

  if (!ORDER_TYPES.includes(orderType)) {
    return { error: "Please choose a valid service type." };
  }

  if (orderType === "Dine In" && !tableLabel) {
    return { error: "Table or seat label is required for dine-in orders." };
  }

  return {
    details: {
      items,
      customerName,
      tableLabel,
      notes,
      orderType,
    },
  };
}

function getOrderById(orderId) {
  return orders.find((order) => order.id === orderId);
}

function getTotalUnits(orderItems) {
  return orderItems.reduce((sum, item) => sum + item.quantity, 0);
}

function calculateKitchenWorkMinutes(orderItems) {
  return orderItems.reduce((sum, item) => {
    const extraUnits = Math.max(0, item.quantity - 1);
    const extraPrep = extraUnits * Math.max(1, item.prepTime * EXTRA_UNIT_PREP_FACTOR);
    return sum + item.prepTime + extraPrep;
  }, 0);
}

function estimateReadyMinutes(orderItems) {
  const totalUnits = getTotalUnits(orderItems);
  const distinctDishes = orderItems.length;
  const longestSingleDishPrep = Math.max(...orderItems.map((item) => item.prepTime));
  const directWorkMinutes = calculateKitchenWorkMinutes(orderItems);

  const activeOrders = orders.filter((order) => order.status !== ORDER_STATUS.SERVED);
  const activeQueueMinutes = activeOrders.reduce(
    (sum, order) => sum + calculateKitchenWorkMinutes(order.items),
    0
  );

  const stationWorkload =
    (directWorkMinutes + (activeQueueMinutes * ACTIVE_QUEUE_FACTOR)) / KITCHEN_STATIONS;
  const serviceBuffer =
    (totalUnits * PER_UNIT_SERVICE_BUFFER) + (distinctDishes * DISTINCT_DISH_BUFFER);

  return Math.min(
    240,
    Math.ceil(Math.max(longestSingleDishPrep, stationWorkload + serviceBuffer))
  );
}

function buildDashboardSummary() {
  const revenue = toMoney(orders.reduce((sum, order) => sum + order.total, 0));
  const activeOrders = orders.filter((order) => order.status !== ORDER_STATUS.SERVED).length;
  const servedOrders = orders.filter((order) => order.status === ORDER_STATUS.SERVED).length;
  const averageTicket = orders.length ? toMoney(revenue / orders.length) : 0;

  const itemTotals = new Map();
  const recentActivity = [];

  orders.forEach((order) => {
    order.items.forEach((item) => {
      const current = itemTotals.get(item.name) || 0;
      itemTotals.set(item.name, current + item.quantity);
    });

    order.statusHistory.forEach((entry) => {
      recentActivity.push({
        orderId: order.id,
        status: entry.status,
        note: entry.note,
        timestamp: entry.timestamp,
        customerName: order.customerName,
      });
    });
  });

  const topSellingItem =
    [...itemTotals.entries()]
      .sort((left, right) => right[1] - left[1])[0] || null;

  return {
    menuCount: menu.length,
    availableCount: menu.filter((item) => item.available).length,
    featuredCount: menu.filter((item) => item.featured).length,
    ordersCount: orders.length,
    activeOrders,
    servedOrders,
    revenue,
    averageTicket,
    topSellingItem: topSellingItem
      ? { name: topSellingItem[0], quantity: topSellingItem[1] }
      : null,
    statusCounts: Object.values(ORDER_STATUS).map((status) => ({
      status,
      count: orders.filter((order) => order.status === status).length,
    })),
    categoryCounts: MENU_CATEGORIES.map((category) => ({
      category,
      count: menu.filter((item) => item.category === category).length,
    })),
    recentActivity: recentActivity
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
      .slice(0, 8),
    menuCategories: MENU_CATEGORIES,
    orderTypes: ORDER_TYPES,
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.post("/admin/login", (req, res) => {
  const username = cleanText(req.body.username);
  const password = cleanText(req.body.password);

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid username or password." });
  }

  res.json({
    message: "Login successful.",
    token: ADMIN_TOKEN,
    user: { username: ADMIN_USERNAME },
  });
});

app.get("/menu", (req, res) => {
  res.json([...menu].sort((left, right) => left.id - right.id));
});

app.post("/menu", requireAdmin, (req, res) => {
  const { item, error } = normalizeMenuItem(req.body);

  if (error) {
    return res.status(400).json({ message: error });
  }

  const newItem = { id: nextMenuId++, ...item };
  menu.push(newItem);

  res.status(201).json({
    message: "Food item added successfully.",
    item: newItem,
  });
});

app.put("/menu/:id", requireAdmin, (req, res) => {
  const itemId = Number(req.params.id);
  const currentItem = menu.find((item) => item.id === itemId);

  if (!currentItem) {
    return res.status(404).json({ message: "Food item not found." });
  }

  const { item, error } = normalizeMenuItem(req.body);

  if (error) {
    return res.status(400).json({ message: error });
  }

  Object.assign(currentItem, item);

  res.json({
    message: "Food item updated successfully.",
    item: currentItem,
  });
});

app.delete("/menu/:id", requireAdmin, (req, res) => {
  const itemId = Number(req.params.id);
  const itemIndex = menu.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ message: "Food item not found." });
  }

  const [removedItem] = menu.splice(itemIndex, 1);

  res.json({
    message: "Food item deleted successfully.",
    item: removedItem,
  });
});

app.get("/dashboard", requireAdmin, (req, res) => {
  res.json(buildDashboardSummary());
});

app.post("/order", (req, res) => {
  const { details, error } = normalizeOrder(req.body);

  if (error) {
    return res.status(400).json({ message: error });
  }

  const orderItems = [];

  for (const entry of details.items) {
    const itemId = Number(entry.id);
    const quantity = Number(entry.quantity);
    const menuItem = menu.find((item) => item.id === itemId);

    if (!menuItem) {
      return res
        .status(400)
        .json({ message: `Menu item with id ${itemId} does not exist.` });
    }

    if (!menuItem.available) {
      return res.status(400).json({ message: `${menuItem.name} is not available right now.` });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ message: `Quantity for ${menuItem.name} must be a positive integer.` });
    }

    orderItems.push({
      id: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      price: menuItem.price,
      prepTime: menuItem.prepTime,
      quantity,
      lineTotal: toMoney(menuItem.price * quantity),
    });
  }

  const total = toMoney(orderItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const createdAt = new Date().toISOString();
  const estimatedReadyMinutes = estimateReadyMinutes(orderItems);

  const order = {
    id: `ORD-${nextOrderId++}`,
    customerName: details.customerName,
    tableLabel: details.tableLabel,
    notes: details.notes,
    orderType: details.orderType,
    items: orderItems,
    total,
    estimatedReadyMinutes,
    timestamp: createdAt,
    updatedAt: createdAt,
    status: ORDER_STATUS.NEW,
    servedAt: null,
    statusHistory: [
      buildStatusHistoryEntry(
        ORDER_STATUS.NEW,
        "Order received and queued for the kitchen team.",
        createdAt
      ),
    ],
  };

  orders.unshift(order);

  res.status(201).json({
    message: "Order placed successfully.",
    order,
  });
});

app.get("/order/:id", (req, res) => {
  const order = getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  res.json(order);
});

app.get("/orders", requireAdmin, (req, res) => {
  res.json(orders);
});

app.patch("/orders/:id/status", requireAdmin, (req, res) => {
  const order = getOrderById(req.params.id);
  const nextStatus = cleanText(req.body.status);

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  if (!VALID_ORDER_STATUSES.has(nextStatus)) {
    return res.status(400).json({ message: "Invalid order status." });
  }

  if (order.status === nextStatus) {
    return res.json({
      message: `Order ${order.id} is already marked as ${order.status}.`,
      order,
    });
  }

  const updatedAt = new Date().toISOString();
  const noteByStatus = {
    [ORDER_STATUS.NEW]: "Order returned to the queue.",
    [ORDER_STATUS.PREPARING]: "Kitchen started preparing the order.",
    [ORDER_STATUS.READY]: "Order is plated and ready to serve.",
    [ORDER_STATUS.SERVED]: "Order has been served to the guest.",
  };

  order.status = nextStatus;
  order.updatedAt = updatedAt;
  order.servedAt = nextStatus === ORDER_STATUS.SERVED ? updatedAt : null;
  order.statusHistory.push(
    buildStatusHistoryEntry(nextStatus, noteByStatus[nextStatus], updatedAt)
  );

  res.json({
    message: `Order ${order.id} updated to ${order.status}.`,
    order,
  });
});

app.listen(PORT, () => {
  console.log(`Restaurant Ordering System running at http://localhost:${PORT}`);
  console.log(`Admin login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});
