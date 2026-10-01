#!/usr/bin/env python3
"""Rider-note -> Telegram forwarder (Bunon planner). FINAL format + buttons."""
import html, os, time, requests

E = lambda s: html.escape(str(s or ""))

BASE = "https://dash.bunonfabrics.com/api/notifications_api.php"
BOT = os.environ.get("BOT_TOKEN", "")
CHAT = os.environ.get("CHAT_ID", "")
INTERVAL = int(os.environ.get("POLL_SEC", "10"))

SYSTEM_PATTERNS = [
    "consignment has been received at", "consignment sent to", "dispatch id:",
    "consignment status has been updated", "parcel status:", "assigned to rider",
    "consignment return status", "consignment created by sender",
    "order status updated to", "internal status set to",
    "fulfillment warehouse", "shorting center", "sorting center",
    "has been received at",
]

def is_manual(msg: str) -> bool:
    m = (msg or "").lower()
    return bool(m) and not any(p in m for p in SYSTEM_PATTERNS)

def send(text: str, kb=None):
    payload = {"chat_id": CHAT, "text": text, "parse_mode": "HTML",
               "disable_web_page_preview": True}
    if kb:
        payload["reply_markup"] = kb
    r = requests.post(f"https://api.telegram.org/bot{BOT}/sendMessage",
                      json=payload, timeout=15)
    r.raise_for_status()
    return r.json()

def main():
    assert BOT and CHAT, "BOT_TOKEN and CHAT_ID env required"
    last_id = 0
    try:
        d = requests.get(BASE, params={"action": "list"}, timeout=15).json()
        if d.get("status") == "success":
            last_id = int(d.get("latest_id") or 0)
    except Exception as e:
        print("init err:", e)
    print(f"watching from id={last_id}")
    while True:
        try:
            d = requests.get(BASE, params={"action": "list", "since_id": last_id}, timeout=15).json()
            if d.get("status") == "success":
                last_id = int(d.get("latest_id") or last_id)
                for n in d.get("items", []):
                    if not is_manual(n.get("message", "")):
                        continue
                    inv = n.get("invoice", "")
                    phone = n.get("phone", "")
                    msg_e = E(n.get("message", ""))
                    cname = E(n.get("customer_name", ""))
                    cid = E(n.get("consignment_id", ""))
                    txt = (
                        f"🤖 <b>NUPUR AI AGENT</b>\n"
                        f"Bunon · Rider Note\n"
                        f"{E(n.get('created_at', ''))}\n"
                        f"🚚 <b>Rider Note</b> — <code>{cid}</code>\n"
                        f"{msg_e}\n"
                        f"\n"
                        f"🧾 <b>Order</b>\n"
                        f"Invoice: <code>{E(inv)}</code> · Order: <code>{E(n.get('order_id', ''))}</code>\n"
                        f"COD: ৳{E(n.get('actual_received_amount', ''))}\n"
                        f"\n"
                        f"👤 <b>Customer</b>\n"
                        f"{cname}\n"
                        f"📞 <code>{E(phone)}</code>\n"
                        f"💬 <a href=\"https://t.me/leadbunonbot?start=INV{E(inv)}\">Order chat</a>\n"
                        f"\n"
                        f"Overall: 🟡 Attention Required"
                    )
                    kb = {"inline_keyboard": [
                        [{"text": "📍 ফুল জার্নি দেখো", "url": f"https://dash.bunonfabrics.com/api/orders/journey_view.php?invoice={inv}", "style": "primary"}],
                        [{"text": "📋 ফোন কপি", "copy_text": {"text": phone}, "style": "success"}],
                    ]}
                    send(txt, kb)
                    print("sent:", n.get("id"), inv)
        except Exception as e:
            print("poll err:", e)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
