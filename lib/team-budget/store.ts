import { getD1, getReceiptBucket } from "@/db";
import {
  conflict,
  forbidden,
  notFound,
  unauthorized,
  validationError,
} from "./errors";
import type {
  AvatarUpload,
  AvatarPreset,
  Balance,
  DashboardSummary,
  LedgerTransaction,
  Restaurant,
  RestaurantListItem,
  RestaurantStatus,
  Role,
  ReceiptUpload,
  TransactionMutationResult,
  TransactionType,
  User,
} from "./types";

type SqlValue = string | number | null;

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE";
  authProviderUserId: string | null;
  avatarObjectKey: string | null;
  avatarFileName: string | null;
  avatarContentType: string | null;
  avatarSize: number | null;
  avatarPreset: AvatarPreset | null;
  createdAt: string;
  updatedAt: string;
};

type RestaurantRow = {
  id: string;
  name: string;
  category: string | null;
  status: RestaurantStatus;
  memo: string | null;
  lowBalanceThreshold: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type BalanceRow = {
  restaurantId: string;
  currentAmount: number;
  totalAddedAmount: number;
  totalSpentAmount: number;
  version: number;
  lastTransactionId: string | null;
  updatedAt: string;
};

type TransactionRow = {
  id: string;
  restaurantId: string;
  userId: string;
  userName: string;
  type: TransactionType;
  amountDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  memo: string | null;
  usedAt: string | null;
  idempotencyKey: string;
  relatedTransactionId: string | null;
  receiptObjectKey: string | null;
  receiptFileName: string | null;
  receiptContentType: string | null;
  receiptSize: number | null;
  createdAt: string;
};

type JoinedRestaurantRow = RestaurantRow & BalanceRow;

type TransactionInput = {
  restaurantId: string;
  user: User;
  type: TransactionType;
  amountDelta: number;
  memo?: string;
  usedAt?: string;
  idempotencyKey: string;
  relatedTransactionId?: string | null;
  receipt?: ReceiptUpload | null;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    auth_provider_user_id TEXT UNIQUE,
    avatar_object_key TEXT,
    avatar_file_name TEXT,
    avatar_content_type TEXT,
    avatar_size INTEGER CHECK (avatar_size IS NULL OR avatar_size >= 0),
    avatar_preset TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
  )`,
  `CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    memo TEXT,
    low_balance_threshold INTEGER NOT NULL DEFAULT 50000 CHECK (low_balance_threshold >= 0),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
  )`,
  `CREATE TABLE IF NOT EXISTS restaurant_balances (
    restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
    current_amount INTEGER NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
    total_added_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_added_amount >= 0),
    total_spent_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_amount >= 0),
    version INTEGER NOT NULL DEFAULT 1,
    last_transaction_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    user_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('SPEND', 'TOP_UP', 'ADJUST', 'REVERSAL')),
    amount_delta INTEGER NOT NULL CHECK (amount_delta != 0),
    balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    memo TEXT,
    used_at TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    related_transaction_id TEXT REFERENCES transactions(id),
    receipt_object_key TEXT,
    receipt_file_name TEXT,
    receipt_content_type TEXT,
    receipt_size INTEGER CHECK (receipt_size IS NULL OR receipt_size >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
  )`,
  "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
  "CREATE INDEX IF NOT EXISTS idx_restaurants_status_name ON restaurants(status, name)",
  "CREATE INDEX IF NOT EXISTS idx_transactions_restaurant_created ON transactions(restaurant_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_transactions_type_created ON transactions(type, created_at)",
];

const DEFAULT_AVATAR_PRESET: AvatarPreset = "dragon";
const DEFAULT_AVATAR_URL = `/api/avatars/${DEFAULT_AVATAR_PRESET}`;
const avatarPresets = new Set<AvatarPreset>([
  "rat",
  "ox",
  "tiger",
  "rabbit",
  "dragon",
  "snake",
  "horse",
  "goat",
  "monkey",
  "rooster",
  "dog",
  "pig",
]);

let ensureDatabasePromise: Promise<void> | null = null;

const seedUsers: User[] = [
  {
    id: "u-admin",
    name: "김민지",
    email: "admin@team.local",
    role: "ADMIN",
    status: "ACTIVE",
    avatarUrl: DEFAULT_AVATAR_URL,
  },
  {
    id: "u-member",
    name: "이준호",
    email: "member@team.local",
    role: "MEMBER",
    status: "ACTIVE",
    avatarUrl: DEFAULT_AVATAR_URL,
  },
  {
    id: "u-member-2",
    name: "박서연",
    email: "seoyeon@team.local",
    role: "MEMBER",
    status: "ACTIVE",
    avatarUrl: DEFAULT_AVATAR_URL,
  },
];

const seedRestaurants: Restaurant[] = [
  {
    id: "r-101",
    name: "성수 한상",
    category: "한식",
    status: "ACTIVE",
    memo: "점심 회식과 외부 손님 식사에 주로 사용",
    lowBalanceThreshold: 120000,
    createdBy: "u-admin",
    createdAt: "2026-07-01 09:00",
    updatedAt: "2026-07-02 16:20",
  },
  {
    id: "r-102",
    name: "라멘 하루",
    category: "일식",
    status: "ACTIVE",
    memo: "팀원 개인 점심 사용 빈도 높음",
    lowBalanceThreshold: 80000,
    createdBy: "u-admin",
    createdAt: "2026-07-01 09:00",
    updatedAt: "2026-07-02 12:45",
  },
  {
    id: "r-103",
    name: "그린 델리",
    category: "샐러드",
    status: "ACTIVE",
    memo: "가벼운 점심과 야근 식대",
    lowBalanceThreshold: 70000,
    createdBy: "u-admin",
    createdAt: "2026-07-01 09:00",
    updatedAt: "2026-07-01 19:18",
  },
  {
    id: "r-104",
    name: "브루어스 커피",
    category: "카페",
    status: "ACTIVE",
    memo: "회의 음료와 간식",
    lowBalanceThreshold: 50000,
    createdBy: "u-admin",
    createdAt: "2026-07-01 09:00",
    updatedAt: "2026-07-02 10:10",
  },
];

const seedBalances: Balance[] = [
  {
    restaurantId: "r-101",
    currentAmount: 385000,
    totalAddedAmount: 700000,
    totalSpentAmount: 315000,
    version: 1,
    lastTransactionId: "t-9003",
    updatedAt: "2026-07-02 16:20",
  },
  {
    restaurantId: "r-102",
    currentAmount: 64000,
    totalAddedAmount: 350000,
    totalSpentAmount: 286000,
    version: 1,
    lastTransactionId: "t-9005",
    updatedAt: "2026-07-02 12:45",
  },
  {
    restaurantId: "r-103",
    currentAmount: 181000,
    totalAddedAmount: 260000,
    totalSpentAmount: 79000,
    version: 1,
    lastTransactionId: "t-9002",
    updatedAt: "2026-07-01 19:18",
  },
  {
    restaurantId: "r-104",
    currentAmount: 42000,
    totalAddedAmount: 160000,
    totalSpentAmount: 118000,
    version: 1,
    lastTransactionId: "t-9004",
    updatedAt: "2026-07-02 10:10",
  },
];

const seedTransactions: LedgerTransaction[] = [
  {
    id: "t-9005",
    restaurantId: "r-102",
    userId: "u-member",
    userName: "이준호",
    type: "SPEND",
    amountDelta: -28000,
    balanceBefore: 92000,
    balanceAfter: 64000,
    memo: "점심 식대",
    usedAt: "2026-07-02",
    idempotencyKey: "seed-t-9005",
    relatedTransactionId: null,
    receiptObjectKey: null,
    receiptFileName: null,
    receiptContentType: null,
    receiptSize: null,
    receiptUrl: null,
    createdAt: "2026-07-02 12:45",
  },
  {
    id: "t-9004",
    restaurantId: "r-104",
    userId: "u-member-2",
    userName: "박서연",
    type: "SPEND",
    amountDelta: -18000,
    balanceBefore: 60000,
    balanceAfter: 42000,
    memo: "회의 음료",
    usedAt: "2026-07-02",
    idempotencyKey: "seed-t-9004",
    relatedTransactionId: null,
    receiptObjectKey: null,
    receiptFileName: null,
    receiptContentType: null,
    receiptSize: null,
    receiptUrl: null,
    createdAt: "2026-07-02 10:10",
  },
  {
    id: "t-9003",
    restaurantId: "r-101",
    userId: "u-admin",
    userName: "김민지",
    type: "TOP_UP",
    amountDelta: 300000,
    balanceBefore: 85000,
    balanceAfter: 385000,
    memo: "7월 예산 추가",
    usedAt: "2026-07-01",
    idempotencyKey: "seed-t-9003",
    relatedTransactionId: null,
    receiptObjectKey: null,
    receiptFileName: null,
    receiptContentType: null,
    receiptSize: null,
    receiptUrl: null,
    createdAt: "2026-07-01 09:00",
  },
  {
    id: "t-9002",
    restaurantId: "r-103",
    userId: "u-member",
    userName: "이준호",
    type: "SPEND",
    amountDelta: -41000,
    balanceBefore: 222000,
    balanceAfter: 181000,
    memo: "야근 식대",
    usedAt: "2026-07-01",
    idempotencyKey: "seed-t-9002",
    relatedTransactionId: null,
    receiptObjectKey: null,
    receiptFileName: null,
    receiptContentType: null,
    receiptSize: null,
    receiptUrl: null,
    createdAt: "2026-07-01 19:18",
  },
  {
    id: "t-9001",
    restaurantId: "r-104",
    userId: "u-admin",
    userName: "김민지",
    type: "ADJUST",
    amountDelta: 12000,
    balanceBefore: 48000,
    balanceAfter: 60000,
    memo: "월말 정산 반영",
    usedAt: "2026-06-30",
    idempotencyKey: "seed-t-9001",
    relatedTransactionId: null,
    receiptObjectKey: null,
    receiptFileName: null,
    receiptContentType: null,
    receiptSize: null,
    receiptUrl: null,
    createdAt: "2026-06-30 18:00",
  },
];

function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatInKst(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    ...options,
  }).format(new Date());
}

function nowText() {
  return formatInKst({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function todayText() {
  return formatInKst({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeAvatarPreset(value?: string | null): AvatarPreset {
  return avatarPresets.has(value as AvatarPreset)
    ? (value as AvatarPreset)
    : DEFAULT_AVATAR_PRESET;
}

function avatarPresetUrl(value?: string | null) {
  return `/api/avatars/${normalizeAvatarPreset(value)}`;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    avatarUrl: row.avatarObjectKey
      ? `/api/users/${row.id}/avatar`
      : avatarPresetUrl(row.avatarPreset),
  };
}

function toRestaurant(row: RestaurantRow): Restaurant {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? "기타",
    status: row.status,
    memo: row.memo ?? "",
    lowBalanceThreshold: row.lowBalanceThreshold,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toBalance(row: BalanceRow): Balance {
  return {
    restaurantId: row.restaurantId,
    currentAmount: row.currentAmount,
    totalAddedAmount: row.totalAddedAmount,
    totalSpentAmount: row.totalSpentAmount,
    version: row.version,
    lastTransactionId: row.lastTransactionId,
    updatedAt: row.updatedAt,
  };
}

function toTransaction(row: TransactionRow): LedgerTransaction {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    userId: row.userId,
    userName: row.userName,
    type: row.type,
    amountDelta: row.amountDelta,
    balanceBefore: row.balanceBefore,
    balanceAfter: row.balanceAfter,
    memo: row.memo ?? "",
    usedAt: row.usedAt ?? "",
    idempotencyKey: row.idempotencyKey,
    relatedTransactionId: row.relatedTransactionId,
    receiptObjectKey: row.receiptObjectKey,
    receiptFileName: row.receiptFileName,
    receiptContentType: row.receiptContentType,
    receiptSize: row.receiptSize,
    receiptUrl: row.receiptObjectKey ? `/api/transactions/${row.id}/receipt` : null,
    createdAt: row.createdAt,
  };
}

function bindValues(values: SqlValue[]) {
  return values;
}

async function first<T>(sql: string, values: SqlValue[] = []) {
  const db = getD1();
  return db
    .prepare(sql)
    .bind(...bindValues(values))
    .first<T>();
}

async function all<T>(sql: string, values: SqlValue[] = []) {
  const db = getD1();
  const result = await db
    .prepare(sql)
    .bind(...bindValues(values))
    .all<T>();
  return result.results ?? [];
}

async function run(sql: string, values: SqlValue[] = []) {
  const db = getD1();
  return db
    .prepare(sql)
    .bind(...bindValues(values))
    .run();
}

async function batch(statements: { sql: string; values?: SqlValue[] }[]) {
  const db = getD1();
  return db.batch(
    statements.map((statement) =>
      db.prepare(statement.sql).bind(...bindValues(statement.values ?? [])),
    ),
  );
}

async function ensureDatabase() {
  if (ensureDatabasePromise) {
    return ensureDatabasePromise;
  }

  ensureDatabasePromise = initializeDatabase().catch((error) => {
    ensureDatabasePromise = null;
    throw error;
  });

  return ensureDatabasePromise;
}

async function initializeDatabase() {
  const db = getD1();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await ensureUserAvatarColumns();
  await ensureReceiptColumns();

  const userCount = await first<{ count: number }>(
    "SELECT COUNT(*) as count FROM users",
  );
  if ((userCount?.count ?? 0) > 0) {
    return;
  }

  await seedDatabase();
}

async function ensureUserAvatarColumns() {
  const columns = await all<{ name: string }>(
    `SELECT column_name as name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'`,
  );
  const columnNames = new Set(columns.map((column) => column.name));
  const missingStatements = [
    {
      name: "avatar_object_key",
      sql: "ALTER TABLE users ADD COLUMN avatar_object_key TEXT",
    },
    {
      name: "avatar_file_name",
      sql: "ALTER TABLE users ADD COLUMN avatar_file_name TEXT",
    },
    {
      name: "avatar_content_type",
      sql: "ALTER TABLE users ADD COLUMN avatar_content_type TEXT",
    },
    {
      name: "avatar_size",
      sql: "ALTER TABLE users ADD COLUMN avatar_size INTEGER",
    },
    {
      name: "avatar_preset",
      sql: "ALTER TABLE users ADD COLUMN avatar_preset TEXT",
    },
  ].filter((statement) => !columnNames.has(statement.name));

  if (missingStatements.length) {
    await batch(missingStatements);
  }
}

