/**
 * api.js — Toàn bộ điểm cuối (endpoint) của hệ thống.
 *
 * Mỗi route khai báo sẵn danh sách vai trò được phép truy cập; bộ định tuyến
 * trong index.js sẽ chặn từ đầu nếu vai trò không nằm trong danh sách —
 * đúng nguyên tắc "biết đến đâu, thấy đến đó" của đề bài.
 */

import {
  data, save, nextId, makeCode, audit, AREAS, LEVELS, DEMO_PASSWORD,
} from './store.js';
import {
  hashPassword, verifyPassword, issueToken, createOtpChallenge, verifyOtp,
  OTP_ROLES, ROLE_LABEL, rateLimit, anonAlias,
} from './auth.js';
import { broadcast, toUser, onlineCount } from './realtime.js';

const DEMO_MODE = process.env.SOS_DEMO !== '0';
const STAFF = ['teacher', 'counselor', 'admin'];
const ALL = ['student', 'anon', 'teacher', 'counselor', 'admin', 'guard'];

export function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

class HttpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const bad = (msg) => { throw new HttpError(400, msg); };
const denied = (msg = 'Tài khoản của bạn không có quyền thực hiện thao tác này.') => { throw new HttpError(403, msg); };
const missing = (msg = 'Không tìm thấy dữ liệu.') => { throw new HttpError(404, msg); };

/* ------------------------------------------------------------------ */
/* Phân loại mức độ tự động                                            */
/* ------------------------------------------------------------------ */

const KEYWORDS = {
  nghiem_trong: ['đánh', 'hành hung', 'dao', 'vũ khí', 'chảy máu', 'trấn lột', 'cưỡng ép', 'quay clip', 'tung ảnh', 'tự tử', 'không muốn sống', 'gãy', 'bất tỉnh'],
  trung_binh: ['đe dọa', 'dọa đánh', 'cô lập', 'tẩy chay', 'nói xấu', 'nhắn tin', 'chặn đường', 'bắt nạt', 'kéo dài', 'nhiều ngày', 'nhiều lần'],
};

/** Gợi ý mức độ dựa trên từ khóa, loại vụ việc và mức khẩn cấp người gửi tự đánh giá. */
export function classify(text = '', selfUrgency = 1, type = '') {
  const s = (text + ' ' + type).toLowerCase();
  let level = 'nhe';
  if (KEYWORDS.trung_binh.some((k) => s.includes(k))) level = 'trung_binh';
  if (KEYWORDS.nghiem_trong.some((k) => s.includes(k))) level = 'nghiem_trong';
  const order = ['nhe', 'trung_binh', 'nghiem_trong'];
  const self = order[Math.min(2, Math.max(0, Number(selfUrgency) - 1))] || 'nhe';
  return order[Math.max(order.indexOf(level), order.indexOf(self))];
}

/* ------------------------------------------------------------------ */
/* Chuẩn hóa dữ liệu trả về (ẩn danh tính khi cần)                      */
/* ------------------------------------------------------------------ */

function withSla(r) {
  const sla = LEVELS[r.level]?.slaMinutes ?? 1440;
  const dueAt = new Date(new Date(r.createdAt).getTime() + sla * 60000).toISOString();
  const overdue = r.status !== 'da_xu_ly' && Date.now() > new Date(dueAt).getTime();
  return { dueAt, overdue, slaMinutes: sla };
}

function publicReport(r, viewer) {
  const base = {
    id: r.id, code: r.code, type: r.type, level: r.level, suggestedLevel: r.suggestedLevel,
    status: r.status, description: r.description, area: r.area, classId: r.classId,
    anonymous: r.anonymous, coords: r.coords || null, createdAt: r.createdAt, updatedAt: r.updatedAt,
    evidence: r.evidence || [], notes: r.notes || [], messages: r.messages || [],
    handledBy: r.handledBy || null, ...withSla(r),
  };
  // Danh tính người báo cáo chỉ hiện khi học sinh chủ động để lại thông tin.
  base.reporter = r.anonymous ? (r.reporterAlias || 'Ẩn danh') : (r.reporterName || 'Không rõ');
  if (viewer?.role === 'student' || viewer?.role === 'anon') {
    delete base.notes; // ghi chú nội bộ của giáo viên không hiển thị cho học sinh
  }
  return base;
}

