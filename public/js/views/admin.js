/** admin.js — Giao diện Ban giám hiệu: giám sát toàn trường và quản trị hệ thống. */

import { get, post, session } from '../api.js';
import {
  $, esc, toast, timeAgo, fmtTime, clock, levelBadge, statusBadge, dueText, modal, STATUS_NAME, mapLinkHtml,
} from '../ui.js';

let tab = 'overview';
let cache = {};

export async function render(el) {
  const [stats, reports, alerts] = await Promise.all([
    get('/api/stats'), get('/api/reports'), get('/api/alerts'),
  ]);
  cache = { stats: stats, reports: reports.reports, alerts: alerts.alerts };

  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h1>Toàn cảnh an toàn học đường</h1>
        <div class="sub">${esc(session.user.name)} · ${esc(session.user.title || 'Ban giám hiệu')} ·
          cập nhật theo thời gian thực</div>
      </div>
      <div class="btn-row"><button class="btn btn-line btn-sm" id="refresh">Làm mới</button></div>
    </div>

    <div class="stat-row">
      <div class="stat-card ${cache.stats.totals.alertsActive ? 'warn' : ''}">
        <div class="n">${cache.stats.totals.alertsActive}</div><div class="l">Cảnh báo SOS đang mở</div></div>
      <div class="stat-card"><div class="n">${cache.stats.totals.pending}</div><div class="l">Vụ việc chưa hoàn tất</div></div>
      <div class="stat-card ${cache.stats.totals.overdue ? 'warn' : ''}">
        <div class="n">${cache.stats.totals.overdue}</div><div class="l">Quá hạn cam kết</div></div>
      <div class="stat-card"><div class="n mono">${cache.stats.totals.avgAckSeconds != null ? clock(cache.stats.totals.avgAckSeconds) : '—'}</div>
        <div class="l">Thời gian tiếp nhận SOS trung bình</div></div>
    </div>

    <div class="tabs">
      <button class="tab ${tab === 'overview' ? 'on' : ''}" data-tab="overview">Tổng quan</button>
      <button class="tab ${tab === 'serious' ? 'on' : ''}" data-tab="serious">Vụ việc &amp; cảnh báo</button>
      <button class="tab ${tab === 'accounts' ? 'on' : ''}" data-tab="accounts">Tài khoản &amp; ca trực</button>
      <button class="tab ${tab === 'audit' ? 'on' : ''}" data-tab="audit">Nhật ký truy vết</button>
    </div>
    <div id="tabBody"></div>`;

  $('#refresh', el).addEventListener('click', () => render(el));
  el.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(el); }));

  const body = $('#tabBody', el);
  if (tab === 'overview') overview(body);
  if (tab === 'serious') serious(body, el);
  if (tab === 'accounts') await accounts(body, el);
  if (tab === 'audit') await auditView(body);
}

/* ----------------------------- Tổng quan ------------------------------ */

function overview(body) {
  const st = cache.stats;
  const max = Math.max(1, ...st.hotspots.map((h) => h.count));
  const maxHour = Math.max(1, ...st.byHour);
  const levels = ['nhe', 'trung_binh', 'nghiem_trong'];

  body.innerHTML = `
    <div class="two-col">
      <div class="panel">
        <h2>Bản đồ điểm nóng</h2>
        <p class="desc">Khu vực phát sinh vụ việc nhiều nhất — cơ sở để bố trí lại lịch giám sát giờ ra chơi và tan học.</p>
        ${st.hotspots.map((h) => `
          <div class="hs-row">
            <div class="hs-label">${esc(h.area)}</div>
            <div class="hs-track"><div class="hs-fill" style="width:${(h.count / max) * 100}%"></div></div>
            <div class="hs-val">${h.count}</div>
          </div>`).join('') || '<div class="empty">Chưa đủ dữ liệu.</div>'}
        <div style="margin-top:20px">
          <h2 style="font-size:15px">Khung giờ phát sinh</h2>
          <div class="spark">
            ${st.byHour.map((n, h) => `<i class="${n === maxHour && n > 0 ? 'peak' : ''}" style="height:${(n / maxHour) * 100}%" title="${h}h: ${n} vụ"></i>`).join('')}
          </div>
          <div class="spark-x"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
        </div>
      </div>

      <div>
        <div class="panel">
          <h2>Phân bố theo mức độ</h2>
          <p class="desc">Tính trên toàn bộ báo cáo đã tiếp nhận.</p>
          ${levels.map((l) => {
            const n = st.byLevel[l] || 0;
            const total = Math.max(1, st.totals.reports);
            return `<div class="hs-row">
              <div class="hs-label">${levelBadge(l)}</div>
              <div class="hs-track"><div class="hs-fill" style="width:${(n / total) * 100}%"></div></div>
              <div class="hs-val">${n}</div></div>`;
          }).join('')}
        </div>
        <div class="panel">
          <h2>Tình hình xử lý</h2>
          <p class="desc">Số vụ việc theo trạng thái, dùng cho báo cáo tuần.</p>
          <table class="table">
            ${Object.entries(st.byStatus).map(([k, v]) => `
              <tr><td>${statusBadge(k)}</td><td style="text-align:right;font-weight:600">${v}</td></tr>`).join('')}
            <tr><td><b>Tổng số</b></td><td style="text-align:right;font-weight:700">${st.totals.reports}</td></tr>
          </table>
          <div class="note-box" style="margin-top:12px">
            Trực ban đang trực tuyến: <b>${st.totals.guardsOnline}</b> thiết bị.
            ${st.totals.guardsOnline === 0 ? 'Cần nhắc bộ phận trực ban đăng nhập thiết bị trực.' : 'Nút SOS sẽ được tiếp nhận ngay.'}
          </div>
        </div>
      </div>
    </div>`;
}

/* ------------------------ Vụ việc & cảnh báo -------------------------- */

function serious(body, root) {
  const reports = cache.reports;
  const alerts = cache.alerts.filter((a) => a.status !== 'da_dong');

  body.innerHTML = `
    <div class="panel">
      <h2>Cảnh báo khẩn cấp đang mở</h2>
      <p class="desc">Ban giám hiệu nhận cảnh báo đồng thời với trực ban để bảo đảm không bỏ sót tình huống.</p>
      ${alerts.length ? alerts.map((a) => `
        <div class="guard-alert ${a.status}">
          <div class="ga-top">
            <div class="ga-area">${esc(a.area)}</div>
            <div class="ga-timer">${clock((Date.now() - new Date(a.createdAt)) / 1000)}</div>
          </div>
          <div class="ga-meta">Mã ${esc(a.code)} · ${STATUS_NAME[a.status]}${a.ackBy ? ` · ${esc(a.ackBy)}` : ''}</div>
          ${a.note ? `<div class="note-box">${esc(a.note)}</div>` : ''}
          ${a.coords ? `<div style="margin:8px 0">${mapLinkHtml(a.coords)}</div>` : ''}
          ${a.escalated ? '<div class="escal">Đã leo thang: trực ban không xác nhận trong 60 giây.</div>' : ''}
        </div>`).join('') : '<div class="empty"><div class="big">🟢</div>Không có cảnh báo nào đang mở.</div>'}
    </div>

    <div class="panel">
      <h2>Danh sách vụ việc toàn trường</h2>
      <p class="desc">Sắp xếp theo thời gian gửi. Mỗi lượt mở hồ sơ mức nghiêm trọng đều được ghi nhật ký truy vết.</p>
      ${reports.map((r) => `
        <div class="list-item ${r.overdue ? 'hot' : ''}">
          <div class="li-top">
            <div style="flex:1;min-width:240px">
              <div class="li-code mono">${esc(r.code)} · ${esc(r.type)}</div>
              <div class="li-desc">${esc(r.description)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${levelBadge(r.level)}${statusBadge(r.status)}${r.overdue ? '<span class="badge b-overdue">Quá hạn</span>' : ''}
            </div>
          </div>
          <div class="li-meta">
            <span>${esc(r.reporter)}</span><span>${esc(r.area)}</span>
            ${r.classId ? `<span>Lớp ${esc(r.classId)}</span>` : ''}
            <span>${timeAgo(r.createdAt)}</span><span>${esc(dueText(r))}</span>
          </div>
          ${r.coords ? `<div style="margin-top:8px">${mapLinkHtml(r.coords)}</div>` : ''}
          <div class="li-actions">
            ${r.status !== 'da_xu_ly' ? `<button class="btn btn-primary btn-sm" data-close="${r.id}">Đánh dấu đã can thiệp</button>` : ''}
            ${r.notes?.length ? `<button class="btn btn-line btn-sm" data-notes="${r.id}">Xem ${r.notes.length} ghi chú xử lý</button>` : ''}
          </div>
        </div>`).join('')}
    </div>`;

  body.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', async () => {
    await post(`/api/reports/${b.dataset.close}/status`, { status: 'da_xu_ly' });
    toast('Đã đánh dấu vụ việc hoàn tất', 'sage');
    render(root);
  }));
  body.querySelectorAll('[data-notes]').forEach((b) => b.addEventListener('click', () => {
    const r = cache.reports.find((x) => x.id === Number(b.dataset.notes));
    modal({
      title: 'Lịch sử xử lý ' + r.code,
      bodyHtml: r.notes.map((n) => `<div class="note-box"><b>${esc(n.by)} · ${fmtTime(n.at)}</b><br>${esc(n.text)}</div>`).join(''),
    });
  }));
}

/* -------------------------- Tài khoản & ca trực ----------------------- */

async function accounts(body, root) {
  const [{ users }, { shifts }] = await Promise.all([get('/api/users'), get('/api/shifts')]);

  body.innerHTML = `
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div><h2>Tài khoản hệ thống</h2>
          <p class="desc" style="margin:0">Cấp tài khoản mới cho giáo viên, tư vấn tâm lý hoặc trực ban; khóa tài khoản khi cần.</p></div>
        <button class="btn btn-primary btn-sm" id="addUser">Thêm tài khoản</button>
      </div>
      <div class="table-scroll" style="margin-top:16px"><table class="table">
        <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Vai trò</th><th>Đơn vị</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${users.map((u) => `
          <tr>
            <td>${esc(u.name)}${u.mustChangePassword ? ' <span class="badge b-moi">Chưa đổi mật khẩu</span>' : ''}</td>
            <td class="mono">${esc(u.username)}</td>
            <td>${esc(u.roleLabel)}</td>
            <td>${esc(u.title || (u.classId ? 'Lớp ' + u.classId : '—'))}</td>
            <td>${u.active ? '<span class="badge b-da_xu_ly">Hoạt động</span>' : '<span class="badge b-nghiem_trong">Đã khóa</span>'}</td>
            <td style="text-align:right">
              ${u.id === session.user.id ? '<span class="li-code">Đang đăng nhập</span>'
                : `<button class="btn btn-line btn-sm" data-toggle="${u.id}">${u.active ? 'Khóa' : 'Mở khóa'}</button>`}
            </td>
          </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div><h2>Lịch phân ca trực ban</h2>
          <p class="desc" style="margin:0">Nút SOS định tuyến theo lịch này, bảo đảm luôn có người nhận cảnh báo.</p></div>
        <button class="btn btn-line btn-sm" id="addShift">Thêm ca trực</button>
      </div>
      <div class="table-scroll" style="margin-top:16px"><table class="table">
        <thead><tr><th>Ca</th><th>Người trực</th><th>Khung giờ</th><th>Ngày trong tuần</th></tr></thead>
        <tbody>${shifts.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.name)}</td>
          <td class="mono">${esc(s.from)} – ${esc(s.to)}</td><td>${esc(s.days)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;

  body.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const r = await post(`/api/users/${b.dataset.toggle}/toggle`, {});
    toast(r.active ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản', 'sage');
    accounts(body, root);
  }));

  $('#addUser', body).addEventListener('click', () => {
    modal({
      title: 'Cấp tài khoản mới',
      bodyHtml: `
        <div class="field"><label>Họ và tên</label><input id="nuName" placeholder="Nguyễn Thị F"></div>
        <div class="field"><label>Tên đăng nhập</label><input id="nuUser" placeholder="gv.nguyenthif"></div>
        <div class="field"><label>Vai trò</label><select id="nuRole">
          <option value="teacher">Giáo viên chủ nhiệm</option>
          <option value="counselor">Tư vấn tâm lý</option>
          <option value="guard">Trực ban / Bảo vệ</option>
          <option value="student">Học sinh</option>
        </select></div>
        <div class="field"><label>Chức danh / lớp phụ trách</label><input id="nuTitle" placeholder="GVCN lớp 10A2"></div>
        <div class="field"><label>Lớp (nếu có)</label><input id="nuClass" placeholder="10A2"></div>
        <div id="nuOut"></div>`,
      confirmText: 'Tạo tài khoản',
      onConfirm: async (m) => {
        try {
          const r = await post('/api/users', {
            name: m.querySelector('#nuName').value.trim(),
            username: m.querySelector('#nuUser').value.trim(),
            role: m.querySelector('#nuRole').value,
            title: m.querySelector('#nuTitle').value.trim(),
            classId: m.querySelector('#nuClass').value.trim() || null,
          });
          toast(`Đã tạo ${r.user.username} · mật khẩu tạm: ${r.user.tempPassword}`, 'sage');
          accounts(body, root);
        } catch (ex) {
          m.querySelector('#nuOut').innerHTML = `<div class="err">${esc(ex.message)}</div>`;
          return false;
        }
      },
    });
  });

  $('#addShift', body).addEventListener('click', async () => {
    const guards = users.filter((u) => u.role === 'guard');
    modal({
      title: 'Thêm ca trực',
      bodyHtml: `
        <div class="field"><label>Người trực</label><select id="shUser">
          ${guards.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
        <div class="grid2">
          <div class="field"><label>Bắt đầu</label><input id="shFrom" value="06:30"></div>
          <div class="field"><label>Kết thúc</label><input id="shTo" value="13:30"></div>
        </div>
        <div class="field"><label>Tên ca</label><input id="shLabel" value="Ca sáng"></div>
        <div class="field"><label>Ngày trong tuần</label><input id="shDays" value="Thứ 2 – Thứ 7"></div>`,
      confirmText: 'Lưu ca trực',
      onConfirm: async (m) => {
        await post('/api/shifts', {
          userId: Number(m.querySelector('#shUser').value),
          from: m.querySelector('#shFrom').value,
          to: m.querySelector('#shTo').value,
          label: m.querySelector('#shLabel').value,
          days: m.querySelector('#shDays').value,
        });
        toast('Đã thêm ca trực', 'sage');
        accounts(body, root);
      },
    });
  });
}

/* ---------------------------- Nhật ký --------------------------------- */

async function auditView(body) {
  const { audit } = await get('/api/audit');
  body.innerHTML = `
    <div class="panel">
      <h2>Nhật ký truy vết</h2>
      <p class="desc">Ghi lại mọi lượt đăng nhập, truy cập hồ sơ nghiêm trọng và thao tác quản trị — phục vụ đối chiếu trách nhiệm khi cần.</p>
      <div class="table-scroll"><table class="table">
        <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th></tr></thead>
        <tbody>${audit.map((a) => `<tr>
          <td class="mono" style="white-space:nowrap">${fmtTime(a.at)}</td>
          <td>${esc(a.actor)}</td><td>${esc(a.action)}</td>
          <td class="mono">${esc(a.target)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

export function onEvent(event, payload, rerender) {
  if (event === 'alert:new') toast(`Cảnh báo SOS tại ${payload.alert.area}`, 'coral');
  if (event === 'alert:escalate') toast('Trực ban chưa xác nhận cảnh báo sau 60 giây', 'coral');
  rerender();
}

export function cleanup() {}
