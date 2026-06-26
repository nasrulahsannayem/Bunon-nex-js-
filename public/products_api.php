<?php
// bunon.shop/public/products_api.php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");
header('Content-Type: application/json; charset=utf-8');

$host    = 'localhost';
$db      = 'bunonfabrics_dash_db'; 
$user    = 'bunonfabrics_dash_db'; 
$envPath = __DIR__ . '/../.env';
$env = [];
if (file_exists($envPath)) {
    $env = parse_ini_file($envPath);
}
$pass = isset($env['DASH_DB_PASSWORD']) ? str_replace('"', '', $env['DASH_DB_PASSWORD']) : '';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
    
    $term  = trim($_GET['q'] ?? '');
    $limit = (int)($_GET['limit'] ?? 0);

    $sql = "
        SELECT 
            id,
            wc_product_id,
            name,
            sku,
            current_price,
            thumbnail,
            stock_status,
            status,
            description,
            short_description
        FROM wc_products
        WHERE status = 'publish'
    ";

    $params = [];
    if ($term !== '') {
        $sql .= " AND (name LIKE :term OR sku LIKE :term)";
        $params[':term'] = '%' . $term . '%';
    }

    $sql .= " ORDER BY name ASC";
    if ($limit > 0) {
        $sql .= " LIMIT " . (int)$limit;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode([
        'ok'   => true,
        'data' => $stmt->fetchAll(),
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => "Connection Failed: " . $e->getMessage()]);
}
