import { ChequeRecord } from '../types/cheque';

export interface TelegramHealthResponse {
  ok: boolean;
  telegramConfigured: boolean;
}

export interface TelegramNotifyResponse {
  ok: boolean;
  configured: boolean;
  message: string;
}

export async function checkServerHealth(): Promise<TelegramHealthResponse> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      return { ok: false, telegramConfigured: false };
    }
    return (await res.json()) as TelegramHealthResponse;
  } catch {
    return { ok: false, telegramConfigured: false };
  }
}

export async function notifyTelegram(
  action: 'create' | 'update_status' | 'resend',
  record: ChequeRecord,
  previousStatus?: string
): Promise<TelegramNotifyResponse> {
  try {
    const res = await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        previousStatus,
        record: {
          date: record.date,
          invoice: record.invoice,
          customerName: record.customerName,
          sCode: record.sCode,
          amount: record.amount,
          remark: record.remark,
          zoneOwner: record.zoneOwner,
          status: record.status,
          technician: record.technician,
        },
      }),
    });

    return (await res.json()) as TelegramNotifyResponse;
  } catch {
    return {
      ok: false,
      configured: false,
      message: 'ไม่สามารถเชื่อมต่อระบบแจ้งเตือน Telegram ได้',
    };
  }
}