function publicAlert(a) {
  // ownerKey là khóa nội bộ để học sinh theo dõi cảnh báo của chính mình,
  // không bao giờ gửi ra ngoài cho tài khoản khác.
  const { ownerKey, ...rest } = a;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Xác thực                                                            */
/* ------------------------------------------------------------------ */

function sessionUser(u) {
  return {
    id: u.id, username: u.username, name: u.name, role: u.role,
    roleLabel: ROLE_LABEL[u.role], title: u.title, classId: u.classId,
    email: u.email, mustChangePassword: u.mustChangePassword,
  };
}

const routes = [];
const route = (method, pattern, roles, handler) => routes.push({ method, pattern, roles, handler });

/* ---- Đăng nhập ---- */

route('POST', '/api/auth/login', null, ({ body, ip }) => {
  if (!rateLimit('login:' + ip, 10, 60000)) throw new HttpError(429, 'Bạn thử đăng nhập quá nhiều lần. Vui lòng chờ một phút.');
  const { username, password } = body;
  const u = data().users.find((x) => x.username === String(username || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u)) {
    throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
  }
  if (!u.active) throw new HttpError(403, 'Tài khoản đang bị khóa. Liên hệ Ban giám hiệu để mở lại.');

  if (OTP_ROLES.has(u.role)) {
    const { challenge, code } = createOtpChallenge(u.id);
    console.log(`[OTP] ${u.username} → ${code}`);
    audit(u, 'Yêu cầu mã OTP', u.username);
    return {
      otpRequired: true, challenge,
      sentTo: u.role === 'guard' ? `số điện thoại ${u.phone || 'phòng trực'}` : u.email,
      demoCode: DEMO_MODE ? code : undefined,
    };
  }
  audit(u, 'Đăng nhập', u.username);
  return { token: issueToken({ uid: u.id, role: u.role }), user: sessionUser(u) };
});

route('POST', '/api/auth/verify-otp', null, ({ body }) => {
  const r = verifyOtp(body.challenge, body.code);
  if (!r.ok) throw new HttpError(401, r.error);
  const u = data().users.find((x) => x.id === r.userId);
  if (!u) missing('Tài khoản không tồn tại.');
  audit(u, 'Đăng nhập (đã qua xác thực 2 lớp)', u.username);
  return { token: issueToken({ uid: u.id, role: u.role }), user: sessionUser(u) };
});

route('POST', '/api/auth/anonymous', null, () => {
  const seed = makeCode('AN');
  return {
    token: issueToken({ uid: null, role: 'anon', alias: anonAlias(seed) }, 2 * 60 * 60 * 1000),
    user: { id: null, name: 'Học sinh ẩn danh', role: 'anon', roleLabel: ROLE_LABEL.anon, alias: anonAlias(seed) },
  };
});

route('GET', '/api/auth/me', ALL, ({ user }) => ({ user }));

route('POST', '/api/auth/change-password', ['student', 'teacher', 'counselor', 'admin', 'guard'], ({ user, body }) => {
  const u = data().users.find((x) => x.id === user.id);
  if (!u || !verifyPassword(String(body.current || ''), u)) throw new HttpError(401, 'Mật khẩu hiện tại không đúng.');
  const np = String(body.next || '');
  if (np.length < 6) bad('Mật khẩu mới cần ít nhất 6 ký tự.');
  const { hash, salt } = hashPassword(np);
  u.hash = hash; u.salt = salt; u.mustChangePassword = false;
  save(); audit(u, 'Đổi mật khẩu', u.username);
  return { ok: true };
});

/* ---- Thông tin dùng chung ---- */

route('GET', '/api/meta', null, () => ({
  areas: AREAS,
  levels: LEVELS,
  types: ['Mâu thuẫn lời nói', 'Cô lập, tẩy chay', 'Bắt nạt trên mạng', 'Đe dọa, trấn lột', 'Xô xát, đánh nhau', 'Trêu chọc ngoại hình', 'Khác'],
  demo: DEMO_MODE ? {
    password: DEMO_PASSWORD,
    accounts: data().users.filter((u) => u.active).map((u) => ({
      username: u.username, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role], title: u.title,
    })),
  } : null,
}));

