import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  DatabaseClient,
  PreparedStatement,
  QueryValue,
  R2BucketLike,
} from "./index";

type LocalRow = Record<string, QueryValue>;
type TableName =
  | "users"
  | "restaurants"
  | "restaurant_balances"
  | "transactions"
  | "audit_logs"
  | "app_settings";

type LocalData = {
  version: 1;
  tables: Record<TableName, LocalRow[]>;
};

const tableColumns: Record<TableName, string[]> = {
  users: [
    "id",
    "email",
    "name",
    "role",
    "status",
    "auth_provider_user_id",
    "avatar_object_key",
    "avatar_file_name",
    "avatar_content_type",
    "avatar_size",
    "avatar_preset",
    "created_at",
    "updated_at",
  ],
  restaurants: [
    "id",
    "name",
    "category",
    "status",
    "memo",
    "low_balance_threshold",
    "created_by",
    "created_at",
    "updated_at",
  ],
  restaurant_balances: [
    "restaurant_id",
    "current_amount",
    "total_added_amount",
    "total_spent_amount",
    "version",
    "last_transaction_id",
    "updated_at",
  ],
  transactions: [
    "id",
    "restaurant_id",
    "user_id",
    "user_name",
    "type",
    "amount_delta",
    "balance_before",
    "balance_after",
    "memo",
    "used_at",
    "idempotency_key",
    "related_transaction_id",
    "receipt_object_key",
    "receipt_file_name",
    "receipt_content_type",
    "receipt_size",
    "created_at",
  ],
  audit_logs: [
    "id",
    "actor_user_id",
    "action",
    "target_type",
    "target_id",
    "metadata",
    "created_at",
  ],
  app_settings: ["key", "value", "updated_by", "updated_at"],
};

const dataDir = resolve(process.cwd(), ".data");
const databasePath = join(dataDir, "team-budget-local-db.json");
const storageDir = join(dataDir, "storage");

let localData: LocalData | null = null;

class LocalStatement implements PreparedStatement {
  private values: QueryValue[];

  constructor(private readonly rawSql: string, values: QueryValue[] = []) {
    this.values = values;
  }

  bind(...values: QueryValue[]) {
    return new LocalStatement(this.rawSql, values);
  }

  async first<T>() {
    const rows = executeLocalSql(this.rawSql, this.values);
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: executeLocalSql(this.rawSql, this.values) as T[] };
  }

  async run() {
    return executeLocalSql(this.rawSql, this.values);
  }
}

export function createLocalDatabaseClient(): DatabaseClient {
  return {
    prepare(sql) {
      return new LocalStatement(sql);
    },
    async batch(statements) {
      const before = cloneData(getLocalData());
      try {
        const results: unknown[] = [];
        for (const statement of statements as LocalStatement[]) {
          results.push(await statement.run());
        }
        return results;
      } catch (error) {
        localData = before;
        saveLocalData();
        throw error;
      }
    },
  };
}

export function createLocalReceiptBucket(): R2BucketLike {
  return {
    async put(key, value) {
      const path = localObjectPath(key);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(value));
    },
    async get(key) {
      const path = localObjectPath(key);
      if (!existsSync(path)) {
        return null;
      }
      return { body: new Blob([readFileSync(path)]) };
    },
    async delete(key) {
      const path = localObjectPath(key);
      if (existsSync(path)) {
        unlinkSync(path);
      }
    },
  };
}

function createEmptyData(): LocalData {
  return {
    version: 1,
    tables: {
      users: [],
      restaurants: [],
      restaurant_balances: [],
      transactions: [],
      audit_logs: [],
      app_settings: [],
    },
  };
}

function getLocalData() {
  if (localData) {
    return localData;
  }

  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(databasePath)) {
    localData = createEmptyData();
    saveLocalData();
    return localData;
  }

  localData = JSON.parse(readFileSync(databasePath, "utf8")) as LocalData;
  for (const tableName of Object.keys(tableColumns) as TableName[]) {
    localData.tables[tableName] ??= [];
  }
  return localData;
}

function cloneData(data: LocalData): LocalData {
  return JSON.parse(JSON.stringify(data)) as LocalData;
}

function saveLocalData() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(databasePath, JSON.stringify(getLocalData(), null, 2));
}

