"use client";
import { DashboardTitleBar } from "./components/dashboard-title-bar";
import { KpiGrid } from "./components/kpi-grid";
import { SystemWidgets } from "./components/system-widgets";
import { RevenueChart } from "./components/revenue-chart";
import { ConversionFunnel } from "./components/conversion-funnel";
import { OrdersTable } from "./components/orders-table";
import { kpiMetrics, funnelStages, hourlyData, recentOrders } from "./mock-data";

export function MerchantDashboard() {
  return (
    <div className="space-y-6">
      {/* Title Bar & Breadcrumb */}
      <DashboardTitleBar />

      {/* KPI Metric Cards (6 cards) */}
      <KpiGrid metrics={kpiMetrics} />

      {/* System Widgets: Gemini AI + Amazon SQS */}
      <SystemWidgets />

      {/* Analytics: Charts & Conversion Funnel */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <RevenueChart data={hourlyData} />
        <ConversionFunnel stages={funnelStages} />
      </section>

      {/* Data Table: Recent Livestream Orders */}
      <OrdersTable orders={recentOrders} />
    </div>
  );
}
