# Hướng dẫn chạy trên GitHub

## Điều cần biết trước

Hệ thống này gồm **hai phần**: giao diện (chạy trong trình duyệt) và máy chủ Node.js
(xử lý đăng nhập, lưu dữ liệu, đẩy cảnh báo SOS thời gian thực).

**GitHub Pages chỉ phục vụ được file tĩnh, không chạy được Node.js.** Nếu chỉ đẩy lên
Pages, bạn sẽ thấy giao diện nhưng mọi thao tác đăng nhập, gửi báo cáo, bấm SOS đều báo
lỗi kết nối. Vì vậy hãy chọn một trong hai cách dưới đây.

---

## Bước chung: đưa mã nguồn lên GitHub

Trên máy của bạn, trong thư mục `sos-platform`:

```bash
git init
git add .
git commit -m "Nền tảng SOS - phòng chống bạo lực học đường"
git branch -M main
git remote add origin https://github.com/<tên-tài-khoản>/sos-platform.git
git push -u origin main
```

Nếu chưa có kho chứa: vào github.com → **New repository** → đặt tên `sos-platform` →
**Create repository** (không tích thêm README để tránh xung đột).

Kho chứa đã kèm sẵn `.github/workflows/test.yml`, nên mỗi lần đẩy mã lên, GitHub sẽ tự
chạy kiểm thử 14 màn hình và kiểm tra phân quyền — dấu tích xanh này là bằng chứng tốt
để đưa vào hồ sơ dự thi.

---

## Cách 1 — GitHub Codespaces (khuyến nghị cho buổi trình bày)

Chạy thẳng trên máy chủ của GitHub, không cần cài gì trên máy cá nhân. Tài khoản miễn phí
có 60 giờ mỗi tháng, quá đủ cho việc tập dượt và trình bày.

1. Mở kho chứa trên github.com.
2. Bấm nút xanh **Code** → thẻ **Codespaces** → **Create codespace on main**.
3. Chờ khoảng một phút. Máy chủ **tự khởi động** (đã cấu hình sẵn trong
   `.devcontainer/devcontainer.json`), cửa sổ xem trước sẽ tự mở.
4. Nếu cửa sổ xem trước không tự mở: sang thẻ **PORTS** ở khung dưới, tìm cổng **3000**,
   bấm biểu tượng quả địa cầu.

**Để trình bày trước hội đồng bằng hai cửa sổ:** trong thẻ PORTS, bấm chuột phải vào cổng
3000 → **Port Visibility** → **Public**. Sao chép đường dẫn dạng
`https://<tên>-3000.app.github.dev` rồi mở trên hai thiết bị khác nhau — ví dụ máy tính
đóng vai học sinh, điện thoại đóng vai trực ban. Khi đó còi báo động và rung trên điện
thoại sẽ hoạt động thật, rất thuyết phục.

Nếu muốn khởi động lại máy chủ trong Codespaces, mở Terminal và gõ:

```bash
node server/index.js
```

Muốn ngưỡng leo thang ngắn lại khi tập dượt:

```bash
SOS_ESCALATE_SEC=15 node server/index.js
```

---

## Cách 2 — Render (có địa chỉ web cố định, chạy 24/7)

Dùng khi bạn muốn một đường dẫn cố định để gửi trước cho hội đồng hoặc thầy cô.

1. Đăng ký tài khoản tại render.com bằng chính tài khoản GitHub.
2. **New** → **Blueprint** → chọn kho chứa `sos-platform`.
3. Render đọc sẵn cấu hình trong `render.yaml` và tự tạo dịch vụ. Bấm **Apply**.
4. Sau vài phút bạn nhận được địa chỉ dạng `https://sos-platform.onrender.com`.

Hai lưu ý của gói miễn phí:

- Dịch vụ **ngủ sau 15 phút không có người truy cập**, lần vào lại đầu tiên chờ khoảng
  30–50 giây. Hãy mở trang trước buổi trình bày vài phút.
