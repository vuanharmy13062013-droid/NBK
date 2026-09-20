/**
 * store.js — Lớp lưu trữ dữ liệu.
 *
 * Hai chế độ:
 *  - Có biến môi trường DATABASE_URL: lưu vào Postgres (Neon/Supabase/...),
 *    dữ liệu không bị mất khi dịch vụ hosting ngủ rồi khởi động lại.
 *  - Không có DATABASE_URL: dùng một file JSON (data/db.json) như trước —
 *    để chạy thử cục bộ ngay lập tức, không cần cài đặt cơ sở dữ liệu nào.
 *
 * Toàn bộ hệ thống (api.js, index.js, realtime.js...) chỉ thao tác qua
 * data()/save()/nextId()/audit() và không cần biết đang chạy chế độ nào —
 * toàn bộ dữ liệu vẫn giữ dạng một object JS trong bộ nhớ, chỉ khác cách
 * nó được nạp lúc khởi động và ghi xuống lúc thay đổi.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword, anonAlias } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DATABASE_URL = process.env.DATABASE_URL || '';
export const usingDatabase = Boolean(DATABASE_URL);

// Neon/Supabase yêu cầu kết nối qua SSL. Đặt PGSSL=disable nếu bạn tự host
// Postgres không có TLS (ví dụ chạy trong mạng nội bộ).
const pool = usingDatabase
  ? new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    })
  : null;

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sos_store (
      id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export const AREAS = [
  'Sân trường',
  'Hành lang tầng 2',
  'Hành lang tầng 3',
  'Nhà xe',
  'Nhà vệ sinh khu A',
  'Căng tin',
  'Cổng sau',
  'Phòng học',
  'Sân sau nhà đa năng',
];

export const LEVELS = {
  nhe: { name: 'Mức nhẹ', slaMinutes: 24 * 60, receiver: 'Giáo viên chủ nhiệm' },
  trung_binh: { name: 'Mức trung bình', slaMinutes: 4 * 60, receiver: 'GVCN + Tư vấn tâm lý' },
  nghiem_trong: { name: 'Mức nghiêm trọng', slaMinutes: 30, receiver: 'Ban giám hiệu' },
  khan_cap: { name: 'Khẩn cấp', slaMinutes: 1, receiver: 'Trực ban + Ban giám hiệu' },
};

let db = null;
let writeTimer = null;

/* ------------------------------------------------------------------ */
/* Đọc / ghi                                                           */
/* ------------------------------------------------------------------ */

function emptyDb() {
  return {
    version: 1,
    users: [],
    reports: [],
    alerts: [],
    threads: [],
    shifts: [],
    audit: [],
    counters: { report: 0, alert: 0, user: 0, thread: 0 },
  };
}

/**
 * Nạp dữ liệu lúc khởi động. BẮT BUỘC gọi và `await` đúng một lần trước khi
 * máy chủ nhận request đầu tiên (index.js và reset.js đã làm việc này).
 * Sau lần gọi đầu, các hàm data()/save() còn lại đều đồng bộ như cũ.
 */
export async function load() {
  if (db) return db;

  if (usingDatabase) {
    await ensureTable();
    const { rows } = await pool.query('SELECT payload FROM sos_store WHERE id = 1');
    if (rows.length) {
      db = rows[0].payload;
    } else {
      db = emptyDb();
      seed(db);
      await pool.query('INSERT INTO sos_store (id, payload) VALUES (1, $1)', [JSON.stringify(db)]);
    }
    return db;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
      console.warn('[store] db.json hỏng, tạo lại dữ liệu mẫu.');
      db = null;
    }
  }
  if (!db) {
    db = emptyDb();
    seed(db);
    flushFile();
  }
  return db;
}

function flushFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

/** Gộp nhiều lần ghi trong 120ms để đỡ tốn I/O / số lượt truy vấn Postgres. */
export function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush().catch((err) => console.error('[store] Lỗi khi lưu dữ liệu:', err));
  }, 120);
}

export async function flush() {
  if (!db) return;
  if (usingDatabase) {
    await pool.query(
      `INSERT INTO sos_store (id, payload, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET payload = $1, updated_at = now()`,
      [JSON.stringify(db)],
    );
    return;
  }
  flushFile();
}

/** Trả về object dữ liệu trong bộ nhớ. Gọi load() (và chờ xong) trước khi dùng. */
export function data() {
  if (!db) throw new Error('[store] Dữ liệu chưa sẵn sàng — phải await load() trước.');
  return db;
}

