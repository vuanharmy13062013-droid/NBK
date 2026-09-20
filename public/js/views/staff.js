/** staff.js — Giao diện giáo viên chủ nhiệm và tư vấn tâm lý. */

import { get, post, session } from '../api.js';
import {
  $, esc, toast, timeAgo, fmtTime, levelBadge, statusBadge, dueText, STATUS_NAME, mapLinkHtml,
} from '../ui.js';

let tab = 'queue';
let filter = { status: '', level: '' };
let expanded = null;
let stats = null;

export async function render(el) {
  const user = session.user;
  const isCounselor = user.role === 'counselor';

  const [{ reports }, st] = await Promise.all([
    get('/api/reports' + query()),
    get('/api/stats'),
  ]);
  stats = st;

  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h1>${isCounselor ? 'Tư vấn tâm lý học đường' : 'Bảng xử lý của giáo viên chủ nhiệm'}</h1>
        <div class="sub">${esc(user.name)} · ${esc(user.title || '')}${user.classId ? ' · phụ trách lớp ' + esc(user.classId) : ''}</div>
      </div>
      <div class="btn-row">
        <button class="btn btn-line btn-sm" id="refresh">Làm mới</button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card"><div class="n">${st.totals.reports}</div><div class="l">Báo cáo thuộc phạm vi</div></div>
      <div class="stat-card"><div class="n">${st.totals.pending}</div><div class="l">Chưa hoàn tất</div></div>
      <div class="stat-card ${st.totals.overdue ? 'warn' : ''}"><div class="n">${st.totals.overdue}</div><div class="l">Quá hạn cam kết</div></div>
      <div class="stat-card"><div class="n">${st.totals.reportsThisWeek}</div><div class="l">Phát sinh trong 7 ngày</div></div>
    </div>

    <div class="tabs">
      <button class="tab ${tab === 'queue' ? 'on' : ''}" data-tab="queue">Hàng đợi báo cáo</button>
      ${isCounselor ? `<button class="tab ${tab === 'share' ? 'on' : ''}" data-tab="share">Góc chia sẻ</button>` : ''}
      <button class="tab ${tab === 'stats' ? 'on' : ''}" data-tab="stats">Điểm nóng của lớp</button>
    </div>
    <div id="tabBody"></div>`;

  $('#refresh', el).addEventListener('click', () => render(el));
  el.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(el); }));

  const body = $('#tabBody', el);
  if (tab === 'queue') renderQueue(body, reports, el);
  if (tab === 'share') await renderThreads(body, el);
  if (tab === 'stats') renderStats(body, st);
}

const query = () => {
  const p = [];
  if (filter.status) p.push('status=' + filter.status);
  if (filter.level) p.push('level=' + filter.level);
  return p.length ? '?' + p.join('&') : '';
};

/* ----------------------------- Hàng đợi ------------------------------- */

function renderQueue(body, reports, root) {
  body.innerHTML = `
    <div class="panel">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <select id="fStatus" style="max-width:200px" class="btn btn-line btn-sm">
          <option value="">Mọi trạng thái</option>
          ${['moi', 'dang_xu_ly', 'da_xu_ly'].map((s) => `<option value="${s}" ${filter.status === s ? 'selected' : ''}>${STATUS_NAME[s]}</option>`).join('')}
        </select>
        <select id="fLevel" style="max-width:200px" class="btn btn-line btn-sm">
          <option value="">Mọi mức độ</option>
          ${['nhe', 'trung_binh', 'nghiem_trong'].map((s) => `<option value="${s}" ${filter.level === s ? 'selected' : ''}>${s === 'nhe' ? 'Mức nhẹ' : s === 'trung_binh' ? 'Trung bình' : 'Nghiêm trọng'}</option>`).join('')}
        </select>
      </div>
      ${reports.length ? reports.map(row).join('') : `
        <div class="empty"><div class="big">✅</div>Không có báo cáo nào khớp bộ lọc hiện tại.</div>`}
    </div>`;

  $('#fStatus', body).addEventListener('change', (e) => { filter.status = e.target.value; render(root); });
  $('#fLevel', body).addEventListener('change', (e) => { filter.level = e.target.value; render(root); });

  body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
    expanded = expanded === Number(b.dataset.open) ? null : Number(b.dataset.open);
    render(root);
  }));

  body.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await post(`/api/reports/${b.dataset.id}/status`, { status: b.dataset.status });
      toast('Đã cập nhật trạng thái ' + STATUS_NAME[b.dataset.status].toLowerCase(), 'sage');
      render(root);
    } catch (ex) { toast(ex.message, 'coral'); }
  }));

  body.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', async () => {
    const input = body.querySelector(`#note-${b.dataset.note}`);
    if (!input.value.trim()) return;
    await post(`/api/reports/${b.dataset.note}/notes`, { text: input.value.trim() });
    toast('Đã lưu ghi chú xử lý', 'sage');
    render(root);
  }));

  body.querySelectorAll('[data-reply]').forEach((b) => b.addEventListener('click', async () => {
    const input = body.querySelector(`#reply-${b.dataset.reply}`);
    if (!input.value.trim()) return;
    await post(`/api/reports/${b.dataset.reply}/messages`, { text: input.value.trim() });
    render(root);
  }));
}

