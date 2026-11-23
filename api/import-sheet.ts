import {
  bulkImportLocalRecords,
  fetchPublicGoogleSheetRecords,
  parseSheetCsvToRecords,
} from './_lib/chequeStore.js';

interface VercelReq {
  method?: string;
  body?: unknown;
}

interface VercelRes {
  status: (code: number) => { json: (body: unknown) => void };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'Method not allowed' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;

    if (typeof body.sheetUrlOrId === 'string' && body.sheetUrlOrId.trim()) {
      const sheetRecords = await fetchPublicGoogleSheetRecords(body.sheetUrlOrId);
      const merged = await bulkImportLocalRecords(sheetRecords);
      return res.status(200).json({
        ok: true,
        importedCount: sheetRecords.length,
        records: merged,
      });
    }

    if (typeof body.csvText === 'string' && body.csvText.trim()) {
      const csvRecords = parseSheetCsvToRecords(body.csvText);
      if (csvRecords.length === 0) {
        return res.status(400).json({
          ok: false,
          message: 'ไม่พบแถวข้อมูลในไฟล์ CSV',
        });
      }
      const merged = await bulkImportLocalRecords(csvRecords);
      return res.status(200).json({
        ok: true,
        importedCount: csvRecords.length,
        records: merged,
      });
    }

    return res.status(400).json({
      ok: false,
      message: 'กรุณาระบุลิงก์ Google Sheet หรือไฟล์ CSV',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'นำเข้าข้อมูลไม่สำเร็จ';
    return res.status(502).json({ ok: false, message: msg });
  }
}
