import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import {
  CHEQUE_STATUSES,
  ChequeRecord,
  ChequeStatus,
  getTodayBangkokISO,
  TECHNICIANS,
  ZONE_OWNERS,
  ZoneOwner,
} from '../types/cheque';

export type ChequeFormValues = Omit<ChequeRecord, 'id' | 'rowNumber' | 'syncedToSheet'>;

interface ChequeFormProps {
  onSubmit: (values: ChequeFormValues) => Promise<boolean>;
  isSubmitting: boolean;
  initialValues?: Partial<ChequeFormValues>;
  submitLabel?: string;
}

export function ChequeForm({
  onSubmit,
  isSubmitting,
  initialValues,
  submitLabel = 'บันทึกข้อมูลและแจ้งเตือน Telegram',
}: ChequeFormProps) {
  const [date, setDate] = useState(initialValues?.date ?? getTodayBangkokISO());
  const [invoice, setInvoice] = useState(initialValues?.invoice ?? '');
  const [customerName, setCustomerName] = useState(initialValues?.customerName ?? '');
  const [sCode, setSCode] = useState(initialValues?.sCode ?? '');
  const [amountStr, setAmountStr] = useState(
    initialValues?.amount !== undefined ? String(initialValues.amount) : ''
  );
  const [remark, setRemark] = useState(initialValues?.remark ?? '');
  const [zoneOwner, setZoneOwner] = useState<ZoneOwner>(initialValues?.zoneOwner ?? 'โอ');
  const [status, setStatus] = useState<ChequeStatus>(initialValues?.status ?? 'รอรับเช็ค');
  const [technician, setTechnician] = useState<string>(initialValues?.technician ?? TECHNICIANS[0]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedInvoice = invoice.trim();
    const trimmedCustomer = customerName.trim();
    const parsedAmount = Number(amountStr.replace(/,/g, '').trim());

    if (!date) {
      setErrorMsg('กรุณาระบุวันที่');
      return;
    }
    if (!trimmedInvoice) {
      setErrorMsg('กรุณาระบุเลขที่ Invoice');
      return;
    }
    if (!trimmedCustomer) {
      setErrorMsg('กรุณาระบุชื่อลูกค้า');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('กรุณาระบุยอดเงินให้ถูกต้อง (มากกว่า 0)');
      return;
    }

    const success = await onSubmit({
      date,
      invoice: trimmedInvoice,
      customerName: trimmedCustomer,
      sCode: sCode.trim(),
      amount: parsedAmount,
      remark: remark.trim(),
      zoneOwner,
      status,
      technician,
    });

    if (success && !initialValues) {
      setInvoice('');
      setCustomerName('');
      setSCode('');
      setAmountStr('');
      setRemark('');
      setStatus('รอรับเช็ค');
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">ฟอร์มบันทึกรับเช็ค</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            บันทึกข้อมูลเข้า Google Sheet และส่งแจ้งเตือน Telegram ทันที
          </p>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
        >
          {errorMsg}
        </div>
      )}

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="cheque-date" className="block text-xs font-medium text-slate-700 mb-1.5">
              A · วันที่
            </label>
            <input
              id="cheque-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono-nums text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div>
            <label htmlFor="cheque-invoice" className="block text-xs font-medium text-slate-700 mb-1.5">
              B · Invoice
            </label>
            <input
              id="cheque-invoice"
              type="text"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="เช่น INV-2026-0142"
              required
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono-nums text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cheque-customer" className="block text-xs font-medium text-slate-700 mb-1.5">
            C · ชื่อลูกค้า
          </label>
          <input
            id="cheque-customer"
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="ระบุชื่อบริษัท หรือชื่อลูกค้า"
            required
            className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="cheque-scode" className="block text-xs font-medium text-slate-700 mb-1.5">
              D · S (รหัสงาน / Service)
            </label>
            <input
              id="cheque-scode"
              type="text"
              value={sCode}
              onChange={(e) => setSCode(e.target.value)}
              placeholder="เช่น S-015"
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono-nums text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div>
            <label htmlFor="cheque-amount" className="block text-xs font-medium text-slate-700 mb-1.5">
              E · ยอดเงิน (บาท)
            </label>
            <input
              id="cheque-amount"
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              required
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono-nums text-right text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-700 mb-1.5">
            G · ผู้รับผิดชอบเขต
          </span>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
            {ZONE_OWNERS.map((owner) => (
              <button
                key={owner}
                type="button"
                onClick={() => setZoneOwner(owner)}
                className={`min-h-[40px] rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  zoneOwner === owner
                    ? 'bg-white text-teal-800 shadow-xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {owner}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="cheque-status" className="block text-xs font-medium text-slate-700 mb-1.5">
              H · สถานะ
            </label>
            <select
              id="cheque-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ChequeStatus)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            >
              {CHEQUE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cheque-tech" className="block text-xs font-medium text-slate-700 mb-1.5">
              I · ช่างที่รับผิดชอบ
            </label>
            <select
              id="cheque-tech"
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            >
              {TECHNICIANS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="cheque-remark" className="block text-xs font-medium text-slate-700 mb-1.5">
            F · Remark (เลขเช็ค / ธนาคาร / หมายเหตุ)
          </label>
          <textarea
            id="cheque-remark"
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="เช่น เช็คกสิกร เลขที่ 1049281 ลงวันที่ 25/11/69"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 active:scale-[0.99] disabled:opacity-60 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap"
        >
          <Send className="w-4 h-4 shrink-0" />
          <span>{isSubmitting ? 'กำลังบันทึกและส่งแจ้งเตือน...' : submitLabel}</span>
        </button>
      </div>
    </form>
  );
}
