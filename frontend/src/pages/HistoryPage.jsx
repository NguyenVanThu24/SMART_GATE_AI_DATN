import { useCallback, useEffect, useRef, useState } from 'react';
import {
  History, Search, Download, RefreshCw,
  Filter, RotateCcw, ChevronLeft, ChevronRight,
  ShieldCheck, ShieldX, Clock3, CarFront,
  Cloud, Send, Image, AlertCircle
} from 'lucide-react';

import api, { errMsg } from '../services/api';
import useSocket from '../hooks/useSocket';
import EvidenceModal from '../components/common/EvidenceModal';
import PlateBadge from '../components/common/PlateBadge';
import StatusBadge from '../components/common/StatusBadge';
import { RESULTS, DIRECTION, fmtDate } from '../utils/constants';
import '../styles/history.css';

const EMPTY = {
  from: '',
  to: '',
  result: '',
  q: '',
  gate_id: '',
  direction: '',
  drive: '',
  telegram: ''
};

const DRIVE = {
  synced: ['green', 'Đã đồng bộ'],
  pending: ['amber', 'Chờ xử lý'],
  syncing: ['blue', 'Đang đồng bộ'],
  failed: ['red', 'Thất bại'],
  not_required: ['gray', 'Không yêu cầu']
};

const TELEGRAM = {
  sent: ['green', 'Đã gửi'],
  pending: ['amber', 'Chờ gửi'],
  sending: ['blue', 'Đang gửi'],
  failed: ['red', 'Thất bại'],
  uncertain: ['amber', 'Chưa xác định'],
  not_required: ['gray', 'Không yêu cầu']
};

