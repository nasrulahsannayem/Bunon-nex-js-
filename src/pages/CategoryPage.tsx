// SEO landing page for /product-category/:slug.
// Renders the normal Shop grid scoped to one category, but keeps the clean
// /product-category/<slug>/ URL (no ?cat= query) and emits a self-referencing
// canonical + real category title/description.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Shop from './Shop';
import { getCategories } from '../lib/woocommerce';
import { SeoHead } from '../components/SeoHead';

const titleCase = (s: string) =>
  decodeURIComponent(s || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function CategoryPage() {
  const { slug = '' } = useParams();
  const [name, setName] = useState<string>('');

  useEffect(() => {
    let alive = true;
    getCategories()
      .then((cats: any[]) => {
        if (!alive) return;
        const hit = (cats || []).find(
          (c: any) => String(c.slug || '').toLowerCase() === String(slug).toLowerCase()
        );
        if (hit) setName(hit.name || titleCase(slug));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);

  const label = name || titleCase(slug);
  const title = `${label} | Bunon Fabrics - বুনন ফেব্রিক্স`;
  const description = `${label} কালেকশন — বাংলাদেশের অনলাইন শপে সেরা দামে ${label}। ৬৪ জেলায় হোম ডেলিভারি, ১০০% কটন, ক্যাশ অন ডেলিভারি। Bunon Fabrics, বুনন ফেব্রিক্স।`;

  return (
    <>
      <SeoHead title={title} description={description} />
      <Shop fixedCategory={slug} />
    </>
  );
}
