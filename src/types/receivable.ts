export const AR_SHEET_ID = '1jHQ37JRewyWK9BfJlKRuV-kZ6l1n_8OuPtzBky_7v_I';
export const AR_SHEET_EDIT_URL = `https://docs.google.com/spreadsheets/d/${AR_SHEET_ID}/edit`;

export type AgingBucketKey = 'notDue' | 'b60' | 'b90' | 'b120' | 'over120';

export type ReceivableSourceMode =
  | 'live_google_sheet'
  | 'sheet_snapshot'
  | 'uploaded_csv';

export interface ReceivableRecord {
  id: string;
  rowNumber: number;
  dateDisplay: string;
  isoDate: string;
  isDateAnomaly: boolean;
  invoiceNo: string;
  customerName: string;
  invoiceAmount: number;
  outstandingAmount: number;
  paidAmount: number;
  notDueAmount: number;
  bucket60: number;
  bucket90: number;
  bucket120: number;
  bucketOver120: number;
  overdueAmount: number;
  primaryBucket: AgingBucketKey;
  ownerName: string;
  canonicalOwner: string;
  zoneGroup: string;
}

export interface ReceivableAdjustment {
  label: string;
  amount: number;
}

export interface ReceivableFooterMeta {
  reportTitle: string;
  updateDate: string;
  reportedInvoiceTotal?: number;
  reportedOutstandingTotal?: number;
  diffAmount?: number;
  adjustments: ReceivableAdjustment[];
  adjustedTotal?: number;
}

export interface ReceivablesDataset {
  source: ReceivableSourceMode;
  sheetAccessible: boolean;
  sheetHttpStatus?: number;
  meta: ReceivableFooterMeta;
  records: ReceivableRecord[];
}

export interface AgingBucketMeta {
  key: AgingBucketKey;
  label: string;
  shortLabel: string;
  textClass: string;
  barClass: string;
  surfaceClass: string;
  borderClass: string;
  severity: number;
}

export const AGING_BUCKET_META: Record<AgingBucketKey, AgingBucketMeta> = {
  notDue: {
    key: 'notDue',
    label: 'ยังไม่ถึงกำหนดชำระ',
    shortLabel: 'ยังไม่ถึงกำหนด',
    textClass: 'text-teal-800',
    barClass: 'bg-teal-600',
    surfaceClass: 'bg-teal-50/70',
    borderClass: 'border-teal-200',
    severity: 0,
  },
  b60: {
    key: 'b60',
    label: 'ค้างภายใน 60 วัน',
    shortLabel: 'ภายใน 60 วัน',
    textClass: 'text-sky-800',
    barClass: 'bg-sky-500',
    surfaceClass: 'bg-sky-50/70',
    borderClass: 'border-sky-200',
    severity: 1,
  },
  b90: {
    key: 'b90',
    label: 'ค้างภายใน 90 วัน',
    shortLabel: 'ภายใน 90 วัน',
    textClass: 'text-amber-800',
    barClass: 'bg-amber-500',
    surfaceClass: 'bg-amber-50/70',
    borderClass: 'border-amber-200',
    severity: 2,
  },
  b120: {
    key: 'b120',
    label: 'ค้างภายใน 120 วัน',
    shortLabel: 'ภายใน 120 วัน',
    textClass: 'text-orange-800',
    barClass: 'bg-orange-500',
    surfaceClass: 'bg-orange-50/70',
    borderClass: 'border-orange-200',
    severity: 3,
  },
  over120: {
    key: 'over120',
    label: 'เกิน 120 วัน (วิกฤต)',
    shortLabel: 'เกิน 120 วัน',
    textClass: 'text-rose-800',
    barClass: 'bg-rose-600',
    surfaceClass: 'bg-rose-50/70',
    borderClass: 'border-rose-200',
    severity: 4,
  },
};

export const AGING_BUCKET_ORDER: AgingBucketKey[] = [
  'notDue',
  'b60',
  'b90',
  'b120',
  'over120',
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatTHB(amount: number): string {
  return (Number(amount) || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactTHB(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}K`;
  }
  return formatTHB(amount);
}

export function parseCsvMatrix(text: string): string[][] {
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

function parseAmountCell(raw: unknown): number {
  const text = String(raw ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/฿/g, '');
  if (!text || text === '-' || text === '--') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? round2(n) : 0;
}

function parseThaiSlashDate(raw: string): {
  dateDisplay: string;
  isoDate: string;
  isDateAnomaly: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { dateDisplay: '-', isoDate: '', isDateAnomaly: true };
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = Number(slash[3]);
    if (year > 2400) year -= 543;
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const beYear = year + 543;
    return {
      dateDisplay: `${dd}/${mm}/${beYear}`,
      isoDate: `${year}-${mm}-${dd}`,
      isDateAnomaly: false,
    };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return {
      dateDisplay: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`,
      isoDate: trimmed,
      isDateAnomaly: false,
    };
  }

  return {
    dateDisplay: trimmed,
    isoDate: '',
    isDateAnomaly: true,
  };
}

