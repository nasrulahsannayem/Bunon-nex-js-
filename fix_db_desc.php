<?php
header('Content-Type: text/plain; charset=utf-8');
ini_set('memory_limit', '512M');
set_time_limit(300);

$host    = '127.0.0.1';
$db      = 'bunonfabrics_dash_db'; 
$user    = 'bunonfabrics_dash_db'; 
$pass    = 'naim#707207AA'; 
$charset = 'utf8mb4';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=$charset", $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    echo "লোকাল ডাটাবেস থেকে বিবরণ সিঙ্ক করা শুরু হচ্ছে...\n";

    // wp_posts টেবিল থেকে বিবরণ টেনে এনে wc_products টেবিলে আপডেট করার SQL কোয়েরি
    // (যদি একই ডাটাবেসে ওয়ার্ডপ্রেসের টেবিলগুলো থাকে তবে এটি কাজ করবে)
    $sql = "UPDATE wc_products wp
            INNER JOIN wp_posts p ON wp.wc_product_id = p.ID
            SET wp.description = p.post_content,
                wp.short_description = p.post_excerpt
            WHERE wp.description IS NULL OR wp.description = ''";
            
    $affected = $pdo->exec($sql);
    echo "সফলভাবে {$affected}টি প্রোডাক্টের বিবরণ ডাটাবেসে আপডেট করা হয়েছে! ⚡\n";

} catch (Exception $e) {
    // যদি wp_posts টেবিল একই ডাটাবেসে না থাকে, তবে আমরা বিকল্প এপিআই বা লোকাল সিঙ্ক চেক করব
    echo "ত্রুটি: " . $e->getMessage() . "\n";
    echo "সম্ভবত ওয়ার্ডপ্রেসের টেবিলগুলো আলাদা ডাটাবেসে আছে।\n";
}

// ফাইলটি ক্লিন করা
rm -f /www/wwwroot/bunon.shop/fix_db_desc.php
