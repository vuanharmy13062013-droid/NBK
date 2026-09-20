/** app.js — Khởi động ứng dụng, điều hướng theo vai trò và nối kênh thời gian thực. */

import { session, get, post, openStream } from './api.js';
import { $, esc, toast, modal, notifyDesktop } from './ui.js';
import * as loginView from './views/login.js';
import * as studentView from './views/student.js';
import * as staffView from './views/staff.js';
import * as adminView from './views/admin.js';
import * as guardView from './views/guard.js';

const view = $('#view');
const topRight = $('#topRight');
const topNav = $('#topNav');
let current = null;
let closeStream = null;
let meta = null;
let live = false;

const VIEWS = {
  student: studentView,
  anon: studentView,
  teacher: staffView,
  counselor: staffView,
  admin: adminView,
  guard: guardView,
};

/* ------------------------------ Điều hướng ---------------------------- */

async function mount() {
  const user = session.user;
  current?.cleanup?.();
  current = null;

  if (!user) {
    closeStream?.();
    closeStream = null;
    live = false;
    renderTopbar(null);
    renderDemoStrip();
    return loginView.render(view, { onSignedIn: signedIn });
  }

  current = VIEWS[user.role];
  renderTopbar(user);
  renderDemoStrip();
  try {
    await current.render(view);
  } catch (ex) {
    view.innerHTML = `<div class="panel"><h2>Không tải được dữ liệu</h2>
      <p class="desc">${esc(ex.message)}</p>
      <button class="btn btn-primary" onclick="location.reload()">Thử lại</button></div>`;
  }
  connectStream();
  if (user.mustChangePassword) askChangePassword();
}

const rerender = () => { current?.render(view); };

async function signedIn(user) {
  await mount();
  toast(`Xin chào ${user.name}`, 'sage');
  if (user.role === 'guard' || user.role === 'admin') notifyDesktop('Đã bật cảnh báo SOS', 'Bạn sẽ nhận cảnh báo ngay cả khi chuyển sang tab khác.');
}

function signOut() {
  current?.cleanup?.();
  closeStream?.();
  session.clear();
  mount();
}

window.addEventListener('sos:signed-out', () => {
  toast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', 'coral');
  mount();
});

/* ------------------------------- Thanh trên --------------------------- */

function renderTopbar(user) {
  if (topNav) topNav.style.display = user ? 'none' : 'flex';
  if (!user) {
    topRight.innerHTML = `
      <button class="btn-ghost-inv" id="trackTop">Tra cứu mã báo cáo</button>
      <button class="btn btn-gold btn-sm" id="loginTop">Đăng nhập</button>`;
    $('#trackTop', topRight).addEventListener('click', loginView.openTracker);
    $('#loginTop', topRight).addEventListener('click', () => loginView.openLoginModal(null, signedIn));
    return;
  }
  topRight.innerHTML = `
    <span class="live ${live ? '' : 'off'}" title="${live ? 'Đang nhận cảnh báo thời gian thực' : 'Mất kết nối thời gian thực'}">
      <i></i>${live ? 'Trực tuyến' : 'Mất kết nối'}</span>
    <div class="role-pill">
      <span class="dot">${esc((user.name || 'A').trim().split(' ').at(-1)[0])}</span>
      <span class="who">${esc(user.name)}<small>${esc(user.roleLabel)}</small></span>
    </div>
    ${user.role !== 'anon' ? `<button class="btn-ghost-inv" id="pwBtn">Đổi mật khẩu</button>` : ''}
    <button class="btn-ghost-inv" id="outBtn">Thoát</button>`;
  $('#outBtn', topRight).addEventListener('click', signOut);
  $('#pwBtn', topRight)?.addEventListener('click', askChangePassword);
}

