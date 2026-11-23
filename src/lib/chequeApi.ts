import { ChequeRecord } from '../types/cheque';
import { TelegramNotifyResponse } from './telegramClient';

export interface ServerHealthResponse {
  ok: boolean;
  telegramConfigured: boolean;
  googleSheetWebhookConfigured: boolean;
}

export type StorageMode = 'google_sheet_webhook' | 'local_server';

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
    return (await res.json()) as ServerHealthResponse;
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
  const data = (await res.json()) as {
    ok: boolean;
    mode?: StorageMode;
    records?: ChequeRecord[];
    message?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.message || 'ไม่สามารถโหลดรายการเช็คได้');
  }
  return {
    mode: data.mode ?? 'local_server',
    records: data.records ?? [],
  };
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
  const data = (await res.json()) as {
    ok: boolean;
    record?: ChequeRecord;
    telegram?: TelegramNotifyResponse;
    message?: string;
  };
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
  const data = (await res.json()) as {
    ok: boolean;
    record?: ChequeRecord;
    telegram?: TelegramNotifyResponse;
    message?: string;
  };
  if (!res.ok || !data.ok || !data.record) {
    throw new Error(data.message || 'ไม่สามารถอัปเดตรายการได้');
  }
  return {
    record: data.record,
    telegram: data.telegram ?? { ok: false, configured: false, message: '' },
  };
}
