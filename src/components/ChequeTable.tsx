import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { BellRing, ChevronRight, Download, RefreshCw, Search, Upload, X } from 'lucide-react';
import {
  CHEQUE_STATUSES,
  ChequeRecord,
  ChequeStatus,
  formatCurrencyTHB,
  formatThaiDate,
  SHEET_HEADERS,
  TECHNICIANS,
  ZONE_OWNERS,
  ZoneOwner,
} from '../types/cheque';
import { StatusInlineLabel } from './StatusBadgeText';

interface ChequeTableProps {
  records: ChequeRecord[];
  zoneFilter: string;
  onZoneFilterChange: (zone: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onRequestUpdate: (original: ChequeRecord, updated: ChequeRecord) => void;
  onResendTelegram: (record: ChequeRecord) => void;
  onImportCsv?: (csvText: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
}

export function ChequeTable({
  records,
  zoneFilter,
  onZoneFilterChange,
  statusFilter,
  onStatusFilterChange,
  onRequestUpdate,
  onResendTelegram,
  onImportCsv,
  onRefresh,
  isLoading = false,
}: ChequeTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [techFilter, setTechFilter] = useState('all');
  const [editingRecord, setEditingRecord] = useState<ChequeRecord | null>(null);
  const [editStatus, setEditStatus] = useState<ChequeStatus>('รอรับเช็ค');
  const [editZone, setEditZone] = useState<ZoneOwner>('โอ');
  const [editTechnician, setEditTechnician] = useState<string>(TECHNICIANS[0]);
  const [editRemark, setEditRemark] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCsvFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportCsv) return;
    const text = await file.text();
    await onImportCsv(text);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (zoneFilter !== 'all' && r.zoneOwner !== zoneFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (techFilter !== 'all' && r.technician !== techFilter) return false;
      if (q) {
        const haystack = `${r.invoice} ${r.customerName} ${r.sCode} ${r.remark} ${r.technician}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [records, zoneFilter, statusFilter, techFilter, searchQuery]);

  const openEditor = (record: ChequeRecord) => {
    setEditingRecord(record);
    setEditStatus(record.status);
    setEditZone(record.zoneOwner);
    setEditTechnician(record.technician || TECHNICIANS[0]);
    setEditRemark(record.remark);
  };

  const handleSaveSheetEdit = () => {
    if (!editingRecord) return;
    const updated: ChequeRecord = {
      ...editingRecord,
      status: editStatus,
      zoneOwner: editZone,
      technician: editTechnician,
      remark: editRemark.trim(),
    };
    setEditingRecord(null);
    onRequestUpdate(editingRecord, updated);
  };

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = [
      SHEET_HEADERS.join(','),
      ...filteredRecords.map((r) =>
        [
          r.date,
          r.invoice,
          r.customerName,
          r.sCode,
          r.amount,
          r.remark,
          r.zoneOwner,
          r.status,
          r.technician,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    const blob = new Blob(['\uFEFF' + rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `service-cheques-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    zoneFilter !== 'all' ||
    statusFilter !== 'all' ||
    techFilter !== 'all';

  return (
    <section aria-label="รายการติดตามการรับเช็ค" className="bg-white rounded-xl border border-slate-200">
      {/* Toolbar & Filters */}
      <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">รายการติดตามเช็คทั้งหมด</h2>
            <p className="text-xs text-slate-500 tabular-nums">
              แสดง {filteredRecords.length} จาก {records.length} รายการ
            </p>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  onZoneFilterChange('all');
                  onStatusFilterChange('all');
                  setTechFilter('all');
                }}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                ล้างตัวกรอง
              </button>
            )}
            {onImportCsv && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100/70 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>นำเข้า CSV</span>
                </button>
              </>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>รีเฟรช</span>
              </button>
            )}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหา Invoice / ชื่อลูกค้า / S..."
              aria-label="ค้นหารายการเช็ค"
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            />
          </div>

          <select
            value={zoneFilter}
            onChange={(e) => onZoneFilterChange(e.target.value)}
            aria-label="กรองตามผู้รับผิดชอบเขต"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
          >
            <option value="all">ผู้รับผิดชอบเขต: ทั้งหมด</option>
            {ZONE_OWNERS.map((z) => (
              <option key={z} value={z}>
                เขต: {z}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            aria-label="กรองตามสถานะ"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
          >
            <option value="all">สถานะ: ทั้งหมด</option>
            {CHEQUE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            aria-label="กรองตามช่างที่รับผิดชอบ"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
          >
            <option value="all">ช่างที่รับผิดชอบ: ทั้งหมด</option>
            {TECHNICIANS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-11 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          {records.length === 0
            ? 'ยังไม่มีข้อมูลรายการเช็ค — เริ่มต้นกรอกข้อมูลผ่านฟอร์มได้เลย'
            : 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา'}
        </div>
      ) : (
        <>
          {/* Desktop Data Grid */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4 whitespace-nowrap">วันที่</th>
                  <th className="py-3 px-3 whitespace-nowrap">Invoice</th>
                  <th className="py-3 px-3">ชื่อลูกค้า</th>
                  <th className="py-3 px-3 whitespace-nowrap">S</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">ยอดเงิน</th>
                  <th className="py-3 px-3 whitespace-nowrap">เขต</th>
                  <th className="py-3 px-3 whitespace-nowrap">ช่างที่รับผิดชอบ</th>
                  <th className="py-3 px-3 whitespace-nowrap">สถานะ</th>
                  <th className="py-3 px-3">Remark</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRecords.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono-nums text-slate-600 whitespace-nowrap">
                      {formatThaiDate(row.date)}
                    </td>
                    <td className="py-3 px-3 font-mono-nums font-medium text-slate-900 whitespace-nowrap">
                      {row.invoice}
                    </td>
                    <td className="py-3 px-3 text-slate-900 max-w-[200px] truncate" title={row.customerName}>
                      {row.customerName}
                    </td>
                    <td className="py-3 px-3 font-mono-nums text-slate-600 whitespace-nowrap">
                      {row.sCode || '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-nums font-semibold text-slate-900 whitespace-nowrap">
                      ฿{formatCurrencyTHB(row.amount)}
                    </td>
                    <td className="py-3 px-3 text-slate-700 whitespace-nowrap font-medium">
                      {row.zoneOwner}
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      {row.technician}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <select
                        value={row.status}
                        aria-label={`เปลี่ยนสถานะของ ${row.invoice}`}
                        onChange={(e) => {
                          const nextStatus = e.target.value as ChequeStatus;
                          if (nextStatus !== row.status) {
                            onRequestUpdate(row, { ...row, status: nextStatus });
                          }
                        }}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:border-slate-300 focus:border-teal-600 focus:outline-none"
                      >
                        {CHEQUE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3 text-slate-500 max-w-[160px] truncate" title={row.remark}>
                      {row.remark || '-'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor(row)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-teal-800 hover:bg-teal-50 rounded-md transition-colors"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => onResendTelegram(row)}
                          title="ส่งแจ้งเตือนซ้ำเข้า Telegram"
                          aria-label={`ส่งแจ้งเตือน ${row.invoice} ไปยัง Telegram`}
                          className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                        >
                          <BellRing className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Tap-List */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredRecords.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openEditor(row)}
                className="w-full text-left px-4 py-3.5 min-h-[68px] flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {row.customerName}
                    </span>
                    <span className="text-sm font-bold text-slate-900 font-mono-nums shrink-0">
                      ฿{formatCurrencyTHB(row.amount)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                    <span className="font-mono-nums text-slate-700">{row.invoice}</span>
                    {row.sCode && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-nums">{row.sCode}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-nums">{formatThaiDate(row.date)}</span>
                    <span aria-hidden="true">·</span>
                    <span>เขต {row.zoneOwner}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <StatusInlineLabel status={row.status} />
                    <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                      {row.technician}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Bottom Sheet / Modal Editor for Row Details & Status Update */}
      {editingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-cheque-title"
        >
          <div className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 md:hidden" />

            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 id="edit-cheque-title" className="text-base font-semibold text-slate-900">
                  จัดการรายการรับเช็ค
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 font-mono-nums">
                  {editingRecord.invoice} · {editingRecord.customerName} · ฿{formatCurrencyTHB(editingRecord.amount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="edit-status" className="block text-xs font-medium text-slate-700 mb-1.5">
                  สถานะการรับเช็ค
                </label>
                <select
                  id="edit-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ChequeStatus)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {CHEQUE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-700 mb-1.5">ผู้รับผิดชอบเขต</span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                  {ZONE_OWNERS.map((owner) => (
                    <button
                      key={owner}
                      type="button"
                      onClick={() => setEditZone(owner)}
                      className={`min-h-[44px] rounded-md text-sm font-medium transition-colors ${
                        editZone === owner
                          ? 'bg-white text-teal-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {owner}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="edit-tech" className="block text-xs font-medium text-slate-700 mb-1.5">
                  ช่างที่รับผิดชอบ
                </label>
                <select
                  id="edit-tech"
                  value={editTechnician}
                  onChange={(e) => setEditTechnician(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {TECHNICIANS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-remark" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Remark
                </label>
                <textarea
                  id="edit-remark"
                  rows={2}
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onResendTelegram(editingRecord);
                  setEditingRecord(null);
                }}
                className="min-h-[48px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <BellRing className="w-4 h-4" />
                <span>ส่งแจ้งเตือนซ้ำ</span>
              </button>
              <button
                type="button"
                onClick={handleSaveSheetEdit}
                className="flex-1 min-h-[48px] px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-xl hover:bg-teal-800 transition-colors"
              >
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
