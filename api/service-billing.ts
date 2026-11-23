const DEFAULT_SERVICE_BILLING_SHEET_ID = '1s2VkerbQ7y0BeHBcdtzkXtsxzn-VR6ZMw2l0p9NCiP8';

const FALLBACK_MONTHLY_TABS: Array<{ name: string; gid: string }> = [
  { name: 'JAN2026', gid: '1849802068' },
  { name: 'FEB2026', gid: '94721365' },
  { name: 'MAR2026', gid: '1451920120' },
  { name: 'APR2026', gid: '1573805226' },
  { name: 'MAY2026', gid: '1297121460' },
  { name: 'JUN2026', gid: '415736045' },
  { name: 'JUL2026', gid: '1809917791' },
  { name: 'AUG2026', gid: '1345706173' },
  { name: 'SEP2026', gid: '886960971' },
  { name: 'OCT2026', gid: '1514520564' },
  { name: 'NOV2026', gid: '1460732511' },
  { name: 'DEC2026', gid: '772693289' },
];

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

interface VercelReq {
  method?: string;
  query?: Record<string, unknown>;
}

interface VercelRes {
  status: (code: number) => { json: (body: unknown) => void };
}

function getValidatedSheetId(rawParam?: unknown): string {
  const candidate =
    typeof rawParam === 'string' && rawParam.trim()
      ? rawParam.trim()
      : DEFAULT_SERVICE_BILLING_SHEET_ID;
  if (/^[a-zA-Z0-9_-]{20,80}$/.test(candidate)) {
    return candidate;
  }
  return DEFAULT_SERVICE_BILLING_SHEET_ID;
}

function parseMonthTabMeta(monthTab: string): { monthLabelTh: string; monthOrder: number } {
  const m = /^([A-Za-z]{3})(\d{4})$/.exec(monthTab.trim());
  if (!m) return { monthLabelTh: monthTab, monthOrder: 0 };
  const code = m[1].toUpperCase();
  const year = Number(m[2]);
  const info = MONTH_INDEX[code];
  if (!info) return { monthLabelTh: monthTab, monthOrder: year * 100 };
  return {
    monthLabelTh: `${info.th} ${year}`,
    monthOrder: year * 100 + info.num,
  };
}

function parseCsvRows(text: string): string[][] {
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

function normalizeBillingStatus(raw: string): 'วางบิลเรียบร้อยแล้ว' | 'ยังไม่ได้วางบิล' | 'ยังไม่ระบุ' {
  const s = raw.trim();
  if (s === 'วางบิลเรียบร้อยแล้ว') return 'วางบิลเรียบร้อยแล้ว';
  if (s === 'ยังไม่ได้วางบิล') return 'ยังไม่ได้วางบิล';
  return 'ยังไม่ระบุ';
}

function parseTabRecords(monthTab: string, csvText: string) {
  const matrix = parseCsvRows(csvText);
  if (matrix.length <= 1) return [];

  const { monthLabelTh, monthOrder } = parseMonthTabMeta(monthTab);
  const records = [];

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const jobNumber = (r[0] ?? '').trim();
    const callDate = (r[1] ?? '').trim();
    const jobType = (r[4] ?? '').trim();
    const hospitalName = (r[5] ?? '').trim();
    const serialNumber = (r[8] ?? '').trim();
    const engineerName = (r[16] ?? '').trim();
    const warrantyStatus = (r[18] ?? '').trim();
    const revenueNum = Number((r[21] ?? '').trim().replace(/,/g, ''));
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

async function discoverMonthlyTabs(sheetId: string): Promise<Array<{ name: string; gid: string }>> {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return FALLBACK_MONTHLY_TABS;
    const html = await res.text();
    const found: Array<{ name: string; gid: string }> = [];
    const re = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:[^,]+,\s*gid:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const name = m[1].trim();
      const gid = m[2].trim();
      if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{4}$/i.test(name)) {
        found.push({ name: name.toUpperCase(), gid });
      }
    }
    return found.length > 0 ? found : FALLBACK_MONTHLY_TABS;
  } catch {
    return FALLBACK_MONTHLY_TABS;
  }
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const sheetId = getValidatedSheetId(req.query?.sheetId);
    const tabs = await discoverMonthlyTabs(sheetId);

    const tabResults = await Promise.all(
      tabs.map(async (tab) => {
        const meta = parseMonthTabMeta(tab.name);
        try {
          const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(
            tab.gid
          )}`;
          const csvRes = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(9000),
          });
          if (!csvRes.ok) {
            return { tab, meta, records: [] };
          }
          const csvText = await csvRes.text();
          if (csvText.trim().startsWith('<')) {
            return { tab, meta, records: [] };
          }
          const records = parseTabRecords(tab.name, csvText);
          return { tab, meta, records };
        } catch {
          return { tab, meta, records: [] };
        }
      })
    );

    const months = tabResults.map(({ tab, meta, records }) => ({
      monthTab: tab.name,
      monthLabelTh: meta.monthLabelTh,
      monthOrder: meta.monthOrder,
      gid: tab.gid,
      rowCount: records.length,
    }));

    const allRecords = tabResults.flatMap((t) => t.records);

    if (allRecords.length === 0) {
      return res.status(502).json({
        ok: false,
        message: 'ไม่สามารถดึงข้อมูลจาก Google Sheet งานวางบิลฝ่าย Service ได้ในขณะนี้',
      });
    }

    return res.status(200).json({
      ok: true,
      source: 'live_google_sheet',
      sheetId,
      fetchedAt: new Date().toISOString(),
      months,
      records: allRecords,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheet';
    return res.status(500).json({ ok: false, message: msg });
  }
}