export function nextId(kind) {
  const d = data();
  d.counters[kind] = (d.counters[kind] || 0) + 1;
  return d.counters[kind];
}

export function makeCode(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}

/* ------------------------------------------------------------------ */
/* Nhật ký truy vết                                                    */
/* ------------------------------------------------------------------ */

export function audit(actor, action, target, meta = {}) {
  const d = data();
  d.audit.unshift({
    at: new Date().toISOString(),
    actor: actor ? `${actor.name} (${actor.username})` : 'Ẩn danh',
    role: actor?.role || 'anon',
    action,
    target,
    meta,
  });
  if (d.audit.length > 500) d.audit.length = 500;
  save();
}

/* ------------------------------------------------------------------ */
/* Dữ liệu mẫu                                                         */
/* ------------------------------------------------------------------ */

const DEMO_PASSWORD = 'Sos@2026';

function mkUser(d, u) {
  const { hash, salt } = hashPassword(u.password || DEMO_PASSWORD);
  const user = {
    id: ++d.counters.user,
    username: u.username,
    name: u.name,
    role: u.role,
    title: u.title || '',
    classId: u.classId || null,
    email: u.email || `${u.username}@thpt-nbk.edu.vn`,
    phone: u.phone || '',
    hash,
    salt,
    active: true,
    mustChangePassword: !!u.mustChangePassword,
    createdAt: new Date().toISOString(),
  };
  d.users.push(user);
  return user;
}

function minutesAgo(m) {
  return new Date(Date.now() - m * 60000).toISOString();
}