function row(r) {
  const open = expanded === r.id;
  return `
    <div class="list-item ${r.overdue ? 'hot' : ''}">
      <div class="li-top">
        <div style="flex:1;min-width:240px">
          <div class="li-code mono">${esc(r.code)} · ${esc(r.type)}</div>
          <div class="li-desc">${esc(r.description)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${levelBadge(r.level)}${statusBadge(r.status)}
          ${r.overdue ? '<span class="badge b-overdue">Quá hạn</span>' : ''}
        </div>
      </div>
      <div class="li-meta">
        <span>Người gửi: ${esc(r.reporter)}</span>
        <span>${esc(r.area)}</span>
        ${r.classId ? `<span>Lớp ${esc(r.classId)}</span>` : ''}
        <span>${timeAgo(r.createdAt)}</span>
        <span>${esc(dueText(r))}</span>
      </div>
      ${r.coords ? `<div style="margin-top:8px">${mapLinkHtml(r.coords)}</div>` : ''}
      <div class="li-actions">
        ${r.status !== 'dang_xu_ly' ? `<button class="btn btn-primary btn-sm" data-status="dang_xu_ly" data-id="${r.id}">Nhận xử lý</button>` : ''}
        ${r.status !== 'da_xu_ly' ? `<button class="btn btn-line btn-sm" data-status="da_xu_ly" data-id="${r.id}">Đánh dấu đã xử lý</button>` : ''}
        <button class="btn btn-line btn-sm" data-open="${r.id}">${open ? 'Thu gọn' : `Hồ sơ vụ việc${r.messages.length ? ` · ${r.messages.length} tin nhắn` : ''}`}</button>
      </div>
      ${open ? detail(r) : ''}
    </div>`;
}

function detail(r) {
  return `
    <div style="margin-top:14px;border-top:1px dashed var(--line);padding-top:14px">
      <div class="grid2">
        <div>
          <b style="font-size:12.5px">Ghi chú xử lý</b>
          ${(r.notes || []).map((n) => `<div class="note-box"><b>${esc(n.by)} · ${fmtTime(n.at)}</b><br>${esc(n.text)}</div>`).join('')
            || '<div class="note-box">Chưa có ghi chú nào.</div>'}
          <div class="chat-input" style="margin-top:10px">
            <input id="note-${r.id}" placeholder="Ghi lại bước đã làm...">
            <button class="btn btn-line btn-sm" data-note="${r.id}">Lưu</button>
          </div>
        </div>
        <div>
          <b style="font-size:12.5px">Trao đổi ẩn danh với học sinh</b>
          <div class="chat-box" style="margin-top:8px;max-height:180px">
            ${(r.messages || []).length ? r.messages.map((m) => `
              <div class="msg ${m.from === 'staff' ? 'me' : 'them'}">${esc(m.text)}
                <span class="when">${m.from === 'staff' ? esc(m.by || 'Thầy/cô') : 'Học sinh'} · ${fmtTime(m.at)}</span></div>`).join('')
              : '<div class="empty" style="padding:12px">Chưa có trao đổi.</div>'}
          </div>
          <div class="chat-input">
            <input id="reply-${r.id}" placeholder="Trả lời học sinh (không thấy danh tính)...">
            <button class="btn btn-primary btn-sm" data-reply="${r.id}">Gửi</button>
          </div>
        </div>
      </div>
    </div>`;
}

