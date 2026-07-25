import "server-only";

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getDb, type Db } from "./db";

/**
 * Contas por e-mail e senha, com sessão em cookie httpOnly.
 *
 * É um acervo pessoal, então não há OAuth, times nem papéis: o único objetivo
 * do login é dizer de quem são as referências que estão sendo sincronizadas.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEY_BYTES = 64;
export const SESSION_COOKIE = "referencias_session";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface User {
  id: string;
  email: string;
}

/* ─────────────────────────────── senhas ──────────────────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_BYTES);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  // Comparação em tempo constante: um `===` vazaria o prefixo correto pelo
  // tempo de resposta.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(
  email: unknown,
  password: unknown,
): { email: string; password: string } | { error: string } {
  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "E-mail e senha são obrigatórios" };
  }

  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    return { error: "Esse e-mail não parece válido" };
  }
  if (normalized.length > 254) {
    return { error: "E-mail longo demais" };
  }
  if (password.length < 8) {
    return { error: "A senha precisa ter pelo menos 8 caracteres" };
  }
  if (password.length > 512) {
    return { error: "Senha longa demais" };
  }

  return { email: normalized, password };
}

/* ─────────────────────────────── sessões ─────────────────────────────────── */

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await db.execute(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
    [token, userId, now, now + SESSION_TTL_MS],
  );
  return token;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Usuário da requisição atual, ou null. Também expira sessões vencidas. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const rows = await db.query<{ id: string; email: string; expires_at: number | string }>(
    `SELECT u.id, u.email, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1`,
    [token],
  );

  const row = rows[0];
  if (!row) return null;

  if (Number(row.expires_at) < Date.now()) {
    await db.execute(`DELETE FROM sessions WHERE token = $1`, [token]);
    return null;
  }

  return { id: row.id, email: row.email };
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  try {
    const db = await getDb();
    await db.execute(`DELETE FROM sessions WHERE token = $1`, [token]);
  } catch {
    // Sem banco não há o que apagar; o cookie some de qualquer jeito.
  }
}

export function newId(): string {
  return randomUUID();
}

/* ──────────────────────── freio de força bruta ───────────────────────────── */

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Limite simples por chave, em memória. Não sobrevive a restart nem cobre
 * várias instâncias — mas encarece o suficiente pra tentativa de senha em
 * massa num app pessoal.
 */
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 5_000) pruneAttempts(now);
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}

function pruneAttempts(now: number) {
  for (const [key, entry] of attempts) {
    if (entry.resetAt < now) attempts.delete(key);
  }
}

export function clientKey(request: Request, suffix: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "local"}:${suffix}`;
}
