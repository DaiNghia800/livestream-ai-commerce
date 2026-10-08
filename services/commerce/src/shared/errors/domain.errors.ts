/**
 * Lỗi nghiệp vụ dùng chung.
 *
 * Ném exception thay vì trả về null/false là có chủ đích: người gọi
 * không thể "quên kiểm tra" rồi đi tiếp với dữ liệu sai.
 */

export class DomainError extends Error {
  readonly code: string = "DOMAIN_ERROR";

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Không đủ tồn khả dụng.
 *
 * Mang theo cả ba con số để tầng controller trả lời khách "chỉ còn 3 cái"
 * mà không phải truy vấn lại database — lúc đó số có thể đã khác.
 */
export class OutOfStockError extends DomainError {
  readonly code = "OUT_OF_STOCK";

  constructor(
    readonly skuId: string,
    readonly requested: number,
    readonly sellable: number
  ) {
    super(`SKU ${skuId}: cần ${requested}, chỉ còn ${sellable} khả dụng`);
  }
}

export class SkuNotFoundError extends DomainError {
  readonly code = "SKU_NOT_FOUND";

  constructor(readonly skuId: string) {
    super(`SKU ${skuId} không tồn tại hoặc đã ngừng bán`);
  }
}

export class OrderNotFoundError extends DomainError {
  readonly code = "ORDER_NOT_FOUND";

  constructor(readonly identifier: string) {
    super(`Không tìm thấy đơn ${identifier}`);
  }
}

/**
 * Chuyển trạng thái không hợp lệ.
 *
 * Ví dụ: cố xác nhận một đơn đã huỷ, hoặc hoàn tất một đơn chưa xác nhận.
 * Mang theo trạng thái hiện tại để client hiển thị thông báo đúng việc
 * thay vì chỉ "thao tác thất bại".
 */
export class InvalidOrderStateError extends DomainError {
  readonly code = "INVALID_ORDER_STATE";

  constructor(
    readonly orderId: string,
    readonly currentStatus: string,
    readonly attempted: string
  ) {
    super(
      `Đơn đang ở trạng thái ${currentStatus}, không thể ${attempted}`
    );
  }
}

/** Mọi dòng hàng đều không giữ được chút nào. */
export class AllLinesOutOfStockError extends DomainError {
  readonly code = "OUT_OF_STOCK";

  constructor(
    readonly rejected: Array<{ skuId: string; requested: number; sellable: number }>
  ) {
    super("Không giữ được dòng hàng nào");
  }
}
