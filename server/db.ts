import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// 🚀 HIGH PERFORMANCE LOCAL UNIX SOCKET POOL
export const dbPool = mysql.createPool({
  host: process.env.DASH_DB_HOST || "127.0.0.1",
  port: Number(process.env.DASH_DB_PORT) || 3306,
  user: process.env.DASH_DB_USER || "bunonfabrics_dash_db",
  password: process.env.DASH_DB_PASSWORD?.replace(/\"/g, '') || "",
  database: process.env.DASH_DB_NAME || "bunonfabrics_dash_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 🚀 PRODUCT DATABASE POOL (Direct connection to bunon_shop_db)
export const productDbPool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "bunon_shop_db",
  password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.replace(/"/g, '') : "",
  database: process.env.DB_NAME || "bunon_shop_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
