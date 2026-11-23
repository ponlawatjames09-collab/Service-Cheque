import fs from 'fs';
import path from 'path';

export const ALLOWED_ZONES = ['โอ', 'ลูกกอล์ฟ'] as const;
export const ALLOWED_STATUSES = [
  'รอรับเช็ค',
  'รับเช็คแล้ว',
  'นำฝากแล้ว',
  'เข้าบัญชีแล้ว',
  'เลื่อนรับเช็ค',
  'เช็คมีปัญหา / ยกเลิก',
] as const;

export interface StoredChequeRecord {
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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'cheques.json');

let memoryStore: StoredChequeRecord[] = [];
let memoryInitialized = false;

export function getValidatedGoogleSheetsWebhookUrl(): string | null {
  const raw = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    if (
      parsed.hostname !== 'script.google.com' &&
      parsed.hostname !== 'script.googleusercontent.com'
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isGoogleSheetsWebhookConfigured(): boolean {
  return Boolean(getValidatedGoogleSheetsWebhookUrl());
}

function loadLocalStore(): StoredChequeRecord[] {
  if (memoryInitialized) return memoryStore;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        memoryStore = parsed;
      }
    }
  } catch {
    // Read-only or unavailable local filesystem; keep in-memory store
  }
  memoryInitialized = true;
  return memoryStore;
}

function saveLocalStore(records: StoredChequeRecord[]): void {
  memoryStore = records;
  memoryInitialized = true;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Ignore disk write errors on read-only serverless environments
  }
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

export function validateChequeInput(body: unknown):
  | {
      valid: true;
      data: Omit<StoredChequeRecord, 'id' | 'rowNumber' | 'syncedToSheet'>;
    }
  | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'ข้อมูลไม่ถูกต้อง' };
  }
  const b = body as Record<string, unknown>;
  const date = String(b.date ?? '').trim();
  const invoice = String(b.invoice ?? '').trim();
  const customerName = String(b.customerName ?? '').trim();
  const sCode = String(b.sCode ?? '').trim().slice(0, 60);
  const remark = String(b.remark ?? '').trim().slice(0, 400);
  const technician = String(b.technician ?? '').trim().slice(0, 100);
  const amount =
    typeof b.amount === 'number'
      ? b.amount
      : Number(String(b.amount ?? '').replace(/,/g, '').trim());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { valid: false, error: 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)' };
  }
  if (!invoice || invoice.length > 80) {
    return { valid: false, error: 'กรุณาระบุเลขที่ Invoice ให้ถูกต้อง' };
  }
  if (!customerName || customerName.length > 160) {
    return { valid: false, error: 'กรุณาระบุชื่อลูกค้าให้ถูกต้อง' };
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return { valid: false, error: 'ยอดเงินต้องมากกว่า 0' };
  }

  return {
    valid: true,
    data: {
      date,
      invoice,
      customerName,
      sCode,
      amount,
      remark,
      zoneOwner: normalizeZone(b.zoneOwner),
      status: normalizeStatus(b.status),
      technician: technician || 'รวิ สวัสดี',
    },
  };
}

export function validateChequePatch(body: unknown):
  | {
      valid: true;
      id: string;
      rowNumber?: number;
      patch: Partial<Pick<StoredChequeRecord, 'status' | 'zoneOwner' | 'technician' | 'remark'>>;
    }
  | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'ข้อมูลอัปเดตไม่ถูกต้อง' };
  }
  const b = body as Record<string, unknown>;
  const id = String(b.id ?? '').trim();
  if (!id) {
    return { valid: false, error: 'ไม่พบรหัสรายการที่ต้องการอัปเดต' };
  }

  const rowNumber =
    typeof b.rowNumber === 'number' && Number.isInteger(b.rowNumber) && b.rowNumber >= 2
      ? b.rowNumber
      : undefined;

  return {
    valid: true,
    id,
    rowNumber,
    patch: {
      status: normalizeStatus(b.status),
      zoneOwner: normalizeZone(b.zoneOwner),
      technician: String(b.technician ?? '').trim().slice(0, 100) || 'รวิ สวัสดี',
      remark: String(b.remark ?? '').trim().slice(0, 400),
    },
  };
}

