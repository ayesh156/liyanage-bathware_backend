import express from 'express'
import cors from 'cors'
import cookieParser from "cookie-parser";
import dotenv from 'dotenv'
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fileUpload from 'express-fileupload'

import CustomerRoute from './routes/customer.routes.js'
import VehicleRoute from './routes/vehicle.routes.js'
import ServiceRoute from './routes/service.routes.js'
import BranchRout from './routes/branch.routes.js'
import LabourRoute from './routes/labour.routes.js'
import SupplierRoutes from './routes/supplier.routes.js'
import SupplierReturnRoutes from './routes/supplierReturn.routes.js'
import ProductRoutes from './routes/product.routes.js'

import { ProtectRoutes } from './middlewares/ProtectRoute.js'
import { LabourLogin, Logout, resetPassword, SendOTP, verifyOTP } from './controllers/labours.controller.js'
import { RefreshToken } from './middlewares/VerifyRefreshToken.js'
import GRNRout from './routes/grn.routes.js';
import StockRoutes from './routes/stock.routes.js';
import AuditLogRoutes from "./routes/auditlog.routes.js";
import AppointmentRoute from './routes/appointment.routes.js';
import InvoiceRoute from './routes/invoice.routes.js';
import { asyncLocalStorage } from './lib/context.js';
import path from "path";
import { fileURLToPath } from "url";

import dailyPaymentsRoute from './routes/dailyPayments.routes.js';
import PosRouter from './routes/posInvoice.route.js';
import CustomerRetunrouter from './routes/customerReturn.route.js';
import DashboardRoute from './routes/dashboard.routes.js';
import WarrantyRoute from './routes/warranty.routes.js';
import AttendanceRoutes from './routes/attendance.routes.js';
import SalaryRoute from './routes/salary.routes.js';
import { CreateBooking } from './controllers/bokking.controller.js';
import BookingRout from './routes/booking.routes.js';
import ReportRoute from './routes/report.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config()
const app = express()

app.set("trust proxy", 1);

// ----------------------------------------------------
// 1. CORS SETUP (HELMET එකට පෙර තිබිය යුතුය)
// ----------------------------------------------------
const allowedOrigins = [
  "https://lbd.ecosystemlk.app",
  "https://api.lbd.ecosystemlk.app",
  "https://vishadamotors.roxeleye.com",
  "https://web.vishadamotors.roxeleye.com",
  "http://localhost:5173",
  "http://localhost:5174"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS Not Allowed'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

// Preflight Request explicit response handler
app.options('*', cors());

// ----------------------------------------------------
// 2. HELMET & PARSERS
// ----------------------------------------------------
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  helmet({
    contentSecurityPolicy: false, // CORS Cross-origin සමඟ Security policy එකක් Block වීම වැලැක්වීමට
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);

// ----------------------------------------------------
// 3. RATE LIMITERS
// ----------------------------------------------------
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => "global",
  message: {
    success: false,
    message: "Too many requests. Please try again later."
  }
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 10 minutes."
  }
});

// ----------------------------------------------------
// 4. PUBLIC AUTH ROUTES
// ----------------------------------------------------
app.post('/api/labour/auth/login', loginLimiter, LabourLogin);
app.put('/api/labour/auth/send-otp', loginLimiter, SendOTP);
app.put('/api/labour/auth/verify-otp', loginLimiter, verifyOTP);
app.put('/api/labour/auth/reset-password', loginLimiter, resetPassword);
app.post('/api/labour/auth/logout', Logout);
app.post('/api/labour/auth/refresh', RefreshToken);

app.use(limiter);

// ----------------------------------------------------
// 5. PROTECTED ROUTES & MIDDLEWARES
// ----------------------------------------------------
app.use(ProtectRoutes);

app.use((req, res, next) => {
  asyncLocalStorage.run(
    {
      id: req.user?.id,
      ipAddress: req.headers["x-forwarded-for"]?.split(",")[0] || null + "-" + req.ip,
      macAddress: req.headers["x-mac"] || null,
    },
    () => {
      next();
    }
  );
});

app.use('/api/dashboard', DashboardRoute)
app.use('/api/attendance', AttendanceRoutes)
app.use('/api/labour', LabourRoute)
app.use('/api/customer', CustomerRoute)
app.use('/api/vehicle', VehicleRoute)
app.use('/api/service', ServiceRoute)
app.use('/api/branch', BranchRout)
app.use('/api/supplier', SupplierRoutes);
app.use('/api/supplier-returns', SupplierReturnRoutes);
app.use('/api/product', ProductRoutes);
app.use('/api/grn', GRNRout);
app.use('/api/stock', StockRoutes);
app.use('/api/appointment', AppointmentRoute);
app.use('/api/invoice', InvoiceRoute);
app.use('/api/pos-invoice', PosRouter);
app.use('/api/auditlog', AuditLogRoutes);
app.use('/api/dailypayments', dailyPaymentsRoute);
app.use('/api/customer-return', CustomerRetunrouter);
app.use('/api/warranty', WarrantyRoute);
app.use('/api/salary', SalaryRoute);
app.use('/api/booking', BookingRout);
app.use('/api/report', ReportRoute);

app.use('/api', (req, res) => {
  return res.status(404).json({
    success: false,
    message: "API is not found",
  })
});

// Static Files & React Frontend Serve
app.use(express.static(path.join(__dirname, 'view', 'Admin', 'dist')));

app.use('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'view', 'Admin', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });