"use client";

import { useEffect, useState } from "react";

/**
 * Đồng hồ dùng chung cho các ô đếm ngược.
 *
 * Trả 0 ở lần render đầu, cố ý: phía server không có "bây giờ" giống
 * phía trình duyệt, nên render ra hai chuỗi khác nhau là React báo
 * lệch hydration. Nơi gọi dựa vào 0 để biết chưa có giờ thật mà hiện
 * dấu gạch.
 *
 * Mốc thật được đặt trong `setTimeout(…, 0)` chứ không gọi thẳng
 * trong thân effect: gọi thẳng sẽ kích hoạt một vòng render nối tiếp
 * ngay lập tức, và đó là lỗi mà quy tắc lint của React bắt.
 *
 * `active` cho phép tắt hẳn đồng hồ khi màn hình không còn gì đếm —
 * một interval chạy ngầm mỗi giây trên trang đứng yên là lãng phí.
 */
export function useNow(active = true, intervalMs = 1000): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!active) return;

    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);

    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, intervalMs]);

  return now;
}
