/** student.js — Giao diện học sinh: nút SOS, gửi báo cáo, theo dõi, góc chia sẻ. */

import { get, post, session } from '../api.js';
import {
  $, esc, toast, timeAgo, fmtTime, clock, levelBadge, statusBadge, dueText, LEVEL_NAME,
  getGeoPosition, mapLinkHtml,
} from '../ui.js';

let meta = null;
let tab = 'sos';
let sosStep = 'idle'; // idle | confirm
let myAlert = null;
let reports = [];
let thread = null;
let openChat = null;
let ticker = null;

export async function render(el) {
  if (!meta) meta = await get('/api/meta');
  const user = session.user;

  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h1>Chào ${esc(user.name)}</h1>
        <div class="sub">${user.role === 'anon'
          ? 'Bạn đang dùng chế độ ẩn danh — nhà trường không thấy tên của bạn.'
          : `${esc(user.title || 'Học sinh')}${user.classId ? ' · Lớp ' + esc(user.classId) : ''} · Danh tính của bạn chỉ hiện khi bạn chọn không ẩn danh.`}</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab ${tab === 'sos' ? 'on' : ''}" data-tab="sos">Khẩn cấp &amp; gửi báo cáo</button>
      <button class="tab ${tab === 'mine' ? 'on' : ''}" data-tab="mine">Báo cáo của tôi</button>
      <button class="tab ${tab === 'share' ? 'on' : ''}" data-tab="share">Góc chia sẻ</button>
    </div>
    <div id="tabBody"></div>`;

  el.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab; render(el);
  }));

  const body = $('#tabBody', el);
  if (tab === 'sos') await renderSos(body, el);
  if (tab === 'mine') await renderMine(body, el);
  if (tab === 'share') await renderShare(body, el);
}

/* ------------------------------ Tab 1: SOS ---------------------------- */

async function renderSos(body, root) {
  if (!myAlert) {
    try {
      const { alerts } = await get('/api/alerts/mine');
      myAlert = alerts.find((a) => a.status !== 'da_dong') || null;
    } catch { /* ẩn danh mới, chưa có gì */ }
  }

  body.innerHTML = `
    <div class="two-col">
      <div class="panel">
        <h2>Gửi báo cáo vụ việc</h2>
        <p class="desc">Ba bước, không quá một phút. Hệ thống tự gợi ý mức độ và chuyển tới đúng người phụ trách.</p>
        <div class="field">
          <label>1 · Loại vụ việc</label>
          <select id="repType">${meta.types.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>2 · Chuyện gì đang xảy ra?</label>
          <textarea id="repDesc" rows="4" placeholder="Ví dụ: bạn cùng lớp liên tục nhắn tin đe dọa và rủ các bạn khác không chơi với em..."></textarea>
        </div>
        <div class="grid2">
          <div class="field">
            <label>Khu vực xảy ra</label>
            <select id="repArea">${meta.areas.map((a) => `<option>${esc(a)}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Mức khẩn cấp em tự đánh giá</label>
            <select id="repUrgency">
              <option value="1">1 · Cần được biết</option>
              <option value="2" selected>2 · Cần can thiệp sớm</option>
              <option value="3">3 · Có nguy cơ tổn hại</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Minh chứng (tùy chọn)</label>
          <input id="repEvidence" placeholder="Dán liên kết ảnh/ghi âm, hoặc mô tả minh chứng em đang giữ">
        </div>
        <div class="toggle-row" style="margin-bottom:14px">
          <div class="switch ${session.user.role === 'anon' ? 'on' : 'on'}" id="anonSwitch"><div class="knob"></div></div>
          <span>Gửi ẩn danh — giáo viên không thấy tên và lớp của em</span>
        </div>
        <div class="toggle-row" style="margin-bottom:14px">
          <div class="switch" id="gpsSwitch"><div class="knob"></div></div>
          <span>Đính kèm vị trí GPS hiện tại (không bắt buộc) — giúp trực ban tìm đúng chỗ nhanh hơn</span>
        </div>
        <div id="repOut"></div>
        <button class="btn btn-primary" id="repSend">3 · Gửi báo cáo</button>
      </div>

      <div>
        <div class="panel">
          <div class="sos-block">
            <button class="sos-btn" id="sosBtn" aria-label="Nút cấp báo khẩn cấp">SOS</button>
            <p class="sos-caption">Chỉ dùng khi vụ việc <b>đang xảy ra</b> và cần người tới ngay.
              Cảnh báo sẽ tới trực ban và Ban giám hiệu trong vòng 60 giây.</p>
          </div>
          <div id="sosArea"></div>
        </div>
      </div>
    </div>`;

  // Ẩn danh mặc định bật
  let anonymous = true;
  const sw = $('#anonSwitch', body);
  if (session.user.role === 'anon') {
    sw.style.opacity = '.6';
    sw.style.pointerEvents = 'none';
  } else {
    sw.addEventListener('click', () => { anonymous = !anonymous; sw.classList.toggle('on', anonymous); });
  }

  // Vị trí GPS mặc định tắt — học sinh tự chọn có chia sẻ hay không.
  let shareLocation = false;
  const gpsSw = $('#gpsSwitch', body);
  gpsSw.addEventListener('click', () => { shareLocation = !shareLocation; gpsSw.classList.toggle('on', shareLocation); });

  $('#repSend', body).addEventListener('click', async () => {
    const out = $('#repOut', body);
    const btn = $('#repSend', body);
    btn.disabled = true;
    try {
      const evidence = $('#repEvidence', body).value.trim();
      let coords = null;
      if (shareLocation) {
        coords = await getGeoPosition();
        if (!coords) toast('Không lấy được vị trí (có thể em đã từ chối quyền truy cập) — báo cáo vẫn được gửi bình thường.', 'amber');
      }
      const r = await post('/api/reports', {
        type: $('#repType', body).value,
        description: $('#repDesc', body).value,
        area: $('#repArea', body).value,
        urgency: Number($('#repUrgency', body).value),
        anonymous,
        coords,
        evidence: evidence ? [evidence] : [],
      });
      out.innerHTML = `<div class="ok-box">
        Đã gửi. Mã tra cứu của em là <b class="mono">${esc(r.code)}</b> — hãy lưu lại để theo dõi tiến độ.<br>
        Hệ thống xếp vụ việc ở <b>${esc(LEVEL_NAME[r.level])}</b>, chuyển tới <b>${esc(r.receiver)}</b>,
        cam kết phản hồi trong ${r.slaMinutes >= 60 ? Math.round(r.slaMinutes / 60) + ' giờ' : r.slaMinutes + ' phút'}.
        ${coords ? '<br>Đã đính kèm vị trí GPS hiện tại của em.' : ''}
      </div>`;
      $('#repDesc', body).value = '';
      $('#repEvidence', body).value = '';
      reports = [];
      toast('Báo cáo đã được gửi tới nhà trường', 'sage');
    } catch (ex) {
      out.innerHTML = `<div class="err">${esc(ex.message)}</div>`;
    }
    btn.disabled = false;
  });

  $('#sosBtn', body).addEventListener('click', () => {
    sosStep = 'confirm';
    paintSos(body, root);
  });

  paintSos(body, root);
}

function paintSos(body, root) {
  const zone = $('#sosArea', body);
  if (!zone) return;

  if (myAlert) {
    const steps = ['moi', 'da_tiep_nhan', 'tai_hien_truong', 'da_dong'];
    const idx = steps.indexOf(myAlert.status);
    const elapsed = (Date.now() - new Date(myAlert.createdAt).getTime()) / 1000;
    zone.innerHTML = `
      <div class="alert-active">
        <div class="row1">
          <div class="status"><span class="siren-dot"></span>${
            myAlert.status === 'moi' ? 'Đang gửi tới trực ban...' :
            myAlert.status === 'da_tiep_nhan' ? `${esc(myAlert.ackBy || 'Trực ban')} đã tiếp nhận, đang tới` :
            myAlert.status === 'tai_hien_truong' ? 'Trực ban đã có mặt tại hiện trường' :
            'Vụ việc đã được xử lý và chuyển tuyến'}</div>
          <div class="code mono">${esc(myAlert.code)}</div>
        </div>
        <div class="track-bar"><div style="width:${((idx + 1) / 4) * 100}%"></div></div>
        <div class="track-steps">
          ${['Đã gửi', 'Tiếp nhận', 'Có mặt', 'Hoàn tất'].map((s, i) => `<span class="${i <= idx ? 'on' : ''}">${s}</span>`).join('')}
        </div>
        <div class="li-meta" style="margin-top:10px">
          <span>Khu vực: ${esc(myAlert.area)}</span>
          <span class="mono">Đã ${clock(elapsed)} kể từ khi gửi</span>
        </div>
        ${myAlert.coords ? `<div style="margin-top:10px">${mapLinkHtml(myAlert.coords)}</div>` : ''}
        ${myAlert.status === 'da_dong' ? `<button class="btn btn-line btn-sm" style="margin-top:12px" id="sosDone">Đóng theo dõi</button>` : ''}
      </div>`;
    $('#sosDone', body)?.addEventListener('click', () => { myAlert = null; paintSos(body, root); });

    if (myAlert.status === 'da_dong') { clearInterval(ticker); ticker = null; }
    else if (!ticker) {
      let tick = 0;
      ticker = setInterval(async () => {
        // Mỗi 4 giây hỏi lại máy chủ để cập nhật trạng thái do trực ban thao tác.
        if (++tick % 4 === 0 && myAlert) {
          try {
            const { alerts } = await get('/api/alerts/mine');
            const fresh = alerts.find((x) => x.id === myAlert.id);
            if (fresh) myAlert = fresh;
          } catch { /* giữ nguyên trạng thái hiện tại */ }
        }
        paintSos(body, root);
      }, 1000);
    }
    return;
  }

  clearInterval(ticker);
  ticker = null;
  if (sosStep !== 'confirm') { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <div class="sos-confirm">
      <h4>Xác nhận cấp báo khẩn cấp</h4>
      <div class="field"><label>Vụ việc đang xảy ra ở đâu?</label>
        <select id="sosAreaSel">${meta.areas.map((a) => `<option>${esc(a)}</option>`).join('')}</select></div>
      <div class="field"><label>Mô tả nhanh (không bắt buộc)</label>
        <input id="sosNote" placeholder="Ví dụ: hai nhóm đang giằng co, có bạn bị đẩy ngã"></div>
      <div class="toggle-row" style="margin-bottom:14px">
        <div class="switch" id="sosGpsSwitch"><div class="knob"></div></div>
        <span>Đính kèm vị trí GPS hiện tại — giúp trực ban tìm đúng chỗ nhanh hơn</span>
      </div>
      <div class="btn-row">
        <button class="btn btn-coral" id="sosGo">Gửi cảnh báo ngay</button>
        <button class="btn btn-line" id="sosCancel">Hủy</button>
      </div>
      <p class="hint" style="margin-bottom:0">Cảnh báo giả sẽ được ghi nhật ký. Hãy chỉ dùng khi thực sự cần.</p>
    </div>`;

  let sosShareLocation = false;
  $('#sosGpsSwitch', body).addEventListener('click', () => {
    sosShareLocation = !sosShareLocation;
    $('#sosGpsSwitch', body).classList.toggle('on', sosShareLocation);
  });

  $('#sosCancel', body).addEventListener('click', () => { sosStep = 'idle'; paintSos(body, root); });
  $('#sosGo', body).addEventListener('click', async () => {
    try {
      const coords = sosShareLocation ? await getGeoPosition() : null;
      if (sosShareLocation && !coords) toast('Không lấy được vị trí — cảnh báo vẫn được gửi bình thường.', 'amber');
      const r = await post('/api/alerts', {
        area: $('#sosAreaSel', body).value,
        note: $('#sosNote', body).value,
        coords,
      });
      myAlert = r.alert;
      sosStep = 'idle';
      toast(r.guardsOnline > 0
        ? `Đã cấp báo — ${r.guardsOnline} thiết bị trực ban đang nhận cảnh báo`
        : 'Đã cấp báo — hệ thống đang gọi trực ban', 'coral');
      paintSos(body, root);
    } catch (ex) {
      toast(ex.message, 'coral');
    }
  });
}

/* --------------------------- Tab 2: Báo cáo ---------------------------- */

async function renderMine(body, root) {
  const { reports: list } = await get('/api/reports/mine');
  reports = list;

  body.innerHTML = `
    <div class="panel">
      <h2>Báo cáo em đã gửi</h2>
      <p class="desc">Em theo dõi được tiến độ mà không lộ danh tính. Giáo viên trả lời qua khung trao đổi ẩn danh bên dưới mỗi báo cáo.</p>
      ${list.length ? list.map(card).join('') : `
        <div class="empty"><div class="big">🗂️</div>Chưa có báo cáo nào. Khi em gửi, mã tra cứu sẽ xuất hiện ở đây.</div>`}
    </div>`;

  body.querySelectorAll('[data-chat]').forEach((b) => b.addEventListener('click', () => {
    openChat = openChat === Number(b.dataset.chat) ? null : Number(b.dataset.chat);
    renderMine(body, root);
  }));

  body.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.dataset.send);
    const input = body.querySelector(`#msg-${id}`);
    if (!input.value.trim()) return;
    await post(`/api/reports/${id}/messages`, { text: input.value.trim() });
    input.value = '';
    renderMine(body, root);
  }));
}

function card(r) {
  const open = openChat === r.id;
  return `
    <div class="list-item ${r.overdue ? 'hot' : ''}">
      <div class="li-top">
        <div>
          <div class="li-code mono">${esc(r.code)} · ${esc(r.type)}</div>
          <div class="li-desc">${esc(r.description)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${levelBadge(r.level)}${statusBadge(r.status)}</div>
      </div>
      <div class="li-meta">
        <span>${esc(r.area)}</span>
        <span>${timeAgo(r.createdAt)}</span>
        <span>${esc(dueText(r))}</span>
        ${r.handledBy ? `<span>Phụ trách: ${esc(r.handledBy)}</span>` : ''}
        ${r.anonymous ? '<span>Gửi ẩn danh</span>' : ''}
      </div>
      ${r.coords ? `<div style="margin-top:8px">${mapLinkHtml(r.coords)}</div>` : ''}
      <div class="li-actions">
        <button class="btn btn-line btn-sm" data-chat="${r.id}">
          ${open ? 'Ẩn trao đổi' : `Trao đổi với thầy cô${r.messages.length ? ` (${r.messages.length})` : ''}`}
        </button>
      </div>
      ${open ? `
        <div style="margin-top:12px">
          <div class="chat-box">
            ${r.messages.length ? r.messages.map((m) => `
              <div class="msg ${m.from === 'student' ? 'me' : 'them'}">${esc(m.text)}
                <span class="when">${m.from === 'student' ? 'Em' : esc(m.by || 'Thầy/cô')} · ${fmtTime(m.at)}</span></div>`).join('')
              : '<div class="empty" style="padding:14px">Chưa có tin nhắn. Em có thể nhắn thêm thông tin cho thầy cô.</div>'}
          </div>
          <div class="chat-input">
            <input id="msg-${r.id}" placeholder="Nhắn thêm cho thầy cô...">
            <button class="btn btn-primary btn-sm" data-send="${r.id}">Gửi</button>
          </div>
        </div>` : ''}
    </div>`;
}

/* -------------------------- Tab 3: Góc chia sẻ ------------------------- */

async function renderShare(body, root) {
  const r = await get('/api/threads/mine');
  thread = r.thread;

  body.innerHTML = `
    <div class="panel" style="max-width:720px">
      <h2>Góc chia sẻ tâm lý</h2>
      <p class="desc">Nơi để nói ra những băn khoăn chưa thành vụ việc. Chỉ tư vấn viên đọc được, và luôn dưới bí danh
        <b class="mono">${esc(thread.alias)}</b>.</p>
      <div class="chat-box" style="max-height:320px">
        ${thread.messages.length ? thread.messages.map((m) => `
          <div class="msg ${m.from === 'student' ? 'me' : 'them'}">${esc(m.text)}
            <span class="when">${m.from === 'student' ? 'Em' : esc(m.by || 'Tư vấn tâm lý')} · ${fmtTime(m.at)}</span></div>`).join('')
          : '<div class="empty" style="padding:18px">Chưa có tin nhắn nào. Em muốn bắt đầu từ điều gì?</div>'}
      </div>
      <div class="chat-input">
        <input id="shareInput" placeholder="Điều em đang băn khoăn...">
        <button class="btn btn-primary" id="shareSend">Gửi</button>
      </div>
      <p class="hint">Nếu em đang gặp nguy hiểm ngay lúc này, hãy dùng nút SOS ở tab đầu tiên thay vì nhắn ở đây.</p>
    </div>`;

  const send = async () => {
    const input = $('#shareInput', body);
    if (!input.value.trim()) return;
    await post('/api/threads/mine/messages', { text: input.value.trim() });
    input.value = '';
    renderShare(body, root);
  };
  $('#shareSend', body).addEventListener('click', send);
  $('#shareInput', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

/* --------------------------- Sự kiện thời gian thực -------------------- */

export function onEvent(event, payload, rerender) {
  if (event === 'alert:update' && myAlert && payload.alert?.id === myAlert.id) {
    myAlert = payload.alert;
    rerender();
  }
  if (event === 'thread:message' && tab === 'share') rerender();
}

export function cleanup() { clearInterval(ticker); ticker = null; }
