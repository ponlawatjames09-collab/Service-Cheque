export const SERVICE_BILLING_SHEET_ID = '1s2VkerbQ7y0BeHBcdtzkXtsxzn-VR6ZMw2l0p9NCiP8';
export const SERVICE_BILLING_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SERVICE_BILLING_SHEET_ID}/edit`;

export type BillingStatusType = 'วางบิลเรียบร้อยแล้ว' | 'ยังไม่ได้วางบิล' | 'ยังไม่ระบุ';

export interface ServiceBillingRecord {
  id: string;
  monthTab: string;
  monthLabelTh: string;
  monthOrder: number;
  rowNumber: number;
  jobNumber: string;
  callDate: string;
  jobType: string;
  hospitalName: string;
  serialNumber: string;
  engineerName: string;
  warrantyStatus: string;
  revenue: number;
  billingStatus: BillingStatusType;
  rawBillingStatus: string;
  invoice: string;
}

export interface ServiceBillingMonthInfo {
  monthTab: string;
  monthLabelTh: string;
  monthOrder: number;
  gid: string;
  rowCount: number;
}

export interface ServiceBillingDataset {
  source: 'live_google_sheet' | 'snapshot_fallback';
  sheetId: string;
  fetchedAt: string;
  months: ServiceBillingMonthInfo[];
  records: ServiceBillingRecord[];
}

const MONTH_INDEX: Record<string, { num: number; th: string }> = {
  JAN: { num: 1, th: 'ม.ค.' },
  FEB: { num: 2, th: 'ก.พ.' },
  MAR: { num: 3, th: 'มี.ค.' },
  APR: { num: 4, th: 'เม.ย.' },
  MAY: { num: 5, th: 'พ.ค.' },
  JUN: { num: 6, th: 'มิ.ย.' },
  JUL: { num: 7, th: 'ก.ค.' },
  AUG: { num: 8, th: 'ส.ค.' },
  SEP: { num: 9, th: 'ก.ย.' },
  OCT: { num: 10, th: 'ต.ค.' },
  NOV: { num: 11, th: 'พ.ย.' },
  DEC: { num: 12, th: 'ธ.ค.' },
};

export function parseMonthTabMeta(monthTab: string): {
  monthLabelTh: string;
  monthOrder: number;
} {
  const m = /^([A-Za-z]{3})(\d{4})$/.exec(monthTab.trim());
  if (!m) {
    return { monthLabelTh: monthTab, monthOrder: 0 };
  }
  const code = m[1].toUpperCase();
  const year = Number(m[2]);
  const info = MONTH_INDEX[code];
  if (!info) {
    return { monthLabelTh: monthTab, monthOrder: year * 100 };
  }
  return {
    monthLabelTh: `${info.th} ${year}`,
    monthOrder: year * 100 + info.num,
  };
}

export function normalizeBillingStatus(raw: string): BillingStatusType {
  const s = raw.trim();
  if (s === 'วางบิลเรียบร้อยแล้ว') return 'วางบิลเรียบร้อยแล้ว';
  if (s === 'ยังไม่ได้วางบิล') return 'ยังไม่ได้วางบิล';
  return 'ยังไม่ระบุ';
}

export function parseCsvRows(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"' && cleaned[i + 1] === '"') {
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
    } else if (ch === '\r' && cleaned[i + 1] === '\n') {
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

export function parseServiceBillingCsvTab(
  monthTab: string,
  csvText: string
): ServiceBillingRecord[] {
  const matrix = parseCsvRows(csvText);
  if (matrix.length <= 1) return [];

  const { monthLabelTh, monthOrder } = parseMonthTabMeta(monthTab);
  const records: ServiceBillingRecord[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const jobNumber = (r[0] ?? '').trim();
    const callDate = (r[1] ?? '').trim();
    const jobType = (r[4] ?? '').trim();
    const hospitalName = (r[5] ?? '').trim();
    const serialNumber = (r[8] ?? '').trim();
    const engineerName = (r[16] ?? '').trim();
    const warrantyStatus = (r[18] ?? '').trim();
    const revenueRaw = (r[21] ?? '').trim().replace(/,/g, '');
    const revenueNum = Number(revenueRaw);
    const revenue = Number.isFinite(revenueNum) ? revenueNum : 0;

    const rawBillingStatus = (r[30] ?? '').trim();
    const billingStatus = normalizeBillingStatus(rawBillingStatus);
    const invoice = (r[44] ?? '').trim();

    const isPlaceholderHosp = !hospitalName || hospitalName === '-- Select --';
    if (
      isPlaceholderHosp &&
      !serialNumber &&
      revenue === 0 &&
      !invoice &&
      billingStatus === 'ยังไม่ระบุ'
    ) {
      continue;
    }

    records.push({
      id: `${monthTab}-r${i + 1}-${jobNumber || 'nojob'}`,
      monthTab,
      monthLabelTh,
      monthOrder,
      rowNumber: i + 1,
      jobNumber: jobNumber || '-',
      callDate: callDate || '-',
      jobType: jobType === '-- Select --' ? '' : jobType,
      hospitalName: isPlaceholderHosp ? 'ไม่ระบุชื่อโรงพยาบาล' : hospitalName,
      serialNumber: serialNumber || '-',
      engineerName: engineerName || '-',
      warrantyStatus: warrantyStatus || '-',
      revenue,
      billingStatus,
      rawBillingStatus: rawBillingStatus === '-- Select --' ? '' : rawBillingStatus,
      invoice,
    });
  }

  return records;
}