function executeLocalSql(sql: string, values: QueryValue[]) {
  const normalized = normalizeSql(sql);
  if (
    normalized.startsWith("create table") ||
    normalized.startsWith("create index")
  ) {
    return [];
  }

  if (normalized.startsWith("alter table")) {
    executeAlter(sql);
    return [];
  }

  if (normalized.startsWith("insert into")) {
    executeInsert(sql, values);
    return [];
  }

  if (normalized.startsWith("update")) {
    executeUpdate(normalized, values);
    return [];
  }

  if (normalized.startsWith("select")) {
    return executeSelect(normalized, values);
  }

  throw new Error(`Unsupported local SQL: ${sql}`);
}

function executeAlter(sql: string) {
  const match = sql.match(/alter table\s+([a-z_]+)\s+add column\s+([a-z_]+)/i);
  if (!match) {
    return;
  }
  const table = match[1] as TableName;
  const column = match[2];
  if (!tableColumns[table].includes(column)) {
    tableColumns[table].push(column);
  }
  for (const row of getLocalData().tables[table]) {
    row[column] ??= null;
  }
  saveLocalData();
}

function executeInsert(sql: string, values: QueryValue[]) {
  const match = sql.match(
    /insert into\s+([a-z_]+)\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)/i,
  );
  if (!match) {
    throw new Error(`Unsupported local INSERT: ${sql}`);
  }

  const table = match[1] as TableName;
  const columns = splitComma(match[2]).map((column) => column.trim());
  const tokens = splitComma(match[3]);
  const row: LocalRow = Object.fromEntries(
    tableColumns[table].map((column) => [column, null]),
  );
  let valueIndex = 0;

  columns.forEach((column, index) => {
    const token = tokens[index]?.trim() ?? "NULL";
    if (token === "?") {
      row[column] = values[valueIndex++] ?? null;
    } else {
      row[column] = literalValue(token);
    }
  });

  getLocalData().tables[table].push(row);
  saveLocalData();
}

function executeUpdate(sql: string, values: QueryValue[]) {
  const data = getLocalData();

  if (sql.startsWith("update restaurant_balances")) {
    const [
      currentAmount,
      totalAddedDelta,
      totalSpentDelta,
      lastTransactionId,
      updatedAt,
      restaurantId,
      version,
      balanceBefore,
    ] = values;
    const row = data.tables.restaurant_balances.find(
      (balance) =>
        balance.restaurant_id === restaurantId &&
        balance.version === version &&
        balance.current_amount === balanceBefore,
    );
    if (row) {
      row.current_amount = Number(currentAmount);
      row.total_added_amount =
        Number(row.total_added_amount ?? 0) + Number(totalAddedDelta ?? 0);
      row.total_spent_amount =
        Number(row.total_spent_amount ?? 0) + Number(totalSpentDelta ?? 0);
      row.version = Number(row.version ?? 0) + 1;
      row.last_transaction_id = lastTransactionId;
      row.updated_at = updatedAt;
    }
    saveLocalData();
    return;
  }

  if (sql.startsWith("update restaurants set name")) {
    const [name, category, status, memo, updatedAt, id] = values;
    updateById("restaurants", id, {
      name,
      category,
      status,
      memo,
      updated_at: updatedAt,
    });
    return;
  }

  if (sql.startsWith("update restaurants set status = 'inactive'")) {
    const [updatedAt, id] = values;
    updateById("restaurants", id, {
      status: "INACTIVE",
      updated_at: updatedAt,
    });
    return;
  }

  if (sql.startsWith("update restaurants set updated_at")) {
    const [updatedAt, id] = values;
    updateById("restaurants", id, { updated_at: updatedAt });
    return;
  }

  if (sql.startsWith("update users set role")) {
    const [role, updatedAt, id] = values;
    updateById("users", id, { role, updated_at: updatedAt });
    return;
  }

  if (sql.startsWith("update users set email")) {
    const [email, updatedAt, id] = values;
    updateById("users", id, {
      email,
      ...(sql.includes("status = 'inactive'") ? { status: "INACTIVE" } : {}),
      updated_at: updatedAt,
    });
    return;
  }

  if (sql.startsWith("update users set status = 'inactive'")) {
    const [updatedAt, id] = values;
    updateById("users", id, { status: "INACTIVE", updated_at: updatedAt });
    return;
  }

  if (sql.startsWith("update app_settings set value")) {
    const [value, updatedBy, updatedAt, key] = values;
    updateByKey("app_settings", key, {
      value,
      updated_by: updatedBy,
      updated_at: updatedAt,
    });
    return;
  }

  throw new Error(`Unsupported local UPDATE: ${sql}`);
}

