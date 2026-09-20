# Nền tảng SOS — phòng, chống bạo lực học đường

Hệ thống web hoàn chỉnh (giao diện + máy chủ + cơ sở dữ liệu) hiện thực hóa Giải pháp 3
trong hồ sơ dự thi: kênh trung gian giữa **học sinh – giáo viên – Ban giám hiệu – trực ban**,
rút ngắn thời gian từ lúc phát sinh vụ việc đến lúc có người can thiệp tại hiện trường.

---

## 1. Chạy hệ thống trong 30 giây

Yêu cầu duy nhất: **Node.js 18 trở lên** (tải tại nodejs.org). Không cần cài thêm thư viện,
không cần cấu hình cơ sở dữ liệu.

```bash
cd sos-platform
node server/index.js
```

Mở trình duyệt tại **http://localhost:3000**.

Muốn chạy trên GitHub (Codespaces) hoặc đưa lên một địa chỉ web cố định: xem **DEPLOY.md**.

Lệnh phụ trợ:

| Lệnh | Tác dụng |
| --- | --- |
| `npm start` | Chạy máy chủ (giống lệnh trên) |
| `npm run dev` | Chạy và tự khởi động lại khi sửa mã nguồn |
| `npm run reset` | Xóa dữ liệu và tạo lại bộ dữ liệu mẫu |
| `PORT=8080 node server/index.js` | Đổi cổng |
| `SOS_ESCALATE_SEC=30 node server/index.js` | Đổi ngưỡng leo thang cảnh báo (mặc định 60 giây) |

## 2. Tài khoản demo

Mật khẩu chung cho mọi tài khoản: **`Sos@2026`**

| Vai trò | Tên đăng nhập | Ghi chú |
| --- | --- | --- |
| Học sinh | `hs.nguyenvana` | Lớp 11A3, đăng nhập một lớp |
| Học sinh | `hs.tranthimai` | Lớp 10A1 |
| Giáo viên chủ nhiệm | `gv.tranthib` | Phụ trách 11A3, có OTP |
| Tư vấn tâm lý | `gv.levanhung` | Xem được Góc chia sẻ, có OTP |
| Ban giám hiệu | `bgh.lequangc` | Toàn quyền, có OTP |
| Trực ban / Bảo vệ | `tb.phamvand` | Bàn trực nhận SOS, có OTP |
| Trực ban ca chiều | `tb.vothie` | |

Với các vai trò có xác thực hai lớp, **mã OTP hiển thị ngay trên màn hình** (chế độ demo)
và được in ở cửa sổ dòng lệnh. Tắt chế độ này khi triển khai thật bằng `SOS_DEMO=0`.

Ngoài ra có hai lối vào không cần tài khoản: **Gửi báo cáo ẩn danh** và **Tra cứu bằng mã**.

## 3. Kịch bản trình bày trước hội đồng (5 phút)

Mở **hai cửa sổ trình duyệt** cạnh nhau — thanh đen dưới màn hình có nút *Mở cửa sổ thứ hai*
và các nút chuyển nhanh vai trò.

1. **Cửa sổ A – Học sinh** (`hs.nguyenvana`): bấm nút **SOS**, chọn khu vực "Nhà xe", gửi.
2. **Cửa sổ B – Trực ban** (`tb.phamvand`): màn hình **đổ còi**, cảnh báo hiện lên kèm đồng hồ đếm giây.
   → đây là minh chứng cho mốc "≤ 60 giây" trong hồ sơ.
3. **Không bấm gì trong 60 giây**: hệ thống tự ghi "đã leo thang lên Ban giám hiệu" — đúng cơ chế
   phòng ngừa bỏ sót của giải pháp. (Muốn nhanh hơn khi trình bày: chạy với `SOS_ESCALATE_SEC=15`.)
4. **Cửa sổ B**: bấm *Đã tiếp nhận* → *Đã có mặt* → nhập diễn biến → *Đóng vụ việc & chuyển tuyến*.
   Cửa sổ A của học sinh tự cập nhật theo từng bước.