export async function listChequeRecords(): Promise<{
  mode: 'google_sheet_webhook' | 'local_server';
  records: StoredChequeRecord[];
}> {
  const webhookUrl = getValidatedGoogleSheetsWebhookUrl();
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error('ไม่สามารถอ่านข้อมูลจาก Google Sheet Webhook ได้');
    }
    const payload = (await res.json()) as { ok?: boolean; records?: unknown[] };
    const rawRows = Array.isArray(payload.records) ? payload.records : [];
    const normalized: StoredChequeRecord[] = rawRows.map((item, idx) => {
      const r = (item ?? {}) as Record<string, unknown>;
      const rowNum =
        typeof r.rowNumber === 'number' ? r.rowNumber : idx + 2;
      return {
        id: String(r.id ?? `sheet-row-${rowNum}`),
        rowNumber: rowNum,
        date: String(r.date ?? '').trim(),
        invoice: String(r.invoice ?? '').trim(),
        customerName: String(r.customerName ?? '').trim(),
        sCode: String(r.sCode ?? '').trim(),
        amount: Number(String(r.amount ?? 0).replace(/,/g, '')) || 0,
        remark: String(r.remark ?? '').trim(),
        zoneOwner: normalizeZone(r.zoneOwner),
        status: normalizeStatus(r.status),
        technician: String(r.technician ?? '').trim() || 'รวิ สวัสดี',
        syncedToSheet: true,
      };
    });
    return {
      mode: 'google_sheet_webhook',
      records: normalized.reverse(),
    };
  }

  const local = loadLocalStore();
  return {
    mode: 'local_server',
    records: [...local],
  };
}

export async function createChequeRecord(
  input: Omit<StoredChequeRecord, 'id' | 'rowNumber' | 'syncedToSheet'>
): Promise<StoredChequeRecord> {
  const webhookUrl = getValidatedGoogleSheetsWebhookUrl();
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        record: input,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error('บันทึกข้อมูลไปยัง Google Sheet Webhook ไม่สำเร็จ');
    }

    const data = (await res.json()) as { ok?: boolean; rowNumber?: number; error?: string };
    if (!data.ok) {
      throw new Error(data.error || 'Google Sheet Webhook ปฏิเสธการบันทึกข้อมูล');
    }

    const rowNumber = typeof data.rowNumber === 'number' ? data.rowNumber : undefined;
    return {
      id: rowNumber ? `sheet-row-${rowNumber}` : `sheet-${Date.now()}`,
      rowNumber,
      ...input,
      syncedToSheet: true,
    };
  }

  const current = loadLocalStore();
  const newRecord: StoredChequeRecord = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    syncedToSheet: false,
  };
  saveLocalStore([newRecord, ...current]);
  return newRecord;
}

export async function updateChequeRecord(
  id: string,
  patch: Partial<Pick<StoredChequeRecord, 'status' | 'zoneOwner' | 'technician' | 'remark'>>,
  rowNumber?: number,
  currentRecordSnapshot?: Partial<StoredChequeRecord>
): Promise<{ previousStatus?: string; record: StoredChequeRecord }> {
  const webhookUrl = getValidatedGoogleSheetsWebhookUrl();
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id,
        rowNumber,
        patch,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error('อัปเดตข้อมูลไปยัง Google Sheet Webhook ไม่สำเร็จ');
    }

    const data = (await res.json()) as {
      ok?: boolean;
      previousStatus?: string;
      record?: StoredChequeRecord;
      error?: string;
    };
    if (!data.ok) {
      throw new Error(data.error || 'Google Sheet Webhook อัปเดตข้อมูลไม่สำเร็จ');
    }

    const merged: StoredChequeRecord = data.record ?? {
      id,
      rowNumber,
      date: String(currentRecordSnapshot?.date ?? ''),
      invoice: String(currentRecordSnapshot?.invoice ?? ''),
      customerName: String(currentRecordSnapshot?.customerName ?? ''),
      sCode: String(currentRecordSnapshot?.sCode ?? ''),
      amount: Number(currentRecordSnapshot?.amount ?? 0),
      remark: patch.remark ?? String(currentRecordSnapshot?.remark ?? ''),
      zoneOwner: patch.zoneOwner ?? normalizeZone(currentRecordSnapshot?.zoneOwner),
      status: patch.status ?? normalizeStatus(currentRecordSnapshot?.status),
      technician: patch.technician ?? String(currentRecordSnapshot?.technician ?? 'รวิ สวัสดี'),
      syncedToSheet: true,
    };
    return {
      previousStatus: data.previousStatus,
      record: { ...merged, syncedToSheet: true },
    };
  }

  const current = loadLocalStore();
  const idx = current.findIndex((r) => r.id === id);
  if (idx === -1) {
    throw new Error('ไม่พบรายการเช็คที่ต้องการอัปเดต');
  }

  const previous = current[idx];
  const updated: StoredChequeRecord = {
    ...previous,
    status: patch.status ?? previous.status,
    zoneOwner: patch.zoneOwner ?? previous.zoneOwner,
    technician: patch.technician ?? previous.technician,
    remark: patch.remark ?? previous.remark,
    syncedToSheet: false,
  };

  const nextList = [...current];
  nextList[idx] = updated;
  saveLocalStore(nextList);

  return {
    previousStatus: previous.status,
    record: updated,
  };
}