/* ------------------------------------------------------------------ */
/* Báo cáo vụ việc                                                     */
/* ------------------------------------------------------------------ */

route('POST', '/api/reports', ['student', 'anon'], ({ user, body, ip }) => {
  if (!rateLimit('report:' + ip, 12, 60000)) throw new HttpError(429, 'Bạn gửi quá nhiều báo cáo trong thời gian ngắn.');
  const description = String(body.description || '').trim();
  if (description.length < 10) bad('Vui lòng mô tả vụ việc ít nhất 10 ký tự để nhà trường nắm được tình hình.');

  const anonymous = user.role === 'anon' ? true : body.anonymous !== false;
  const level = body.level && LEVELS[body.level] ? body.level : classify(description, body.urgency, body.type);
  const now = new Date().toISOString();
  const id = nextId('report');
  const coords = (body.coords && Number.isFinite(body.coords.lat) && Number.isFinite(body.coords.lng))
    ? { lat: body.coords.lat, lng: body.coords.lng } : null;
  const report = {
    id,
    code: makeCode('BC'),
    type: body.type || 'Khác',
    level,
    suggestedLevel: classify(description, body.urgency, body.type),
    status: 'moi',
    description,
    area: AREAS.includes(body.area) ? body.area : (body.area || 'Chưa xác định'),
    classId: body.classId || user.classId || null,
    anonymous,
    coords,
    reporterId: anonymous ? null : user.id,
    reporterName: anonymous ? null : user.name,
    reporterAlias: user.alias || anonAlias(String(user.id ?? id) + ':' + id),
    ownerKey: user.id ? anonAlias('owner:' + user.id) : (user.alias || null),
    evidence: Array.isArray(body.evidence) ? body.evidence.slice(0, 5) : [],
    createdAt: now,
    updatedAt: now,
    notes: [],
    messages: [],
    handledBy: null,
  };
  data().reports.push(report);
  save();
  audit(user, 'Gửi báo cáo', report.code, { level, anonymous });

  const targets = level === 'nghiem_trong' ? ['admin', 'counselor'] : STAFF;
  broadcast('report:new', { report: publicReport(report, { role: 'admin' }) }, targets);
  return { code: report.code, level, receiver: LEVELS[level].receiver, slaMinutes: LEVELS[level].slaMinutes };
});

route('GET', '/api/reports', STAFF, ({ user, query }) => {
  let list = data().reports.slice();
  if (user.role === 'teacher') {
    // Giáo viên chủ nhiệm chỉ thấy báo cáo mức nhẹ/trung bình của lớp phụ trách.
    list = list.filter((r) => ['nhe', 'trung_binh'].includes(r.level) && (!user.classId || r.classId === user.classId));
  } else if (user.role === 'counselor') {
    list = list.filter((r) => r.level !== 'nhe');
  }
  if (query.status) list = list.filter((r) => r.status === query.status);
  if (query.level) list = list.filter((r) => r.level === query.level);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { reports: list.map((r) => publicReport(r, user)) };
});