async function ensureReceiptColumns() {
  const columns = await all<{ name: string }>(
    `SELECT column_name as name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'`,
  );
  const columnNames = new Set(columns.map((column) => column.name));
  const missingStatements = [
    {
      name: "receipt_object_key",
      sql: "ALTER TABLE transactions ADD COLUMN receipt_object_key TEXT",
    },
    {
      name: "receipt_file_name",
      sql: "ALTER TABLE transactions ADD COLUMN receipt_file_name TEXT",
    },
    {
      name: "receipt_content_type",
      sql: "ALTER TABLE transactions ADD COLUMN receipt_content_type TEXT",
    },
    {
      name: "receipt_size",
      sql: "ALTER TABLE transactions ADD COLUMN receipt_size INTEGER",
    },
  ].filter((statement) => !columnNames.has(statement.name));

  if (missingStatements.length) {
    await batch(missingStatements);
  }
}

async function seedDatabase() {
  const statements: { sql: string; values?: SqlValue[] }[] = [];

  for (const user of seedUsers) {
    statements.push({
      sql: `INSERT INTO users (
        id, email, name, role, status, auth_provider_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      values: [user.id, user.email, user.name, user.role, user.status, nowText(), nowText()],
    });
  }

  for (const restaurant of seedRestaurants) {
    statements.push({
      sql: `INSERT INTO restaurants (
        id, name, category, status, memo, low_balance_threshold,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        restaurant.id,
        restaurant.name,
        restaurant.category,
        restaurant.status,
        restaurant.memo,
        restaurant.lowBalanceThreshold,
        restaurant.createdBy,
        restaurant.createdAt,
        restaurant.updatedAt,
      ],
    });
  }

  for (const balance of seedBalances) {
    statements.push({
      sql: `INSERT INTO restaurant_balances (
        restaurant_id, current_amount, total_added_amount, total_spent_amount,
        version, last_transaction_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      values: [
        balance.restaurantId,
        balance.currentAmount,
        balance.totalAddedAmount,
        balance.totalSpentAmount,
        balance.version,
        balance.lastTransactionId,
        balance.updatedAt,
      ],
    });
  }

  for (const transaction of [...seedTransactions].reverse()) {
    statements.push({
      sql: `INSERT INTO transactions (
        id, restaurant_id, user_id, user_name, type, amount_delta,
        balance_before, balance_after, memo, used_at, idempotency_key,
        related_transaction_id, receipt_object_key, receipt_file_name,
        receipt_content_type, receipt_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        transaction.id,
        transaction.restaurantId,
        transaction.userId,
        transaction.userName,
        transaction.type,
        transaction.amountDelta,
        transaction.balanceBefore,
        transaction.balanceAfter,
        transaction.memo,
        transaction.usedAt,
        transaction.idempotencyKey,
        transaction.relatedTransactionId,
        transaction.receiptObjectKey,
        transaction.receiptFileName,
        transaction.receiptContentType,
        transaction.receiptSize,
        transaction.createdAt,
      ],
    });
  }

  await batch(statements);
}

