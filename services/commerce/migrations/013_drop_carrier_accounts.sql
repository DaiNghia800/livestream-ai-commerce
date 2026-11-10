-- Bỏ bảng `carrier_accounts`.
--
-- Tạo ở migration 011 với ý định lưu trạng thái kết nối từng hãng,
-- nhưng rồi không dòng code nào đọc hay ghi: khoá nằm ở biến môi
-- trường, còn "hãng nào bấm được" tính thẳng từ cấu hình qua
-- availableCarriers() nên luôn đúng với thực tế, không cần bảng nào
-- đồng bộ theo.
--
-- Để lại một bảng rỗng tốn kém hơn là xoá: người sau đọc schema sẽ
-- tưởng nó đang được dùng và viết code dựa vào, hoặc mất thời gian
-- đi tìm xem ai ghi vào đó.
--
-- Cần lại thì dựng mới dễ hơn là gỡ một bảng đã có dữ liệu rác.

DROP TABLE IF EXISTS carrier_accounts;
