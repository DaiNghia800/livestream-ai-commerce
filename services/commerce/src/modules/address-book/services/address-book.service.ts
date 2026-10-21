/**
 * Nghiệp vụ sổ địa chỉ.
 *
 * Ba quy tắc, đều nhỏ nhưng đều đã có lý do:
 *
 *   - Địa chỉ ĐẦU TIÊN tự thành mặc định. Khách lưu một cái rồi vào
 *     màn xác nhận thấy ô trống là họ tưởng chưa lưu.
 *   - Xoá cái mặc định thì đôn cái mới nhất lên. Sổ còn địa chỉ mà
 *     không cái nào mặc định là trạng thái không ai muốn.
 *   - Trần 20 địa chỉ một tài khoản. Không ai cần hơn, còn bot thì
 *     cần vô hạn.
 */

import type { Pool } from "pg";
import { findCurrentWard } from "../../shipping/address/current-wards.js";
import {
  countAddresses,
  deleteAddress,
  insertAddress,
  listAddresses,
  promoteLatestToDefault,
  setDefaultAddress,
  updateAddress,
  type DiaChiDaLuu,
} from "../repositories/address-book.repository.js";
import type { AddressInput } from "../schemas/address-book.schema.js";

export const TRAN_DIA_CHI = 20;

export class AddressNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy địa chỉ.");
    this.name = "AddressNotFoundError";
  }
}

export class AddressLimitError extends Error {
  constructor() {
    super(`Mỗi tài khoản lưu tối đa ${TRAN_DIA_CHI} địa chỉ.`);
    this.name = "AddressLimitError";
  }
}

export class AddressBookService {
  constructor(private readonly pool: Pool) {}

  async list(userId: number): Promise<DiaChiDaLuu[]> {
    const client = await this.pool.connect();
    try {
      return await listAddresses(client, userId);
    } finally {
      client.release();
    }
  }

  async create(userId: number, input: AddressInput): Promise<DiaChiDaLuu> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const soHienCo = await countAddresses(client, userId);
      if (soHienCo >= TRAN_DIA_CHI) {
        throw new AddressLimitError();
      }

      // Schema đã kiểm phường thuộc tỉnh, nên tới đây chắc chắn có.
      const phuong = findCurrentWard(input.provinceName, input.wardCode)!;
      const macDinh = soHienCo === 0 || input.isDefault === true;

      if (macDinh && soHienCo > 0) {
        // Bỏ cờ cũ trước, nếu không index duy nhất từ chối dòng mới.
        await client.query(
          `UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1 AND is_default`,
          [userId]
        );
      }

      const kq = await insertAddress(
        client,
        userId,
        {
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          provinceName: input.provinceName,
          wardCode: input.wardCode,
          wardName: phuong.name,
          streetLine: input.streetLine,
          label: input.label ?? null,
        },
        macDinh
      );

      await client.query("COMMIT");
      return kq;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async update(
    userId: number,
    id: string,
    input: AddressInput
  ): Promise<DiaChiDaLuu> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const phuong = findCurrentWard(input.provinceName, input.wardCode)!;
      const kq = await updateAddress(client, userId, id, {
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        provinceName: input.provinceName,
        wardCode: input.wardCode,
        wardName: phuong.name,
        streetLine: input.streetLine,
        label: input.label ?? null,
      });
      if (!kq) {
        throw new AddressNotFoundError();
      }

      if (input.isDefault === true && !kq.isDefault) {
        await setDefaultAddress(client, userId, id);
        kq.isDefault = true;
      }

      await client.query("COMMIT");
      return kq;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async remove(userId: number, id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const daXoa = await deleteAddress(client, userId, id);
      if (!daXoa) {
        throw new AddressNotFoundError();
      }
      if (daXoa.isDefault) {
        await promoteLatestToDefault(client, userId);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async setDefault(userId: number, id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const duoc = await setDefaultAddress(client, userId, id);
      if (!duoc) {
        throw new AddressNotFoundError();
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
