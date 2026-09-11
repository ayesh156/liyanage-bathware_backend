import 'dotenv/config';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import prisma from './lib/prisma.js';
import router from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
// 🌟 [TEMP DISABLED] Live SSE Gateway - අවශ්‍ය වූ විට uncomment කරන්න
// import { syncRouter } from './gateways/checkoutSync.gateway.js';

const app = express();

app.set('trust proxy', 1);

// ── BULLETPROOF PRODUCTION CORS CONFIGURATION ────────────────
const allowedOrigins = [
  'https://lbd.ecosystemlk.app',
  'https://api.lbd.ecosystemlk.app',
  'https://liyanage.ecosystemlk.app',
  'https://api.liyanage.ecosystemlk.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3002',
  process.env.CORS_ORIGIN || ''
].filter(Boolean);

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
    // 1. Mobile apps, Server-to-server, curl හෝ same-origin (origin header නැති) requests allow කිරීම
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');
    const isAllowed = allowedOrigins.some(item => cleanOrigin === item.replace(/\/+$/, '')) ||
                      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin);

    if (isAllowed) {
      return callback(null, cleanOrigin);
    }

    // 2. Safe Fallback: කවදාවත් new Error() throw නොකර primary frontend echo කරයි
    return callback(null, 'https://lbd.ecosystemlk.app');
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // 24 hours preflight cache
}));

// Body Parsers & Cookie Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request Logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} → ${_res.statusCode} (${duration}ms)`);
  });
  next();
});

// 🌟 [TEMP DISABLED] /api/sync යටතේ SSE Routes ටික mount කිරීම
// app.use('/api/sync', syncRouter);

// API Routes
app.use('/api', router);

// Error Handler එකට කලින් CORS headers attach වන බව තහවුරු කිරීම (500 Error වලදී CORS drop වීම වැළැක්වීමට)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin.replace(/\/+$/, ''));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next(err);
});

// Default App Error Handler
app.use(errorHandler);

// Self Healing Routine
async function runSelfHealing(): Promise<void> {
  try {
    const damagedCustomers = await prisma.customer.findMany({
      where: { loanBalance: { lt: 0 } },
      select: { id: true, name: true, loanBalance: true },
    });
    if (damagedCustomers.length > 0) {
      for (const c of damagedCustomers) {
        await prisma.customer.update({
          where: { id: c.id },
          data: { loanBalance: 0, updatedAt: new Date() },
        });
      }
    }
  } catch (err) {
    console.error(`\n⚠️ Self-healing initialization failed:`, (err as Error).message);
  }
}

// ── HTTP Server & OpenLiteSpeed lsnode Dual Support ───────────
const httpServer = http.createServer(app);

// OpenLiteSpeed lsnode pipe socket සහ Local Port dual-support
const isLSNode = Boolean(process.env.LSAPI_CHILDREN);
const LISTEN_PORT = isLSNode ? undefined : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3002);

async function startServer() {
  if (LISTEN_PORT) {
    // Local / Standalone Mode
    httpServer.listen(LISTEN_PORT, () => {
      console.log(`\n🚀 Bathware POS System API listening on port ${LISTEN_PORT}\n`);
      runSelfHealing().catch((err) => console.error('Background self-healing error:', err));
    });
  } else {
    // OpenLiteSpeed Native Pipe Mode
    httpServer.listen(() => {
      console.log('🚀 Bathware POS System API started via OpenLiteSpeed lsnode pipe');
      runSelfHealing().catch((err) => console.error('Background self-healing error:', err));
    });
  }
}

startServer();

// 🛡️ OpenLiteSpeed (lsnode) Safe Graceful Shutdown Hook
let isShuttingDown = false;
function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[lsnode] Received ${signal}. Closing HTTP server and database gracefully...`);

  httpServer.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('[lsnode] Database disconnected. Exiting cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[lsnode] Error during database disconnect:', err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('[lsnode] Force exiting after 5s timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// Process Protection
process.on('unhandledRejection', (reason: any) => {
  console.error('[lsnode] Unhandled Promise Rejection trapped:', reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('[lsnode] Uncaught Exception trapped:', err);
});

export default app;