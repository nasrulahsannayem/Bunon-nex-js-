<?php
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');

// আপনার ডাটাবেস ক্রেডেনশিয়াল
$envPath = __DIR__ . '/.env';
$env = [];
if (file_exists($envPath)) {
    $env = parse_ini_file($envPath);
}

$wp_host = isset($env['WP_DB_HOST']) ? $env['WP_DB_HOST'] : '127.0.0.1';
$wp_port = isset($env['WP_DB_PORT']) ? $env['WP_DB_PORT'] : '3306';
$wp_db   = isset($env['WP_DB_NAME']) ? $env['WP_DB_NAME'] : 'Bunonfabrics_db';
$wp_user = isset($env['WP_DB_USER']) ? $env['WP_DB_USER'] : 'Bunonfabrics_db';
$wp_pass = isset($env['WP_DB_PASSWORD']) ? str_replace('"', '', $env['WP_DB_PASSWORD']) : '';

try {
    $pdo = new PDO("mysql:host=$wp_host;port=$wp_port;dbname=$wp_db;charset=utf8mb4", $wp_user, $wp_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
} catch (Exception $e) {
    echo json_encode(['ok' => false, 'error' => 'DB Connection Fail']);
    exit;
}

// সেফ টেক্সট ক্লিনার (JSON ব্রেক হওয়া ঠেকাতে)
function safe_text($str) {
    if (empty($str)) return '';
    $str = strip_tags($str);
    $str = preg_replace('/[\r\n\t]+/', ' ', $str); // নতুন লাইন বা ট্যাব সরাবে
    $str = preg_replace('/[[:cntrl:]]/', '', $str); // লুকানো কন্ট্রোল ক্যারেক্টার সরাবে
    return trim($str);
}

try {
    $sql = "SELECT ID, post_title as name, post_name as slug, post_content as description, post_excerpt as short_description, post_date, menu_order 
            FROM wp_posts 
            WHERE post_type = 'product' AND post_status = 'publish' 
            ORDER BY menu_order ASC, post_date DESC";
            
    $stmt = $pdo->query($sql);
    $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($products)) {
        echo json_encode(['ok' => true, 'data' => []]);
        exit;
    }

    $product_ids = array_column($products, 'ID');
    $id_placeholders = implode(',', array_fill(0, count($product_ids), '?'));

    $meta_sql = "SELECT post_id, meta_key, meta_value FROM wp_postmeta WHERE post_id IN ($id_placeholders)";
    $meta_stmt = $pdo->prepare($meta_sql);
    $meta_stmt->execute($product_ids);
    $meta_rows = $meta_stmt->fetchAll(PDO::FETCH_ASSOC);

    $meta_map = [];
    foreach ($meta_rows as $row) {
        $meta_map[$row['post_id']][$row['meta_key']] = $row['meta_value'];
    }

    $tax_sql = "SELECT tr.object_id, t.name, t.slug, tt.taxonomy 
                FROM wp_term_relationships tr
                INNER JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
                INNER JOIN wp_terms t ON tt.term_id = t.term_id
                WHERE tt.taxonomy IN ('product_cat', 'product_tag') AND tr.object_id IN ($id_placeholders)";
    $tax_stmt = $pdo->prepare($tax_sql);
    $tax_stmt->execute($product_ids);
    $tax_rows = $tax_stmt->fetchAll(PDO::FETCH_ASSOC);

    $tax_map = [];
    foreach ($tax_rows as $row) {
        $tax_map[$row['object_id']][] = [
            'name' => safe_text($row['name']),
            'slug' => safe_text($row['slug']),
            'type' => $row['taxonomy']
        ];
    }

    $attachment_ids = [];
    foreach ($meta_map as $pid => $meta) {
        if (!empty($meta['_thumbnail_id'])) $attachment_ids[] = $meta['_thumbnail_id'];
        if (!empty($meta['_product_image_gallery'])) {
            $gallery_ids = array_filter(explode(',', $meta['_product_image_gallery']));
            $attachment_ids = array_merge($attachment_ids, $gallery_ids);
        }
    }
    
    $img_map = [];
    if (!empty($attachment_ids)) {
        $attachment_ids = array_unique(array_map('intval', $attachment_ids));
        $img_placeholders = implode(',', array_fill(0, count($attachment_ids), '?'));
        $img_sql = "SELECT ID, guid FROM wp_posts WHERE ID IN ($img_placeholders)";
        $img_stmt = $pdo->prepare($img_sql);
        $img_stmt->execute(array_values($attachment_ids));
        $img_map = $img_stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    }

    $final_data = [];
    foreach ($products as $p) {
        $pid = $p['ID'];
        $p_meta = $meta_map[$pid] ?? [];
        $p_meta_tax = $tax_map[$pid] ?? [];

        $categories = [];
        $tags = [];
        foreach ($p_meta_tax as $t) {
            if ($t['type'] === 'product_cat') {
                $categories[] = ['name' => $t['name'], 'slug' => $t['slug']];
            } else {
                $tags[] = $t['name'];
            }
        }

        $images = [];
        $thumb_id = $p_meta['_thumbnail_id'] ?? 0;
        if (isset($img_map[$thumb_id])) {
            $images[] = ['src' => $img_map[$thumb_id]];
        } else {
            $images[] = ['src' => '/placeholder.png'];
        }

        if (!empty($p_meta['_product_image_gallery'])) {
            $g_ids = array_filter(explode(',', $p_meta['_product_image_gallery']));
            foreach ($g_ids as $gid) {
                if (isset($img_map[$gid]) && $img_map[$gid] !== ($img_map[$thumb_id] ?? '')) {
                    $images[] = ['src' => $img_map[$gid]];
                }
            }
        }

        $current_price = $p_meta['_price'] ?? '0';
        $regular_price = $p_meta['_regular_price'] ?? '0';
        $sale_price    = $p_meta['_sale_price'] ?? '';

        $final_data[] = [
            'id' => (int)$pid,
            'wc_product_id' => (int)$pid,
            'name' => safe_text($p['name']),
            'slug' => safe_text($p['slug']),
            'price' => $current_price,
            'regular_price' => $regular_price,
            'sale_price' => $sale_price,
            'on_sale' => (!empty($sale_price) && (float)$current_price < (float)$regular_price),
            'stock_status' => $p_meta['_stock_status'] ?? 'instock',
            'stock_quantity' => isset($p_meta['_stock']) ? (int)$p_meta['_stock'] : null,
            'description' => safe_text($p['description']),
            'short_description' => safe_text($p['short_description']),
            'images' => $images,
            'thumbnail' => $images[0]['src'],
            'categories' => !empty($categories) ? $categories : [['name' => 'All Products', 'slug' => 'All']],
            'tags' => $tags,
            'menu_order' => (int)$p['menu_order'],
            'date_created' => $p['post_date'],
            'total_sales' => (int)($p_meta['total_sales'] ?? 0)
        ];
    }

    echo json_encode(['ok' => true, 'data' => $final_data], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    echo json_encode(['ok' => false, 'error' => 'Data Stream Fail']);
}
