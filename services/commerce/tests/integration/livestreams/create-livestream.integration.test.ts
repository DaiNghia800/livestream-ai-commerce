import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { pool } from "../../../src/shared/database/database.js";
import {
    PostgresLivestreamRepository,
} from "../../../src/modules/livestream/repositories/livestream.repository.js";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("POST /api/livestreams - PostgreSQL Integration Tests", () => {
    const liveRepo = new PostgresLivestreamRepository();
    const liveApp = createApp(liveRepo);
    let dbConnected = false;

    beforeAll(async () => {
        try {
            const client = await pool.connect();
            client.release();
            dbConnected = true;
        } catch {
            dbConnected = false;
        }
    });

    // =========================================================
    // AC10 - Dữ liệu được lưu bền vững trong PostgreSQL
    // =========================================================

    it("TC-CL-022 - Persist livestream into commerce_db", async (ctx) => {
        if (!dbConnected) {
            ctx.skip();
            return;
        }
        const merchantId =
            "99999999-9999-4999-8999-999999999999";

        const res = await request(liveApp)
            .post("/api/livestreams")
            .set("X-Merchant-Id", merchantId)
            .send({
                title: "Node.js Live Integration Session",
                description:
                    "Testing raw SQL persistence with pg driver",
            });

        expect(res.status).toBe(201);
        expect(UUID_REGEX.test(res.body.id)).toBe(true);

        const stored = await liveRepo.findById(res.body.id);

        expect(stored).not.toBeNull();

        expect(stored?.id).toBe(res.body.id);
        expect(stored?.title).toBe(
            "Node.js Live Integration Session",
        );
        expect(stored?.merchantId).toBe(merchantId);
        expect(stored?.status).toBe("draft");

        expect(stored?.createdAt).toBeDefined();
        expect(stored?.updatedAt).toBeDefined();
        expect(stored?.coverImageKey).toBeNull();
    });

    it("TC-CL-023 - Persist livestream with coverImageKey into commerce_db", async (ctx) => {
        if (!dbConnected) {
            ctx.skip();
            return;
        }
        const merchantId = "99999999-9999-4999-8999-999999999999";
        const coverKey = "livestreams/covers/integ-test-key.webp";

        const res = await request(liveApp)
            .post("/api/livestreams")
            .set("X-Merchant-Id", merchantId)
            .send({
                title: "Live With S3 Cover Key Integration",
                description: "Testing raw SQL persistence of cover_image_key",
                coverImageKey: coverKey,
            });

        expect(res.status).toBe(201);
        expect(res.body.coverImageKey).toBe(coverKey);

        const stored = await liveRepo.findById(res.body.id);
        expect(stored).not.toBeNull();
        expect(stored?.coverImageKey).toBe(coverKey);
    });

    it("TC-CL-024 - Return 409 Conflict when scheduledAt conflicts with an existing schedule within 30 minutes", async (ctx) => {
        if (!dbConnected) {
            ctx.skip();
            return;
        }
        const merchantId = "99999999-9999-4999-8999-999999999999";
        const baseTime = "2026-11-20T19:30:00.000Z";

        // Create first scheduled session
        const first = await request(liveApp)
            .post("/api/livestreams")
            .set("X-Merchant-Id", merchantId)
            .send({
                title: "Phiên Live Đầu Tiên",
                scheduledAt: baseTime,
                status: "scheduled",
            });
        expect(first.status).toBe(201);

        // Attempt to create second session at 19:40 (10 minutes later -> conflict)
        const conflictRes = await request(liveApp)
            .post("/api/livestreams")
            .set("X-Merchant-Id", merchantId)
            .send({
                title: "Phiên Live Bị Trùng",
                scheduledAt: "2026-11-20T19:40:00.000Z",
                status: "scheduled",
            });

        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body.error).toBe("ScheduleConflictError");
        expect(conflictRes.body.message).toContain("Phiên Live Đầu Tiên");
        expect(conflictRes.body.message).toContain("tối thiểu 30 phút");
    });
});