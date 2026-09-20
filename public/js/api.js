/** api.js — Lớp gọi API và giữ phiên đăng nhập ở trình duyệt. */

const KEY = 'sos.session';

export const session = {
  get token() { return this.data?.token || null; },
  get user() { return this.data?.user || null; },
  get data() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  },
  set(token, user) { localStorage.setItem(KEY, JSON.stringify({ token, user })); },
  clear() { localStorage.removeItem(KEY); },
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let payload = {};
  try { payload = await res.json(); } catch { /* phản hồi rỗng */ }

  if (!res.ok) {
    if (res.status === 401 && session.token) {
      session.clear();
      window.dispatchEvent(new CustomEvent('sos:signed-out'));
    }
    throw new ApiError(payload.error || 'Không kết nối được máy chủ.', res.status);
  }
  return payload;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });

/** Mở kênh thời gian thực; trả về hàm đóng kết nối. */
export function openStream(handlers = {}) {
  if (!session.token) return () => {};
  const es = new EventSource(`/api/stream?token=${encodeURIComponent(session.token)}`);
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => {
      let payload = {};
      try { payload = JSON.parse(e.data); } catch { /* bỏ qua */ }
      fn(payload);
    });
  }
  es.addEventListener('error', () => handlers.onerror?.());
  es.addEventListener('ready', () => handlers.onopen?.());
  return () => es.close();
}
