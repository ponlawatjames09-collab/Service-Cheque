import { useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import {
  CHEQUE_STATUSES,
  ChequeRecord,
  formatCurrencyTHB,
  formatThaiDate,
  getTodayBangkokISO,
  isCollectedStatus,
  isIssueStatus,
  ZONE_OWNERS,
} from '../types/cheque';
import { getStatusVisual } from './StatusBadgeText';

type DateRangePreset = 'today' | 'yesterday' | 'last7' | 'all' | 'custom';

interface DailyDashboardProps {
  records: ChequeRecord[];
  onQuickFilterZone?: (zone: string) => void;
  onQuickFilterStatus?: (status: string) => void;
  onOpenNewForm?: () => void;
}

function getOffsetDateISO(daysOffset: number): string {
  const base = getTodayBangkokISO();
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysOffset));
  return dt.toISOString().slice(0, 10);
}

export function DailyDashboard({
  records,
  onQuickFilterZone,
  onQuickFilterStatus,
  onOpenNewForm,
}: DailyDashboardProps) {
  const todayISO = getTodayBangkokISO();
  const yesterdayISO = getOffsetDateISO(-1);
  const sevenDaysAgoISO = getOffsetDateISO(-6);

  const [preset, setPreset] = useState<DateRangePreset>('all');
  const [customDate, setCustomDate] = useState<string>(todayISO);

  const filteredByPeriod = useMemo(() => {
    if (preset === 'all') return records;
    if (preset === 'today') return records.filter((r) => r.date === todayISO);
    if (preset === 'yesterday') return records.filter((r) => r.date === yesterdayISO);
    if (preset === 'last7') {
      return records.filter((r) => r.date >= sevenDaysAgoISO && r.date <= todayISO);
    }
    return records.filter((r) => r.date === customDate);
  }, [records, preset, customDate, todayISO, yesterdayISO, sevenDaysAgoISO]);

  const metrics = useMemo(() => {
    let totalAmount = 0;
    let collectedAmount = 0;
    let collectedCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let issueAmount = 0;
    let issueCount = 0;

    for (const r of filteredByPeriod) {
      const amt = Number(r.amount) || 0;
      totalAmount += amt;
      if (isCollectedStatus(r.status)) {
        collectedAmount += amt;
        collectedCount += 1;
      } else if (isIssueStatus(r.status)) {
        issueAmount += amt;
        issueCount += 1;
      } else {
        pendingAmount += amt;
        pendingCount += 1;
      }
    }

    const collectionRate = totalAmount > 0 ? Math.round((collectedAmount / totalAmount) * 100) : 0;

    const byZone = ZONE_OWNERS.map((zone) => {
      const zoneRows = filteredByPeriod.filter((r) => r.zoneOwner === zone);
      const total = zoneRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const collected = zoneRows
        .filter((r) => isCollectedStatus(r.status))
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const pending = zoneRows
        .filter((r) => !isCollectedStatus(r.status) && !isIssueStatus(r.status))
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      return {
        zone,
        count: zoneRows.length,
        total,
        collected,
        pending,
        pct: total > 0 ? Math.round((collected / total) * 100) : 0,
      };
    });

    const byStatus = CHEQUE_STATUSES.map((status) => {
      const rows = filteredByPeriod.filter((r) => r.status === status);
      const amount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      return {
        status,
        count: rows.length,
        amount,
        pct: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
      };
    });

    const techMap = new Map<string, { count: number; amount: number; collectedCount: number }>();
    for (const r of filteredByPeriod) {
      const name = r.technician || 'ไม่ระบุช่าง';
      const cur = techMap.get(name) ?? { count: 0, amount: 0, collectedCount: 0 };
      cur.count += 1;
      cur.amount += Number(r.amount) || 0;
      if (isCollectedStatus(r.status)) cur.collectedCount += 1;
      techMap.set(name, cur);
    }
    const byTechnician = Array.from(techMap.entries())
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    return {
      totalCount: filteredByPeriod.length,
      totalAmount,
      collectedAmount,
      collectedCount,
      pendingAmount,
      pendingCount,
      issueAmount,
      issueCount,
      collectionRate,
      byZone,
      byStatus,
      byTechnician,
    };
  }, [filteredByPeriod]);

  const periodLabel = useMemo(() => {
    if (preset === 'today') return `วันนี้ (${formatThaiDate(todayISO)})`;
    if (preset === 'yesterday') return `เมื่อวาน (${formatThaiDate(yesterdayISO)})`;
    if (preset === 'last7') return '7 วันล่าสุด';
    if (preset === 'all') return 'ทุกวันทั้งหมด';
    return `วันที่ ${formatThaiDate(customDate)}`;
  }, [preset, todayISO, yesterdayISO, customDate]);

  return (
    <section aria-label="แดชบอร์ดสรุปยอดการรับเช็ครายวัน" className="space-y-5">
      {/* Header & Date Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            สรุปยอดการรับเช็คทั้งหมด
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            ช่วงเวลาที่แสดง: <span className="font-medium text-slate-700">{periodLabel}</span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
            <span className="tabular-nums">{metrics.totalCount} รายการ</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/80 overflow-x-auto max-w-full">
            {(
              [
                { id: 'today', label: 'วันนี้' },
                { id: 'yesterday', label: 'เมื่อวาน' },
                { id: 'last7', label: '7 วัน' },
                { id: 'all', label: 'ทั้งหมด' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreset(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  preset === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="relative inline-flex items-center">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                if (e.target.value) {
                  setCustomDate(e.target.value);
                  setPreset('custom');
                }
              }}
              aria-label="เลือกวันที่เฉพาะ"
              className={`min-h-[44px] sm:min-h-[38px] pl-9 pr-3 py-1.5 text-xs font-mono-nums rounded-lg border transition-colors bg-white ${
                preset === 'custom'
                  ? 'border-teal-600 text-teal-900 ring-2 ring-teal-600/15'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            />
          </label>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">ยอดเช็ครวมตามช่วงเวลา</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono-nums">
              ฿{formatCurrencyTHB(metrics.totalAmount)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            ทั้งหมด {metrics.totalCount} รายการ
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>รับเช็ค / เข้าบัญชีแล้ว</span>
            <span className="font-mono-nums text-emerald-700 font-semibold">{metrics.collectionRate}%</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 font-mono-nums">
            ฿{formatCurrencyTHB(metrics.collectedAmount)}
          </div>
          <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${metrics.collectionRate}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {metrics.collectedCount} รายการที่รับเช็คแล้ว
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">รอรับเช็ค</div>
          <div className="mt-2 text-2xl font-bold text-amber-700 font-mono-nums">
            ฿{formatCurrencyTHB(metrics.pendingAmount)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            รอดำเนินการ {metrics.pendingCount} รายการ
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">เลื่อนรับ / เช็คมีปัญหา</div>
          <div className="mt-2 text-2xl font-bold text-rose-700 font-mono-nums">
            ฿{formatCurrencyTHB(metrics.issueAmount)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            ต้องติดตาม {metrics.issueCount} รายการ
          </div>
        </div>
      </div>

      {/* Empty Hint or Zone & Status Breakdown */}
      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900">ยังไม่มีรายการเช็คในระบบ</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            เชื่อมต่อ Google Sheet เพื่อซิงค์ข้อมูลที่มีอยู่ หรือเริ่มต้นบันทึกรายการรับเช็คแรกเพื่อส่งแจ้งเตือนผ่าน Telegram
          </p>
          {onOpenNewForm && (
            <button
              type="button"
              onClick={onOpenNewForm}
              className="mt-4 min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors"
            >
              บันทึกรายการแรก
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Zone Breakdown (โอ vs ลูกกอล์ฟ) */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">สรุปยอดตามผู้รับผิดชอบเขต</h2>
              <span className="text-xs text-slate-500">คลิกเพื่อกรองตาราง</span>
            </div>

            <div className="mt-4 divide-y divide-slate-100">
              {metrics.byZone.map((item) => (
                <button
                  key={item.zone}
                  type="button"
                  onClick={() => onQuickFilterZone?.(item.zone)}
                  className="w-full text-left py-3.5 first:pt-1 last:pb-1 hover:bg-slate-50/80 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-900">เขต: {item.zone}</span>
                      <span className="ml-2 text-xs text-slate-500 tabular-nums">
                        ({item.count} รายการ)
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-900 font-mono-nums">
                      ฿{formatCurrencyTHB(item.total)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 transition-all duration-300"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 font-mono-nums">
                    <span>รับแล้ว ฿{formatCurrencyTHB(item.collected)}</span>
                    <span>รอรับ ฿{formatCurrencyTHB(item.pending)}</span>
                  </div>
                </button>
              ))}
            </div>

            {metrics.byTechnician.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-semibold text-slate-700">ยอดตามช่างที่รับผิดชอบ (ช่วงเวลานี้)</h3>
                <div className="mt-2.5 space-y-2">
                  {metrics.byTechnician.map((tech) => (
                    <div key={tech.name} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 truncate pr-3">
                        {tech.name}
                        <span className="text-slate-400 ml-1.5 tabular-nums">({tech.count})</span>
                      </span>
                      <span className="font-mono-nums font-medium text-slate-900 shrink-0">
                        ฿{formatCurrencyTHB(tech.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Status Breakdown */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">สรุปสถานะเช็ค ({periodLabel})</h2>
              <span className="text-xs text-slate-500 tabular-nums">
                รวม ฿{formatCurrencyTHB(metrics.totalAmount)}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {metrics.byStatus.map((item) => {
                const { Icon, textClass, barClass } = getStatusVisual(item.status);
                return (
                  <button
                    key={item.status}
                    type="button"
                    onClick={() => onQuickFilterStatus?.(item.status)}
                    className="w-full text-left group rounded-lg p-2 -mx-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                      <span className={`inline-flex items-center gap-2 font-medium ${textClass}`}>
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{item.status}</span>
                        <span className="text-slate-400 font-normal tabular-nums">
                          · {item.count} รายการ
                        </span>
                      </span>
                      <span className="font-mono-nums font-semibold text-slate-900">
                        ฿{formatCurrencyTHB(item.amount)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barClass} transition-all duration-300`}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