export function normalizeOwnerDisplayName(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (!clean) return 'ไม่ระบุผู้รับผิดชอบ';
  const aliasMap: Record<string, string> = {
    ชญานิศา: 'ชญาณิศา',
    ณัฏฐนิชา: 'ณัฏฐณิชา',
  };
  return aliasMap[clean] ?? clean;
}

function resolvePrimaryBucket(
  notDue: number,
  b60: number,
  b90: number,
  b120: number,
  over120: number
): AgingBucketKey {
  if (over120 > 0) return 'over120';
  if (b120 > 0) return 'b120';
  if (b90 > 0) return 'b90';
  if (b60 > 0) return 'b60';
  if (notDue > 0) return 'notDue';
  return 'notDue';
}

export function parseReceivablesCsv(csvText: string): {
  meta: ReceivableFooterMeta;
  records: ReceivableRecord[];
} {
  const matrix = parseCsvMatrix(csvText);

  let reportTitle = 'รายงานลูกหนี้ค้างชำระ';
  let updateDate = '';
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i] ?? [];
    const joined = row.join(' ');
    if (i === 0 && row[0]?.trim()) {
      reportTitle = row[0].trim();
      const kCell = row.find((c, idx) => idx >= 8 && /\d{1,2}\/\d{1,2}\/\d{4}/.test(c.trim()));
      if (kCell) updateDate = kCell.trim();
    }
    if (
      joined.includes('INV.No') ||
      (joined.includes('รพ./บจก.') && joined.includes('ยอดเงินที่ค้างจ่าย'))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 3;
  const records: ReceivableRecord[] = [];
  const meta: ReceivableFooterMeta = {
    reportTitle,
    updateDate,
    adjustments: [],
  };

  let inFooterSection = false;

  for (let i = startIdx; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const colA = (r[0] ?? '').trim();
    const colB = (r[1] ?? '').trim();
    const colC = (r[2] ?? '').trim();
    const colD = (r[3] ?? '').trim();
    const colE = (r[4] ?? '').trim();

    if (!colA && !colB && !colC && !colD && !colE) {
      continue;
    }

    // Detect footer summary header line (col D = ยอดเงินค่าสินค้า, col E = ยอดเงินที่ค้างจ่าย)
    if (
      !colB &&
      (colD.includes('ยอดเงินค่าสินค้า') || colE.includes('ยอดเงินที่ค้างจ่าย'))
    ) {
      inFooterSection = true;
      continue;
    }

    if (inFooterSection) {
      if (colD === 'Diff') {
        meta.diffAmount = parseAmountCell(colE);
        continue;
      }
      if (!colC && colD && colE && meta.reportedInvoiceTotal === undefined) {
        meta.reportedInvoiceTotal = parseAmountCell(colD);
        meta.reportedOutstandingTotal = parseAmountCell(colE);
        continue;
      }
      if (!colD && colE && meta.reportedOutstandingTotal !== undefined && meta.adjustments.length === 0) {
        const val = parseAmountCell(colE);
        if (Math.abs(val - meta.reportedOutstandingTotal) < 0.01) {
          continue;
        }
      }
      if (colD && colE) {
        meta.adjustments.push({
          label: colD.trim(),
          amount: parseAmountCell(colE),
        });
        continue;
      }
      if (!colD && colE) {
        const val = parseAmountCell(colE);
        if (val < 0) {
          meta.adjustments.push({
            label: 'รายการปรับปรุงยอดเพิ่มเติม',
            amount: val,
          });
        } else if (val > 0) {
          meta.adjustedTotal = val;
        }
      }
      continue;
    }

    if (!colB && !colC) continue;

    const invoiceAmount = parseAmountCell(r[3]);
    const outstandingAmount = parseAmountCell(r[4]);
    const notDueAmount = parseAmountCell(r[5]);
    const bucket60 = parseAmountCell(r[6]);
    const bucket90 = parseAmountCell(r[7]);
    const bucket120 = parseAmountCell(r[8]);
    const bucketOver120 = parseAmountCell(r[9]);
    const overdueAmount = round2(bucket60 + bucket90 + bucket120 + bucketOver120);
    const paidAmount = Math.max(0, round2(invoiceAmount - outstandingAmount));

    const { dateDisplay, isoDate, isDateAnomaly } = parseThaiSlashDate(colA);
    const ownerName = (r[11] ?? '').trim() || 'ไม่ระบุผู้รับผิดชอบ';
    const zoneGroup = (r[12] ?? '').trim() || 'ไม่ระบุเขต';

    records.push({
      id: `ar-row-${i + 1}-${colB || 'noinv'}`,
      rowNumber: i + 1,
      dateDisplay,
      isoDate,
      isDateAnomaly,
      invoiceNo: colB || '-',
      customerName: colC.replace(/\s+/g, ' ') || 'ไม่ระบุชื่อลูกค้า',
      invoiceAmount,
      outstandingAmount,
      paidAmount,
      notDueAmount,
      bucket60,
      bucket90,
      bucket120,
      bucketOver120,
      overdueAmount,
      primaryBucket: resolvePrimaryBucket(
        notDueAmount,
        bucket60,
        bucket90,
        bucket120,
        bucketOver120
      ),
      ownerName,
      canonicalOwner: normalizeOwnerDisplayName(ownerName),
      zoneGroup,
    });
  }

  return { meta, records };
}
