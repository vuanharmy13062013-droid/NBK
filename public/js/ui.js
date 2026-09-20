/** ui.js — Các tiện ích giao diện dùng chung. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ------------------------------ Nhãn ------------------------------- */

export const LEVEL_NAME = {
  nhe: 'Mức nhẹ',
  trung_binh: 'Trung bình',
  nghiem_trong: 'Nghiêm trọng',
  khan_cap: 'Khẩn cấp',
};

export const STATUS_NAME = {
  moi: 'Mới',
  dang_xu_ly: 'Đang xử lý',
  da_xu_ly: 'Đã xử lý',
  da_tiep_nhan: 'Đã tiếp nhận',
  tai_hien_truong: 'Đang xử lý tại chỗ',
  da_dong: 'Đã đóng',
};

export const badge = (kind, text) => `<span class="badge b-${kind}">${esc(text)}</span>`;
export const levelBadge = (l) => badge(l, LEVEL_NAME[l] || l);
export const statusBadge = (s) => badge(s, STATUS_NAME[s] || s);

/* -------------------------------- Vị trí ------------------------------ */

/** Lấy toạ độ GPS hiện tại của trình duyệt, trả về null nếu bị từ chối/không hỗ trợ. */
export function getGeoPosition(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
      },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

/** Trả về đoạn HTML liên kết mở vị trí trên Google Maps, hoặc chuỗi rỗng nếu không có toạ độ. */
export function mapLinkHtml(coords) {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return '';
  const url = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
  return `<a class="map-link" href="${url}" target="_blank" rel="noopener noreferrer">📍 Xem vị trí trên bản đồ</a>`;
}

/* ------------------------------ Thời gian --------------------------- */

export function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff} giây trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    + ' · ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function dueText(r) {
  if (r.status === 'da_xu_ly') return 'Đã hoàn tất';
  const left = Math.round((new Date(r.dueAt) - Date.now()) / 60000);
  if (left < 0) return `Quá hạn ${Math.abs(left)} phút`;
  if (left < 60) return `Còn ${left} phút theo cam kết`;
  return `Còn ${Math.round(left / 60)} giờ theo cam kết`;
}

/* ------------------------------ Thông báo --------------------------- */

export function toast(message, tone = '') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

/* ------------------------------- Modal ------------------------------ */

export function modal({ title, bodyHtml, confirmText = 'Xác nhận', onConfirm, cancelText = 'Đóng' }) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-bg" data-close="1">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <div class="modal-body">${bodyHtml}</div>
        <div class="close-row">
          <button class="btn btn-line" data-close="1">${esc(cancelText)}</button>
          ${onConfirm ? `<button class="btn btn-primary" id="modalOk">${esc(confirmText)}</button>` : ''}
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', (e) => {
    if (e.target === n) close();
  }));
  if (onConfirm) {
    root.querySelector('#modalOk').addEventListener('click', async () => {
      const ok = await onConfirm(root.querySelector('.modal-body'));
      if (ok !== false) close();
    });
  }
  return close;
}

/* ---------------------- Còi báo động cho trực ban -------------------- */

let audioCtx = null;

export function siren(times = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for (let i = 0; i < times; i++) {
      const t0 = audioCtx.currentTime + i * 0.42;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(760, t0);
      osc.frequency.linearRampToValueAtTime(1180, t0 + 0.18);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    }
  } catch { /* trình duyệt chặn âm thanh khi chưa có tương tác */ }
  if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]);
}

export function notifyDesktop(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') new Notification(title, { body });
  else if (Notification.permission !== 'denied') Notification.requestPermission();
}

/* ------------------------------- Biểu tượng -------------------------- */

const svg = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icons = {
  student: svg('<path d="M4 4.5C4 3.7 4.7 3 5.5 3H12v18H5.5c-.8 0-1.5-.7-1.5-1.5v-15Z"/><path d="M20 4.5c0-.8-.7-1.5-1.5-1.5H12v18h6.5c.8 0 1.5-.7 1.5-1.5v-15Z"/>'),
  teacher: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M8 11h8M8 15h5"/>'),
  admin: svg('<rect x="4" y="3" width="10" height="18"/><rect x="14" y="9" width="6" height="12"/><path d="M7 7h1M10 7h1M7 11h1M10 11h1M7 15h1M10 15h1"/>'),
  guard: svg('<path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6l7-3Z"/><path d="M9.5 12.2l1.8 1.8 3.2-3.6"/>'),
};
