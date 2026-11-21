import {
  useEffect,
  useState,
  useRef,
  useLayoutEffect,
  useMemo,
  useCallback,
} from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getProduct,
  getProducts,
  Product,
  trackPixel,
} from '../lib/woocommerce';
import { useCart } from '../lib/store';
import {
  ShoppingBag,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Truck,
  ShieldCheck,
  RotateCcw,
  Headphones,
  Share2,
  X,
  Maximize2,
  Check,
  Copy,
  Eye,
} from 'lucide-react';
import ProductCard from '../components/products/ProductCard';
import ProductImage, { bestProductImage } from '../components/ProductImage';

const SITE = 'Bunon Fabrics';
const WHATSAPP = '8801618775368';
const RECENTLY_VIEWED_KEY = 'bunon_recently_viewed_products';
const MAX_RECENT_PRODUCTS = 8;

/* =========================================================
   HELPERS
========================================================= */

const removeEmojis = (t?: string) =>
  (t || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');

const stripHtml = (t?: string) =>
  removeEmojis(t)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const imgSrc = (img: any): string =>
  typeof img === 'string' ? img : img?.src || '';

const setMeta = (
  attr: 'name' | 'property',
  key: string,
  content: string
) => {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );

  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }

  el.setAttribute('content', content);
};

const setCanonical = (href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );

  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }

  el.href = href;
};

const getCookie = (name: string) => {
  const parts = `; ${document.cookie}`.split(`; ${name}=`);

  return parts.length === 2
    ? parts.pop()?.split(';').shift() || null
    : null;
};

const formatPrice = (value: number) =>
  `৳${Number(value || 0).toLocaleString('en-US')}`;

const safeDecode = (value: string | null) => {
  if (!value) return '';

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/* =========================================================
   ABANDONED CART
========================================================= */

const saveAbandonedCart = (
  product: Product,
  price: number,
  variation?: any
) => {
  try {
    const phone = (
      getCookie('user_phone') ||
      getCookie('billing_phone') ||
      ''
    ).replace(/\D/g, '');

    if (phone.length < 11) return;

    const name = safeDecode(
      getCookie('user_name') ||
        getCookie('billing_first_name') ||
        'Guest'
    );

    const city = safeDecode(getCookie('billing_city') || '');
    const addr = safeDecode(getCookie('billing_address_1') || '');

    fetch('/api/orders/save_to_wp.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_name: name,
        phone,
        address: city ? `${addr}, ${city}` : addr,
        city,
        cart_products: [
          {
            product_id: product.id,
            variation_id:
              variation?.databaseId ||
              variation?.id ||
              undefined,
            name: product.name,
            price,
            quantity: 1,
            thumbnail: bestProductImage(product),
          },
        ],
      }),
    }).catch(() => {});
  } catch {
    // Never block checkout because abandoned-cart tracking failed.
  }
};

/* =========================================================
   RECENTLY VIEWED
========================================================= */

