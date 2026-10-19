import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./brand";

export function CustomerShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="customer-header">
        <Link href="/" aria-label="LiveOrder AI — Trang khách hàng">
          <Brand />
        </Link>
        <nav aria-label="Điều hướng khách hàng">
          <Link href="/">
            Xem livestream
          </Link>
          <Link href="/shop">Kênh chủ shop</Link>
        </nav>
      </header>
      <main id="main-content" className="customer-main">
        {children}
      </main>
      <footer>
        LiveOrder AI · Môi trường thử nghiệm
      </footer>
    </>
  );
}
