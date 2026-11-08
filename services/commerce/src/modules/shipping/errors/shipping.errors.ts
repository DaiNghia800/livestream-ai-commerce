/**
 * Lỗi nghiệp vụ của phần vận chuyển.
 *
 * Mỗi lỗi mang một `code` riêng để màn hình hiện đúng câu cho shop
 * đọc. Gộp tất cả thành "lỗi hệ thống" thì người dùng không biết phải
 * sửa gì — mà ở đây gần như lỗi nào cũng sửa được bằng một thao tác.
 */

import { DomainError } from "../../../shared/errors/domain.errors.js";

export class ShipmentNotFoundError extends DomainError {
  readonly code = "SHIPMENT_NOT_FOUND";
  constructor(readonly id: string) {
    super(`Không tìm thấy vận đơn ${id}`);
  }
}

/** Đơn chưa xác nhận, đã huỷ, hoặc đã hết hạn giữ hàng. */
export class OrderNotReadyForShipmentError extends DomainError {
  readonly code = "ORDER_NOT_READY";
  constructor(
    readonly orderCode: string,
    readonly status: string
  ) {
    super(
      `Đơn ${orderCode} đang ở trạng thái ${status}, chỉ đơn đã xác nhận mới tạo được vận đơn`
    );
  }
}

/**
 * Địa chỉ chưa tách được thành tỉnh/phường khớp danh mục hãng.
 *
 * Đẩy đi luôn thì hãng từ chối với một câu chung chung, và shop phải
 * tự đoán sai ở đâu. Chặn từ đây và nói rõ thiếu gì.
 */
export class AddressNotNormalizedError extends DomainError {
  readonly code = "ADDRESS_NOT_NORMALIZED";
  constructor(
    readonly orderCode: string,
    readonly lyDo: string
  ) {
    super(`Địa chỉ đơn ${orderCode} chưa dùng được: ${lyDo}`);
  }
}

/** Đơn đã có vận đơn đang sống. */
export class ShipmentAlreadyExistsError extends DomainError {
  readonly code = "SHIPMENT_ALREADY_EXISTS";
  constructor(readonly orderCode: string) {
    super(
      `Đơn ${orderCode} đã có vận đơn đang hoạt động. Huỷ vận đơn cũ trước khi tạo mới.`
    );
  }
}

/**
 * Khách có lịch sử bom hàng, không cho thu hộ.
 *
 * BẪY-08 đã chặn ở bước chọn phương thức thanh toán, nhưng phải chặn
 * lại ở đây: mọi đường vào đều phải đi qua một chỗ kiểm duy nhất, chứ
 * không tin rằng bước trước đã kiểm rồi.
 */
export class CodNotAllowedError extends DomainError {
  readonly code = "COD_NOT_ALLOWED";
  constructor(readonly orderCode: string) {
    super(
      `Đơn ${orderCode} bị chặn thu tiền mặt khi giao. Cần thu đủ tiền trước khi tạo vận đơn; đặt cọc một phần chưa đủ.`
    );
  }
}

/** GHN cần cân nặng và kích thước từng kiện khi dùng dịch vụ hàng nặng. */
export class GhnHeavyShipmentNotSupportedError extends DomainError {
  readonly code = "GHN_HEAVY_SHIPMENT_NOT_SUPPORTED";
  constructor() {
    super(
      "GHN từ 20.000 g cần cân nặng và kích thước từng kiện; ứng dụng chưa hỗ trợ nhập thông tin này"
    );
  }
}

/** Hàng đã nằm trong tay hãng, không huỷ phía ta được nữa. */
export class CannotCancelShipmentError extends DomainError {
  readonly code = "CANNOT_CANCEL_SHIPMENT";
  constructor(readonly status: string) {
    super(
      `Vận đơn đang ở trạng thái ${status}, hàng đã bàn giao cho hãng nên không huỷ được.`
    );
  }
}

/** Chỉ đơn tự giao mới được cập nhật tay và phải ghi nhận lấy hàng trước. */
export class InvalidManualShipmentStatusError extends DomainError {
  readonly code = "INVALID_MANUAL_SHIPMENT_STATUS";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Mốc giả lập không hợp lệ.
 *
 * Tách khỏi `CarrierRejectedError`: cái đó trả 502 vì nghĩa là HÃNG
 * từ chối. Ở đây hãng chưa hề được gọi — lỗi nằm ở phía bấm nút, nên
 * phải là 400. Trả 502 cho lỗi của mình là đẩy người đọc log đi tìm
 * sự cố bên ngoài trong khi vấn đề nằm ngay trong nhà.
 */
export class InvalidSimulationStepError extends DomainError {
  readonly code = "INVALID_SIMULATION_STEP";
  constructor(message: string) {
    super(message);
  }
}
