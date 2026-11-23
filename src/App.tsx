import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Receipt,
  X,
} from 'lucide-react';
import { ChequeForm, ChequeFormValues } from './components/ChequeForm';
import { ChequeTable } from './components/ChequeTable';
import { ConfirmMutationModal } from './components/ConfirmMutationModal';
import { DailyDashboard } from './components/DailyDashboard';
import { ReceivablesDashboard } from './components/ReceivablesDashboard';
import { ServiceBillingDashboard } from './components/ServiceBillingDashboard';
import {
  createCheque,
  fetchCheques,
  importFromCsvText,
  patchCheque,
  StorageMode,
  writeCachedLocalRecords,
} from './lib/chequeApi';
import {
  clearUploadedReceivablesCsv,
  fetchReceivablesDataset,
  saveUploadedReceivablesCsv,
} from './lib/receivablesApi';
import { fetchServiceBillingDataset } from './lib/serviceBillingApi';
import { notifyTelegram } from './lib/telegramClient';
import { ChequeRecord } from './types/cheque';
import { parseReceivablesCsv, ReceivablesDataset } from './types/receivable';
import { ServiceBillingDataset } from './types/serviceBilling';

type ActiveTab = 'overview' | 'list' | 'receivables' | 'service-billing';

interface ToastState {
  id: number;
  type: 'success' | 'warning' | 'error';
  message: string;
}

interface PendingMutation {
  original: ChequeRecord;
  updated: ChequeRecord;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [records, setRecords] = useState<ChequeRecord[]>([]);
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [storageMode, setStorageMode] = useState<StorageMode>('local_server');
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [isConfirmingMutation, setIsConfirmingMutation] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [receivablesDataset, setReceivablesDataset] = useState<ReceivablesDataset | null>(null);
  const [isLoadingReceivables, setIsLoadingReceivables] = useState<boolean>(true);
  const [serviceBillingDataset, setServiceBillingDataset] = useState<ServiceBillingDataset | null>(null);
  const [isLoadingServiceBilling, setIsLoadingServiceBilling] = useState<boolean>(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);

