export const ZONE_OWNERS = ['โอ', 'ลูกกอล์ฟ'] as const;
export type ZoneOwner = (typeof ZONE_OWNERS)[number];

export const CHEQUE_STATUSES = [
  'รอรับเช็ค',
  'รับเช็คแล้ว',
  'นำฝากแล้ว',
  'เข้าบัญชีแล้ว',
  'เลื่อนรับเช็ค',
  'เช็คมีปัญหา / ยกเลิก',
  'กำลังดำเนินการติดตาม',
  'รอลดหนี้ในระบบ',
  'ติดตามวางบิลใหม่',
  'รอแก้ไขเอกสารเพิ่มเติม',
  'อื่นๆ',
] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

export const TECHNICIANS = [
  'รวิ สวัสดี',
  'พลวัฒน์ โพธิ์ผลัด',
  'ศราวุฒิ ศรีเรือง',
  'ปริญญา บุญแก้วอมร',
  'ณกัญจน์ กลมทุกสิ่ง',
  'สวัสดิพงษ์ เมฆเคลื่อน',
  'วรวุฒิ หมู่โสภณ',
  'อับดุลอารีฟ อาแว',
  'กรกฎ แก้วมุงคุณ',
  'ภาณุวัฒน์ วงษ์ศิริ',
  'จตุรวิทย์ ต้นสวรรค์',
  'รัชพล จัทรศุข',
] as const;
export type TechnicianName = (typeof TECHNICIANS)[number];

export const SHEET_HEADERS = [
  'วันที่',
  'Invoice',
  'ชื่อลูกค้า',
  'S',
  'ยอดเงิน',
  'Remark',
  'ผู้รับผิดชอบเขต',
  'สถานะ',
  'ช่างผู้รับผิดชอบ',
] as const;

export interface ChequeRecord {
  id: string;
  rowNumber?: number;
  date: string;
  invoice: string;
  customerName: string;
  sCode: string;
  amount: number;
  remark: string;
  zoneOwner: ZoneOwner;
  status: ChequeStatus;
  technician: string;
  syncedToSheet: boolean;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
}

export interface SheetConnection {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetName: string;
  availableTabs: SheetTabInfo[];
}

export function getTodayBangkokISO(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

export function formatThaiDate(isoDate: string): string {
  if (!isoDate) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const [, y, m, d] = match;
  const thaiMonths = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.',
  ];
  const monthIdx = Number(m) - 1;
  const thaiYear = Number(y) + 543;
  return `${Number(d)} ${thaiMonths[monthIdx] ?? m} ${String(thaiYear).slice(-2)}`;
}

export function formatCurrencyTHB(amount: number): string {
  return amount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isCollectedStatus(status: string): boolean {
  return status === 'รับเช็คแล้ว' || status === 'นำฝากแล้ว' || status === 'เข้าบัญชีแล้ว';
}

export function isIssueStatus(status: string): boolean {
  return status === 'เลื่อนรับเช็ค' || status === 'เช็คมีปัญหา / ยกเลิก';
}