function SyncBadge({ value, options, icon: Icon }) {
  const [color, label] = options[value] || ['gray', '—'];

  return (
    <span className={`hist-sync ${color}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

function FilterField({ label, children }) {
  return (
    <label className="hist-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="hist-stat">
      <div className={`hist-stat-icon ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <strong>{Number(value || 0).toLocaleString('vi-VN')}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [filters, setFilters] = useState({ ...EMPTY });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [gates, setGates] = useState([]);
  const [data, setData] = useState({
    rows: [],
    total: 0,
    totalPages: 1,
    summary: {}
  });

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [updated, setUpdated] = useState(null);

  const requestRef = useRef(null);
  const sequence = useRef(0);
  const refreshTimer = useRef(null);

  const load = useCallback(async () => {
    const current = ++sequence.current;

    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const response = await api.get('/history', {
        params: {
          ...filters,
          paginated: 1,
          page,
          pageSize
        },
        signal: controller.signal
      });

      if (current !== sequence.current) return;

      setData(response.data);
      setUpdated(new Date());

      if (response.data.page !== page) {
        setPage(response.data.page);
      }
    } catch (e) {
      if (controller.signal.aborted) return;

      if (current === sequence.current) {
        setError(errMsg(e));
      }
    } finally {
      if (current === sequence.current &&
          !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    api.get('/gates')
      .then(r => setGates(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    const interval = setInterval(load, 30000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      clearTimeout(refreshTimer.current);
      requestRef.current?.abort();
      sequence.current++;
    };
  }, [load]);

  const refreshRealtime = () => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(load, 500);
  };

  useSocket('plate:detected', refreshRealtime);
  useSocket('plate:updated', refreshRealtime);

  const set = key => e => {
    setFilters(old => ({
      ...old,
      [key]: e.target.value
    }));
    setPage(1);
  };

  const reset = () => {
    setFilters({ ...EMPTY });
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    setError('');

    try {
      const records = [];
      const seen = new Set();
      let exportPage = 1;
      let maxPages = 1;

      do {
        const response = await api.get('/history', {
          params: {
            ...filters,
            paginated: 1,
            page: exportPage,
            pageSize: 100
          }
        });

        if (response.data.total > 10000) {
          throw new Error(
            'Vui lòng thu hẹp bộ lọc xuống tối đa 10.000 bản ghi.'
          );
        }

        maxPages = response.data.totalPages;

        for (const row of response.data.rows) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            records.push(row);
          }
        }

        exportPage++;
      } while (exportPage <= maxPages && exportPage <= 100);

      const head = [
        'Thời gian', 'Biển số', 'Chủ xe',
        'Hướng', 'Cổng', 'Kết quả',
        'Lý do', 'Độ tin cậy',
        'Google Drive', 'Telegram'
      ];

      const body = records.map(r => [
        fmtDate(r.created_at),
        r.plate_number,
        r.owner || '',
        DIRECTION[r.direction] || '',
        r.gate_name,
        RESULTS[r.result]?.[1] || r.result,
        r.reason,
        r.confidence,
        DRIVE[r.drive_sync_status]?.[1] || '',
        TELEGRAM[r.telegram_status]?.[1] || ''
      ]);

      const escapeCell = value => {
        let text = String(value ?? '');

        // Prevent spreadsheet formula injection.
        if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(text)) {
          text = "'" + text;
        }

        return `"${text.replace(/"/g, '""')}"`;
      };

      const csv = '\ufeff' + [head, ...body]
        .map(row => row.map(escapeCell).join(','))
        .join('\r\n');

      const url = URL.createObjectURL(
        new Blob([csv], {
          type: 'text/csv;charset=utf-8'
        })
      );

      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-gate-history-${Date.now()}.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errMsg(e) || e.message);
    } finally {
      setExporting(false);
    }
  };

  const summary = data.summary || {};
  const rows = data.rows || [];
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const first = data.total
    ? ((data.page || page) - 1) * pageSize + 1
    : 0;

  const last = Math.min(
    (data.page || page) * pageSize,
    data.total
  );

  return (
    <div className="hist-page">

      <header className="hist-header">
        <div>
          <div className="hist-eyebrow">
            <History size={15} />
            ACCESS MANAGEMENT
          </div>

          <h2>Lịch sử ra vào</h2>

          <p>
            Tra cứu và quản lý nhật ký phương tiện.
          </p>
        </div>

        <div className="hist-actions">
          <button
            className="hist-btn"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Làm mới
          </button>

          <button
            className="hist-btn primary"
            onClick={exportCsv}
            disabled={exporting || loading || !!error || !data.total}
          >
            <Download size={16} />
            {exporting ? 'Đang xuất...' : 'Xuất CSV'}
          </button>
        </div>
      </header>

      <div className="hist-stats">
        <StatCard
          label="Tổng lượt ghi nhận"
          value={data.total}
          icon={CarFront}
          color="blue"
        />

        <StatCard
          label="Được phép"
          value={Number(summary.allowed || 0) + Number(summary.manual || 0)}
          icon={ShieldCheck}
          color="green"
        />

        <StatCard
          label="Bị từ chối"
          value={summary.denied}
          icon={ShieldX}
          color="red"
        />

        <StatCard
          label="Chờ xác nhận"
          value={summary.pending}
          icon={Clock3}
          color="amber"
        />
      </div>

      <section className="hist-panel">
        <div className="hist-panel-heading">
          <h3>
            <Filter size={18} />
            Bộ lọc tra cứu
            {activeFilters > 0 && (
              <span className="hist-filter-count">
                {activeFilters}
              </span>
            )}
          </h3>

          <button className="hist-btn" onClick={reset}>
            <RotateCcw size={15} />
            Xóa bộ lọc
          </button>
        </div>

        <div className="hist-search">
          <Search size={19} />
          <input
            value={filters.q}
            onChange={set('q')}
            maxLength={100}
            placeholder="Nhập biển số hoặc tên chủ phương tiện..."
          />
        </div>

        <div className="hist-filters">
          <FilterField label="Từ ngày">
            <input type="date"
              value={filters.from}
              onChange={set('from')}
            />
          </FilterField>

          <FilterField label="Đến ngày">
            <input type="date"
              value={filters.to}
              onChange={set('to')}
            />
          </FilterField>

          <FilterField label="Kết quả">
            <select value={filters.result} onChange={set('result')}>
              <option value="">Tất cả kết quả</option>
              {Object.entries(RESULTS).map(([key, value]) => (
                <option key={key} value={key}>{value[1]}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Cổng kiểm soát">
            <select value={filters.gate_id} onChange={set('gate_id')}>
              <option value="">Tất cả cổng</option>
              {gates.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Hướng di chuyển">
            <select value={filters.direction} onChange={set('direction')}>
              <option value="">Tất cả hướng</option>
              <option value="in">Xe vào</option>
              <option value="out">Xe ra</option>
            </select>
          </FilterField>

          <FilterField label="Google Drive">
            <select value={filters.drive} onChange={set('drive')}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(DRIVE).map(([key, value]) => (
                <option key={key} value={key}>{value[1]}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Telegram">
            <select value={filters.telegram} onChange={set('telegram')}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(TELEGRAM).map(([key, value]) => (
                <option key={key} value={key}>{value[1]}</option>
              ))}
            </select>
          </FilterField>
        </div>
      </section>

      {error && (
        <div className="hist-error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <section className="hist-panel hist-table-panel">
        <div className="hist-panel-heading">
          <div>
            <h3>Nhật ký phương tiện</h3>
            <p>
              {loading ? 'Đang cập nhật dữ liệu...' :
                updated ? `Cập nhật: ${updated.toLocaleTimeString('vi-VN')}` :
                'Dữ liệu từ hệ thống'}
            </p>
          </div>

          <select
            className="hist-page-size"
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 20, 50].map(n => (
              <option key={n} value={n}>{n} dòng / trang</option>
            ))}
          </select>
        </div>

        <div className="hist-table-wrap">
          <table className="hist-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Biển số</th>
                <th>Chủ xe / Khách</th>
                <th>Cổng / Hướng</th>
                <th>Kết quả</th>
                <th>Lý do</th>
                <th>Tin cậy</th>
                <th>Google Drive</th>
                <th>Telegram</th>
                <th>Ảnh</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="hist-nowrap">
                    {fmtDate(r.created_at)}
                  </td>

                  <td>
                    <PlateBadge>{r.plate_number}</PlateBadge>
                  </td>

                  <td>{r.owner || 'Không xác định'}</td>

                  <td>
                    <strong>{r.gate_name}</strong>
                    <small>{DIRECTION[r.direction] || '—'}</small>
                  </td>

                  <td>
                    <StatusBadge kind={RESULTS[r.result]?.[0] || 'mu'}>
                      {RESULTS[r.result]?.[1] || r.result}
                    </StatusBadge>
                  </td>

                  <td className="hist-reason">{r.reason || '—'}</td>

                  <td>
                    {r.confidence == null ? '—' : `${r.confidence}%`}
                  </td>

                  <td>
                    <SyncBadge
                      value={r.drive_sync_status}
                      options={DRIVE}
                      icon={Cloud}
                    />
                  </td>

                  <td>
                    <SyncBadge
                      value={r.telegram_status}
                      options={TELEGRAM}
                      icon={Send}
                    />
                  </td>

                  <td>
                    {r.event_id && (r.image_path || r.plate_image_path) ? (
                      <button
                        className="hist-image-btn"
                        onClick={() => setSelected(r)}
                        title="Xem ảnh bằng chứng"
                      >
                        <Image size={16} />
                        Xem
                      </button>
                    ) : (
                      <span className="hist-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan={10}>
                    <div className="hist-empty">
                      <History size={32} />
                      {loading ? 'Đang tải dữ liệu...' :
                        error ? 'Không thể tải dữ liệu' :
                        'Không tìm thấy bản ghi phù hợp'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="hist-pagination">
          <span>
            Hiển thị {first}–{last} / {data.total} bản ghi
          </span>

          <div>
            <button
              className="hist-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
              aria-label="Trang trước"
            >
              <ChevronLeft size={17} />
            </button>

            <strong>
              {data.page || page} / {data.totalPages}
            </strong>

            <button
              className="hist-btn"
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              aria-label="Trang tiếp theo"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </footer>
      </section>

      {selected && (
        <EvidenceModal
          key={selected.id}
          row={rows.find(r => r.id === selected.id) || selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
