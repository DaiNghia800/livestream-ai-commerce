"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  /** Lần tải ĐẦU TIÊN, chưa có gì để hiện. */
  loading: boolean;
  /** Đang tải lại nhưng vẫn còn dữ liệu cũ để hiện. */
  refreshing: boolean;
  error: ApiError | null;
  /** Gọi lại để làm mới, dùng sau khi thao tác làm đổi dữ liệu. */
  reload: () => void;
}

/**
 * Gọi API một lần khi vào màn hình, kèm trạng thái tải và lỗi.
 *
 * `deps` là các giá trị mà khi đổi thì phải gọi lại (bộ lọc chẳng
 * hạn). Hàm `fetcher` cố tình KHÔNG nằm trong deps: nó thường là một
 * hàm mũi tên dựng lại mỗi lần render, đưa vào deps sẽ thành vòng lặp
 * gọi API vô tận.
 *
 * `loading` được SUY RA khi render chứ không phải một ô state đặt
 * trong effect. Đặt `setLoading(true)` ngay trong thân effect sẽ kích
 * hoạt một vòng render nối tiếp — React có hẳn một quy tắc lint bắt
 * lỗi này. Ở đây ta so khoá của dữ liệu đang giữ với khoá hiện tại:
 * lệch nhau nghĩa là dữ liệu thuộc về bộ lọc cũ, tức đang tải.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  // Tính thẳng khi render chứ không useMemo: chuỗi hoá vài giá trị
  // bộ lọc rẻ hơn nhiều so với việc giữ một ô nhớ đệm, và useMemo
  // không nhận danh sách phụ thuộc dựng động.
  const key = JSON.stringify([...deps, nonce]);

  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    error: ApiError | null;
  }>({ key: null, data: null, error: null });

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let huy = false;

    fetcher()
      .then((result) => {
        // Người dùng đã đổi bộ lọc hoặc rời màn hình trước khi API
        // trả về. Ghi state lúc này là đè kết quả cũ lên kết quả mới.
        if (!huy) setState({ key, data: result, error: null });
      })
      .catch((err) => {
        if (huy) return;
        setState({
          key,
          data: null,
          error: err instanceof ApiError ? err : new ApiError(0, String(err)),
        });
      });

    return () => {
      huy = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Đang chờ dữ liệu của bộ lọc hiện tại.
  const dangCho = state.key !== key;

  // GIỮ dữ liệu cũ trong lúc tải lại, chỉ hiện khối "đang tải" ở lần
  // đầu. Thay bảng bằng một khối ngắn hơn rồi giãn lại khiến trang
  // nhảy dưới ngón tay người dùng — trên điện thoại đủ để bấm trượt
  // sang phần tử khác.
  return {
    data: state.data,
    loading: dangCho && state.key === null,
    refreshing: dangCho && state.key !== null,
    error: dangCho ? null : state.error,
    reload,
  };
}