5. **Cửa sổ B – chuyển sang Ban giám hiệu**: xem bản đồ điểm nóng, thời gian tiếp nhận trung bình,
   nhật ký truy vết vừa ghi lại toàn bộ thao tác trên.
6. **Cửa sổ A – gửi báo cáo thường**: nhập "bạn bị nhắn tin đe dọa nhiều ngày" → hệ thống tự xếp
   **mức trung bình**, chuyển GVCN + tư vấn tâm lý, cấp mã tra cứu.
7. **Chuyển sang Giáo viên**: nhận xử lý, trả lời học sinh qua khung trao đổi **ẩn danh** —
   giáo viên chỉ thấy bí danh, không thấy tên học sinh.

## 4. Bốn lớp chức năng (đúng theo mục 2 của hồ sơ)

| Lớp | Thể hiện trong mã nguồn |
| --- | --- |
| Lớp tiếp nhận | `public/js/views/student.js` — biểu mẫu 3 bước và nút SOS |
| Lớp xử lý & phân loại | `server/api.js → classify()` — từ khóa + mức tự đánh giá → 4 mức độ, định tuyến theo vai trò |
| Lớp quản trị & giám sát | `public/js/views/staff.js`, `admin.js` — hàng đợi, thống kê, điểm nóng, nhật ký |
| Lớp cảnh báo hiện trường | `server/realtime.js` + `views/guard.js` — SSE, còi báo động, rung thiết bị, leo thang tự động |

## 5. Bản đồ tính năng ↔ hồ sơ dự thi

| Mục trong hồ sơ | Trạng thái | Ghi chú triển khai |
| --- | --- | --- |
| 3. Đăng nhập chung, điều hướng theo vai trò | ✅ | Một trang đăng nhập, 4 nhóm tài khoản |
| 3.1 Băm mật khẩu, không lưu văn bản thuần | ✅ | `scrypt` + salt ngẫu nhiên mỗi tài khoản |
| 3.1 Xác thực hai lớp (OTP) | ✅ | Bắt buộc với giáo viên, BGH, trực ban; mã sống 5 phút, khóa sau 5 lần sai |
| 3.1 Không lưu vết liên kết báo cáo ẩn danh | ✅ | Chỉ lưu khóa băm `ownerKey`, giao diện giáo viên nhận bí danh |
| 3.1 Ghi nhật ký truy cập | ✅ | `server/store.js → audit()`, xem tại tab *Nhật ký truy vết* |
| 4.1 Gửi báo cáo ≤ 3 bước, ẩn danh, mã tra cứu | ✅ | Mã dạng `BC-XXXXX`, tra cứu không cần đăng nhập |
| 4.2 Phân loại tự động 4 mức + định tuyến | ✅ | Kèm thời hạn phản hồi 24h / 4h / 30 phút / tức thời |
| 4.3 Nút SOS thời gian thực | ✅ | SSE đẩy thẳng tới thiết bị trực ban đang mở |
| 4.3 Còi/rung báo động | ✅ | Web Audio API + `navigator.vibrate` |
| 4.3 Leo thang nếu không xác nhận | ✅ | Hẹn giờ phía máy chủ, mặc định 60 giây |
| 4.3 Ghi nhận hiện trường & chuyển tuyến | ✅ | Đóng cảnh báo sẽ tự sinh hồ sơ vụ việc cho GVCN |
| 4.4 Góc chia sẻ tâm lý, chat ẩn danh 2 chiều | ✅ | Học sinh hiện dưới bí danh `HS-XXXXX` |
| 4.5 Dashboard, điểm nóng, thống kê | ✅ | Theo khu vực và khung giờ, thời gian tiếp nhận trung bình |
| 4.6 Thông báo đẩy, nhắc việc quá hạn | ✅ | Web Notification + nhãn *Quá hạn* theo cam kết từng mức |
| 4.7 Quản lý tài khoản, phân ca trực | ✅ | Tạo/khóa tài khoản, thêm ca trực |
| 6. Mã hóa đường truyền HTTPS | ⚠️ | Cần bật khi triển khai thật (xem mục 8) |
| 6. Gửi SMS/email OTP thật | ⚠️ | Hiện mô phỏng; đấu nối nhà cung cấp ở `server/auth.js` |
| 4.1 Tải ảnh/ghi âm minh chứng | ⚠️ | Hiện nhận liên kết/mô tả; cần thêm kho lưu tệp khi triển khai |

