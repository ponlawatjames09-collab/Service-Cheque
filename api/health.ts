import { isGoogleSheetsWebhookConfigured } from '../server/chequeStore';
import { isTelegramConfigured } from '../server/telegramService';

export default function handler(
  _req: { method?: string },
  res: { status: (code: number) => { json: (body: unknown) => void } }
) {
  res.status(200).json({
    ok: true,
    telegramConfigured: isTelegramConfigured(),
    googleSheetWebhookConfigured: isGoogleSheetsWebhookConfigured(),
  });
}
