class CommerceError(Exception):
    """Gốc chung, để tầng API bắt một chỗ."""
    code = "COMMERCE_ERROR"

class OutOfStock(CommerceError):
    code = "OUT_OF_STOCK"

    def __init__(self, sku_id: int, requested: int, sellable: int):
        self.sku_id = sku_id
        self.requested = requested
        self.sellable = sellable
        super().__init__(
            f"SKU {sku_id}: cần {requested}, chỉ còn {sellable} khả dụng"
        )

class SkuNotFound(CommerceError):
    code = "SKU_NOT_FOUND"