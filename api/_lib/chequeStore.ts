import fs from 'fs';
import os from 'os';
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

const PRIMARY_DATA_DIR = path.resolve(process.cwd(), 'data');
const TMP_DATA_DIR = path.join(os.tmpdir(), 'service-cheque-data');

let memoryStore: StoredChequeRecord[] = [];
let memoryInitialized = false;

function resolveStoreFilePath(): string {
  try {
    if (!fs.existsSync(PRIMARY_DATA_DIR)) {
      fs.mkdirSync(PRIMARY_DATA_DIR, { recursive: true });
    }
    fs.accessSync(PRIMARY_DATA_DIR, fs.constants.W_OK);
    return path.join(PRIMARY_DATA_DIR, 'cheques.json');
  } catch {
    try {
      if (!fs.existsSync(TMP_DATA_DIR)) {
        fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
      }
    } catch {
      // Ignore if tmpdir creation fails
    }
    return path.join(TMP_DATA_DIR, 'cheques.json');
  }
}

export function getValidatedGoogleSheetsWebhookUrl(): string | null {
  const raw = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim().replace(/^["']|["']$/g, '');
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

export function extractSafeGoogleSheetId(rawInput: string | undefined): string | null {
  const raw = String(rawInput ?? '').trim();
  if (!raw) return null;

  const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,100})/.exec(raw);
  if (urlMatch?.[1]) return urlMatch[1];

  if (/^[a-zA-Z0-9-_]{20,100}$/.test(raw)) {
    return raw;
  }
  return null;
}

export function isGoogleSheetsWebhookConfigured(): boolean {
  return Boolean(getValidatedGoogleSheetsWebhookUrl());
}

function loadLocalStore(): StoredChequeRecord[] {
  if (memoryInitialized) return memoryStore;
  try {
    const filePath = resolveStoreFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        memoryStore = parsed;
      }
    }
  } catch {
    // Keep memory store on read failure
  }
  memoryInitialized = true;
  return memoryStore;
}

function saveLocalStore(records: StoredChequeRecord[]): void {
  memoryStore = records;
  memoryInitialized = true;
  try {
    const filePath = resolveStoreFilePath();
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Ignore disk write errors on read-only environments
  }
}

