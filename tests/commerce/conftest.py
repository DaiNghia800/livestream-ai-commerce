"""conftest.py — cho pytest thấy mã nguồn của Commerce Service.

Thêm 'services/commerce/' vào sys.path để test import được `app.*`,
giống cách tests/ai-worker/conftest.py đang làm.
"""

from pathlib import Path
import sys
from uuid import uuid4

import pytest
from sqlalchemy import text


COMMERCE_DIR = Path(__file__).resolve().parents[2] / "services" / "commerce"
sys.path.insert(0, str(COMMERCE_DIR))

TABLES = (
    "reservations, order_items, order_status_history, orders, "
    "inventory, product_skus, products"
)

@pytest.fixture(scope="session")
def engine():
    from app.db import engine as _engine

    try:
        with _engine.connect() as conn:
            conn.execute(text("select 1"))
    except Exception as e:
        pytest.skip(f"Chưa kết nối được Postgres, bỏ qua test tích hợp: {e}")
    return _engine

@pytest.fixture(autouse=True)
def clean_tables(request, engine):
    """Dọn bảng sau mỗi test để test không ảnh hưởng lẫn nhau."""
    yield
    if "engine" in request.fixturenames:
        with engine.begin() as conn:
            conn.execute(text(f"truncate {TABLES} restart identity cascade"))

@pytest.fixture
def make_sku(engine):
    """Tạo một SKU kèm tồn kho, trả về sku_id.

    Dòng inventory do trigger trg_sku_init_inventory tự tạo, ở đây chỉ
    đặt lại số lượng.
    """

    def _make(on_hand: int, held: int = 0) -> int:
        with engine.begin() as conn:
            product_id = conn.execute(
                text("""
                    insert into products (shop_id, code, name)
                    values (1, :code, 'Sản phẩm test')
                    returning id
                """),
                {"code": f"P-{uuid4().hex[:10]}"},
            ).scalar_one()

            sku_id = conn.execute(
                text("""
                    insert into product_skus (product_id, sku_code, variant_name, price)
                    values (:pid, :code, 'mặc định', 100000)
                    returning id
                """),
                {"pid": product_id, "code": f"SKU-{uuid4().hex[:10]}"},
            ).scalar_one()

            conn.execute(
                text("""
                    update inventory
                    set on_hand_quantity = :on_hand,
                        held_quantity = :held
                    where sku_id = :sku_id
                """),
                {"on_hand": on_hand, "held": held, "sku_id": sku_id},
            )
        return sku_id
    return _make

@pytest.fixture
def make_reservation(engine):
    """Tạo đơn + dòng hàng + lượt giữ đang HOLDING, trả về reservation_id."""
    def _make(sku_id: int, quantity: int) -> int:
        with engine.begin() as conn:
            order_id = conn.execute(
                text("""
                    insert into orders (order_code, customer_id, shop_id, source, 
                                        idempotency_key, status, held_until)
                    values (:code, 1, 1, 'BUTTON', :idem, 'DRAFT', now() + interval '5 minutes')
                    returning id
                """),
                {"code": f"ORD-{uuid4().hex[:8]}", "idem": uuid4().hex},
            ).scalar_one()

            item_id = conn.execute(
                text("""
                    insert into order_items (order_id, sku_id, quantity, unit_price)
                    values (:oid, :sku, :qty, 100000)
                    returning id
                """),
                {"oid": order_id, "sku": sku_id, "qty": quantity},
            ).scalar_one()

            return conn.execute(
                text("""
                    insert into reservations (order_id, order_item_id, sku_id, quantity)
                    values (:oid, :iid, :sku, :qty)
                    returning id
                """),
                {"oid": order_id, "iid": item_id, "sku": sku_id, "qty": quantity},
            ).scalar_one()
    return _make