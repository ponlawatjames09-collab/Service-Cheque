import { AlertCircle, X } from 'lucide-react';

interface ConfirmMutationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  details?: Array<{ label: string; value: string }>;
  confirmLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmMutationModal({
  isOpen,
  title,
  description,
  details = [],
  confirmLabel = 'ยืนยันการอัปเดต',
  cancelLabel = 'ยกเลิก',
  isSubmitting = false,
  onConfirm,
  onCancel,
}: ConfirmMutationModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="min-h-[40px] min-w-[40px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {details.length > 0 && (
          <dl className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-1 text-xs">
            {details.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-slate-500 shrink-0">{item.label}</dt>
                <dd className="font-medium text-slate-900 text-right truncate">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {isSubmitting ? 'กำลังบันทึก...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
