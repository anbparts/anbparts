import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export const AUTH_COOKIE_NAME = 'anb_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const HASH_PREFIX = 'scrypt';

type AuthUserConfig = {
  username: string;
  displayName: string;
  password: string;
  hashed: boolean;
};

type SessionPayload = {
  sub: string;
  name: string;
  exp: number;
};

let warnedAboutSessionSecret = false;

function normalizeText(value: any) {
  return String(value ?? '').trim();
}

function normalizeUsername(value: any) {
  return normalizeText(value).toLowerCase();
}

function toDisplayName(username: string) {
  if (!username) return '';
  return username.charAt(0).toUpperCase() + username.slice(1);
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '==='.slice((value.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function safeCompareText(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${HASH_PREFIX}$${salt}$${derived}`;
}

function verifyHashedPassword(password: string, storedHash: string) {
  const [algo, salt, expected] = storedHash.split('$');
  if (algo !== HASH_PREFIX || !salt || !expected) return false;
  const derived = scryptSync(password, salt, 64).toString('hex');
  return safeCompareText(derived, expected);
}

function resolveEnvPassword(username: string) {
  const upper = username.toUpperCase();
  return normalizeText(process.env[`AUTH_PASS_${upper}`] || process.env[`NEXT_PUBLIC_PASS_${upper}`]);
}

export function getConfiguredUsers() {
  const users = new Map<string, AuthUserConfig>();
  const rawJson = normalizeText(process.env.AUTH_USERS_JSON);

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, any>;
      for (const [rawUsername, rawConfig] of Object.entries(parsed || {})) {
        const username = normalizeUsername(rawUsername);
        if (!username) continue;

        if (typeof rawConfig === 'string') {
          users.set(username, {
            username,
            displayName: toDisplayName(username),
            password: normalizeText(rawConfig),
            hashed: rawConfig.startsWith(`${HASH_PREFIX}$`),
          });
          continue;
        }

        const hash = normalizeText(rawConfig?.hash);
        const password = normalizeText(rawConfig?.password);
        const stored = hash || password;
        if (!stored) continue;

        users.set(username, {
          username,
          displayName: normalizeText(rawConfig?.displayName || rawConfig?.name) || toDisplayName(username),
          password: stored,
          hashed: !!hash,
        });
      }
    } catch (error) {
      console.error('AUTH_USERS_JSON invalido:', error);
    }
  }

  for (const username of ['bruno', 'nelson', 'alex']) {
    if (users.has(username)) continue;
    const password = resolveEnvPassword(username);
    if (!password) continue;
    users.set(username, {
      username,
      displayName: toDisplayName(username),
      password,
      hashed: password.startsWith(`${HASH_PREFIX}$`),
    });
  }

  return users;
}

export function authenticateUser(usernameInput: string, passwordInput: string) {
  const username = normalizeUsername(usernameInput);
  const password = normalizeText(passwordInput);
  const users = getConfiguredUsers();
  const user = users.get(username);
  if (!user || !password) return null;

  const valid = user.hashed
    ? verifyHashedPassword(password, user.password)
    : safeCompareText(password, user.password);
  if (!valid) return null;

  return {
    username: user.username,
    displayName: user.displayName,
  };
}

export function getSessionSecret() {
  const secret = normalizeText(
    process.env.AUTH_SESSION_SECRET
    || process.env.SESSION_SECRET
    || process.env.JWT_SECRET
    || process.env.DATABASE_URL,
  );

  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('Configure AUTH_SESSION_SECRET no Railway.');
  }

  if (!secret && !warnedAboutSessionSecret) {
    warnedAboutSessionSecret = true;
    console.warn('AUTH_SESSION_SECRET nao configurado. Usando fallback inseguro apenas para desenvolvimento.');
  }

  return secret || 'anbparts-dev-auth-secret';
}

function signPayload(payloadBase64: string, secret: string) {
  return createHmac('sha256', secret).update(payloadBase64).digest('base64url');
}

export function createSessionToken(user: { username: string; displayName: string }) {
  const payload: SessionPayload = {
    sub: user.username,
    name: user.displayName,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadBase64, getSessionSecret());
  return `${payloadBase64}.${signature}`;
}

export function readSessionFromToken(token: string | null | undefined) {
  const raw = normalizeText(token);
  if (!raw) return null;

  const [payloadBase64, signature] = raw.split('.');
  if (!payloadBase64 || !signature) return null;

  const expectedSignature = signPayload(payloadBase64, getSessionSecret());
  if (!safeCompareText(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadBase64)) as SessionPayload;
    if (!payload?.sub || !payload?.name || !payload?.exp) return null;
    if (payload.exp <= Date.now()) return null;
    return {
      username: normalizeUsername(payload.sub),
      displayName: normalizeText(payload.name) || toDisplayName(normalizeUsername(payload.sub)),
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();
  const raw = normalizeText(cookieHeader);
  if (!raw) return cookies;

  for (const part of raw.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name) continue;
    cookies.set(name, decodeURIComponent(value));
  }

  return cookies;
}

function buildCookieAttributes(isSecure: boolean, expiresAt?: number) {
  const attributes = [
    `Path=/`,
    `HttpOnly`,
    `SameSite=${isSecure ? 'None' : 'Lax'}`,
  ];

  if (isSecure) {
    attributes.push('Secure');
  }

  if (expiresAt) {
    attributes.push(`Expires=${new Date(expiresAt).toUTCString()}`);
    attributes.push(`Max-Age=${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}`);
  } else {
    attributes.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    attributes.push('Max-Age=0');
  }

  return attributes;
}

export function serializeSessionCookie(token: string, isSecure: boolean) {
  const session = readSessionFromToken(token);
  const attributes = buildCookieAttributes(isSecure, session?.expiresAt);
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${attributes.join('; ')}`;
}

export function serializeClearedSessionCookie(isSecure: boolean) {
  const attributes = buildCookieAttributes(isSecure);
  return `${AUTH_COOKIE_NAME}=; ${attributes.join('; ')}`;
}
