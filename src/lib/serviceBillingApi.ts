import {
  parseMonthTabMeta,
  parseServiceBillingCsvTab,
  SERVICE_BILLING_SHEET_ID,
  ServiceBillingDataset,
} from '../types/serviceBilling';

const FALLBACK_JAN_SNAPSHOT_URL = '/assets/aistudio/_FR-SV-04__Rev_0ee3f407.00';

export async function fetchServiceBillingDataset(): Promise<ServiceBillingDataset> {
  try {
    const res = await fetch(
      `/api/service-billing?sheetId=${encodeURIComponent(SERVICE_BILLING_SHEET_ID)}&_t=${Date.now()}`
    );
    const rawText = await res.text();
    if (res.ok && rawText.trim()) {
      const data = JSON.parse(rawText) as {
        ok?: boolean;
        source?: 'live_google_sheet';
        sheetId?: string;
        fetchedAt?: string;
        months?: ServiceBillingDataset['months'];
        records?: ServiceBillingDataset['records'];
        message?: string;
      };
      if (data.ok && Array.isArray(data.records) && data.records.length > 0) {
        return {
          source: 'live_google_sheet',
          sheetId: data.sheetId || SERVICE_BILLING_SHEET_ID,
          fetchedAt: data.fetchedAt || new Date().toISOString(),
          months: data.months ?? [],
          records: data.records,
        };
      }
    }
  } catch {
    // Fall through to local JAN2026 snapshot if offline
  }

  const snapRes = await fetch(FALLBACK_JAN_SNAPSHOT_URL);
  if (!snapRes.ok) {
    throw new Error('ไม่สามารถโหลดข้อมูลงานวางบิลฝ่าย Service ได้');
  }
  const csvText = await snapRes.text();
  const records = parseServiceBillingCsvTab('JAN2026', csvText);
  const meta = parseMonthTabMeta('JAN2026');
  return {
    source: 'snapshot_fallback',
    sheetId: SERVICE_BILLING_SHEET_ID,
    fetchedAt: new Date().toISOString(),
    months: [
      {
        monthTab: 'JAN2026',
        monthLabelTh: meta.monthLabelTh,
        monthOrder: meta.monthOrder,
        gid: '1849802068',
        rowCount: records.length,
      },
    ],
    records,
  };
}
