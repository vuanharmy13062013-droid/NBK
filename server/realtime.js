/**
 * realtime.js — Kênh thời gian thực (Server-Sent Events).
 *
 * Mỗi tài khoản đang mở hệ thống giữ một kết nối SSE. Khi có cảnh báo SOS,
 * báo cáo mới hoặc tin nhắn mới, máy chủ đẩy sự kiện xuống đúng nhóm vai trò
 * cần biết — đây là cơ chế bảo đảm mốc "≤ 60 giây" của nút SOS.
 */

const clients = new Set(); // { id, role, userId, res }
let seq = 0;

export function addClient(res, user) {
  const client = { id: ++seq, role: user.role, userId: user.id, res };
  clients.add(client);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ role: user.role })}\n\n`);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* đã đóng */ }
  }, 25000);

  res.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
  return client;
}

function write(client, event, payload) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch {
    clients.delete(client);
  }
}

/** Gửi tới các vai trò chỉ định. roles = null nghĩa là gửi tất cả. */
export function broadcast(event, payload, roles = null) {
  for (const c of clients) {
    if (roles && !roles.includes(c.role)) continue;
    write(c, event, payload);
  }
}

/** Gửi riêng cho một tài khoản. */
export function toUser(userId, event, payload) {
  for (const c of clients) {
    if (c.userId === userId) write(c, event, payload);
  }
}

export function onlineCount(role) {
  let n = 0;
  for (const c of clients) if (!role || c.role === role) n++;
  return n;
}
