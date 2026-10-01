import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SeoHead } from '../components/SeoHead';
import ArticleBody from '../components/ArticleBody';
import AdSenseArticle from '../components/AdSenseArticle';

const IMG_FALLBACK: string =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#9ca3af">Bunon Fabrics</text></svg>'
  );

const hideBrokenImg = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.currentTarget;
  if (el.src !== IMG_FALLBACK) el.src = IMG_FALLBACK
};

export default function BlogDetail() {
  const { slug } = useParams();
  const [blog, setBlog] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch('/api/blog/' + slug).then(r => r.json()).then(d => {
      if (d.ok) setBlog(d.blog); else setErr(true);
      setLoading(false);
    });
  }, [slug]);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-10 text-center text-gray-500">লোড হচ্ছে...</div>;
  if (err || !blog) return <div className="max-w-3xl mx-auto px-4 py-10 text-center"><p className="text-gray-500">পোস্টটি পাওয়া যায়নি।</p><Link to="/blog" className="text-brand-primary">← ব্লগে ফিরুন</Link></div>;

  const seoTitle = blog.title
    ? `${blog.title} | Bunon Fabrics`
    : 'ব্লগ | Bunon Fabrics';
  const seoDesc = String(blog.excerpt || blog.title || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <SeoHead title={seoTitle} description={seoDesc} />
      <Link to="/blog" className="text-brand-primary text-sm mb-4 inline-block">← ব্লগে ফিরুন</Link>
      {blog.featured_image && <img src={blog.featured_image} onError={hideBrokenImg} alt={blog.title} className="w-full h-64 object-cover rounded-2xl mb-6" />}
      <h1 className="text-3xl font-black text-brand-navy mb-2">{blog.title}</h1>
      <p className="text-gray-400 text-sm mb-6">{blog.author ? 'লেখক: ' + blog.author : ''} {blog.published_at ? ' • ' + blog.published_at.slice(0, 10) : ''}</p>
      <AdSenseArticle />
      <ArticleBody content={blog.content} />
    </div>
  );
}