function ensureAdmin(user: User) {
  if (user.role !== "ADMIN") {
    throw forbidden();
  }
}

function ensureIdempotencyKey(idempotencyKey: string | undefined) {
  if (!idempotencyKey?.trim()) {
    throw validationError("idempotencyKey 값이 필요합니다.", {
      field: "idempotencyKey",
    });
  }
  return idempotencyKey.trim();
}

function safeImageFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function validateImageUpload(upload: ReceiptUpload | AvatarUpload, label: string) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const maxSize = 5 * 1024 * 1024;

  if (!allowedTypes.has(upload.contentType)) {
    throw validationError(`${label}은 JPG, PNG, WebP 이미지로 첨부해 주세요.`, {
      contentType: upload.contentType,
    });
  }
  if (upload.size > maxSize) {
    throw validationError(`${label} 이미지는 5MB 이하만 첨부할 수 있습니다.`, {
      size: upload.size,
      maxSize,
    });
  }
}

function validateReceipt(receipt: ReceiptUpload) {
  validateImageUpload(receipt, "영수증");
}

async function uploadReceipt(transactionId: string, receipt: ReceiptUpload) {
  validateReceipt(receipt);
  const safeName = safeImageFileName(receipt.fileName) || "receipt";
  const objectKey = `receipts/${transactionId}/${safeName}`;
  const bucket = getReceiptBucket();

  await bucket.put(objectKey, receipt.bytes, {
    httpMetadata: {
      contentType: receipt.contentType,
    },
    customMetadata: {
      fileName: safeName,
      transactionId,
    },
  });

  return {
    receiptObjectKey: objectKey,
    receiptFileName: safeName,
    receiptContentType: receipt.contentType,
    receiptSize: receipt.size,
  };
}

