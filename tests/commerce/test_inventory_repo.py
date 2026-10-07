"""Test bốn thao tác giữ/trả tồn.

Ba ca quan trọng nhất, là lý do cả thiết kế này tồn tại:
    - khong_ban_vuot_kho       : 20 request song song giành 1 món
    - release_chay_hai_lan     : job quét chạy lại không trả tồn hai lần
    - bat_bien_ton_kho         : tổng HOLDING luôn khớp held_quantity
"""

from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.errors import OutOfStock
from app.repositories.inventory_repo import commit_stock, hold_stock, hold_up_to, release_stock


def _stock(engine, sku_id):
    with engine.connect() as conn:
        return conn.execute(
            text("""
                select on_hand_quantity, held_quantity,
                    on_hand_quantity - held_quantity
                from inventory
                where sku_id = :sku
            """),
            {"sku": sku_id},
        ).one()

def test_hold_stock_succeeds(engine, make_sku):
    sku = make_sku(on_hand=10)
    with Session(engine) as s:
        hold_stock(s, sku, 2)
        s.commit()
    assert _stock(engine, sku) == (10, 2, 8)

def test_hold_beyond_stock_raises_out_of_stock(engine, make_sku):
    sku = make_sku(on_hand=5, held=5)
    with Session(engine) as s:
        with pytest.raises(OutOfStock) as e:
            hold_stock(s, sku, 1)
        s.rollback()
    assert e.value.sellable == 0
    assert _stock(engine, sku) == (5, 5, 0)

def test_hold_stock_never_holds_partially(engine, make_sku):
    """hold_stock là tất-cả-hoặc-không-gì."""
    sku = make_sku(on_hand=3)
    with Session(engine) as s:
        with pytest.raises(OutOfStock):
            hold_stock(s, sku, 5)
        s.rollback()
    assert _stock(engine, sku)[1] == 0

def test_hold_up_to_holds_partially(engine, make_sku):
    sku = make_sku(on_hand=3)
    with Session(engine) as s:
        assert hold_up_to(s, sku, 5) == 3
        s.commit()
    assert _stock(engine, sku) == (3, 3, 0)

def test_hold_up_to_returns_0_when_sold_out(engine, make_sku):
    sku = make_sku(on_hand = 2, held = 2)
    with Session(engine) as s:
        assert hold_up_to(s, sku, 1) == 0
        s.commit()
    assert _stock(engine, sku)[1] == 2

def test_no_oversell(engine, make_sku):
    """Tồn 1, 20 request song song cùng giành — đúng 1 thắng.

    Mỗi luồng một connection riêng, vì đây chính là thứ cần kiểm:
    Postgres xử lý tranh chấp giữa các connection thế nào.
    """
    sku = make_sku(on_hand = 1)
    def try_hold(_):
        with Session(engine) as s:
            try:
                hold_stock(s, sku, 1)
                s.commit()
                return 1
            except OutOfStock:
                s.rollback()
                return 0

    with ThreadPoolExecutor(max_workers = 20) as pool:
        successes = sum(pool.map(try_hold, range(20)))

    assert successes == 1
    assert _stock(engine, sku) == (1, 1, 0)

def test_concurrent_holds_exactly_exhaust_stock(engine, make_sku):
    sku = make_sku(on_hand = 100)
    def try_hold(_):
        with Session(engine) as s:
            try:
                hold_stock(s, sku, 2)
                s.commit()
                return 1
            except OutOfStock:
                s.rollback()
                return 0

    with ThreadPoolExecutor(max_workers = 20) as pool:
        successes = sum(pool.map(try_hold, range(51)))

    assert successes == 50
    assert _stock(engine, sku) == (100, 100, 0)

def test_release_returns_stock(engine, make_sku, make_reservation):
    sku = make_sku(on_hand = 10, held = 3)
    res = make_reservation(sku, 3)
    with Session(engine) as s:
        assert release_stock(s, res, "CUSTOMER_CANCEL") is True
        s.commit()
    assert _stock(engine, sku) == (10, 0, 10)

def test_release_twice_is_idempotent(engine, make_sku, make_reservation):
    """Ca quan trọng nhất của job quét hết hạn.

    Không có mệnh đề `AND status = 'HOLDING'` thì lần hai sẽ trừ
    held_quantity thêm lần nữa và tồn bị thổi phồng sai.
    """
    sku = make_sku(on_hand = 10, held = 3)
    res = make_reservation(sku, 3)

    with Session(engine) as s:
        assert release_stock(s, res, "TTL_EXPIRED") is True
        s.commit()
    with Session(engine) as s:
        assert release_stock(s, res, "TTL_EXPIRED") is False
        s.commit()

    assert _stock(engine, sku) == (10, 0, 10)

def test_commit_deducts_both_column(engine, make_sku, make_reservation):
    sku = make_sku(on_hand = 10, held = 3)
    res = make_reservation(sku, 3)
    with Session(engine) as s:
        assert commit_stock(s, res) is True
        s.commit()
    assert _stock(engine, sku) == (7, 0, 7)

def test_commit_twice_is_idempotent(engine, make_sku, make_reservation):
    sku = make_sku(on_hand = 10, held = 3)
    res = make_reservation(sku, 3)
    with Session(engine) as s:
        assert commit_stock(s, res) is True
        s.commit()
    with Session(engine) as s:
        assert commit_stock(s, res) is False
        s.commit()
    assert _stock(engine, sku) == (7, 0, 7)

def test_held_matches_holding_reservations(engine, make_sku, make_reservation):
    """Tổng số lượng đang HOLDING phải luôn khớp inventory.held_quantity."""
    sku = make_sku(on_hand = 20)
    with Session(engine) as s:
        hold_stock(s, sku, 5)
        s.commit()
    res = make_reservation(sku, 5)
    with Session(engine) as s:
        release_stock(s, res, "SHOP_CANCEL")
        s.commit()

    with engine.connect() as conn:
        held = conn.execute(
            text("select held_quantity from inventory where sku_id = :s"), {"s": sku}
        ).scalar_one()
        total = conn.execute(
            text("""
                select coalesce(sum(quantity), 0) from reservations
                where sku_id = :s and status = 'HOLDING'
            """),
            {"s": sku}
        ).scalar_one()
    assert held == total

    
        
    
