import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error('❌ Critical Architecture Error: DATABASE_URL is missing in environment variables.');
}

// අනාගත Load Balancing සහ Spikes වලට මුහුණ දීම සඳහා URL එක මඟින්ම Native Params සැකසීම
const dbUrl = new URL(rawUrl);
// 🌟 [FIX 2026-09-20] connection_limit 15→5: server admin ගේ per-project safe cap
// එකට (Cap 5) align කිරීම. Workers ගණනාවක් spawn වුනොත් (lsnode), මේ limit එක
// worker එකකට separate PrismaClient pool එකක් හැටියට apply වෙනවා නිසා,
// පරණ 15 එකෙන් worker 3ක් තිබ්බොත් 45ක් දක්වා connections claim වෙන්න පුළුවන් වුනා.
dbUrl.searchParams.set('connection_limit', '5');
dbUrl.searchParams.set('connect_timeout', '20');
// 🌟 [FIX 2026-09-20] pool_timeout 30→10: MySQL server config එකේ wait_timeout=30s
// ට වඩා අඩුවෙන් තියලා, Prisma pool එකෙන්ම idle connection එකක් 10s ට කලින්
// drop කරන්න සලස්වනවා — MySQL server එකෙන්ම ඒක "ERROR 2006 gone away" විදිහට
// kill කරන්න කලින්.
dbUrl.searchParams.set('pool_timeout', '10');

// 🌟 [FIXED 2026-09-20] Base PrismaClient instance එක. Singleton cache එකේ
// (globalForPrisma.prisma) මේ base client එකම cache වෙන්නේ — $connect/$disconnect
// වගේ connection-lifecycle methods තියෙන්නේ මේ base client එකේ, පහළින් $extends()
// කරන extended version එකේ නෙවෙයි.
const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl.toString(),
      },
    },
    // Heavy load එකකදී performance බැලීමට warnings පමණක් log කිරීම
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

// 🌟 [NEW FUNCTION 2026-09-20] Stale Connection Auto-Retry Extension
// MySQL server config එකේ wait_timeout=30s නිසා, Prisma pool එකේ idle
// connection එකක් server side එකෙන් kill වුනොත්, ඊළඟ query එකට ඒ dead
// connection එකම reuse කරන්න try කරද්දී "ERROR 2006 MySQL server has gone
// away" throw වෙනවා. මේ extension එකෙන් ඒ error එක catch කරලා, pool එක
// reconnect කරලා, එක වතාවක් automatic retry කරනවා.
// [FIXED 2026-09-20] Prisma 6.19 එකේ $use middleware API එක deprecated/removed
// කරලා තියෙන නිසා (Client Extensions API එකට migrate වෙලා), මේ logic එක
// $extends() එකෙන් query-level extension එකක් විදිහට implement කරලා තියෙනවා.
export const prisma = basePrisma.$extends({
  query: {
    async $allOperations({ operation, model, args, query }) {
      try {
        return await query(args);
      } catch (error: any) {
        const isConnectionLost =
          error?.message?.includes('MySQL server has gone away') ||
          error?.message?.includes('Connection lost') ||
          error?.code === 'P1017';

        if (isConnectionLost) {
          console.warn(`⚠️ [Prisma Retry] Stale connection detected for ${model}.${operation} — retrying once...`);
          await basePrisma.$disconnect();
          await basePrisma.$connect();
          return await query(args);
        }
        throw error;
      }
    },
  },
});

// Worker processes recycle වීමේදී memory leaks වැළැක්වීම සඳහා අනිවාර්ය Singleton Cache කිරීම
// [FIX 2026-09-20] basePrisma (raw client) එකම cache කරනවා — extended version
// එක නෙවෙයි, මොකද $connect/$disconnect තියෙන්නේ base client එකේ.
globalForPrisma.prisma = basePrisma;

let isConnected = false;

export function isDbConnected(): boolean {
  return isConnected;
}

// Server crash වීම වළක්වන Graceful DB Connection Handler
// [FIX 2026-09-20] basePrisma.$connect() call කරනවා — extended client එකෙන්
// නෙවෙයි, consistency සඳහා retry logic එකේ භාවිත කරන client එකම මෙතනත් use කරනවා.
export async function connectDB() {
  try {
    await basePrisma.$connect();
    isConnected = true;
    // [FIX 2026-09-20] Log message එකේ hardcode කරපු "Pool: 5, Timeout: 15s" කියන
    // text එක actual dbUrl.searchParams values වලට match වෙන්නේ නැති නිසා, debug
    // කරන කෙනෙක්ට confuse වුනා. දැන් actual applied values dynamically read කරනවා.
    console.log(`✅ [${dbUrl.pathname.replace(/^\//, '')}] Prisma Native Engine connected successfully (Pool: ${dbUrl.searchParams.get('connection_limit')}, PoolTimeout: ${dbUrl.searchParams.get('pool_timeout')}s)`);
  } catch (error) {
    isConnected = false;
    console.error('❌ Database connection queue timeout or failure:', error);
  }
}

export default prisma;