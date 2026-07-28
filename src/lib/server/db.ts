import "server-only";

/**
 * Camada de banco da sincronização.
 *
 * Dois destinos com a mesma interface, escolhidos pela `DATABASE_URL`:
 *   postgres://… ou postgresql://…  → Postgres (Supabase, Neon, RDS, o que for)
 *   file:./data/referencias.db      → SQLite pelo `node:sqlite` (zero dependência)
 *
 * Sem `DATABASE_URL` a sincronização simplesmente não existe: o app continua
 * funcionando 100% local, e as rotas de conta respondem 503 explicando isso.
 * Essa é a diferença entre "não configurado" e "quebrado".
 */

export type SqlValue = string | number | boolean | null | Uint8Array;

export interface Db {
  readonly dialect: "postgres" | "sqlite";
  /** Consulta com placeholders numerados no estilo Postgres: $1, $2, … */
  query<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  /** Roda `fn` numa transação; qualquer exceção faz rollback. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export class SyncNotConfiguredError extends Error {
  constructor() {
    super(
      "Sincronização não configurada. Defina DATABASE_URL para ligar as contas.",
    );
    this.name = "SyncNotConfiguredError";
  }
}

export function isSyncConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return Promise.reject(new SyncNotConfiguredError());

  if (!dbPromise) {
    dbPromise = (async () => {
      const db = url.startsWith("postgres://") || url.startsWith("postgresql://")
        ? await createPostgres(url)
        : await createSqlite(url);
      await migrate(db);
      return db;
    })().catch((error) => {
      // Não guardamos a promise falhada: a próxima requisição tenta de novo,
      // senão um banco que subiu 2s depois do app ficaria inacessível pra sempre.
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

/* ───────────────────────────────── Postgres ──────────────────────────────── */

async function createPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");

  const pool = new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
    // Provedores gerenciados (Supabase, Neon, Heroku) exigem TLS mas usam
    // certificado próprio; `localhost` roda sem TLS nenhum.
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
  });

  function wrap(runner: {
    query: (text: string, params?: SqlValue[]) => Promise<{ rows: unknown[] }>;
  }): Db {
    return {
      dialect: "postgres",
      async query<T>(sql: string, params: SqlValue[] = []) {
        const result = await runner.query(sql, params);
        return result.rows as T[];
      },
      async execute(sql: string, params: SqlValue[] = []) {
        await runner.query(sql, params);
      },
      async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(wrap(client));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      },
    };
  }

  return wrap(pool);
}

function needsSsl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get("sslmode") === "disable") return false;
    return !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/* ────────────────────────────────── SQLite ───────────────────────────────── */

async function createSqlite(url: string): Promise<Db> {
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdirSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");

  const path = resolve(url.replace(/^file:/, "") || "./data/referencias.db");
  mkdirSync(dirname(path), { recursive: true });

  const database = new DatabaseSync(path);
  // WAL deixa leitura e escrita concorrerem sem travar uma na outra.
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");

  // O SQLite usa ?1, ?2…; o resto do código fala Postgres, então traduzimos.
  const toSqlite = (sql: string) => sql.replace(/\$(\d+)/g, "?$1");

  const db: Db = {
    dialect: "sqlite",
    async query<T>(sql: string, params: SqlValue[] = []) {
      const statement = database.prepare(toSqlite(sql));
      return statement.all(...bind(params)) as T[];
    },
    async execute(sql: string, params: SqlValue[] = []) {
      const statement = database.prepare(toSqlite(sql));
      statement.run(...bind(params));
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn(db);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          /* já desfeita */
        }
        throw error;
      }
    },
  };

  return db;
}

/** node:sqlite não aceita boolean; viram 1/0. */
function bind(params: SqlValue[]) {
  return params.map((value) =>
    typeof value === "boolean" ? (value ? 1 : 0) : value,
  ) as (string | number | null | Uint8Array)[];
}

/* ───────────────────────────────── migrações ─────────────────────────────── */

/**
 * Uma migração só, idempotente. O schema é pequeno o bastante pra caber em
 * `CREATE TABLE IF NOT EXISTS`; quando crescer, vira uma tabela de versões.
 */
async function migrate(db: Db) {
  const bytes = db.dialect === "postgres" ? "bytea" : "blob";

  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
       id            text PRIMARY KEY,
       email         text NOT NULL UNIQUE,
       password_hash text NOT NULL,
       created_at    bigint NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS sessions (
       token      text PRIMARY KEY,
       user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       created_at bigint NOT NULL,
       expires_at bigint NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,

    // Contador monotônico por usuário: é ele que define o cursor de sync,
    // em vez do relógio, que varia de máquina pra máquina.
    `CREATE TABLE IF NOT EXISTS revisions (
       user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       value   bigint NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS boards (
       user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       id          text NOT NULL,
       name        text NOT NULL,
       emoji       text NOT NULL,
       color       text NOT NULL,
       description text,
       position    integer NOT NULL DEFAULT 0,
       created_at  bigint NOT NULL,
       updated_at  bigint NOT NULL,
       deleted_at  bigint,
       revision    bigint NOT NULL,
       PRIMARY KEY (user_id, id)
     )`,
    `CREATE INDEX IF NOT EXISTS boards_revision_idx ON boards(user_id, revision)`,

    `CREATE TABLE IF NOT EXISTS items (
       user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       id             text NOT NULL,
       kind           text NOT NULL,
       title          text NOT NULL,
       url            text,
       description    text,
       image_url      text,
       image_asset_id text,
       image_ratio    double precision,
       site_name      text,
       favicon_url    text,
       accent_color   text,
       board_ids      text NOT NULL DEFAULT '[]',
       tags           text NOT NULL DEFAULT '[]',
       colors         text NOT NULL DEFAULT '[]',
       notes          text,
       favorite       boolean NOT NULL DEFAULT false,
       created_at     bigint NOT NULL,
       updated_at     bigint NOT NULL,
       opened_at      bigint,
       deleted_at     bigint,
       revision       bigint NOT NULL,
       PRIMARY KEY (user_id, id)
     )`,
    `CREATE INDEX IF NOT EXISTS items_revision_idx ON items(user_id, revision)`,

    `CREATE TABLE IF NOT EXISTS assets (
       user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       id         text NOT NULL,
       mime       text NOT NULL,
       size       integer NOT NULL,
       data       ${bytes} NOT NULL,
       created_at bigint NOT NULL,
       PRIMARY KEY (user_id, id)
     )`,
  ];

  for (const statement of statements) {
    await db.execute(statement);
  }

  // Colunas acrescentadas depois da primeira versão. `CREATE TABLE IF NOT
  // EXISTS` não altera uma tabela que já existe, então cada uma é adicionada
  // à parte — e a falha por "já existe" é justamente o caso normal.
  await addColumn(db, "items", "colors", "text NOT NULL DEFAULT '[]'");
}

async function addColumn(db: Db, table: string, column: string, definition: string) {
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    // Postgres: "column ... already exists" · SQLite: "duplicate column name"
    if (message.includes("already exists") || message.includes("duplicate column")) return;
    throw error;
  }
}

/**
 * Próximo número de revisão do usuário. Todas as linhas gravadas num mesmo
 * push recebem o mesmo valor, então o cursor do cliente avança em blocos.
 */
export async function nextRevision(db: Db, userId: string): Promise<number> {
  const rows = await db.query<{ value: number | string }>(
    `INSERT INTO revisions (user_id, value) VALUES ($1, 1)
     ON CONFLICT (user_id) DO UPDATE SET value = revisions.value + 1
     RETURNING value`,
    [userId],
  );
  return Number(rows[0].value);
}
