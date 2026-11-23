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
  'กำลังดำเนินการติดตาม',
  'รอลดหนี้ในระบบ',
  'ติดตามวางบิลใหม่',
  'รอแก้ไขเอกสารเพิ่มเติม',
  'อื่นๆ',
] as const;

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
    // Fallback
  }
  return DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
}

function normalizeDateValue(raw: unknown): string {
  const val = String(raw ?? '').trim();
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val);
  if (slashMatch) {
    const [, d, m, yRaw] = slashMatch;
    let y = Number(yRaw);
    if (y > 2400) y -= 543;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return val;
}

function parseCsvMatrix(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'Method not allowed' });
    }

    const body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as Record<string, unknown>)
        : req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};

    const csvText = typeof body.csvText === 'string' ? body.csvText : '';
    if (!csvText.trim()) {
      return res.status(400).json({ ok: false, message: 'กรุณาเลือกไฟล์ CSV' });
    }

    const matrix = parseCsvMatrix(csvText);
    if (matrix.length <= 1) {
      return res.status(400).json({ ok: false, message: 'ไม่พบแถวข้อมูลในไฟล์ CSV' });
    }

    const webhookUrl = getWebhookUrl();
    const imported: unknown[] = [];

    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      const date = normalizeDateValue(row[0]);
      const invoice = String(row[1] ?? '').trim();
      const customerName = String(row[2] ?? '').trim();
      const sCode = String(row[3] ?? '').trim();
      const amount = Number(String(row[4] ?? '').replace(/,/g, '').trim()) || 0;
      const remark = String(row[5] ?? '').trim();
      const zoneOwner = String(row[6] ?? '').trim() === 'ลูกกอล์ฟ' ? 'ลูกกอล์ฟ' : 'โอ';
      const statusRaw = String(row[7] ?? '').trim();
      const normalizedRaw = statusRaw === 'อืนๆ' ? 'อื่นๆ' : statusRaw;
      const status = (ALLOWED_STATUSES as readonly string[]).includes(normalizedRaw)
        ? normalizedRaw
        : 'รอรับเช็ค';
      const technician = String(row[8] ?? '').trim() || 'รวิ สวัสดี';

      if (!date && !invoice && !customerName && amount === 0) continue;

      const record = {
        date,
        invoice,
        customerName,
        sCode,
        amount,
        remark,
        zoneOwner: (ALLOWED_ZONES as readonly string[]).includes(zoneOwner) ? zoneOwner : 'โอ',
        status,
        technician,
      };

      const sheetRes = await fetch(webhookUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', record }),
        signal: AbortSignal.timeout(10000),
      });

      if (sheetRes.ok) {
        const txt = await sheetRes.text();
        const parsed = JSON.parse(txt) as { ok?: boolean; rowNumber?: number };
        imported.push({
          id: parsed.rowNumber ? `sheet-row-${parsed.rowNumber}` : `sheet-${Date.now()}-${i}`,
          rowNumber: parsed.rowNumber,
          ...record,
          syncedToSheet: true,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      importedCount: imported.length,
      records: imported.reverse(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'นำเข้าไฟล์ CSV ไม่สำเร็จ';
    return res.status(502).json({ ok: false, message: msg });
  }
}
