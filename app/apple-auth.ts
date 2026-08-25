import { cookies } from "next/headers";

export type AppleUser = {
  subject: string;
  email: string;
  displayName: string;
};

const SESSION_COOKIE = "darabiha_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function secret() {
  return process.env.AUTH_SESSION_SECRET || "";
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function signToken(payload: Record<string, unknown>) {
  if (!secret()) throw new Error("AUTH_SESSION_SECRET is not configured.");
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded)}`;
}

export async function verifyToken<T>(token: string | undefined): Promise<T | null> {
  if (!secret() || !token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const encoded = token.slice(0, separator);
  if (!safeEqual(token.slice(separator + 1), await hmac(encoded))) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as T & { exp?: number };
    if (typeof value.exp !== "number" || Date.now() / 1000 > value.exp) return null;
    return value;
  } catch {
    return null;
  }
}

export async function createSession(user: AppleUser) {
  return signToken({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
}

export function sessionCookie(value: string) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function getAppleUser(): Promise<AppleUser | null> {
  const store = await cookies();
  return verifyToken<AppleUser & { exp: number }>(store.get(SESSION_COOKIE)?.value);
}

export function appleSignInPath(returnTo = "/") {
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/api/auth/apple?return_to=${encodeURIComponent(safe)}`;
}

export function appleSignOutPath(returnTo = "/") {
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/api/auth/signout?return_to=${encodeURIComponent(safe)}`;
}
