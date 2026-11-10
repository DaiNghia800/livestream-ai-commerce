"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, LogOut, MapPin, ReceiptText, UserRound } from "lucide-react";
import { AddressBookDialog } from "@/features/orders/address-book-dialog";
import { ProfileDialog } from "@/features/orders/profile-dialog";
import styles from "./customer-shell.module.css";

type HopThoai = "hoSo" | "diaChi" | null;

interface CustomerAccountMenuProps {
  /** Nội dung của nút mở menu: avatar + tên, mỗi header vẽ theo kiểu riêng. */
  children: ReactNode;
  /** Không truyền thì menu không có mục Đăng xuất. */
  onSignOut?: () => void;
  /** Lớp CSS thêm cho khối bọc và cho nút, để header nào giữ bố cục của header đó. */
  khoiClassName?: string;
  nutClassName?: string;
}

/**
 * Menu tài khoản của khách, dùng chung cho header thường (CustomerShell)
 * và header trang live. Gom một chỗ để hai header không lệch nhau về
 * mục, nhãn và cách đóng mở (bấm ra ngoài, Esc), như menu tài khoản
 * của Shopee/TikTok ở mọi trang.
 */
export function CustomerAccountMenu({
  children,
  onSignOut,
  khoiClassName = "",
  nutClassName = "",
}: CustomerAccountMenuProps) {
  const router = useRouter();
  const [moMenu, setMoMenu] = useState(false);
  const [hopThoai, setHopThoai] = useState<HopThoai>(null);
  const khoiRef = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc Esc thì đóng menu — như mọi menu tài khoản.
  useEffect(() => {
    if (!moMenu) return;
    const ngoai = (e: MouseEvent) => {
      if (!khoiRef.current?.contains(e.target as Node)) setMoMenu(false);
    };
    const phim = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoMenu(false);
    };
    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", phim);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", phim);
    };
  }, [moMenu]);

  function chon(muc: HopThoai) {
    setMoMenu(false);
    setHopThoai(muc);
  }

  return (
    <>
      {hopThoai === "hoSo" && <ProfileDialog onClose={() => setHopThoai(null)} />}
      {hopThoai === "diaChi" && <AddressBookDialog onClose={() => setHopThoai(null)} />}
      <div className={`${styles.khoiTaiKhoan} ${khoiClassName}`} ref={khoiRef}>
        {/* Là <button> chứ không phải <div onClick>: bàn phím và trình đọc
            màn hình mới tới được, và không phải tự gắn role/tabIndex. */}
        <button
          type="button"
          className={`${styles.nutTaiKhoan} ${nutClassName}`}
          aria-label="Tài khoản của tôi"
          aria-haspopup="menu"
          aria-expanded={moMenu}
          onClick={() => setMoMenu((v) => !v)}
        >
          {children}
          <ChevronDown size={16} className={styles.muiTen} aria-hidden="true" />
        </button>
        {moMenu && (
          <ul className={styles.menu} role="menu" aria-label="Tài khoản của tôi">
            <li role="none">
              <button type="button" role="menuitem" className={styles.menuMuc} onClick={() => chon("hoSo")}>
                <UserRound size={16} aria-hidden="true" /> Thông tin cá nhân
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={styles.menuMuc}
                onClick={() => {
                  setMoMenu(false);
                  router.push("/orders");
                }}
              >
                <ReceiptText size={16} aria-hidden="true" /> Đơn mua
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className={styles.menuMuc} onClick={() => chon("diaChi")}>
                <MapPin size={16} aria-hidden="true" /> Địa chỉ nhận hàng
              </button>
            </li>
            {onSignOut && (
              <>
                <li role="separator" className={styles.menuChia} />
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`${styles.menuMuc} ${styles.menuDangXuat}`}
                    onClick={() => {
                      setMoMenu(false);
                      onSignOut();
                    }}
                  >
                    <LogOut size={16} aria-hidden="true" /> Đăng xuất
                  </button>
                </li>
              </>
            )}
          </ul>
        )}
      </div>
    </>
  );
}
