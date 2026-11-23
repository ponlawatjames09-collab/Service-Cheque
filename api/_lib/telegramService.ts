export interface TelegramRecordPayload {
  date: string;
  invoice: string;
  customerName: string;
  sCode: string;
  amount: number | string;
  remark: string;
  zoneOwner: string;
  status: string;
  technician: string;
}

export interface TelegramNotifyBody {
  action: 'create' | 'update_status' | 'resend';
  record: TelegramRecordPayload;
  previousStatus?: string;
}

export interface TelegramResult {
  ok: boolean;
  configured: boolean;
  message: string;
}

function escapeHtml(value: unknown): string {
  const str = String(value ?? '').trim();
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatAmount(amount: number | string): string {
  const num = typeof amount === 'number' ? amount : Number(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(num)) {
    return escapeHtml(amount || '0');
  }
  return num.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeField(value: unknown, maxLen = 200): string {
  const str = String(value ?? '').trim();
  if (!str) return '-';
  return escapeHtml(str.slice(0, maxLen));
}

export function validateNotifyBody(body: unknown): { valid: true; data: TelegramNotifyBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  const candidate = body as Record<string, unknown>;
  const action = candidate.action;
  if (action !== 'create' && action !== 'update_status' && action !== 'resend') {
    return { valid: false, error: 'Invalid action type' };
  }
  const record = candidate.record;
  if (!record || typeof record !== 'object') {
    return { valid: false, error: 'Missing cheque record' };
  }
  const rec = record as Record<string, unknown>;
  if (!String(rec.customerName ?? '').trim() || !String(rec.invoice ?? '').trim()) {
    return { valid: false, error: 'Invoice and customerName are required' };
  }

  const parsedAmount = typeof rec.amount === 'number' ? rec.amount : Number(String(rec.amount ?? '').replace(/,/g, ''));
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > 1_000_000_000) {
    return { valid: false, error: 'Invalid amount value' };
  }

  return {
    valid: true,
    data: {
      action,
      previousStatus: typeof candidate.previousStatus === 'string' ? candidate.previousStatus : undefined,
      record: {
        date: String(rec.date ?? ''),
        invoice: String(rec.invoice ?? ''),
        customerName: String(rec.customerName ?? ''),
        sCode: String(rec.sCode ?? ''),
        amount: parsedAmount,
        remark: String(rec.remark ?? ''),
        zoneOwner: String(rec.zoneOwner ?? ''),
        status: String(rec.status ?? ''),
        technician: String(rec.technician ?? ''),
      },
    },
  };
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export async function sendTelegramNotification(payload: TelegramNotifyBody): Promise<TelegramResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    return {
      ok: false,
      configured: false,
      message: 'ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN และ TELEGRAM_CHAT_ID บนเซิร์ฟเวอร์',
    };
  }

  const { action, record, previousStatus } = payload;

  let header = '📌 <b>แจ้งเตือนติดตามการรับเช็ค</b>';
  if (action === 'create') {
    header = '🆕 <b>บันทึกรายการรับเช็คใหม่</b>';
  } else if (action === 'update_status') {
    header = '🔄 <b>อัปเดตสถานะการรับเช็ค</b>';
  } else if (action === 'resend') {
    header = '🔔 <b>แจ้งเตือนรายการรับเช็ค</b>';
  }

  const lines = [
    header,
    '',
    `📅 <b>วันที่:</b> ${sanitizeField(record.date, 40)}`,
    `🧾 <b>Invoice:</b> <code>${sanitizeField(record.invoice, 80)}</code>`,
    `🏢 <b>ชื่อลูกค้า:</b> ${sanitizeField(record.customerName, 160)}`,
    `🔧 <b>S:</b> ${sanitizeField(record.sCode, 60)}`,
    `💰 <b>ยอดเงิน:</b> <b>${formatAmount(record.amount)} บาท</b>`,
    `📍 <b>ผู้รับผิดชอบเขต:</b> ${sanitizeField(record.zoneOwner, 60)}`,
    `👷 <b>ช่างที่รับผิดชอบ:</b> ${sanitizeField(record.technician, 80)}`,
  ];

  if (action === 'update_status' && previousStatus) {
    lines.push(`📊 <b>สถานะ:</b> ${sanitizeField(previousStatus, 60)} ➜ <b>${sanitizeField(record.status, 60)}</b>`);
  } else {
    lines.push(`📊 <b>สถานะ:</b> <b>${sanitizeField(record.status, 60)}</b>`);
  }

  if (record.remark && record.remark.trim()) {
    lines.push(`📝 <b>Remark:</b> ${sanitizeField(record.remark, 300)}`);
  }

  const text = lines.join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const rawText = await response.text();
    let data: { ok?: boolean } = {};
    try {
      data = JSON.parse(rawText) as { ok?: boolean };
    } catch {
      data = {};
    }

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        configured: true,
        message: 'ส่งข้อความไปยัง Telegram ไม่สำเร็จ กรุณาตรวจสอบ Token หรือ Chat ID บนเซิร์ฟเวอร์',
      };
    }

    return {
      ok: true,
      configured: true,
      message: 'ส่งแจ้งเตือนผ่าน Telegram เรียบร้อยแล้ว',
    };
  } catch {
    return {
      ok: false,
      configured: true,
      message: 'ไม่สามารถเชื่อมต่อ Telegram API ได้ในขณะนี้',
    };
  }
}
