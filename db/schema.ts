import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: text("role", { enum: ["ADMIN", "MEMBER"] }).notNull(),
    status: text("status", { enum: ["ACTIVE", "INACTIVE"] }).notNull(),
    authProviderUserId: text("auth_provider_user_id").unique(),
    avatarObjectKey: text("avatar_object_key"),
    avatarFileName: text("avatar_file_name"),
    avatarContentType: text("avatar_content_type"),
    avatarSize: integer("avatar_size"),
    avatarPreset: text("avatar_preset"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  },
  (table) => [
    index("idx_users_email").on(table.email),
    check("users_role_check", sql`${table.role} IN ('ADMIN', 'MEMBER')`),
    check("users_status_check", sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
    check(
      "users_avatar_size_check",
      sql`${table.avatarSize} IS NULL OR ${table.avatarSize} >= 0`,
    ),
  ],
);

export const restaurants = pgTable(
  "restaurants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category"),
    status: text("status", { enum: ["ACTIVE", "INACTIVE"] }).notNull(),
    memo: text("memo"),
    lowBalanceThreshold: integer("low_balance_threshold")
      .notNull()
      .default(50000),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  },
  (table) => [
    index("idx_restaurants_status_name").on(table.status, table.name),
    check(
      "restaurants_status_check",
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`,
    ),
    check(
      "restaurants_low_balance_threshold_check",
      sql`${table.lowBalanceThreshold} >= 0`,
    ),
  ],
);

export const restaurantBalances = pgTable(
  "restaurant_balances",
  {
    restaurantId: text("restaurant_id")
      .primaryKey()
      .references(() => restaurants.id),
    currentAmount: integer("current_amount").notNull().default(0),
    totalAddedAmount: integer("total_added_amount").notNull().default(0),
    totalSpentAmount: integer("total_spent_amount").notNull().default(0),
    version: integer("version").notNull().default(1),
    lastTransactionId: text("last_transaction_id"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  },
  (table) => [
    check("restaurant_balances_current_amount_check", sql`${table.currentAmount} >= 0`),
    check(
      "restaurant_balances_total_added_amount_check",
      sql`${table.totalAddedAmount} >= 0`,
    ),
    check(
      "restaurant_balances_total_spent_amount_check",
      sql`${table.totalSpentAmount} >= 0`,
    ),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    userName: text("user_name").notNull(),
    type: text("type", {
      enum: ["SPEND", "TOP_UP", "ADJUST", "REVERSAL"],
    }).notNull(),
    amountDelta: integer("amount_delta").notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    memo: text("memo"),
    usedAt: text("used_at"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    relatedTransactionId: text("related_transaction_id"),
    receiptObjectKey: text("receipt_object_key"),
    receiptFileName: text("receipt_file_name"),
    receiptContentType: text("receipt_content_type"),
    receiptSize: integer("receipt_size"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  },
  (table) => [
    index("idx_transactions_restaurant_created").on(
      table.restaurantId,
      table.createdAt,
    ),
    index("idx_transactions_user_created").on(table.userId, table.createdAt),
    index("idx_transactions_type_created").on(table.type, table.createdAt),
    check(
      "transactions_type_check",
      sql`${table.type} IN ('SPEND', 'TOP_UP', 'ADJUST', 'REVERSAL')`,
    ),
    check("transactions_amount_delta_check", sql`${table.amountDelta} != 0`),
    check("transactions_balance_before_check", sql`${table.balanceBefore} >= 0`),
    check("transactions_balance_after_check", sql`${table.balanceAfter} >= 0`),
  ],
);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
});
