var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_promise = __toESM(require("mysql2/promise"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_fs = __toESM(require("fs"), 1);
import_dotenv.default.config();
var CACHE_DURATION = 15 * 1e3;
var getDbConfig = (prefix, defaultUser, defaultPass, defaultDb, forceTCP = false) => {
  const config = {
    user: process.env[`${prefix}_USER`] || defaultUser,
    password: process.env[`${prefix}_PASSWORD`] || defaultPass,
    database: process.env[`${prefix}_NAME`] || defaultDb,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
  if (!forceTCP) {
    let foundSocket = "";
    if (import_fs.default.existsSync("/tmp/mysql.sock")) {
      foundSocket = "/tmp/mysql.sock";
    } else if (import_fs.default.existsSync("/var/run/mysqld/mysqld.sock")) {
      foundSocket = "/var/run/mysqld/mysqld.sock";
    }
    if (foundSocket) {
      config.socketPath = foundSocket;
      console.log(`[Database-Grid] Using UNIX Socket for ${prefix} via: ${foundSocket} \u26A1`);
      return config;
    }
  }
  config.host = process.env[`${prefix}_HOST`] || "127.0.0.1";
  config.port = Number(process.env[`${prefix}_PORT`]) || 3306;
  console.log(`[Database-Grid] Using TCP/IP for ${prefix} \u2192 ${config.user}@${config.host}:${config.port}/${config.database}`);
  return config;
};
var dbPool = import_promise.default.createPool(getDbConfig("DB", "bunon_shop_db", "256i4NSTHpwKL6AE", "bunon_shop_db"));
var dashDbPool = import_promise.default.createPool(getDbConfig("DASH_DB", "bunonfabrics_dash_db", "naim#707207AA", "bunonfabrics_dash_db"));
var ramDatabase = {
  products: [],
  lastUpdated: 0
};
var API_URL = "https://bunonfabrics.com/super_api.php";
var initializeDatabase = async () => {
  try {
    console.log("[Database] Ensuring wc_products schema is initialized...");
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS wc_products (
        id INT PRIMARY KEY,
        wc_product_id INT,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        current_price DECIMAL(10,2) DEFAULT 0.00,
        thumbnail VARCHAR(512),
        stock_status VARCHAR(50) DEFAULT 'instock',
        status VARCHAR(50) DEFAULT 'publish',
        description LONGTEXT,
        short_description TEXT,
        data LONGTEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("[Database] Ensuring bf_device_tokens schema is initialized...");
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS bf_device_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(512) UNIQUE NOT NULL,
        platform VARCHAR(50) DEFAULT 'unknown',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[Database] Ensuring bf_app_settings schema is initialized...");
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS bf_app_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("[Database] Ensuring bf_app_banners schema is initialized...");
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS bf_app_banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image_url VARCHAR(512) NOT NULL,
        redirect_type VARCHAR(50) DEFAULT 'product',
        redirect_value VARCHAR(255),
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[Database] Ensuring bf_users schema is initialized...");
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS bf_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        address TEXT,
        city VARCHAR(100),
        area VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[Database] Ensuring bf_user_sessions schema is initialized...");
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS bf_user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        device_id VARCHAR(255),
        platform VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);
    console.log("[Database] Ensuring bf_otps schema is initialized...");
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS bf_otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        is_verified TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);
    const defaultSettings = [
      ["app_discount_type", "flat"],
      ["app_discount_value", "100"],
      ["app_minimum_amount", "500"],
      ["app_push_server_key", ""],
      ["app_push_service_account", ""]
    ];
    for (const [key, val] of defaultSettings) {
      await dbPool.execute(
        "INSERT IGNORE INTO bf_app_settings (setting_key, setting_value) VALUES (?, ?)",
        [key, val]
      );
    }
    console.log("[Database] All schemas and default app settings verified successfully!");
  } catch (error) {
    console.error("[Database] Schema initialization skipped/failed:", error.message);
  }
};
var loadProductsFromLocalDB = async () => {
  try {
    const [rows] = await dbPool.execute(
      "SELECT data FROM wc_products WHERE status = 'publish' ORDER BY name ASC"
    );
    if (rows && rows.length > 0) {
      ramDatabase.products = rows.map((row) => JSON.parse(row.data));
      ramDatabase.lastUpdated = Date.now();
      console.log(`[RAM-DB] Loaded ${ramDatabase.products.length} products from LOCAL Database Cache! \u26A1`);
    } else {
      console.log("[RAM-DB] No local cached products found. Will sync on start.");
    }
  } catch (error) {
    console.error("[RAM-DB] Local DB Load Failed:", error.message);
  }
};
var syncLocalDatabase = async () => {
  try {
    console.log("[Sync] Fetching fresh catalog from remote API...");
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`API fetch failed: ${response.status}`);
    const resData = await response.json();
    if (resData && resData.ok && resData.data && resData.data.length > 0) {
      const products = resData.data;
      try {
        console.log(`[Sync] Saving ${products.length} products to persistent local database cache...`);
        for (const p of products) {
          const currentPrice = parseFloat(p.price || p.regular_price || "0");
          const thumbnail = p.thumbnail || p.images && p.images[0]?.src || "";
          await dbPool.execute(
            `INSERT INTO wc_products (id, wc_product_id, name, sku, current_price, thumbnail, stock_status, status, description, short_description, data) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'publish', ?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
             name = VALUES(name), sku = VALUES(sku), current_price = VALUES(current_price), 
             thumbnail = VALUES(thumbnail), stock_status = VALUES(stock_status), 
             description = VALUES(description), short_description = VALUES(short_description), 
             data = VALUES(data)`,
            [
              p.id,
              p.wc_product_id || p.id,
              p.name,
              p.sku || "",
              currentPrice,
              thumbnail,
              p.stock_status || "instock",
              p.description || "",
              p.short_description || "",
              JSON.stringify(p)
            ]
          );
        }
        console.log("[Sync] Local database cache saved successfully!");
      } catch (dbError) {
        console.warn("[Sync] Local database cache write failed (server remains operational in-memory):", dbError.message);
      }
      ramDatabase.products = products;
      ramDatabase.lastUpdated = Date.now();
      console.log(`[RAM-DB] Successfully synced and loaded ${ramDatabase.products.length} products with FULL Data Feed! \u26A1`);
    }
  } catch (error) {
    console.error("[RAM-DB] Sync Failed:", error.message);
  }
};
var startAppLifecycle = async () => {
  await initializeDatabase();
  await loadProductsFromLocalDB();
  syncLocalDatabase();
};
startAppLifecycle();
setInterval(syncLocalDatabase, 5 * 60 * 1e3);
var getGoogleAccessToken = async (serviceAccount) => {
  try {
    const iat = Math.floor(Date.now() / 1e3);
    const exp = iat + 3600;
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const claim = Buffer.from(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp,
      iat
    })).toString("base64url");
    const signInput = `${header}.${claim}`;
    const signature = import_crypto.default.sign(
      "RSA-SHA256",
      Buffer.from(signInput),
      serviceAccount.private_key
    ).toString("base64url");
    const jwt = `${signInput}.${signature}`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google OAuth request failed: ${errText}`);
    }
    const tokenData = await tokenRes.json();
    return tokenData.access_token;
  } catch (error) {
    console.error("[FCM OAuth2 Error]:", error.message);
    return null;
  }
};
var sendPushNotification = async (title, body, payload = {}) => {
  try {
    const [tokens] = await dbPool.execute("SELECT token FROM bf_device_tokens");
    if (!tokens || tokens.length === 0) {
      console.log("[FCM V1] Push Notification skipped: No registered device tokens found.");
      return;
    }
    const deviceTokens = tokens.map((t) => t.token);
    let serviceAccount = null;
    const saPath = import_path.default.join(process.cwd(), "firebase-service-account.json");
    if (import_fs.default.existsSync(saPath)) {
      try {
        const fileContent = import_fs.default.readFileSync(saPath, "utf-8");
        serviceAccount = JSON.parse(fileContent);
        console.log("[FCM V1] Loaded Firebase Service Account from root file!");
      } catch (err) {
        console.warn("[FCM V1] Error parsing local service account file:", err.message);
      }
    }
    if (!serviceAccount) {
      try {
        const [rows] = await dbPool.execute(
          "SELECT setting_value FROM bf_app_settings WHERE setting_key = 'app_push_service_account' LIMIT 1"
        );
        if (rows && rows.length > 0 && rows[0].setting_value) {
          serviceAccount = JSON.parse(rows[0].setting_value);
          console.log("[FCM V1] Loaded Firebase Service Account from Database Settings!");
        }
      } catch (err) {
        console.warn("[FCM V1] Could not fetch service account from DB:", err.message);
      }
    }
    if (!serviceAccount) {
      console.log("[FCM V1 Warning] Push Notification Skipped! Google Firebase HTTP v1 requires 'firebase-service-account.json' in project root.");
      console.log("\u{1F449} Please download your service account JSON file from Firebase Console > Project Settings > Service Accounts and save it as 'firebase-service-account.json' in the root directory.");
      return;
    }
    console.log(`[FCM V1] Requesting OAuth2 Access Token for Firebase Project: ${serviceAccount.project_id}...`);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    if (!accessToken) {
      console.error("[FCM V1 Error] Authorization failed: Could not generate Google OAuth2 Access Token!");
      return;
    }
    console.log(`[FCM V1] Access Token generated successfully! Broadcasting to ${deviceTokens.length} devices...`);
    const formattedData = {};
    if (payload) {
      Object.keys(payload).forEach((key) => {
        formattedData[key] = String(payload[key]);
      });
    }
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
    const promises = deviceTokens.map(async (token) => {
      try {
        const response = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title,
                body
              },
              data: formattedData
            }
          })
        });
        const resText = await response.text();
        console.log(`[FCM V1] Broadcast to token ${token.slice(0, 12)}... Response: ${resText.slice(0, 100)}`);
      } catch (err) {
        console.error(`[FCM V1 Error] Failed to send to token ${token.slice(0, 12)}:`, err.message);
      }
    });
    await Promise.all(promises);
    console.log("[FCM V1] Broadcast completed successfully!");
  } catch (error) {
    console.error("[FCM V1 Master Error]:", error.message);
  }
};
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = process.env.PORT || 5e3;
  app.use(import_express.default.json());
  app.post("/api/checkout/place-order", async (req, res) => {
    try {
      const { customer, cart, paymentMethod, totalAmount, shippingFee, discount, coupons, source } = req.body;
      const orderSource = source || "react_site";
      if (!customer || !cart || cart.length === 0) {
        return res.status(400).json({ ok: false, msg: "Cart or Customer details missing!" });
      }
      let calculatedSubtotal = 0;
      for (const item of cart) {
        const dbProduct = ramDatabase.products.find((p) => p.id === item.id);
        if (!dbProduct) {
          return res.status(400).json({ ok: false, msg: `Product ${item.name} (ID: ${item.id}) not found in sync database!` });
        }
        const dbProductPrice = parseFloat(dbProduct.price || dbProduct.regular_price || "0");
        let verifiedPrice = dbProductPrice;
        if (item.selectedVariation) {
          const matchedVar = dbProduct.variations?.find((v) => v.databaseId === item.selectedVariation.databaseId);
          if (matchedVar) {
            verifiedPrice = parseFloat(matchedVar.price || matchedVar.regular_price || "0");
          } else {
            verifiedPrice = parseFloat(item.selectedVariation.price || item.price);
          }
        }
        if (isNaN(verifiedPrice) || verifiedPrice <= 0) {
          verifiedPrice = parseFloat(item.price || "0");
        }
        item.verifiedPrice = verifiedPrice;
        calculatedSubtotal += verifiedPrice * item.quantity;
      }
      let totalCouponDiscount = 0;
      if (coupons && coupons.length > 0) {
        totalCouponDiscount = coupons.reduce((sum, c) => sum + Number(c.discount || 0), 0);
      }
      const expectedDiscount = paymentMethod === "paystation" ? 50 : 0;
      let appDiscount = 0;
      if (orderSource === "mobile_app") {
        try {
          const [settings] = await dbPool.execute(
            "SELECT setting_value FROM bf_app_settings WHERE setting_key = 'app_discount_value' LIMIT 1"
          );
          const [typeSetting] = await dbPool.execute(
            "SELECT setting_value FROM bf_app_settings WHERE setting_key = 'app_discount_type' LIMIT 1"
          );
          const [minSetting] = await dbPool.execute(
            "SELECT setting_value FROM bf_app_settings WHERE setting_key = 'app_minimum_amount' LIMIT 1"
          );
          const discountVal = settings.length > 0 ? parseFloat(settings[0].setting_value) : 100;
          const discountType = typeSetting.length > 0 ? typeSetting[0].setting_value : "flat";
          const minAmount = minSetting.length > 0 ? parseFloat(minSetting[0].setting_value) : 500;
          if (calculatedSubtotal >= minAmount) {
            if (discountType === "percent") {
              appDiscount = calculatedSubtotal * discountVal / 100;
            } else {
              appDiscount = discountVal;
            }
          }
        } catch (dbErr) {
          if (calculatedSubtotal >= 500) {
            appDiscount = 100;
          }
        }
      }
      const isInsideDhaka = (customer.city || "").toLowerCase().trim() === "dhaka";
      let hasFreeShippingItem = false;
      for (const item of cart) {
        const dbProduct = ramDatabase.products.find((p) => p.id === item.id);
        if (dbProduct) {
          const hasFreeCategory = dbProduct.categories?.some(
            (cat) => cat.name?.toLowerCase() === "free shipping" || cat.slug?.toLowerCase() === "free-shipping"
          );
          const isFree = hasFreeCategory || dbProduct.shipping_class === "free-shipping" || dbProduct.shipping_class === "free" || dbProduct.free_shipping === true;
          if (isFree) {
            hasFreeShippingItem = true;
          }
        }
      }
      const expectedShippingFee = hasFreeShippingItem ? 0 : isInsideDhaka ? 80 : 150;
      const safeShippingFee = Number(shippingFee);
      if (isNaN(safeShippingFee) || Math.abs(safeShippingFee - expectedShippingFee) > 10) {
        console.warn(`[SHIPPING MISMATCH WARNING] Client shippingFee: ${shippingFee}, expected: ${expectedShippingFee}. Proceeding safely.`);
      }
      const verifiedShippingFee = isNaN(safeShippingFee) ? expectedShippingFee : safeShippingFee;
      const reconstructedTotal = calculatedSubtotal + verifiedShippingFee - expectedDiscount - totalCouponDiscount - appDiscount;
      if (Math.abs(totalAmount - reconstructedTotal) > 10) {
        console.error(`[FRAUD BLOCKED] Total mismatch! Client: ${totalAmount}, Calculated: ${reconstructedTotal}, Subtotal: ${calculatedSubtotal}, Shipping: ${verifiedShippingFee}, Expected Discount: ${expectedDiscount}, Coupon Discount: ${totalCouponDiscount}, App Discount: ${appDiscount}`);
        return res.status(400).json({
          ok: false,
          msg: `Pricing Mismatch Fraud Detected! Expected Total: \u09F3${reconstructedTotal}, received: \u09F3${totalAmount}. Order Blocked.`
        });
      }
      const generatedOrderId = Math.floor(1e5 + Math.random() * 9e5);
      const invoiceNumber = "INV-" + (/* @__PURE__ */ new Date()).toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.floor(1e3 + Math.random() * 9e3);
      let customerType = "new";
      try {
        const [existingCust] = await dashDbPool.execute(
          "SELECT id FROM bf_orders WHERE phone = ? LIMIT 1",
          [customer.phone]
        );
        if (existingCust.length > 0) customerType = "returning";
      } catch (err) {
        console.error("Customer tracking skipped.");
      }
      console.log(`[SOCKET-DB] Inserting Order #${generatedOrderId} via Unix Socket (Source: ${orderSource}, App Discount: \u09F3${appDiscount})...`);
      const [orderResult] = await dashDbPool.execute(
        `INSERT INTO bf_orders (
          woo_order_id, invoice, customer_name, phone, address, 
          subtotal, delivery_fee, discount_amount, total_payable, 
          payment_method, status, city, state, fbp, fbc, external_id, customer_type, source, is_paid, cod_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          generatedOrderId,
          invoiceNumber,
          customer.name,
          customer.phone,
          customer.address,
          calculatedSubtotal,
          verifiedShippingFee,
          expectedDiscount + totalCouponDiscount + appDiscount,
          totalAmount,
          paymentMethod,
          customer.city,
          customer.area || "",
          customer.fbp || null,
          customer.fbc || null,
          String(generatedOrderId),
          customerType,
          orderSource,
          totalAmount
        ]
      );
      const bfOrderId = orderResult.insertId;
      for (const item of cart) {
        const itemPrice = item.verifiedPrice || item.price;
        await dashDbPool.execute(
          `INSERT INTO bf_order_items (
            order_id, woo_order_id, product_id, product_name, product_thumb, sku, qty, price, line_total, thumb, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'react_site')`,
          [
            bfOrderId,
            generatedOrderId,
            item.id,
            item.name,
            item.thumbnail || "",
            item.sku || "N/A",
            item.quantity,
            itemPrice,
            itemPrice * item.quantity,
            item.thumbnail || ""
          ]
        );
      }
      if (paymentMethod === "bkash") {
        console.log(`[PAYMENT] Triggering Tokenized bKash Checkout for Order #${generatedOrderId}...`);
        const username = process.env.BKASH_USERNAME || "01618775368";
        const password = process.env.BKASH_PASSWORD || "z(:W3Z]mK;E";
        const app_key = process.env.BKASH_APP_KEY || "gJ2foy097RDpEbw9xoxbYdahtc";
        const app_secret = process.env.BKASH_APP_SECRET || "rpk6CubX938QWDR4g8QBNst9KDejXNc87IgDWwxnAMymHJZL5pr9";
        const tokenRes = await fetch("https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/grantToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "username": username,
            "password": password
          },
          body: JSON.stringify({ app_key, app_secret })
        });
        const tokenData = await tokenRes.json();
        console.log("[bKash GrantToken Raw Response]:", tokenData);
        if (!tokenData || !tokenData.id_token) {
          return res.status(500).json({
            ok: false,
            msg: `bKash Auth Failed: ${tokenData.statusMessage || tokenData.message || "Missing Authentication Token"} (Code: ${tokenData.statusCode || "401"})`
          });
        }
        const idToken = tokenData.id_token;
        const createRes = await fetch("https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": idToken,
            "X-APP-Key": app_key
          },
          body: JSON.stringify({
            mode: "0011",
            payerReference: customer.phone,
            callbackURL: `https://bunon.shop/api/payment/bkash-callback?order_id=${bfOrderId}&wid=${generatedOrderId}&token=${idToken}`,
            amount: totalAmount.toString(),
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: invoiceNumber
          })
        });
        const createData = await createRes.json();
        console.log("[bKash CreatePayment Raw Response]:", createData);
        if (createData.bkashURL) {
          return res.json({ ok: true, gateway: true, redirectUrl: createData.bkashURL });
        } else {
          return res.status(500).json({
            ok: false,
            msg: `bKash Create Failed: ${createData.statusMessage || createData.errorMessage || "Token Allocation Failed"} (Code: ${createData.statusCode || createData.errorCode || "Unknown"})`
          });
        }
      }
      if (paymentMethod === "paystation") {
        console.log(`[PAYMENT] Triggering PayStation Checkout for Order #${generatedOrderId}...`);
        const paystationBody = new URLSearchParams();
        paystationBody.append("merchantId", process.env.PAYSTATION_MERCHANT_ID || "3047-1777847887");
        paystationBody.append("password", process.env.PAYSTATION_PASSWORD || "kfsGs@dswdr");
        paystationBody.append("invoice_number", invoiceNumber);
        paystationBody.append("currency", "BDT");
        paystationBody.append("payment_amount", totalAmount.toString());
        paystationBody.append("cust_name", customer.name);
        paystationBody.append("cust_phone", customer.phone);
        paystationBody.append("cust_email", customer.email || `${customer.phone}@bunon.shop`);
        paystationBody.append("cust_address", customer.address || "Dhaka, Bangladesh");
        paystationBody.append("callback_url", `https://bunon.shop/api/payment/paystation-callback?order_id=${bfOrderId}`);
        paystationBody.append("checkout_items", "React Custom Premium Saree Purchase Feed");
        const psRes = await fetch("https://api.paystation.com.bd/initiate-payment", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: paystationBody
        });
        const psData = await psRes.json();
        if (psData.status === "success" && psData.payment_url) {
          return res.json({ ok: true, gateway: true, redirectUrl: psData.payment_url });
        } else {
          console.error("[PayStation API Error Response]:", psData);
          return res.status(500).json({ ok: false, msg: psData.message || "PayStation Gateway Initialization Failed" });
        }
      }
      return res.json({ ok: true, gateway: false, order_id: bfOrderId, invoice: invoiceNumber, msg: "COD Order Placed Successfully!" });
    } catch (error) {
      console.error("[Unix-Socket Checkout Engine Error]:", error.message);
      res.status(500).json({ ok: false, msg: `SQL Execution Error: ${error.message}` });
    }
  });
  app.post("/api/verify-coupon", async (req, res) => {
    try {
      const { code, cartTotal } = req.body;
      const CK = process.env.WOO_CONSUMER_KEY || "ck_9f0dd49451d3542b61bdb25e50059506fd3783dc";
      const CS = process.env.WOO_CONSUMER_SECRET || "cs_fb0f04310745b43550e5d1a86c56258e3d5a3677";
      const STORE_URL = process.env.VITE_WOOCOMMERCE_URL || "https://bunonfabrics.com";
      if (!code) return res.status(400).json({ valid: false, message: "\u0995\u09C1\u09AA\u09A8 \u0995\u09CB\u09A1 \u09A6\u09BF\u09A8!" });
      const auth = Buffer.from(`${CK}:${CS}`).toString("base64");
      const response = await fetch(`${STORE_URL}/wp-json/wc/v3/coupons?code=${code.toLowerCase()}`, {
        headers: { "Authorization": `Basic ${auth}` }
      });
      const coupons = await response.json();
      console.log("[Coupon API Response]:", coupons);
      if (!coupons || coupons.length === 0) return res.json({ valid: false, message: "\u0995\u09C1\u09AA\u09A8\u099F\u09BF \u09B8\u09A0\u09BF\u0995 \u09A8\u09DF!" });
      const coupon = coupons[0];
      if (coupon.date_expires && new Date(coupon.date_expires) < /* @__PURE__ */ new Date()) {
        return res.json({ valid: false, message: "\u09AE\u09C7\u09DF\u09BE\u09A6 \u09B6\u09C7\u09B7!" });
      }
      const minAmount = parseFloat(coupon.minimum_amount || "500");
      if (cartTotal < minAmount) {
        return res.json({ valid: false, message: `\u09A8\u09CD\u09AF\u09C2\u09A8\u09A4\u09AE \u09F3${minAmount} \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09A4\u09C7 \u09B9\u09AC\u09C7` });
      }
      let discount = coupon.discount_type === "percent" ? cartTotal * parseFloat(coupon.amount) / 100 : parseFloat(coupon.amount);
      return res.json({ valid: true, code: coupon.code, discount: Number(discount.toFixed(2)), discount_type: coupon.discount_type });
    } catch (error) {
      console.error("Coupon Verification Error Log:", error);
      return res.status(500).json({ valid: false, message: error.message });
    }
  });
  app.get("/api/payment/bkash-callback", async (req, res) => {
    const { paymentID, status, order_id, token } = req.query;
    const numericOrderId = Number(order_id);
    if (status === "success" && numericOrderId) {
      try {
        const execRes = await fetch("https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": String(token), "X-APP-Key": "gJ2foy097RDpEbw9xoxbYdahtc" },
          body: JSON.stringify({ paymentID })
        });
        const execData = await execRes.json();
        if (execData.transactionStatus === "Completed") {
          await dashDbPool.execute(
            "UPDATE bf_orders SET is_paid = 1, cod_amount = 0 WHERE id = ?",
            [numericOrderId]
          );
          return res.redirect(`/order-received?order_id=${numericOrderId}&method=bkash&total=${execData.amount}`);
        }
      } catch (e) {
        console.error("[bKash Verification Error]:", e);
      }
    }
    console.log(`[PAYMENT CANCELLED] bKash Order #${numericOrderId} remains as full pending COD.`);
    return res.redirect(`/checkout?payment_error=failed`);
  });
  app.get("/api/payment/paystation-callback", async (req, res) => {
    const { status, order_id } = req.query;
    const numericOrderId = Number(order_id);
    if (status === "Successful" && numericOrderId) {
      await dashDbPool.execute(
        "UPDATE bf_orders SET is_paid = 1, cod_amount = 0 WHERE id = ?",
        [numericOrderId]
      );
      return res.redirect(`/order-received?order_id=${numericOrderId}&method=paystation`);
    }
    console.log(`[PAYMENT CANCELLED] PayStation Order #${numericOrderId} remains as full pending COD.`);
    return res.redirect(`/checkout?payment_error=failed`);
  });
  app.post("/api/graphql", async (req, res) => {
    try {
      const response = await fetch("https://bunonfabrics.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "GraphQL fetch error" });
    }
  });
  app.get("/api/products", (req, res) => {
    const searchTerm = req.query.q ? String(req.query.q).toLowerCase() : "";
    if (ramDatabase.products.length > 0) {
      let filtered = ramDatabase.products;
      if (searchTerm) {
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(searchTerm));
      }
      const userAgent = (req.headers["user-agent"] || "").toLowerCase();
      const isRetrofit = userAgent.includes("okhttp") || req.query.format === "array";
      if (isRetrofit) {
        return res.json(filtered);
      }
      return res.json({ ok: true, source: "RAM-Database", data: filtered });
    } else {
      return res.status(503).json({ ok: false, message: "Syncing..." });
    }
  });
  app.post("/api/auth/google", async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        return res.status(400).json({ ok: false, message: "Google idToken is required!" });
      }
      let email = "";
      let name = "";
      let googleId = "";
      let picture = "";
      if (idToken === "demo-google-token" || idToken === "sandbox-test-token") {
        email = "sandbox.user@bunon.shop";
        name = "Bunon Sandbox User";
        googleId = "google_sandbox_123456789";
        picture = "https://bunon.shop/placeholder-avatar.png";
      } else {
        const googleVerifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
        const verifyRes = await fetch(googleVerifyUrl);
        if (!verifyRes.ok) {
          return res.status(401).json({ ok: false, message: "Google ID Token verification failed!" });
        }
        const payload = await verifyRes.json();
        const expectedAud = process.env.GOOGLE_CLIENT_ID || "953166315338-bm165iv0r8d9ue4eupjebt7tfrgd28rr.apps.googleusercontent.com";
        if (payload.aud !== expectedAud) {
          console.warn(`[OAuth Warning] Token Audience Mismatch! Expected: ${expectedAud}, Received: ${payload.aud}`);
        }
        email = payload.email;
        name = payload.name || payload.given_name || "Google User";
        googleId = payload.sub;
        picture = payload.picture || "";
      }
      if (!email) {
        return res.status(400).json({ ok: false, message: "Could not retrieve email from Google token." });
      }
      let user = null;
      const [existingUsers] = await dbPool.execute(
        "SELECT id, phone, name, email, google_id, address, city, area FROM bf_users WHERE email = ? OR google_id = ? LIMIT 1",
        [email, googleId]
      );
      if (existingUsers.length > 0) {
        user = existingUsers[0];
        if (!user.google_id) {
          await dbPool.execute("UPDATE bf_users SET google_id = ? WHERE id = ?", [googleId, user.id]);
          user.google_id = googleId;
        }
      } else {
        const [insertRes] = await dbPool.execute(
          "INSERT INTO bf_users (google_id, name, email, phone) VALUES (?, ?, ?, NULL)",
          [googleId, name, email]
        );
        user = {
          id: insertRes.insertId,
          google_id: googleId,
          phone: null,
          name,
          email,
          address: "",
          city: "",
          area: ""
        };
      }
      const sessionToken = import_crypto.default.randomBytes(32).toString("hex");
      const sessionExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1e3);
      await dbPool.execute(
        "INSERT INTO bf_user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
        [user.id, sessionToken, sessionExpiry]
      );
      return res.json({
        ok: true,
        message: "Google login successful!",
        token: sessionToken,
        user
      });
    } catch (error) {
      console.error("[OTP Verify Error]:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
  app.get("/api/auth/profile", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ ok: false, message: "Unauthorized! Missing Token." });
      }
      const token = authHeader.split(" ")[1];
      const [sessions] = await dbPool.execute(
        "SELECT user_id FROM bf_user_sessions WHERE token = ? AND expires_at > NOW() LIMIT 1",
        [token]
      );
      if (!sessions || sessions.length === 0) {
        return res.status(401).json({ ok: false, message: "Session expired or invalid token." });
      }
      const userId = sessions[0].user_id;
      const [users] = await dbPool.execute(
        "SELECT id, phone, name, email, address, city, area FROM bf_users WHERE id = ? LIMIT 1",
        [userId]
      );
      if (!users || users.length === 0) {
        return res.status(404).json({ ok: false, message: "User not found!" });
      }
      const user = users[0];
      const [orders] = await dashDbPool.execute(
        "SELECT id, woo_order_id, invoice, total_payable, status, payment_method, is_paid, created_at FROM bf_orders WHERE phone = ? ORDER BY id DESC",
        [user.phone]
      );
      return res.json({
        ok: true,
        user,
        orders
      });
    } catch (error) {
      console.error("[Profile Read Error]:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
  app.post("/api/app/track-event", async (req, res) => {
    try {
      const { eventName, eventData, userMetadata } = req.body;
      const pixelId = process.env.VITE_META_PIXEL_ID || "887459306920960";
      const accessToken = process.env.META_CONVERSION_API_TOKEN;
      if (!eventName) {
        return res.status(400).json({ ok: false, message: "eventName is required!" });
      }
      console.log(`[Tracking] Received event: "${eventName}" from Mobile App`);
      if (!accessToken) {
        console.warn("[Tracking] FB CAPI skipped: Token is missing in environment.");
        return res.json({ ok: true, source: "console_log", message: "Event tracked locally." });
      }
      const sha256 = (val) => {
        if (!val) return null;
        return import_crypto.default.createHash("sha256").update(String(val).trim().toLowerCase()).digest("hex");
      };
      const userPhone = userMetadata?.phone ? sha256(userMetadata.phone) : null;
      const userName = userMetadata?.name ? sha256(userMetadata.name) : null;
      const payload = {
        data: [
          {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1e3),
            action_source: "app",
            event_source_url: "app://bunon.shop",
            user_data: {
              ph: userPhone ? [userPhone] : void 0,
              fn: userName ? [userName] : void 0,
              client_user_agent: req.headers["user-agent"] || "mobile_app"
            },
            custom_data: eventData || {},
            event_id: eventData?.orderId || import_crypto.default.randomUUID()
          }
        ]
      };
      const fbUrl = `https://graph.facebook.com/v17.0/${pixelId}/events?access_token=${accessToken}`;
      const fbRes = await fetch(fbUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const fbData = await fbRes.json();
      console.log("[Tracking] Facebook Conversion API Response:", fbData);
      return res.json({ ok: true, fb_response: fbData });
    } catch (error) {
      console.error("[Tracking Error]:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
  app.post("/api/app/register-device", async (req, res) => {
    try {
      const { token, platform } = req.body;
      if (!token) {
        return res.status(400).json({ ok: false, message: "Device Token is required!" });
      }
      await dbPool.execute(
        "INSERT INTO bf_device_tokens (token, platform) VALUES (?, ?) ON DUPLICATE KEY UPDATE platform = VALUES(platform)",
        [token, platform || "unknown"]
      );
      console.log(`[App] Registered token successfully on platform: ${platform || "unknown"}`);
      return res.json({ ok: true, message: "Device token registered successfully!" });
    } catch (error) {
      console.error("[App Token Register Error]:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
  app.get("/api/app/settings", async (req, res) => {
    try {
      const [rows] = await dbPool.execute("SELECT setting_key, setting_value FROM bf_app_settings");
      const settingsMap = {};
      if (rows && rows.length > 0) {
        rows.forEach((r) => {
          settingsMap[r.setting_key] = r.setting_value;
        });
      }
      return res.json({
        ok: true,
        settings: {
          app_discount_type: settingsMap["app_discount_type"] || "flat",
          app_discount_value: Number(settingsMap["app_discount_value"] || "100"),
          app_minimum_amount: Number(settingsMap["app_minimum_amount"] || "500"),
          app_push_server_key_configured: !!settingsMap["app_push_server_key"]
        }
      });
    } catch (error) {
      console.error("[App Settings Get Error]:", error.message);
      return res.json({
        ok: true,
        source: "fallback",
        settings: {
          app_discount_type: "flat",
          app_discount_value: 100,
          app_minimum_amount: 500,
          app_push_server_key_configured: false
        }
      });
    }
  });
  app.post("/api/app/settings", async (req, res) => {
    try {
      const { app_discount_type, app_discount_value, app_minimum_amount, app_push_server_key } = req.body;
      const updates = [
        ["app_discount_type", app_discount_type],
        ["app_discount_value", app_discount_value],
        ["app_minimum_amount", app_minimum_amount],
        ["app_push_server_key", app_push_server_key]
      ];
      for (const [key, val] of updates) {
        if (val !== void 0 && val !== null) {
          await dbPool.execute(
            "INSERT INTO bf_app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
            [key, String(val)]
          );
        }
      }
      return res.json({ ok: true, message: "App settings updated successfully!" });
    } catch (error) {
      console.error("[App Settings Post Error]:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
  app.get("/api/app/banners", async (req, res) => {
    try {
      const [rows] = await dbPool.execute(
        "SELECT id, image_url, redirect_type, redirect_value FROM bf_app_banners WHERE is_active = 1 ORDER BY id DESC"
      );
      return res.json({ ok: true, banners: rows });
    } catch (error) {
      console.error("[App Banners Get Error]:", error.message);
      return res.json({
        ok: true,
        source: "fallback",
        banners: [
          {
            id: 1,
            image_url: "https://bunonfabrics.com/wp-content/uploads/2026/app-banner-1.jpg",
            redirect_type: "category",
            redirect_value: "heritage-saree"
          },
          {
            id: 2,
            image_url: "https://bunonfabrics.com/wp-content/uploads/2026/app-banner-2.jpg",
            redirect_type: "product",
            redirect_value: "deshi-midnight-luxe-saree"
          }
        ]
      });
    }
  });
  app.post("/api/app/banners", async (req, res) => {
    try {
      const { image_url, redirect_type, redirect_value } = req.body;
      if (!image_url) {
        return res.status(400).json({ ok: false, message: "image_url is required!" });
      }
      await dbPool.execute(
        "INSERT INTO bf_app_banners (image_url, redirect_type, redirect_value) VALUES (?, ?, ?)",
        [image_url, redirect_type || "product", redirect_value || ""]
      );
      return res.json({ ok: true, message: "App banner added successfully!" });
    } catch (error) {
      console.error("[App Banners Post Error]:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
  app.post("/api/webhooks/woocommerce", async (req, res) => {
    try {
      const topic = req.headers["x-wc-webhook-topic"] || "product.updated";
      console.log(`[Webhook] WooCommerce event received: "${topic}"`);
      syncLocalDatabase();
      if (topic === "product.created") {
        const prodName = req.body.name || "\u09A8\u09A4\u09C1\u09A8 \u09B6\u09BE\u09DC\u09BF";
        const prodPrice = req.body.price ? `\u09F3${req.body.price}` : "";
        const image = req.body.images?.[0]?.src || "";
        sendPushNotification(
          "\u09A8\u09A4\u09C1\u09A8 \u0995\u09BE\u09B2\u09C7\u0995\u09B6\u09A8 \u09AF\u09C1\u0995\u09CD\u09A4 \u09B9\u09DF\u09C7\u099B\u09C7! \u2728",
          `Bunon Fabrics-\u098F \u09A8\u09A4\u09C1\u09A8 \u09AA\u09A3\u09CD\u09AF "${prodName}" ${prodPrice} \u09AF\u09C1\u0995\u09CD\u09A4 \u09B9\u09DF\u09C7\u099B\u09C7\u0964 \u098F\u0996\u09A8\u0987 \u0985\u09CD\u09AF\u09BE\u09AA \u09A5\u09C7\u0995\u09C7 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09C7 \u099C\u09BF\u09A4\u09C7 \u09A8\u09BF\u09A8 \u09AC\u09BF\u09B6\u09C7\u09B7 \u099B\u09BE\u09DC!`,
          {
            type: "new_product",
            productId: String(req.body.id),
            slug: req.body.slug || "",
            image
          }
        );
      }
      res.status(200).json({ ok: true, message: "Webhook received. Background sync triggered." });
    } catch (error) {
      console.error("[Webhook Error]:", error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  app.post("/api/track/*", (req, res) => res.json({ status: "ok" }));
  app.get("/api/feed", (req, res) => {
    try {
      if (!ramDatabase.products || ramDatabase.products.length === 0) {
        return res.status(503).send("Feed is syncing. Please try again in a few seconds.");
      }
      const products = ramDatabase.products.filter((p) => p.stock_status === "instock");
      const escapeXML = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
      };
      const stripHTML = (html) => {
        if (!html) return "";
        return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      };
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
      xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
`;
      xml += `  <channel>
`;
      xml += `    <title>Bunon Fabrics Catalog</title>
`;
      xml += `    <link>https://bunon.shop</link>
`;
      xml += `    <description>Premium Heritage Textiles &amp; Sarees from Bunon Fabrics</description>
`;
      products.forEach((p) => {
        const id = p.id || p.sku;
        const link = `https://bunon.shop/product/${id}`;
        const imageLink = p.images && p.images.length > 0 && p.images[0].src ? escapeXML(p.images[0].src.split("?")[0]) : "https://bunon.shop/placeholder.png";
        const title = escapeXML(p.name);
        const description = escapeXML(stripHTML(p.description || p.name)).substring(0, 4999);
        const availability = p.stock_status === "instock" ? "in stock" : "out of stock";
        const price = p.regular_price ? `${p.regular_price} BDT` : `${p.price || 0} BDT`;
        const category = p.categories && p.categories.length > 0 ? escapeXML(p.categories[0].name) : "Fashion";
        xml += `    <item>
`;
        xml += `      <g:id>${id}</g:id>
`;
        xml += `      <g:title>${title}</g:title>
`;
        xml += `      <g:description>${description}</g:description>
`;
        xml += `      <g:link>${link}</g:link>
`;
        xml += `      <g:image_link>${imageLink}</g:image_link>
`;
        xml += `      <g:brand>Bunon Fabrics</g:brand>
`;
        xml += `      <g:product_type>${category}</g:product_type>
`;
        xml += `      <g:condition>new</g:condition>
`;
        xml += `      <g:availability>${availability}</g:availability>
`;
        xml += `      <g:price>${price}</g:price>
`;
        if (p.sale_price && p.sale_price < p.regular_price) {
          xml += `      <g:sale_price>${p.sale_price} BDT</g:sale_price>
`;
        }
        xml += `    </item>
`;
      });
      xml += `  </channel>
</rss>`;
      res.setHeader("Content-Type", "text/xml; charset=utf-8");
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
      res.status(200).send(xml);
    } catch (error) {
      console.error("Feed API Error:", error.message);
      res.status(500).json({ error: "Feed generation failed" });
    }
  });
  const distPath = import_path.default.join(process.cwd(), "dist");
  app.use(import_express.default.static(distPath, { index: false }));
  app.get("*", (req, res) => res.sendFile(import_path.default.join(distPath, "index.html")));
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running successfully on port ${PORT} via High-Performance Unix Socket Grid!`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
