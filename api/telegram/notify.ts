interface VercelReq {
  method?: string;
  body?: unknown;
}

interface VercelRes {
  status: (code: number) => { json: (body: unknown) => void };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeField(value: unknown, maxLen = 200): string {
  const str = String(value ?? '').trim();
  return str ? escapeHtml(str.slice(0, maxLen)) : '-';
}

function formatAmount(amount: unknown): string {
  const num = typeof amount === 'number' ? amount : Number(String(amount ?? '').replace(/,/g, ''));
  if (!Number.isFinite(num)) return escapeHtml(amount || '0');
  return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'Method not allowed' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, '');
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim().replace(/^["']|["']$/g, '');

    const body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as Record<string, unknown>)
        : req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : null;

    if (!body) {
      return res.status(400).json({ ok: false, configured: Boolean(botToken && chatId), message: 'Invalid body' });
    }

    const action = body.action;
    if (action !== 'create' && action !== 'update_status' && action !== 'resend') {
      return res.status(400).json({ ok: false, configured: Boolean(botToken && chatId), message: 'Invalid action' });
    }

    const rec = body.record && typeof body.record === 'object' ? (body.record as Record<string, unknown>) : null;
    if (!rec || !String(rec.customerName ?? '').trim() || !String(rec.invoice ?? '').trim()) {
      return res.status(400).json({ ok: false, configured: Boolean(botToken && chatId), message: 'Missing invoice or customerName' });
    }

    if (!botToken || !chatId) {
      return res.status(200).json({
        ok: false,
        configured: false,
        message: 'ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN และ TELEGRAM_CHAT_ID บนเซิร์ฟเวอร์',
      });
    }

    let header = '🔔 <b>แจ้งเตือนรายการรับเช็ค</b>';
    if (action === 'create') header = '🆕 <b>บันทึกรายการรับเช็คใหม่</b>';
    else if (action === 'update_status') header = '🔄 <b>อัปเดตสถานะการรับเช็ค</b>';

    const previousStatus = typeof body.previousStatus === 'string' ? body.previousStatus : undefined;
    const lines = [
      header,
      '',
      `📅 <b>วันที่:</b> ${sanitizeField(rec.date, 40)}`,
      `🧾 <b>Invoice:</b> <code>${sanitizeField(rec.invoice, 80)}</code>`,
      `🏢 <b>ชื่อลูกค้า:</b> ${sanitizeField(rec.customerName, 160)}`,
      `🔧 <b>S:</b> ${sanitizeField(rec.sCode, 60)}`,
      `💰 <b>ยอดเงิน:</b> <b>${formatAmount(rec.amount)} บาท</b>`,
      `📍 <b>ผู้รับผิดชอบเขต:</b> ${sanitizeField(rec.zoneOwner, 60)}`,
      `👷 <b>ช่างผู้รับผิดชอบ:</b> ${sanitizeField(rec.technician, 80)}`,
      action === 'update_status' && previousStatus
        ? `📊 <b>สถานะ:</b> ${sanitizeField(previousStatus, 60)} ➜ <b>${sanitizeField(rec.status, 60)}</b>`
        : `📊 <b>สถานะ:</b> <b>${sanitizeField(rec.status, 60)}</b>`,
    ];

    const remark = String(rec.remark ?? '').trim();
    if (remark) {
      lines.push(`📝 <b>Remark:</b> ${sanitizeField(remark, 300)}`);
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const raw = await tgRes.text();
    let parsed: { ok?: boolean; description?: string } = {};
    try {
      parsed = JSON.parse(raw) as { ok?: boolean; description?: string };
    } catch {
      parsed = {};
    }
    if (!tgRes.ok || !parsed.ok) {
      return res.status(502).json({
        ok: false,
        configured: true,
        message: parsed.description
          ? `ส่งข้อความ Telegram ไม่สำเร็จ (${parsed.description})`
          : 'ส่งข้อความไปยัง Telegram ไม่สำเร็จ กรุณาตรวจสอบ Token หรือ Chat ID บนเซิร์ฟเวอร์',
      });
    }

    return res.status(200).json({
      ok: true,
      configured: true,
      message: 'ส่งแจ้งเตือนผ่าน Telegram เรียบร้อยแล้ว',
    });
  } catch {
    return res.status(500).json({
      ok: false,
      configured: true,
      message: 'ไม่สามารถเชื่อมต่อ Telegram API ได้ในขณะนี้',
    });
  }
}
