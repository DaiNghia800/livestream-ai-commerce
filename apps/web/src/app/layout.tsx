import type { Metadata } from "next";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/vietnamese-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/vietnamese-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/vietnamese-700.css";
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
