# Service Cheque Tracker

ระบบติดตามการรับเช็ค สรุปยอดรายวัน ใช้งานได้ทันทีโดยไม่ต้อง Login พร้อมซิงค์ Google Sheets และแจ้งเตือนผ่าน Telegram ทันที

## โครงสร้างคอลัมน์ Google Sheet (A–I)

| คอลัมน์ | หัวข้อ | รายละเอียด |
| --- | --- | --- |
| A | วันที่ | วันที่รับเช็ค / นัดรับเช็ค (`YYYY-MM-DD`) |
| B | Invoice | เลขที่ใบแจ้งหนี้ |
| C | ชื่อลูกค้า | ชื่อบริษัท / ชื่อลูกค้า |
| D | S | รหัส Service |
| E | ยอดเงิน | จำนวนเงิน (บาท) |
| F | Remark | หมายเหตุ / เลขเช็ค / ธนาคาร |
| G | ผู้รับผิดชอบเขต | `โอ`, `ลูกกอล์ฟ` |
| H | สถานะ | `รอรับเช็ค`, `รับเช็คแล้ว`, `นำฝากแล้ว`, `เข้าบัญชีแล้ว`, `เลื่อนรับเช็ค`, `เช็คมีปัญหา / ยกเลิก` |
| I | ช่างที่รับผิดชอบ | รายชื่อช่าง 12 ท่าน |

## การเชื่อมต่อ Google Sheets (ไม่ต้องให้ผู้ใช้ Login)

1. เปิด Google Sheet ของคุณ แล้วไปที่ **Extensions → Apps Script**
2. คัดลอกโค้ด Apps Script จากหน้า **"เชื่อมต่อระบบ"** ในแอปไปวางและ Deploy เป็น Web App (`Execute as: Me`, `Who has access: Anyone`)
3. นำ Web App URL ไปตั้งค่าเป็น `GOOGLE_SHEETS_WEBHOOK_URL` ใน Environment Variables

## การ Deploy ขึ้น GitHub และ Vercel

1. **Push โค้ดขึ้น GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Service Cheque Tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Import โปรเจกต์ใน Vercel**
   - เข้าไปที่ [vercel.com/new](https://vercel.com/new) และเลือก Repository จาก GitHub
   - Framework Preset: **Vite** (อ่านค่า Build & Rewrite จาก `vercel.json` อัตโนมัติ)

3. **ตั้งค่า Environment Variables ใน Vercel**
   ไปที่ **Settings → Environment Variables** แล้วเพิ่มค่าต่อไปนี้:
   - `TELEGRAM_BOT_TOKEN` — Token ของ Telegram Bot
   - `TELEGRAM_CHAT_ID` — Chat ID ของกลุ่มหรือห้องแชทปลายทาง
   - `GOOGLE_SHEETS_WEBHOOK_URL` — Web App URL จาก Google Apps Script เพื่อซิงค์ตรงเข้า Google Sheet
