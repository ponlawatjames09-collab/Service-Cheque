import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  Link2,
  RefreshCw,
  X,
} from 'lucide-react';
import { ChequeForm, ChequeFormValues } from './components/ChequeForm';
import { ChequeTable } from './components/ChequeTable';
import { ConfirmMutationModal } from './components/ConfirmMutationModal';
import { DailyDashboard } from './components/DailyDashboard';
import { SheetsConnectionPanel } from './components/SheetsConnectionPanel';
import {
  createCheque,
  fetchCheques,
  fetchServerHealth,
  patchCheque,
  StorageMode,
} from './lib/chequeApi';
import { notifyTelegram } from './lib/telegramClient';
import { ChequeRecord } from './types/cheque';

type ActiveTab = 'overview' | 'form' | 'list' | 'connect';

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

  // Server storage & integration readiness (no login required)
  const [storageMode, setStorageMode] = useState<StorageMode>('local_server');
  const [googleSheetWebhookConfigured, setGoogleSheetWebhookConfigured] =
    useState<boolean>(false);
  const [telegramConfigured, setTelegramConfigured] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Confirmation modal for updating existing rows
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [isConfirmingMutation, setIsConfirmingMutation] = useState<boolean>(false);

  // Toast notification
  const [toast, setToast] = useState<ToastState | null>(null);

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

  useEffect(() => {
    fetchServerHealth().then((health) => {
      setTelegramConfigured(health.telegramConfigured);
      setGoogleSheetWebhookConfigured(health.googleSheetWebhookConfigured);
    });
    loadCheques();
  }, [loadCheques]);

  const handleCreateCheque = async (values: ChequeFormValues): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const { record, telegram } = await createCheque(values);
      setRecords((prev) => [record, ...prev]);

      if (telegram.ok) {
        showToast(
          'success',
          record.syncedToSheet
            ? 'บันทึกเข้า Google Sheet และส่งแจ้งเตือน Telegram แล้ว'
            : 'บันทึกข้อมูลและส่งแจ้งเตือน Telegram แล้ว'
        );
      } else if (!telegram.configured) {
        showToast(
          'warning',
          record.syncedToSheet
            ? 'บันทึกเข้า Google Sheet แล้ว (รอตั้งค่า Telegram บนเซิร์ฟเวอร์)'
            : 'บันทึกข้อมูลแล้ว (รอตั้งค่า Telegram บนเซิร์ฟเวอร์)'
        );
      } else {
        showToast('warning', `บันทึกข้อมูลแล้ว แต่แจ้งเตือน Telegram ไม่สำเร็จ: ${telegram.message}`);
      }

      if (activeTab === 'form') {
        setActiveTab('overview');
      }
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
      setRecords((prev) => prev.map((r) => (r.id === original.id ? record : r)));
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

  const handleQuickFilterZone = (zone: string) => {
    setZoneFilter((prev) => (prev === zone ? 'all' : zone));
  };

  const handleQuickFilterStatus = (status: string) => {
    setStatusFilter((prev) => (prev === status ? 'all' : status));
  };

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'form', label: 'บันทึกรับเช็ค' },
    { id: 'list', label: 'รายการเช็ค' },
    { id: 'connect', label: 'เชื่อมต่อระบบ' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-10">
      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 h-12 md:h-14 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Service Cheque
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600" aria-label="เมนูหลัก">
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
              onClick={() => setActiveTab('form')}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              บันทึกเช็คใหม่
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport (No Login Required) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">
              {storageMode === 'google_sheet_webhook'
                ? 'เชื่อมต่อ Google Sheets อัตโนมัติ'
                : 'ระบบฐานข้อมูลพร้อมใช้งาน'}
            </span>
            <span aria-hidden="true">·</span>
            <span>ไม่ต้องเข้าสู่ระบบ</span>
          </div>
          <button
            type="button"
            onClick={loadCheques}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:text-teal-900 disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}</span>
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <DailyDashboard
              records={records}
              onQuickFilterZone={handleQuickFilterZone}
              onQuickFilterStatus={handleQuickFilterStatus}
              onOpenNewForm={() => setActiveTab('form')}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="hidden lg:block lg:col-span-4">
                <ChequeForm
                  onSubmit={handleCreateCheque}
                  isSubmitting={isSubmitting}
                  isSheetConnected={googleSheetWebhookConfigured}
                />
              </div>

              <div className="lg:col-span-8">
                <ChequeTable
                  records={records}
                  zoneFilter={zoneFilter}
                  onZoneFilterChange={setZoneFilter}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  onRequestUpdate={handleRequestUpdate}
                  onResendTelegram={handleResendTelegram}
                  isLoading={isSyncing}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'form' && (
          <div className="max-w-2xl mx-auto">
            <ChequeForm
              onSubmit={handleCreateCheque}
              isSubmitting={isSubmitting}
              isSheetConnected={googleSheetWebhookConfigured}
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
            isLoading={isSyncing}
          />
        )}

        {activeTab === 'connect' && (
          <SheetsConnectionPanel
            storageMode={storageMode}
            googleSheetWebhookConfigured={googleSheetWebhookConfigured}
            telegramConfigured={telegramConfigured}
            isSyncing={isSyncing}
            onSyncNow={loadCheques}
          />
        )}
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation Bar (56px height) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 md:hidden grid grid-cols-4"
        aria-label="แถบนำทางมือถือ"
      >
        {(
          [
            { id: 'overview', label: 'ภาพรวม', Icon: LayoutDashboard },
            { id: 'form', label: 'บันทึกเช็ค', Icon: FilePlus2 },
            { id: 'list', label: 'รายการ', Icon: ClipboardList },
            { id: 'connect', label: 'เชื่อมต่อ', Icon: Link2 },
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
              <span className="text-[11px] font-medium tracking-tight">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Confirmation Dialog for Row Updates */}
      <ConfirmMutationModal
        isOpen={Boolean(pendingMutation)}
        title="ยืนยันการอัปเดตข้อมูลเช็ค"
        description={
          storageMode === 'google_sheet_webhook'
            ? 'ต้องการบันทึกการเปลี่ยนแปลงลงใน Google Sheet และส่งแจ้งเตือนผ่าน Telegram หรือไม่?'
            : 'ต้องการอัปเดตข้อมูลรายการนี้และส่งแจ้งเตือนผ่าน Telegram หรือไม่?'
        }
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

      {/* Feedback Toast */}
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
