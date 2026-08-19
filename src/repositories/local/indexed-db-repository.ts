import { openOrdemDatabase, requestToPromise, transactionDone } from "@/src/database/indexed-db/client";
import type { StoreName } from "@/src/database/indexed-db/config";
import type { Repository } from "@/src/repositories/contracts";
import type { BaseEntity } from "@/src/types/academic";

export class IndexedDbRepository<T extends BaseEntity> implements Repository<T> {
  constructor(protected readonly storeName: StoreName) {}

  async getAll(): Promise<T[]> {
    const database = await openOrdemDatabase();
    try {
      const transaction = database.transaction(this.storeName, "readonly");
      return await requestToPromise(
        transaction.objectStore(this.storeName).getAll() as IDBRequest<T[]>,
      );
    } finally {
      database.close();
    }
  }

  async getById(id: string): Promise<T | null> {
    const database = await openOrdemDatabase();
    try {
      const transaction = database.transaction(this.storeName, "readonly");
      const result = await requestToPromise(
        transaction.objectStore(this.storeName).get(id) as IDBRequest<T | undefined>,
      );
      return result ?? null;
    } finally {
      database.close();
    }
  }

  async save(entity: T): Promise<void> {
    const database = await openOrdemDatabase();
    const transaction = database.transaction(this.storeName, "readwrite");
    try {
      transaction.objectStore(this.storeName).put(entity);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }
}

