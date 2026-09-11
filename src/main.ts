import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import prisma from './lib/prisma.js';
import router from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';

const app = express();

app.set('trust proxy', 1);

const PORT = parseInt(process.env.PORT || '3002', 10);

// Support a comma-separated CORS_ORIGIN env value (e.g. "https://a.com,https://b.com")
// Previously a multi-origin env string was compared as a single string and always failed.
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://liyanage.ecosystemlk.app",
  "https://api.liyanage.ecosystemlk.app",
  "https://lbd.ecosystemlk.app",
  ...envOrigins,
];

// 🌐 [STANDARD EXPRESS CORS] Pure Express Level CORS Handling
app.use(cors({
  origin: (origin, callback) => {
    // Postman / Server-to-Server requests (no Origin header) or allowed origins → pass
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      // IMPORTANT: pass `false` instead of throwing an Error.
      // Throwing here sends the rejection to Express's default error
      // handler, which returns an HTML error page with NO CORS headers —
      // the browser then reports a generic "CORS error" that hides the
      // real 403 reason. Passing `false` makes the cors package itself
      // respond correctly (no CORS headers on that origin, as intended).
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));

// REMOVED: app.options('*', cors());
// A bare '*' wildcard route crashes at startup under path-to-regexp v6+
// (shipped with Express 4.21+ and all of Express 5). The cors() middleware
// mounted above already answers OPTIONS preflight requests automatically
// for every route — no separate handler is needed. If you're pinned to an
// older express/path-to-regexp and must add one explicitly, use a named
// wildcard instead: app.options('/*splat', cors());

// Body Parsers & Cookie Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Simple Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// API Routes & Error Handler
app.use('/api', router);
app.use(errorHandler);

// Pure Express Server Listener
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Bathware POS System API listening on port ${PORT}\n`);
  console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
});

// 🛡️ OpenLiteSpeed / PM2 Safe Graceful Shutdown Hook
let isShuttingDown = false;
function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[lsnode] Received ${signal}. Closing Express server and database gracefully...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('[lsnode] Database disconnected cleanly.');
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