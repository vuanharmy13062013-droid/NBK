/**
 * smoke.mjs — Kiểm thử nhanh: dựng DOM giả rồi vẽ từng giao diện vai trò
 * với dữ liệu thật từ máy chủ đang chạy, để bắt lỗi thời gian chạy.
 * Chạy: node tools/smoke.mjs   (máy chủ phải đang chạy ở cổng 3000)
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: BASE });

global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.Notification = undefined;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });

global.localStorage = dom.window.localStorage;

const realFetch = global.fetch;
global.fetch = (url, opts) => realFetch(url.startsWith('http') ? url : BASE + url, opts);

const errors = [];
dom.window.addEventListener('error', (e) => errors.push(e.message));

const { session } = await import('../public/js/api.js');

async function login(username) {
  const r = await (await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Sos@2026' }),
  })).json();
  if (r.otpRequired) {
    const v = await (await fetch('/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge: r.challenge, code: r.demoCode }),
    })).json();
    session.set(v.token, v.user);
    return v.user;
  }
  session.set(r.token, r.user);
  return r.user;
}

const views = {
  'hs.nguyenvana': ['../public/js/views/student.js', ['sos', 'mine', 'share']],
  'gv.tranthib': ['../public/js/views/staff.js', ['queue', 'stats']],
  'gv.levanhung': ['../public/js/views/staff.js', ['queue', 'share', 'stats']],
  'bgh.lequangc': ['../public/js/views/admin.js', ['overview', 'serious', 'accounts', 'audit']],
  'tb.phamvand': ['../public/js/views/guard.js', [null]],
};

const el = document.getElementById('view');
let pass = 0;

// Màn hình đăng nhập
try {
  const login1 = await import('../public/js/views/login.js');
  await login1.render(el, { onSignedIn: () => {} });
  if (!el.querySelectorAll('.role-card').length) throw new Error('không vẽ được thẻ vai trò');
  console.log('OK   màn hình đăng nhập · %d thẻ vai trò', el.querySelectorAll('.role-card').length);
  pass++;
} catch (e) { errors.push('login: ' + e.stack); }

for (const [username, [path, tabs]] of Object.entries(views)) {
  const user = await login(username);
  const mod = await import(path);
  for (const tab of tabs) {
    try {
      if (tab) { // chuyển tab bằng cách bấm nút thật
        await mod.render(el);
        const btn = [...el.querySelectorAll('.tab')].find((b) => b.dataset.tab === tab);
        if (btn) btn.click();
        await new Promise((r) => setTimeout(r, 250));
      } else {
        await mod.render(el);
      }
      const len = el.innerHTML.length;
      if (len < 400) throw new Error('nội dung quá ngắn, có thể vẽ hỏng');
      console.log('OK   %s · tab %s · %d ký tự HTML', user.roleLabel, tab || '—', len);
      pass++;
    } catch (e) {
      errors.push(`${username}/${tab}: ${e.stack}`);
    }
  }
  mod.cleanup?.();
}

console.log(`\n${pass} màn hình vẽ thành công, ${errors.length} lỗi`);
if (errors.length) { console.error(errors.join('\n---\n')); process.exit(1); }
process.exit(0);
