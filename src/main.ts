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

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://liyanage.ecosystemlk.app",
  "https://api.liyanage.ecosystemlk.app",
  "https://lbd.ecosystemlk.app",
  process.env.CORS_ORIGIN || ""
].filter(Boolean);

// 🛡️ [FORCE CORS FIX] OpenLiteSpeed Preflight & Header Enforcement Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', 'https://lbd.ecosystemlk.app');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');

  // OPTIONS (Preflight) Requests සෘජුවම Response 204 දී නිම කිරීම
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Express Standard CORS Handling
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
}));

// Global Preflight Explicit Route Options
app.options('*', cors());

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