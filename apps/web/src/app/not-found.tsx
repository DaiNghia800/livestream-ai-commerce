import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="state">
      <h1>Không tìm thấy trang</h1>
      <Link href="/">Về trang khách hàng</Link>
    </main>
  );
}
