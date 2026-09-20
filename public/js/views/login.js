/** login.js — Màn hình đăng nhập chung cho cả bốn nhóm tài khoản. */

import { post, get, session } from '../api.js';
import { $, esc, icons, toast, modal, fmtTime, statusBadge, levelBadge } from '../ui.js';

const CARDS = [
  { role: 'student', user: 'hs.nguyenvana', name: 'Học sinh',
    desc: 'Gửi báo cáo (ẩn danh nếu muốn), bấm nút SOS và trò chuyện với tư vấn viên.' },
  { role: 'teacher', user: 'gv.tranthib', name: 'Giáo viên chủ nhiệm',
    desc: 'Tiếp nhận báo cáo mức nhẹ – trung bình của lớp phụ trách và phản hồi học sinh.' },
  { role: 'admin', user: 'bgh.lequangc', name: 'Ban giám hiệu',
    desc: 'Toàn cảnh vụ việc nghiêm trọng, bản đồ điểm nóng, quản lý tài khoản và ca trực.' },
  { role: 'guard', user: 'tb.phamvand', name: 'Trực ban / Bảo vệ',
    desc: 'Nhận cảnh báo khẩn cấp theo thời gian thực và xử lý ngay tại hiện trường.' },
];

let meta = null;

const HERO_ILLUSTRATION = `
<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="160" cy="205" rx="130" ry="10" fill="#0B1424" opacity=".5"/>
  <g>
    <circle cx="107" cy="58" r="26" fill="#F0C89A"/>
    <path d="M81 55c0-19 12-32 26-32s26 13 26 32c-8-6-17-4-26-4s-18-2-26 4Z" fill="#1B2A45"/>
    <path d="M62 200v-46c0-24 18-42 45-42s45 18 45 42v46Z" fill="#E7EEF6"/>
    <path d="M62 200v-46c0-22 16-39 40-42-4 10-6 24-6 38 0 22 8 40 20 50Z" fill="#D8A73D"/>
    <rect x="88" y="150" width="38" height="26" rx="3" fill="#16233B"/>
  </g>
  <g>
    <circle cx="213" cy="66" r="24" fill="#C98A5B"/>
    <path d="M189 64c0-17 11-29 24-29s24 12 24 29c-4-9-13-7-24-7s-20-2-24 7Z" fill="#0F1B30"/>
    <path d="M172 200v-42c0-22 17-38 41-38s41 16 41 38v42Z" fill="#1C6E8C"/>
    <path d="M172 200v-42c0-20 14-35 34-38-6 10-9 23-9 36 0 20 7 36 17 44Z" fill="#124F63"/>
  </g>
  <g stroke="#D8A73D" stroke-width="2.4" fill="none" stroke-linecap="round">
    <path d="M254 40c8-10 22-10 28 0 5 8 2 17-14 28-16-11-19-20-14-28Z" fill="#0F1B30"/>
    <path d="M262 52l5 5 9-10"/>
  </g>
</svg>`;

const QN_ICON = {
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V6a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 4v5h5M8 13h8M8 17h5"/></svg>',
  sos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6l7-3Z"/><path d="M12 8v5M12 16h.01"/></svg>',
  track: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>',
};

