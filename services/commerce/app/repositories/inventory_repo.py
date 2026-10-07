"""Giữ và trả tồn kho — bốn thao tác nguyên tử.

Viết SQL thuần, KHÔNG dùng ORM. Lý do: tính đúng đắn ở đây nằm ở chỗ
Postgres khoá dòng thế nào, mà ORM lại giấu đi đúng phần đó.

Bất biến phải luôn đúng:
    0 <= held_quantity <= on_hand_quantity
    sellable = on_hand_quantity - held_quantity

Mọi hàm ở đây KHÔNG commit. Người gọi quyết định ranh giới transaction,
vì giữ tồn phải nằm chung transaction với việc tạo đơn.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.errors import OutOfStock, SkuNotFound

def _sellable(session: Session, sku_id: int, *, lock: bool) -> int:
    """Doc ton kho kha dung, neu lock = true thi giu khoa dong toi het transaction"""
    sql = """
        select on_hand_quantity - held_quantity
        from inventory
        where sku_id = :sku_id
    """
    if lock:
        sql += " for update"
    row = session.execute(text(sql), {"sku_id": sku_id}).first()
    if row is None:
        raise SkuNotFound(f"Không có dòng tồn cho SKU {sku_id}")
    return row[0]

def hold_stock(session: Session, sku_id: int, quantity: int) -> None:
    """Giữ đủ số lượng, hoặc không giữ gì cả.

    Điều kiện nằm NGAY TRONG câu UPDATE. Postgres khoá dòng khi ghi, nên
    hai request cùng tranh món cuối thì chỉ một câu thoả điều kiện —
    không cần SELECT ... FOR UPDATE riêng.

    Tuyệt đối không tách thành đọc rồi mới ghi khi không giữ khoá: hai
    request cùng đọc thấy sellable = 1 rồi cùng giữ, thành bán vượt kho.
    """

    if quantity <= 0:
        raise ValueError("quantity phải >= 0")
    res = session.execute(
        text("""
            update inventory
            set held_quantity = held_quantity + :qty,
                version = version + 1,
                updated_at = now()
            where sku_id = :sku_id
                and on_hand_quantity - held_quantity >= :qty
            returning sku_id
        """),
        {"sku_id": sku_id, "qty": quantity},
    ).first()
    if res is None:
        # Không phân biệt được "hết hàng" với "SKU không tồn tại" từ
        # rowcount, nên đọc lại để báo lỗi cho đúng.
        raise OutOfStock(sku_id, quantity, _sellable(session, sku_id, lock=False))

def hold_up_to(session: Session, sku_id: int, quantity: int) -> int:
    """Giữ tối đa có thể, trả về số thực giữ được (có thể là 0).

        Dùng cho BẪY-06: khách muốn 5 mà còn 3 thì giữ 3 rồi hỏi lại, chứ
        từ chối trắng là mất đơn — ngoài đời host sẽ nói "còn 3 thôi chị lấy không".

        Ở đây đọc trước rồi ghi sau là AN TOÀN, vì FOR UPDATE giữ khoá dòng
        tới hết transaction. Cái nguy hiểm là đọc mà không khoá.
    """
    if quantity <= 0:
        raise ValueError("quantity phải >= 0")

    granted = min(quantity, _sellable(session, sku_id, lock=True))
    if granted <= 0:
        return 0

    session.execute(
        text("""
            update inventory
            set held_quantity = held_quantity + :qty,
                version = version + 1,
                updated_at = now()
            where sku_id = :sku_id
        """),
        {"sku_id": sku_id, "qty": granted},
    )

    return granted

def release_stock(session: Session, reservation_id: int, reason: str) -> bool:
    """Trả tồn về kho. Trả False nếu lượt giữ đã được xử lý trước đó.

    Mệnh đề `AND status = 'HOLDING'` là thứ làm hàm này chạy lại được
    nhiều lần mà không hỏng. Job quét hết hạn chạy hai lần, hoặc hai
    worker cùng bắt một dòng, cũng chỉ trừ held_quantity đúng một lần.
    """
    row = session.execute(
        text(
            """
            update reservations
            set status = 'RELEASED',
                released_at = now(),
                release_reason = :reason
            where id = :rid
            and status = 'HOLDING'
            returning sku_id, quantity
            """
        ),
        {"rid": reservation_id, "reason": reason},
    ).first()

    if row is None:
        return False

    sku_id, quantity = row
    session.execute(
        text("""
            update inventory
            set held_quantity = held_quantity - :qty,
                version = version + 1,
                updated_at = now()
            where sku_id = :sku_id
        """),
        {"sku_id": sku_id, "qty": quantity},
    )
    return True

def commit_stock(session: Session, reservation_id: int) -> bool:
    """Xuất kho thật: trừ cả tồn thực tế lẫn tồn giữ chỗ.

    Phải trừ CẢ HAI trong một câu, nếu không bất biến
    sellable = on_hand - held sẽ sai trong khoảnh khắc giữa hai câu lệnh
    và màn hình shop sẽ thấy số nhảy.
    """
    row = session.execute(
        text(
            """
                update reservations
                set status = 'CONSUMED',
                    released_at = now(),
                    release_reason = 'FULFILLED'
                where id = :rid
                and status = 'HOLDING'
                returning sku_id, quantity
            """
        ), {"rid": reservation_id}
    ).first()

    if row is None:
        return False

    sku_id, quantity = row
    session.execute(
        text(
            """
                update inventory
                set held_quantity = held_quantity - :qty,
                    on_hand_quantity = on_hand_quantity - :qty,
                    version = version + 1,
                    updated_at = now()
                where sku_id = :sku_id
            """
        ), {"sku_id": sku_id, "qty": quantity},
    )
    return True


        