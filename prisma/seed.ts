import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient, ProductStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// const workspaceRoot = path.resolve(__dirname, '..', '..');
// const dataFilePath = path.join(workspaceRoot, 'data.txt');

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    process.env.DATABASE_URL || 'mysql://root:@localhost:3306/liyanage_bathware',
  ),
  log: ['warn', 'error'],
});

type ParsedCategory = {
  id: string;
  name: string;
  nameSinhala: string | null;
  sortOrder: number;
};

type ParsedProduct = {
  id: string;
  searchKey: string;
  name: string;
  nameSinhala: string | null;
  nameSi: string | null;
  productCategory: string;
  categoryId: string;
  categorySi: string | null;
  barcode: string | null;
  cost: number;
  lastPrice: number;
  salesPrice: number;
  displayPrice: number;
  storeQty: number;
  salesType: string;
  status: ProductStatus;
  isDeleted: boolean;
};

type ParsedDataset = {
  categories: ParsedCategory[];
  products: ParsedProduct[];
};

type PaymentDelegate = {
  deleteMany(args: Record<string, never>): Promise<unknown>;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseNumber(value: string): number {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) {
    return 0;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createProductId(index: number): string {
  return `lhd-pd-${String(index + 1).padStart(4, '0')}`;
}

function resolveStatus(): ProductStatus {
  return ProductStatus.Available;
}

async function parseDataset(): Promise<ParsedDataset> {
  const raw = await fs.readFile(dataFilePath, 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);

  const categories = new Map<string, ParsedCategory>();
  const products: ParsedProduct[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue;
    }

    const columns = line.split('\t');
    const searchKey = normalizeWhitespace(columns[0] ?? '');
    const name = normalizeWhitespace(columns[1] ?? '');
    const nameSinhala = normalizeWhitespace(columns[2] ?? '');
    const categoryName = normalizeWhitespace(columns[3] ?? '');
    const categorySinhala = normalizeWhitespace(columns[4] ?? '');

    if (!searchKey && !name && !categoryName) {
      continue;
    }

    if (!name || !categoryName) {
      continue;
    }

    const categoryId = slugify(categoryName);
    if (!categoryId) {
      continue;
    }

    if (!categories.has(categoryId)) {
      categories.set(categoryId, {
        id: categoryId,
        name: categoryName,
        nameSinhala: categorySinhala || null,
        sortOrder: categories.size,
      });
    }

    products.push({
      id: createProductId(products.length),
      searchKey: searchKey || name,
      name,
      nameSinhala: nameSinhala || null,
      nameSi: nameSinhala || null,
      productCategory: categoryName,
      categoryId,
      categorySi: categorySinhala || null,
      barcode: null,
      cost: parseNumber(columns[5] ?? ''),
      lastPrice: parseNumber(columns[6] ?? ''),
      salesPrice: parseNumber(columns[7] ?? ''),
      displayPrice: parseNumber(columns[8] ?? ''),
      storeQty: 0,
      salesType: 'Piece',
      status: resolveStatus(),
      isDeleted: false,
    });
  }

  return {
    categories: [...categories.values()],
    products,
  };
}

async function clearTransactionalAndInventoryData() {
  await prisma.$transaction(async (tx) => {
    const paymentModel = (tx as unknown as { payment?: PaymentDelegate }).payment;

    await tx.invoiceItem.deleteMany({});
    await tx.creditTransaction.deleteMany({});
    if (paymentModel) {
      await paymentModel.deleteMany({});
    }
    await tx.invoice.deleteMany({});
    await tx.product.deleteMany({});
    await tx.category.deleteMany({});
  });
}

async function seedCategories(categories: ParsedCategory[]) {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      create: {
        id: category.id,
        name: category.name,
        nameSinhala: category.nameSinhala,
        sortOrder: category.sortOrder,
        showInQuickInvoice: true,
      },
      update: {
        name: category.name,
        nameSinhala: category.nameSinhala,
        sortOrder: category.sortOrder,
        showInQuickInvoice: true,
      },
    });
  }
}

async function seedProducts(products: ParsedProduct[]) {
  const batchSize = 200;

  for (let index = 0; index < products.length; index += batchSize) {
    const batch = products.slice(index, index + batchSize);
    await prisma.product.createMany({ data: batch });
  }
}

/**
 * Seeds or resets default administrative and cashier users with exact plain credentials:
 * - Admin:   username: 'admin',   password: 'admin',   role: ADMIN
 * - Cashier: username: 'cashier', password: 'cashier', role: CASHIER
 */
async function seedDefaultUsers() {
  const saltRounds = 10;
  const defaultUsers = [
    {
      username: 'admin',
      name: 'admin', // allows login by name if auth service queries name
      email: 'admin@liyanagebathware.lk',
      password: await bcrypt.hash('admin', saltRounds),
      role: UserRole.ADMIN,
      active: true,
    },
    {
      username: 'cashier',
      name: 'cashier', // allows login by name if auth service queries name
      email: 'cashier@liyanagebathware.lk',
      password: await bcrypt.hash('cashier', saltRounds),
      role: UserRole.CASHIER,
      active: true,
    },
  ];

  for (const user of defaultUsers) {
    await prisma.user.upsert({
      where: { username: user.username },
      create: user,
      update: {
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        active: user.active,
      },
    });
  }
}

async function main() {
  console.log('Starting Prisma seed for Liyanage Bathware (Bypassing data.txt)...');

  // Seed default admin and cashier authentication credentials
  await seedDefaultUsers();
  console.log('Upserted default system users: admin & cashier.');

  console.log('Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });