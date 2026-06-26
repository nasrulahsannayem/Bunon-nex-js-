import express from "express";
import { dbPool, productDbPool } from "../db";
import { ecomosProductMap } from "../store";
import { sendToEcomOS } from "../services/ecomos";
import { randomInt } from "crypto"; // secure ID generator

const router = express.Router();

router.post("/checkout/place-order", async (req, res) => {
  try {
    const { customer, cart, paymentMethod, totalAmount, shippingFee, discount, coupons } = req.body;

    if (!customer || !cart || cart.length === 0) {
      return res.status(400).json({ ok: false, msg: "Cart or Customer details missing!" });
    }

    const generatedOrderId = randomInt(100000, 1000000); // 6‑digit safe ID
    const invoiceNumber = "INV-" + new Date().toISOString().slice(2,10).replace(/-/g,'') + "-" + Math.floor(1000 + Math.random() * 9000);
    
    let totalCouponDiscount = 0;
    if (coupons && coupons.length > 0) {
       totalCouponDiscount = coupons.reduce((sum: number, c: any) => sum + Number(c.discount || 0), 0);
    }
    
    const subtotal = totalAmount - shippingFee + discount + totalCouponDiscount;

    let customerType = 'new';
    try {
      const [existingCust]: any = await dbPool.execute(
        "SELECT id FROM bf_orders WHERE phone = ? LIMIT 1",
        [customer.phone]
      );
      if (existingCust.length > 0) customerType = 'returning';
    } catch (err) {
      console.error("Customer tracking skipped.");
    }

    // ❌ EcomOS ডেটা তৈরি এবং ভ্যালিডেশন আপাতত বন্ধ করা হলো
    /*
    const ecomosItems = cart.map((item: any) => {
        const ecomosId = ecomosProductMap.get(item.sku);
        
        if (!ecomosId) {
            throw new Error(`SKU '${item.sku}' EcomOS-এ খুঁজে পাওয়া যায়নি! দয়া করে প্রোডাক্টের SKU চেক করুন।`);
        }

        return {
            product_id: ecomosId,
            price: item.price,
            quantity: item.quantity
        };
    });

    const ecomosOrderData = {
        customer_name: customer.name,
        phone: customer.phone,
        address: customer.address,
        district: customer.city || "Dhaka",
        delivery_charge: shippingFee,
        discount: discount + totalCouponDiscount,
        items: ecomosItems
    };
    */

    console.log(`[SOCKET-DB] Inserting Order #${generatedOrderId} via Unix Socket...`);
    const [orderResult]: any = await dbPool.execute(
      `INSERT INTO bf_orders (
        woo_order_id, invoice, customer_name, phone, address, 
        subtotal, delivery_fee, discount_amount, total_payable, 
        payment_method, status, city, state, fbp, fbc, external_id, customer_type, source, is_paid, cod_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 'react_site', 0, ?)`,
      [
        generatedOrderId ?? null, 
        invoiceNumber ?? null, 
        customer.name ?? null, 
        customer.phone ?? null, 
        customer.address ?? null,
        subtotal ?? 0, 
        shippingFee ?? 0, 
        (Number(discount || 0) + totalCouponDiscount), 
        totalAmount ?? 0, 
        paymentMethod ?? 'cod',
        customer.city ?? null, 
        customer.area ?? "", 
        customer.fbp ?? null, 
        customer.fbc ?? null,
        String(generatedOrderId), 
        customerType ?? 'new', 
        totalAmount ?? 0
      ]
    );

    const bfOrderId = orderResult.insertId;

    for (const item of cart) {
      await dbPool.execute(
        `INSERT INTO bf_order_items (
          order_id, woo_order_id, product_id, product_name, product_thumb, sku, qty, price, line_total, thumb, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'react_site')`,
        [
          bfOrderId ?? null,
          generatedOrderId ?? null,
          item.id ?? null,
          item.name ?? null,
          item.thumbnail ?? "",
          item.sku ?? "N/A",
          item.quantity ?? 1,
          item.price ?? 0,
          (Number(item.price || 0) * Number(item.quantity || 1)),
          item.thumbnail ?? ""
        ]
      );
    }

    // 📩 Trigger order confirmation email sending if email exists
    const { fixEmailTypos, isRoleBasedEmail } = await import('../utils/emailValidator');
    let rawEmail = customer.email || '';
    let cleanEmail = fixEmailTypos(rawEmail);
    const isValidMarketingEmail = cleanEmail.includes("@") && !cleanEmail.endsWith("@bunon.shop") && !isRoleBasedEmail(cleanEmail);

    if (isValidMarketingEmail) {
      // 👤 Auto-Register User if not exists
      let userCreated = false;
      let passwordSent = "";
      if (customer.phone) {
        const cleanPhone = customer.phone.replace(/\D/g, '');
        if (cleanPhone.length >= 11) {
          try {
            const [existingUsers]: any = await productDbPool.execute(`SELECT id FROM bunon_users WHERE phone = ? LIMIT 1`, [cleanPhone]);
            if (!existingUsers || existingUsers.length === 0) {
              // Auto-create
              const bcrypt = await import('bcryptjs');
              const hashedPwd = await bcrypt.hash(cleanPhone, 10);
              await productDbPool.execute(
                `INSERT INTO bunon_users (phone, password_hash, name, email, default_address, default_city) VALUES (?, ?, ?, ?, ?, ?)`,
                [cleanPhone, hashedPwd, customer.name || null, cleanEmail, customer.address || null, customer.city || null]
              );
              userCreated = true;
              passwordSent = cleanPhone;
              console.log(`[AUTH] Auto-registered user with phone: ${cleanPhone}`);
            }
          } catch (e: any) {
            console.error('[AUTH] Failed to auto-register user:', e.message);
          }
        }
      }

      // 📩 Trigger order confirmation email sending if email exists
      if (cleanEmail) {
        const { sendOrderConfirmationEmail } = await import("../services/email");
        sendOrderConfirmationEmail(cleanEmail, {
          orderId: generatedOrderId,
          firstName: customer.name,
          phone: customer.phone,
          address1: customer.address,
          district: customer.city || "Dhaka",
          subtotal: subtotal,
          shippingCost: shippingFee,
          discount: (Number(discount || 0) + totalCouponDiscount),
          total: totalAmount,
          paymentMethod: paymentMethod,
          items: cart,
          // Include auto-generated credentials if applicable
          autoPassword: userCreated ? passwordSent : undefined
        }).catch(err => console.error("Email trigger failed:", err));
      }
    }
      // 🚀 FIX #8: Use productDbPool (wc_cart_recovery_queue lives in product DB, not dashboard DB)
      await productDbPool.execute(`
        UPDATE wc_cart_recovery_queue 
        SET status = 'converted' 
        WHERE email = ? OR phone = ?
      `, [customer.email, customer.phone]);

      // Remove incomplete order record by forwarding to dash
      try {
        const cleanPhone = (customer.phone || '').replace(/\D/g, '');
        if (cleanPhone) {
          fetch(`https://dash.bunonfabrics.com/api/orders/remove_incomplete.php?phone=${cleanPhone}`)
            .catch(err => console.error('[PAYMENT Forwarding] Failed to remove incomplete order on dash:', err));
          console.log(`[PAYMENT] Triggered remove incomplete order for phone: ${cleanPhone}`);
        }
      } catch (err: any) {
        console.error('[PAYMENT] Failed to trigger remove incomplete order:', err.message);
      }

    // ❌ ব্যাকগ্রাউন্ডে অর্ডারটি EcomOS-এ পাঠানো আপাতত বন্ধ করা হলো
    // sendToEcomOS(ecomosOrderData); 

    
    // 💳 মেথড ১: বিকাশ গেটওয়ে ইনিশিয়ালাইজেশন
    if (paymentMethod === "bkash") {
      console.log(`[PAYMENT] Triggering Tokenized bKash Checkout for Order #${generatedOrderId}...`);
      
      const username   = process.env.BKASH_USERNAME ? process.env.BKASH_USERNAME.replace(/"/g, '') : "";
      const password   = process.env.BKASH_PASSWORD ? process.env.BKASH_PASSWORD.replace(/"/g, '') : "";
      const app_key    = process.env.BKASH_APP_KEY ? process.env.BKASH_APP_KEY.replace(/"/g, '') : "";
      const app_secret = process.env.BKASH_APP_SECRET ? process.env.BKASH_APP_SECRET.replace(/"/g, '') : "";

      const BKASH_BASE_URL = "https://tokenized.pay.bka.sh/v1.2.0-beta";

      const tokenRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "username": username,
          "password": password
        },
        body: JSON.stringify({ app_key, app_secret })
      });
      
      const tokenData: any = await tokenRes.json();
      
      if (!tokenData || !tokenData.id_token) {
        return res.status(500).json({ 
          ok: false, 
          msg: `bKash Auth Failed: ${tokenData.statusMessage || tokenData.message || 'Missing Authentication Token'}` 
        });
      }

      const idToken = tokenData.id_token;

      const createRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/create`, {
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
      
      const createData: any = await createRes.json();
      
      if (createData.bkashURL) {
        return res.json({ ok: true, gateway: true, redirectUrl: createData.bkashURL });
      } else {
        return res.status(500).json({ 
          ok: false, 
          msg: `bKash Create Failed: ${createData.statusMessage || createData.errorMessage}` 
        });
      }
    }

    // 💳 মেথড ২: পেস্টেশন গেটওয়ে ইনিশিয়ালাইজেশন
    if (paymentMethod === "paystation") {
      console.log(`[PAYMENT] Triggering PayStation Checkout for Order #${generatedOrderId}...`);
      
      const paystationBody = new URLSearchParams();
      paystationBody.append("merchantId", process.env.PAYSTATION_MERCHANT_ID || "");
      paystationBody.append("password", process.env.PAYSTATION_PASSWORD || "");
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

    // 📦 মেথড ৩: ক্যাশ অন ডেলিভারি (COD)
    return res.json({ ok: true, gateway: false, order_id: bfOrderId, invoice: invoiceNumber, msg: "COD Order Placed Successfully!" });

  } catch (error: any) {
    console.error("[Unix-Socket Checkout Engine Error]:", error.message);
    res.status(500).json({ ok: false, msg: `Checkout Error: ${error.message}` });
  }
});

router.get("/payment/bkash-callback", async (req, res) => {
  const { paymentID, status, order_id, token } = req.query;
  const numericOrderId = Number(order_id);

  if (status === "success" && numericOrderId) {
    try {
      const app_key = process.env.BKASH_APP_KEY ? process.env.BKASH_APP_KEY.replace(/"/g, '') : "";
      const execRes = await fetch("https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": String(token), "X-APP-Key": app_key },
        body: JSON.stringify({ paymentID })
      });
      const execData = await execRes.json();
      if (execData.transactionStatus === "Completed") {
        await dbPool.execute(
          `UPDATE bf_orders 
           SET is_paid = 1, cod_amount = 0, due_amount = 0, total_payable = 0, discount_amount = (subtotal + delivery_fee) 
           WHERE id = ?`, 
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

router.get("/payment/paystation-callback", async (req, res) => {
  const { status, order_id } = req.query;
  const numericOrderId = Number(order_id);

  if (status === "Successful" && numericOrderId) {
    await dbPool.execute(
      `UPDATE bf_orders 
       SET is_paid = 1, cod_amount = 0, due_amount = 0, total_payable = 0, discount_amount = (subtotal + delivery_fee) 
       WHERE id = ?`, 
      [numericOrderId]
    );
    return res.redirect(`/order-received?order_id=${numericOrderId}&method=paystation`);
  }

  console.log(`[PAYMENT CANCELLED] PayStation Order #${numericOrderId} remains as full pending COD.`);
  return res.redirect(`/checkout?payment_error=failed`);
});

export default router;
