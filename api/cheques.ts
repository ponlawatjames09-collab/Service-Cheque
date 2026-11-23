import {
  createChequeRecord,
  listChequeRecords,
  updateChequeRecord,
  validateChequeInput,
  validateChequePatch,
} from './_lib/chequeStore.js';
import { sendTelegramNotification } from './_lib/telegramService.js';

interface VercelReq {
  method?: string;
  body?: unknown;
}

interface VercelRes {
  status: (code: number) => { json: (body: unknown) => void };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method === 'GET') {
      try {
        const result = await listChequeRecords();
        return res.status(200).json({ ok: true, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้';
        return res.status(502).json({ ok: false, message: msg });
      }
    }

    if (req.method === 'POST') {
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
    }

    if (req.method === 'PATCH') {
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
        return res.status(200).json({ ok: true, record, telegram });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'ไม่สามารถอัปเดตข้อมูลได้';
        return res.status(502).json({ ok: false, message: msg });
      }
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ ok: false, message: msg });
  }
}