route('GET', '/api/reports/mine', ['student', 'anon'], ({ user }) => {
  const key = user.id ? anonAlias('owner:' + user.id) : user.alias;
  const list = data().reports.filter((r) => r.ownerKey && r.ownerKey === key);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { reports: list.map((r) => publicReport(r, user)) };
});

route('GET', '/api/reports/track', null, ({ query }) => {
  const code = String(query.code || '').trim().toUpperCase();
  const r = data().reports.find((x) => x.code === code);
  if (!r) missing('Không tìm thấy báo cáo với mã tra cứu này.');
  return {
    report: {
      code: r.code, level: r.level, status: r.status, area: r.area, type: r.type, coords: r.coords || null,
      createdAt: r.createdAt, updatedAt: r.updatedAt, handledBy: r.handledBy,
      messages: r.messages, ...withSla(r),
    },
  };
});

route('POST', '/api/reports/:id/status', STAFF, ({ user, params, body }) => {
  const r = data().reports.find((x) => x.id === Number(params.id));
  if (!r) missing();
  const allowed = ['moi', 'dang_xu_ly', 'da_xu_ly'];
  if (!allowed.includes(body.status)) bad('Trạng thái không hợp lệ.');
  if (r.level === 'nghiem_trong' && user.role === 'teacher') denied('Báo cáo mức nghiêm trọng do Ban giám hiệu xử lý.');
  r.status = body.status;
  r.updatedAt = new Date().toISOString();
  r.handledBy = user.name;
  save();
  audit(user, 'Cập nhật trạng thái', r.code, { status: body.status });
  broadcast('report:update', { report: publicReport(r, { role: 'admin' }) }, STAFF);
  return { ok: true, report: publicReport(r, user) };
});

route('POST', '/api/reports/:id/notes', STAFF, ({ user, params, body }) => {
  const r = data().reports.find((x) => x.id === Number(params.id));
  if (!r) missing();
  const text = String(body.text || '').trim();
  if (!text) bad('Nội dung ghi chú không được để trống.');
  r.notes.push({ at: new Date().toISOString(), by: user.name, text });
  r.updatedAt = new Date().toISOString();
  save();
  audit(user, 'Thêm ghi chú xử lý', r.code);
  broadcast('report:update', { report: publicReport(r, { role: 'admin' }) }, STAFF);
  return { ok: true };
});

route('POST', '/api/reports/:id/messages', ['student', 'anon', ...STAFF], ({ user, params, body }) => {
  const r = data().reports.find((x) => x.id === Number(params.id));
  if (!r) missing();
  const text = String(body.text || '').trim();
  if (!text) bad('Nội dung tin nhắn không được để trống.');
  const isStudent = user.role === 'student' || user.role === 'anon';
  if (isStudent) {
    const key = user.id ? anonAlias('owner:' + user.id) : user.alias;
    if (r.ownerKey !== key) denied('Bạn chỉ có thể trao đổi trên báo cáo do chính mình gửi.');
  }
  r.messages.push({
    at: new Date().toISOString(),
    from: isStudent ? 'student' : 'staff',
    by: isStudent ? undefined : user.name,
    text,
  });
  r.updatedAt = new Date().toISOString();
  save();
  broadcast('report:message', { id: r.id, code: r.code }, STAFF);
  return { ok: true, messages: r.messages };
});

/* ------------------------------------------------------------------ */
/* Cảnh báo khẩn cấp (nút SOS)                                          */
/* ------------------------------------------------------------------ */

