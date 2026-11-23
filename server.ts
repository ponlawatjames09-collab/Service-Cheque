import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  bulkImportLocalRecords,
  createChequeRecord,
  fetchPublicGoogleSheetRecords,
  isGoogleSheetsWebhookConfigured,
  listChequeRecords,
  parseSheetCsvToRecords,
  updateChequeRecord,
  validateChequeInput,
  validateChequePatch,
} from './api/_lib/chequeStore.js';
import {
  isTelegramConfigured,
  sendTelegramNotification,
  validateNotifyBody,
} from './api/_lib/telegramService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      telegramConfigured: isTelegramConfigured(),
      googleSheetWebhookConfigured: isGoogleSheetsWebhookConfigured(),
    });
  });

  app.get('/api/cheques', async (_req, res) => {
    try {
      const result = await listChequeRecords();
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้';
      res.status(502).json({ ok: false, message: msg });
    }
  });

  app.post('/api/cheques', async (req, res) => {
    const validation = validateChequeInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, message: validation.error });
    }

    try {
      const record = await createChequeRecord(validation.data);
      const telegram = await sendTelegramNotification({
        action: 'create',
        record,
      });
      return res.status(201).json({ ok: true, record, telegram });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้';
      return res.status(502).json({ ok: false, message: msg });
    }
  });

  app.patch('/api/cheques', async (req, res) => {
    const validation = validateChequePatch(req.body);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, message: validation.error });
    }

    try {
      const snapshot =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : undefined;
      const { previousStatus, record } = await updateChequeRecord(
        validation.id,
        validation.patch,
        validation.rowNumber,
        snapshot
      );
      const telegram = await sendTelegramNotification({
        action: 'update_status',
        previousStatus:
          typeof snapshot?.previousStatus === 'string'
            ? snapshot.previousStatus
            : previousStatus,
        record,
      });
      return res.json({ ok: true, record, telegram });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถอัปเดตข้อมูลได้';
      return res.status(502).json({ ok: false, message: msg });
    }
  });

  app.post('/api/import-sheet', async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;

      if (typeof body.sheetUrlOrId === 'string' && body.sheetUrlOrId.trim()) {
        const sheetRecords = await fetchPublicGoogleSheetRecords(body.sheetUrlOrId);
        const merged = await bulkImportLocalRecords(sheetRecords);
        return res.json({
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
        return res.json({
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
  });

  app.post('/api/telegram/notify', async (req, res) => {
    const validation = validateNotifyBody(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        configured: isTelegramConfigured(),
        message: validation.error,
      });
    }

    const result = await sendTelegramNotification(validation.data);
    return res.status(result.ok ? 200 : result.configured ? 502 : 200).json(result);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
