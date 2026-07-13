import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { createLocalDatabaseClient, createLocalReceiptBucket } from "./local";

export type QueryValue = string | number | boolean | null;

type QueryResult<T> = {
  results?: T[];
};

type QueryExecutor = {
  unsafe: (query: string, parameters?: QueryValue[]) => Promise<Record<string, unknown>[]>;
};

export type PreparedStatement = {
  bind: (...values: QueryValue[]) => PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<QueryResult<T>>;
  run: () => Promise<unknown>;
};

export type DatabaseClient = {
  prepare: (sql: string) => PreparedStatement;
  batch: (statements: PreparedStatement[]) => Promise<unknown[]>;
};

export type R2ObjectLike = {
  body: BodyInit;
};

export type R2BucketLike = {
  put: (
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectLike | null>;
  delete: (key: string) => Promise<unknown>;
};

class PostgresStatement implements PreparedStatement {
  private values: QueryValue[];

  constructor(private readonly rawSql: string, values: QueryValue[] = []) {
    this.values = values;
  }

  bind(...values: QueryValue[]) {
    return new PostgresStatement(this.rawSql, values);
  }

  async first<T>() {
    const rows = await this.execute(getQueryClient());
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T>() {
    const rows = await this.execute(getQueryClient());
    return { results: rows as T[] };
  }

  async run() {
    return this.execute(getQueryClient());
  }

  execute(executor: QueryExecutor) {
    const { sql, values } = toPostgresQuery(this.rawSql, this.values);
    return executor.unsafe(sql, values);
  }
}

let queryClient: postgres.Sql | null = null;
let supabaseAdmin: SupabaseClient | null = null;
let localDatabaseClient: DatabaseClient | null = null;

function getDatabaseUrl() {
  const url = getConfiguredDatabaseUrl();
  if (!url) {
    throw new Error(
      "Postgres connection URL is required. Set DATABASE_URL or use the Vercel Supabase POSTGRES_URL integration variable.",
    );
  }
  return url;
}

function getConfiguredDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

function getQueryClient() {
  if (!queryClient) {
    queryClient = postgres(getDatabaseUrl(), {
      max: 3,
      prepare: false,
      ssl: "require",
    });
  }
  return queryClient;
}

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Storage.",
      );
    }

    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}

function getStorageBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "receipts";
}

function getStorageErrorStatus(error: unknown) {
  if (typeof error === "object" && error && "statusCode" in error) {
    return Number((error as { statusCode?: string | number }).statusCode);
  }
  return undefined;
}

function getStorageErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

function isMissingStorageBucketError(error: unknown) {
  const message = getStorageErrorMessage(error);
  return (
    getStorageErrorStatus(error) === 404 ||
    message.includes("bucket not found") ||
    message.includes("bucket_not_found")
  );
}

function isExistingStorageBucketError(error: unknown) {
  const message = getStorageErrorMessage(error);
  return message.includes("already exists") || message.includes("already_exist");
}

async function ensureStorageBucket(bucketName: string) {
  const { error } = await getSupabaseAdmin().storage.createBucket(bucketName, {
    public: false,
  });

  if (error && !isExistingStorageBucketError(error)) {
    throw error;
  }
}

function shouldUseLocalFallback() {
  return !getConfiguredDatabaseUrl() && process.env.VERCEL !== "1";
}

function quoteCamelCaseAliases(sql: string) {
  return sql.replace(
    /\bas\s+([A-Za-z_][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g,
    'as "$1"',
  );
}

function toPostgresQuery(sql: string, values: QueryValue[]) {
  let index = 0;
  const translatedSql = quoteCamelCaseAliases(sql).replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });

  return {
    sql: translatedSql,
    values,
  };
}

export function getDb() {
  return drizzle(getQueryClient(), { schema });
}

export function getD1(): DatabaseClient {
  if (shouldUseLocalFallback()) {
    localDatabaseClient ??= createLocalDatabaseClient();
    return localDatabaseClient;
  }

  return {
    prepare(sql: string) {
      return new PostgresStatement(sql);
    },
    async batch(statements: PreparedStatement[]) {
      const pgStatements = statements as PostgresStatement[];
      return getQueryClient().begin(async (transaction) => {
        const results: unknown[] = [];
        for (const statement of pgStatements) {
          results.push(await statement.execute(transaction));
        }
        return results;
      });
    },
  };
}

export function getReceiptBucket(): R2BucketLike {
  if ((!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.VERCEL !== "1") {
    return createLocalReceiptBucket();
  }

  return {
    async put(key, value, options) {
      const bucketName = getStorageBucketName();
      const upload = () =>
        getSupabaseAdmin()
          .storage
          .from(bucketName)
          .upload(key, value, {
            contentType: options?.httpMetadata?.contentType,
            metadata: options?.customMetadata,
            upsert: true,
          });

      let { error } = await upload();
      if (error && isMissingStorageBucketError(error)) {
        await ensureStorageBucket(bucketName);
        ({ error } = await upload());
      }

      if (error) {
        throw error;
      }
    },
    async get(key) {
      const { data, error } = await getSupabaseAdmin()
        .storage
        .from(getStorageBucketName())
        .download(key);

      if (error) {
        const statusCode =
          "statusCode" in error ? Number(error.statusCode) : undefined;
        if (statusCode === 404 || error.message.toLowerCase().includes("not found")) {
          return null;
        }
        throw error;
      }

      return data ? { body: data } : null;
    },
    async delete(key) {
      const { error } = await getSupabaseAdmin()
        .storage
        .from(getStorageBucketName())
        .remove([key]);

      if (error) {
        throw error;
      }
    },
  };
}
