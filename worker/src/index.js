/**
 * Utaeru API — Cloudflare Worker (Phase 4C)
 * Single-file handler for public data, Google auth, and streamer claims.
 */

const COOKIE_NAME = 'utaeru_session';
const SESSION_MAX_AGE_SEC = 2592000; // 30 days
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const STREAMER_ID_RE = /^[a-z0-9-]{3,32}$/;
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

/** @type {{ keys: object[] | null, fetchedAt: number }} */
const jwksCache = { keys: null, fetchedAt: 0 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return corsPreflight(request, cors);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response;

      if (path.startsWith('/api/public/') && request.method === 'GET') {
        response = await handleGetPublic(path, env);
      } else if (path.startsWith('/api/public/') && request.method === 'PUT') {
        response = await handlePutPublic(request, path, env);
      } else if (path === '/api/auth/google' && request.method === 'POST') {
        response = await handleAuthGoogle(request, env);
      } else if (path === '/api/auth/logout' && request.method === 'POST') {
        response = await handleAuthLogout();
      } else if (path === '/api/auth/me' && request.method === 'GET') {
        response = await handleAuthMe(request, env);
      } else if (path.startsWith('/api/streamer/') && path.endsWith('/claim') && request.method === 'POST') {
        response = await handleClaim(request, path, env);
      } else {
        response = json({ error: 'not_found' }, 404);
      }

      return withCors(response, cors);
    } catch (err) {
      console.error(err);
      return withCors(json({ error: 'internal_error' }, 500), cors);
    }
  },
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleGetPublic(path, env) {
  const streamerId = extractStreamerId(path, '/api/public/');
  if (!isValidStreamerId(streamerId)) {
    return json({ error: 'invalid_streamer_id' }, 400);
  }

  const row = await env.DB.prepare(
    'SELECT public_data FROM streamers WHERE streamer_id = ?',
  ).bind(streamerId).first();

  if (!row) {
    return json({ error: 'not_found' }, 404);
  }

  try {
    return json(JSON.parse(row.public_data), 200);
  } catch {
    return json({ error: 'internal_error' }, 500);
  }
}

