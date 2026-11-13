# 🚗 SMART GATE AI – Quản lý xe ra vào cơ quan

Hệ thống quản lý xe ra vào bằng Computer Vision & AI (phần AI tích hợp sau).

## Chạy một lệnh
```bash
docker compose up -d --build
```
| Dịch vụ | Địa chỉ |
|---|---|
| Frontend (React) | http://localhost:5173 |
| API (Node.js) | http://localhost:3000/api |
| phpMyAdmin | http://localhost:8081 (tự đăng nhập root/root) |
| MySQL | localhost:3306 (root/root, DB `smart_gate`) |

**Đăng nhập web:** `admin` / `Admin@123` (cũng có `baove01`, `quanly01`).
Dừng: `docker compose down` · Xóa cả dữ liệu để nạp lại SQL: `docker compose down -v`.

## Import SQL thủ công (phpMyAdmin)
- `database/init.sql` = schema + dữ liệu mẫu (nhập một lần).
- Hoặc nhập riêng `schema.sql` rồi `sample_data.sql`.
- Lưu ý: mật khẩu mẫu trong SQL là `RESET`; khi backend khởi động sẽ tự đặt thành `Admin@123`.

## Chạy không Docker
```bash
cd backend/server && cp .env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev
```

## API chính
`POST /api/auth/login` · `GET|POST|PUT|DELETE /api/{vehicles,employees,visitors,accounts}` ·
`GET /api/history` · `GET /api/dashboard` · `GET /api/gates` · `POST /api/gates/:id/barrier` ·
`POST /api/gates/:id/simulate` (giả lập nhận diện) · `PUT /api/history/:id/resolve`

## Tích hợp AI (làm sau)
Python AI gửi kết quả về:
```
POST /api/ai/detect   Header: x-api-key: smartgate-ai-key
{ "gate_id": 1, "plate": "29A-12345", "confidence": 96.5, "image_path": "..." }
```
Server kiểm tra quyền, ghi lịch sử, mở barrier, phát Socket.IO `plate:detected`.
Socket.IO events: `plate:detected`, `plate:updated`, `barrier:status`.
Phần cứng barrier: chỉnh `backend/server/src/services/barrierService.js`.
