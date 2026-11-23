export default function handler(
  _req: { method?: string },
  res: { status: (code: number) => { json: (body: unknown) => void } }
) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, '');
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim().replace(/^["']|["']$/g, '');

  return res.status(200).json({
    ok: true,
    telegramConfigured: Boolean(token && chatId),
    googleSheetWebhookConfigured: true,
  });
}
