/** guard.js — Bàn trực ban: nhận cảnh báo SOS thời gian thực và xử lý tại chỗ. */

import { get, post, session } from '../api.js';
import { $, esc, toast, clock, fmtTime, siren, mapLinkHtml } from '../ui.js';

let alerts = [];
let shifts = [];
let ticker = null;
let soundOn = true;

export async function render(el) {
  const [a, s] = await Promise.all([get('/api/alerts'), get('/api/shifts')]);
  alerts = a.alerts;
  shifts = s.shifts;

  const active = alerts.filter((x) => x.status !== 'da_dong');
  const done = alerts.filter((x) => x.status === 'da_dong').slice(0, 6);

  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h1>Bàn trực ban</h1>
        <div class="sub">${esc(session.user.name)} · ${esc(session.user.title || 'Trực ban')} ·
          thiết bị đang trực và nhận cảnh báo theo thời gian thực</div>
      </div>
      <div class="btn-row">
        <button class="btn btn-line btn-sm" id="soundBtn">${soundOn ? '🔔 Còi báo: bật' : '🔕 Còi báo: tắt'}</button>
        <button class="btn btn-line btn-sm" id="testBtn">Thử còi</button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card ${active.length ? 'warn' : ''}"><div class="n">${active.length}</div><div class="l">Cảnh báo đang mở</div></div>
      <div class="stat-card"><div class="n">${alerts.filter((x) => x.status === 'da_dong').length}</div><div class="l">Đã xử lý xong</div></div>
      <div class="stat-card"><div class="n mono" id="fastest">—</div><div class="l">Thời gian tiếp nhận gần nhất</div></div>
      <div class="stat-card"><div class="n">${shifts.length}</div><div class="l">Ca trực trong lịch</div></div>
    </div>

    <div class="panel">
      <h2>Cảnh báo khẩn cấp</h2>
      <p class="desc">Xác nhận tiếp nhận trong vòng 60 giây, nếu không hệ thống sẽ tự động chuyển cảnh báo lên Ban giám hiệu.</p>
      <div id="alertList">
        ${active.length ? active.map(cardHtml).join('') : `
          <div class="empty"><div class="big">🟢</div>Không có cảnh báo nào. Màn hình này sẽ tự đổ chuông khi có học sinh bấm SOS.</div>`}
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <h2>Vụ việc đã xử lý gần đây</h2>
        <p class="desc">Diễn biến ghi nhận tại hiện trường đã được chuyển tuyến cho giáo viên chủ nhiệm và tư vấn tâm lý.</p>
        ${done.length ? done.map((a2) => `
          <div class="list-item">
            <div class="li-top">
              <div><div class="li-code mono">${esc(a2.code)}</div><div class="li-desc">${esc(a2.area)}</div></div>
              <span class="badge b-da_xu_ly">Đã đóng</span>
            </div>
            <div class="li-meta"><span>${fmtTime(a2.createdAt)}</span>
              ${a2.ackAt ? `<span>Tiếp nhận sau ${clock((new Date(a2.ackAt) - new Date(a2.createdAt)) / 1000)}</span>` : ''}
              ${a2.ackBy ? `<span>${esc(a2.ackBy)}</span>` : ''}</div>
            ${a2.log.map((l) => `<div class="note-box"><b>${esc(l.by)} · ${fmtTime(l.at)}</b><br>${esc(l.text)}</div>`).join('')}
          </div>`).join('') : '<div class="empty">Chưa có vụ việc nào.</div>'}
      </div>
      <div class="panel">
        <h2>Lịch phân ca</h2>
        <p class="desc">Nút SOS luôn định tuyến tới người đang trong ca tại thời điểm cấp báo.</p>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>Ca</th><th>Người trực</th><th>Khung giờ</th><th>Ngày</th></tr></thead>
          <tbody>${shifts.map((s2) => `<tr>
            <td>${esc(s2.label)}</td><td>${esc(s2.name)}</td>
            <td class="mono">${esc(s2.from)} – ${esc(s2.to)}</td><td>${esc(s2.days)}</td></tr>`).join('')}</tbody>
        </table></div>
        <div class="note-box" style="margin-top:12px">Gọi nhanh: Ban giám hiệu <b>0905 555 666</b> · Y tế học đường <b>0905 222 333</b> · Công an phường <b>113</b></div>
      </div>
    </div>`;

  $('#soundBtn', el).addEventListener('click', () => { soundOn = !soundOn; render(el); });
  $('#testBtn', el).addEventListener('click', () => siren(2));
  bind(el);
  startTicker(el);

  const last = alerts.find((x) => x.ackAt);
  if (last) $('#fastest', el).textContent = clock((new Date(last.ackAt) - new Date(last.createdAt)) / 1000);
}

function cardHtml(a) {
  const elapsed = (Date.now() - new Date(a.createdAt).getTime()) / 1000;
  return `
    <div class="guard-alert ${a.status}" data-alert="${a.id}">
      <div class="ga-top">
        <div class="ga-area">${a.status === 'moi' ? '<span class="siren-dot"></span>' : ''}${esc(a.area)}</div>
        <div class="ga-timer" data-since="${a.createdAt}">${clock(elapsed)}</div>
      </div>
      <div class="ga-meta">
        Mã ${esc(a.code)} · gửi lúc ${fmtTime(a.createdAt)}
        ${a.classId ? ` · lớp ${esc(a.classId)}` : ''}
        ${a.ackBy ? ` · tiếp nhận bởi ${esc(a.ackBy)}` : ''}
      </div>
      ${a.note ? `<div class="note-box" style="margin-bottom:12px">Học sinh mô tả: ${esc(a.note)}</div>` : ''}
      ${a.coords ? `<div style="margin-bottom:12px">${mapLinkHtml(a.coords)}</div>` : ''}
      ${a.escalated ? `<div class="escal">Quá 60 giây chưa xác nhận — hệ thống đã chuyển cảnh báo lên Ban giám hiệu.</div>` : ''}
      <div class="ga-actions" style="margin-top:12px">
        ${a.status === 'moi' ? `<button class="btn btn-coral btn-sm" data-ack="${a.id}">Đã tiếp nhận — đang di chuyển</button>` : ''}
        ${a.status === 'da_tiep_nhan' ? `<button class="btn btn-coral btn-sm" data-onsite="${a.id}">Đã có mặt tại hiện trường</button>` : ''}
        ${a.status === 'tai_hien_truong' ? `
          <input id="log-${a.id}" placeholder="Ghi nhận nhanh diễn biến ban đầu..."
                 style="flex:1;min-width:200px;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-size:13px;font-family:inherit">
          <button class="btn btn-primary btn-sm" data-close="${a.id}">Đóng vụ việc &amp; chuyển tuyến</button>` : ''}
      </div>
      ${a.log.length ? `<div style="margin-top:12px">${a.log.map((l) => `
        <div class="log-line"><time>${fmtTime(l.at)}</time><span><b>${esc(l.by)}:</b> ${esc(l.text)}</span></div>`).join('')}</div>` : ''}
    </div>`;
}

function bind(el) {
  el.querySelectorAll('[data-ack]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await post(`/api/alerts/${b.dataset.ack}/ack`, {});
      toast('Đã xác nhận tiếp nhận — học sinh nhìn thấy trạng thái này ngay', 'sage');
      render(el);
    } catch (ex) { toast(ex.message, 'coral'); }
  }));
  el.querySelectorAll('[data-onsite]').forEach((b) => b.addEventListener('click', async () => {
    await post(`/api/alerts/${b.dataset.onsite}/onsite`, {});
    toast('Đã ghi nhận có mặt tại hiện trường', 'sage');
    render(el);
  }));
  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.close;
    const text = el.querySelector(`#log-${id}`)?.value.trim() || '';
    const r = await post(`/api/alerts/${id}/close`, { text, handover: true });
    toast(r.handoverCode
      ? `Đã đóng và chuyển tuyến — hồ sơ ${r.handoverCode} đã tới giáo viên chủ nhiệm`
      : 'Đã đóng vụ việc', 'sage');
    render(el);
  }));
}

function startTicker(el) {
  clearInterval(ticker);
  ticker = setInterval(() => {
    el.querySelectorAll('.ga-timer').forEach((t) => {
      t.textContent = clock((Date.now() - new Date(t.dataset.since).getTime()) / 1000);
    });
  }, 1000);
}

export function onEvent(event, payload, rerender) {
  if (event === 'alert:new') {
    if (soundOn) siren(4);
    toast(`CẢNH BÁO SOS tại ${payload.alert.area}`, 'coral');
    rerender();
  }
  if (event === 'alert:escalate' || event === 'alert:update') rerender();
}

export function cleanup() { clearInterval(ticker); }