route('POST', '/api/alerts', ['student', 'anon'], ({ user, body, ip }) => {
  if (!rateLimit('sos:' + ip, 5, 60000)) throw new HttpError(429, 'Nút SOS đang bị giới hạn do gửi quá nhiều lần liên tiếp.');
  const now = new Date().toISOString();
  const coords = (body.coords && Number.isFinite(body.coords.lat) && Number.isFinite(body.coords.lng))
    ? { lat: body.coords.lat, lng: body.coords.lng } : null;
  const alert = {
    id: nextId('alert'),
    code: makeCode('SOS'),
    area: body.area || 'Chưa xác định',
    note: String(body.note || '').trim(),
    coords,
    status: 'moi',
    classId: user.classId || null,
    ownerKey: user.id ? anonAlias('owner:' + user.id) : (user.alias || null),
    createdAt: now,
    ackAt: null, onsiteAt: null, closedAt: null, ackBy: null,
    escalated: false,
    log: [],
  };
  data().alerts.push(alert);
  save();
  audit(user, 'Bấm nút SOS', alert.code, { area: alert.area });

  // Đẩy đồng thời tới trực ban và Ban giám hiệu — mốc mục tiêu ≤ 60 giây.
  broadcast('alert:new', { alert: publicAlert(alert) }, ['guard', 'admin']);
  return { alert: publicAlert(alert), guardsOnline: onlineCount('guard') };
});

route('GET', '/api/alerts', ['guard', 'admin'], ({ query }) => {
  let list = data().alerts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (query.active === '1') list = list.filter((a) => a.status !== 'da_dong');
  return { alerts: list.map(publicAlert) };
});

route('GET', '/api/alerts/mine', ['student', 'anon'], ({ user }) => {
  const key = user.id ? anonAlias('owner:' + user.id) : user.alias;
  const list = data().alerts.filter((a) => a.ownerKey === key)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { alerts: list.map(publicAlert) };
});

function advanceAlert(alert, user, to, extra = {}) {
  alert.status = to;
  Object.assign(alert, extra);
  save();
  broadcast('alert:update', { alert: publicAlert(alert) }, ['guard', 'admin']);
  audit(user, 'Cập nhật cảnh báo SOS', alert.code, { status: to });
}

route('POST', '/api/alerts/:id/ack', ['guard'], ({ user, params }) => {
  const a = data().alerts.find((x) => x.id === Number(params.id));
  if (!a) missing();
  if (a.status !== 'moi') bad('Cảnh báo này đã được tiếp nhận trước đó.');
  advanceAlert(a, user, 'da_tiep_nhan', { ackAt: new Date().toISOString(), ackBy: user.name });
  return { ok: true, alert: publicAlert(a) };
});

route('POST', '/api/alerts/:id/onsite', ['guard'], ({ user, params }) => {
  const a = data().alerts.find((x) => x.id === Number(params.id));
  if (!a) missing();
  advanceAlert(a, user, 'tai_hien_truong', { onsiteAt: new Date().toISOString() });
  return { ok: true, alert: publicAlert(a) };
});

route('POST', '/api/alerts/:id/log', ['guard', 'admin'], ({ user, params, body }) => {
  const a = data().alerts.find((x) => x.id === Number(params.id));
  if (!a) missing();
  const text = String(body.text || '').trim();
  if (!text) bad('Vui lòng ghi nhận diễn biến trước khi lưu.');
  a.log.push({ at: new Date().toISOString(), by: user.name, text });
  save();
  broadcast('alert:update', { alert: publicAlert(a) }, ['guard', 'admin']);
  return { ok: true };
});