export async function render(el, { onSignedIn }) {
  if (!meta) { try { meta = await get('/api/meta'); } catch { meta = null; } }

  el.innerHTML = `
    <section class="hero-banner">
      <div class="hero-illustration">${HERO_ILLUSTRATION}</div>
      <div class="hero-copy">
        <div class="eyebrow">SOS Học Đường · THPT Nguyễn Bỉnh Khiêm</div>
        <h1>Một chạm để lên tiếng,<br><span class="hl">một phút</span> để có người tới</h1>
        <p>Nền tảng nối học sinh với giáo viên chủ nhiệm, Ban giám hiệu và người trực ban.
           Đăng nhập ở góc trên bên phải, hoặc gửi báo cáo mà không cần nêu tên.</p>
        <div class="hero-tag">Bạn không đơn độc · ẩn danh nếu bạn muốn</div>
      </div>
      <div class="hero-info">
        <div class="hi-row"><b>≤60s</b><span>Trực ban xác nhận mọi cảnh báo SOS</span></div>
        <div class="hi-row"><b>24/7</b><span>Luôn có người trực tiếp nhận</span></div>
        <div class="hi-row"><b>Ẩn danh</b><span>Giáo viên chỉ thấy bí danh của bạn</span></div>
      </div>
    </section>

    <div class="quick-nav">
      <button class="qn-item" id="qnReport" type="button"><span class="qn-ic">${QN_ICON.report}</span><span>Gửi báo cáo</span></button>
      <button class="qn-item" id="qnSos" type="button"><span class="qn-ic">${QN_ICON.sos}</span><span>Bấm SOS ngay</span></button>
      <button class="qn-item" id="qnTrack" type="button"><span class="qn-ic">${QN_ICON.track}</span><span>Tra cứu mã báo cáo</span></button>
      <button class="qn-item" id="qnRole" type="button"><span class="qn-ic">${QN_ICON.role}</span><span>Đăng nhập hệ thống</span></button>
    </div>

    <div class="section-lead" id="roleLead">
      <div class="eyebrow">Đăng nhập hệ thống</div>
      <h2>Bạn thuộc nhóm tài khoản nào?</h2>
      <p>Mỗi nhóm có một quyền hạn và giao diện riêng, phù hợp với vai trò trong quy trình xử lý. Chọn nhóm của bạn để mở cửa sổ đăng nhập.</p>
    </div>

    <div class="role-grid role-grid-lg" id="roleGrid">
      ${CARDS.map((c) => `
        <button class="role-card" data-role="${c.role}">
          <div class="icon">${icons[c.role]}</div>
          <div class="rname">${c.name}</div>
          <div class="rdesc">${c.desc}</div>
          <div class="rcta">Đăng nhập →</div>
        </button>`).join('')}
    </div>

    <div class="cta-panel">
      <div class="cta-copy">
        <h2>Không có tài khoản?</h2>
        <p class="desc">Bạn vẫn có thể gửi báo cáo ẩn danh hoặc tra cứu tiến độ bằng mã báo cáo, không cần đăng nhập.</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-coral btn-lg" id="anonBtn">Gửi báo cáo ẩn danh</button>
        <button class="btn btn-line btn-lg" id="trackBtn">Tra cứu bằng mã</button>
      </div>
    </div>`;

  el.querySelectorAll('.role-card').forEach((b) => b.addEventListener('click', () => {
    openLoginModal(b.dataset.role, onSignedIn);
  }));

  const goAnon = async () => {
    const r = await post('/api/auth/anonymous', {});
    session.set(r.token, r.user);
    onSignedIn(r.user);
  };

  $('#anonBtn', el).addEventListener('click', goAnon);
  $('#trackBtn', el).addEventListener('click', openTracker);
  $('#qnReport', el).addEventListener('click', goAnon);
  $('#qnSos', el).addEventListener('click', goAnon);
  $('#qnTrack', el).addEventListener('click', openTracker);
  $('#qnRole', el).addEventListener('click', () => openLoginModal(null, onSignedIn));
}

/* ------------------------- Cửa sổ đăng nhập (modal) -------------------- */