## 6. Kiến trúc mã nguồn

```
sos-platform/
├── server/
│   ├── index.js      Máy chủ HTTP, định tuyến, phục vụ tệp tĩnh, hẹn giờ leo thang
│   ├── api.js        Toàn bộ endpoint + quy tắc phân quyền cho từng endpoint
│   ├── auth.js       Băm mật khẩu, token phiên ký HMAC, OTP, giới hạn tần suất, bí danh
│   ├── realtime.js   Kênh SSE đẩy cảnh báo tới đúng nhóm vai trò
│   ├── store.js      Lớp dữ liệu + dữ liệu mẫu (đổi sang SQL chỉ cần sửa tệp này)
│   └── reset.js      Tạo lại dữ liệu mẫu
├── public/
│   ├── index.html    Khung ứng dụng một trang
│   ├── assets/styles.css
│   └── js/
│       ├── app.js    Điều hướng theo vai trò, nối SSE, thanh chuyển vai trò demo
│       ├── api.js    Lớp gọi API, giữ phiên
│       ├── ui.js     Tiện ích chung: nhãn, thời gian, thông báo, còi báo động
│       └── views/    login · student · staff · admin · guard
├── tools/smoke.mjs   Kiểm thử tự động 14 màn hình (chạy bằng `npm test`)
└── data/db.json      Cơ sở dữ liệu (tự sinh khi chạy lần đầu)
```

## 7. Danh mục API

Mọi endpoint đều trả JSON. Token gửi kèm ở header `Authorization: Bearer <token>`.

**Xác thực**

| Method | Đường dẫn | Vai trò | Mô tả |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | — | Đăng nhập; trả `otpRequired` nếu vai trò cần xác thực 2 lớp |
| POST | `/api/auth/verify-otp` | — | Xác thực mã OTP, trả token |
| POST | `/api/auth/anonymous` | — | Cấp token ẩn danh (2 giờ) để gửi báo cáo |
| POST | `/api/auth/change-password` | mọi tài khoản | Đổi mật khẩu |
| GET | `/api/auth/me` | mọi tài khoản | Thông tin phiên hiện tại |

**Báo cáo vụ việc**

| Method | Đường dẫn | Vai trò | Mô tả |
| --- | --- | --- | --- |
| POST | `/api/reports` | học sinh, ẩn danh | Gửi báo cáo, trả mã tra cứu và mức độ |
| GET | `/api/reports` | GVCN, tư vấn, BGH | Hàng đợi đã lọc theo phạm vi vai trò |
| GET | `/api/reports/mine` | học sinh, ẩn danh | Báo cáo của chính mình |
| GET | `/api/reports/track?code=` | — | Tra cứu công khai bằng mã |
| POST | `/api/reports/:id/status` | GVCN, tư vấn, BGH | Cập nhật trạng thái |
| POST | `/api/reports/:id/notes` | GVCN, tư vấn, BGH | Ghi chú xử lý nội bộ |
| POST | `/api/reports/:id/messages` | học sinh + cán bộ | Trao đổi hai chiều ẩn danh |

**Cảnh báo khẩn cấp**

| Method | Đường dẫn | Vai trò | Mô tả |
| --- | --- | --- | --- |
| POST | `/api/alerts` | học sinh, ẩn danh | Bấm nút SOS |
| GET | `/api/alerts` | trực ban, BGH | Danh sách cảnh báo |
| GET | `/api/alerts/mine` | học sinh, ẩn danh | Theo dõi cảnh báo của mình |
| POST | `/api/alerts/:id/ack` | trực ban | Xác nhận tiếp nhận |
| POST | `/api/alerts/:id/onsite` | trực ban | Xác nhận có mặt |
| POST | `/api/alerts/:id/log` | trực ban, BGH | Ghi diễn biến |
| POST | `/api/alerts/:id/close` | trực ban, BGH | Đóng và chuyển tuyến |

