import fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool, runMigrations } from "../../../src/shared/database/database.js";

describe("runMigrations - Unit Tests", () => {
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient as any);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DB-UT-001 - migrations directory does not exist -> returns early and releases client", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE IF NOT EXISTS

    await runMigrations();

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_migrations")
    );
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("DB-UT-002 - migration already tracked in schema_migrations is skipped", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      "001_create_livestreams.sql",
    ] as any);
    const readFileSyncSpy = vi.spyOn(fs, "readFileSync");

    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT version FROM schema_migrations")) {
        return { rows: [{ version: "001_create_livestreams.sql" }] };
      }
      if (sql.includes("SELECT EXISTS")) {
        return { rows: [{ exists: true }] };
      }
      return { rows: [] };
    });

    await runMigrations();

    expect(readFileSyncSpy).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalledWith("BEGIN;");
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO schema_migrations")
    );
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("DB-UT-003 - 001_create_livestreams.sql not in schema_migrations but livestreams table exists -> marks as applied without re-running SQL", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      "001_create_livestreams.sql",
    ] as any);
    const readFileSyncSpy = vi.spyOn(fs, "readFileSync");

    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT version FROM schema_migrations")) {
        return { rows: [] }; // Not yet in schema_migrations
      }
      if (sql.includes("SELECT EXISTS")) {
        return { rows: [{ exists: true }] }; // livestreams table exists
      }
      if (sql.includes("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING;")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await runMigrations();

    expect(mockClient.query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING;",
      ["001_create_livestreams.sql"]
    );
    expect(readFileSyncSpy).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalledWith("BEGIN;");
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("DB-UT-004 - new migration runs inside transaction successfully -> BEGIN, execute SQL, INSERT, COMMIT", async () => {
    const migrationSql = "CREATE TABLE products (id UUID PRIMARY KEY);";

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      "002_create_products.sql",
    ] as any);
    vi.spyOn(fs, "readFileSync").mockReturnValue(migrationSql);

    const executedQueries: string[] = [];
    mockClient.query.mockImplementation(async (sql: string, params?: any[]) => {
      executedQueries.push(sql.trim());
      if (sql.includes("SELECT version FROM schema_migrations")) {
        return { rows: [{ version: "001_create_livestreams.sql" }] };
      }
      if (sql.includes("SELECT EXISTS")) {
        return { rows: [{ exists: true }] };
      }
      return { rows: [] };
    });

    await runMigrations();

    expect(executedQueries).toContain("BEGIN;");
    expect(executedQueries).toContain(migrationSql);
    expect(mockClient.query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations (version) VALUES ($1);",
      ["002_create_products.sql"]
    );
    expect(executedQueries).toContain("COMMIT;");
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("DB-UT-005 - migration SQL execution fails -> executes ROLLBACK and rethrows error", async () => {
    const migrationSql = "INVALID SQL STATEMENT;";
    const sqlError = new Error("syntax error at or near 'INVALID'");

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      "003_failing_migration.sql",
    ] as any);
    vi.spyOn(fs, "readFileSync").mockReturnValue(migrationSql);

    const executedQueries: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      executedQueries.push(sql.trim());
      if (sql.includes("SELECT version FROM schema_migrations")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT EXISTS")) {
        return { rows: [{ exists: false }] };
      }
      if (sql === migrationSql) {
        throw sqlError;
      }
      return { rows: [] };
    });

    await expect(runMigrations()).rejects.toThrow(sqlError);

    expect(executedQueries).toContain("BEGIN;");
    expect(executedQueries).toContain("ROLLBACK;");
    expect(executedQueries).not.toContain("COMMIT;");
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("DB-UT-006 - client.release() is always called even when initial query fails", async () => {
    const initError = new Error("DB table init failed");
    mockClient.query.mockRejectedValueOnce(initError);

    await expect(runMigrations()).rejects.toThrow(initError);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
