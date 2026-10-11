import { DomainError } from "../../../shared/errors/domain.errors.js";

/** BẪY-08: khách có lịch sử bom hàng thì không được chọn COD. */
export class CodNotAllowedError extends DomainError {
  readonly code = "COD_NOT_ALLOWED";

  constructor(readonly orderId: string) {
    super(
      `Đơn ${orderId} không được thanh toán khi nhận hàng. ` +
        `Khách cần chuyển khoản trước hoặc đặt cọc.`
    );
  }
}

export class PaymentNotFoundError extends DomainError {
  readonly code = "PAYMENT_NOT_FOUND";

  constructor(readonly orderId: string) {
    super(`Đơn ${orderId} chưa có khoản thu nào`);
  }
}

/**
 * Tiền về mà không khớp đơn nào.
 *
 * Khách gõ sai nội dung chuyển khoản, hoặc chuyển cho shop khác. Phải
 * ném lỗi chứ tuyệt đối không nuốt im lặng: tiền đã vào tài khoản
 * thật rồi, phải có người biết để tra và xử lý.
 */
export class UnknownTransferError extends DomainError {
  readonly code = "UNKNOWN_TRANSFER";

  constructor(
    readonly txnRef: string,
    readonly amount: string
  ) {
    super(
      `Nhận ${amount} với nội dung "${txnRef}" nhưng không khớp khoản thu nào. ` +
        `Cần đối soát tay.`
    );
  }
}
