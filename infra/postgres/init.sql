-- =============================================================
-- infra/postgres/init.sql
-- PostgreSQL Initialization Script for Livestream AI Commerce
-- =============================================================
-- Script này tự động chạy KHI VÀ CHỈ KHI PostgreSQL container
-- khởi động LẦN ĐẦU TIÊN (volume trống).
--
-- Kiến trúc database:
--   ┌─────────────────────────────────────────┐
--   │         PostgreSQL Server (1 máy)       │
--   │  ┌─────────────┐  ┌──────────────────┐  │
--   │  │ commerce_db │  │  realtime_db     │  │
--   │  │  (tables)   │  │   (tables)       │  │
--   │  └─────────────┘  └──────────────────┘  │
--   └─────────────────────────────────────────┘
--
-- Mỗi service connect vào database riêng:
--   - Commerce Service  → commerce_db
--   - Realtime Service  → realtime_db
--   - AI Worker         → không có DB riêng
-- =============================================================


-- ── BƯỚC 1: Tạo 2 database ────────────────────────────────────
-- Script này chạy trong context của default database (POSTGRES_DB).
-- Ta tạo 2 database mới từ đây.
-- =============================================================

CREATE DATABASE commerce_db;
CREATE DATABASE realtime_db;