async function uploadAvatar(userId: string, avatar: AvatarUpload) {
  validateImageUpload(avatar, "프로필 사진");
  const safeName = safeImageFileName(avatar.fileName) || "avatar";
  const objectKey = `avatars/${userId}/${safeName}`;
  const bucket = getReceiptBucket();

  await bucket.put(objectKey, avatar.bytes, {
    httpMetadata: {
      contentType: avatar.contentType,
    },
    customMetadata: {
      fileName: safeName,
      userId,
    },
  });

  return {
    avatarObjectKey: objectKey,
    avatarFileName: safeName,
    avatarContentType: avatar.contentType,
    avatarSize: avatar.size,
  };
}

function isMissingStorageBucketError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("bucket not found") || message.includes("bucket_not_found");
}

async function getUserOrThrow(userId: string) {
  await ensureDatabase();
  const row = await first<UserRow>(
    `SELECT
      id, email, name, role, status,
      auth_provider_user_id as authProviderUserId,
      avatar_object_key as avatarObjectKey,
      avatar_file_name as avatarFileName,
      avatar_content_type as avatarContentType,
      avatar_size as avatarSize,
      avatar_preset as avatarPreset,
      created_at as createdAt,
      updated_at as updatedAt
    FROM users
    WHERE id = ?`,
    [userId],
  );
  if (!row || row.status !== "ACTIVE") {
    throw unauthorized("유효한 사용자를 찾을 수 없습니다.");
  }

  return toUser(row);
}

async function getRestaurantRowOrThrow(restaurantId: string) {
  await ensureDatabase();
  const row = await first<RestaurantRow>(
    `SELECT
      id, name, category, status, memo,
      low_balance_threshold as lowBalanceThreshold,
      created_by as createdBy,
      created_at as createdAt,
      updated_at as updatedAt
    FROM restaurants
    WHERE id = ?`,
    [restaurantId],
  );
  if (!row) {
    throw notFound("식당을 찾을 수 없습니다.");
  }
  return row;
}

async function getBalanceRowOrThrow(restaurantId: string) {
  await ensureDatabase();
  const row = await first<BalanceRow>(
    `SELECT
      restaurant_id as restaurantId,
      current_amount as currentAmount,
      total_added_amount as totalAddedAmount,
      total_spent_amount as totalSpentAmount,
      version,
      last_transaction_id as lastTransactionId,
      updated_at as updatedAt
    FROM restaurant_balances
    WHERE restaurant_id = ?`,
    [restaurantId],
  );
  if (!row) {
    throw notFound("식당 잔액을 찾을 수 없습니다.");
  }
  return row;
}

async function getTransactionRowById(transactionId: string) {
  await ensureDatabase();
  return first<TransactionRow>(
    `SELECT
      id,
      restaurant_id as restaurantId,
      user_id as userId,
      user_name as userName,
      type,
      amount_delta as amountDelta,
      balance_before as balanceBefore,
      balance_after as balanceAfter,
      memo,
      used_at as usedAt,
      idempotency_key as idempotencyKey,
      related_transaction_id as relatedTransactionId,
      receipt_object_key as receiptObjectKey,
      receipt_file_name as receiptFileName,
      receipt_content_type as receiptContentType,
      receipt_size as receiptSize,
      created_at as createdAt
    FROM transactions
    WHERE id = ?`,
    [transactionId],
  );
}

async function getTransactionRowByIdempotencyKey(idempotencyKey: string) {
  await ensureDatabase();
  return first<TransactionRow>(
    `SELECT
      id,
      restaurant_id as restaurantId,
      user_id as userId,
      user_name as userName,
      type,
      amount_delta as amountDelta,
      balance_before as balanceBefore,
      balance_after as balanceAfter,
      memo,
      used_at as usedAt,
      idempotency_key as idempotencyKey,
      related_transaction_id as relatedTransactionId,
      receipt_object_key as receiptObjectKey,
      receipt_file_name as receiptFileName,
      receipt_content_type as receiptContentType,
      receipt_size as receiptSize,
      created_at as createdAt
    FROM transactions
    WHERE idempotency_key = ?`,
    [idempotencyKey],
  );
}

