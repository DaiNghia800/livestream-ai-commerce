-- Hồ sơ cá nhân có số điện thoại, địa chỉ có nhãn "Nhà riêng / Văn phòng".
--
-- Vì sao: màn xác nhận đơn kiểu Shopee/TikTok tự điền tên + SĐT từ hồ
-- sơ khi khách thêm địa chỉ đầu tiên, nên hồ sơ phải có chỗ chứa SĐT.
-- Nhãn địa chỉ chỉ để khách phân biệt nhanh trong popup chọn, không
-- tham gia nghiệp vụ nào — vì thế cho phép NULL.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

ALTER TABLE user_addresses
    ADD COLUMN IF NOT EXISTS label VARCHAR(10)
        CHECK (label IN ('HOME', 'OFFICE'));

COMMENT ON COLUMN users.phone IS
    'Số điện thoại liên hệ; dùng điền sẵn khi khách thêm địa chỉ nhận hàng.';
COMMENT ON COLUMN user_addresses.label IS
    'HOME = nhà riêng, OFFICE = văn phòng. Chỉ để hiển thị.';