function askChangePassword() {
  modal({
    title: 'Đổi mật khẩu',
    bodyHtml: `
      <div class="field"><label>Mật khẩu hiện tại</label><input id="pwCur" type="password"></div>
      <div class="field"><label>Mật khẩu mới (tối thiểu 6 ký tự)</label><input id="pwNew" type="password"></div>
      <div id="pwOut"></div>`,
    confirmText: 'Lưu mật khẩu',
    onConfirm: async (m) => {
      try {
        await post('/api/auth/change-password', {
          current: m.querySelector('#pwCur').value,
          next: m.querySelector('#pwNew').value,
        });
        toast('Đã đổi mật khẩu', 'sage');
      } catch (ex) {
        m.querySelector('#pwOut').innerHTML = `<div class="err">${esc(ex.message)}</div>`;
        return false;
      }
    },
  });
}

/* --------------------------- Kênh thời gian thực ---------------------- */

function connectStream() {
  closeStream?.();
  const handle = (event) => (payload) => {
    current?.onEvent?.(event, payload, rerender);
    if (event === 'report:new' && ['teacher', 'counselor', 'admin'].includes(session.user?.role)) {
      toast(`Báo cáo mới: ${payload.report.type} · ${payload.report.area}`);
      notifyDesktop('Báo cáo mới trên hệ thống SOS', `${payload.report.type} tại ${payload.report.area}`);
    }
    if (event === 'alert:new' && session.user?.role === 'guard') {
      notifyDesktop('CẢNH BÁO SOS', `Khu vực ${payload.alert.area} — cần xác nhận trong 60 giây`);
    }
  };
  closeStream = openStream({
    'report:new': handle('report:new'),
    'report:update': handle('report:update'),
    'report:message': handle('report:message'),
    'alert:new': handle('alert:new'),
    'alert:update': handle('alert:update'),
    'alert:escalate': handle('alert:escalate'),
    'thread:message': handle('thread:message'),
    onopen: () => { live = true; renderTopbar(session.user); },
    onerror: () => { live = false; renderTopbar(session.user); },
  });
}

/* ------------------------ Thanh chuyển vai trò demo -------------------- */

async function renderDemoStrip() {
  const strip = $('#demoStrip');
  if (!meta) { try { meta = await get('/api/meta'); } catch { return; } }
  if (!meta.demo) { strip.style.display = 'none'; return; }

  const picks = ['hs.nguyenvana', 'gv.tranthib', 'gv.levanhung', 'bgh.lequangc', 'tb.phamvand']
    .map((u) => meta.demo.accounts.find((a) => a.username === u))
    .filter(Boolean);

  strip.style.display = 'flex';
  $('#demoRoleLabel').textContent = session.user ? session.user.roleLabel : 'chưa đăng nhập';
  $('#demoRoles').innerHTML = picks.map((a) => `
    <button class="chip ${session.user?.username === a.username ? 'current' : ''}" data-user="${a.username}">
      ${esc(a.roleLabel)}</button>`).join('')
    + `<button class="chip" data-open-two="1">Mở cửa sổ thứ hai</button>`;

  $('#demoRoles').querySelectorAll('[data-user]').forEach((b) => b.addEventListener('click', () => quickLogin(b.dataset.user)));
  $('#demoRoles').querySelector('[data-open-two]').addEventListener('click', () => window.open(location.href, '_blank'));
}

/** Đăng nhập nhanh khi trình bày: tự điền mật khẩu và mã OTP của bản demo. */
async function quickLogin(username) {
  try {
    const r = await post('/api/auth/login', { username, password: meta.demo.password });
    if (r.otpRequired) {
      const v = await post('/api/auth/verify-otp', { challenge: r.challenge, code: r.demoCode });
      session.set(v.token, v.user);
    } else {
      session.set(r.token, r.user);
    }
    await mount();
  } catch (ex) {
    toast(ex.message, 'coral');
  }
}

/* -------------------------------- Khởi động ---------------------------- */

$('#navHome')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('#navAnon')?.addEventListener('click', async () => {
  const r = await post('/api/auth/anonymous', {});
  session.set(r.token, r.user);
  signedIn(r.user);
});
$('#navTrack')?.addEventListener('click', loginView.openTracker);

(async function boot() {
  if (session.token) {
    try { await get('/api/auth/me'); } catch { session.clear(); }
  }
  mount();
})();
