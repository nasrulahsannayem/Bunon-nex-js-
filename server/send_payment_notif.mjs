import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

(async () => {
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '12345',
    database: 'mysql',
    ssl: false,
    connectTimeout: 5000,
  });

  // List all databases
  const [dbs] = await db.execute('SHOW DATABASES');
  console.log('Databases:', dbs.map(d => Object.values(d)[0]).join(', '));

  // Check each database for orders-like tables
  for (const row of dbs) {
    const dbName = Object.values(row)[0];
    if (['mysql','information_schema','performance_schema','sys'].includes(dbName)) continue;
    try {
      const [tables] = await db.execute(`SHOW TABLES FROM ${dbName}`);
      const hasOrders = tables.some(t => Object.values(t)[0].includes('order'));
      if (hasOrders) {
        console.log(`DB ${dbName} has order tables: `, tables.filter(t => Object.values(t)[0].includes('order')).map(t => Object.values(t)[0]).join(', '));
      }
    } catch(e) { /* skip */ }
  }

  await db.end();
})();