const saveRecentlyViewed = (product: Product) => {
  try {
    const existing = JSON.parse(
      localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]'
    );

    const list = Array.isArray(existing) ? existing : [];

    const item = {
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      thumbnail: bestProductImage(product),
    };

    const next = [
      item,
      ...list.filter((x: any) => String(x.id) !== String(product.id)),
    ].slice(0, MAX_RECENT_PRODUCTS);

    localStorage.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify(next)
    );
  } catch {
    // Ignore localStorage failures.
  }
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { addItem, buyNow, setIsOpen } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [active, setActive] = useState(0);
  const [variation, setVariation] = useState<any>(null);

  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  const [galleryPaused, setGalleryPaused] = useState(false);

  const sliderRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);

  /* =======================================================
     RESET WHEN PRODUCT CHANGES
  ======================================================= */

  useLayoutEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    });

    setActive(0);
    setExpanded(false);
    setLightbox(false);
    setError(false);
  }, [id]);

  /* =======================================================
     LOAD PRODUCT
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadProduct = async () => {
      if (!id) return;

      setLoading(true);
      setError(false);

      try {
        const p = await getProduct(id);

        if (cancelled) return;

        if (!p) {
          setProduct(null);
          setError(true);
          setLoading(false);
          return;
        }

        setProduct(p);

        setVariation(
          p.variations?.length > 0
            ? p.variations[0]
            : null
        );

        trackPixel('ViewContent', {
          content_name: p.name,
          content_category:
            p.categories?.[0]?.name,
          content_ids: [String(p.id)],
          content_type: 'product',
          contents: [
            {
              id: String(p.id),
              quantity: 1,
            },
          ],
          value: Number(p.price),
          currency: 'BDT',
        });

        saveRecentlyViewed(p);

        /* -----------------------------------------------
           RELATED PRODUCTS
        ------------------------------------------------ */

        const cat =
          p.categories?.[0]?.slug || 'All';

        let all = await getProducts(cat);

        if (all.length <= 1) {
          all = await getProducts('All');
        }

        if (!cancelled) {
          const filtered = all
            .filter((x) => x.id !== p.id)
            .slice(0, 8);

          setRelated(filtered);
        }

        /* -----------------------------------------------
           RECENT PRODUCTS
        ------------------------------------------------ */

        try {
          const stored = JSON.parse(
            localStorage.getItem(
              RECENTLY_VIEWED_KEY
            ) || '[]'
          );

          if (Array.isArray(stored)) {
            const ids = stored
              .map((x: any) => x.id)
              .filter(
                (x: any) =>
                  String(x) !== String(p.id)
              )
              .slice(0, 4);

            const recentLoaded: Product[] = [];

            for (const recentId of ids) {
              try {
                const rp = await getProduct(
                  String(recentId)
                );

                if (rp) {
                  recentLoaded.push(rp);
                }
              } catch {
                // Ignore individual recent-product failure.
              }
            }

            if (!cancelled) {
              setRecentProducts(
                recentLoaded.slice(0, 4)
              );
            }
          }
        } catch {
          // Ignore localStorage failures.
        }

        if (!cancelled) {
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setProduct(null);
          setLoading(false);
        }
      }
    };

    loadProduct();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /* =======================================================
     DERIVED DATA
  ======================================================= */

  const images = useMemo(
    () =>
      product?.images?.length
        ? product.images
        : [
            {
              src:
                '/assets/images/woocommerce-placeholder-300x300.webp',
            },
          ],
    [product]
  );

  const priceNum = Number(
    variation?.price ||
      product?.price ||
      0
  );

  const regularNum = Number(
    variation?.regular_price ||
      product?.regular_price ||
      0
  );

  const isSale =
    regularNum > priceNum &&
    priceNum > 0;

  const saveAmount = Math.max(
    0,
    regularNum - priceNum
  );

  const savePercent =
    isSale && regularNum > 0
      ? Math.round(
          (saveAmount / regularNum) * 100
        )
      : 0;

  const isOut =
    product?.stock_status === 'outofstock';

  const stockQty =
    Number(
      (product as any)?.stock_quantity
    ) || 0;

  const shortText = useMemo(
    () =>
      stripHtml(
        product?.short_description
      ),
    [product]
  );

  const longText = useMemo(
    () =>
      stripHtml(product?.description),
    [product]
  );

  const url = product
    ? `${window.location.origin}/product/${product.slug}`
    : '';

  /* =======================================================
     DYNAMIC PRODUCT BENEFITS
  ======================================================= */

  const benefits = useMemo(() => {
    if (!product) return [];

    const source = [
      product.name,
      product.short_description,
      product.description,
      ...(product.tags || []).map(
        (x: any) => x?.name || ''
      ),
      ...(product.categories || []).map(
        (x: any) => x?.name || ''
      ),
    ]
      .join(' ')
      .toLowerCase();

    const result: string[] = [];

    if (
      source.includes('জামদানি') ||
      source.includes('jamdani')
    ) {
      result.push('Jamdani design');
    }

    if (
      source.includes('half silk') ||
      source.includes('হাফসিল্ক') ||
      source.includes('half-silk')
    ) {
      result.push('Half Silk fabric');
    }

    if (
      source.includes('blouse') ||
      source.includes('ব্লাউজ')
    ) {
      result.push('Blouse fabric included');
    }

    if (
      source.includes('gift') ||
      source.includes('গিফট')
    ) {
      result.push('Gift-ready option');
    }

    return result.slice(0, 4);
  }, [product]);

  /* =======================================================
     SEO
  ======================================================= */

  useEffect(() => {
    if (!product) return;

    const title = `${product.name} - ${formatPrice(
      priceNum
    )} | ${SITE}`;

    const desc = (
      shortText ||
      longText ||
      `${product.name} - ${SITE}`
    ).slice(0, 155);

    const img = imgSrc(images[0]);

    document.title = title;

    setMeta(
      'name',
      'description',
      desc
    );

    setMeta(
      'name',
      'robots',
      'index,follow,max-image-preview:large'
    );

    setMeta(
      'property',
      'og:type',
      'product'
    );

    setMeta(
      'property',
      'og:title',
      title
    );

    setMeta(
      'property',
      'og:description',
      desc
    );

    setMeta(
      'property',
      'og:url',
      url
    );

    setMeta(
      'property',
      'og:image',
      img
    );

    setMeta(
      'property',
      'product:price:amount',
      String(priceNum)
    );

    setMeta(
      'property',
      'product:price:currency',
      'BDT'
    );

    setMeta(
      'name',
      'twitter:card',
      'summary_large_image'
    );

    setMeta(
      'name',
      'twitter:title',
      title
    );

    setMeta(
      'name',
      'twitter:description',
      desc
    );

    setMeta(
      'name',
      'twitter:image',
      img
    );

    setCanonical(url);
  }, [
    product,
    priceNum,
    shortText,
    longText,
    images,
    url,
  ]);

  /* =======================================================
     JSON-LD
  ======================================================= */

  const jsonLd = useMemo(() => {
    if (!product) return '';

    const availability = isOut
      ? 'https://schema.org/OutOfStock'
      : 'https://schema.org/InStock';

    return JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Product',
          '@id': `${url}#product`,
          name: product.name,
          description: (
            shortText ||
            longText
          ).slice(0, 500),
          image: images
            .map(imgSrc)
            .filter(Boolean),
          sku:
            String(product.sku || '') ||
            String(product.id),
          category:
            product.categories?.[0]?.name,
          brand: {
            '@type': 'Brand',
            name: SITE,
          },
          offers: {
            '@type': 'Offer',
            url,
            priceCurrency: 'BDT',
            price: priceNum,
            availability,
            itemCondition:
              'https://schema.org/NewCondition',
            seller: {
              '@type': 'Organization',
              name: SITE,
            },
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item:
                window.location.origin,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Shop',
              item: `${window.location.origin}/shop`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: product.name,
              item: url,
            },
          ],
        },
      ],
    });
  }, [
    product,
    images,
    priceNum,
    isOut,
    shortText,
    longText,
    url,
  ]);

  /* =======================================================
     GALLERY
  ======================================================= */

  const goTo = useCallback(
    (index: number) => {
      const next = Math.max(
        0,
        Math.min(
          images.length - 1,
          index
        )
      );

      setActive(next);

      const el = sliderRef.current;

      if (el) {
        el.scrollTo({
          left: el.clientWidth * next,
          behavior: 'smooth',
        });
      }

      trackPixel('ProductGalleryInteraction', {
        product_id: String(
          product?.id || ''
        ),
        image_index: next,
      });
    },
    [images.length, product]
  );

  /* =======================================================
     AUTO SLIDE
  ======================================================= */

  useEffect(() => {
    if (
      images.length <= 1 ||
      galleryPaused ||
      lightbox
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setActive((current) => {
        const next =
          current >= images.length - 1
            ? 0
            : current + 1;

        const el = sliderRef.current;

        if (el) {
          el.scrollTo({
            left: el.clientWidth * next,
            behavior: 'smooth',
          });
        }

        return next;
      });
    }, 5000);

    return () =>
      window.clearInterval(timer);
  }, [
    images.length,
    galleryPaused,
    lightbox,
  ]);

  /* =======================================================
     THUMBNAIL AUTO SCROLL
  ======================================================= */

  useEffect(() => {
    const container =
      thumbsRef.current;

    const target =
      container?.querySelector<HTMLElement>(
        `[data-idx="${active}"]`
      );

    if (
      container &&
      target
    ) {
      container.scrollTo({
        top:
          target.offsetTop -
          container.clientHeight / 2 +
          target.clientHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [active]);

  /* =======================================================
     ACTIONS
  ======================================================= */

  const handleAdd = async () => {
    if (
      !product ||
      isOut ||
      isAdding
    ) {
      return;
    }

    setIsAdding(true);

    try {
      addItem(product, variation);

      trackPixel('AddToCart', {
        content_name: product.name,
        content_ids: [String(product.id)],
        content_type: 'product',
        contents: [
          {
            id: String(product.id),
            quantity: 1,
          },
        ],
        value: priceNum,
        currency: 'BDT',
      });

      saveAbandonedCart(
        product,
        priceNum,
        variation
      );

      setIsOpen(true);
    } finally {
      window.setTimeout(() => {
        setIsAdding(false);
      }, 450);
    }
  };

  const handleBuy = async () => {
    if (
      !product ||
      isOut ||
      isBuying
    ) {
      return;
    }

    setIsBuying(true);

    try {
      buyNow(product, variation);

      trackPixel('InitiateCheckout', {
        content_name: product.name,
        content_ids: [String(product.id)],
        content_type: 'product',
        value: priceNum,
        currency: 'BDT',
      });

      saveAbandonedCart(
        product,
        priceNum,
        variation
      );

      navigate('/checkout');
    } catch {
      setIsBuying(false);
    }
  };

  /* =======================================================
     SHARE
  ======================================================= */

  const handleShare = async () => {
    if (!product) return;

    trackPixel('ProductShare', {
      content_name: product.name,
      content_ids: [String(product.id)],
    });

    try {
      if (
        navigator.share
      ) {
        await navigator.share({
          title: product.name,
          text: `${product.name} - ${formatPrice(
            priceNum
          )}`,
          url,
        });

        return;
      }

      await navigator.clipboard.writeText(
        url
      );

      setShareCopied(true);

      window.setTimeout(
        () => setShareCopied(false),
        1800
      );
    } catch {
      // User cancelled native share.
    }
  };

  /* =======================================================
     WHATSAPP
  ======================================================= */

  const waLink = product
    ? `https://api.whatsapp.com/send?phone=${WHATSAPP}&text=${encodeURIComponent(
        `আসসালামু আলাইকুম,

আমি এই পণ্যটি অর্ডার করতে চাই।

পণ্য: ${product.name}
মূল্য: ${formatPrice(priceNum)}
লিংক: ${url}`
      )}`
    : '#';

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-8">
          <div className="animate-pulse">
            <div className="h-4 w-48 bg-stone-200 rounded mb-6" />

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="aspect-[4/5] bg-stone-200 rounded-2xl" />

              <div className="space-y-4">
                <div className="h-5 w-32 bg-stone-200 rounded" />
                <div className="h-10 w-full bg-stone-200 rounded" />
                <div className="h-28 w-full bg-stone-200 rounded-2xl" />
                <div className="h-14 w-full bg-stone-200 rounded-xl" />
                <div className="h-12 w-full bg-stone-200 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     ERROR
  ======================================================= */

  if (error || !product) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-5 text-center">
        <div className="w-16 h-16 rounded-full bg-white border border-stone-200 flex items-center justify-center mb-5">
          <ShoppingBag className="w-7 h-7 text-stone-400" />
        </div>

        <h1 className="text-xl font-bold text-stone-900">
          Product not found
        </h1>

        <p className="mt-2 text-sm text-stone-500">
          The product may have been removed or is
          temporarily unavailable.
        </p>

        <Link
          to="/shop"
          className="mt-6 inline-flex items-center justify-center h-11 px-6 rounded-xl bg-brand-primary text-white font-semibold"
        >
          Back to Shop
        </Link>
      </div>
    );
  }

  /* =======================================================
     TRUST
  ======================================================= */

  const trust = [
    {
      icon: Truck,
      title: 'Nationwide Delivery',
      sub: 'Delivery available across Bangladesh',
    },
    {
      icon: ShieldCheck,
      title: 'Cash on Delivery',
      sub: 'Pay according to the checkout process',
    },
    {
      icon: RotateCcw,
      title: 'Easy Support',
      sub: 'Contact us if there is a product issue',
    },
    {
      icon: Headphones,
      title: 'Customer Support',
      sub: 'Direct support through WhatsApp',
    },
  ];

  return (
    <div className="min-h-screen bg-stone-50 pt-4 sm:pt-7 pb-32 md:pb-16">
      <style>{`
        .no-sb::-webkit-scrollbar {
          display: none;
        }

        .no-sb {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .product-prose img {
          max-width: 100%;
          height: auto;
          border-radius: 14px;
        }

        .product-prose table {
          width: 100%;
          border-collapse: collapse;
        }

        .product-prose td,
        .product-prose th {
          border: 1px solid #e7e5e4;
          padding: 10px;
          text-align: left;
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd,
        }}
      />

      <div className="max-w-[1240px] mx-auto px-3 sm:px-6 lg:px-8">

        {/* =================================================
            BREADCRUMB
        ================================================= */}

        <nav
          aria-label="Breadcrumb"
          className="mb-4 text-xs sm:text-sm text-stone-500 flex items-center gap-1.5 flex-wrap"
        >
          <Link
            to="/"
            className="hover:text-stone-900 transition"
          >
            Home
          </Link>

          <span>/</span>

          <Link
            to="/shop"
            className="hover:text-stone-900 transition"
          >
            Shop
          </Link>

          {product.categories?.[0] && (
            <>
              <span>/</span>

              <Link
                to={`/shop?category=${product.categories[0].slug}`}
                className="hover:text-stone-900 transition"
              >
                {product.categories[0].name}
              </Link>
            </>
          )}
        </nav>

        {/* =================================================
            MAIN PRODUCT AREA
        ================================================= */}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-6 lg:gap-12 items-start">

          {/* =================================================
              GALLERY
          ================================================= */}

          <section
            aria-label="Product images"
            className="lg:sticky lg:top-24"
          >
            <div className="grid grid-cols-[58px_minmax(0,1fr)] sm:grid-cols-[76px_minmax(0,1fr)] gap-2 sm:gap-4">

              {/* THUMBNAILS */}

              <div className="relative">
                <div
                  ref={thumbsRef}
                  className="absolute inset-0 flex flex-col gap-2 overflow-y-auto no-sb"
                >
                  {images.map(
                    (img: any, i: number) => (
                      <button
                        key={i}
                        type="button"
                        data-idx={i}
                        onClick={() => {
                          setGalleryPaused(true);
                          goTo(i);
                        }}
                        aria-label={`View product image ${
                          i + 1
                        }`}
                        aria-current={
                          active === i
                        }
                        className={`flex-shrink-0 aspect-square w-full rounded-lg sm:rounded-xl overflow-hidden bg-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary ${
                          active === i
                            ? 'ring-2 ring-brand-primary ring-offset-1'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        <ProductImage
                          src={img}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* MAIN IMAGE */}

              <div
                className="relative rounded-2xl overflow-hidden bg-white border border-stone-200"
                onMouseEnter={() =>
                  setGalleryPaused(true)
                }
                onMouseLeave={() =>
                  setGalleryPaused(false)
                }
                onTouchStart={() =>
                  setGalleryPaused(true)
                }
              >
                <div
                  ref={sliderRef}
                  className="flex overflow-x-auto snap-x snap-mandatory no-sb aspect-[4/5]"
                  onScroll={(e) => {
                    const el =
                      e.currentTarget;

                    if (!el.clientWidth)
                      return;

                    const n = Math.round(
                      el.scrollLeft /
                        el.clientWidth
                    );

                    if (n !== active) {
                      setActive(n);
                    }
                  }}
                >
                  {images.map(
                    (img: any, i: number) => (
                      <div
                        key={i}
                        className="w-full h-full flex-shrink-0 snap-center"
                      >
                        <ProductImage
                          src={img}
                          className="w-full h-full object-cover"
                          alt={
                            i === 0
                              ? product.name
                              : `${product.name} - Image ${
                                  i + 1
                                }`
                          }
                        />
                      </div>
                    )
                  )}
                </div>

                {/* SALE / STOCK */}

                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                  {isSale && !isOut && (
                    <span className="rounded-full bg-brand-primary text-white px-3 py-1 text-xs font-bold shadow">
                      -{savePercent}%
                    </span>
                  )}

                  {isOut && (
                    <span className="rounded-full bg-red-600 text-white px-3 py-1 text-xs font-bold shadow">
                      Out of Stock
                    </span>
                  )}
                </div>

                {/* IMAGE COUNTER */}

                {images.length > 1 && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/65 text-white text-xs px-2.5 py-1 tabular-nums">
                    {active + 1} / {images.length}
                  </span>
                )}

                {/* DESKTOP ARROWS */}

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setGalleryPaused(true);
                        goTo(active - 1);
                      }}
                      disabled={active === 0}
                      aria-label="Previous image"
                      className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/95 shadow-lg disabled:opacity-30 transition hover:scale-105"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGalleryPaused(true);
                        goTo(active + 1);
                      }}
                      disabled={
                        active ===
                        images.length - 1
                      }
                      aria-label="Next image"
                      className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/95 shadow-lg disabled:opacity-30 transition hover:scale-105"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* GALLERY ACTIONS */}

                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGalleryPaused(true);
                      setLightbox(true);

                      trackPixel(
                        'ProductImageZoom',
                        {
                          content_name:
                            product.name,
                        }
                      );
                    }}
                    aria-label="Open image gallery"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/95 shadow-lg hover:scale-105 transition"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label="Share product"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/95 shadow-lg hover:scale-105 transition"
                  >
                    {shareCopied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* =================================================
              PRODUCT INFO
          ================================================= */}

          <section className="flex flex-col">

            {/* CATEGORY */}

            {product.categories?.[0] && (
              <Link
                to={`/shop?category=${product.categories[0].slug}`}
                className="text-sm text-brand-primary font-semibold mb-2 w-fit hover:underline"
              >
                {product.categories[0].name}
              </Link>
            )}

            {/* TITLE */}

            <h1 className="text-2xl sm:text-3xl lg:text-[2.25rem] font-bold text-stone-900 leading-[1.15] tracking-tight mb-4">
              {product.name}
            </h1>

            {/* PRICE */}

            <div className="rounded-2xl bg-white border border-stone-200 p-4 sm:p-5 mb-5 shadow-sm">

              <div className="flex items-end gap-3 flex-wrap">

                <span className="text-3xl sm:text-4xl font-extrabold text-stone-900 tabular-nums">
                  {formatPrice(priceNum)}
                </span>

                {isSale && !isOut && (
                  <>
                    <span className="text-lg text-stone-400 line-through tabular-nums mb-0.5">
                      {formatPrice(
                        regularNum
                      )}
                    </span>

                    <span className="mb-1 rounded-md bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-xs font-semibold">
                      Save{' '}
                      {formatPrice(
                        saveAmount
                      )}
                    </span>
                  </>
                )}
              </div>

              {isSale &&
                !isOut && (
                  <p className="mt-2 text-sm text-green-700 font-medium">
                    You save{' '}
                    {savePercent}%
                  </p>
                )}

              {stockQty > 0 &&
                stockQty <= 10 &&
                !isOut && (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    Only {stockQty} left in stock
                  </p>
                )}

              {!isOut && (
                <div className="mt-3 pt-3 border-t border-stone-100 flex items-center gap-2 text-sm text-stone-500">
                  <Truck className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Delivery charge will be shown
                    at checkout
                  </span>
                </div>
              )}
            </div>

            {/* DYNAMIC BENEFITS */}

            {benefits.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {benefits.map(
                  (benefit) => (
                    <div
                      key={benefit}
                      className="flex items-center gap-2 rounded-xl bg-white border border-stone-200 px-3 py-2.5"
                    >
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />

                      <span className="text-xs sm:text-sm font-medium text-stone-700">
                        {benefit}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}

            {/* SHORT DESCRIPTION */}

            {shortText && (
              <div
                className="text-[15px] text-stone-600 leading-relaxed mb-5"
                dangerouslySetInnerHTML={{
                  __html:
                    removeEmojis(
                      product.short_description
                    ),
                }}
              />
            )}

            {/* VARIATIONS */}

            {product.variations?.length >
              0 &&
              !isOut && (
                <fieldset className="mb-5">
                  <legend className="text-sm font-semibold text-stone-900 mb-2">
                    Select an option
                  </legend>

                  <div className="flex flex-wrap gap-2">
                    {product.variations.map(
                      (v: any) => {
                        const selected =
                          variation?.databaseId ===
                          v.databaseId;

                        return (
                          <button
                            key={
                              v.databaseId
                            }
                            type="button"
                            onClick={() => {
                              setVariation(v);

                              trackPixel(
                                'SelectVariation',
                                {
                                  product_id:
                                    String(
                                      product.id
                                    ),
                                  variation_id:
                                    String(
                                      v.databaseId
                                    ),
                                  variation_name:
                                    v.name,
                                }
                              );
                            }}
                            aria-pressed={
                              selected
                            }
                            className={`px-4 py-2.5 text-sm font-medium rounded-xl border transition ${
                              selected
                                ? 'bg-stone-900 border-stone-900 text-white'
                                : 'bg-white border-stone-300 text-stone-700 hover:border-stone-900'
                            }`}
                          >
                            {String(
                              v.name || ''
                            ).replace(
                              `${product.name} - `,
                              ''
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </fieldset>
              )}

            {/* =================================================
                MAIN CTA
            ================================================= */}

            <div className="flex flex-col gap-3">

              {!isOut ? (
                <>
                  {/* ORDER NOW */}

                  <button
                    type="button"
                    onClick={handleBuy}
                    disabled={isBuying}
                    className="h-14 flex items-center justify-center gap-2 rounded-xl bg-brand-primary text-white font-bold text-base shadow-lg shadow-brand-primary/25 hover:brightness-110 active:scale-[.985] transition disabled:opacity-70 disabled:cursor-wait"
                  >
                    <Zap className="w-5 h-5" />

                    {isBuying
                      ? 'Processing...'
                      : 'Order Now'}
                  </button>

                  {/* ADD TO CART + WHATSAPP */}

                  <div className="grid grid-cols-2 gap-3">

                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={isAdding}
                      className="h-12 flex items-center justify-center gap-2 rounded-xl bg-white border-2 border-stone-900 text-stone-900 font-semibold text-sm hover:bg-stone-900 hover:text-white transition disabled:opacity-60"
                    >
                      <ShoppingBag className="w-4 h-4" />

                      {isAdding
                        ? 'Added'
                        : 'Add to Cart'}
                    </button>

                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackPixel(
                          'Contact',
                          {
                            content_name:
                              product.name,
                            content_ids: [
                              String(
                                product.id
                              ),
                            ],
                          }
                        )
                      }
                      className="h-12 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white font-semibold text-sm hover:brightness-105 active:scale-[.985] transition"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                      </svg>

                      WhatsApp
                    </a>
                  </div>
                </>
              ) : (
                <div className="h-14 flex items-center justify-center rounded-xl bg-red-50 border border-red-200 text-red-600 font-bold">
                  Currently Out of Stock
                </div>
              )}
            </div>

            {/* =================================================
                TRUST
            ================================================= */}

            <ul className="grid grid-cols-2 gap-3 mt-6">
              {trust.map(
                ({
                  icon: Icon,
                  title,
                  sub,
                }) => (
                  <li
                    key={title}
                    className="flex items-start gap-3 rounded-xl bg-white border border-stone-200 p-3"
                  >
                    <Icon className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />

                    <div>
                      <p className="text-[13px] font-bold text-stone-800 leading-tight">
                        {title}
                      </p>

                      <p className="text-xs text-stone-500 mt-0.5 leading-snug">
                        {sub}
                      </p>
                    </div>
                  </li>
                )
              )}
            </ul>
          </section>
        </div>

        {/* =================================================
            PRODUCT DETAILS
        ================================================= */}

        {product.description && (
          <section className="mt-10 rounded-2xl bg-white border border-stone-200 p-5 sm:p-8">

            <div className="flex items-center justify-between gap-4 mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
                Product Details
              </h2>

              <Eye className="w-5 h-5 text-stone-400" />
            </div>

            <div className="relative">
              <div
                className={`product-prose prose prose-sm sm:prose-base max-w-none text-stone-600 overflow-hidden transition-[max-height] duration-300 ${
                  expanded
                    ? 'max-h-none'
                    : 'max-h-64'
                }`}
                dangerouslySetInnerHTML={{
                  __html:
                    removeEmojis(
                      product.description
                    ),
                }}
              />

              {!expanded && (
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setExpanded(
                  (value) => !value
                );

                trackPixel(
                  'DescriptionToggle',
                  {
                    product_id:
                      String(product.id),
                    expanded:
                      !expanded,
                  }
                );
              }}
              aria-expanded={expanded}
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary"
            >
              {expanded
                ? 'Show Less'
                : 'Read Full Description'}

              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  expanded
                    ? 'rotate-180'
                    : ''
                }`}
              />
            </button>
          </section>
        )}

        {/* =================================================
            PRODUCT INFORMATION
        ================================================= */}

        <section className="mt-6 rounded-2xl bg-white border border-stone-200 p-5 sm:p-8">

          <h2 className="text-xl sm:text-2xl font-bold text-stone-900 mb-5">
            Product Information
          </h2>

          <dl className="divide-y divide-stone-100">

            {product.sku && (
              <div className="grid grid-cols-2 gap-4 py-3 text-sm">
                <dt className="text-stone-500">
                  SKU
                </dt>

                <dd className="font-medium text-stone-800 text-right">
                  {product.sku}
                </dd>
              </div>
            )}

            {product.categories?.[0] && (
              <div className="grid grid-cols-2 gap-4 py-3 text-sm">
                <dt className="text-stone-500">
                  Category
                </dt>

                <dd className="font-medium text-stone-800 text-right">
                  {product.categories[0].name}
                </dd>
              </div>
            )}

            {product.stock_status && (
              <div className="grid grid-cols-2 gap-4 py-3 text-sm">
                <dt className="text-stone-500">
                  Availability
                </dt>

                <dd
                  className={`font-medium text-right ${
                    isOut
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}
                >
                  {isOut
                    ? 'Out of Stock'
                    : 'In Stock'}
                </dd>
              </div>
            )}

            {product.tags?.length >
              0 && (
              <div className="grid grid-cols-2 gap-4 py-3 text-sm">
                <dt className="text-stone-500">
                  Tags
                </dt>

                <dd className="font-medium text-stone-800 text-right">
                  {product.tags
                    .slice(0, 5)
                    .map(
                      (tag: any) =>
                        tag?.name
                    )
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* =================================================
            RELATED PRODUCTS
        ================================================= */}

        {related.length > 0 && (
          <section className="mt-12">

            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-brand-primary font-semibold mb-1">
                  You may also like
                </p>

                <h2 className="text-2xl font-bold text-stone-900">
                  More Products
                </h2>
              </div>

              <Link
                to="/shop"
                className="text-sm font-semibold text-brand-primary hover:underline"
              >
                View All
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {related
                .slice(0, 4)
                .map((rp) => (
                  <ProductCard
                    key={rp.id}
                    product={rp}
                  />
                ))}
            </div>
          </section>
        )}

        {/* =================================================
            RECENTLY VIEWED
        ================================================= */}

        {recentProducts.length > 0 && (
          <section className="mt-12">

            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.16em] text-stone-400 font-semibold mb-1">
                Continue browsing
              </p>

              <h2 className="text-2xl font-bold text-stone-900">
                Recently Viewed
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {recentProducts
                .slice(0, 4)
                .map((rp) => (
                  <ProductCard
                    key={rp.id}
                    product={rp}
                  />
                ))}
            </div>
          </section>
        )}
      </div>

      {/* ===================================================
          LIGHTBOX
      =================================================== */}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Product image viewer"
          onClick={() =>
            setLightbox(false)
          }
        >
          <button
            type="button"
            onClick={() =>
              setLightbox(false)
            }
            aria-label="Close image viewer"
            className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
          >
            <X className="w-6 h-6" />
          </button>

          <button
            type="button"
            disabled={active === 0}
            onClick={(e) => {
              e.stopPropagation();
              goTo(active - 1);
            }}
            className="absolute left-3 sm:left-6 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-20"
            aria-label="Previous image"
          >
            <ChevronLeft />
          </button>

          <div
            className="max-w-5xl max-h-[90vh] flex items-center justify-center"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <ProductImage
              src={images[active]}
              className="max-w-full max-h-[88vh] object-contain rounded-xl"
              alt={`${product.name} - Image ${
                active + 1
              }`}
            />
          </div>

          <button
            type="button"
            disabled={
              active ===
              images.length - 1
            }
            onClick={(e) => {
              e.stopPropagation();
              goTo(active + 1);
            }}
            className="absolute right-3 sm:right-6 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-20"
            aria-label="Next image"
          >
            <ChevronRight />
          </button>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white text-sm bg-black/40 px-3 py-1.5 rounded-full">
            {active + 1} / {images.length}
          </div>
        </div>
      )}

      {/* ===================================================
          MOBILE STICKY CTA

          IMPORTANT:
          No bag/cart icon button here.
          Add to Cart remains as a TEXT BUTTON.
      =================================================== */}

      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-stone-200 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-8px_25px_rgba(0,0,0,.07)]">

        <div className="flex items-center gap-2.5">

          {/* PRICE */}

          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-stone-500 truncate">
              {product.name}
            </p>

            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-extrabold text-stone-900 tabular-nums">
                {formatPrice(
                  priceNum
                )}
              </span>

              {isSale && (
                <span className="text-xs text-stone-400 line-through tabular-nums">
                  {formatPrice(
                    regularNum
                  )}
                </span>
              )}
            </div>
          </div>

          {!isOut ? (
            <>
              {/* ADD TO CART
                  No bag icon.
              */}

              <button
                type="button"
                onClick={handleAdd}
                disabled={isAdding}
                className="h-11 px-3.5 sm:px-4 flex items-center justify-center rounded-xl border-2 border-stone-900 text-stone-900 text-xs sm:text-sm font-bold whitespace-nowrap active:scale-95 transition disabled:opacity-60"
              >
                {isAdding
                  ? 'Added'
                  : 'Add to Cart'}
              </button>

              {/* ORDER NOW */}

              <button
                type="button"
                onClick={handleBuy}
                disabled={isBuying}
                className="h-11 px-4 sm:px-5 flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary text-white text-xs sm:text-sm font-bold shadow-md shadow-brand-primary/25 active:scale-95 transition disabled:opacity-70"
              >
                {isBuying
                  ? 'Processing...'
                  : 'Order Now'}
              </button>
            </>
          ) : (
            <span className="px-4 h-11 flex items-center rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold whitespace-nowrap">
              Out of Stock
            </span>
          )}
        </div>
      </div>
    </div>
  );
}