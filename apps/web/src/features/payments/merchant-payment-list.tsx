"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CircleDollarSign, CreditCard, Download, Eye, ListFilter, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { formatDateTime, formatMoney } from "@/lib/format";
import { downloadXlsx } from "@/lib/export-xlsx";
import { paymentsApi, type Payment } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import zebra from "@/styles/zebra-table.module.css";
import {
  CommerceListToolbar,
  CommercePager,
  defaultFilterRows,
  matchesFilters,
  type ListFilterField,
  type ListFilterRow,
  type MatchMode,
  type SortOption,
} from "@/features/shared/commerce-list-controls";
import {
  gatewayLabels,
  paymentMethods,
  paymentStatuses,
  reconcileLabels,
} from "@/features/orders/labels";

const SORT_OPTIONS = [
  { key: "newest", label: "Mới nhất trước" },
  { key: "oldest", label: "Cũ nhất trước" },
  { key: "amountDesc", label: "Phải thu cao → thấp" },
  { key: "amountAsc", label: "Phải thu thấp → cao" },
  { key: "paidDesc", label: "Đã nhận cao → thấp" },
] as const satisfies SortOption<string>[];

type SortKey = (typeof SORT_OPTIONS)[number]["key"];

const PAYMENT_FIELDS: ListFilterField<Payment>[] = [
  {
    key: "status",
    label: "Trạng thái",
    icon: ListFilter,
    kind: "multi",
    options: Object.entries(paymentStatuses).map(([value, meta]) => ({ value, label: meta.label })),
    pick: (payment) => payment.status,
  },
  {
    key: "method",
    label: "Hình thức",
    icon: CreditCard,
    kind: "multi",
    options: Object.entries(paymentMethods).map(([value, label]) => ({ value, label })),
    pick: (payment) => payment.method,
  },
  {
    key: "reconcile",
    label: "Đối chiếu",
    icon: Wallet,
    kind: "multi",
    options: Object.entries(reconcileLabels).map(([value, meta]) => ({ value, label: meta.label })),
    pick: (payment) => payment.reconcile,
  },
  {
    key: "provider",
    label: "Cổng thanh toán",
    icon: Building2,
    kind: "multi",
    options: [
      { value: "NONE", label: "Chưa chọn cổng" },
      ...Object.entries(gatewayLabels).map(([value, label]) => ({ value, label })),
    ],
    pick: (payment) => payment.provider ?? "NONE",
  },
  {
    key: "amount",
    label: "Phải thu",
    icon: CircleDollarSign,
    kind: "range",
    pick: (payment) => Number(payment.amount),
  },
  {
    key: "paidAmount",
    label: "Đã nhận",
    icon: CircleDollarSign,
    kind: "range",
    pick: (payment) => Number(payment.paidAmount),
  },
];

