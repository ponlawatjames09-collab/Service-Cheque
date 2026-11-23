import { useState } from 'react';
import { Check, Copy, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { StorageMode } from '../lib/chequeApi';

interface SheetsConnectionPanelProps {
  storageMode: StorageMode;
  googleSheetWebhookConfigured: boolean;
  telegramConfigured: boolean | null;
  isSyncing: boolean;
  onSyncNow: () => Promise<void>;
}

const APPS_SCRIPT_SNIPPET = `function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0] && !row[1] && !row[2]) continue;
    var dateVal = row[0] instanceof Date
      ? Utilities.formatDate(row[0], 'Asia/Bangkok', 'yyyy-MM-dd')
      : String(row[0] || '');
    records.push({
      id: 'sheet-row-' + (i + 1),
      rowNumber: i + 1,
      date: dateVal,
      invoice: String(row[1] || ''),
      customerName: String(row[2] || ''),
      sCode: String(row[3] || ''),
      amount: Number(row[4] || 0),
      remark: String(row[5] || ''),
      zoneOwner: String(row[6] || 'โอ'),
      status: String(row[7] || 'รอรับเช็ค'),
      technician: String(row[8] || '')
    });
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, records: records }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var payload = JSON.parse(e.postData.contents);

  if (payload.action === 'create') {
    var r = payload.record;
    sheet.appendRow([
      r.date, r.invoice, r.customerName, r.sCode,
      Number(r.amount), r.remark, r.zoneOwner, r.status, r.technician
    ]);
    var rowNumber = sheet.getLastRow();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, rowNumber: rowNumber }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (payload.action === 'update') {
    var rowNum = Number(payload.rowNumber);
    if (!rowNum || rowNum < 2) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid rowNumber' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var patch = payload.patch || {};
    var prevStatus = String(sheet.getRange(rowNum, 8).getValue() || '');
    if (patch.remark !== undefined) sheet.getRange(rowNum, 6).setValue(patch.remark);
    if (patch.zoneOwner !== undefined) sheet.getRange(rowNum, 7).setValue(patch.zoneOwner);
    if (patch.status !== undefined) sheet.getRange(rowNum, 8).setValue(patch.status);
    if (patch.technician !== undefined) sheet.getRange(rowNum, 9).setValue(patch.technician);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, previousStatus: prevStatus }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export function SheetsConnectionPanel({
  storageMode,
  googleSheetWebhookConfigured,
  telegramConfigured,
  isSyncing,
  onSyncNow,
}: SheetsConnectionPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  return (
    <div className="space-y-5">
      {/* Direct Access & Storage Status */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                เชื่อมต่อ Google Sheets อัตโนมัติ (ไม่ต้อง Login)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                ทีมงานและช่างทุกคนสามารถเปิดเว็บและบันทึกข้อมูลได้ทันทีโดยไม่ต้องลงชื่อเข้าใช้ Google
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'กำลังซิงค์...' : 'รีเฟรชข้อมูลล่าสุด'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">โหมดจัดเก็บข้อมูลปัจจุบัน</span>
              <span
                className={`font-semibold ${
                  googleSheetWebhookConfigured ? 'text-emerald-700' : 'text-teal-700'
                }`}
              >
                {storageMode === 'google_sheet_webhook'
                  ? 'เชื่อมต่อ Google Sheet Webhook แล้ว'
                  : 'ฐานข้อมูลเซิร์ฟเวอร์ (พร้อมใช้งานทันที)'}
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {googleSheetWebhookConfigured
                ? 'ทุกรายการที่บันทึกและอัปเดตสถานะถูกซิงค์ตรงเข้า Google Sheet ของคุณโดยอัตโนมัติ'
                : 'ระบบกำลังบันทึกข้อมูลบนเซิร์ฟเวอร์โดยไม่ต้อง Login หากต้องการให้ซิงค์ตรงเข้า Google Sheet ของคุณ สามารถติดตั้ง Apps Script ด้านล่างและตั้งค่า GOOGLE_SHEETS_WEBHOOK_URL ได้ทันที'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">สถานะแจ้งเตือน Telegram</span>
              <span
                className={`font-semibold ${
                  telegramConfigured ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {telegramConfigured === null
                  ? 'กำลังตรวจสอบ...'
                  : telegramConfigured
                  ? 'พร้อมส่งแจ้งเตือนทันที'
                  : 'รอตั้งค่า Environment Variables'}
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              ตั้งค่า <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">TELEGRAM_BOT_TOKEN</code> และ{' '}
              <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">TELEGRAM_CHAT_ID</code> ใน Secrets / Vercel Environment Variables เพื่อส่งข้อความเข้ากลุ่มทันที
            </p>
          </div>
        </div>
      </section>

      {/* Apps Script Bridge Guide (Zero User Login) */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              วิธีเชื่อม Google Sheet แบบไม่ต้องให้ผู้ใช้ Login (Apps Script)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              เจ้าของ Sheet วางโค้ดนี้ครั้งเดียวใน Google Sheet แล้วนำ Web App URL มาใส่ใน <code className="font-mono">GOOGLE_SHEETS_WEBHOOK_URL</code>
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyScript}
            className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100/70 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'คัดลอกโค้ดแล้ว' : 'คัดลอกโค้ด Apps Script'}</span>
          </button>
        </div>

        <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700 leading-relaxed">
          <li>เปิด Google Sheet ของคุณ (คอลัมน์ A–I: วันที่, Invoice, ชื่อลูกค้า, S, ยอดเงิน, Remark, ผู้รับผิดชอบเขต, สถานะ, ช่างที่รับผิดชอบ)</li>
          <li>ไปที่เมนู <strong>ส่วนขยาย (Extensions) → Apps Script</strong> แล้ววางโค้ดด้านล่างลงไป</li>
          <li>กด <strong>Deploy → New deployment → Web app</strong> เลือก Execute as: <strong>Me</strong> และ Who has access: <strong>Anyone</strong></li>
          <li>นำ URL ที่ได้ไปตั้งค่าเป็น <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">GOOGLE_SHEETS_WEBHOOK_URL</code> ใน AI Studio Secrets หรือ Vercel Environment Variables</li>
        </ol>

        <pre className="rounded-lg border border-slate-200 bg-slate-900 text-slate-100 p-4 text-[11px] font-mono overflow-x-auto max-h-64 leading-relaxed">
          <code>{APPS_SCRIPT_SNIPPET}</code>
        </pre>

        <div className="pt-2 border-t border-slate-100 text-xs text-slate-600">
          <strong className="text-slate-900">Deploy ขึ้น GitHub & Vercel:</strong>{' '}
          โปรเจกต์รองรับ Vercel Serverless Functions (<code className="font-mono">api/cheques.ts</code> และ <code className="font-mono">api/telegram/notify.ts</code>) พร้อม <code className="font-mono">vercel.json</code> สามารถ Push ขึ้น GitHub และ Import เข้า Vercel ได้ทันที
        </div>
      </section>
    </div>
  );
}