function seed(d) {
  /* --- Tài khoản --- */
  mkUser(d, { username: 'hs.nguyenvana', name: 'Nguyễn Văn A', role: 'student', title: 'Học sinh', classId: '11A3' });
  mkUser(d, { username: 'hs.tranthimai', name: 'Trần Thị Mai', role: 'student', title: 'Học sinh', classId: '10A1' });
  mkUser(d, { username: 'gv.tranthib', name: 'Trần Thị B', role: 'teacher', title: 'GVCN lớp 11A3', classId: '11A3', phone: '0905 111 222' });
  mkUser(d, { username: 'gv.levanhung', name: 'Lê Văn Hùng', role: 'counselor', title: 'Tư vấn tâm lý học đường', phone: '0905 333 444' });
  mkUser(d, { username: 'bgh.lequangc', name: 'Lê Quang C', role: 'admin', title: 'Phó hiệu trưởng', phone: '0905 555 666' });
  mkUser(d, { username: 'tb.phamvand', name: 'Phạm Văn D', role: 'guard', title: 'Trực ban ca sáng', phone: '0905 777 888' });
  mkUser(d, { username: 'tb.vothie', name: 'Võ Thị E', role: 'guard', title: 'Trực ban ca chiều', phone: '0905 999 000' });

  /* --- Lịch trực ban --- */
  d.shifts = [
    { id: 1, userId: 6, name: 'Phạm Văn D', label: 'Ca sáng', from: '06:30', to: '13:30', days: 'Thứ 2 – Thứ 7' },
    { id: 2, userId: 7, name: 'Võ Thị E', label: 'Ca chiều', from: '13:30', to: '18:00', days: 'Thứ 2 – Thứ 7' },
  ];

  /* --- Báo cáo mẫu --- */
  const samples = [
    {
      level: 'trung_binh', status: 'dang_xu_ly', area: 'Hành lang tầng 3', classId: '11A3', anonymous: true,
      type: 'Cô lập, tẩy chay', minutes: 95, mine: true,
      description: 'Một nhóm bạn liên tục lập nhóm chat riêng để nói xấu và không cho bạn cùng lớp tham gia hoạt động chung suốt hai tuần nay.',
      notes: [{ at: minutesAgo(60), by: 'Trần Thị B', text: 'Đã gặp riêng học sinh liên quan, hẹn trao đổi với tư vấn tâm lý chiều thứ Năm.' }],
      messages: [
        { at: minutesAgo(88), from: 'staff', text: 'Cô đã nhận được báo cáo của em. Em yên tâm, danh tính của em được giữ kín.' },
        { at: minutesAgo(70), from: 'student', text: 'Dạ em cảm ơn cô. Em mong nhà trường nói chuyện nhẹ nhàng để các bạn không nghĩ là em báo ạ.' },
      ],
    },
    {
      level: 'nhe', status: 'moi', area: 'Căng tin', classId: '10A1', anonymous: false,
      type: 'Mâu thuẫn lời nói', minutes: 40,
      description: 'Hai bạn lớp 10A1 cãi nhau lớn tiếng ở căng tin giờ ra chơi, có xô đẩy nhẹ nhưng đã tự tách ra.',
    },
    {
      level: 'nghiem_trong', status: 'dang_xu_ly', area: 'Nhà xe', classId: '11A5', anonymous: true,
      type: 'Đe dọa, trấn lột', minutes: 25,
      description: 'Em chứng kiến một bạn khối 11 bị nhóm bạn chặn ở nhà xe đòi tiền và dọa đánh nếu nói với thầy cô.',
      notes: [{ at: minutesAgo(12), by: 'Lê Quang C', text: 'Đã cử giám thị xuống khu nhà xe, mời phụ huynh học sinh liên quan sáng mai.' }],
    },
    {
      level: 'nhe', status: 'da_xu_ly', area: 'Phòng học', classId: '11A3', anonymous: true,
      type: 'Trêu chọc ngoại hình', minutes: 60 * 26, mine: true,
      description: 'Bạn ngồi bàn cuối thường bị trêu chọc về ngoại hình trong giờ ra chơi.',
      notes: [{ at: minutesAgo(60 * 20), by: 'Trần Thị B', text: 'Đã sinh hoạt lớp về ứng xử, hai bên đã xin lỗi nhau. Theo dõi tiếp 2 tuần.' }],
    },
    {
      level: 'trung_binh', status: 'moi', area: 'Cổng sau', classId: '12A2', anonymous: true,
      type: 'Đe dọa kéo dài', minutes: 8,
      description: 'Có bạn bị hẹn "nói chuyện" ở cổng sau sau giờ tan học, nhắn tin đe dọa nhiều ngày liền.',
    },
  ];

  for (const s of samples) {
    const id = ++d.counters.report;
    d.reports.push({
      id,
      code: makeCode('BC'),
      type: s.type,
      level: s.level,
      suggestedLevel: s.level,
      status: s.status,
      description: s.description,
      area: s.area,
      classId: s.classId,
      anonymous: s.anonymous,
      reporterId: s.anonymous ? null : 1,
      reporterName: s.anonymous ? null : 'Nguyễn Văn A',
      reporterAlias: 'HS ' + makeCode('AN').slice(3),
      // Gắn chủ sở hữu để tài khoản học sinh mẫu nhìn thấy trong "Báo cáo của tôi".
      ownerKey: s.mine ? anonAlias('owner:1') : null,
      evidence: [],
      createdAt: minutesAgo(s.minutes),
      updatedAt: minutesAgo(Math.max(0, s.minutes - 20)),
      notes: s.notes || [],
      messages: s.messages || [],
      handledBy: s.notes?.[0]?.by || null,
    });
  }

  /* --- Cảnh báo SOS đã đóng (để có số liệu thống kê) --- */
  d.alerts.push({
    id: ++d.counters.alert,
    code: makeCode('SOS'),
    area: 'Sân sau nhà đa năng',
    note: 'Hai nhóm học sinh đang giằng co, có bạn bị đẩy ngã.',
    status: 'da_dong',
    classId: '11A3',
    createdAt: minutesAgo(60 * 5),
    ackAt: minutesAgo(60 * 5 - 1),
    onsiteAt: minutesAgo(60 * 5 - 2),
    closedAt: minutesAgo(60 * 5 - 20),
    ackBy: 'Phạm Văn D',
    escalated: false,
    log: [
      { at: minutesAgo(60 * 5 - 2), by: 'Phạm Văn D', text: 'Đã tách hai nhóm, không có thương tích nặng, đưa 3 em về phòng giám thị.' },
    ],
  });

  /* --- Góc chia sẻ --- */
  d.threads.push({
    id: ++d.counters.thread,
    studentId: 1,
    alias: 'HS ẩn danh #1',
    status: 'dang_mo',
    createdAt: minutesAgo(180),
    messages: [
      { at: minutesAgo(180), from: 'student', text: 'Em thấy sợ mỗi khi tới giờ ra chơi, không biết nói với ai.' },
      { at: minutesAgo(170), from: 'counselor', by: 'Tư vấn tâm lý', text: 'Cảm ơn em đã chia sẻ. Em có thể kể thêm điều gì làm em thấy sợ nhất không? Cuộc trò chuyện này chỉ mình cô và em biết.' },
    ],
  });

  d.audit.unshift({
    at: new Date().toISOString(),
    actor: 'Hệ thống',
    role: 'system',
    action: 'Khởi tạo cơ sở dữ liệu',
    target: 'db.json',
    meta: { users: d.users.length, reports: d.reports.length },
  });
}

export { DEMO_PASSWORD };
