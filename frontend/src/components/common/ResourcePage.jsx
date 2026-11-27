import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, RefreshCw, Pencil, Trash2,
  ChevronLeft, ChevronRight, CheckCircle2,
  AlertCircle, X, Database, Filter
} from 'lucide-react';

import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import DataTable from './DataTable';
import Modal from './Modal';
import SmartField from './SmartField';
import '../../styles/resource.css';

const descriptions = {
  '/vehicles': 'Quản lý phương tiện và quyền ra vào hệ thống.',
  '/employees': 'Quản lý hồ sơ nhân viên và thông tin công tác.',
  '/visitors': 'Quản lý đăng ký, phê duyệt và lịch trình khách đến.',
  '/accounts': 'Quản lý tài khoản và quyền truy cập hệ thống.'
};

const statusConfig = {
  '/vehicles': {
    key: 'is_allowed',
    options: [
      ['1', 'Được phép'],
      ['0', 'Đang khóa']
    ]
  },
  '/employees': {
    key: 'status',
    options: [
      ['active', 'Hoạt động'],
      ['inactive', 'Ngừng hoạt động']
    ]
  },
  '/visitors': {
    key: 'status',
    options: [
      ['pending', 'Chờ duyệt'],
      ['approved', 'Đã duyệt'],
      ['rejected', 'Từ chối'],
      ['done', 'Đã ra']
    ]
  },
  '/accounts': {
    key: 'is_active',
    options: [
      ['1', 'Hoạt động'],
      ['0', 'Đang khóa']
    ]
  }
};