async function addAuditLog(input: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
}) {
  await run(
    `INSERT INTO audit_logs (
      id, actor_user_id, action, target_type, target_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      createId("audit"),
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowText(),
    ],
  );
}

async function restaurantWithBalance(row: RestaurantRow): Promise<RestaurantListItem> {
  return {
    ...toRestaurant(row),
    balance: toBalance(await getBalanceRowOrThrow(row.id)),
  };
}

async function applyTransaction(
  input: TransactionInput,
): Promise<TransactionMutationResult> {
  await ensureDatabase();
  const idempotencyKey = ensureIdempotencyKey(input.idempotencyKey);
  const existing = await getTransactionRowByIdempotencyKey(idempotencyKey);

  if (existing) {
    return {
      transaction: toTransaction(existing),
      balance: toBalance(await getBalanceRowOrThrow(existing.restaurantId)),
    };
  }

  const restaurant = toRestaurant(await getRestaurantRowOrThrow(input.restaurantId));
  if (restaurant.status !== "ACTIVE") {
    throw validationError("비활성 식당에는 거래를 등록할 수 없습니다.");
  }
  if (!Number.isInteger(input.amountDelta) || input.amountDelta === 0) {
    throw validationError("거래 금액은 0이 아닌 정수여야 합니다.");
  }

  const balance = toBalance(await getBalanceRowOrThrow(input.restaurantId));
  const balanceBefore = balance.currentAmount;
  const balanceAfter = balanceBefore + input.amountDelta;

  if (balanceAfter < 0) {
    throw conflict("INSUFFICIENT_BALANCE", "잔액이 부족합니다.", {
      currentAmount: balanceBefore,
      requestedAmount: Math.abs(input.amountDelta),
    });
  }

  const now = nowText();
  const transaction: LedgerTransaction = {
    id: createId("t"),
    restaurantId: input.restaurantId,
    userId: input.user.id,
    userName: input.user.name,
    type: input.type,
    amountDelta: input.amountDelta,
    balanceBefore,
    balanceAfter,
    memo: input.memo?.trim() || input.type,
    usedAt: input.usedAt || todayText(),
    idempotencyKey,
    relatedTransactionId: input.relatedTransactionId ?? null,
    receiptObjectKey: null,
    receiptFileName: null,
    receiptContentType: null,
    receiptSize: null,
    receiptUrl: null,
    createdAt: now,
  };
  const receiptMetadata = input.receipt
    ? await uploadReceipt(transaction.id, input.receipt)
    : null;

  if (receiptMetadata) {
    transaction.receiptObjectKey = receiptMetadata.receiptObjectKey;
    transaction.receiptFileName = receiptMetadata.receiptFileName;
    transaction.receiptContentType = receiptMetadata.receiptContentType;
    transaction.receiptSize = receiptMetadata.receiptSize;
    transaction.receiptUrl = `/api/transactions/${transaction.id}/receipt`;
  }

  const totalAddedDelta = input.type === "TOP_UP" ? input.amountDelta : 0;
  const totalSpentDelta = input.type === "SPEND" ? Math.abs(input.amountDelta) : 0;

  try {
    await batch([
      {
        sql: `UPDATE restaurant_balances
          SET current_amount = ?,
              total_added_amount = total_added_amount + ?,
              total_spent_amount = total_spent_amount + ?,
              version = version + 1,
              last_transaction_id = ?,
              updated_at = ?
          WHERE restaurant_id = ? AND version = ? AND current_amount = ?`,
        values: [
          balanceAfter,
          totalAddedDelta,
          totalSpentDelta,
          transaction.id,
          now,
          input.restaurantId,
          balance.version,
          balanceBefore,
        ],
      },
      {
        sql: `INSERT INTO transactions (
          id, restaurant_id, user_id, user_name, type, amount_delta,
          balance_before, balance_after, memo, used_at, idempotency_key,
          related_transaction_id, receipt_object_key, receipt_file_name,
          receipt_content_type, receipt_size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          transaction.id,
          transaction.restaurantId,
          transaction.userId,
          transaction.userName,
          transaction.type,
          transaction.amountDelta,
          transaction.balanceBefore,
          transaction.balanceAfter,
          transaction.memo,
          transaction.usedAt,
          transaction.idempotencyKey,
          transaction.relatedTransactionId,
          transaction.receiptObjectKey,
          transaction.receiptFileName,
          transaction.receiptContentType,
          transaction.receiptSize,
          transaction.createdAt,
        ],
      },
      {
        sql: "UPDATE restaurants SET updated_at = ? WHERE id = ?",
        values: [now, input.restaurantId],
      },
    ]);
  } catch (error) {
    if (receiptMetadata?.receiptObjectKey) {
      await getReceiptBucket().delete(receiptMetadata.receiptObjectKey).catch(() => {});
    }
    throw error;
  }

  const updatedBalance = toBalance(await getBalanceRowOrThrow(input.restaurantId));
  if (updatedBalance.lastTransactionId !== transaction.id) {
    throw conflict("BALANCE_LOCKED", "잔액 갱신 충돌이 발생했습니다.");
  }

  await addAuditLog({
    actorUserId: input.user.id,
    action: `TRANSACTION_${input.type}`,
    targetType: "transactions",
    targetId: transaction.id,
    metadata: {
      restaurantId: input.restaurantId,
      amountDelta: input.amountDelta,
      balanceBefore,
      balanceAfter,
    },
  });

  return {
    transaction,
    balance: updatedBalance,
  };
}

export async function getCurrentUser(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerUserId = authorization?.startsWith("Bearer demo:")
    ? authorization.replace("Bearer demo:", "")
    : null;
  const headerUserId = request.headers.get("x-demo-user-id");
  const userId = bearerUserId || headerUserId;

  if (!userId) {
    throw unauthorized();
  }

  return getUserOrThrow(userId);
}

export async function requireAdmin(request: Request) {
  const user = await getCurrentUser(request);
  ensureAdmin(user);
  return user;
}

export async function loginUser(input: { email?: string; name?: string }) {
  await ensureDatabase();
  const email = input.email?.trim().toLowerCase();
  const name = input.name?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError("계정 이메일을 입력해 주세요.", { field: "email" });
  }
  if (!name) {
    throw validationError("이름을 입력해 주세요.", { field: "name" });
  }

  const row = await first<UserRow>(
    `SELECT
      id, email, name, role, status,
      auth_provider_user_id as authProviderUserId,
      avatar_object_key as avatarObjectKey,
      avatar_file_name as avatarFileName,
      avatar_content_type as avatarContentType,
      avatar_size as avatarSize,
      avatar_preset as avatarPreset,
      created_at as createdAt,
      updated_at as updatedAt
    FROM users
    WHERE LOWER(email) = LOWER(?)
    ORDER BY created_at ASC
    LIMIT 1`,
    [email],
  );

  if (!row || row.status !== "ACTIVE") {
    throw unauthorized("로그인할 수 있는 사용자를 찾을 수 없습니다.");
  }

  const user = toUser(row);
  return {
    accessToken: `demo:${user.id}`,
    user,
  };
}