**Góc chia sẻ, thống kê, quản trị**

| Method | Đường dẫn | Vai trò |
| --- | --- | --- |
| GET / POST | `/api/threads/mine`, `/api/threads/mine/messages` | học sinh, ẩn danh |
| GET / POST | `/api/threads`, `/api/threads/:id/messages` | tư vấn, BGH |
| GET | `/api/stats` | GVCN, tư vấn, BGH |
| GET / POST | `/api/users`, `/api/users/:id/toggle` | BGH |
| GET / POST | `/api/shifts` | BGH (đọc: cả trực ban) |
| GET | `/api/audit` | BGH |
| GET | `/api/stream?token=` | mọi tài khoản — kênh sự kiện thời gian thực |

Sự kiện SSE: `alert:new`, `alert:update`, `alert:escalate`, `report:new`, `report:update`,
`report:message`, `thread:message`.

## 8. Khi triển khai thật cần bổ sung

1. **HTTPS**: đặt sau Nginx/Caddy có chứng chỉ Let's Encrypt, hoặc dùng dịch vụ có sẵn TLS.
2. **Khóa bí mật cố định**: đặt biến môi trường `SOS_SECRET` (chuỗi ngẫu nhiên dài) để token
   không mất hiệu lực mỗi lần khởi động lại.
3. **Tắt chế độ demo**: `SOS_DEMO=0` để không hiển thị mã OTP và danh sách tài khoản mẫu.
4. **Cơ sở dữ liệu thật**: thay phần thân các hàm trong `server/store.js` bằng PostgreSQL/MySQL;
   phần còn lại của hệ thống không phải sửa.
5. **Gửi OTP thật**: nối nhà cung cấp SMS/email tại `createOtpChallenge` trong `server/auth.js`.
6. **Sao lưu và thời hạn lưu trữ**: hẹn lịch sao lưu `data/db.json` (hoặc CSDL) và xóa dữ liệu
   nhạy cảm quá hạn theo quy định bảo vệ dữ liệu cá nhân.

## 9. Kiểm thử

```bash
npm install           # cài jsdom (đã khai báo sẵn trong devDependencies)
node server/index.js  # cửa sổ 1
npm test               # cửa sổ 2 — vẽ thử 14 màn hình của 5 vai trò
```

Kết quả mong đợi: `14 màn hình vẽ thành công, 0 lỗi`. GitHub Actions chạy đúng ba lệnh
này (xem `.github/workflows/test.yml`) sau mỗi lần đẩy mã lên.

## 10. Chuẩn hóa dự án cho GitHub

Kho chứa đã kèm sẵn các tệp chuẩn của một dự án Node.js mã nguồn mở:

| Tệp | Vai trò |
| --- | --- |
| `.gitignore` | Bỏ qua `node_modules/`, dữ liệu cục bộ, tệp hệ điều hành/trình soạn thảo |
| `.editorconfig` | Giữ thống nhất thụt lề, mã hóa ký tự giữa các trình soạn thảo |
| `.nvmrc` | Ghim phiên bản Node (22) cho `nvm use`, Codespaces và GitHub Actions |
| `.env.example` | Liệt kê các biến môi trường có thể cấu hình (`PORT`, `SOS_SECRET`, `SOS_DEMO`, `SOS_ESCALATE_SEC`) |
| `LICENSE` | Giấy phép MIT, khớp với trường `license` trong `package.json` |
| `package-lock.json` | Khóa phiên bản thư viện để cài đặt tái lập được trên mọi máy/CI |
| `.devcontainer/devcontainer.json` | Cấu hình môi trường GitHub Codespaces, tự `npm install` rồi khởi động máy chủ |
| `.github/workflows/test.yml` | Tự động cài đặt + `npm test` sau mỗi lần đẩy mã hoặc mở pull request |
| `render.yaml`, `Dockerfile` | Triển khai lên Render/Railway/Fly.io khi cần địa chỉ web cố định |
