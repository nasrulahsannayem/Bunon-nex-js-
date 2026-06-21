import type { NextApiRequest, NextApiResponse } from 'next';

// XML স্পেশাল ক্যারেক্টার এস্কেপ করার ফাংশন
const escapeXML = (str: string) => {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
};

// ওয়ার্ডপ্রেসের ডেসক্রিপশন থেকে HTML ট্যাগ মুছে ফেলার ফাংশন
const stripHTML = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        // ১. API থেকে ডেটা নিয়ে আসা
        const response = await fetch('https://bunonfabrics.com/super_api.php');
        const result = await response.json();

        if (!result.ok || !result.data) {
            throw new Error("Failed to fetch product data.");
        }

        // আউট অফ স্টক প্রোডাক্টগুলো ফিল্টার করে বাদ দেওয়া হলো
        const products = result.data.filter((product: any) => product.stock_status === 'instock');

        // ২. ফেসবুক/মেটা ক্যাটালগের জন্য স্ট্যান্ডার্ড XML হেডার তৈরি
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
        xml += `  <channel>\n`;
        xml += `    <title>Bunon Fabrics Catalog</title>\n`;
        xml += `    <link>https://bunon.shop</link>\n`;
        xml += `    <description>Premium Heritage Textiles & Sarees from Bunon Fabrics</description>\n`;

        // ৩. প্রতিটি প্রোডাক্টের ডেটা প্রসেস করা (শুধু ইন-স্টক প্রোডাক্ট)
        products.forEach((product: any) => {
            const id = product.id || product.sku;
            const title = escapeXML(product.name);
            
            const rawDescription = product.description || product.short_description || product.name;
            const description = escapeXML(stripHTML(rawDescription)).substring(0, 4999);
            
            const link = `https://bunon.shop/product/${id}`;
            const imageLink = product.images && product.images.length > 0 ? escapeXML(product.images[0].src) : '';
            
            const regularPrice = product.regular_price ? `${product.regular_price} BDT` : `${product.price || 0} BDT`;
            
            xml += `    <item>\n`;
            xml += `      <g:id>${id}</g:id>\n`;
            xml += `      <g:title>${title}</g:title>\n`;
            xml += `      <g:description>${description}</g:description>\n`;
            xml += `      <g:link>${link}</g:link>\n`;
            xml += `      <g:image_link>${imageLink}</g:image_link>\n`;
            xml += `      <g:brand>Bunon Fabrics</g:brand>\n`;
            xml += `      <g:condition>new</g:condition>\n`;
            xml += `      <g:availability>in stock</g:availability>\n`; // যেহেতু ফিল্টার করেছি, তাই সবই ইন স্টক
            xml += `      <g:price>${regularPrice}</g:price>\n`;
            
            if (product.sale_price && product.sale_price !== product.regular_price) {
                xml += `      <g:sale_price>${product.sale_price} BDT</g:sale_price>\n`;
            }

            xml += `    </item>\n`;
        });

        xml += `  </channel>\n`;
        xml += `</rss>`;

        res.setHeader('Content-Type', 'text/xml; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        res.status(200).send(xml);

    } catch (error) {
        console.error("Feed API Error:", error);
        res.status(500).json({ error: "Feed generation failed" });
    }
}