export async function signupUser(input: {
  name?: string;
  email?: string;
  avatar?: AvatarUpload | null;
  avatarPreset?: string | null;
}) {
  await ensureDatabase();

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();

  if (!name) {
    throw validationError("이름을 입력해 주세요.", { field: "name" });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError("올바른 이메일을 입력해 주세요.", { field: "email" });
  }

  const existing = await first<{ id: string }>(
    "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
    [email],
  );
  if (existing) {
    throw conflict("EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.", {
      field: "email",
    });
  }

  const now = nowText();
  const avatarPreset = normalizeAvatarPreset(input.avatarPreset);
  const user: User = {
    id: createId("u"),
    name,
    email,
    role: "MEMBER",
    status: "ACTIVE",
    avatarUrl: avatarPresetUrl(avatarPreset),
  };
  let avatarMetadata: Awaited<ReturnType<typeof uploadAvatar>> | null = null;
  if (input.avatar) {
    try {
      avatarMetadata = await uploadAvatar(user.id, input.avatar);
    } catch (error) {
      if (!isMissingStorageBucketError(error)) {
        throw error;
      }
    }
  }

  if (avatarMetadata) {
    user.avatarUrl = `/api/users/${user.id}/avatar`;
  }

  try {
    await batch([
      {
        sql: `INSERT INTO users (
          id, email, name, role, status, auth_provider_user_id,
          avatar_object_key, avatar_file_name, avatar_content_type, avatar_size,
          avatar_preset,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          user.id,
          user.email,
          user.name,
          user.role,
          user.status,
          avatarMetadata?.avatarObjectKey ?? null,
          avatarMetadata?.avatarFileName ?? null,
          avatarMetadata?.avatarContentType ?? null,
          avatarMetadata?.avatarSize ?? null,
          avatarPreset,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO audit_logs (
          id, actor_user_id, action, target_type, target_id, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        values: [
          createId("audit"),
          user.id,
          "USER_SIGNUP",
          "users",
          user.id,
          JSON.stringify({
            email: user.email,
            hasAvatar: Boolean(avatarMetadata),
            avatarPreset,
          }),
          now,
        ],
      },
    ]);
  } catch (error) {
    if (avatarMetadata?.avatarObjectKey) {
      await getReceiptBucket().delete(avatarMetadata.avatarObjectKey).catch(() => {});
    }
    throw error;
  }

  return {
    accessToken: `demo:${user.id}`,
    user,
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await ensureDatabase();
  const rows = await all<JoinedRestaurantRow>(
    `SELECT
      r.id,
      r.name,
      r.category,
      r.status,
      r.memo,
      r.low_balance_threshold as lowBalanceThreshold,
      r.created_by as createdBy,
      r.created_at as createdAt,
      r.updated_at as updatedAt,
      b.restaurant_id as restaurantId,
      b.current_amount as currentAmount,
      b.total_added_amount as totalAddedAmount,
      b.total_spent_amount as totalSpentAmount,
      b.version,
      b.last_transaction_id as lastTransactionId,
      b.updated_at as updatedAt
    FROM restaurants r
    JOIN restaurant_balances b ON b.restaurant_id = r.id
    WHERE r.status = 'ACTIVE'
    ORDER BY r.name ASC`,
  );
  const restaurants = rows.map((row) => ({
    ...toRestaurant(row),
    balance: toBalance(row),
  }));
  const totalBalance = restaurants.reduce(
    (total, restaurant) => total + restaurant.balance.currentAmount,
    0,
  );
  const totalSpent = restaurants.reduce(
    (total, restaurant) => total + restaurant.balance.totalSpentAmount,
    0,
  );
  const recentTransactions = await allTransactions({
    limit: 10,
    order: "DESC",
  });

  return {
    totalBalance,
    totalSpent,
    restaurants,
    recentTransactions,
  };
}

export async function listRestaurants(input: {
  q?: string | null;
  status?: RestaurantStatus | null;
}) {
  await ensureDatabase();
  const clauses: string[] = [];
  const values: SqlValue[] = [];

  if (input.status) {
    clauses.push("r.status = ?");
    values.push(input.status);
  }
  if (input.q?.trim()) {
    clauses.push("(LOWER(r.name) LIKE ? OR LOWER(COALESCE(r.category, '')) LIKE ?)");
    const query = `%${input.q.trim().toLowerCase()}%`;
    values.push(query, query);
  }

  const rows = await all<JoinedRestaurantRow>(
    `SELECT
      r.id,
      r.name,
      r.category,
      r.status,
      r.memo,
      r.low_balance_threshold as lowBalanceThreshold,
      r.created_by as createdBy,
      r.created_at as createdAt,
      r.updated_at as updatedAt,
      b.restaurant_id as restaurantId,
      b.current_amount as currentAmount,
      b.total_added_amount as totalAddedAmount,
      b.total_spent_amount as totalSpentAmount,
      b.version,
      b.last_transaction_id as lastTransactionId,
      b.updated_at as updatedAt
    FROM restaurants r
    JOIN restaurant_balances b ON b.restaurant_id = r.id
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY r.name ASC`,
    values,
  );
  const items = rows.map((row) => ({
    ...toRestaurant(row),
    balance: toBalance(row),
  }));

  return { items, total: items.length };
}

export async function getRestaurant(id: string) {
  const restaurant = toRestaurant(await getRestaurantRowOrThrow(id));
  const balance = toBalance(await getBalanceRowOrThrow(id));

  return { restaurant, balance };
}

export async function createRestaurant(
  requestUser: User,
  input: {
    name?: string;
    category?: string;
    initialAmount?: number;
    memo?: string;
  },
) {
  ensureAdmin(requestUser);
  await ensureDatabase();

  const name = input.name?.trim();
  const initialAmount = input.initialAmount ?? 0;
  if (!name) {
    throw validationError("식당명이 필요합니다.", { field: "name" });
  }
  if (!Number.isInteger(initialAmount) || initialAmount < 0) {
    throw validationError("초기 금액은 0 이상의 정수여야 합니다.", {
      field: "initialAmount",
    });
  }

  const now = nowText();
  const restaurant: Restaurant = {
    id: createId("r"),
    name,
    category: input.category?.trim() || "기타",
    status: "ACTIVE",
    memo: input.memo?.trim() || "관리자가 추가한 식당",
    lowBalanceThreshold: 50000,
    createdBy: requestUser.id,
    createdAt: now,
    updatedAt: now,
  };

  await batch([
    {
      sql: `INSERT INTO restaurants (
        id, name, category, status, memo, low_balance_threshold,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        restaurant.id,
        restaurant.name,
        restaurant.category,
        restaurant.status,
        restaurant.memo,
        restaurant.lowBalanceThreshold,
        restaurant.createdBy,
        restaurant.createdAt,
        restaurant.updatedAt,
      ],
    },
    {
      sql: `INSERT INTO restaurant_balances (
        restaurant_id, current_amount, total_added_amount, total_spent_amount,
        version, last_transaction_id, updated_at
      ) VALUES (?, 0, 0, 0, 1, NULL, ?)`,
      values: [restaurant.id, now],
    },
  ]);

  let transaction: LedgerTransaction | null = null;
  if (initialAmount > 0) {
    const result = await applyTransaction({
      restaurantId: restaurant.id,
      user: requestUser,
      type: "TOP_UP",
      amountDelta: initialAmount,
      memo: "초기 금액",
      usedAt: todayText(),
      idempotencyKey: createId("initial"),
    });
    transaction = result.transaction;
  }

  await addAuditLog({
    actorUserId: requestUser.id,
    action: "RESTAURANT_CREATE",
    targetType: "restaurants",
    targetId: restaurant.id,
    metadata: { name: restaurant.name, initialAmount },
  });

  return {
    restaurant: await restaurantWithBalance(await getRestaurantRowOrThrow(restaurant.id)),
    transaction,
  };
}

export async function updateRestaurant(
  requestUser: User,
  id: string,
  input: {
    name?: string;
    category?: string;
    status?: RestaurantStatus;
    memo?: string;
  },
) {
  ensureAdmin(requestUser);
  const current = toRestaurant(await getRestaurantRowOrThrow(id));
  const next = {
    ...current,
    name: input.name !== undefined ? input.name.trim() : current.name,
    category:
      input.category !== undefined ? input.category.trim() || "기타" : current.category,
    status: input.status ?? current.status,
    memo: input.memo !== undefined ? input.memo.trim() : current.memo,
    updatedAt: nowText(),
  };

  if (!next.name) {
    throw validationError("식당명이 필요합니다.", { field: "name" });
  }

  await run(
    `UPDATE restaurants
    SET name = ?, category = ?, status = ?, memo = ?, updated_at = ?
    WHERE id = ?`,
    [next.name, next.category, next.status, next.memo, next.updatedAt, id],
  );
  await addAuditLog({
    actorUserId: requestUser.id,
    action: "RESTAURANT_UPDATE",
    targetType: "restaurants",
    targetId: id,
    metadata: { before: current, after: next },
  });

  return { restaurant: await restaurantWithBalance(await getRestaurantRowOrThrow(id)) };
}

export async function deleteRestaurant(requestUser: User, id: string) {
  ensureAdmin(requestUser);
  const currentRow = await getRestaurantRowOrThrow(id);
  const current = toRestaurant(currentRow);
  const balance = toBalance(await getBalanceRowOrThrow(id));
  if (current.status === "INACTIVE") {
    return { restaurant: { ...current, balance } };
  }

  const updatedAt = nowText();
  await run("UPDATE restaurants SET status = 'INACTIVE', updated_at = ? WHERE id = ?", [
    updatedAt,
    id,
  ]);

  const after = {
    ...current,
    status: "INACTIVE" as RestaurantStatus,
    updatedAt,
  };
  await addAuditLog({
    actorUserId: requestUser.id,
    action: "RESTAURANT_DELETE",
    targetType: "restaurants",
    targetId: id,
    metadata: { before: current, after },
  });

  return { restaurant: { ...after, balance } };
}

export async function listRestaurantTransactions(restaurantId: string) {
  await getRestaurantRowOrThrow(restaurantId);
  const items = await allTransactions({ restaurantId });
  return { items, total: items.length };
}

async function allTransactions(input: {
  restaurantId?: string | null;
  userId?: string | null;
  type?: TransactionType | "ALL" | null;
  limit?: number;
  order?: "ASC" | "DESC";
}) {
  const clauses: string[] = [];
  const values: SqlValue[] = [];
  if (input.restaurantId) {
    clauses.push("restaurant_id = ?");
    values.push(input.restaurantId);
  }
  if (input.userId) {
    clauses.push("user_id = ?");
    values.push(input.userId);
  }
  if (input.type && input.type !== "ALL") {
    clauses.push("type = ?");
    values.push(input.type);
  }
  const limit = input.limit ? `LIMIT ${input.limit}` : "";
  const rows = await all<TransactionRow>(
    `SELECT
      id,
      restaurant_id as restaurantId,
      user_id as userId,
      user_name as userName,
      type,
      amount_delta as amountDelta,
      balance_before as balanceBefore,
      balance_after as balanceAfter,
      memo,
      used_at as usedAt,
      idempotency_key as idempotencyKey,
      related_transaction_id as relatedTransactionId,
      receipt_object_key as receiptObjectKey,
      receipt_file_name as receiptFileName,
      receipt_content_type as receiptContentType,
      receipt_size as receiptSize,
      created_at as createdAt
    FROM transactions
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY created_at ${input.order ?? "DESC"}, id DESC
    ${limit}`,
    values,
  );

  return rows.map(toTransaction);
}

export async function listTransactions(input: {
  requestUser: User;
  restaurantId?: string | null;
  userId?: string | null;
  type?: TransactionType | "ALL" | null;
}) {
  const userId = input.requestUser.role === "ADMIN" ? input.userId : input.requestUser.id;
  const items = await allTransactions({
    restaurantId: input.restaurantId,
    userId,
    type: input.type,
  });
  return { items, total: items.length };
}

export async function spendRestaurant(
  requestUser: User,
  restaurantId: string,
  input: {
    amount: number;
    usedAt?: string;
    memo?: string;
    idempotencyKey?: string;
    receipt?: ReceiptUpload | null;
  },
) {
  return applyTransaction({
    restaurantId,
    user: requestUser,
    type: "SPEND",
    amountDelta: -Math.abs(input.amount),
    memo: input.memo,
    usedAt: input.usedAt,
    idempotencyKey: ensureIdempotencyKey(input.idempotencyKey),
    receipt: input.receipt,
  });
}

export async function getTransactionReceipt(requestUser: User, transactionId: string) {
  const transaction = await getTransactionRowById(transactionId);
  if (!transaction) {
    throw notFound("거래를 찾을 수 없습니다.");
  }
  if (requestUser.role !== "ADMIN" && transaction.userId !== requestUser.id) {
    throw forbidden("영수증을 조회할 권한이 없습니다.");
  }
  if (!transaction.receiptObjectKey) {
    throw notFound("첨부된 영수증이 없습니다.");
  }

  const receipt = await getReceiptBucket().get(transaction.receiptObjectKey);
  if (!receipt) {
    throw notFound("영수증 파일을 찾을 수 없습니다.");
  }

  return {
    body: receipt.body,
    fileName: transaction.receiptFileName ?? "receipt",
    contentType: transaction.receiptContentType ?? "application/octet-stream",
  };
}

export async function getUserAvatar(userId: string) {
  await ensureDatabase();
  const row = await first<UserRow>(
    `SELECT
      id, email, name, role, status,
      auth_provider_user_id as authProviderUserId,
      avatar_object_key as avatarObjectKey,
      avatar_file_name as avatarFileName,
      avatar_content_type as avatarContentType,
      avatar_size as avatarSize,
      avatar_preset as avatarPreset,
      created_at as createdAt,
      updated_at as updatedAt
    FROM users
    WHERE id = ?`,
    [userId],
  );

  if (!row || row.status !== "ACTIVE") {
    throw notFound("사용자를 찾을 수 없습니다.");
  }
  if (!row.avatarObjectKey) {
    throw notFound("등록된 프로필 사진이 없습니다.");
  }

  const avatar = await getReceiptBucket().get(row.avatarObjectKey);
  if (!avatar) {
    throw notFound("프로필 사진 파일을 찾을 수 없습니다.");
  }

  return {
    body: avatar.body,
    fileName: row.avatarFileName ?? "avatar",
    contentType: row.avatarContentType ?? "application/octet-stream",
  };
}

export async function topUpRestaurant(
  requestUser: User,
  restaurantId: string,
  input: {
    amount: number;
    memo?: string;
    idempotencyKey?: string;
  },
) {
  ensureAdmin(requestUser);
  return applyTransaction({
    restaurantId,
    user: requestUser,
    type: "TOP_UP",
    amountDelta: Math.abs(input.amount),
    memo: input.memo,
    usedAt: todayText(),
    idempotencyKey: ensureIdempotencyKey(input.idempotencyKey),
  });
}

export async function adjustRestaurant(
  requestUser: User,
  restaurantId: string,
  input: {
    amountDelta: number;
    memo?: string;
    idempotencyKey?: string;
  },
) {
  ensureAdmin(requestUser);
  return applyTransaction({
    restaurantId,
    user: requestUser,
    type: "ADJUST",
    amountDelta: input.amountDelta,
    memo: input.memo,
    usedAt: todayText(),
    idempotencyKey: ensureIdempotencyKey(input.idempotencyKey),
  });
}

export async function voidTransaction(
  requestUser: User,
  transactionId: string,
  input: { reason?: string; idempotencyKey?: string },
) {
  const isAdminVoid = requestUser.role === "ADMIN";
  const original = await getTransactionRowById(transactionId);
  if (!original) {
    throw notFound("거래를 찾을 수 없습니다.");
  }
  const isOwnSpendVoid =
    original.type === "SPEND" && original.userId === requestUser.id;
  if (!isAdminVoid && !isOwnSpendVoid) {
    throw forbidden("본인이 등록한 사용 내역만 삭제할 수 있습니다.");
  }
  if (original.type === "REVERSAL") {
    throw validationError("취소 거래는 다시 취소할 수 없습니다.");
  }
  const reversal = await first<{ id: string }>(
    "SELECT id FROM transactions WHERE type = 'REVERSAL' AND related_transaction_id = ?",
    [original.id],
  );
  if (reversal) {
    throw conflict("IDEMPOTENCY_CONFLICT", "이미 취소된 거래입니다.");
  }

  return applyTransaction({
    restaurantId: original.restaurantId,
    user: requestUser,
    type: "REVERSAL",
    amountDelta: -original.amountDelta,
    memo: input.reason || `거래 취소: ${original.memo ?? ""}`,
    usedAt: todayText(),
    idempotencyKey: ensureIdempotencyKey(input.idempotencyKey),
    relatedTransactionId: original.id,
  });
}

export async function listUsers(requestUser: User) {
  ensureAdmin(requestUser);
  await ensureDatabase();
  const rows = await all<UserRow>(
    `SELECT
      id, email, name, role, status,
      auth_provider_user_id as authProviderUserId,
      avatar_object_key as avatarObjectKey,
      avatar_file_name as avatarFileName,
      avatar_content_type as avatarContentType,
      avatar_size as avatarSize,
      avatar_preset as avatarPreset,
      created_at as createdAt,
      updated_at as updatedAt
    FROM users
    WHERE status = 'ACTIVE'
    ORDER BY created_at ASC`,
  );
  const items = rows.map(toUser);
  return { items, total: items.length };
}

export async function updateUserRole(requestUser: User, userId: string, role: Role) {
  ensureAdmin(requestUser);
  if (role !== "ADMIN" && role !== "MEMBER") {
    throw validationError("role 값은 ADMIN 또는 MEMBER여야 합니다.", {
      field: "role",
    });
  }
  const before = await getUserOrThrow(userId);
  await run("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", [
    role,
    nowText(),
    userId,
  ]);
  const after = await getUserOrThrow(userId);
  await addAuditLog({
    actorUserId: requestUser.id,
    action: "USER_ROLE_UPDATE",
    targetType: "users",
    targetId: userId,
    metadata: { before, after },
  });

  return { user: after };
}

export async function deleteUser(requestUser: User, userId: string) {
  ensureAdmin(requestUser);
  if (requestUser.id === userId) {
    throw forbidden("본인 계정은 삭제할 수 없습니다.");
  }

  const before = await getUserOrThrow(userId);
  await run("UPDATE users SET status = 'INACTIVE', updated_at = ? WHERE id = ?", [
    nowText(),
    userId,
  ]);
  const after: User = { ...before, status: "INACTIVE" };

  await addAuditLog({
    actorUserId: requestUser.id,
    action: "USER_DELETE",
    targetType: "users",
    targetId: userId,
    metadata: { before, after },
  });

  return { user: after };
}
