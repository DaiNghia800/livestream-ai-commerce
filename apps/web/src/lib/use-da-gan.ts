"use client";

import { useSyncExternalStore } from "react";

/**
 * true sau khi đã gắn vào trình duyệt, false lúc server render.
 *
 * Token nằm trong localStorage, server không đọc được. Rẽ nhánh theo
 * token ngay trong lần render đầu thì HTML server khác HTML client →
 * React báo hydration mismatch và vẽ lại cả cây. Chờ gắn xong rồi mới
 * rẽ.
 */
export function useDaGan(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