export default function ResourcePage({
  title, endpoint, columns, fields, searchHint
}) {
  const { user } = useAuth();

  const canWrite = endpoint === '/accounts'
    ? user.role === 'admin'
    : endpoint === '/visitors'
      || ['admin', 'manager'].includes(user.role);

  const canDelete = endpoint === '/accounts'
    ? user.role === 'admin'
    : ['admin', 'manager'].includes(user.role);

  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [extra, setExtra] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [revision, setRevision] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const saveLock = useRef(false);
  const deleteLock = useRef(false);

  const config = statusConfig[endpoint];

  const refresh = () => setRevision(v => v + 1);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setLoadError('');

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(endpoint, {
          params: { q: q.trim() },
          signal: controller.signal
        });

        if (active) {
          setRows(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (active && !controller.signal.aborted) {
          setLoadError(errMsg(e));
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, q, revision]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const extraKey = endpoint === '/vehicles'
    ? 'vehicle_type'
    : endpoint === '/employees'
      ? 'department'
      : endpoint === '/accounts'
        ? 'role'
        : null;

  const extraLabel = endpoint === '/vehicles'
    ? 'Loại phương tiện'
    : endpoint === '/employees'
      ? 'Phòng ban'
      : 'Vai trò';

  const extraOptions = useMemo(() => {
    if (!extraKey) return [];

    const field = fields.find(f => f.name === extraKey);

    if (field?.options) {
      return field.options.map(o => [
        String(o.value), o.label
      ]);
    }

    return [...new Set(
      rows.map(r => r[extraKey]).filter(Boolean)
    )].sort().map(v => [String(v), String(v)]);
  }, [rows, fields, extraKey]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const statusOK = !status || !config
        || String(r[config.key]) === status;

      const extraOK = !extra || !extraKey
        || String(r[extraKey]) === extra;

      return statusOK && extraOK;
    });
  }, [rows, status, config, extra, extraKey]);

  const totalPages = Math.max(
    1, Math.ceil(filtered.length / pageSize)
  );

  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleRows = filtered.slice(start, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, status, extra, pageSize, endpoint]);

  useEffect(() => {
    setPage(p => Math.min(p, totalPages));
  }, [totalPages]);

  const openNew = () => {
    setErr('');
    setForm(Object.fromEntries(
      fields.filter(f => f.default !== undefined)
        .map(f => [f.name, f.default])
    ));
  };

  const openEdit = r => {
    setErr('');
    setForm({ ...r, password: '' });
  };

  const set = (key, value) => {
    setForm(old => old ? { ...old, [key]: value } : old);
  };

  const closeForm = () => {
    if (!saveLock.current) setForm(null);
  };

  const save = async e => {
    e.preventDefault();

    if (saveLock.current || !form) return;

    setErr('');

    if (form.valid_from && form.valid_to
      && form.valid_from > form.valid_to) {
      setErr('Ngày hết hạn không được trước ngày bắt đầu.');
      return;
    }

    if (form.time_from && form.time_to
      && form.time_from > form.time_to) {
      setErr('Giờ kết thúc không được trước giờ bắt đầu.');
      return;
    }

    const payload = Object.fromEntries(
      fields.filter(f => form[f.name] !== undefined)
        .map(f => [
          f.name,
          typeof form[f.name] === 'string'
            && f.type !== 'password'
            ? form[f.name].trim()
            : form[f.name]
        ])
    );

    if (fields.some(f =>
      f.required && !String(payload[f.name] ?? '').trim()
    )) {
      setErr('Vui lòng nhập đầy đủ thông tin bắt buộc.');
      return;
    }

    if (endpoint === '/accounts' && !form.id
      && !payload.password) {
      setErr('Vui lòng nhập mật khẩu.');
      return;
    }

    saveLock.current = true;
    setSaving(true);

    try {
      if (form.id) {
        await api.put(`${endpoint}/${form.id}`, payload);
        setNotice('Cập nhật thông tin thành công.');
      } else {
        await api.post(endpoint, payload);
        setNotice('Thêm bản ghi thành công.');
      }

      setForm(null);
      refresh();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const askDelete = r => {
    setDeleteError('');
    setDeleting(r);
  };

  const closeDelete = () => {
    if (!deleteLock.current) setDeleting(null);
  };

  const confirmDelete = async () => {
    if (!deleting || deleteLock.current) return;

    deleteLock.current = true;
    setDeleteBusy(true);
    setDeleteError('');

    try {
      await api.delete(`${endpoint}/${deleting.id}`);
      setDeleting(null);
      setNotice('Xóa bản ghi thành công.');
      refresh();
    } catch (e) {
      setDeleteError(errMsg(e));
    } finally {
      deleteLock.current = false;
      setDeleteBusy(false);
    }
  };

  const recordName = r =>
    r?.plate_number || r?.full_name
    || r?.username || `#${r?.id}`;

  const resetFilters = () => {
    setQ('');
    setStatus('');
    setExtra('');
    setPage(1);
  };

  return (
    <div className="sg-resource-page">

      <div className="sg-resource-header">
        <div>
          <h2>{title}</h2>
          <p>{descriptions[endpoint]}</p>
        </div>

        {canWrite && (
          <button className="btn sg-resource-btn" onClick={openNew}>
            <Plus size={18} /> Thêm mới
          </button>
        )}
      </div>

      <div className="sg-resource-stats">
        <div className="sg-resource-stat">
          <span className="sg-stat-icon">
            <Database size={21} />
          </span>
          <div>
            <small>Số bản ghi tìm được</small>
            <strong>{loading || loadError ? '—' : rows.length}</strong>
          </div>
        </div>

        {config?.options.map(([value, label]) => (
          <div className="sg-resource-stat" key={value}>
            <span className="sg-stat-icon">
              <Filter size={20} />
            </span>
            <div>
              <small>{label}</small>
              <strong>
                {loading || loadError ? '—' : rows.filter(
                  r => String(r[config.key]) === value
                ).length}
              </strong>
            </div>
          </div>
        ))}
      </div>

      <div className="sg-resource-toolbar">
        <div className="sg-resource-search">
          <Search size={18} />
          <input
            placeholder={searchHint || 'Tìm kiếm...'}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && (
            <button type="button" onClick={() => setQ('')}
              aria-label="Xóa từ khóa">
              <X size={16} />
            </button>
          )}
        </div>

        {config && (
          <select aria-label="Lọc trạng thái"
            value={status}
            onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {config.options.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        )}

        {extraKey && (
          <select aria-label={extraLabel}
            value={extra}
            onChange={e => setExtra(e.target.value)}>
            <option value="">{extraLabel}: Tất cả</option>
            {extraOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        )}

        <button className="btn g sg-resource-btn"
          disabled={loading} onClick={refresh}>
          <RefreshCw size={16}
            className={loading ? 'sg-resource-spin' : ''} />
          Làm mới
        </button>

        {(q || status || extra) && (
          <button className="btn g sg-resource-btn"
            onClick={resetFilters}>
            <X size={16} /> Xóa lọc
          </button>
        )}
      </div>

      <div className="card sg-resource-table-card">
        {loading ? (
          <div className="sg-resource-empty" role="status">
            <RefreshCw size={28} className="sg-resource-spin" />
            <strong>Đang tải dữ liệu...</strong>
          </div>
        ) : loadError ? (
          <div className="sg-resource-empty" role="alert">
            <AlertCircle size={30} />
            <strong>Không thể tải dữ liệu</strong>
            <span>{loadError}</span>
            <button className="btn" onClick={refresh}>Thử lại</button>
          </div>
        ) : !filtered.length ? (
          <div className="sg-resource-empty">
            <Database size={32} />
            <strong>Không tìm thấy bản ghi</strong>
            <span>Thử thay đổi từ khóa hoặc bộ lọc.</span>
          </div>
        ) : (
          <div className="sg-resource-table-scroll">
            <DataTable
              columns={columns}
              rows={visibleRows}
              actions={canWrite && (r => (
                <div className="sg-row-actions">
                  <button className="btn g sm sg-resource-btn"
                    onClick={() => openEdit(r)}>
                    <Pencil size={13} /> Sửa
                  </button>

                  {canDelete && !(
                    endpoint === '/accounts'
                    && String(r.id) === String(user.id)
                  ) && (
                    <button className="btn r sm sg-resource-btn"
                      onClick={() => askDelete(r)}>
                      <Trash2 size={13} /> Xóa
                    </button>
                  )}
                </div>
              ))}
            />
          </div>
        )}

        {!loading && !loadError && (
          <div className="sg-pagination">
            <span>
              Hiển thị {filtered.length ? start + 1 : 0}
              –{Math.min(start + pageSize, filtered.length)}
              {' / '}{filtered.length} bản ghi
            </span>

            <div className="sg-pagination-controls">
              <select
                aria-label="Số bản ghi mỗi trang"
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
              >
                {[10, 20, 50].map(n => (
                  <option key={n} value={n}>{n} / trang</option>
                ))}
              </select>

              <button
                className="btn g sm"
                aria-label="Trang trước"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={17} />
              </button>

              <strong>{currentPage} / {totalPages}</strong>

              <button
                className="btn g sm"
                aria-label="Trang tiếp theo"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {form && (
        <Modal
          title={form.id ? 'Cập nhật thông tin' : 'Thêm mới'}
          onClose={closeForm}
        >
          <form onSubmit={save}>
            <div className="fgrid sg-resource-form-grid">
              {fields.map(f => (
                <SmartField
                  key={f.name}
                  f={f}
                  value={form[f.name]}
                  onChange={set}
                  disabled={saving}
                />
              ))}
            </div>

            {err && <p className="err" role="alert">{err}</p>}

            <div className="mf">
              <button type="button" className="btn g"
                disabled={saving} onClick={closeForm}>
                Hủy bỏ
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Xác nhận xóa" onClose={closeDelete}>
          <div className="sg-delete-confirm">
            <div className="sg-delete-icon">
              <Trash2 size={29} />
            </div>

            <h3>Xóa bản ghi này?</h3>

            <p>Bạn có chắc chắn muốn xóa</p>
            <strong>{recordName(deleting)}</strong>
            <p>Thao tác này không thể hoàn tác.</p>

            {deleteError && (
              <p className="err" role="alert">{deleteError}</p>
            )}

            <div className="sg-delete-buttons">
              <button className="btn g"
                disabled={deleteBusy} onClick={closeDelete}>
                Hủy bỏ
              </button>
              <button className="btn r"
                disabled={deleteBusy} onClick={confirmDelete}>
                {deleteBusy ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {notice && (
        <div className="sg-resource-toast" role="status">
          <CheckCircle2 size={23} />
          <div>
            <strong>Thành công</strong>
            <span>{notice}</span>
          </div>
          <button aria-label="Đóng thông báo"
            onClick={() => setNotice('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
