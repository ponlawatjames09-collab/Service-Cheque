import { isGoogleSheetsWebhookConfigured } from './_lib/chequeStore.js';
import { isTelegramConfigured } from './_lib/telegramService.js';

export default function handler(
  _req: { method?: string },
  res: { status: (code: number) => { json: (body: unknown) => void } }
) {
  try {
    return res.status(200).json({
      ok: true,
      telegramConfigured: isTelegramConfigured(),
      googleSheetWebhookConfigured: isGoogleSheetsWebhookConfigured(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Health check failed';
    return res.status(500).json({ ok: false, message: msg });
  }
}
