import fs from 'fs';
import path from 'path';

const DEFAULT_AR_SHEET_ID = '1jHQ37JRewyWK9BfJlKRuV-kZ6l1n_8OuPtzBky_7v_I';
const SNAPSHOT_REL_PATH = path.join(
  'public',
  'assets',
  'aistudio',
  '______________Service_8cb1fd98'
);

interface VercelReq {
  method?: string;
  query?: Record<string, unknown>;
}

interface VercelRes {
  status: (code: number) => { json: (body: unknown) => void };
}

function getValidatedWebhookUrl(): string | null {
  const raw = process.env.AR_SHEETS_WEBHOOK_URL?.trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'script.google.com' ||
        parsed.hostname === 'script.googleusercontent.com')
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function getValidatedSheetId(rawParam?: unknown): string {
  const envId = process.env.AR_GOOGLE_SHEET_ID?.trim().replace(/^["']|["']$/g, '');
  const candidate =
    typeof rawParam === 'string' && rawParam.trim()
      ? rawParam.trim()
      : envId || DEFAULT_AR_SHEET_ID;

  if (/^[a-zA-Z0-9_-]{20,80}$/.test(candidate)) {
    return candidate;
  }
  return DEFAULT_AR_SHEET_ID;
}

function looksLikeArCsv(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('<')) return false;
  return (
    trimmed.includes('INV.No') ||
    trimmed.includes('ยอดเงินที่ค้างจ่าย') ||
    trimmed.includes('รายงานลูกหนี้ค้างชำระ')
  );
}

function readLocalSnapshotCsv(): string | null {
  try {
    const fullPath = path.resolve(process.cwd(), SNAPSHOT_REL_PATH);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (looksLikeArCsv(content)) return content;
    }
  } catch {
    // Ignore filesystem unavailable on edge/serverless
  }
  return null;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const sheetId = getValidatedSheetId(req.query?.sheetId);
  const webhookUrl = getValidatedWebhookUrl();

  // 1. Optional Apps Script webhook if configured
  if (webhookUrl) {
    try {
      const hookRes = await fetch(webhookUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
      });
      if (hookRes.ok) {
        const text = await hookRes.text();
        if (looksLikeArCsv(text)) {
          return res.status(200).json({
            ok: true,
            source: 'live_google_sheet',
            sheetAccessible: true,
            sheetId,
            csvText: text,
          });
        }
        try {
          const parsed = JSON.parse(text) as { csvText?: string };
          if (parsed.csvText && looksLikeArCsv(parsed.csvText)) {
            return res.status(200).json({
              ok: true,
              source: 'live_google_sheet',
              sheetAccessible: true,
              sheetId,
              csvText: parsed.csvText,
            });
          }
        } catch {
          // Fall through to Google Sheets CSV export
        }
      }
    } catch {
      // Fall through to Google Sheets CSV export
    }
  }

  // 2. Direct public Google Sheet CSV export
  let sheetHttpStatus = 0;
  try {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const sheetRes = await fetch(exportUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    });
    sheetHttpStatus = sheetRes.status;
    if (sheetRes.ok) {
      const csvText = await sheetRes.text();
      if (looksLikeArCsv(csvText)) {
        return res.status(200).json({
          ok: true,
          source: 'live_google_sheet',
          sheetAccessible: true,
          sheetHttpStatus,
          sheetId,
          csvText,
        });
      }
    }
  } catch {
    // Fall through to snapshot fallback
  }

  // 3. Fallback to bundled sheet snapshot (if sheet is private / HTTP 401)
  const snapshotCsv = readLocalSnapshotCsv();
  if (snapshotCsv) {
    return res.status(200).json({
      ok: true,
      source: 'sheet_snapshot',
      sheetAccessible: false,
      sheetHttpStatus,
      sheetId,
      csvText: snapshotCsv,
    });
  }

  return res.status(200).json({
    ok: true,
    source: 'fallback_required',
    sheetAccessible: false,
    sheetHttpStatus,
    sheetId,
  });
}
