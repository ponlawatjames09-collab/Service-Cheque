import {
  isTelegramConfigured,
  sendTelegramNotification,
  validateNotifyBody,
} from '../../server/telegramService';

interface VercelReq {
  method?: string;
  body?: unknown;
}

interface VercelRes {
  status: (code: number) => { json: (body: unknown) => void };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

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
}
