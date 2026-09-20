/**
 * auth.js — Xác thực và phân quyền.
 *
 * - Mật khẩu băm bằng scrypt + salt ngẫu nhiên (không lưu văn bản thuần).
 * - Phiên đăng nhập dùng token ký HMAC-SHA256, có hạn sử dụng.
 * - Xác thực hai lớp (OTP) bắt buộc với giáo viên, Ban giám hiệu, trực ban.
 */

import crypto from 'node:crypto';

const SECRET = process.env.SOS_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ
const OTP_TTL_MS = 5 * 60 * 1000; // 5 phút

/** Vai trò bắt buộc xác thực hai lớp. */
export const OTP_ROLES = new Set(['teacher', 'counselor', 'admin', 'guard']);

export const ROLE_LABEL = {
  student: 'Học sinh',
  teacher: 'Giáo viên chủ nhiệm',
  counselor: 'Tư vấn tâm lý',
  admin: 'Ban giám hiệu',
  guard: 'Trực ban / Bảo vệ',
  anon: 'Học sinh ẩn danh',
};

/* ---------------------------- Mật khẩu ---------------------------- */

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, user) {
  if (!user?.hash) return false;
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ----------------------------- Token ------------------------------ */

function sign(payloadB64) {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
}

export function issueToken(payload, ttl = TOKEN_TTL_MS) {
  const body = { ...payload, exp: Date.now() + ttl };
  const b64 = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${b64}.${sign(b64)}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  const expected = sign(b64);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const body = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (!body.exp || body.exp < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

/* ------------------------------ OTP ------------------------------- */

const otpStore = new Map(); // challenge -> { userId, code, exp, tries }

export function createOtpChallenge(userId) {
  const challenge = crypto.randomBytes(12).toString('base64url');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  otpStore.set(challenge, { userId, code, exp: Date.now() + OTP_TTL_MS, tries: 0 });
  return { challenge, code };
}

export function verifyOtp(challenge, code) {
  const rec = otpStore.get(challenge);
  if (!rec) return { ok: false, error: 'Phiên xác thực đã hết hạn, vui lòng đăng nhập lại.' };
  if (rec.exp < Date.now()) {
    otpStore.delete(challenge);
    return { ok: false, error: 'Mã OTP đã hết hạn.' };
  }
  rec.tries += 1;
  if (rec.tries > 5) {
    otpStore.delete(challenge);
    return { ok: false, error: 'Nhập sai quá 5 lần. Vui lòng đăng nhập lại.' };
  }
  if (rec.code !== String(code || '').trim()) {
    return { ok: false, error: 'Mã OTP không đúng.' };
  }
  otpStore.delete(challenge);
  return { ok: true, userId: rec.userId };
}

/* --------------------- Giới hạn tần suất đơn giản ------------------- */

const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || rec.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= max;
}

/* ----------------------------- Ẩn danh ----------------------------- */

/** Bí danh ổn định cho một học sinh ẩn danh: không thể suy ngược ra tài khoản. */
export function anonAlias(seed) {
  const h = crypto.createHmac('sha256', SECRET).update('alias:' + seed).digest('hex');
  return 'HS-' + h.slice(0, 5).toUpperCase();
}