export function MerchantPaymentList() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [rows, setRows] = useState<ListFilterRow[]>(() => defaultFilterRows(["status", "method"]));
  const [mode, setMode] = useState<MatchMode>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi(
    () => paymentsApi.list({ limit: 200 }),
    [],
  );
  const payments = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const key = query.toLocaleLowerCase("vi").trim();
    const result = payments.filter((payment) => {
      const text = `${payment.txnRef ?? ""} ${payment.orderCode ?? ""}`;
      return (!key || text.toLocaleLowerCase("vi").includes(key))
        && matchesFilters(payment, rows, mode, PAYMENT_FIELDS);
    });
    return [...result].sort((a, b) => {
      switch (sort) {
        case "oldest": return a.createdAt.localeCompare(b.createdAt);
        case "amountDesc": return Number(b.amount) - Number(a.amount);
        case "amountAsc": return Number(a.amount) - Number(b.amount);
        case "paidDesc": return Number(b.paidAmount) - Number(a.paidAmount);
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [payments, query, rows, mode, sort]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Hai con số shop thật sự cần nhìn mỗi sáng: tiền đã về, và những
  // khoản đang lệch cần người xử lý.
  //
  // Cộng TẤT CẢ tiền thực nhận, không chỉ các khoản đã đủ. Lọc theo
  // status === "PAID" sẽ bỏ sót khoản khách mới chuyển một nửa — tiền
  // đó đã nằm trong tài khoản shop rồi.
  //
  // Trừ khoản đã hoàn: tiền vào rồi ra, không còn trong két.
  const daThu = payments
    .filter((p) => p.status !== "REFUNDED")
    .reduce((sum, p) => sum + Number(p.paidAmount), 0);
  const canXuLy = payments.filter(
    (p) => p.reconcile === "UNDERPAID" || p.reconcile === "OVERPAID",
  );
  const choThu = payments.filter((p) => p.status === "PENDING");

  async function xuatExcel() {
    setExportError(null);
    try {
      await downloadXlsx("thanh-toan", "Thanh toán", filtered, [
        { header: "Nội dung chuyển khoản", value: (p) => p.txnRef ?? "", minWidth: 24 },
        { header: "Mã đơn", value: (p) => p.orderCode ?? "" },
        { header: "Hình thức", value: (p) => paymentMethods[p.method] ?? p.method },
        { header: "Cổng thanh toán", value: (p) => p.provider ? gatewayLabels[p.provider] ?? p.provider : "" },
        { header: "Trạng thái", value: (p) => paymentStatuses[p.status]?.label ?? p.status },
        { header: "Đối chiếu", value: (p) => reconcileLabels[p.reconcile]?.label ?? p.reconcile },
        { header: "Phải thu (₫)", value: (p) => p.amount, kind: "money" },
        { header: "Đã nhận (₫)", value: (p) => p.paidAmount, kind: "money" },
        { header: "Đã hoàn (₫)", value: (p) => p.refundAmount, kind: "money" },
        { header: "Tạo lúc", value: (p) => formatDateTime(p.createdAt), minWidth: 20 },
        { header: "Thu đủ lúc", value: (p) => p.paidAt ? formatDateTime(p.paidAt) : "", minWidth: 20 },
        { header: "Hoàn lúc", value: (p) => p.refundedAt ? formatDateTime(p.refundedAt) : "", minWidth: 20 },
        { header: "Lý do thất bại", value: (p) => p.failureReason ?? "" },
      ]);
    } catch {
      setExportError("Không tạo được tệp Excel. Vui lòng thử lại.");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">THANH TOÁN</p>
          <h1>Đối soát thu tiền</h1>
          <p className="muted">
            Khoản thu của từng đơn, kèm số tiền thực nhận từ ngân hàng và ví
            điện tử.
          </p>
        </div>
        <div className="head-actions">
          <Button variant="secondary" onClick={xuatExcel} disabled={!filtered.length}>
            <Download size={17} aria-hidden="true" /> Xuất Excel ({filtered.length})
          </Button>
          <Button variant="secondary" onClick={reload}>
            Làm mới
          </Button>
        </div>
      </div>
      {exportError && <p role="alert">{exportError}</p>}

      <div className="metric-grid">
        <Card>
          <h2 className="muted">Đã thu</h2>
          <strong className="metric-value">{formatMoney(daThu)}</strong>
          <p className="metric-note">Tổng tiền thực nhận, trừ khoản đã hoàn</p>
        </Card>
        <Card>
          <h2 className="muted">Chờ thu</h2>
          <strong className="metric-value">{choThu.length}</strong>
          <p className="metric-note">Khoản chưa nhận đủ tiền</p>
        </Card>
        <Card>
          <h2 className="muted">Lệch cần xử lý</h2>
          <strong className="metric-value">{canXuLy.length}</strong>
          <p className="metric-note">Khách chuyển thiếu hoặc thừa</p>
        </Card>
        <Card>
          <h2 className="muted">Tổng khoản thu</h2>
          <strong className="metric-value">{payments.length}</strong>
          <p className="metric-note">Trong tối đa 200 khoản thu đã tải</p>
        </Card>
      </div>

      {canXuLy.length > 0 && (
        <div className="notice notice-warning">
          <h3>{canXuLy.length} khoản thu đang lệch số tiền</h3>
          <p>
            Khách chuyển thiếu thì cần gọi nhắc trước khi giao; chuyển thừa thì
            phải hoàn lại phần dư.
          </p>
        </div>
      )}

      <Card>
        <div className="section-heading">
          <div>
            <h2>Danh sách khoản thu</h2>
            <p className="muted">Tìm và lọc trong tối đa 200 khoản thu gần nhất đã tải.</p>
          </div>
        </div>

        <CommerceListToolbar
          query={query}
          onQueryChange={(value) => { setQuery(value); setPage(1); }}
          searchLabel="Tìm giao dịch"
          placeholder="Tìm theo nội dung chuyển khoản hoặc mã đơn…"
          sort={sort}
          sortOptions={SORT_OPTIONS}
          onSortChange={(value) => { setSort(value); setPage(1); }}
          fields={PAYMENT_FIELDS}
          rows={rows}
          mode={mode}
          onRowsChange={(value) => { setRows(value); setPage(1); }}
          onModeChange={(value) => { setMode(value); setPage(1); }}
          resultCount={filtered.length}
          itemLabel="khoản thu"
        />

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState
            action={
              <Button variant="secondary" onClick={reload}>
                Thử lại
              </Button>
            }
          />
        ) : filtered.length ? (
          <div className="table-wrap">
            <table className={`data-table ${zebra.zebra}`}>
              <caption className="sr-only">Khoản thu của các đơn hàng</caption>
              <thead>
                <tr>
                  <th scope="col">Nội dung chuyển khoản</th>
                  <th scope="col">Đơn hàng</th>
                  <th scope="col">Hình thức</th>
                  <th scope="col" className="num">Phải thu</th>
                  <th scope="col" className="num">Đã nhận</th>
                  <th scope="col">Đối chiếu</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" className="num">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={payments.length ? "Không có khoản thu khớp" : "Chưa có khoản thu nào"}
            description={payments.length ? "Thử đổi từ khóa hoặc đặt lại bộ lọc." : "Khoản thu được tạo sau khi khách xác nhận đơn."}
          />
        )}
        {!loading && !error && filtered.length > 0 && (
          <CommercePager
            page={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            itemLabel="khoản thu"
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        )}
      </Card>
    </>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  const status = paymentStatuses[payment.status] ?? {
    label: payment.status,
    tone: "neutral",
  };
  const reconcile = reconcileLabels[payment.reconcile] ?? {
    label: payment.reconcile,
    tone: "neutral",
  };

  return (
    <tr>
      <td>
        <strong>{payment.txnRef ?? "—"}</strong>
        <p className="muted">
          {payment.provider
            ? (gatewayLabels[payment.provider] ?? payment.provider)
            : "Chưa chọn cổng"}
        </p>
      </td>
      <td>
        {payment.orderCode ? (
          <Link className="link-inline" href={`/shop/orders/${payment.orderCode}`}>
            {payment.orderCode}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td>{paymentMethods[payment.method] ?? payment.method}</td>
      <td className="num">{formatMoney(Number(payment.amount))}</td>
      <td className="num">
        <strong>{formatMoney(Number(payment.paidAmount))}</strong>
      </td>
      <td>
        <Badge tone={reconcile.tone}>{reconcile.label}</Badge>
      </td>
      <td>
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="num">
        <div className="row-actions">
          <Link
            className="row-action"
            href={`/shop/payments/${payment.txnRef ?? payment.id}`}
            title={`Xem chi tiết giao dịch ${payment.txnRef ?? ""}`}
          >
            <Eye size={16} aria-hidden="true" />
            {/* Kèm mã giao dịch vào tên khả truy cập: mọi dòng cùng
                đọc là "Xem chi tiết" thì người dùng trình đọc màn
                hình không biết mình đang ở dòng nào. */}
            <span className="sr-only">
              Xem chi tiết giao dịch {payment.txnRef ?? payment.id}
            </span>
          </Link>
        </div>
      </td>
    </tr>
  );
}
