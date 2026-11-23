const DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwa2kmNVP_dyu6ZqQr7Beds52K_HwoNWqChCg-7bQGOR8pLNl55Yw7Z8GW6ajkQxrMA/exec';

const ALLOWED_ZONES = ['โอ', 'ลูกกอล์ฟ'] as const;
const ALLOWED_STATUSES = [
  'รอรับเช็ค',
  'รับเช็คแล้ว',
  'นำฝากแล้ว',
  'เข้าบัญชีแล้ว',
  'เลื่อนรับเช็ค',
  'เช็คมีปัญหา / ยกเลิก',
] as const;

interface StoredChequeRecord {
  id: string;
  rowNumber?: number;
  date: string;
  invoice: string;
  customerName: string;
  sCode: string;
  amount: number;
  remark: string;
  zoneOwner: (typeof ALLOWED_ZONES)[number];
  status: (typeof ALLOWED_STATUSES)[number];
  technician: string;
  syncedToSheet: boolean;
}

interface VercelReq {
  method?: string;
  body?: unknown;
}

interface VercelRes {
  status: (code: number) => { json: (body: unknown) => void };
}

function getWebhookUrl(): string {
  const envUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim().replace(/^["']|["']$/g, '');
  const candidate = envUrl || DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'script.google.com' || parsed.hostname === 'script.googleusercontent.com')
    ) {
      return parsed.toString();
    }
  } catch {
    // Fallback to validated default
  }
  return DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
}

function normalizeDateValue(raw: unknown): string {
  const val = String(raw ?? '').trim();
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

  const isoPrefix = /^(\d{4}-\d{2}-\d{2})T/.exec(val);
  if (isoPrefix?.[1]) return isoPrefix[1];

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val);
  if (slashMatch) {
    const [, d, m, yRaw] = slashMatch;
    let y = Number(yRaw);
    if (y > 2400) y -= 543;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return val;
}

function normalizeZone(val: unknown): (typeof ALLOWED_ZONES)[number] {
  return String(val ?? '').trim() === 'ลูกกอล์ฟ' ? 'ลูกกอล์ฟ' : 'โอ';
}

function normalizeStatus(val: unknown): (typeof ALLOWED_STATUSES)[number] {
  const s = String(val ?? '').trim();
  if ((ALLOWED_STATUSES as readonly string[]).includes(s)) {
    return s as (typeof ALLOWED_STATUSES)[number];
  }
  return 'รอรับเช็ค';
}

