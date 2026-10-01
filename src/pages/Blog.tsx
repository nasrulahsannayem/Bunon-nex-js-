import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const IMG_FALLBACK: string = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><rect width='100%' height='100%' fill='#e5e7eb'/><text x='50%' y='50%' fill='#9ca3af'>Bunon Fabrics</text></svg>");

const hideBrokenImg = (e: React.SyntheticEvent<HTMLImageElement>) => { const el = e.currentTarget; if (el.src !== IMG_FALLBACK) el.src = IMG_FALLBACK; };


export default function Blog() {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/blog').then(r => r.json()).then(d => {
      if (d.ok) setBlogs(d.blogs);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-black text-brand-navy mb-8 text-center">আমাদের ব্লগ</h1>
      {loading ? <p className="text-center text-gray-500">লোড হচ্ছে...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blogs.map(b => (
            <Link key={b.id} to={`/blog/${b.slug}`} className="bg-white rounded-2xl shadow hover:shadow-lg transition overflow-hidden block">
              {b.featured_image && <img src={b.featured_image} alt={b.title} className="w-full h-44 object-cover" onError={hideBrokenImg} />}
              <div className="p-4">
                <h2 className="font-bold text-lg text-brand-navy mb-1">{b.title}</h2>
                <p className="text-gray-500 text-sm line-clamp-3">{b.excerpt}</p>
                <p className="text-xs text-gray-400 mt-2">{b.published_at ? b.published_at.slice(0, 10) : ''}</p>
              </div>
            </Link>
          ))}
          {blogs.length === 0 && <p className="col-span-full text-center text-gray-400">এখনও কোনো পোস্ট প্রকাশিত হয়নি।</p>}
        </div>
      )}
    </div>
  );
}
