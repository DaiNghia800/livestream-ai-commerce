import type { Metadata } from "next";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/vietnamese-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/vietnamese-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/vietnamese-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Quản lý Sản phẩm - LiveOrder AI", template: "%s | LiveOrder AI" },
  description: "Cấu hình danh mục hàng hóa, phân bổ số lượng chốt trực tiếp và kiểm soát tồn kho trong buổi phát trực tiếp.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="h-full bg-surface">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full antialiased font-body-md text-body-md text-on-surface bg-surface flex overflow-hidden">
        <a className="skip-link" href="#main-content">
          Bỏ qua điều hướng
        </a>
        {children}
      </body>
    </html>
  );
}
