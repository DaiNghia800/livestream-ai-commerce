# Quản lý người dùng và phân quyền

## Vai trò

| Role | Ý nghĩa |
| --- | --- |
| `customer` | Vai trò mặc định khi tự đăng ký; không có quyền quản trị |
| `shop_owner` | Tài khoản chủ shop |
| `admin` | Có thể xem danh sách người dùng, đổi role và khóa/mở tài khoản |

API đăng ký công khai không chấp nhận trường `role`. Role do server gán là
`customer`; gửi thêm role trong payload sẽ bị từ chối. Chỉ endpoint quản trị
được bảo vệ bằng access token của admin mới có thể cập nhật role.

## Tạo admin đầu tiên

Tạo tài khoản admin lần đầu bằng lệnh có kiểm soát; không có endpoint đăng ký
admin công khai. Đứng tại thư mục gốc của repo trong PowerShell, thay email
bằng email muốn dùng để đăng nhập admin, rồi chạy:

```powershell
$env:ADMIN_BOOTSTRAP_EMAIL = "your-email@example.com"
$env:ADMIN_BOOTSTRAP_FULL_NAME = "System Admin"
$secureAdminPassword = Read-Host "Đặt mật khẩu admin riêng (8-128 ký tự)" -AsSecureString
$env:ADMIN_BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new("", $secureAdminPassword).Password
cd .\services\commerce
npm run bootstrap:admin
Remove-Item Env:ADMIN_BOOTSTRAP_PASSWORD
Remove-Variable secureAdminPassword
```

Lệnh chỉ chạy khi chưa có admin đang hoạt động. Nó có thể nâng tài khoản trùng
email đã tồn tại thành admin, nhưng chỉ trong lần bootstrap đầu và bằng mật
khẩu do người vận hành cung cấp. Không ghi mật khẩu thật vào `.env.example` hoặc
Git.

## Cổng quản trị và lời mời shop

Admin đăng nhập riêng tại `/admin`; phiên admin được lưu tách biệt với phiên
shop/khách hàng. Sau đăng nhập, trang mời shop tại `/shop/invitations` và trang
quản lý user tại `/shop/users` dùng chung layout khu vực shop. API xác thực role
admin trên từng request. Tài khoản admin không đăng nhập được qua form chung
tại `/login`. Tại trang mời shop, admin có thể tạo lời mời bằng tên người
đại diện, email và tên shop. Hệ thống tạo link dùng một lần, hết hạn sau 7 ngày;
admin sao chép link và gửi riêng cho người nhận. Link mang token ở URL fragment
(`#token`) để token không bị gửi trong HTTP request của trình duyệt, còn database
chỉ lưu SHA-256 của token. Không chia sẻ link công khai.

Migration tạo bảng `shops` và `shop_invitations` được backend tự áp dụng khi
khởi động. Có thể áp dụng thủ công trong `services/commerce` bằng `npm run migrate`.

Shop tự đặt mật khẩu tại `/accept-shop-invitation`. User với role `shop_owner`
và shop profile được tạo trong cùng transaction khi lời mời hợp lệ được chấp
nhận. Sau đó shop đăng nhập tại `/login`. Admin có thể xem trạng thái, thu hồi
lời mời đang chờ, hoặc tạo link mới để vô hiệu hóa token cũ. Nếu link hết hạn,
admin cần tạo link mới trước khi shop thử lại.

## API quản trị

Các API quản trị sau yêu cầu `Authorization: Bearer <access_token>` của admin
đang hoạt động:

| Method | Route | Chức năng |
| --- | --- | --- |
| `GET` | `/api/admin/users?limit=50&offset=0` | Liệt kê người dùng, tối đa 100 mỗi trang |
| `PATCH` | `/api/admin/users/:userId` | Đổi `role`, `is_active`, hoặc cả hai |
| `GET` | `/api/admin/shop-invitations?limit=50&offset=0` | Liệt kê lời mời, không trả token |
| `POST` | `/api/admin/shop-invitations` | Tạo lời mời shop; token chỉ trả một lần |
| `POST` | `/api/admin/shop-invitations/:invitationId/rotate` | Tạo token mới cho lời mời chưa chấp nhận |
| `POST` | `/api/admin/shop-invitations/:invitationId/revoke` | Thu hồi lời mời đang chờ |
| `POST` | `/api/auth/accept-shop-invitation` | Nhận token và mật khẩu để kích hoạt shop |

Không trả password hash/session trong danh sách. Tài khoản không thể tự đổi role
hoặc tự khóa chính mình; hệ thống không cho hạ quyền hoặc khóa admin đang hoạt
động cuối cùng. Quyền được nạp lại từ cơ sở dữ liệu trên từng request quản trị,
nên token cũ không giữ quyền admin sau khi role bị đổi hoặc tài khoản bị khóa.

Giao diện quản lý người dùng: `/shop/users`; giao diện mời shop:
`/shop/invitations`. Cả hai nằm trong layout quản lý shop. Đường dẫn cũ
`/admin/users` chuyển tiếp đến trang quản lý người dùng. Admin đăng nhập tại
`/admin`, chủ shop đăng nhập tại `/login` và đến `/shop`, còn customer về trang
cửa hàng.
