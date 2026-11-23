import {
  AR_SHEET_ID,
  parseReceivablesCsv,
  ReceivablesDataset,
  ReceivableSourceMode,
} from '../types/receivable';

const UPLOADED_AR_STORAGE_KEY = 'service_ar_uploaded_csv_v1';
const PUBLIC_SNAPSHOT_URL = '/assets/aistudio/______________Service_8cb1fd98';

export function saveUploadedReceivablesCsv(csvText: string): void {
  try {
    window.localStorage.setItem(UPLOADED_AR_STORAGE_KEY, csvText);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearUploadedReceivablesCsv(): void {
  try {
    window.localStorage.removeItem(UPLOADED_AR_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function readUploadedReceivablesCsv(): string | null {
  try {
    return window.localStorage.getItem(UPLOADED_AR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function fetchReceivablesDataset(options?: {
  forceSheetCheck?: boolean;
}): Promise<ReceivablesDataset> {
  if (!options?.forceSheetCheck) {
    const localCsv = readUploadedReceivablesCsv();
    if (localCsv) {
      const parsed = parseReceivablesCsv(localCsv);
      if (parsed.records.length > 0) {
        return {
          source: 'uploaded_csv',
          sheetAccessible: false,
          meta: parsed.meta,
          records: parsed.records,
        };
      }
    }
  }

  try {
    const res = await fetch(`/api/receivables?sheetId=${encodeURIComponent(AR_SHEET_ID)}`);
    const rawText = await res.text();
    if (res.ok && rawText.trim()) {
      const data = JSON.parse(rawText) as {
        ok?: boolean;
        source?: ReceivableSourceMode | 'fallback_required';
        sheetAccessible?: boolean;
        sheetHttpStatus?: number;
        csvText?: string;
      };

      if (data.ok && data.csvText && data.source !== 'fallback_required') {
        const parsed = parseReceivablesCsv(data.csvText);
        if (parsed.records.length > 0) {
          return {
            source: data.source === 'live_google_sheet' ? 'live_google_sheet' : 'sheet_snapshot',
            sheetAccessible: Boolean(data.sheetAccessible),
            sheetHttpStatus: data.sheetHttpStatus,
            meta: parsed.meta,
            records: parsed.records,
          };
        }
      }
    }
  } catch {
    // Fall through to static snapshot asset
  }

  const snapRes = await fetch(PUBLIC_SNAPSHOT_URL);
  if (!snapRes.ok) {
    throw new Error('ไม่สามารถโหลดข้อมูลรายงานลูกหนี้ค้างชำระได้');
  }
  const snapCsv = await snapRes.text();
  const parsed = parseReceivablesCsv(snapCsv);
  return {
    source: 'sheet_snapshot',
    sheetAccessible: false,
    meta: parsed.meta,
    records: parsed.records,
  };
}
