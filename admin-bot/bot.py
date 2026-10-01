import os, requests
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    ApplicationBuilder, CommandHandler,
    MessageHandler, filters, ContextTypes
)
script_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(script_dir, ".env"))

BOT_TOKEN = os.getenv("BOT_TOKEN")
raw_admin_ids = os.getenv("ADMIN_IDS") or ""
ADMIN_IDS = [int(x) for x in raw_admin_ids.split(",") if x.strip().isdigit()]
API_BASE = os.getenv("BUNON_API_BASE", "https://bunon.shop").rstrip("/")
API_KEY = os.getenv("BUNON_API_KEY", "")

HEADERS = {"Content-Type": "application/json"}
if API_KEY:
    HEADERS["Authorization"] = f"Bearer {API_KEY}"


def only_admin(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        if not user or user.id not in ADMIN_IDS:
            await update.message.reply_text("Unauthorized.")
            return
        return await func(update, context)
    return wrapper


def api_get(path: str, params=None):
    url = f"{API_BASE}{path}"
    r = requests.get(url, headers=HEADERS, params=params, timeout=20)
    return r.status_code, r.json() if r.headers.get("content-type","").startswith("application/json") else r.text


def api_post(path: str, payload: dict):
    url = f"{API_BASE}{path}"
    r = requests.post(url, headers=HEADERS, json=payload, timeout=20)
    return r.status_code, r.json() if r.headers.get("content-type","").startswith("application/json") else r.text


@only_admin
async def orders_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    status = context.args[0] if context.args else "pending"
    allowed = ["pending","processing","completed","cancelled","all"]
    qs = status if status in allowed else "pending"
    code, data = api_get("/api/admin/orders", {"status": qs} if qs != "all" else None)
    if code != 200 or not isinstance(data, dict) or not data.get("ok"):
        await update.message.reply_text(f"Failed: {data}")
        return
    orders = data.get("orders") or data.get("data") or []
    if not orders:
        await update.message.reply_text(f"No {qs} orders.")
        return
    lines = [f"Orders ({qs}):"]
    for o in orders[:20]:
        oid = o.get("id") or o.get("order_id")
        total = o.get("total_payable") or o.get("total") or 0
        phone = o.get("phone") or o.get("customer_phone") or ""
        lines.append(f"#{oid} | {phone} | {total}")
    await update.message.reply_text("\n".join(lines))


@only_admin
async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    code, data = api_get("/api/admin/stats/overview")
    if code != 200 or not isinstance(data, dict) or not data.get("ok"):
        await update.message.reply_text("Stats unavailable.")
        return
    s = data.get("stats", {})
    msg = (
        "Today:\n"
        f"Orders: {s.get('todayOrders',0)}\n"
        f"Revenue: {s.get('todayRevenue',0)}\n\n"
        "Overall:\n"
        f"Orders: {s.get('totalOrders',0)}\n"
        f"Revenue: {s.get('totalRevenue',0)}\n"
        f"AOV: {s.get('aov',0)}\n"
        f"Users: {s.get('totalUsers',0)}\n"
        f"Abandoned: {s.get('totalAbandoned',0)}"
    )
    await update.message.reply_text(msg)


@only_admin
async def low_stock_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    code, data = api_get("/api/admin/products")
    if code != 200 or not isinstance(data, dict) or not data.get("ok"):
        await update.message.reply_text("Product list unavailable.")
        return
    products = data.get("products") or data.get("data") or []
    low = [p for p in products if int(p.get("stock_quantity") or 999) < 10][:20]
    if not low:
        await update.message.reply_text("No low stock products.")
        return
    lines = ["Low stock (<10):"]
    for p in low:
        lines.append(f"#{p.get('id')} {p.get('name')} | qty {p.get('stock_quantity')}")
    await update.message.reply_text("\n".join(lines))


@only_admin
async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Commands:\n"
        "/orders [pending|processing|completed|cancelled|all]\n"
        "/stats\n"
        "/low_stock\n"
        "/help"
    )


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await update.message.reply_text(
        f"Your Telegram user ID is: {user.id}\n"
        "Give this ID to the admin to enable bot access."
    )


def main():
    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN missing in .env")
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CommandHandler("orders", orders_cmd))
    app.add_handler(CommandHandler("stats", stats_cmd))
    app.add_handler(CommandHandler("low_stock", low_stock_cmd))
    app.add_handler(CommandHandler("help", help_cmd))
    print("Admin bot started")
    app.run_polling()


if __name__ == "__main__":
    main()
