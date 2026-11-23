import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Minus,
  Receipt,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { formatTHB } from '../types/receivable';
import {
  BillingStatusType,
  SERVICE_BILLING_SHEET_URL,
  ServiceBillingDataset,
  ServiceBillingRecord,
} from '../types/serviceBilling';

interface ServiceBillingDashboardProps {
  dataset: ServiceBillingDataset | null;
  isLoading: boolean;
  onRefresh: () => Promise<void>;
}

type BillingFilter = 'all' | BillingStatusType;
type SpecialFilter = 'all' | 'has_revenue' | 'unbilled_with_revenue' | 'has_invoice';
type SortMode = 'month_desc' | 'revenue_desc' | 'hospital_asc';

function BillingStatusInline({ status }: { status: BillingStatusType }) {
  if (status === 'วางบิลเรียบร้อยแล้ว') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>วางบิลเรียบร้อยแล้ว</span>
      </span>
    );
  }
  if (status === 'ยังไม่ได้วางบิล') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 whitespace-nowrap">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>ยังไม่ได้วางบิล</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
      <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>ยังไม่ระบุ</span>
    </span>
  );
}

export function ServiceBillingDashboard({
  dataset,
  isLoading,
  onRefresh,
}: ServiceBillingDashboardProps) {
  const records = dataset?.records ?? [];
  const months = dataset?.months ?? [];

  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all');
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('month_desc');
  const [selectedRecord, setSelectedRecord] = useState<ServiceBillingRecord | null>(null);

  const [page, setPage] = useState(1);
  const [showAllRows, setShowAllRows] = useState(false);
  const PAGE_SIZE = 25;

  const monthlySummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        monthTab: string;
        monthLabelTh: string;
        monthOrder: number;
        totalJobs: number;
        revenueTotal: number;
        revenueJobs: number;
        billedCount: number;
        billedRevenue: number;
        unbilledCount: number;
        unbilledRevenue: number;
        unspecifiedCount: number;
        invoiceCount: number;
      }
    >();

    for (const m of months) {
      map.set(m.monthTab, {
        monthTab: m.monthTab,
        monthLabelTh: m.monthLabelTh,
        monthOrder: m.monthOrder,
        totalJobs: 0,
        revenueTotal: 0,
        revenueJobs: 0,
        billedCount: 0,
        billedRevenue: 0,
        unbilledCount: 0,
        unbilledRevenue: 0,
        unspecifiedCount: 0,
        invoiceCount: 0,
      });
    }

    for (const r of records) {
      const cur = map.get(r.monthTab) ?? {
        monthTab: r.monthTab,
        monthLabelTh: r.monthLabelTh,
        monthOrder: r.monthOrder,
        totalJobs: 0,
        revenueTotal: 0,
        revenueJobs: 0,
        billedCount: 0,
        billedRevenue: 0,
        unbilledCount: 0,
        unbilledRevenue: 0,
        unspecifiedCount: 0,
        invoiceCount: 0,
      };
      cur.totalJobs += 1;
      cur.revenueTotal += r.revenue;
      if (r.revenue > 0) cur.revenueJobs += 1;
      if (r.billingStatus === 'วางบิลเรียบร้อยแล้ว') {
        cur.billedCount += 1;
        cur.billedRevenue += r.revenue;
      } else if (r.billingStatus === 'ยังไม่ได้วางบิล') {
        cur.unbilledCount += 1;
        cur.unbilledRevenue += r.revenue;
      } else {
        cur.unspecifiedCount += 1;
      }
      if (r.invoice.trim()) {
        cur.invoiceCount += 1;
      }
      map.set(r.monthTab, cur);
    }

    return Array.from(map.values()).sort((a, b) => a.monthOrder - b.monthOrder);
  }, [records, months]);

  const scopeRecords = useMemo(() => {
    if (selectedMonth === 'all') return records;
    return records.filter((r) => r.monthTab === selectedMonth);
  }, [records, selectedMonth]);

  const scopeMetrics = useMemo(() => {
    let totalJobs = 0;
    let totalRevenue = 0;
    let revenueJobs = 0;
    let billedCount = 0;
    let billedRevenue = 0;
    let unbilledCount = 0;
    let unbilledRevenue = 0;
    let unspecifiedCount = 0;
    let invoiceCount = 0;

    for (const r of scopeRecords) {
      totalJobs += 1;
      totalRevenue += r.revenue;
      if (r.revenue > 0) revenueJobs += 1;
      if (r.billingStatus === 'วางบิลเรียบร้อยแล้ว') {
        billedCount += 1;
        billedRevenue += r.revenue;
      } else if (r.billingStatus === 'ยังไม่ได้วางบิล') {
        unbilledCount += 1;
        unbilledRevenue += r.revenue;
      } else {
        unspecifiedCount += 1;
      }
      if (r.invoice.trim()) invoiceCount += 1;
    }

    return {
      totalJobs,
      totalRevenue,
      revenueJobs,
      billedCount,
      billedRevenue,
      unbilledCount,
      unbilledRevenue,
      unspecifiedCount,
      invoiceCount,
    };
  }, [scopeRecords]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = scopeRecords.filter((r) => {
      if (billingFilter !== 'all' && r.billingStatus !== billingFilter) return false;
      if (specialFilter === 'has_revenue' && r.revenue <= 0) return false;
      if (
        specialFilter === 'unbilled_with_revenue' &&
        (r.billingStatus !== 'ยังไม่ได้วางบิล' || r.revenue <= 0)
      ) {
        return false;
      }
      if (specialFilter === 'has_invoice' && !r.invoice.trim()) return false;

      if (q) {
        const hay = `${r.hospitalName} ${r.serialNumber} ${r.invoice} ${r.jobNumber} ${r.engineerName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortMode === 'revenue_desc') {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.monthOrder - a.monthOrder;
      }
      if (sortMode === 'hospital_asc') {
        return a.hospitalName.localeCompare(b.hospitalName, 'th');
      }
      // month_desc
      if (b.monthOrder !== a.monthOrder) return b.monthOrder - a.monthOrder;
      return b.rowNumber - a.rowNumber;
    });

    return list;
  }, [scopeRecords, billingFilter, specialFilter, searchQuery, sortMode]);

  const filteredRevenueSum = useMemo(
    () => filteredRecords.reduce((s, r) => s + r.revenue, 0),
    [filteredRecords]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRecords = showAllRows
    ? filteredRecords
    : filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActiveFilters =
    selectedMonth !== 'all' ||
    searchQuery.trim() !== '' ||
    billingFilter !== 'all' ||
    specialFilter !== 'all';

  const resetFilters = () => {
    setSelectedMonth('all');
    setSearchQuery('');
    setBillingFilter('all');
    setSpecialFilter('all');
    setPage(1);
  };

  const handleExportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const headers = [
      'เดือน',
      'Job Number',
      'Call Date',
      'Hospital Name',
      'Serial Number',
      'Revenue',
      'Billing Status (AE)',
      'Invoice (AS)',
    ];
    const rows = [
      headers.join(','),
      ...filteredRecords.map((r) =>
        [
          r.monthTab,
          r.jobNumber,
          r.callDate,
          r.hospitalName,
          r.serialNumber,
          r.revenue,
          r.billingStatus,
          r.invoice,
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
    link.download = `service-billing-${selectedMonth}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoading && records.length === 0) {
    return (
      <section className="space-y-4">
        <div className="h-10 w-72 bg-slate-200/70 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white rounded-xl border border-slate-200 animate-pulse" />
      </section>
    );
  }

  return (
    <section aria-label="รายการงานวางบิลฝ่าย service" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            รายการงานวางบิลฝ่าย Service
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Call Center Record / FR-SV-04; Rev.00</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="tabular-nums">
              {months.length} เดือน ({records.length.toLocaleString('th-TH')} งาน)
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              {dataset?.source === 'live_google_sheet'
                ? 'เชื่อมต่อ Google Sheet สด'
                : 'ข้อมูลสำรองในระบบ'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={SERVICE_BILLING_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>เปิด Google Sheet</span>
          </a>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100/70 disabled:opacity-60 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>ซิงค์ข้อมูลล่าสุด</span>
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

      {/* Month Switcher Strip */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-teal-700" />
            <span>เลือกดูแยกตามเดือน</span>
          </span>
          {selectedMonth !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonth('all');
                setPage(1);
              }}
              className="text-xs font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
            >
              ดูสรุปทุกเดือนรวมกัน
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setSelectedMonth('all');
              setPage(1);
            }}
            className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              selectedMonth === 'all'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            ทุกเดือน ({records.length.toLocaleString('th-TH')})
          </button>

          {monthlySummaries.map((m) => {
            const active = selectedMonth === m.monthTab;
            return (
              <button
                key={m.monthTab}
                type="button"
                onClick={() => {
                  setSelectedMonth(m.monthTab);
                  setPage(1);
                }}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  active
                    ? 'bg-teal-700 text-white border-teal-700'
                    : m.totalJobs === 0
                    ? 'bg-white text-slate-400 border-slate-200/80 hover:bg-slate-50'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {m.monthLabelTh} ({m.totalJobs})
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">
            จำนวนงาน ({selectedMonth === 'all' ? 'ทุกเดือน' : selectedMonth})
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono-nums">
            {scopeMetrics.totalJobs.toLocaleString('th-TH')} งาน
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            งานที่มี Revenue &gt; 0: <span className="font-medium text-slate-800">{scopeMetrics.revenueJobs}</span> งาน
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setSpecialFilter((prev) => (prev === 'has_revenue' ? 'all' : 'has_revenue'));
            setPage(1);
          }}
          className={`text-left bg-white rounded-xl border p-4 sm:p-5 transition-colors ${
            specialFilter === 'has_revenue'
              ? 'border-teal-600 ring-2 ring-teal-600/15'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">ยอด Revenue รวม</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono-nums">
            ฿{formatTHB(scopeMetrics.totalRevenue)}
          </div>
          <div className="mt-2 text-xs text-emerald-700 font-mono-nums">
            วางบิลแล้ว ฿{formatTHB(scopeMetrics.billedRevenue)}
          </div>
        </button>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">สถานะวางบิล (ช่อง AE)</div>
          <div className="mt-2 flex items-baseline gap-3 font-mono-nums">
            <button
              type="button"
              onClick={() => {
                setBillingFilter((prev) =>
                  prev === 'วางบิลเรียบร้อยแล้ว' ? 'all' : 'วางบิลเรียบร้อยแล้ว'
                );
                setPage(1);
              }}
              className="text-xl font-bold text-emerald-700 hover:underline"
            >
              {scopeMetrics.billedCount} วางบิลแล้ว
            </button>
            <span className="text-slate-300">/</span>
            <button
              type="button"
              onClick={() => {
                setBillingFilter((prev) =>
                  prev === 'ยังไม่ได้วางบิล' ? 'all' : 'ยังไม่ได้วางบิล'
                );
                setPage(1);
              }}
              className="text-xl font-bold text-rose-700 hover:underline"
            >
              {scopeMetrics.unbilledCount} ค้างวางบิล
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono-nums">
            ยอดที่ยังไม่ได้วางบิล: <span className="text-rose-700 font-medium">฿{formatTHB(scopeMetrics.unbilledRevenue)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setSpecialFilter((prev) => (prev === 'has_invoice' ? 'all' : 'has_invoice'));
            setPage(1);
          }}
          className={`text-left bg-white rounded-xl border p-4 sm:p-5 transition-colors ${
            specialFilter === 'has_invoice'
              ? 'border-sky-600 ring-2 ring-sky-600/15'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>ระบุเลข Invoice แล้ว (ช่อง AS)</span>
            <Receipt className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-800 font-mono-nums">
            {scopeMetrics.invoiceCount.toLocaleString('th-TH')} งาน
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            ยังไม่ระบุสถานะ AE: {scopeMetrics.unspecifiedCount.toLocaleString('th-TH')} งาน
          </div>
        </button>
      </div>

      {/* Monthly Summary Breakdown Table (shown when viewing all months) */}
      {selectedMonth === 'all' && monthlySummaries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                สรุปยอดงานและสถานะวางบิลแยกตามเดือน
              </h2>
              <p className="text-xs text-slate-500">
                คลิกที่แถวของแต่ละเดือนเพื่อเจาะดูรายการงานในเดือนนั้น
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4 whitespace-nowrap">เดือน</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">จำนวนงาน</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Revenue รวม</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">วางบิลเรียบร้อยแล้ว (AE)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">ยังไม่ได้วางบิล (AE)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">ยังไม่ระบุ (AE)</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">มีเลข Invoice (AS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {monthlySummaries.map((m) => (
                  <tr
                    key={m.monthTab}
                    onClick={() => {
                      setSelectedMonth(m.monthTab);
                      setPage(1);
                    }}
                    className={`cursor-pointer transition-colors ${
                      m.totalJobs === 0 ? 'text-slate-400 hover:bg-slate-50/50' : 'hover:bg-teal-50/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      <span>{m.monthLabelTh}</span>
                      <span className="ml-1.5 text-[11px] font-normal font-mono-nums text-slate-400">
                        ({m.monthTab})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-nums whitespace-nowrap">
                      {m.totalJobs.toLocaleString('th-TH')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-nums font-semibold text-slate-900 whitespace-nowrap">
                      ฿{formatTHB(m.revenueTotal)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-nums whitespace-nowrap">
                      <span className={m.billedCount > 0 ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                        {m.billedCount} งาน
                      </span>
                      {m.billedRevenue > 0 && (
                        <span className="ml-1.5 text-[11px] text-emerald-600">
                          (฿{formatTHB(m.billedRevenue)})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-nums whitespace-nowrap">
                      <span className={m.unbilledCount > 0 ? 'text-rose-700 font-medium' : 'text-slate-400'}>
                        {m.unbilledCount} งาน
                      </span>
                      {m.unbilledRevenue > 0 && (
                        <span className="ml-1.5 text-[11px] text-rose-600">
                          (฿{formatTHB(m.unbilledRevenue)})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-nums text-slate-500 whitespace-nowrap">
                      {m.unspecifiedCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-nums whitespace-nowrap">
                      <span className={m.invoiceCount > 0 ? 'text-sky-700 font-semibold' : 'text-slate-400'}>
                        {m.invoiceCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Job Billing Table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                รายการงานวางบิล {selectedMonth === 'all' ? '(ทุกเดือน)' : `(${selectedMonth})`}
              </h2>
              <p className="text-xs text-slate-500 font-mono-nums">
                แสดง {filteredRecords.length.toLocaleString('th-TH')} จาก {scopeRecords.length.toLocaleString('th-TH')} งาน
                <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                Revenue รวมตามตัวกรอง{' '}
                <span className="font-semibold text-slate-800">฿{formatTHB(filteredRevenueSum)}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="ค้นหา Hospital / Serial / Invoice..."
                aria-label="ค้นหารายการงานวางบิล"
                className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
              />
            </div>

            <select
              value={billingFilter}
              onChange={(e) => {
                setBillingFilter(e.target.value as BillingFilter);
                setPage(1);
              }}
              aria-label="กรองตามสถานะวางบิล AE"
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="all">Billing Status (AE): ทั้งหมด</option>
              <option value="วางบิลเรียบร้อยแล้ว">วางบิลเรียบร้อยแล้ว</option>
              <option value="ยังไม่ได้วางบิล">ยังไม่ได้วางบิล</option>
              <option value="ยังไม่ระบุ">ยังไม่ระบุ</option>
            </select>

            <select
              value={specialFilter}
              onChange={(e) => {
                setSpecialFilter(e.target.value as SpecialFilter);
                setPage(1);
              }}
              aria-label="กรองเงื่อนไขรายได้และ Invoice"
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="all">ตัวกรองพิเศษ: ทั้งหมด</option>
              <option value="has_revenue">เฉพาะงานที่มี Revenue &gt; 0</option>
              <option value="unbilled_with_revenue">มี Revenue แต่ยังไม่ได้วางบิล</option>
              <option value="has_invoice">เฉพาะงานที่มีเลข Invoice (AS)</option>
            </select>

            <select
              value={sortMode}
              onChange={(e) => {
                setSortMode(e.target.value as SortMode);
                setPage(1);
              }}
              aria-label="เรียงลำดับรายการ"
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              <option value="month_desc">เรียง: เดือนล่าสุดก่อน</option>
              <option value="revenue_desc">เรียง: Revenue มากสุดก่อน</option>
              <option value="hospital_asc">เรียง: ชื่อโรงพยาบาล (A–Z / ก–ฮ)</option>
            </select>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            ไม่พบรายการงานวางบิลที่ตรงกับเงื่อนไขที่เลือก
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4 whitespace-nowrap">เดือน / Job</th>
                    <th className="py-3 px-3">Hospital Name</th>
                    <th className="py-3 px-3 whitespace-nowrap">Serial Number</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Revenue</th>
                    <th className="py-3 px-3 whitespace-nowrap">Billing Status (AE)</th>
                    <th className="py-3 px-4 whitespace-nowrap">Invoice (AS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleRecords.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRecord(row)}
                      className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{row.monthLabelTh}</div>
                        <div className="text-[11px] font-mono-nums text-slate-400">
                          Job {row.jobNumber}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-900 max-w-[280px] truncate" title={row.hospitalName}>
                        {row.hospitalName}
                      </td>
                      <td className="py-3 px-3 font-mono-nums text-slate-700 whitespace-nowrap">
                        {row.serialNumber}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-nums font-semibold whitespace-nowrap">
                        <span className={row.revenue > 0 ? 'text-slate-900' : 'text-slate-400 font-normal'}>
                          ฿{formatTHB(row.revenue)}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <BillingStatusInline status={row.billingStatus} />
                      </td>
                      <td className="py-3 px-4 font-mono-nums text-slate-700 max-w-[220px] truncate" title={row.invoice}>
                        {row.invoice || <span className="text-slate-300">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch List */}
            <div className="md:hidden divide-y divide-slate-100">
              {visibleRecords.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedRecord(row)}
                  className="w-full text-left px-4 py-3.5 min-h-[68px] flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {row.hospitalName}
                      </span>
                      <span
                        className={`text-sm font-mono-nums shrink-0 ${
                          row.revenue > 0 ? 'font-bold text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        ฿{formatTHB(row.revenue)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono-nums text-slate-700">S/N: {row.serialNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span>{row.monthLabelTh}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-nums">Job {row.jobNumber}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <BillingStatusInline status={row.billingStatus} />
                      <span className="text-[11px] font-mono-nums text-slate-500 truncate max-w-[150px]">
                        {row.invoice ? `INV: ${row.invoice}` : 'INV: -'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>

            {/* Pagination */}
            {filteredRecords.length > PAGE_SIZE && (
              <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs text-slate-600">
                <div className="font-mono-nums">
                  {showAllRows
                    ? `แสดงทั้งหมด ${filteredRecords.length.toLocaleString('th-TH')} รายการ`
                    : `หน้า ${safePage} / ${totalPages} (รายการที่ ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                        safePage * PAGE_SIZE,
                        filteredRecords.length
                      )} จาก ${filteredRecords.length.toLocaleString('th-TH')})`}
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

      {/* Job Detail Modal / Mobile Bottom Sheet */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sb-detail-title"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 md:hidden" />

            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <h3 id="sb-detail-title" className="text-base font-semibold text-slate-900">
                  {selectedRecord.hospitalName}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 font-mono-nums">
                  {selectedRecord.monthLabelTh} ({selectedRecord.monthTab}) · Job {selectedRecord.jobNumber} · {selectedRecord.callDate}
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

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Serial Number</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 font-mono-nums break-all">
                    {selectedRecord.serialNumber}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900 text-white p-3">
                  <div className="text-slate-300">Revenue</div>
                  <div className="mt-1 text-base font-bold font-mono-nums">
                    ฿{formatTHB(selectedRecord.revenue)}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-500">Billing Status (ช่อง AE)</span>
                  <BillingStatusInline status={selectedRecord.billingStatus} />
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-500">Invoice (ช่อง AS)</span>
                  <span className="font-mono-nums font-medium text-slate-900 text-right break-all">
                    {selectedRecord.invoice || '-'}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-500">ประเภทงาน / Warranty</span>
                  <span className="text-slate-800 text-right">
                    {selectedRecord.jobType || '-'} · {selectedRecord.warrantyStatus}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-500">ช่างผู้รับผิดชอบ</span>
                  <span className="text-slate-800 text-right">{selectedRecord.engineerName}</span>
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
