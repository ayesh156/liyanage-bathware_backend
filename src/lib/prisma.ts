import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// [FIX] කලින් තිබුනා: const adapterUrl = process.env.DATABASE_URL || '...';
//       new PrismaMariaDb(adapterUrl)  ← raw string එකක් දුන්නා, ඒක නිසා
//       pool එකට connection හරියට track කරගන්න බැරි වෙලා "pool timeout"
//       errors + endless retry loop → core 2ම hours ගාණක් 100% CPU ගාගෙන
//       server freeze වුනේ මේකයි.
//
// [NEW] URL string එක host/user/password/database විදියට parse කරලා,
//       connectionLimit / connectTimeout / idleTimeout explicit දෙනවා.
//       2-core server එකකට connectionLimit 5ක් reasonable.
const rawUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/liyanage_hardware';
const parsedUrl = new URL(rawUrl);

const adapter = new PrismaMariaDb({
  host: parsedUrl.hostname,
  port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 3306,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.replace(/^\//, ''),
  connectionLimit: 5,      // [NEW] max connections pool එකට — core 2ට ගැලපෙන ගාණ
  connectTimeout: 5_000,   // [NEW] ms — DB එකට connect වෙන්න බැරි උනොත් 5s ඇතුලත fail වෙලා ඉවර වෙනවා (retry storm නෑ)
  idleTimeout: 60,         // [NEW] seconds — idle connections permanent open වෙලා නැති වෙනවා
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

export default prisma;