function safeParseJson<T>(rawText: string, contextMsg: string): T {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `${contextMsg} (Google Apps Script ส่งคืนหน้า HTML — กรุณาตรวจสอบสิทธิ์ Deploy เป็น "Anyone")`
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${contextMsg} (ข้อมูลตอบกลับไม่ใช่ JSON)`);
  }
}

function parseBody(rawBody: unknown): Record<string, unknown> | null {
  if (!rawBody) return null;
  if (typeof rawBody === 'string') {
    try {
      const parsed = JSON.parse(rawBody);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeField(value: unknown, maxLen = 200): string {
  const str = String(value ?? '').trim();
  return str ? escapeHtml(str.slice(0, maxLen)) : '-';
}

async function sendTelegram(
  action: 'create' | 'update_status',
  record: StoredChequeRecord,
  previousStatus?: string
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, '');
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim().replace(/^["']|["']$/g, '');

  if (!botToken || !chatId) {
    return {
      ok: false,
      configured: false,
      message: 'ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN และ TELEGRAM_CHAT_ID บนเซิร์ฟเวอร์',
    };
  }

  const header =
    action === 'create'
      ? '🆕 <b>บันทึกรายการรับเช็คใหม่</b>'
      : '🔄 <b>อัปเดตสถานะการรับเช็ค</b>';

  const formattedAmount = record.amount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const lines = [
    header,
    '',
    `📅 <b>วันที่:</b> ${sanitizeField(record.date, 40)}`,
    `🧾 <b>Invoice:</b> <code>${sanitizeField(record.invoice, 80)}</code>`,
    `🏢 <b>ชื่อลูกค้า:</b> ${sanitizeField(record.customerName, 160)}`,
    `🔧 <b>S:</b> ${sanitizeField(record.sCode, 60)}`,
    `💰 <b>ยอดเงิน:</b> <b>${formattedAmount} บาท</b>`,
    `📍 <b>ผู้รับผิดชอบเขต:</b> ${sanitizeField(record.zoneOwner, 60)}`,
    `👷 <b>ช่างผู้รับผิดชอบ:</b> ${sanitizeField(record.technician, 80)}`,
    action === 'update_status' && previousStatus
      ? `📊 <b>สถานะ:</b> ${sanitizeField(previousStatus, 60)} ➜ <b>${sanitizeField(record.status, 60)}</b>`
      : `📊 <b>สถานะ:</b> <b>${sanitizeField(record.status, 60)}</b>`,
  ];

  if (record.remark.trim()) {
    lines.push(`📝 <b>Remark:</b> ${sanitizeField(record.remark, 300)}`);
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const raw = await response.text();
    let parsed: { ok?: boolean; description?: string } = {};
    try {
      parsed = JSON.parse(raw) as { ok?: boolean; description?: string };
    } catch {
      parsed = {};
    }
    if (!response.ok || !parsed.ok) {
      return {
        ok: false,
        configured: true,
        message: parsed.description
          ? `ส่งข้อความ Telegram ไม่สำเร็จ (${parsed.description})`
          : 'ส่งข้อความไปยัง Telegram ไม่สำเร็จ กรุณาตรวจสอบ Token หรือ Chat ID',
      };
    }
    return { ok: true, configured: true, message: 'ส่งแจ้งเตือนผ่าน Telegram เรียบร้อยแล้ว' };
  } catch {
    return {
      ok: false,
      configured: true,
      message: 'ไม่สามารถเชื่อมต่อ Telegram API ได้ในขณะนี้',
    };
  }
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    const webhookUrl = getWebhookUrl();

    if (req.method === 'GET') {
      const response = await fetch(webhookUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        return res.status(502).json({
          ok: false,
          message: `ไม่สามารถอ่านข้อมูลจาก Google Sheet ได้ (HTTP ${response.status})`,
        });
      }

      const rawText = await response.text();
      const payload = safeParseJson<unknown>(rawText, 'ไม่สามารถอ่านข้อมูลจาก Google Sheet');

      let rawRows: unknown[] = [];
      if (Array.isArray(payload)) {
        rawRows = payload;
      } else if (payload && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        if (Array.isArray(obj.records)) rawRows = obj.records;
        else if (Array.isArray(obj.data)) rawRows = obj.data;
      }

      const normalized: StoredChequeRecord[] = rawRows
        .map((item, idx) => {
          const r = (item ?? {}) as Record<string, unknown>;
          const rowNum = typeof r.rowNumber === 'number' ? r.rowNumber : idx + 2;
          const date = normalizeDateValue(r.date ?? r['วันที่']);
          const invoice = String(r.invoice ?? r['Invoice'] ?? '').trim();
          const customerName = String(r.customerName ?? r['ชื่อลูกค้า'] ?? '').trim();
          const sCode = String(r.sCode ?? r['S'] ?? r[' S '] ?? '').trim();
          const amount = Number(String(r.amount ?? r['ยอดเงิน'] ?? r[' ยอดเงิน '] ?? 0).replace(/,/g, '')) || 0;
          const remark = String(r.remark ?? r['Remark'] ?? '').trim();
          const zoneOwner = normalizeZone(r.zoneOwner ?? r['ผู้รับผิดชอบเขต']);
          const status = normalizeStatus(r.status ?? r['สถานะ']);
          const technician =
            String(r.technician ?? r['ช่างผู้รับผิดชอบ'] ?? r['ช่างที่รับผิดชอบ'] ?? '').trim() ||
            'รวิ สวัสดี';

          return {
            id: String(r.id ?? `sheet-row-${rowNum}`),
            rowNumber: rowNum,
            date,
            invoice,
            customerName,
            sCode,
            amount,
            remark,
            zoneOwner,
            status,
            technician,
            syncedToSheet: true,
          };
        })
        .filter((r) => Boolean(r.date || r.invoice || r.customerName || r.amount > 0));

      return res.status(200).json({
        ok: true,
        mode: 'google_sheet_webhook',
        records: normalized.reverse(),
      });
    }

    if (req.method === 'POST') {
      const b = parseBody(req.body);
      if (!b) {
        return res.status(400).json({ ok: false, message: 'ข้อมูลไม่ถูกต้อง' });
      }

      const date = normalizeDateValue(b.date);
      const invoice = String(b.invoice ?? '').trim();
      const customerName = String(b.customerName ?? '').trim();
      const sCode = String(b.sCode ?? '').trim().slice(0, 60);
      const remark = String(b.remark ?? '').trim().slice(0, 400);
      const technician = String(b.technician ?? '').trim().slice(0, 100) || 'รวิ สวัสดี';
      const amount =
        typeof b.amount === 'number'
          ? b.amount
          : Number(String(b.amount ?? '').replace(/,/g, '').trim());

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ ok: false, message: 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)' });
      }
      if (!invoice || invoice.length > 80) {
        return res.status(400).json({ ok: false, message: 'กรุณาระบุเลขที่ Invoice ให้ถูกต้อง' });
      }
      if (!customerName || customerName.length > 160) {
        return res.status(400).json({ ok: false, message: 'กรุณาระบุชื่อลูกค้าให้ถูกต้อง' });
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
        return res.status(400).json({ ok: false, message: 'ยอดเงินต้องมากกว่า 0' });
      }

      const inputRecord = {
        date,
        invoice,
        customerName,
        sCode,
        amount,
        remark,
        zoneOwner: normalizeZone(b.zoneOwner),
        status: normalizeStatus(b.status),
        technician,
      };

      const sheetRes = await fetch(webhookUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', record: inputRecord }),
        signal: AbortSignal.timeout(10000),
      });

      if (!sheetRes.ok) {
        return res.status(502).json({
          ok: false,
          message: 'บันทึกข้อมูลไปยัง Google Sheet ไม่สำเร็จ',
        });
      }

      const rawText = await sheetRes.text();
      const sheetData = safeParseJson<{ ok?: boolean; rowNumber?: number; error?: string }>(
        rawText,
        'บันทึกข้อมูลเข้า Google Sheet ไม่สำเร็จ'
      );
      if (!sheetData.ok) {
        return res.status(502).json({
          ok: false,
          message: sheetData.error || 'Google Sheet ปฏิเสธการบันทึกข้อมูล',
        });
      }

      const rowNumber = typeof sheetData.rowNumber === 'number' ? sheetData.rowNumber : undefined;
      const savedRecord: StoredChequeRecord = {
        id: rowNumber ? `sheet-row-${rowNumber}` : `sheet-${Date.now()}`,
        rowNumber,
        ...inputRecord,
        syncedToSheet: true,
      };

      const telegram = await sendTelegram('create', savedRecord);
      return res.status(201).json({ ok: true, record: savedRecord, telegram });
    }

    if (req.method === 'PATCH') {
      const b = parseBody(req.body);
      if (!b) {
        return res.status(400).json({ ok: false, message: 'ข้อมูลอัปเดตไม่ถูกต้อง' });
      }

      const id = String(b.id ?? '').trim();
      if (!id) {
        return res.status(400).json({ ok: false, message: 'ไม่พบรหัสรายการที่ต้องการอัปเดต' });
      }

      const rowNumber =
        typeof b.rowNumber === 'number' && Number.isInteger(b.rowNumber) && b.rowNumber >= 2
          ? b.rowNumber
          : undefined;

      const patch = {
        status: normalizeStatus(b.status),
        zoneOwner: normalizeZone(b.zoneOwner),
        technician: String(b.technician ?? '').trim().slice(0, 100) || 'รวิ สวัสดี',
        remark: String(b.remark ?? '').trim().slice(0, 400),
      };

      const sheetRes = await fetch(webhookUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id, rowNumber, patch }),
        signal: AbortSignal.timeout(10000),
      });

      if (!sheetRes.ok) {
        return res.status(502).json({
          ok: false,
          message: 'อัปเดตข้อมูลไปยัง Google Sheet ไม่สำเร็จ',
        });
      }

      const rawText = await sheetRes.text();
      const sheetData = safeParseJson<{
        ok?: boolean;
        previousStatus?: string;
        record?: StoredChequeRecord;
        error?: string;
      }>(rawText, 'อัปเดตข้อมูลใน Google Sheet ไม่สำเร็จ');

      if (!sheetData.ok) {
        return res.status(502).json({
          ok: false,
          message: sheetData.error || 'Google Sheet อัปเดตข้อมูลไม่สำเร็จ',
        });
      }

      const updatedRecord: StoredChequeRecord = sheetData.record ?? {
        id,
        rowNumber,
        date: normalizeDateValue(b.date),
        invoice: String(b.invoice ?? ''),
        customerName: String(b.customerName ?? ''),
        sCode: String(b.sCode ?? ''),
        amount: Number(b.amount ?? 0) || 0,
        remark: patch.remark,
        zoneOwner: patch.zoneOwner,
        status: patch.status,
        technician: patch.technician,
        syncedToSheet: true,
      };

      const previousStatus =
        typeof b.previousStatus === 'string' ? b.previousStatus : sheetData.previousStatus;

      const telegram = await sendTelegram('update_status', updatedRecord, previousStatus);
      return res.status(200).json({
        ok: true,
        record: { ...updatedRecord, syncedToSheet: true },
        telegram,
      });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
    return res.status(500).json({ ok: false, message: msg });
  }
}
