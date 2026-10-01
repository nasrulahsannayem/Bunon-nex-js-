import { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { SeoHead } from '../components/SeoHead';
import ArticleBody from '../components/ArticleBody';
import AdSenseArticle from '../components/AdSenseArticle';

// Legacy root-level blog URLs (e.g. /saree-niye-caption-bangla/) are the ones
// Google actually indexed and still sends traffic to. The app only routes
// /blog/:slug, so these used to fall into the catch-all and silently bounce to
// the homepage. This route fetches the post by slug and renders it in place.
export default function LegacyBlogSlug() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [blog, setBlog] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetch('/api/blog/' + encodeURIComponent(slug))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d && d.ok && d.blog) { setBlog(d.blog); setState('ok'); }
        else setState('missing');
      })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [slug]);

  if (state === 'loading') {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-center text-gray-500">লোড হচ্ছে...</div>;
  }

  // Not a blog slug after all: preserve the previous catch-all
  // behaviour (bounce to home) for genuinely unknown URLs.
  if (state === 'missing' || !blog) {
    return <Navigate to="/" replace />;
  }

  const seoTitle = blog.title ? `${blog.title} | Bunon Fabrics` : 'ব্লগ | Bunon Fabrics';
  const seoDesc = String(blog.excerpt || blog.title || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <SeoHead title={seoTitle} description={seoDesc} />
      <Link to="/blog" className="text-brand-primary text-sm mb-4 inline-block">← ব্লগে ফিরুন</Link>
      {blog.featured_image && (
        <img src={blog.featured_image} alt={blog.title} className="w-full h-64 object-cover rounded-2xl mb-6" />
      )}
      <h1 className="text-3xl font-black text-brand-navy mb-2">{blog.title}</h1>
      <p className="text-gray-400 text-sm mb-6">
        {blog.author ? 'লেখক: ' + blog.author : ''}
        {blog.published_at ? ' • ' + String(blog.published_at).slice(0, 10) : ''}
      </p>
      <AdSenseArticle />
      <ArticleBody content={blog.content} />
    </div>
  );
}
