import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "LiveOrder AI", template: "%s | LiveOrder AI" },
  description: "Nền tảng livestream thương mại — bản mẫu frontend",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <a className="skip-link" href="#main-content">
          Bỏ qua điều hướng
        </a>
        {children}
      </body>
    </html>
  );
}