export function openLoginModal(initialRole, onSignedIn) {
  const root = document.getElementById('modalRoot');
  let mPicked = CARDS.find((c) => c.role === initialRole) || CARDS[0];
  let mStage = { otp: null, sentTo: '', demoCode: '' };

  const close = () => { root.innerHTML = ''; };
  const err = (m) => { const e = $('#loginErr', root); if (e) e.innerHTML = `<div class="err">${esc(m)}</div>`; };

  function paint() {
    const needOtp = mPicked.role !== 'student';
    root.innerHTML = `
      <div class="modal-bg" data-close="1">
        <div class="modal login-modal" role="dialog" aria-modal="true">
          <button type="button" class="modal-x" data-close="1" aria-label="Đóng">&times;</button>
          <div class="lm-tabs">
            ${CARDS.map((c) => `
              <button type="button" class="lm-tab ${c.role === mPicked.role ? 'on' : ''}" data-role="${c.role}">
                <span class="lm-ic">${icons[c.role]}</span>${esc(c.name)}
              </button>`).join('')}
          </div>
          <div id="lmBody">
            ${mStage.otp ? `
              <form class="login-form" id="otpForm" style="padding:0">
                <div class="lf-role">Bước 2 / 2 · Xác thực hai lớp</div>
                <h3>Nhập mã OTP</h3>
                <p class="hint" style="margin:0 0 14px">Mã gồm 6 chữ số vừa được gửi tới ${esc(mStage.sentTo)}. Mã có hiệu lực trong 5 phút.</p>
                ${mStage.demoCode ? `<div class="ok-box">Bản demo: mã OTP của bạn là <b class="mono">${esc(mStage.demoCode)}</b></div>` : ''}
                <div class="field"><input class="otp-code mono" id="otpCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" value="${esc(mStage.demoCode)}"></div>
                <div id="loginErr"></div>
                <button class="btn btn-primary" style="width:100%" type="submit">Xác thực và vào hệ thống</button>
                <p class="hint" style="text-align:center"><a href="#" id="backLogin">Quay lại đăng nhập</a></p>
              </form>` : `
              <form class="login-form" id="loginForm" style="padding:0">
                <h3>Đăng nhập · ${esc(mPicked.name)}</h3>
                <p class="desc" style="margin:-4px 0 16px">${esc(mPicked.desc)}</p>
                <div class="field"><label>Tên đăng nhập</label><input id="lfUser" value="${esc(mPicked.user)}" autocomplete="username"></div>
                <div class="field"><label>Mật khẩu</label><input id="lfPass" type="password" value="${meta?.demo ? esc(meta.demo.password) : ''}" autocomplete="current-password"></div>
                <div id="loginErr"></div>
                <button class="btn btn-primary" style="width:100%" type="submit">${needOtp ? 'Tiếp tục · gửi mã OTP' : 'Đăng nhập'}</button>
                <p class="hint">${needOtp
                  ? 'Nhóm tài khoản này bắt buộc xác thực hai lớp vì có quyền xem thông tin định danh của học sinh.'
                  : 'Lần đăng nhập đầu tiên, hệ thống sẽ yêu cầu bạn đổi mật khẩu mặc định.'}</p>
              </form>`}
          </div>
          <p class="hint" style="text-align:center;margin:14px 0 0">
            Không có tài khoản? <a href="#" id="lmAnon">Gửi báo cáo ẩn danh</a> · <a href="#" id="lmTrack">Tra cứu mã báo cáo</a>
          </p>
        </div>
      </div>`;
    bind();
  }

  function bind() {
    root.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', (e) => { if (e.target === n) close(); }));

    root.querySelectorAll('.lm-tab').forEach((b) => b.addEventListener('click', () => {
      mPicked = CARDS.find((c) => c.role === b.dataset.role);
      mStage = { otp: null, sentTo: '', demoCode: '' };
      paint();
    }));

    $('#lmAnon', root)?.addEventListener('click', async (e) => {
      e.preventDefault();
      const r = await post('/api/auth/anonymous', {});
      session.set(r.token, r.user);
      close();
      onSignedIn(r.user);
    });
    $('#lmTrack', root)?.addEventListener('click', (e) => { e.preventDefault(); close(); openTracker(); });

    $('#loginForm', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const r = await post('/api/auth/login', {
          username: $('#lfUser', root).value.trim(),
          password: $('#lfPass', root).value,
        });
        if (r.otpRequired) {
          mStage = { otp: r.challenge, sentTo: r.sentTo, demoCode: r.demoCode || '' };
          paint();
          toast('Đã gửi mã OTP tới ' + r.sentTo);
          return;
        }
        session.set(r.token, r.user);
        close();
        onSignedIn(r.user);
      } catch (ex) {
        err(ex.message);
        btn.disabled = false;
      }
    });

    $('#backLogin', root)?.addEventListener('click', (e) => {
      e.preventDefault();
      mStage = { otp: null, sentTo: '', demoCode: '' };
      paint();
    });

    $('#otpForm', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await post('/api/auth/verify-otp', { challenge: mStage.otp, code: $('#otpCode', root).value });
        session.set(r.token, r.user);
        close();
        onSignedIn(r.user);
      } catch (ex) {
        err(ex.message);
      }
    });
  }

  paint();
}

/* ----------------------- Tra cứu bằng mã báo cáo ---------------------- */

export function openTracker() {
  modal({
    title: 'Tra cứu tiến độ xử lý',
    bodyHtml: `
      <p class="hint" style="margin-top:0">Nhập mã báo cáo (ví dụ BC-K3M9P) đã được cấp khi bạn gửi. Không cần đăng nhập, không lộ danh tính.</p>
      <div class="field"><input id="trackCode" placeholder="BC-XXXXX" style="text-transform:uppercase"></div>
      <div id="trackOut"></div>`,
    confirmText: 'Tra cứu',
    onConfirm: async (body) => {
      const code = body.querySelector('#trackCode').value.trim();
      const out = body.querySelector('#trackOut');
      try {
        const { report: r } = await get('/api/reports/track?code=' + encodeURIComponent(code));
        out.innerHTML = `
          <div class="list-item" style="margin-top:12px">
            <div class="li-top"><b>${esc(r.code)}</b><div>${levelBadge(r.level)} ${statusBadge(r.status)}</div></div>
            <div class="li-meta" style="margin-top:8px">
              <span>Khu vực: ${esc(r.area)}</span><span>Gửi lúc: ${fmtTime(r.createdAt)}</span>
            </div>
            <div class="note-box">${r.handledBy ? `Người phụ trách: <b>${esc(r.handledBy)}</b>. ` : ''}${r.overdue ? 'Vụ việc đang quá hạn cam kết, hệ thống đã nhắc lại người phụ trách.' : 'Vụ việc đang trong thời hạn xử lý cam kết.'}</div>
          </div>`;
      } catch (ex) {
        out.innerHTML = `<div class="err" style="margin-top:12px">${esc(ex.message)}</div>`;
      }
      return false; // giữ hộp thoại mở để xem kết quả
    },
  });
}
