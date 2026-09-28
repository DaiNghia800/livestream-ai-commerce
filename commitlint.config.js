// commitlint.config.js — Cấu hình kiểm tra commit message
// Đặt tại gốc project (cùng cấp với apps/, services/)
// Tài liệu: https://commitlint.js.org

// Extends từ bộ quy tắc Conventional Commits chuẩn của cộng đồng
module.exports = {
  extends: ["@commitlint/config-conventional"],

  rules: {
    // ── Type ──────────────────────────────────────────────────────
    // 2 = error (bắt buộc), "always" = luôn áp dụng
    // Chỉ cho phép các type này, phù hợp với quy chuẩn của nhóm:
    //   feat     → thêm tính năng mới
    //   fix      → sửa lỗi
    //   docs     → thay đổi tài liệu
    //   refactor → tối ưu/tái cấu trúc code, không thêm/sửa tính năng
    //   test     → viết/sửa test
    //   chore    → config, build, CI/CD, dependency
    //   style    → format code (whitespace, semicolon...)
    //   perf     → cải thiện performance
    //   revert   → revert commit trước
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "refactor", "test", "chore", "style", "perf", "revert"],
    ],

    // Type phải viết thường
    "type-case": [2, "always", "lower-case"],

    // Type không được để trống
    "type-empty": [2, "never"],

    // ── Subject (mô tả ngắn) ──────────────────────────────────────
    // Subject không được để trống
    "subject-empty": [2, "never"],

    // Subject không được có dấu chấm cuối
    "subject-full-stop": [2, "never", "."],

    // Không ép case subject (nhóm có thể viết tiếng Việt)
    "subject-case": [0],

    // ── Header (toàn bộ dòng đầu) ────────────────────────────────
    // Giới hạn 100 ký tự (72 là chuẩn cũ, 100 dễ đọc hơn trên GitHub)
    "header-max-length": [2, "always", 100],
  },
};
