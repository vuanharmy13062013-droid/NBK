/**
 * index.js — Máy chủ HTTP.
 *
 * Không dùng thư viện ngoài: chạy được ngay bằng `node server/index.js`
 * trên bất kỳ máy nào đã cài Node.js 18 trở lên.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routes, HttpError, json, publicAlert } from './api.js';
import { readToken, ROLE_LABEL } from './auth.js';
import { load, data, save, flush, audit, usingDatabase } from './store.js';
import { addClient, broadcast } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const ESCALATE_AFTER_SEC = Number(process.env.SOS_ESCALATE_SEC || 60);

await load();
console.log(usingDatabase ? '[store] Lưu trữ: Postgres (DATABASE_URL).' : '[store] Lưu trữ: tệp cục bộ data/db.json.');

/* ------------------------------------------------------------------ */
/* Bảng định tuyến                                                     */
/* ------------------------------------------------------------------ */

const compiled = routes.map((r) => {
  const names = [];
  const source = r.pattern.replace(/:([A-Za-z0-9_]+)/g, (_, n) => {
    names.push(n);
    return '([^/]+)';
  });
  return { ...r, regex: new RegExp(`^${source}$`), names };
});

function match(method, pathname) {
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = r.regex.exec(pathname);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn.')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new HttpError(400, 'Dữ liệu gửi lên không đúng định dạng JSON.')); }
    });
    req.on('error', reject);
  });
}

function resolveUser(token) {
  const claims = readToken(token);
  if (!claims) return null;
  if (claims.role === 'anon') {
    return { id: null, role: 'anon', name: 'Học sinh ẩn danh', roleLabel: ROLE_LABEL.anon, alias: claims.alias };
  }
  const u = data().users.find((x) => x.id === claims.uid);
  if (!u || !u.active) return null;
  return {
    id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role],
    title: u.title, classId: u.classId, email: u.email, mustChangePassword: u.mustChangePassword,
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // Ứng dụng một trang: mọi đường dẫn lạ đều trả về index.html
    const index = path.join(PUBLIC_DIR, 'index.html');
    if (!fs.existsSync(index)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return res.end(fs.readFileSync(index));
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------------------------------------------ */
/* Vòng đời yêu cầu                                                    */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const ip = req.socket.remoteAddress || 'local';

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Kênh thời gian thực
  if (pathname === '/api/stream') {
    const user = resolveUser(url.searchParams.get('token'));
    if (!user) return json(res, 401, { error: 'Phiên đăng nhập đã hết hạn.' });
    return addClient(res, user);
  }

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  const hit = match(req.method, pathname);
  if (!hit) return json(res, 404, { error: 'Điểm cuối không tồn tại.' });

  try {
    const { route, params } = hit;
    let user = null;
    if (route.roles) {
      const header = req.headers.authorization || '';
      user = resolveUser(header.replace(/^Bearer /i, '').trim());
      if (!user) return json(res, 401, { error: 'Bạn cần đăng nhập để tiếp tục.' });
      if (!route.roles.includes(user.role)) {
        audit(user, 'Bị từ chối truy cập', pathname);
        return json(res, 403, { error: 'Tài khoản của bạn không có quyền truy cập nội dung này.' });
      }
    }
    const body = req.method === 'GET' ? {} : await readBody(req);
    const query = Object.fromEntries(url.searchParams);
    const result = await route.handler({ user, body, query, params, ip, req });
    return json(res, 200, result ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.code, { error: err.message });
    console.error('[error]', err);
    return json(res, 500, { error: 'Máy chủ gặp sự cố khi xử lý yêu cầu.' });
  }
});

/* ------------------------------------------------------------------ */
/* Leo thang tự động: SOS chưa được xác nhận sau X giây                 */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const a of data().alerts) {
    if (a.status !== 'moi' || a.escalated) continue;
    if (now - new Date(a.createdAt).getTime() < ESCALATE_AFTER_SEC * 1000) continue;
    a.escalated = true;
    a.escalatedAt = new Date().toISOString();
    a.log.push({
      at: a.escalatedAt, by: 'Hệ thống',
      text: `Trực ban chưa xác nhận sau ${ESCALATE_AFTER_SEC} giây — tự động gọi điện và cảnh báo Ban giám hiệu.`,
    });
    changed = true;
    broadcast('alert:escalate', { alert: publicAlert(a) }, ['guard', 'admin']);
    console.log(`[escalate] ${a.code} tại ${a.area} → chuyển Ban giám hiệu`);
  }
  if (changed) save();
}, 5000).unref?.();

/* ------------------------------------------------------------------ */

server.listen(PORT, () => {
  console.log('\n  ┌────────────────────────────────────────────────┐');
  console.log('  │  Nền tảng SOS – phòng chống bạo lực học đường  │');
  console.log('  └────────────────────────────────────────────────┘');
  console.log(`  Máy chủ: http://localhost:${PORT}`);
  console.log(`  Tài khoản demo: xem README.md (mật khẩu chung: Sos@2026)`);
  console.log(`  Mã OTP demo sẽ hiện trên màn hình đăng nhập và in ở đây.\n`);
});

process.on('SIGINT', async () => {
  try { await flush(); } catch (err) { console.error('[store] Lỗi khi lưu dữ liệu lúc tắt máy chủ:', err); }
  process.exit(0);
});
