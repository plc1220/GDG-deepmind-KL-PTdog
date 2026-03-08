import {Storage} from '@google-cloud/storage';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {LedgerReport} from '../shared/ledger';

type PersistedLedger = {
  reports: LedgerReport[];
};

const EMPTY_STATE: PersistedLedger = {
  reports: [],
};

function normalizePersistedLedger(value: unknown): PersistedLedger {
  if (!value || typeof value !== 'object' || !Array.isArray((value as PersistedLedger).reports)) {
    return EMPTY_STATE;
  }

  return {
    reports: (value as PersistedLedger).reports,
  };
}

export interface LedgerStore {
  read(): Promise<PersistedLedger>;
  write(value: PersistedLedger): Promise<void>;
}

class LocalFileLedgerStore implements LedgerStore {
  constructor(private readonly filePath: string) {}

  async read() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return normalizePersistedLedger(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return EMPTY_STATE;
      }
      throw error;
    }
  }

  async write(value: PersistedLedger) {
    await fs.mkdir(path.dirname(this.filePath), {recursive: true});
    await fs.writeFile(this.filePath, JSON.stringify(value, null, 2), 'utf8');
  }
}

class GcsLedgerStore implements LedgerStore {
  private readonly storage = new Storage();

  constructor(
    private readonly bucketName: string,
    private readonly objectName: string,
  ) {}

  async read() {
    const file = this.storage.bucket(this.bucketName).file(this.objectName);

    try {
      const [buffer] = await file.download();
      return normalizePersistedLedger(JSON.parse(buffer.toString('utf8')));
    } catch (error) {
      const code = (error as {code?: number | string}).code;
      if (code === 404) {
        return EMPTY_STATE;
      }
      throw error;
    }
  }

  async write(value: PersistedLedger) {
    const file = this.storage.bucket(this.bucketName).file(this.objectName);
    await file.save(JSON.stringify(value, null, 2), {
      contentType: 'application/json',
      resumable: false,
    });
  }
}

class FallbackLedgerStore implements LedgerStore {
  constructor(
    private readonly primary: LedgerStore,
    private readonly fallback: LedgerStore,
  ) {}

  async read() {
    try {
      return await this.primary.read();
    } catch (error) {
      console.warn('Falling back to local ledger store for reads:', error);
      return this.fallback.read();
    }
  }

  async write(value: PersistedLedger) {
    try {
      await this.primary.write(value);
      await this.fallback.write(value);
    } catch (error) {
      console.warn('Falling back to local ledger store for writes:', error);
      await this.fallback.write(value);
    }
  }
}

let memoizedStore: LedgerStore | null = null;

export function getLedgerStore() {
  if (memoizedStore) {
    return memoizedStore;
  }

  const localPath = process.env.PTDOG_LEDGER_FILE
    ? path.resolve(process.cwd(), process.env.PTDOG_LEDGER_FILE)
    : path.resolve(process.cwd(), 'data/ledger-store.json');
  const localStore = new LocalFileLedgerStore(localPath);
  const bucketName = process.env.PTDOG_GCS_BUCKET?.trim();
  const objectName = process.env.PTDOG_GCS_OBJECT?.trim() || 'ptdog/ledger-store.json';

  memoizedStore = bucketName
    ? new FallbackLedgerStore(new GcsLedgerStore(bucketName, objectName), localStore)
    : localStore;

  return memoizedStore;
}
