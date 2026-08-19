import { DB_NAME, DB_VERSION } from "./config";
import { applyMigrations } from "./migrations";

function ensureIndexedDb(): IDBFactory {
  if (!("indexedDB" in globalThis)) {
    throw new Error("IndexedDB não está disponível neste ambiente.");
  }

  return globalThis.indexedDB;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Falha ao executar operação no IndexedDB."));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Falha na transação do IndexedDB."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transação do IndexedDB cancelada."));
  });
}

export function openOrdemDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = ensureIndexedDb().open(DB_NAME, DB_VERSION);
    let upgradeFailure: Error | null = null;

    request.onupgradeneeded = (event) => {
      const transaction = request.transaction;
      if (!transaction) {
        upgradeFailure = new Error("A transação de atualização do banco não foi criada.");
        return;
      }

      try {
        applyMigrations(
          request.result,
          transaction,
          event.oldVersion,
          event.newVersion ?? DB_VERSION,
          (error) => {
            upgradeFailure = error;
          },
        );
      } catch (error) {
        upgradeFailure =
          error instanceof Error
            ? error
            : new Error("Falha desconhecida durante a migração do banco local.");
        transaction.abort();
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(upgradeFailure ?? request.error ?? new Error("Não foi possível abrir o banco local."));
    request.onblocked = () =>
      reject(new Error("A atualização do banco local foi bloqueada por outra aba."));
  });
}

export function deleteDemoDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = ensureIndexedDb().deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("Não foi possível remover o banco local."));
    request.onblocked = () =>
      reject(new Error("Feche outras abas antes de restaurar o banco demonstrativo."));
  });
}
