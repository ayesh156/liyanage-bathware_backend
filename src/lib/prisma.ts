import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/**
 * Singleton Prisma client for Liyanage Bathware POS.
 * Uses MariaDB adapter with explicit connection pooling and timeout thresholds.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const rawUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/liyanage_hardware';
const parsedUrl = new URL(rawUrl);

const adapter = new PrismaMariaDb({
  host: parsedUrl.hostname,
  port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 3306,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.replace(/^\//, ''),
  connectionLimit: 5,      // Pool එකට max connections 5ක් (VPS stability සඳහා)
  connectTimeout: 5000,    // 5s connection timeout (endless retries නෑ)
  idleTimeout: 60,         // 60s idle timeout
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Database connection check helper with connection pool verification
export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('✅ MariaDB Driver Adapter connected successfully (Max pool: 5)');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

export default prisma;