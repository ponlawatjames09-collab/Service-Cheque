import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileEdit,
  FileMinus2,
  FileText,
  Hourglass,
  Landmark,
  MoreHorizontal,
} from 'lucide-react';
import { ChequeStatus } from '../types/cheque';

export function getStatusVisual(status: ChequeStatus | string) {
  switch (status) {
    case 'เข้าบัญชีแล้ว':
      return {
        textClass: 'text-emerald-700',
        barClass: 'bg-emerald-600',
        Icon: CheckCircle2,
      };
    case 'รับเช็คแล้ว':
      return {
        textClass: 'text-teal-700',
        barClass: 'bg-teal-600',
        Icon: Banknote,
      };
    case 'นำฝากแล้ว':
      return {
        textClass: 'text-sky-700',
        barClass: 'bg-sky-600',
        Icon: Landmark,
      };
    case 'เลื่อนรับเช็ค':
      return {
        textClass: 'text-amber-700',
        barClass: 'bg-amber-500',
        Icon: CalendarClock,
      };
    case 'เช็คมีปัญหา / ยกเลิก':
      return {
        textClass: 'text-rose-700',
        barClass: 'bg-rose-600',
        Icon: AlertTriangle,
      };
    case 'กำลังดำเนินการติดตาม':
      return {
        textClass: 'text-sky-700',
        barClass: 'bg-sky-500',
        Icon: Hourglass,
      };
    case 'รอลดหนี้ในระบบ':
      return {
        textClass: 'text-amber-700',
        barClass: 'bg-amber-500',
        Icon: FileMinus2,
      };
    case 'ติดตามวางบิลใหม่':
      return {
        textClass: 'text-indigo-700',
        barClass: 'bg-indigo-600',
        Icon: FileText,
      };
    case 'รอแก้ไขเอกสารเพิ่มเติม':
      return {
        textClass: 'text-orange-700',
        barClass: 'bg-orange-500',
        Icon: FileEdit,
      };
    case 'อื่นๆ':
      return {
        textClass: 'text-slate-700',
        barClass: 'bg-slate-500',
        Icon: MoreHorizontal,
      };
    case 'รอรับเช็ค':
    default:
      return {
        textClass: 'text-amber-700',
        barClass: 'bg-amber-500',
        Icon: Clock,
      };
  }
}

export function StatusInlineLabel({ status }: { status: ChequeStatus | string }) {
  const { textClass, Icon } = getStatusVisual(status);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${textClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