function executeSelect(sql: string, values: QueryValue[]) {
  if (sql.includes("from information_schema.columns")) {
    const table = sql.match(/table_name = '([a-z_]+)'/)?.[1] as TableName;
    return tableColumns[table].map((name) => ({ name }));
  }

  if (sql.includes("count(*) as count from users")) {
    return [{ count: getLocalData().tables.users.length }];
  }

  if (sql.includes("from restaurants r join restaurant_balances b")) {
    return selectRestaurantsWithBalances(sql, values);
  }

  if (sql.includes("from users")) {
    return selectUsers(sql, values);
  }

  if (sql.includes("from app_settings")) {
    return selectAppSettings(sql, values);
  }

  if (sql.includes("from restaurants")) {
    return selectRestaurants(sql, values);
  }

  if (sql.includes("from restaurant_balances")) {
    return selectBalances(sql, values);
  }

  if (sql.includes("from transactions")) {
    return selectTransactions(sql, values);
  }

  throw new Error(`Unsupported local SELECT: ${sql}`);
}

function selectUsers(sql: string, values: QueryValue[]) {
  let rows = [...getLocalData().tables.users];
  if (sql.includes("where id = ?")) {
    rows = rows.filter((row) => row.id === values[0]);
  } else if (sql.includes("where status = 'active'")) {
    rows = rows.filter((row) => row.status === "ACTIVE");
  } else if (sql.includes("where email = ?")) {
    rows = rows.filter((row) => row.email === values[0]);
  } else if (sql.includes("where role = ?")) {
    rows = rows.filter((row) => row.role === values[0]);
  } else if (sql.includes("where lower(email) = lower(?)")) {
    rows = rows.filter(
      (row) =>
        String(row.email).toLowerCase() === String(values[0]).toLowerCase(),
    );
  }

  rows = applyCreatedAtOrderAndLimit(sql, rows);
  if (/select\s+id\s+from users/i.test(sql)) {
    return rows.map((row) => ({ id: row.id }));
  }
  return rows.map(toUserResult);
}

function selectAppSettings(sql: string, values: QueryValue[]) {
  let rows = [...getLocalData().tables.app_settings];
  if (sql.includes("where key = ?")) {
    rows = rows.filter((row) => row.key === values[0]);
  }
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));
}

function selectRestaurants(sql: string, values: QueryValue[]) {
  let rows = [...getLocalData().tables.restaurants];
  if (sql.includes("where id = ?")) {
    rows = rows.filter((row) => row.id === values[0]);
  }
  return rows.map(toRestaurantResult);
}

function selectBalances(sql: string, values: QueryValue[]) {
  let rows = [...getLocalData().tables.restaurant_balances];
  if (sql.includes("where restaurant_id = ?")) {
    rows = rows.filter((row) => row.restaurant_id === values[0]);
  }
  return rows.map(toBalanceResult);
}

function selectRestaurantsWithBalances(sql: string, values: QueryValue[]) {
  let valueIndex = 0;
  let rows = getLocalData().tables.restaurants.map((restaurant) => {
    const balance = getLocalData().tables.restaurant_balances.find(
      (item) => item.restaurant_id === restaurant.id,
    );
    return { restaurant, balance };
  }).filter((row) => row.balance);

  if (sql.includes("r.status = 'active'")) {
    rows = rows.filter((row) => row.restaurant.status === "ACTIVE");
  }
  if (sql.includes("r.status = ?")) {
    const status = values[valueIndex++];
    rows = rows.filter((row) => row.restaurant.status === status);
  }
  if (sql.includes("lower(r.name) like ?")) {
    const query = String(values[valueIndex++] ?? "").replaceAll("%", "");
    valueIndex += 1;
    rows = rows.filter((row) => {
      const name = String(row.restaurant.name).toLowerCase();
      const category = String(row.restaurant.category ?? "").toLowerCase();
      return name.includes(query) || category.includes(query);
    });
  }

  return rows
    .sort((a, b) => String(a.restaurant.name).localeCompare(String(b.restaurant.name)))
    .map(({ restaurant, balance }) => ({
      ...toRestaurantResult(restaurant),
      ...toBalanceResult(balance as LocalRow),
    }));
}