/* --------------------------- Góc chia sẻ ------------------------------ */

let openThread = null;

async function renderThreads(body, root) {
  const { threads } = await get('/api/threads');
  body.innerHTML = `
    <div class="panel">
      <h2>Góc chia sẻ tâm lý</h2>
      <p class="desc">Học sinh xuất hiện dưới bí danh. Hãy trả lời bằng giọng điệu nhẹ nhàng, không truy hỏi danh tính.</p>
      ${threads.length ? threads.map((t) => {
        const open = openThread === t.id;
        const last = t.messages.at(-1);
        return `
        <div class="list-item">
          <div class="li-top">
            <div>
              <div class="li-code mono">${esc(t.alias)}</div>
              <div class="li-desc">${esc(last ? last.text : 'Chưa có nội dung')}</div>
            </div>
            <span class="badge b-moi">${t.messages.length} tin</span>
          </div>
          <div class="li-actions">
            <button class="btn btn-line btn-sm" data-thread="${t.id}">${open ? 'Thu gọn' : 'Mở cuộc trò chuyện'}</button>
          </div>
          ${open ? `
            <div style="margin-top:12px">
              <div class="chat-box">
                ${t.messages.map((m) => `
                  <div class="msg ${m.from === 'counselor' ? 'me' : 'them'}">${esc(m.text)}
                    <span class="when">${m.from === 'counselor' ? esc(m.by || 'Tư vấn') : esc(t.alias)} · ${fmtTime(m.at)}</span></div>`).join('')}
              </div>
              <div class="chat-input">
                <input id="tr-${t.id}" placeholder="Phản hồi cho học sinh...">
                <button class="btn btn-primary btn-sm" data-treply="${t.id}">Gửi</button>
              </div>
            </div>` : ''}
        </div>`;
      }).join('') : '<div class="empty"><div class="big">💬</div>Chưa có học sinh nào gửi tâm sự.</div>'}
    </div>`;

  body.querySelectorAll('[data-thread]').forEach((b) => b.addEventListener('click', () => {
    openThread = openThread === Number(b.dataset.thread) ? null : Number(b.dataset.thread);
    renderThreads(body, root);
  }));
  body.querySelectorAll('[data-treply]').forEach((b) => b.addEventListener('click', async () => {
    const input = body.querySelector(`#tr-${b.dataset.treply}`);
    if (!input.value.trim()) return;
    await post(`/api/threads/${b.dataset.treply}/messages`, { text: input.value.trim() });
    renderThreads(body, root);
  }));
}

/* ----------------------------- Thống kê ------------------------------- */

function renderStats(body, st) {
  const max = Math.max(1, ...st.hotspots.map((h) => h.count));
  const maxHour = Math.max(1, ...st.byHour);
  body.innerHTML = `
    <div class="two-col">
      <div class="panel">
        <h2>Khu vực phát sinh nhiều vụ việc</h2>
        <p class="desc">Dùng để đề xuất tăng giám sát vào đúng chỗ, đúng giờ.</p>
        ${st.hotspots.map((h) => `
          <div class="hs-row">
            <div class="hs-label">${esc(h.area)}</div>
            <div class="hs-track"><div class="hs-fill" style="width:${(h.count / max) * 100}%"></div></div>
            <div class="hs-val">${h.count}</div>
          </div>`).join('') || '<div class="empty">Chưa đủ dữ liệu.</div>'}
      </div>
      <div class="panel">
        <h2>Khung giờ phát sinh</h2>
        <p class="desc">Theo giờ trong ngày, tính trên toàn bộ báo cáo thuộc phạm vi của bạn.</p>
        <div class="spark">
          ${st.byHour.map((n, h) => `<i class="${n === maxHour && n > 0 ? 'peak' : ''}" style="height:${(n / maxHour) * 100}%" title="${h}h: ${n} vụ"></i>`).join('')}
        </div>
        <div class="spark-x"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
      </div>
    </div>`;
}

export function onEvent(event, payload, rerender) {
  if (['report:new', 'report:update', 'report:message', 'thread:message'].includes(event)) rerender();
}

export function cleanup() {}