  const showToast = useCallback((type: ToastState['type'], message: string) => {
    const id = Date.now();
    setToast({ id, type, message });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 5500);
  }, []);

  const loadCheques = useCallback(async () => {
    setIsSyncing(true);
    try {
      const data = await fetchCheques();
      setStorageMode(data.mode);
      setRecords(data.records);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้';
      showToast('error', msg);
    } finally {
      setIsSyncing(false);
    }
  }, [showToast]);

  const loadReceivables = useCallback(
    async (forceSheetCheck = false) => {
      setIsLoadingReceivables(true);
      try {
        const data = await fetchReceivablesDataset({ forceSheetCheck });
        setReceivablesDataset(data);
        if (forceSheetCheck) {
          if (data.source === 'live_google_sheet') {
            clearUploadedReceivablesCsv();
            showToast(
              'success',
              `ซิงค์รายงานลูกหนี้สดจาก Google Sheet สำเร็จ (${data.records.length} รายการ)`
            );
          } else {
            showToast(
              'warning',
              'Google Sheet ยังไม่เปิดสิทธิ์สาธารณะ กำลังแสดงข้อมูลล่าสุดจากรายงานในระบบ'
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'ไม่สามารถโหลดรายงานลูกหนี้ค้างชำระได้';
        showToast('error', msg);
      } finally {
        setIsLoadingReceivables(false);
      }
    },
    [showToast]
  );

  const loadServiceBilling = useCallback(
    async (showSuccessToast = false) => {
      setIsLoadingServiceBilling(true);
      try {
        const data = await fetchServiceBillingDataset();
        setServiceBillingDataset(data);
        if (showSuccessToast) {
          showToast(
            'success',
            `ซิงค์รายการงานวางบิลฝ่าย Service สำเร็จ (${data.records.length.toLocaleString('th-TH')} งาน)`
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'ไม่สามารถโหลดรายการงานวางบิลฝ่าย Service ได้';
        showToast('error', msg);
      } finally {
        setIsLoadingServiceBilling(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadCheques();
    loadReceivables(false);
    loadServiceBilling(false);
  }, [loadCheques, loadReceivables, loadServiceBilling]);

  const handleCreateCheque = async (values: ChequeFormValues): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const { record, telegram } = await createCheque(values);
      setRecords((prev) => {
        const next = [record, ...prev];
        if (storageMode === 'local_server') writeCachedLocalRecords(next);
        return next;
      });

      if (telegram.ok) {
        showToast('success', 'บันทึกข้อมูลและส่งแจ้งเตือน Telegram เรียบร้อยแล้ว');
      } else if (!telegram.configured) {
        showToast('warning', 'บันทึกข้อมูลเรียบร้อย (รอตั้งค่า Telegram บนเซิร์ฟเวอร์)');
      } else {
        showToast('warning', `บันทึกข้อมูลแล้ว แต่แจ้งเตือน Telegram ไม่สำเร็จ: ${telegram.message}`);
      }

      setIsFormModalOpen(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ';
      showToast('error', msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestUpdate = (original: ChequeRecord, updated: ChequeRecord) => {
    setPendingMutation({ original, updated });
  };

  const handleConfirmMutation = async () => {
    if (!pendingMutation) return;
    const { original, updated } = pendingMutation;

    setIsConfirmingMutation(true);
    try {
      const { record, telegram } = await patchCheque(original, updated);
      setRecords((prev) => {
        const next = prev.map((r) => (r.id === original.id ? record : r));
        if (storageMode === 'local_server') writeCachedLocalRecords(next);
        return next;
      });
      setPendingMutation(null);

      if (telegram.ok) {
        showToast('success', 'อัปเดตข้อมูลและแจ้งเตือน Telegram เรียบร้อยแล้ว');
      } else if (!telegram.configured) {
        showToast('warning', 'อัปเดตข้อมูลเรียบร้อย (รอตั้งค่า Telegram บนเซิร์ฟเวอร์)');
      } else {
        showToast('warning', 'อัปเดตข้อมูลแล้ว แต่แจ้งเตือน Telegram ไม่สำเร็จ');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'อัปเดตข้อมูลไม่สำเร็จ';
      showToast('error', msg);
    } finally {
      setIsConfirmingMutation(false);
    }
  };

  const handleResendTelegram = async (record: ChequeRecord) => {
    const tgRes = await notifyTelegram('resend', record);
    if (tgRes.ok) {
      showToast('success', `ส่งแจ้งเตือน ${record.invoice} เข้า Telegram แล้ว`);
    } else {
      showToast('warning', tgRes.message);
    }
  };

  const handleImportCsvText = async (csvText: string) => {
    try {
      const res = await importFromCsvText(csvText);
      setRecords(res.records);
      writeCachedLocalRecords(res.records);
      showToast('success', `นำเข้าไฟล์ CSV สำเร็จ (${res.importedCount} รายการ)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'นำเข้าไฟล์ CSV ไม่สำเร็จ';
      showToast('error', msg);
    }
  };

  const handleQuickFilterZone = (zone: string) => {
    setZoneFilter((prev) => (prev === zone ? 'all' : zone));
  };

  const handleQuickFilterStatus = (status: string) => {
    setStatusFilter((prev) => (prev === status ? 'all' : status));
  };

  const handleImportReceivablesCsv = (csvText: string) => {
    const parsed = parseReceivablesCsv(csvText);
    if (parsed.records.length === 0) {
      showToast('error', 'ไม่พบข้อมูลลูกหนี้ในไฟล์ CSV กรุณาตรวจสอบรูปแบบคอลัมน์');
      return;
    }
    saveUploadedReceivablesCsv(csvText);
    setReceivablesDataset({
      source: 'uploaded_csv',
      sheetAccessible: false,
      meta: parsed.meta,
      records: parsed.records,
    });
    showToast(
      'success',
      `นำเข้ารายงานลูกหนี้ค้างชำระสำเร็จ (${parsed.records.length} รายการ)`
    );
  };

  const handleResetReceivablesToSnapshot = () => {
    clearUploadedReceivablesCsv();
    void loadReceivables(false);
    showToast('success', 'รีเซ็ตกลับเป็นข้อมูลรายงานลูกหนี้ชุดตั้งต้นแล้ว');
  };

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'list', label: 'รายการเช็ค' },
    { id: 'receivables', label: 'รายงานลูกหนี้ค้างชำระ' },
    { id: 'service-billing', label: 'รายการงานวางบิลฝ่าย service' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 lg:pb-10">
      <header className="sticky top-0 z-30 h-12 md:h-14 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 xl:gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Service Cheque
          </button>

          <nav className="hidden lg:flex items-center gap-4 xl:gap-6 text-xs xl:text-sm font-medium text-slate-600" aria-label="เมนูหลัก">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === item.id
                    ? 'text-teal-800 border-teal-700'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsFormModalOpen(true)}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              บันทึกรายการแจ้งเตือนการรับเช็คใหม่
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <DailyDashboard
              records={records}
              onQuickFilterZone={handleQuickFilterZone}
              onQuickFilterStatus={handleQuickFilterStatus}
              onOpenNewForm={() => setIsFormModalOpen(true)}
            />

            <ChequeTable
              records={records}
              zoneFilter={zoneFilter}
              onZoneFilterChange={setZoneFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onRequestUpdate={handleRequestUpdate}
              onResendTelegram={handleResendTelegram}
              onImportCsv={handleImportCsvText}
              onRefresh={loadCheques}
              isLoading={isSyncing}
            />
          </div>
        )}

        {activeTab === 'list' && (
          <ChequeTable
            records={records}
            zoneFilter={zoneFilter}
            onZoneFilterChange={setZoneFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRequestUpdate={handleRequestUpdate}
            onResendTelegram={handleResendTelegram}
            onImportCsv={handleImportCsvText}
            onRefresh={loadCheques}
            isLoading={isSyncing}
          />
        )}

        {activeTab === 'receivables' && (
          <ReceivablesDashboard
            dataset={receivablesDataset}
            isLoading={isLoadingReceivables}
            onRefresh={() => loadReceivables(true)}
            onImportCsv={handleImportReceivablesCsv}
            onResetToSnapshot={handleResetReceivablesToSnapshot}
          />
        )}

        {activeTab === 'service-billing' && (
          <ServiceBillingDashboard
            dataset={serviceBillingDataset}
            isLoading={isLoadingServiceBilling}
            onRefresh={() => loadServiceBilling(true)}
          />
        )}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden grid grid-cols-4"
        aria-label="แถบนำทางมือถือ"
      >
        {(
          [
            { id: 'overview', label: 'ภาพรวม', Icon: LayoutDashboard },
            { id: 'list', label: 'รายการเช็ค', Icon: ClipboardList },
            { id: 'receivables', label: 'ลูกหนี้ค้าง', Icon: FileSpreadsheet },
            { id: 'service-billing', label: 'งานวางบิล', Icon: Receipt },
          ] as const
        ).map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-teal-700' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium tracking-tight truncate max-w-full px-1">{label}</span>
            </button>
          );
        })}
      </nav>

      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 md:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="กล่องกรอกข้อมูลบันทึกรับเช็ค"
          onClick={() => !isSubmitting && setIsFormModalOpen(false)}
        >
          <div
            className="w-full md:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ChequeForm
              onSubmit={handleCreateCheque}
              isSubmitting={isSubmitting}
              onClose={() => !isSubmitting && setIsFormModalOpen(false)}
            />
          </div>
        </div>
      )}

      <ConfirmMutationModal
        isOpen={Boolean(pendingMutation)}
        title="ยืนยันการอัปเดตข้อมูลเช็ค"
        description="ต้องการบันทึกการเปลี่ยนแปลงข้อมูลรายการนี้และส่งแจ้งเตือนผ่าน Telegram หรือไม่?"
        details={
          pendingMutation
            ? [
                { label: 'Invoice', value: pendingMutation.updated.invoice },
                { label: 'ลูกค้า', value: pendingMutation.updated.customerName },
                {
                  label: 'สถานะ',
                  value:
                    pendingMutation.original.status === pendingMutation.updated.status
                      ? pendingMutation.updated.status
                      : `${pendingMutation.original.status} → ${pendingMutation.updated.status}`,
                },
                { label: 'ผู้รับผิดชอบเขต', value: pendingMutation.updated.zoneOwner },
                { label: 'ช่างที่รับผิดชอบ', value: pendingMutation.updated.technician },
              ]
            : []
        }
        isSubmitting={isConfirmingMutation}
        onConfirm={handleConfirmMutation}
        onCancel={() => setPendingMutation(null)}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-18 md:bottom-6 right-4 left-4 md:left-auto md:max-w-sm z-50"
        >
          <div
            className={`rounded-xl border px-4 py-3 shadow-lg flex items-start justify-between gap-3 bg-white ${
              toast.type === 'success'
                ? 'border-emerald-200 text-slate-900'
                : toast.type === 'warning'
                ? 'border-amber-200 text-slate-900'
                : 'border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2.5 text-xs sm:text-sm">
              <CheckCircle2
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  toast.type === 'success'
                    ? 'text-emerald-600'
                    : toast.type === 'warning'
                    ? 'text-amber-600'
                    : 'text-rose-600'
                }`}
              />
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="ปิดการแจ้งเตือน"
              className="text-slate-400 hover:text-slate-700 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