function selectTransactions(sql: string, values: QueryValue[]) {
  let valueIndex = 0;
  let rows = [...getLocalData().tables.transactions];

  if (sql.includes("where id = ?")) {
    rows = rows.filter((row) => row.id === values[valueIndex++]);
  } else if (sql.includes("where idempotency_key = ?")) {
    rows = rows.filter((row) => row.idempotency_key === values[valueIndex++]);
  } else if (
    sql.includes("type = 'reversal'") &&
    sql.includes("related_transaction_id = ?")
  ) {
    rows = rows.filter(
      (row) =>
        row.type === "REVERSAL" &&
        row.related_transaction_id === values[valueIndex++],
    );
  } else {
    if (sql.includes("restaurant_id = ?")) {
      rows = rows.filter((row) => row.restaurant_id === values[valueIndex++]);
    }
    if (sql.includes("user_id = ?")) {
      rows = rows.filter((row) => row.user_id === values[valueIndex++]);
    }
    if (sql.includes("type = ?")) {
      rows = rows.filter((row) => row.type === values[valueIndex++]);
    }
  }

  rows = applyTransactionOrderAndLimit(sql, rows);
  if (/select\s+id\s+from transactions/i.test(sql)) {
    return rows.map((row) => ({ id: row.id }));
  }
  return rows.map(toTransactionResult);
}

function applyCreatedAtOrderAndLimit(sql: string, rows: LocalRow[]) {
  const next = [...rows];
  if (sql.includes("order by created_at asc")) {
    next.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }
  return applyLimit(sql, next);
}

function applyTransactionOrderAndLimit(sql: string, rows: LocalRow[]) {
  const next = [...rows];
  if (sql.includes("order by created_at")) {
    const direction = sql.includes("order by created_at asc") ? 1 : -1;
    next.sort((a, b) => {
      const dateCompare = String(a.created_at).localeCompare(String(b.created_at));
      if (dateCompare !== 0) {
        return dateCompare * direction;
      }
      return String(b.id).localeCompare(String(a.id));
    });
  }
  return applyLimit(sql, next);
}

function applyLimit(sql: string, rows: LocalRow[]) {
  const limit = Number(sql.match(/limit\s+(\d+)/)?.[1] ?? 0);
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function updateById(table: TableName, id: QueryValue | undefined, patch: LocalRow) {
  const row = getLocalData().tables[table].find((item) => item.id === id);
  if (row) {
    Object.assign(row, patch);
    saveLocalData();
  }
}

function updateByKey(table: TableName, key: QueryValue | undefined, patch: LocalRow) {
  const row = getLocalData().tables[table].find((item) => item.key === key);
  if (row) {
    Object.assign(row, patch);
    saveLocalData();
  }
}

function toUserResult(row: LocalRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    authProviderUserId: row.auth_provider_user_id,
    avatarObjectKey: row.avatar_object_key,
    avatarFileName: row.avatar_file_name,
    avatarContentType: row.avatar_content_type,
    avatarSize: row.avatar_size,
    avatarPreset: row.avatar_preset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRestaurantResult(row: LocalRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    memo: row.memo,
    lowBalanceThreshold: row.low_balance_threshold,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBalanceResult(row: LocalRow) {
  return {
    restaurantId: row.restaurant_id,
    currentAmount: row.current_amount,
    totalAddedAmount: row.total_added_amount,
    totalSpentAmount: row.total_spent_amount,
    version: row.version,
    lastTransactionId: row.last_transaction_id,
    updatedAt: row.updated_at,
  };
}

function toTransactionResult(row: LocalRow) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    userId: row.user_id,
    userName: row.user_name,
    type: row.type,
    amountDelta: row.amount_delta,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    memo: row.memo,
    usedAt: row.used_at,
    idempotencyKey: row.idempotency_key,
    relatedTransactionId: row.related_transaction_id,
    receiptObjectKey: row.receipt_object_key,
    receiptFileName: row.receipt_file_name,
    receiptContentType: row.receipt_content_type,
    receiptSize: row.receipt_size,
    createdAt: row.created_at,
  };
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitComma(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function literalValue(token: string): QueryValue {
  if (/^null$/i.test(token)) {
    return null;
  }
  if (/^-?\d+$/.test(token)) {
    return Number(token);
  }
  const quoted = token.match(/^['"](.*)['"]$/);
  if (quoted) {
    return quoted[1];
  }
  return null;
}

function localObjectPath(key: string) {
  const segments = key
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));
  return join(storageDir, ...segments);
}