async function handlePutPublic(request, path, env) {
  const streamerId = extractStreamerId(path, '/api/public/');
  if (!isValidStreamerId(streamerId)) {
    return json({ error: 'invalid_streamer_id' }, 400);
  }

  const auth = await authorizeWrite(request, env, streamerId);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (rawBody.error) {
    return json({ error: rawBody.error }, rawBody.status);
  }

  let body;
  try {
    body = JSON.parse(rawBody.text);
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const validation = validatePublicPayload(body);
  if (!validation.ok) {
    return json({ error: 'invalid_body', message: validation.message }, 400);
  }

  const publicData = JSON.stringify(body);
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO streamers (streamer_id, public_data, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(streamer_id) DO UPDATE SET
      public_data = excluded.public_data,
      updated_at = excluded.updated_at
  `).bind(streamerId, publicData, now, now).run();

  return json(body, 200);
}

async function handleAuthGoogle(request, env) {
  const rawBody = await readBodyWithLimit(request, 64 * 1024);
  if (rawBody.error) {
    return json({ error: rawBody.error }, rawBody.status);
  }

  let body;
  try {
    body = JSON.parse(rawBody.text);
  } catch {
    return json({ error: 'invalid_token' }, 401);
  }

  const idToken = body && body.idToken;
  if (typeof idToken !== 'string' || !idToken) {
    return json({ error: 'invalid_token' }, 401);
  }

  const claims = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
  if (!claims) {
    return json({ error: 'invalid_token' }, 401);
  }

  const googleSub = claims.sub;
  const email = claims.email || '';
  const displayName = claims.name || null;
  const now = new Date().toISOString();

  const existing = await env.DB.prepare(
    'SELECT user_id FROM users WHERE google_sub = ?',
  ).bind(googleSub).first();

  if (existing) {
    await env.DB.prepare(`
      UPDATE users
      SET email = ?, display_name = ?, last_login_at = ?
      WHERE google_sub = ?
    `).bind(email, displayName, now, googleSub).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO users (user_id, google_sub, email, display_name, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), googleSub, email, displayName, now, now).run();
  }

  const sessionToken = await signSessionToken(googleSub, env.SESSION_SECRET);
  // accessToken: cross-site (GitHub Pages → workers.dev) では HttpOnly Cookie が
  // 保存されない環境があるため、Authorization Bearer でセッションを復元する。
  const response = json({ email, accessToken: sessionToken }, 200);
  setSessionCookie(response, sessionToken);
  return response;
}

function handleAuthLogout() {
  const response = json({ ok: true }, 200);
  clearSessionCookie(response);
  return response;
}

async function handleAuthMe(request, env) {
  const session = await getSession(request, env.SESSION_SECRET);
  if (!session) {
    return json({ error: 'unauthorized' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT user_id, email FROM users WHERE google_sub = ?',
  ).bind(session.sub).first();

  if (!user) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT streamer_id FROM streamer_owners WHERE user_id = ? ORDER BY streamer_id',
  ).bind(user.user_id).all();

  const ownedStreamerIds = (results || []).map((row) => row.streamer_id);

  return json({ email: user.email, ownedStreamerIds }, 200);
}

async function handleClaim(request, path, env) {
  const prefix = '/api/streamer/';
  const suffix = '/claim';
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
    return json({ error: 'not_found' }, 404);
  }

  const streamerId = path.slice(prefix.length, -suffix.length);
  if (!isValidStreamerId(streamerId)) {
    return json({ error: 'invalid_streamer_id' }, 400);
  }

  const session = await getSession(request, env.SESSION_SECRET);
  if (!session) {
    return json({ error: 'unauthorized' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT user_id FROM users WHERE google_sub = ?',
  ).bind(session.sub).first();

  if (!user) {
    return json({ error: 'unauthorized' }, 401);
  }

  const existing = await env.DB.prepare(
    'SELECT user_id FROM streamer_owners WHERE streamer_id = ?',
  ).bind(streamerId).first();

  if (existing) {
    if (existing.user_id === user.user_id) {
      return json({ streamerId, ok: true, alreadyOwned: true }, 200);
    }
    return json({ error: 'already_claimed' }, 409);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO streamer_owners (streamer_id, user_id, created_at) VALUES (?, ?, ?)',
  ).bind(streamerId, user.user_id, now).run();

  return json({ streamerId, ok: true }, 200);
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

async function authorizeWrite(request, env, streamerId) {
  const devToken = request.headers.get('X-Utaeru-Dev-Token');
  if (devToken) {
    if (!env.DEV_WRITE_TOKEN || devToken !== env.DEV_WRITE_TOKEN) {
      return { ok: false, error: 'unauthorized', status: 401 };
    }
    return { ok: true };
  }

  const session = await getSession(request, env.SESSION_SECRET);
  if (!session) {
    return { ok: false, error: 'unauthorized', status: 401 };
  }

  const user = await env.DB.prepare(
    'SELECT user_id FROM users WHERE google_sub = ?',
  ).bind(session.sub).first();

  if (!user) {
    return { ok: false, error: 'unauthorized', status: 401 };
  }

  const owner = await env.DB.prepare(
    'SELECT streamer_id FROM streamer_owners WHERE streamer_id = ? AND user_id = ?',
  ).bind(streamerId, user.user_id).first();

  if (!owner) {
    return { ok: false, error: 'forbidden', status: 403 };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidStreamerId(id) {
  return typeof id === 'string' && STREAMER_ID_RE.test(id);
}

function extractStreamerId(path, prefix) {
  let id = path.slice(prefix.length);
  try {
    id = decodeURIComponent(id);
  } catch {
    return id;
  }
  return id;
}

function validatePublicPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'body must be an object' };
  }

  if (typeof body.streamerName !== 'string' || !body.streamerName.trim()) {
    return { ok: false, message: 'streamerName is required' };
  }

  if (!Array.isArray(body.songs)) {
    return { ok: false, message: 'songs must be an array' };
  }

  for (const song of body.songs) {
    if (!song || typeof song !== 'object' || Array.isArray(song)) {
      return { ok: false, message: 'each song must be an object' };
    }
    for (const key of ['k', 'y', 'a', 't']) {
      if (typeof song[key] !== 'string') {
        return { ok: false, message: `song.${key} must be a string` };
      }
    }
  }

  if (body.songMeta !== undefined) {
    if (!body.songMeta || typeof body.songMeta !== 'object' || Array.isArray(body.songMeta)) {
      return { ok: false, message: 'songMeta must be an object' };
    }
  }

  if (body.tagPresets !== undefined) {
    if (!Array.isArray(body.tagPresets)) {
      return { ok: false, message: 'tagPresets must be an array' };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Session (HS256 JWT)
// ---------------------------------------------------------------------------

async function signSessionToken(sub, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub,
    iat: now,
    exp: now + SESSION_MAX_AGE_SEC,
  }));
  const data = `${header}.${payload}`;
  const sig = await hmacSign(data, secret);
  return `${data}.${sig}`;
}

async function getSession(request, secret) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      const session = await verifySessionToken(bearer, secret);
      if (session) return session;
    }
  }

  const cookie = parseCookies(request.headers.get('Cookie'))[COOKIE_NAME];
  if (!cookie) return null;
  return verifySessionToken(cookie, secret);
}

async function verifySessionToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  let header;
  try {
    header = JSON.parse(b64urlDecode(headerB64));
  } catch {
    return null;
  }
  if (header.alg !== 'HS256') return null;

  const expectedSig = await hmacSign(data, secret);
  if (!timingSafeEqual(sigB64, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;

  return payload;
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlBytes(new Uint8Array(sig));
}

// ---------------------------------------------------------------------------
// Google ID token (RS256 via JWKS)
// ---------------------------------------------------------------------------

async function verifyGoogleIdToken(idToken, clientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(b64urlDecode(headerB64));
    payload = JSON.parse(b64urlDecode(payloadB64));
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;

  const aud = payload.aud;
  const audOk = aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
  if (!audOk) return null;

  if (!GOOGLE_ISSUERS.has(payload.iss)) return null;

  const jwk = await getGoogleJwk(header.kid);
  if (!jwk) return null;

  const valid = await verifyRs256(`${headerB64}.${payloadB64}`, sigB64, jwk);
  if (!valid) return null;

  return payload;
}

async function getGoogleJwk(kid) {
  const now = Date.now();
  if (!jwksCache.keys || now - jwksCache.fetchedAt > JWKS_CACHE_TTL_MS) {
    const res = await fetch(GOOGLE_JWKS_URL);
    if (!res.ok) return null;
    const data = await res.json();
    jwksCache.keys = data.keys || [];
    jwksCache.fetchedAt = now;
  }
  return jwksCache.keys.find((k) => k.kid === kid) || null;
}

async function verifyRs256(data, sigB64, jwk) {
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sig = b64urlDecodeBytes(sigB64);
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      sig,
      new TextEncoder().encode(data),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cookies & CORS
// ---------------------------------------------------------------------------

function setSessionCookie(response, token) {
  response.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_MAX_AGE_SEC}`,
  );
}

function clearSessionCookie(response) {
  response.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`,
  );
}

function corsHeaders(origin, allowedOrigin) {
  if (origin && origin === allowedOrigin) {
    return {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  return {};
}

function corsPreflight(request, cors) {
  if (!cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }

  const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
  const headers = {
    ...cors,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  if (requestedHeaders) {
    headers['Access-Control-Allow-Headers'] = requestedHeaders;
  } else {
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Utaeru-Dev-Token';
  }

  return new Response(null, { status: 204, headers });
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function readBodyWithLimit(request, maxBytes) {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > maxBytes) {
    return { error: 'payload_too_large', status: 413 };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { text: '' };
  }

  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      return { error: 'payload_too_large', status: 413 };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder().decode(merged) };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

function isD1UniqueViolation(err) {
  const msg = String(err && err.message ? err.message : err);
  return msg.includes('UNIQUE constraint failed') || msg.includes('SQLITE_CONSTRAINT');
}

// ---------------------------------------------------------------------------
// Encoding utilities
// ---------------------------------------------------------------------------

function b64url(str) {
  return b64urlBytes(new TextEncoder().encode(str));
}

function b64urlBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
  return new TextDecoder().decode(b64urlDecodeBytes(str));
}

function b64urlDecodeBytes(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
