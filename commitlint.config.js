// commitlint.config.js — Cấu hình kiểm tra commit message
// Đặt tại gốc project (cùng cấp với apps/, services/)
// Tài liệu: https://commitlint.js.org

// Extends từ bộ quy tắc Conventional Commits chuẩn của cộng đồng
export default {
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
    //   ci       → thay đổi cấu hình/quy trình CI
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "refactor", "test", "chore", "style", "perf", "revert", "ci"],
    ],

    // Type phải viết thường
    "type-case": [2, "always", "lower-case"],

    // Type không được để trống
    "type-empty": [2, "never"],

    // ── Subject (mô tả ngắn) ──────────────────────────────────────
    // Subject không được để trống
    "subject-empty": [2, "never"],

    // Không giới hạn dấu câu cuối subject
    "subject-full-stop": [0],

    // Không ép case subject (nhóm có thể viết tiếng Việt)
    "subject-case": [0],

    // ── Header (toàn bộ dòng đầu) ────────────────────────────────
    // Giới hạn 120 ký tự để header vẫn dễ đọc trên GitHub
    "header-max-length": [2, "always", 120],
  },
};
