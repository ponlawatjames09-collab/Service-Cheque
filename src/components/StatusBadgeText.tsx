import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  Landmark,
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
