import { pool } from "../src/shared/database/database.js";

async function main(): Promise<void> {
  const commentId = process.argv[2]?.trim();
  if (!commentId || commentId.length > 100) {
    throw new Error("Usage: npm run confirm-link:by-comment -- <comment_id>");
  }

  const result = await pool.query<{
    orderCode: string;
    status: string;
    heldUntil: Date | null;
    confirmToken: string | null;
  }>(
    `SELECT o.order_code AS "orderCode", o.status, o.held_until AS "heldUntil",
            o.confirm_token AS "confirmToken"
       FROM purchase_requests pr
       JOIN orders o ON o.id = pr.order_id
      WHERE pr.comment_id = $1`,
    [commentId]
  );
  const order = result.rows[0];
  if (!order) {
    throw new Error("No order found for this comment. Check the AI result and purchase request status.");
  }
  if (!order.confirmToken) {
    throw new Error("The order has no confirmation token.");
  }

  const baseUrl = process.env.WEB_BASE_URL || "http://localhost:3000";
  const link = new URL(`/confirm/${encodeURIComponent(order.confirmToken)}`, baseUrl);
  console.log(`Order: ${order.orderCode}`);
  console.log(`Status: ${order.status}`);
  console.log(`Hold until: ${order.heldUntil?.toISOString() ?? "none"}`);
  console.log(`Customer confirmation link: ${link.href}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
