import { ChequeRecord } from '../types/cheque';
import { TelegramNotifyResponse } from './telegramClient';

export interface ServerHealthResponse {
  ok: boolean;
  telegramConfigured: boolean;
  googleSheetWebhookConfigured: boolean;
}

export type StorageMode = 'google_sheet_webhook' | 'local_server';

const LOCAL_CACHE_KEY = 'service_cheque_records_v1';

async function safeParseApiJson<T>(res: Response, fallbackError: string): Promise<T> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    throw new Error(`${fallbackError} (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(`${fallbackError} (เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON: HTTP ${res.status})`);
  }
}

export function readCachedLocalRecords(): ChequeRecord[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChequeRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeCachedLocalRecords(records: ChequeRecord[]): void {
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota/access errors
  }
}

export async function fetchServerHealth(): Promise<ServerHealthResponse> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      return {
        ok: false,
        telegramConfigured: false,
        googleSheetWebhookConfigured: false,
      };
    }
    return await safeParseApiJson<ServerHealthResponse>(res, 'ตรวจสอบสถานะเซิร์ฟเวอร์ไม่สำเร็จ');
  } catch {
    return {
      ok: false,
      telegramConfigured: false,
      googleSheetWebhookConfigured: false,
    };
  }
}

export async function fetchCheques(): Promise<{
  mode: StorageMode;
  records: ChequeRecord[];
}> {
  const res = await fetch('/api/cheques');
  const data = await safeParseApiJson<{
    ok: boolean;
    mode?: StorageMode;
    records?: ChequeRecord[];
    message?: string;
  }>(res, 'ไม่สามารถโหลดรายการเช็คได้');

  if (!res.ok || !data.ok) {
    throw new Error(data.message || 'ไม่สามารถโหลดรายการเช็คได้');
  }

  const mode = data.mode ?? 'local_server';
  const serverRecords = data.records ?? [];

  if (mode === 'google_sheet_webhook') {
    return { mode, records: serverRecords };
  }

  // Merge server records with local browser cache in case serverless cold-started
  const cached = readCachedLocalRecords();
  if (serverRecords.length === 0 && cached.length > 0) {
    return { mode, records: cached };
  }

  if (serverRecords.length > 0) {
    writeCachedLocalRecords(serverRecords);
  }
  return { mode, records: serverRecords };
}

export async function createCheque(
  payload: Omit<ChequeRecord, 'id' | 'rowNumber' | 'syncedToSheet'>
): Promise<{
  record: ChequeRecord;
  telegram: TelegramNotifyResponse;
}> {
  const res = await fetch('/api/cheques', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await safeParseApiJson<{
    ok: boolean;
    record?: ChequeRecord;
    telegram?: TelegramNotifyResponse;
    message?: string;
  }>(res, 'ไม่สามารถบันทึกรายการได้');

  if (!res.ok || !data.ok || !data.record) {
    throw new Error(data.message || 'ไม่สามารถบันทึกรายการได้');
  }
  return {
    record: data.record,
    telegram: data.telegram ?? { ok: false, configured: false, message: '' },
  };
}

export async function patchCheque(
  original: ChequeRecord,
  updated: ChequeRecord
): Promise<{
  record: ChequeRecord;
  telegram: TelegramNotifyResponse;
}> {
  const res = await fetch('/api/cheques', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: original.id,
      rowNumber: original.rowNumber,
      previousStatus: original.status,
      date: updated.date,
      invoice: updated.invoice,
      customerName: updated.customerName,
      sCode: updated.sCode,
      amount: updated.amount,
      status: updated.status,
      zoneOwner: updated.zoneOwner,
      technician: updated.technician,
      remark: updated.remark,
    }),
  });
  const data = await safeParseApiJson<{
    ok: boolean;
    record?: ChequeRecord;
    telegram?: TelegramNotifyResponse;
    message?: string;
  }>(res, 'ไม่สามารถอัปเดตรายการได้');

  if (!res.ok || !data.ok || !data.record) {
    throw new Error(data.message || 'ไม่สามารถอัปเดตรายการได้');
  }
  return {
    record: data.record,
    telegram: data.telegram ?? { ok: false, configured: false, message: '' },
  };
}

export async function importFromPublicSheet(sheetUrlOrId: string): Promise<{
  importedCount: number;
  records: ChequeRecord[];
}> {
  const res = await fetch('/api/import-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetUrlOrId }),
  });
  const data = await safeParseApiJson<{
    ok: boolean;
    importedCount?: number;
    records?: ChequeRecord[];
    message?: string;
  }>(res, 'ดึงข้อมูลจาก Google Sheet ไม่สำเร็จ');

  if (!res.ok || !data.ok || !data.records) {
    throw new Error(data.message || 'ดึงข้อมูลจาก Google Sheet ไม่สำเร็จ');
  }
  return {
    importedCount: data.importedCount ?? data.records.length,
    records: data.records,
  };
}

export async function importFromCsvText(csvText: string): Promise<{
  importedCount: number;
  records: ChequeRecord[];
}> {
  const res = await fetch('/api/import-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvText }),
  });
  const data = await safeParseApiJson<{
    ok: boolean;
    importedCount?: number;
    records?: ChequeRecord[];
    message?: string;
  }>(res, 'นำเข้าไฟล์ CSV ไม่สำเร็จ');

  if (!res.ok || !data.ok || !data.records) {
    throw new Error(data.message || 'นำเข้าไฟล์ CSV ไม่สำเร็จ');
  }
  return {
    importedCount: data.importedCount ?? data.records.length,
    records: data.records,
  };
}
