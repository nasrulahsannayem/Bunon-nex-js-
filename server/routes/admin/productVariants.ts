import express from 'express';
import { productDbPool } from '../../db';
import { invalidateProductsCache } from '../../services/redisClient';

const router = express.Router();

/* Product variants.
 *
 * bunon_product_variants holds one row per option (e.g. "Red" or "M").
 * bunon_variant_groups records which types a product actually uses, so the UI
 * knows to render a Colour row, a Size row, and nothing else - and so a
 * product with no variants stays a plain product instead of showing an empty
 * picker.
 *
 * Every handler validates the parent product exists, otherwise a typo in the
 * admin UI would create rows pointing at nothing.
 */
const TYPES = ['color', 'size', 'style', 'length'];

async function assertProduct(id: number) {
  const [rows]: any = await productDbPool.execute(
    'SELECT id FROM bunon_products WHERE id = ? LIMIT 1', [id]
  );
  return rows.length > 0;
}

// GET /api/admin/products/:id/variants
router.get('/:id/variants', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!(await assertProduct(id))) return res.status(404).json({ ok: false, msg: 'Product not found' });

    const [groups]: any = await productDbPool.execute(
      'SELECT id, variant_type, label FROM bunon_variant_groups WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
      [id]
    );
    const [variants]: any = await productDbPool.execute(
      'SELECT id, variant_type, label, option_value, sku, price, regular_price, sale_price, ' +
      'stock_quantity, stock_status, image, swatch, sort_order, status, updated_at ' +
      'FROM bunon_product_variants WHERE product_id = ? ORDER BY variant_type ASC, sort_order ASC, id ASC',
      [id]
    );
    res.json({ ok: true, groups, variants });
  } catch (e: any) {
    console.error('[Admin Variants] List error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/products/:id/variants — add one option to a group.
router.post('/:id/variants', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!(await assertProduct(id))) return res.status(404).json({ ok: false, msg: 'Product not found' });
    const b = req.body || {};
    const type = TYPES.includes(b.variant_type) ? b.variant_type : 'color';
    const label = String(b.label || '').trim();
    const value = String(b.option_value || b.label || '').trim();
    if (!value) return res.status(400).json({ ok: false, msg: 'Option value required' });

    // delivery_fee validation
    const df = (v: any) => (v === "" || v == null ? null : Number(v));
    const delivery_fee = df(b.delivery_fee);
    if (delivery_fee !== null && isNaN(delivery_fee))
      return res.status(400).json({ ok: false, msg: "delivery_fee must be numeric" });

    // price must be numeric or null: a text value here is the same class of bug
    // that broke the product PUT when a slug landed in a decimal column.
    const num = (v: any) => (v === '' || v == null ? null : Number(v));
    /* Stock is OPTIONAL on an option. A blank field means "unlimited",
     * not zero -- the old `Number(b.stock_quantity) || 0` collapsed blank
     * into 0 and rendered every new option as sold-out. */
    const stockOf = (v: any): number | null => {
      if (v === '' || v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const statusFor = (q: number | null): string =>
      q === null || q > 0 ? 'instock' : 'outofstock';
    const p = num(b.price), rp = num(b.regular_price), sp = num(b.sale_price);
    for (const [k, v] of [['price', p], ['regular_price', rp], ['sale_price', sp]] as const) {
      if (v !== null && isNaN(v)) return res.status(400).json({ ok: false, msg: k + ' must be numeric' });
    }
    if (sp !== null && sp !== 0 && p !== null && sp >= p) {
      return res.status(400).json({ ok: false, msg: 'Sale price must be lower than price' });
    }
    const qty = stockOf(b.stock_quantity);

    // Register the group on first use so the UI renders the right picker.
    await productDbPool.execute(
      'INSERT IGNORE INTO bunon_variant_groups (product_id, variant_type, label, sort_order) VALUES (?, ?, ?, ?)',
      [id, type, label || value, TYPES.indexOf(type)]
    );

    await productDbPool.execute(
      'INSERT INTO bunon_product_variants ' +
      '(product_id, variant_type, label, option_value, sku, price, regular_price, sale_price, ' +
      'stock_quantity, stock_status, image, swatch, sort_order, status, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())',
      [id, type, label || value, value, b.sku || null, p, rp, sp,
       qty, b.stock_status || statusFor(qty),
       b.image || null, b.swatch || null, Number(b.sort_order) || 0]
    );

    // Keep the parent stock consistent: the product cannot be in stock if every
    // option is out of stock.
    await resyncParentStock(id);
    await invalidateProductsCache();

    const [rows]: any = await productDbPool.execute('SELECT LAST_INSERT_ID() id');
    res.json({ ok: true, id: (rows as any[])[0].id });
  } catch (e: any) {
    if ((e as any).code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, msg: 'That option already exists for this product' });
    }
    console.error('[Admin Variants] Create error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// PUT /api/admin/products/:id/variants/:vid
router.put('/:id/variants/:vid', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const vid = Number(req.params.vid);
    const b = req.body || {};

    const [own]: any = await productDbPool.execute(
      'SELECT id FROM bunon_product_variants WHERE id = ? AND product_id = ? LIMIT 1', [vid, id]
    );
    if (!own.length) return res.status(404).json({ ok: false, msg: 'Variant not found' });

    const num = (v: any) => (v === '' || v == null ? null : Number(v));
    const stockOf = (v: any): number | null => {
      if (v === '' || v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const statusFor = (qty: number | null): string =>
      qty === null || qty > 0 ? 'instock' : 'outofstock';
    const sets: string[] = [];
    const params: any[] = [];
    const put = (col: string, v: any) => { sets.push(col + ' = ?'); params.push(v); };

    if ('option_value' in b && String(b.option_value).trim()) put('option_value', String(b.option_value).trim());
    if ('label' in b && String(b.label).trim()) put('label', String(b.label).trim());
    if ('sku' in b) put('sku', b.sku ? String(b.sku).trim() : null);
    if ('price' in b) { const v = num(b.price); if (v !== null && isNaN(v)) return res.status(400).json({ ok: false, msg: 'price must be numeric' }); put('price', v); }
    if ('regular_price' in b) { const v = num(b.regular_price); if (v !== null && isNaN(v)) return res.status(400).json({ ok: false, msg: 'regular_price must be numeric' }); put('regular_price', v); }
    if ('sale_price' in b) { const v = num(b.sale_price); if (v !== null && isNaN(v)) return res.status(400).json({ ok: false, msg: 'sale_price must be numeric' }); put('sale_price', v); }
    if ('stock_quantity' in b) {
      const q = stockOf(b.stock_quantity);
      put('stock_quantity', q);
      /* Derive status only when the caller did not pin one, so a
       * deliberate "sold out" can still override the quantity. */
      if (!('stock_status' in b) || !b.stock_status) put('stock_status', statusFor(q));
    }
    if ('stock_status' in b && b.stock_status) put('stock_status', b.stock_status);
    if ('image' in b) put('image', b.image || null);
    if ('swatch' in b) put('swatch', b.swatch || null);
    if ('sort_order' in b) put('sort_order', Number(b.sort_order) || 0);
    if ('status' in b) put('status', Number(b.status) ? 1 : 0);

    if (!sets.length) return res.json({ ok: true, noop: true });
    put('updated_at', null);
    sets[sets.length - 1] = 'updated_at = NOW()';
    params.push(vid);

    await productDbPool.execute(
      'UPDATE bunon_product_variants SET ' + sets.join(', ') + ' WHERE id = ?', params
    );
    await resyncParentStock(id);
    await invalidateProductsCache();
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Variants] Update error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// DELETE /api/admin/products/:id/variants/:vid — removing the last option of a
// type removes the group too, so the picker does not linger with nothing in it.
router.delete('/:id/variants/:vid', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const vid = Number(req.params.vid);
    const [own]: any = await productDbPool.execute(
      'SELECT variant_type FROM bunon_product_variants WHERE id = ? AND product_id = ? LIMIT 1', [vid, id]
    );
    if (!own.length) return res.status(404).json({ ok: false, msg: 'Variant not found' });

    await productDbPool.execute('DELETE FROM bunon_product_variants WHERE id = ?', [vid]);

    const [left]: any = await productDbPool.execute(
      'SELECT COUNT(*) n FROM bunon_product_variants WHERE product_id = ? AND variant_type = ?',
      [id, own[0].variant_type]
    );
    if (Number(left[0].n) === 0) {
      await productDbPool.execute(
        'DELETE FROM bunon_variant_groups WHERE product_id = ? AND variant_type = ?',
        [id, own[0].variant_type]
      );
    }
    await resyncParentStock(id);
    await invalidateProductsCache();
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Variants] Delete error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Recompute the parent stock from its live options. A parent that stays
// "instock" while every option is sold out is what produces oversells.
async function resyncParentStock(productId: number) {
  const [agg]: any = await productDbPool.execute(
    'SELECT COALESCE(SUM(stock_quantity),0) total, ' +
    'SUM(CASE WHEN stock_quantity IS NULL THEN 1 ELSE 0 END) unlimited ' +
    'FROM bunon_product_variants WHERE product_id = ? AND status = 1',
    [productId]
  );
  /* One unlimited option makes the whole product unlimited. SUM() over a set
   * containing NULLs returns NULL, which the old code turned into 0 and
   * marked the product outofstock even though it could be ordered. */
  const total: number | null =
    Number((agg[0] as any).unlimited || 0) > 0 ? null : Number(agg[0].total);
  await productDbPool.execute(
    'UPDATE bunon_products SET stock_quantity = ?, stock_status = ? WHERE id = ?',
    [total, total === null || total > 0 ? 'instock' : 'outofstock', productId]
  );
}

export default router;