route('POST', '/api/alerts/:id/close', ['guard', 'admin'], ({ user, params, body }) => {
  const a = data().alerts.find((x) => x.id === Number(params.id));
  if (!a) missing();
  const text = String(body.text || '').trim();
  if (text) a.log.push({ at: new Date().toISOString(), by: user.name, text });
  advanceAlert(a, user, 'da_dong', { closedAt: new Date().toISOString() });

  // Bước 5 của quy trình: chuyển tuyến sang GVCN / tư vấn tâm lý.
  if (body.handover !== false) {
    const id = nextId('report');
    const now = new Date().toISOString();
    const r = {
      id, code: makeCode('BC'), type: 'Chuyển tuyến từ cảnh báo SOS', level: 'nghiem_trong',
      suggestedLevel: 'nghiem_trong', status: 'dang_xu_ly',
      description: `Vụ việc khẩn cấp tại ${a.area} (mã ${a.code}). ${text || a.note || 'Trực ban đã can thiệp tại hiện trường.'}`,
      area: a.area, classId: a.classId, anonymous: true, reporterId: null, reporterName: null,
      reporterAlias: 'Trực ban', ownerKey: null, evidence: [], createdAt: now, updatedAt: now,
      notes: [{ at: now, by: user.name, text: 'Chuyển tuyến sau khi xử lý tại hiện trường.' }],
      messages: [], handledBy: user.name, fromAlert: a.code,
    };
    data().reports.push(r);
    save();
    broadcast('report:new', { report: publicReport(r, { role: 'admin' }) }, STAFF);
    return { ok: true, handoverCode: r.code };
  }
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* Góc chia sẻ tâm lý                                                  */
/* ------------------------------------------------------------------ */

function myThread(user, create = false) {
  const d = data();
  const key = user.id ? anonAlias('owner:' + user.id) : user.alias;
  let t = d.threads.find((x) => x.ownerKey === key || (user.id && x.studentId === user.id));
  if (!t && create) {
    t = {
      id: nextId('thread'), studentId: user.id || null, ownerKey: key,
      alias: user.alias || anonAlias('thread:' + (user.id || Math.random())),
      status: 'dang_mo', createdAt: new Date().toISOString(), messages: [],
    };
    d.threads.push(t);
    save();
  }
  return t;
}

route('GET', '/api/threads/mine', ['student', 'anon'], ({ user }) => ({ thread: myThread(user, true) }));

route('POST', '/api/threads/mine/messages', ['student', 'anon'], ({ user, body }) => {
  const t = myThread(user, true);
  const text = String(body.text || '').trim();
  if (!text) bad('Hãy nhập điều bạn muốn chia sẻ.');
  t.messages.push({ at: new Date().toISOString(), from: 'student', text });
  save();
  broadcast('thread:message', { threadId: t.id, alias: t.alias }, ['counselor', 'admin']);
  return { ok: true, thread: t };
});

route('GET', '/api/threads', ['counselor', 'admin'], () => ({
  threads: data().threads.map((t) => ({
    id: t.id, alias: t.alias, status: t.status, createdAt: t.createdAt, messages: t.messages,
  })),
}));

route('POST', '/api/threads/:id/messages', ['counselor', 'admin'], ({ user, params, body }) => {
  const t = data().threads.find((x) => x.id === Number(params.id));
  if (!t) missing();
  const text = String(body.text || '').trim();
  if (!text) bad('Nội dung không được để trống.');
  t.messages.push({ at: new Date().toISOString(), from: 'counselor', by: user.name, text });
  save();
  if (t.studentId) toUser(t.studentId, 'thread:message', { threadId: t.id });
  audit(user, 'Trả lời góc chia sẻ', t.alias);
  return { ok: true, thread: t };
});

/* ------------------------------------------------------------------ */
/* Thống kê                                                            */
/* ------------------------------------------------------------------ */

route('GET', '/api/stats', STAFF, ({ user }) => {
  const d = data();
  let reports = d.reports;
  if (user.role === 'teacher' && user.classId) reports = reports.filter((r) => r.classId === user.classId);

  const byLevel = {};
  const byStatus = { moi: 0, dang_xu_ly: 0, da_xu_ly: 0 };
  const byArea = {};
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const r of reports) {
    byLevel[r.level] = (byLevel[r.level] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byArea[r.area] = (byArea[r.area] || 0) + 1;
    byHour[new Date(r.createdAt).getHours()] += 1;
  }

  const alerts = d.alerts;
  const acked = alerts.filter((a) => a.ackAt);
  const avgAck = acked.length
    ? Math.round(acked.reduce((s, a) => s + (new Date(a.ackAt) - new Date(a.createdAt)) / 1000, 0) / acked.length)
    : null;

  const week = Date.now() - 7 * 24 * 3600 * 1000;
  return {
    totals: {
      reports: reports.length,
      reportsThisWeek: reports.filter((r) => new Date(r.createdAt).getTime() > week).length,
      pending: byStatus.moi + byStatus.dang_xu_ly,
      overdue: reports.filter((r) => withSla(r).overdue).length,
      alerts: alerts.length,
      alertsActive: alerts.filter((a) => a.status !== 'da_dong').length,
      avgAckSeconds: avgAck,
      guardsOnline: onlineCount('guard'),
    },
    byLevel, byStatus,
    hotspots: Object.entries(byArea).map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count),
    byHour,
  };
});

/* ------------------------------------------------------------------ */
/* Quản trị tài khoản, ca trực, nhật ký (Ban giám hiệu)                 */
/* ------------------------------------------------------------------ */

route('GET', '/api/users', ['admin'], () => ({
  users: data().users.map((u) => ({
    id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role],
    title: u.title, classId: u.classId, email: u.email, phone: u.phone, active: u.active,
    mustChangePassword: u.mustChangePassword, createdAt: u.createdAt,
  })),
}));

