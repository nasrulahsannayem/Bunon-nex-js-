import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

export const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`,
  password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD.replace(/"/g, '') : undefined
});

redisClient.on('error', (err) => console.error('[REDIS] Client Error', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('[REDIS] Connected successfully ⚡');
  } catch (err) {
    console.error('[REDIS] Connection failed:', err);
  }
})();

export const getCachedProducts = async () => {
  const data = await redisClient.get('products');
  if (data) {
    return JSON.parse(data);
  }
  return [];
};

export const setCachedProducts = async (products: any[]) => {
  await redisClient.set('products', JSON.stringify(products));
};
