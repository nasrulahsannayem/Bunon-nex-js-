# ০৮ — ডিপ্লয়মেন্ট ও বিল্ড

---

## 🚀 দ্রুত ডিপ্লয়

```bash
ssh -i /opt/data/.ssh/id_host_root -p 45262 root@15.235.162.246
cd /www/wwwroot/bunon.shop

rm -rf dist && mkdir -p dist && chmod 777 dist
npm run build
pm2 flush bunon-site
pm2 restart bunon-site --update-env

# যাচাই
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:5001/api/products
```

---

## বিল্ড

```bash
npm run build
# = vite build  (frontend → dist/)
# + esbuild server.ts --bundle --platform=node --packages=external
#                 --format=cjs --outfile=dist/server.cjs
```

**সময়:** ~৩৫ সেকেন্ড

### ⚠️ তিনটি আর্টিফ্যাক্টই দরকার
```
dist/index.html      ← না হলে সাইট ফাঁকা
dist/assets/*        ← না হলে React লোড হবে না
dist/server.cjs      ← না হলে PM2 চলবে না
```

```bash
ls dist/    # বিল্ডের পরে সবসময় যাচাই করুন
```

> 🔴 **সবচেয়ে বিপজ্জনক ভুল:** শুধু ব্যাকএন্ড রিবিল্ড করা। তখন `server.cjs` থাকে কিন্তু `index.html` থাকে না → **সাইট HTTP 200 দেখায় কিন্তু ব্রাউজারে ফাঁকা পর্দা**। একমাত্র সূচক: error log-এ `ENOENT .../dist/index.html`।

> ℹ️ বিল্ডের সময় `ENOENT dist/index.html` দেখা **স্বাভাবিক** — Vite আগে `dist/` খালি করে। বিল্ড শেষে লগ ফ্লাশ করে আবার চেক করুন।

---

## PM2

### কনফিগ
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'bunon-site',
    script: './dist/server.cjs',
    cwd: '/www/wwwroot/bunon.shop',
    interpreter: '/www/server/nvm/versions/node/v24.18.0/bin/node',
    node_args: ['--max-old-space-size=512'],
    env: { NODE_ENV: 'production', PORT: 5001 },
    env_production: { NODE_ENV: 'production', PORT: 5001 }
  }]
}
```

> ⚠️ **`ecosystem.config.cjs` হতে হবে** — `.js` হলে `type: module` থাকায় `ReferenceError: module is not defined` ছুঁড়ে।

> ⚠️ **`--env production` ব্যবহার করলে `env_production` ব্লক লাগবে** — শুধু `env` থাকলে var apply হবে না।

### কমান্ড
```bash
pm2 list                              # সব প্রসেস
pm2 describe bunon-site                # বিস্তারিত
pm2 logs bunon-site --lines 50         # লগ
pm2 flush bunon-site                   # লগ খালি (ফিক্সের পরে)
pm2 restart bunon-site --update-env    # env সহ রিস্টার্ট
pm2 save                               # রিবুটে অটো-স্টার্ট
```

### 🔴 সবচেয়ে বড় পিটফল
```bash
pm2 start server.ts        # ❌❌❌ কখনো নয়
# → Cannot find module 'server/store'
# → সাইট 502
```

**সবসময়:**
```bash
pm2 start dist/server.cjs --name bunon-site --cwd /www/wwwroot/bunon.shop
pm2 save
```

যাচাই: `pm2 describe bunon-site | grep 'script path'` → **`dist/server.cjs`** দেখাতে হবে, `server.ts` নয়।

> ℹ️ **pm2 root-এর।** `hermesops` ইউজারে `pm2 list` খালি দেখায় — root দিয়ে চালাতে হবে।

---

## nginx

### লাইভ ভন্ডার
```
/etc/nginx/conf.d/bunon.shop.conf        ← ✅ এটাই সঠিক
```
> 🔴 aaPanel প্যানেলের `/www/server/panel/vhost/nginx/bunon.shop.conf` **মৃত ফাইল** — এখানে এডিট করলে কিছুই হবে না, `nginx -t` ও পাস করবে।

### দুটি nginx master চলে
```
/usr/sbin/nginx                          ← ✅ bunon.shop সার্ভ করে
/www/server/panel/webserver              ← ❌ কখনো reload করবেন না
```

### vhost সারাংশ
```nginx
server_name bunon.shop;
ssl_certificate /www/server/panel/vhost/cert/bunon.shop/fullchain.pem;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

