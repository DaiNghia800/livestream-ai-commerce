# Task — Đơn nháp & Giữ hàng

> **Nguồn duy nhất là [tasks.csv](tasks.csv).** Sửa CSV, đừng sửa file này hay sửa issue bằng tay — nếu không ba nơi sẽ lệch nhau sau vài tuần.
> Thiết kế: [README.md](README.md) · ERD: [erd.dbml](erd.dbml)

---

## Đưa task vào đâu

### Cách 1 — GitHub Issues (khuyến nghị)

```bash
gh auth login                                   # chạy một lần
python scripts/seed_github_issues.py --dry-run  # xem trước, không tạo gì
python scripts/seed_github_issues.py            # tạo thật
```

Script đọc `tasks.csv` rồi tạo 13 issue kèm nhãn (`area:*`, `priority:*`), milestone *Đơn nháp & Giữ hàng*, checklist việc cần làm, tiêu chí nghiệm thu, và nối quan hệ phụ thuộc (`Chờ: #3` / `Chặn: #7`).

Chạy lại được nhiều lần — issue nào đã có thì bỏ qua, không tạo trùng.

Sau đó tạo Project board: **Projects → New project → Board**, kéo milestone vào, thêm cột `Todo / In progress / Review / Done`.

```bash
gh issue list --milestone "Đơn nháp & Giữ hàng"   # xem tiến độ
gh issue list --label "priority:critical-path"     # xem đường găng
```

### Cách 2 — Import CSV

`tasks.csv` import thẳng được vào Jira, Trello, Notion hay Excel. Cột: `id, title, area, priority, estimate_days, depends_on, summary, acceptance, checklist` (checklist ngăn bằng dấu `|`).

### Cách 3 — Đọc bảng dưới

Nếu nhóm chưa muốn thêm công cụ nào.

---

## Tổng quan

| Task | Tên | Mảng | Ưu tiên | Ngày | Phụ thuộc |
|---|---|---|---|---|---|
| T0 | Duyệt thiết kế và cập nhật ERD | design | 🔴 đường găng | 0.5 | — |
| T1 | Docker Compose và skeleton FastAPI | infra | 🔴 đường găng | 0.5 | — |
| T2 | Migration schema | db | 🔴 đường găng | 1 | T0, T1 |
| T3 | Repository giữ và trả tồn nguyên tử | db | 🔴 đường găng | 1 | T2 |
| T4 | `create_draft_order` và API tạo đơn nháp | api | 🔴 đường găng | 1.5 | T3 |
| T5 | Chống trùng 5 tầng | api | 🟠 cao | 0.5 | T4 |
| T6 | Gộp đơn theo khách và phiên | api | 🟠 cao | 1 | T4, T5 |
| T7 | Đường trả tồn và `extend_hold` | api | 🟠 cao | 1 | T4 |
| T8 | Job quét đơn hết hạn | api | 🟠 cao | 0.5 | T7 |
| T9 | Nhánh chờ duyệt và chuyển chủ reservation | api | 🟠 cao | 1 | T4, T7 |
| T10 | Outbox publisher | api | 🟡 vừa | 0.5 | T4 |
| T11 | Guard nghiệp vụ BẪY-01…12 | api | 🟠 cao | 1 | T4, T9 |
| T12 | Bộ test đầy đủ | test | 🔴 đường găng | 1.5 | T4…T11 |

**Tổng ~11 ngày công.**

```
T0 ─┬─► T2 ─► T3 ─► T4 ─┬─► T5 ─► T6 ────────┐
T1 ─┘                   ├─► T7 ─► T8 ────────┤
                        ├─► T9 ──────────────┼─► T12
                        ├─► T10 ─────────────┤
                        └─► T11 ─────────────┘
```

Đường găng: **T0/T1 → T2 → T3 → T4 → T12**. Sau T4 thì T5–T11 chạy song song được, chia cho nhiều người.

---

## Hai việc đang chặn tất cả

**T0** và **T1** không phụ thuộc gì, làm ngay được, và mọi thứ còn lại đều chờ chúng.

T0 đặc biệt quan trọng: nếu để ERD cũ nằm đó, sẽ có người trong nhóm mở `ERD_LiveCommerce.docx` ra rồi code migration theo schema sai (`ORDERS.sku_id`, `RESERVATION` không có `status`, TTL 3 phút).

---

## Ba ca test bắt buộc phải xanh

Task nào cũng có tiêu chí nghiệm thu riêng trong CSV, nhưng ba ca này là lý do cả phần thiết kế tồn tại:

| Ca | Nội dung | Chứng minh | Thuộc task |
|---|---|---|---|
| #5 | Tồn 1, 20 request song song → đúng 1 thành công | Không bán quá hàng | T3, T4 |
| #13 | Chạy job hết hạn 2 lần → tồn chỉ trả 1 lần | Job idempotent | T3, T8 |
| #19 | Tổng reservation `HELD` khớp `held_qty` | Bất biến tồn kho | T12 |

Chi tiết 30 ca: [README.md](README.md) mục 9.

---

## Ghi chú cho người nhận task

- Đọc [README.md](README.md) mục 2 (3 quyết định thiết kế) **trước** khi động vào code. Phần lớn "tại sao lại làm thế này" nằm ở đó.
- Mọi hàm đụng tới `inventory` đều phải ghi `inventory_ledger` trong **cùng transaction**. Thiếu một chỗ là mất khả năng đối soát.
- Không hard-code TTL. Đọc từ `live_session.hold_ttl_seconds`, fallback về biến môi trường.
- Bốn hàm ở T3 viết **SQL thuần**, không dùng ORM. Lý do ở [README.md](README.md) mục 6.1.
