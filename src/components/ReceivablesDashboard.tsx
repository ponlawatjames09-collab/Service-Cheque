import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Flame,
  Hourglass,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  AGING_BUCKET_META,
  AGING_BUCKET_ORDER,
  AgingBucketKey,
  AR_SHEET_EDIT_URL,
  AR_SHEET_ID,
  formatCompactTHB,
  formatTHB,
  ReceivableRecord,
  ReceivablesDataset,
} from '../types/receivable';

interface ReceivablesDashboardProps {
  dataset: ReceivablesDataset | null;
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onImportCsv: (csvText: string) => void;
  onResetToSnapshot: () => void;
}

type BucketFilterValue = 'all' | 'overdue_any' | AgingBucketKey;
type SortMode = 'outstanding_desc' | 'over120_desc' | 'date_asc' | 'date_desc';
type GroupingView = 'zone' | 'owner';
type SpotlightTab = 'top_customers' | 'critical_over120' | 'partial_paid';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function getBucketIcon(bucket: AgingBucketKey) {
  switch (bucket) {
    case 'notDue':
      return CheckCircle2;
    case 'b60':
      return Clock;
    case 'b90':
      return Hourglass;
    case 'b120':
      return AlertTriangle;
    case 'over120':
      return Flame;
  }
}

export function ReceivablesDashboard({
  dataset,
  isLoading,
  onRefresh,
  onImportCsv,
  onResetToSnapshot,
}: ReceivablesDashboardProps) {
  const records = dataset?.records ?? [];
  const meta = dataset?.meta;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [bucketFilter, setBucketFilter] = useState<BucketFilterValue>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('outstanding_desc');

  const [groupingView, setGroupingView] = useState<GroupingView>('zone');
  const [spotlightTab, setSpotlightTab] = useState<SpotlightTab>('top_customers');
  const [selectedRecord, setSelectedRecord] = useState<ReceivableRecord | null>(null);

  const [page, setPage] = useState(1);
  const [showAllRows, setShowAllRows] = useState(false);
  const PAGE_SIZE = 25;

  const analytics = useMemo(() => {
    let totalInvoice = 0;
    let totalOutstanding = 0;
    let totalPaid = 0;
    let partialPaidCount = 0;
    let notDue = 0;
    let b60 = 0;
    let b90 = 0;
    let b120 = 0;
    let over120 = 0;
    let overdueAnyCount = 0;
    let anomalyCount = 0;

    const bucketCounts: Record<AgingBucketKey, number> = {
      notDue: 0,
      b60: 0,
      b90: 0,
      b120: 0,
      over120: 0,
    };

    const zoneMap = new Map<
      string,
      {
        name: string;
        count: number;
        outstanding: number;
        notDue: number;
        overdueMid: number;
        over120: number;
        overdueTotal: number;
      }
    >();

    const ownerMap = new Map<
      string,
      {
        name: string;
        count: number;
        outstanding: number;
        notDue: number;
        overdueMid: number;
        over120: number;
        overdueTotal: number;
      }
    >();

    const customerMap = new Map<
      string,
      {
        name: string;
        count: number;
        outstanding: number;
        overdue: number;
        over120: number;
        zone: string;
      }
    >();

    for (const r of records) {
      totalInvoice += r.invoiceAmount;
      totalOutstanding += r.outstandingAmount;
      totalPaid += r.paidAmount;
      if (r.paidAmount > 0.01) partialPaidCount += 1;

      notDue += r.notDueAmount;
      b60 += r.bucket60;
      b90 += r.bucket90;
      b120 += r.bucket120;
      over120 += r.bucketOver120;

      if (r.notDueAmount > 0) bucketCounts.notDue += 1;
      if (r.bucket60 > 0) bucketCounts.b60 += 1;
      if (r.bucket90 > 0) bucketCounts.b90 += 1;
      if (r.bucket120 > 0) bucketCounts.b120 += 1;
      if (r.bucketOver120 > 0) bucketCounts.over120 += 1;
      if (r.overdueAmount > 0) overdueAnyCount += 1;
      if (r.isDateAnomaly) anomalyCount += 1;

      const overdueMid = round2(r.bucket60 + r.bucket90 + r.bucket120);

      const z = zoneMap.get(r.zoneGroup) ?? {
        name: r.zoneGroup,
        count: 0,
        outstanding: 0,
        notDue: 0,
        overdueMid: 0,
        over120: 0,
        overdueTotal: 0,
      };
      z.count += 1;
      z.outstanding = round2(z.outstanding + r.outstandingAmount);
      z.notDue = round2(z.notDue + r.notDueAmount);
      z.overdueMid = round2(z.overdueMid + overdueMid);
      z.over120 = round2(z.over120 + r.bucketOver120);
      z.overdueTotal = round2(z.overdueTotal + r.overdueAmount);
      zoneMap.set(r.zoneGroup, z);

      const o = ownerMap.get(r.canonicalOwner) ?? {
        name: r.canonicalOwner,
        count: 0,
        outstanding: 0,
        notDue: 0,
        overdueMid: 0,
        over120: 0,
        overdueTotal: 0,
      };
      o.count += 1;
      o.outstanding = round2(o.outstanding + r.outstandingAmount);
      o.notDue = round2(o.notDue + r.notDueAmount);
      o.overdueMid = round2(o.overdueMid + overdueMid);
      o.over120 = round2(o.over120 + r.bucketOver120);
      o.overdueTotal = round2(o.overdueTotal + r.overdueAmount);
      ownerMap.set(r.canonicalOwner, o);

      const c = customerMap.get(r.customerName) ?? {
        name: r.customerName,
        count: 0,
        outstanding: 0,
        overdue: 0,
        over120: 0,
        zone: r.zoneGroup,
      };
      c.count += 1;
      c.outstanding = round2(c.outstanding + r.outstandingAmount);
      c.overdue = round2(c.overdue + r.overdueAmount);
      c.over120 = round2(c.over120 + r.bucketOver120);
      customerMap.set(r.customerName, c);
    }

    totalInvoice = round2(totalInvoice);
    totalOutstanding = round2(totalOutstanding);
    totalPaid = round2(totalPaid);
    notDue = round2(notDue);
    b60 = round2(b60);
    b90 = round2(b90);
    b120 = round2(b120);
    over120 = round2(over120);
    const totalOverdue = round2(b60 + b90 + b120 + over120);

    const pct = (part: number) =>
      totalOutstanding > 0 ? Math.round((part / totalOutstanding) * 1000) / 10 : 0;

    const bucketTotals: Record<AgingBucketKey, { amount: number; pct: number; count: number }> = {
      notDue: { amount: notDue, pct: pct(notDue), count: bucketCounts.notDue },
      b60: { amount: b60, pct: pct(b60), count: bucketCounts.b60 },
      b90: { amount: b90, pct: pct(b90), count: bucketCounts.b90 },
      b120: { amount: b120, pct: pct(b120), count: bucketCounts.b120 },
      over120: { amount: over120, pct: pct(over120), count: bucketCounts.over120 },
    };

    const byZone = Array.from(zoneMap.values()).sort((a, b) => b.outstanding - a.outstanding);
    const byOwner = Array.from(ownerMap.values()).sort((a, b) => b.outstanding - a.outstanding);
    const topCustomers = Array.from(customerMap.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 10);

    const criticalOver120 = [...records]
      .filter((r) => r.bucketOver120 > 0)
      .sort((a, b) => b.bucketOver120 - a.bucketOver120)
      .slice(0, 10);

    const partialPaidRows = [...records]
      .filter((r) => r.paidAmount > 0.01)
      .sort((a, b) => b.paidAmount - a.paidAmount);

    return {
      totalInvoice,
      totalOutstanding,
      totalPaid,
      partialPaidCount,
      totalOverdue,
      overdueAnyCount,
      overduePct: pct(totalOverdue),
      notDuePct: pct(notDue),
      over120Pct: pct(over120),
      anomalyCount,
      bucketTotals,
      byZone,
      byOwner,
      topCustomers,
      criticalOver120,
      partialPaidRows,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = records.filter((r) => {
      if (zoneFilter !== 'all' && r.zoneGroup !== zoneFilter) return false;
      if (ownerFilter !== 'all' && r.canonicalOwner !== ownerFilter) return false;

      if (bucketFilter === 'overdue_any' && r.overdueAmount <= 0) return false;
      if (bucketFilter === 'notDue' && r.notDueAmount <= 0) return false;
      if (bucketFilter === 'b60' && r.bucket60 <= 0) return false;
      if (bucketFilter === 'b90' && r.bucket90 <= 0) return false;
      if (bucketFilter === 'b120' && r.bucket120 <= 0) return false;
      if (bucketFilter === 'over120' && r.bucketOver120 <= 0) return false;

      if (q) {
        const hay = `${r.invoiceNo} ${r.customerName} ${r.ownerName} ${r.zoneGroup} ${r.dateDisplay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortMode === 'outstanding_desc') {
        return b.outstandingAmount - a.outstandingAmount;
      }
      if (sortMode === 'over120_desc') {
        if (b.bucketOver120 !== a.bucketOver120) return b.bucketOver120 - a.bucketOver120;
        if (b.overdueAmount !== a.overdueAmount) return b.overdueAmount - a.overdueAmount;
        return b.outstandingAmount - a.outstandingAmount;
      }
      if (sortMode === 'date_asc') {
        if (!a.isoDate && !b.isoDate) return 0;
        if (!a.isoDate) return 1;
        if (!b.isoDate) return -1;
        return a.isoDate.localeCompare(b.isoDate);
      }
      // date_desc
      if (!a.isoDate && !b.isoDate) return 0;
      if (!a.isoDate) return 1;
      if (!b.isoDate) return -1;
      return b.isoDate.localeCompare(a.isoDate);
    });

    return list;
  }, [records, searchQuery, zoneFilter, ownerFilter, bucketFilter, sortMode]);

  const filteredTotals = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    for (const r of filteredRecords) {
      outstanding += r.outstandingAmount;
      overdue += r.overdueAmount;
    }
    return {
      outstanding: round2(outstanding),
      overdue: round2(overdue),
    };
  }, [filteredRecords]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRecords = showAllRows
    ? filteredRecords
    : filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    bucketFilter !== 'all' ||
    zoneFilter !== 'all' ||
    ownerFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setBucketFilter('all');
    setZoneFilter('all');
    setOwnerFilter('all');
    setPage(1);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImportCsv(text);
    setPage(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const headers = [
      'ว.ด.ป.',
      'INV.No.',
      'รพ./บจก.',
      'ยอดเงินค่าสินค้า',
      'ยอดเงินที่ค้างจ่าย',
      'ยังไม่ถึงกำหนดชำระ',
      'ภายใน 60 วัน',
      'ภายใน 90 วัน',
      'ภายใน 120 วัน',
      'เกิน 120 วัน',
      'ผู้รับผิดชอบ',
      'เขต',
    ];
    const rows = [
      headers.join(','),
      ...filteredRecords.map((r) =>
        [
          r.dateDisplay,
          r.invoiceNo,
          r.customerName,
          r.invoiceAmount,
          r.outstandingAmount,
          r.notDueAmount,
          r.bucket60,
          r.bucket90,
          r.bucket120,
          r.bucketOver120,
          r.ownerName,
          r.zoneGroup,
        ]
          .map(esc)
          .join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receivables-aging-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const sourceLabel =
    dataset?.source === 'live_google_sheet'
      ? 'ซิงค์จาก Google Sheet โดยตรง'
      : dataset?.source === 'uploaded_csv'
      ? 'ไฟล์ CSV ที่นำเข้าล่าสุด'
      : 'ข้อมูลวิเคราะห์จากไฟล์รายงาน Google Sheet';

  if (isLoading && records.length === 0) {
    return (
      <section className="space-y-4">
        <div className="h-10 w-64 bg-slate-200/70 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
      </section>
    );
  }

  const groupRows = groupingView === 'zone' ? analytics.byZone : analytics.byOwner;

  return (
    <section aria-label="แดชบอร์ดวิเคราะห์รายงานลูกหนี้ค้างชำระ" className="space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            รายงานลูกหนี้ค้างชำระ
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              อัปเดตข้อมูล:{' '}
              <span className="font-medium text-slate-700 font-mono-nums">
                {meta?.updateDate || '20/11/2569'}
              </span>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="tabular-nums">{records.length} รายการ</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>{sourceLabel}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100/70 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>นำเข้า CSV อัปเดต</span>
          </button>

          {dataset?.source === 'uploaded_csv' && (
            <button
              type="button"
              onClick={onResetToSnapshot}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>กลับค่าตั้งต้น</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>ซิงค์ Google Sheet</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
            className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ส่งออก CSV</span>
          </button>
        </div>
      </div>

      {/* Sheet Access Hint (when sheet is private 401 and showing snapshot) */}
      {dataset && !dataset.sheetAccessible && dataset.source === 'sheet_snapshot' && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <span>
              แสดงข้อมูลชุดวิเคราะห์ล่าสุดจากตารางลูกหนี้ (<span className="font-mono-nums">{meta?.reportTitle}</span>) — หากต้องการให้ระบบดึงข้อมูลสดจาก Google Sheet{' '}
              <code className="font-mono-nums text-slate-800">{AR_SHEET_ID}</code> อัตโนมัติ กรุณาเปิดสิทธิ์แชร์ชีตเป็น &quot;ทุกคนที่มีลิงก์ดูได้&quot; แล้วกดซิงค์
            </span>
          </div>
          <a
            href={AR_SHEET_EDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 hover:text-teal-900 font-medium whitespace-nowrap shrink-0 underline underline-offset-2"
          >
            เปิด Google Sheet
          </a>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Outstanding */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">ยอดเงินที่ค้างจ่ายรวมทั้งหมด</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono-nums tracking-tight">
            ฿{formatTHB(analytics.totalOutstanding)}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-slate-500 font-mono-nums">
            <div>มูลค่าสินค้าตามบิล: ฿{formatTHB(analytics.totalInvoice)}</div>
            {analytics.totalPaid > 0 && (
              <div className="text-emerald-700">
                ชำระแล้วบางส่วน: ฿{formatTHB(analytics.totalPaid)} ({analytics.partialPaidCount} บิล)
              </div>
            )}
          </div>
        </div>

        {/* KPI 2: Current / Not Due */}
        <button
          type="button"
          onClick={() => {
            setBucketFilter((prev) => (prev === 'notDue' ? 'all' : 'notDue'));
            setPage(1);
          }}
          className={`text-left bg-white rounded-xl border p-4 sm:p-5 transition-colors ${
            bucketFilter === 'notDue'
              ? 'border-teal-600 ring-2 ring-teal-600/15'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>ยังไม่ถึงกำหนดชำระ</span>
            <span className="font-mono-nums font-semibold text-teal-800">
              {analytics.notDuePct}%
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-800 font-mono-nums tracking-tight">
            ฿{formatTHB(analytics.bucketTotals.notDue.amount)}
          </div>
          <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 transition-all duration-300"
              style={{ width: `${analytics.notDuePct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {analytics.bucketTotals.notDue.count} รายการอยู่ในกำหนดปกติ
          </div>
        </button>

        {/* KPI 3: Total Overdue */}
        <button
          type="button"
          onClick={() => {
            setBucketFilter((prev) => (prev === 'overdue_any' ? 'all' : 'overdue_any'));
            setPage(1);
          }}
          className={`text-left bg-white rounded-xl border p-4 sm:p-5 transition-colors ${
            bucketFilter === 'overdue_any'
              ? 'border-amber-600 ring-2 ring-amber-600/15'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>เกินกำหนดชำระรวม (ทุกช่วง)</span>
            <span className="font-mono-nums font-semibold text-amber-700">
              {analytics.overduePct}%
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 font-mono-nums tracking-tight">
            ฿{formatTHB(analytics.totalOverdue)}
          </div>
          <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${analytics.overduePct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 font-mono-nums truncate">
            {analytics.overdueAnyCount} บิล · 60ว. {formatCompactTHB(analytics.bucketTotals.b60.amount)} · 90ว. {formatCompactTHB(analytics.bucketTotals.b90.amount)}
          </div>
        </button>

        {/* KPI 4: Critical >120 Days */}
        <button
          type="button"
          onClick={() => {
            setBucketFilter((prev) => (prev === 'over120' ? 'all' : 'over120'));
            setPage(1);
          }}
          className={`text-left bg-white rounded-xl border p-4 sm:p-5 transition-colors ${
            bucketFilter === 'over120'
              ? 'border-rose-600 ring-2 ring-rose-600/15'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-600" />
              <span>ค้างนานวิกฤต (เกิน 120 วัน)</span>
            </span>
            <span className="font-mono-nums font-semibold text-rose-700">
              {analytics.over120Pct}%
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-700 font-mono-nums tracking-tight">
            ฿{formatTHB(analytics.bucketTotals.over120.amount)}
          </div>
          <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-600 transition-all duration-300"
              style={{ width: `${analytics.over120Pct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {analytics.bucketTotals.over120.count} รายการต้องเร่งติดตามเร่งด่วน
          </div>
        </button>
      </div>

      {/* Interactive 5-Bucket Aging Structure */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">โครงสร้างอายุลูกหนี้ตามช่วงเวลา (Aging Analysis)</h2>
            <p className="text-xs text-slate-500">คลิกที่ช่วงอายุหนี้เพื่อกรองดูรายการใบแจ้งหนี้ในตารางด้านล่าง</p>
          </div>
          {bucketFilter !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setBucketFilter('all');
                setPage(1);
              }}
              className="self-start sm:self-auto text-xs font-medium text-teal-800 hover:text-teal-950 underline underline-offset-2"
            >
              แสดงทุกช่วงอายุหนี้
            </button>
          )}
        </div>

        {/* Proportional Segmented Bar */}
        <div
          className="h-3.5 w-full rounded-lg overflow-hidden bg-slate-100 flex gap-px"
          role="img"
          aria-label="สัดส่วนยอดค้างชำระแยกตามอายุหนี้"
        >
          {AGING_BUCKET_ORDER.map((key) => {
            const b = analytics.bucketTotals[key];
            if (b.pct <= 0) return null;
            const m = AGING_BUCKET_META[key];
            return (
              <div
                key={key}
                style={{ width: `${Math.max(b.pct, 1.5)}%` }}
                className={`${m.barClass} transition-all duration-300`}
                title={`${m.label}: ฿${formatTHB(b.amount)} (${b.pct}%)`}
              />
            );
          })}
        </div>

        {/* 5 Clickable Buckets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {AGING_BUCKET_ORDER.map((key) => {
            const m = AGING_BUCKET_META[key];
            const b = analytics.bucketTotals[key];
            const Icon = getBucketIcon(key);
            const active = bucketFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setBucketFilter((prev) => (prev === key ? 'all' : key));
                  setPage(1);
                }}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  active
                    ? `${m.surfaceClass} ${m.borderClass} ring-2 ring-slate-900/10`
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className={`flex items-center justify-between gap-1 text-xs font-medium ${m.textClass}`}>
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{m.shortLabel}</span>
                  </span>
                  <span className="font-mono-nums shrink-0">{b.pct}%</span>
                </div>
                <div className="mt-1.5 text-sm sm:text-base font-bold text-slate-900 font-mono-nums">
                  ฿{formatTHB(b.amount)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  {b.count} บิล
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-Column Deep Analytics: Zone/Owner Risk + Top Customers / Critical Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Zone / Owner Breakdown */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                สรุปภาระหนี้ตาม{groupingView === 'zone' ? 'เขต / ทีมรับผิดชอบ' : 'ผู้รับผิดชอบรายบุคคล'}
              </h2>
              <p className="text-xs text-slate-500">คลิกรายการเพื่อกรองตารางด้านล่าง</p>
            </div>

            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 self-start">
              <button
                type="button"
                onClick={() => setGroupingView('zone')}
                className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  groupingView === 'zone'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ตามเขต ({analytics.byZone.length})
              </button>
              <button
                type="button"
                onClick={() => setGroupingView('owner')}
                className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  groupingView === 'owner'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                รายบุคคล ({analytics.byOwner.length})
              </button>
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
            {groupRows.map((item) => {
              const total = item.outstanding || 1;
              const notDueW = (item.notDue / total) * 100;
              const midW = (item.overdueMid / total) * 100;
              const overW = (item.over120 / total) * 100;
              const isSelected =
                groupingView === 'zone' ? zoneFilter === item.name : ownerFilter === item.name;

              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    if (groupingView === 'zone') {
                      setZoneFilter((prev) => (prev === item.name ? 'all' : item.name));
                    } else {
                      setOwnerFilter((prev) => (prev === item.name ? 'all' : item.name));
                    }
                    setPage(1);
                  }}
                  className={`w-full text-left py-3 px-2.5 -mx-1 rounded-lg transition-colors ${
                    isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-slate-900">{item.name}</span>
                      <span className="ml-2 text-xs text-slate-500 tabular-nums">
                        {item.count} บิล
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-900 font-mono-nums shrink-0">
                      ฿{formatTHB(item.outstanding)}
                    </span>
                  </div>

                  {/* Stacked proportion: teal (not due), amber (60-120), rose (>120) */}
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    {notDueW > 0 && (
                      <div className="h-full bg-teal-600" style={{ width: `${notDueW}%` }} />
                    )}
                    {midW > 0 && (
                      <div className="h-full bg-amber-500" style={{ width: `${midW}%` }} />
                    )}
                    {overW > 0 && (
                      <div className="h-full bg-rose-600" style={{ width: `${overW}%` }} />
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] font-mono-nums">
                    <span className="text-slate-500">
                      ยังไม่ถึงกำหนด ฿{formatCompactTHB(item.notDue)}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className={item.overdueTotal > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'}>
                        เกินกำหนด ฿{formatCompactTHB(item.overdueTotal)}
                      </span>
                      {item.over120 > 0 && (
                        <span className="text-rose-700 font-semibold">
                          &gt;120ว. ฿{formatCompactTHB(item.over120)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Spotlight (Top Customers / Critical Over 120d / Partial Payments) */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">จุดโฟกัสและกลุ่มเสี่ยงสำคัญ</h2>

            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setSpotlightTab('top_customers')}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  spotlightTab === 'top_customers'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Top 10 ลูกหนี้
              </button>
              <button
                type="button"
                onClick={() => setSpotlightTab('critical_over120')}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  spotlightTab === 'critical_over120'
                    ? 'bg-white text-rose-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เกิน 120 วันสูงสุด
              </button>
              <button
                type="button"
                onClick={() => setSpotlightTab('partial_paid')}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  spotlightTab === 'partial_paid'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ชำระบางส่วน ({analytics.partialPaidCount})
              </button>
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
            {spotlightTab === 'top_customers' &&
              analytics.topCustomers.map((cust, idx) => (
                <button
                  key={cust.name}
                  type="button"
                  onClick={() => {
                    setSearchQuery(cust.name);
                    setPage(1);
                  }}
                  className="w-full text-left py-2.5 px-2 -mx-1 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex items-start gap-2.5">
                    <span className="text-xs font-mono-nums text-slate-400 w-5 shrink-0 pt-0.5">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                        {cust.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                        <span className="tabular-nums">{cust.count} บิล</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span>{cust.zone}</span>
                        {cust.over120 > 0 && (
                          <>
                            <span className="text-slate-300" aria-hidden="true">·</span>
                            <span className="text-rose-700 font-mono-nums">
                              เกิน 120ว. ฿{formatCompactTHB(cust.over120)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs sm:text-sm font-bold text-slate-900 font-mono-nums">
                      ฿{formatTHB(cust.outstanding)}
                    </div>
                    {cust.overdue > 0 && (
                      <div className="text-[11px] text-amber-700 font-mono-nums">
                        เกินกำหนด ฿{formatCompactTHB(cust.overdue)}
                      </div>
                    )}
                  </div>
                </button>
              ))}

            {spotlightTab === 'critical_over120' &&
              analytics.criticalOver120.map((row, idx) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedRecord(row)}
                  className="w-full text-left py-2.5 px-2 -mx-1 rounded-lg hover:bg-rose-50/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex items-start gap-2.5">
                    <span className="text-xs font-mono-nums text-rose-500 font-semibold w-5 shrink-0 pt-0.5">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                        {row.customerName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 font-mono-nums flex flex-wrap items-center gap-x-2">
                        <span className="text-slate-700">{row.invoiceNo}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span>{row.dateDisplay}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="font-sans">{row.zoneGroup}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs sm:text-sm font-bold text-rose-700 font-mono-nums">
                      ฿{formatTHB(row.bucketOver120)}
                    </div>
                    <div className="text-[11px] text-slate-400">เกิน 120 วัน</div>
                  </div>
                </button>
              ))}

            {spotlightTab === 'partial_paid' &&
              analytics.partialPaidRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedRecord(row)}
                  className="w-full text-left py-2.5 px-2 -mx-1 rounded-lg hover:bg-emerald-50/40 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                      {row.customerName}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 font-mono-nums flex flex-wrap items-center gap-x-2">
                      <span>{row.invoiceNo}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>ยอดบิล ฿{formatTHB(row.invoiceAmount)}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span className="font-sans">{row.zoneGroup}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono-nums">
                    <div className="text-xs sm:text-sm font-bold text-slate-900">
                      คงค้าง ฿{formatTHB(row.outstandingAmount)}
                    </div>
                    <div className="text-[11px] text-emerald-700">
                      จ่ายแล้ว ฿{formatTHB(row.paidAmount)}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Detailed Ledger */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                รายละเอียดใบแจ้งหนี้ลูกหนี้คงค้าง
              </h2>
              <p className="text-xs text-slate-500 font-mono-nums">
                แสดง {filteredRecords.length} จาก {records.length} รายการ
                <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                ยอดค้างรวม <span className="font-semibold text-slate-800">฿{formatTHB(filteredTotals.outstanding)}</span>
                <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                เกินกำหนด <span className="font-semibold text-amber-700">฿{formatTHB(filteredTotals.overdue)}</span>
              </p>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="self-start sm:self-auto min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative lg:col-span-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="ค้นหา INV / รพ. / ผู้รับผิดชอบ..."
                aria-label="ค้นหารายการลูกหนี้"
                className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
              />
            </div>

            <select
              value={bucketFilter}
              onChange={(e) => {
                setBucketFilter(e.target.value as BucketFilterValue);
                setPage(1);
              }}
              aria-label="กรองตามช่วงอายุหนี้"
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="all">อายุหนี้: ทั้งหมด</option>
              <option value="overdue_any">เฉพาะที่เกินกำหนดทั้งหมด</option>
              {AGING_BUCKET_ORDER.map((k) => (
                <option key={k} value={k}>
                  {AGING_BUCKET_META[k].label}
                </option>
              ))}
            </select>

            <select
              value={zoneFilter}
              onChange={(e) => {
                setZoneFilter(e.target.value);
                setPage(1);
              }}
              aria-label="กรองตามเขต"
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="all">เขต / ทีม: ทั้งหมด</option>
              {analytics.byZone.map((z) => (
                <option key={z.name} value={z.name}>
                  {z.name} ({z.count})
                </option>
              ))}
            </select>

            <select
              value={ownerFilter}
              onChange={(e) => {
                setOwnerFilter(e.target.value);
                setPage(1);
              }}
              aria-label="กรองตามผู้รับผิดชอบ"
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="all">ผู้รับผิดชอบ: ทั้งหมด</option>
              {analytics.byOwner.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name} ({o.count})
                </option>
              ))}
            </select>

            <select
              value={sortMode}
              onChange={(e) => {
                setSortMode(e.target.value as SortMode);
                setPage(1);
              }}
              aria-label="เรียงลำดับ"
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="outstanding_desc">เรียง: ยอดค้างจ่ายมากสุด</option>
              <option value="over120_desc">เรียง: เสี่ยงสูงสุด (&gt;120 วันก่อน)</option>
              <option value="date_asc">เรียง: วันที่เก่าสุดก่อน</option>
              <option value="date_desc">เรียง: วันที่ล่าสุดก่อน</option>
            </select>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            ไม่พบรายการลูกหนี้ที่ตรงกับเงื่อนไขการค้นหา
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4 whitespace-nowrap">ว.ด.ป.</th>
                    <th className="py-3 px-3 whitespace-nowrap">INV.No.</th>
                    <th className="py-3 px-3">รพ./บจก.</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">ยอดค่าสินค้า</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">ยอดค้างจ่าย</th>
                    <th className="py-3 px-3 whitespace-nowrap">สถานะอายุหนี้</th>
                    <th className="py-3 px-3 whitespace-nowrap">ผู้รับผิดชอบ</th>
                    <th className="py-3 px-4 whitespace-nowrap">เขต / ทีม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleRecords.map((row) => {
                    const bm = AGING_BUCKET_META[row.primaryBucket];
                    const BucketIcon = getBucketIcon(row.primaryBucket);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedRecord(row)}
                        className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-mono-nums text-slate-600 whitespace-nowrap">
                          <span>{row.dateDisplay}</span>
                          {row.isDateAnomaly && (
                            <span
                              title="รูปแบบวันที่ในชีตต้นฉบับไม่ตรงมาตรฐาน"
                              className="ml-1 text-amber-600"
                            >
                              *
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono-nums font-medium text-slate-900 whitespace-nowrap">
                          {row.invoiceNo}
                        </td>
                        <td className="py-3 px-3 text-slate-900 max-w-[260px] truncate" title={row.customerName}>
                          {row.customerName}
                        </td>
                        <td className="py-3 px-3 text-right font-mono-nums text-slate-500 whitespace-nowrap">
                          ฿{formatTHB(row.invoiceAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono-nums font-semibold text-slate-900 whitespace-nowrap">
                          <div>฿{formatTHB(row.outstandingAmount)}</div>
                          {row.paidAmount > 0.01 && (
                            <div className="text-[10px] font-normal text-emerald-700">
                              จ่ายแล้ว ฿{formatCompactTHB(row.paidAmount)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 font-medium ${bm.textClass}`}>
                            <BucketIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{bm.shortLabel}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                          {row.ownerName}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {row.zoneGroup}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch List */}
            <div className="md:hidden divide-y divide-slate-100">
              {visibleRecords.map((row) => {
                const bm = AGING_BUCKET_META[row.primaryBucket];
                const BucketIcon = getBucketIcon(row.primaryBucket);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedRecord(row)}
                    className="w-full text-left px-4 py-3.5 min-h-[68px] flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {row.customerName}
                        </span>
                        <span className="text-sm font-bold text-slate-900 font-mono-nums shrink-0">
                          ฿{formatTHB(row.outstandingAmount)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-mono-nums text-slate-700">{row.invoiceNo}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-nums">{row.dateDisplay}</span>
                        <span aria-hidden="true">·</span>
                        <span>{row.zoneGroup}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${bm.textClass}`}>
                          <BucketIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>{bm.shortLabel}</span>
                        </span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                          {row.ownerName}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Pagination Bar */}
            {filteredRecords.length > PAGE_SIZE && (
              <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs text-slate-600">
                <div className="font-mono-nums">
                  {showAllRows
                    ? `แสดงทั้งหมด ${filteredRecords.length} รายการ`
                    : `หน้า ${safePage} / ${totalPages} (รายการที่ ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                        safePage * PAGE_SIZE,
                        filteredRecords.length
                      )} จาก ${filteredRecords.length})`}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAllRows((v) => !v)}
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium text-slate-700"
                  >
                    {showAllRows ? 'แบ่งหน้า (25/หน้า)' : 'แสดงทั้งหมด'}
                  </button>
                  {!showAllRows && (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="หน้าก่อนหน้า"
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        aria-label="หน้าถัดไป"
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sheet Reconciliation Footer Notes */}
      {meta && meta.reportedOutstandingTotal !== undefined && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Building2 className="w-4 h-4 text-slate-500" />
            <span>สรุปยอดกระทบยอดท้ายตาราง (Reconciliation)</span>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-slate-500">ยอดค้างจ่ายรวมในตาราง</div>
              <div className="mt-1 text-sm font-bold text-slate-900 font-mono-nums">
                ฿{formatTHB(meta.reportedOutstandingTotal)}
              </div>
              {meta.diffAmount !== undefined && (
                <div className="mt-0.5 text-[11px] text-emerald-700 font-mono-nums">
                  ผลต่าง (Diff): ฿{formatTHB(meta.diffAmount)}
                </div>
              )}
            </div>

            {meta.adjustments.map((adj, idx) => (
              <div key={`${adj.label}-${idx}`} className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-500 truncate" title={adj.label}>
                  {adj.label}
                </div>
                <div
                  className={`mt-1 text-sm font-bold font-mono-nums ${
                    adj.amount < 0 ? 'text-rose-700' : 'text-slate-900'
                  }`}
                >
                  {adj.amount >= 0 ? '+' : ''}฿{formatTHB(adj.amount)}
                </div>
              </div>
            ))}

            {meta.adjustedTotal !== undefined && (
              <div className="rounded-lg bg-teal-50/70 border border-teal-200 p-3">
                <div className="text-teal-800 font-medium">ยอดสุทธิรวมตามรายงาน</div>
                <div className="mt-1 text-sm font-bold text-teal-900 font-mono-nums">
                  ฿{formatTHB(meta.adjustedTotal)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoice Detail Modal / Mobile Bottom Sheet */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ar-detail-title"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 md:hidden" />

            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <h3 id="ar-detail-title" className="text-base font-semibold text-slate-900">
                  {selectedRecord.customerName}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 font-mono-nums">
                  {selectedRecord.invoiceNo} · วันที่ {selectedRecord.dateDisplay} · {selectedRecord.zoneGroup} ({selectedRecord.ownerName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {selectedRecord.isDateAnomaly && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  หมายเหตุข้อมูล: ช่องวันที่ในตารางต้นฉบับระบุเป็น &quot;{selectedRecord.dateDisplay}&quot; (แถวที่ {selectedRecord.rowNumber})
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">ยอดเงินค่าสินค้า</div>
                  <div className="mt-1 text-base font-semibold text-slate-800 font-mono-nums">
                    ฿{formatTHB(selectedRecord.invoiceAmount)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900 text-white p-3">
                  <div className="text-[11px] text-slate-300">ยอดเงินที่ค้างจ่าย</div>
                  <div className="mt-1 text-base font-bold font-mono-nums">
                    ฿{formatTHB(selectedRecord.outstandingAmount)}
                  </div>
                </div>
              </div>

              {selectedRecord.paidAmount > 0.01 && (
                <div className="rounded-lg bg-emerald-50/70 border border-emerald-200 px-3 py-2 text-xs text-emerald-900 flex items-center justify-between font-mono-nums">
                  <span>ชำระเข้ามาแล้วบางส่วน</span>
                  <span className="font-semibold">฿{formatTHB(selectedRecord.paidAmount)}</span>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">รายละเอียดแยกตามช่วงอายุหนี้</h4>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {(
                    [
                      { key: 'notDue', val: selectedRecord.notDueAmount },
                      { key: 'b60', val: selectedRecord.bucket60 },
                      { key: 'b90', val: selectedRecord.bucket90 },
                      { key: 'b120', val: selectedRecord.bucket120 },
                      { key: 'over120', val: selectedRecord.bucketOver120 },
                    ] as const
                  ).map(({ key, val }) => {
                    const m = AGING_BUCKET_META[key];
                    return (
                      <div key={key} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                        <span className={val > 0 ? `font-medium ${m.textClass}` : 'text-slate-400'}>
                          {m.label}
                        </span>
                        <span
                          className={`font-mono-nums ${
                            val > 0 ? 'font-semibold text-slate-900' : 'text-slate-300'
                          }`}
                        >
                          ฿{formatTHB(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="w-full min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
