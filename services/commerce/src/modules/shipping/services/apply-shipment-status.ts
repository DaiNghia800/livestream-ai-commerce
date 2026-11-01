/**
 * Việc phải làm khi vận đơn chạm một mốc lớn.
 *
 * ── VÌ SAO TÁCH RA FILE RIÊNG ──
 *
 * Trạng thái vận đơn về bằng HAI đường: webhook của hãng, và job
 * đồng bộ dự phòng khi webhook im. Hai đường phải cho ra cùng một
 * kết quả.
 *
 * Để mỗi bên tự xử lý thì sớm muộn cũng lệch nhau, và lệch theo kiểu
 * tệ nhất: webhook chạy tốt thì mọi thứ đúng, tới lúc webhook hỏng —
 * đúng lúc đang cần lưới an toàn — thì job bù được trạng thái nhưng
 * quên trừ kho, và không ai nhận ra cho tới kỳ kiểm kê.
 */

import type { PoolClient } from "pg";
import {
  commitStock,
  releaseStock,
} from "../../order/repositories/inventory.repository.js";
import { findHoldingReservationIds } from "../../order/repositories/order-lifecycle.repository.js";
import type { ShipmentStatus } from "../carriers/index.js";
import {
  markOrderStatus,
  restockFromReturn,
  type VanDon,
} from "../repositories/shipment.repository.js";

/**
 * Chỉ ba mốc đụng tới đơn hàng và kho.
 *
 * Những mốc còn lại (IN_TRANSIT, OUT_FOR_DELIVERY...) chỉ để khách
 * theo dõi, không kéo theo thay đổi nào về tiền hay tồn.
 */
export async function apDungMocLon(
  client: PoolClient,
  vanDon: VanDon,
  moc: ShipmentStatus,
  moTa = ""
): Promise<void> {
  if (moc === "PICKED_UP") {
    // HÀNG RỜI KHO Ở ĐÂY, không phải lúc khách ký nhận (QĐ-V3).
    //
    // commitStock trừ cả on_hand lẫn held trong một câu nên bất biến
    // "khả dụng = on_hand - held" không sai ở giữa chừng. Nó cũng có
    // guard `status='HOLDING'` nên gọi trùng là vô hại.
    for (const id of await findHoldingReservationIds(client, vanDon.orderId)) {
      await commitStock(client, id);
    }
    await markOrderStatus(client, {
      orderId: vanDon.orderId,
      from: "PROCESSING",
      to: "SHIPPING",
      note: `Hãng ${vanDon.carrier} đã lấy hàng`,
    });
    return;
  }

  if (moc === "DELIVERED") {
    // Giao xong chỉ ĐÓNG ĐƠN. Tiền COD còn nằm ở hãng, thường vài
    // ngày tới một tuần mới chuyển về — ghi nhận đã thu ở đây là báo
    // cáo có doanh thu mà tài khoản thì không có tiền (QĐ-V5).
    await markOrderStatus(client, {
      orderId: vanDon.orderId,
      from: "SHIPPING",
      to: "COMPLETED",
      note: "Khách đã nhận hàng",
    });
    return;
  }

  if (moc === "RETURNED") {
    // Hàng quay về là một lần NHẬP KHO thật. Thiếu nhánh này thì tồn
    // thiếu vĩnh viễn và không ai truy ra vì sao.
    await restockFromReturn(
      client,
      vanDon.orderId,
      `Hoàn từ vận đơn ${vanDon.trackingCode ?? vanDon.clientOrderCode}`
    );

    // Phần chưa kịp xuất (nếu có) thì trả chỗ giữ về.
    for (const id of await findHoldingReservationIds(client, vanDon.orderId)) {
      await releaseStock(client, id, "RETURNED");
    }

    await markOrderStatus(client, {
      orderId: vanDon.orderId,
      from: "SHIPPING",
      to: "RETURNED",
      note: moTa || "Hàng hoàn về kho",
    });
  }
}