location ^~ /image/   { alias /www/wwwroot/bunon.shop/public/image/;   max-age=2592000; }
location ^~ /uploads/ { alias /www/wwwroot/bunon.shop/public/uploads/; max-age=2592000; }

location / {
  proxy_pass http://127.0.0.1:5001;
  proxy_hide_header Cache-Control;
  # assets → 1yr immutable
  # HTML/API → no-store
  # .map/.cjs/.env/.sql/.bak/.pem/.key → 404
}
```

### nginx সম্পাদনা
```bash
nginx -t                              # আগে যাচাই
systemctl reload nginx                 # তারপর reload
curl --resolve bunon.shop:443:127.0.0.1 https://bunon.shop/   # লাইভ যাচাই
```

---

## SSL

```bash
openssl s_client -connect 127.0.0.1:443 -servername bunon.shop \
  | openssl x509 -noout -subject        # CN = bunon.shop হতে হবে
```

> 🔴 **Cloudflare 526 = CN mismatch।** origin cert-এর CN যেন SNI hostname-এর সাথে মিলে।

**সার্টিফিকেট:**
```
/www/server/panel/vhost/cert/bunon.shop/fullchain.pem
/www/server/panel/vhost/cert/bunon.shop/privkey.pem
```

---

## বান্ডেল চাংকিং

`vite.config.ts`-এ `manualChunks` — ৫টি named chunk:

| Chunk | সাইজ (raw) | gzipped |
|---|---|---|
| `vendor-react` | 233 KB | 74 KB |
| `vendor-charts` | 431 KB | 123 KB |
| `vendor-motion` | 129 KB | 42 KB |
| `vendor-icons` | 54 KB | 12 KB |
| `vendor-utils` | 46 KB | 18 KB |
| `index` | 88 KB | 24 KB |

**তিনটি অপরিবর্তনীয় নিয়ম:**
1. শুধু `node_modules` chunk হয় — অ্যাপ কোড Rollup-এর কাছে
2. `react`/`react-dom`/`scheduler`/`react-router` **একই chunk** — আলাদা করলে `Cannot access X before initialization` সাদা পর্দা, যা curl-এ ধরা পড়ে না
3. অজানা প্যাকেজ → `undefined` ফেরত (Rollup-কে সিদ্ধান্ত নিতে দিন)

> ℹ️ ভাঙা chunk graph-এও HTTP 200 আসে (SPA shell) — যাচাই শুধু curl দিয়ে হবে না।

---

## 🚀 রিবুট টেকারি

```bash
pm2 save                      # প্রসেস সেভ
pm2 startup                   # systemd ইউনিট তৈরি
systemctl enable nginx
# প্রতিটি অ্যাপ → pm2 describe → autorestart enabled
```

> ⚠️ `pm2 save` না করলে রিবুটের পর সাইট 502 দেয় (আগে এমনই হয়েছিল)।

---

## ব্যাকআপ ও রোলব্যাক

```bash
# বিল্ড আগে
cp -r dist dist.bak_$(date +%Y%m%d_%H%M%S)

# রোলব্যাক
rm -rf dist && cp -r dist.bak_20261003_061605 dist
pm2 restart bunon-site --update-env
```

কোড ব্যাকআপ:
```bash
cp src/pages/admin/AdminLogin.tsx src/pages/admin/AdminLogin.tsx.bak_<timestamp>
```

---

*পরবর্তী: `09-operations.md` →*