route('POST', '/api/users', ['admin'], ({ user, body }) => {
  const username = String(body.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{4,}$/.test(username)) bad('Tên đăng nhập cần tối thiểu 4 ký tự, chỉ gồm chữ thường, số, dấu chấm hoặc gạch.');
  if (data().users.some((u) => u.username === username)) bad('Tên đăng nhập đã tồn tại.');
  if (!ROLE_LABEL[body.role] || body.role === 'anon') bad('Vai trò không hợp lệ.');
  const { hash, salt } = hashPassword(DEMO_PASSWORD);
  const u = {
    id: nextId('user'), username, name: String(body.name || username), role: body.role,
    title: body.title || '', classId: body.classId || null,
    email: body.email || `${username}@thpt-nbk.edu.vn`, phone: body.phone || '',
    hash, salt, active: true, mustChangePassword: true, createdAt: new Date().toISOString(),
  };
  data().users.push(u);
  save();
  audit(user, 'Tạo tài khoản', username, { role: body.role });
  return { ok: true, user: { id: u.id, username, tempPassword: DEMO_PASSWORD } };
});

route('POST', '/api/users/:id/toggle', ['admin'], ({ user, params }) => {
  const u = data().users.find((x) => x.id === Number(params.id));
  if (!u) missing();
  if (u.id === user.id) bad('Không thể tự khóa tài khoản đang đăng nhập.');
  u.active = !u.active;
  save();
  audit(user, u.active ? 'Mở khóa tài khoản' : 'Khóa tài khoản', u.username);
  return { ok: true, active: u.active };
});

route('GET', '/api/shifts', ['admin', 'guard'], () => ({ shifts: data().shifts }));

route('POST', '/api/shifts', ['admin'], ({ user, body }) => {
  const d = data();
  const g = d.users.find((x) => x.id === Number(body.userId) && x.role === 'guard');
  if (!g) bad('Vui lòng chọn một tài khoản trực ban hợp lệ.');
  const s = {
    id: (d.shifts.at(-1)?.id || 0) + 1, userId: g.id, name: g.name,
    label: body.label || 'Ca trực', from: body.from || '06:30', to: body.to || '13:30',
    days: body.days || 'Thứ 2 – Thứ 7',
  };
  d.shifts.push(s);
  save();
  audit(user, 'Thêm ca trực', g.username, { from: s.from, to: s.to });
  return { ok: true, shift: s };
});

route('GET', '/api/audit', ['admin'], () => ({ audit: data().audit.slice(0, 100) }));

/* ------------------------------------------------------------------ */

export { routes, HttpError, publicReport, publicAlert, sessionUser, STAFF };