export function normalizeDateValue(raw: unknown): string {
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

export function normalizeZone(val: unknown): (typeof ALLOWED_ZONES)[number] {
  return String(val ?? '').trim() === 'ลูกกอล์ฟ' ? 'ลูกกอล์ฟ' : 'โอ';
}

export function normalizeStatus(val: unknown): (typeof ALLOWED_STATUSES)[number] {
  const s = String(val ?? '').trim();
  if ((ALLOWED_STATUSES as readonly string[]).includes(s)) {
    return s as (typeof ALLOWED_STATUSES)[number];
  }
  return 'รอรับเช็ค';
}

export function parseCsvMatrix(csvText: string): string[][] {
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
    } else {
      if (ch === '"') {
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
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function parseSheetCsvToRecords(csvText: string): StoredChequeRecord[] {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length <= 1) return [];

  const records: StoredChequeRecord[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const date = normalizeDateValue(row[0]);
    const invoice = String(row[1] ?? '').trim();
    const customerName = String(row[2] ?? '').trim();
    const sCode = String(row[3] ?? '').trim();
    const amount = Number(String(row[4] ?? '').replace(/,/g, '').trim()) || 0;
    const remark = String(row[5] ?? '').trim();
    const zoneOwner = normalizeZone(row[6]);
    const status = normalizeStatus(row[7]);
    const technician = String(row[8] ?? '').trim() || 'รวิ สวัสดี';

    if (!date && !invoice && !customerName && amount === 0) {
      continue;
    }

    records.push({
      id: `sheet-row-${i + 1}`,
      rowNumber: i + 1,
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
    });
  }
  return records.reverse();
}

export async function fetchPublicGoogleSheetRecords(sheetIdInput: string): Promise<StoredChequeRecord[]> {
  const sheetId = extractSafeGoogleSheetId(sheetIdInput);
  if (!sheetId) {
    throw new Error('ลิงก์หรือรหัส Google Sheet ไม่ถูกต้อง');
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const res = await fetch(exportUrl, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error('ไม่สามารถอ่าน Google Sheet ได้ กรุณาเปิดสิทธิ์แชร์ไฟล์เป็น "ทุกคนที่มีลิงก์สามารถดูได้"');
  }

  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error('Google Sheet ยังไม่เปิดสิทธิ์แชร์สาธารณะ กรุณาตั้งค่าแชร์เป็น "ทุกคนที่มีลิงก์" หรือใช้ Apps Script Webhook');
  }

  return parseSheetCsvToRecords(text);
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
  const date = normalizeDateValue(b.date);
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

function safeParseJson<T>(rawText: string, contextMsg: string): T {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `${contextMsg} (Google Apps Script ส่งคืนหน้า HTML — กรุณาตรวจสอบว่า Deploy เป็น "Anyone" แล้ว)`
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${contextMsg} (ข้อมูลตอบกลับไม่ใช่ JSON)`);
  }
}

export async function listChequeRecords(): Promise<{
  mode: 'google_sheet_webhook' | 'local_server';
  records: StoredChequeRecord[];
}> {
  const webhookUrl = getValidatedGoogleSheetsWebhookUrl();
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error('ไม่สามารถอ่านข้อมูลจาก Google Sheet Webhook ได้');
    }
    const rawText = await res.text();
    const payload = safeParseJson<{ ok?: boolean; records?: unknown[] }>(
      rawText,
      'ไม่สามารถอ่านข้อมูลจาก Google Sheet'
    );
    const rawRows = Array.isArray(payload.records) ? payload.records : [];
    const normalized: StoredChequeRecord[] = rawRows.map((item, idx) => {
      const r = (item ?? {}) as Record<string, unknown>;
      const rowNum = typeof r.rowNumber === 'number' ? r.rowNumber : idx + 2;
      return {
        id: String(r.id ?? `sheet-row-${rowNum}`),
        rowNumber: rowNum,
        date: normalizeDateValue(r.date),
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

  const envSheetId = extractSafeGoogleSheetId(process.env.GOOGLE_SHEET_ID);
  if (envSheetId) {
    const records = await fetchPublicGoogleSheetRecords(envSheetId);
    return {
      mode: 'local_server',
      records,
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
      redirect: 'follow',
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

    const rawText = await res.text();
    const data = safeParseJson<{ ok?: boolean; rowNumber?: number; error?: string }>(
      rawText,
      'บันทึกข้อมูลเข้า Google Sheet ไม่สำเร็จ'
    );
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

export async function bulkImportLocalRecords(
  records: StoredChequeRecord[]
): Promise<StoredChequeRecord[]> {
  const current = loadLocalStore();
  const existingKeys = new Set(current.map((r) => `${r.date}|${r.invoice}|${r.amount}`));
  const merged = [...current];
  for (const r of records) {
    const key = `${r.date}|${r.invoice}|${r.amount}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      merged.unshift(r);
    }
  }
  saveLocalStore(merged);
  return merged;
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
      redirect: 'follow',
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

    const rawText = await res.text();
    const data = safeParseJson<{
      ok?: boolean;
      previousStatus?: string;
      record?: StoredChequeRecord;
      error?: string;
    }>(rawText, 'อัปเดตข้อมูลใน Google Sheet ไม่สำเร็จ');
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
  if (idx === -1 && currentRecordSnapshot) {
    // Allow updating records cached client-side even after serverless cold start
    const restored: StoredChequeRecord = {
      id,
      rowNumber,
      date: String(currentRecordSnapshot.date ?? ''),
      invoice: String(currentRecordSnapshot.invoice ?? ''),
      customerName: String(currentRecordSnapshot.customerName ?? ''),
      sCode: String(currentRecordSnapshot.sCode ?? ''),
      amount: Number(currentRecordSnapshot.amount ?? 0),
      remark: patch.remark ?? String(currentRecordSnapshot.remark ?? ''),
      zoneOwner: patch.zoneOwner ?? normalizeZone(currentRecordSnapshot.zoneOwner),
      status: patch.status ?? normalizeStatus(currentRecordSnapshot.status),
      technician: patch.technician ?? String(currentRecordSnapshot.technician ?? 'รวิ สวัสดี'),
      syncedToSheet: false,
    };
    saveLocalStore([restored, ...current]);
    return {
      previousStatus: String(currentRecordSnapshot.status ?? ''),
      record: restored,
    };
  }
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