- Dữ liệu trong `data/db.json` **bị xóa mỗi lần dịch vụ khởi động lại**. Với bản demo thì
  không sao — hệ thống tự tạo lại dữ liệu mẫu. Muốn giữ lâu dài, gắn ổ đĩa bền vững (Disk)
  vào đường dẫn `/app/data`, hoặc chuyển sang cơ sở dữ liệu thật theo mục 8 của README.

Railway, Fly.io hay bất kỳ dịch vụ nào đọc được `Dockerfile` đều triển khai được tương tự.

---

## Lưu trữ dữ liệu thật bằng Postgres (bắt buộc nếu triển khai thật, dùng gói Render miễn phí)

Gói Render miễn phí **không có ổ đĩa bền vững**. Mỗi lần dịch vụ ngủ (sau 15 phút không
ai truy cập) rồi có người vào lại, Render khởi động một **bản sao mới** của ứng dụng —
mọi thứ ghi vào `data/db.json` lúc chạy (báo cáo, cảnh báo, tài khoản mới) sẽ **mất hết**.

Dự án đã hỗ trợ sẵn lưu vào Postgres: chỉ cần khai báo biến môi trường `DATABASE_URL`,
hệ thống tự chuyển sang đọc/ghi Postgres thay vì file cục bộ — không cần sửa gì thêm.
Không khai báo thì vẫn chạy như cũ bằng `data/db.json` (phù hợp để chạy thử cục bộ).

### Bước 1 — Tạo database Postgres miễn phí trên Neon

1. Vào **neon.tech**, đăng ký bằng tài khoản GitHub.
2. Tạo project mới (miễn phí), đặt tên tùy ý, ví dụ `sos-platform`.
3. Vào tab **Connection Details** của project, copy chuỗi kết nối dạng:
   `postgresql://<user>:<password>@<host>/<db>?sslmode=require`

   (Supabase — supabase.com — cũng dùng được tương tự, lấy chuỗi kết nối ở
   **Project Settings → Database → Connection string**, chọn chế độ "URI".)

### Bước 2 — Thêm vào Render

1. Vào service trên Render → tab **Environment**.
2. Thêm biến `DATABASE_URL`, dán chuỗi kết nối vừa copy vào.
3. Bấm **Save Changes** — Render tự deploy lại. Xem log thấy dòng
   `[store] Lưu trữ: Postgres (DATABASE_URL).` là đã chuyển thành công.

Từ giờ dữ liệu được lưu bền vững trên Neon/Supabase, không còn mất khi service ngủ dậy.
Muốn xóa sạch dữ liệu và tạo lại dữ liệu mẫu: mở **Shell** của service trên Render (hoặc
chạy cục bộ với cùng `DATABASE_URL`) rồi gõ `npm run reset`.

---

## Nếu vẫn muốn dùng GitHub Pages

Chỉ nên dùng khi bạn cần một bản xem giao diện, không cần chức năng thật. Trong trường hợp
đó hãy đăng bản `DEMO.html` ban đầu (chạy hoàn toàn trong trình duyệt) thay vì thư mục
`public/` của dự án này:

1. Đổi tên `DEMO.html` thành `index.html`, đặt ở gốc một kho chứa riêng.
2. Settings → Pages → Source: **Deploy from a branch** → chọn `main` / thư mục `/ (root)`.

Cách này không có đăng nhập, không lưu dữ liệu và không có cảnh báo thời gian thực giữa
hai thiết bị — đúng những điểm mà bản full-stack sinh ra để khắc phục.

---

## Đối chiếu nhanh

| | Codespaces | Render | GitHub Pages |
| --- | --- | --- | --- |
| Chạy được backend | Có | Có | Không |
| Đăng nhập, phân quyền, OTP | Có | Có | Không |
| SOS thời gian thực giữa hai máy | Có | Có | Không |
| Địa chỉ web cố định | Không (tạm thời) | Có | Có |
| Chi phí | Miễn phí 60 giờ/tháng | Miễn phí (có ngủ) | Miễn phí |
| Phù hợp nhất cho | Trình bày trực tiếp | Gửi link trước cho hội đồng | Chỉ xem giao diện |
