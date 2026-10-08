import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import {
    PostgresLivestreamRepository,
} from "../../../src/modules/livestream/repositories/livestream.repository.js";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("POST /api/livestreams - PostgreSQL Integration Tests", () => {
    const liveRepo = new PostgresLivestreamRepository();
    const liveApp = createApp(liveRepo);

    // =========================================================
    // AC10 - Dữ liệu được lưu bền vững trong PostgreSQL
    // =========================================================

    it("TC-CL-022 - Persist livestream into commerce_db", async () => {
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

    it("TC-CL-023 - Persist livestream with coverImageKey into commerce_db", async () => {
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
});