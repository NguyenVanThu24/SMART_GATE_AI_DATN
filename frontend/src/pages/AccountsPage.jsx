import { useEffect, useState, useRef } from 'react';
import {
  Users, UserCheck, ShieldCheck, Lock, Unlock,
  Plus, Search, Pencil, KeyRound, RefreshCw, X
} from 'lucide-react';
import api, { errMsg } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ROLES, fmtDate } from '../utils/constants';
import '../styles/accounts.css';

const empty = {
  username: '',
  full_name: '',
  password: '',
  role: 'guard',
  is_active: 1
};

export default function AccountsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [mode, setMode] = useState('create');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const dialog = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/accounts');
      setRows(data);
      setError('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const protectedAccount = r =>
    Number(r.id) === Number(user.id) ||
    (r.role === 'admin' && Number(r.is_active) === 1);

  const filtered = rows.filter(r =>
    (!role || r.role === role) &&
    (status === '' || String(Number(r.is_active)) === status) &&
    `${r.username} ${r.full_name}`
      .toLowerCase().includes(query.trim().toLowerCase())
  );

  const stats = [
    ['Tổng tài khoản', rows.length, Users, 'blue'],
    ['Đang hoạt động', rows.filter(r => Number(r.is_active)).length, UserCheck, 'green'],
    ['Quản trị viên', rows.filter(r => r.role === 'admin').length, ShieldCheck, 'purple'],
    ['Đã khóa', rows.filter(r => !Number(r.is_active)).length, Lock, 'red']
  ];

  const open = (type, row = null) => {
    setMode(type);
    setSelected(row);
    setForm(row ? { ...row, password: '' } : { ...empty });
    setFormError('');
    dialog.current.showModal();
  };

  const change = (key, value) =>
    setForm(f => ({ ...f, [key]: value }));

  const save = async e => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setFormError('');
    setMessage('');

    try {
      if (mode === 'password') {
        await api.put(`/accounts/${selected.id}`, {
          password: form.password
        });
      } else if (mode === 'toggle') {
        await api.put(`/accounts/${selected.id}`, {
          is_active: Number(selected.is_active) ? 0 : 1
        });
      } else {
        const payload = {
          username: form.username.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          is_active: Number(form.is_active)
        };

        if (mode === 'create') {
          payload.password = form.password;
          await api.post('/accounts', payload);
        } else {
          await api.put(`/accounts/${selected.id}`, payload);
        }
      }

      dialog.current.close();
      setForm({ ...empty });
      setMessage('Cập nhật tài khoản thành công');
      await load();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    create: 'Thêm tài khoản mới',
    edit: 'Chỉnh sửa tài khoản',
    password: 'Đặt lại mật khẩu',
    toggle: Number(selected?.is_active)
      ? 'Xác nhận khóa tài khoản'
      : 'Xác nhận mở khóa'
  };

  return (
    <div className="sg-accounts">
      <header className="acc-header">
        <div>
          <small>SECURITY MANAGEMENT</small>
          <h2>Quản lý tài khoản</h2>
          <p>Quản lý người dùng và quyền truy cập hệ thống.</p>
        </div>
        <button className="btn" onClick={() => open('create')}>
          <Plus size={18}/> Thêm tài khoản
        </button>
      </header>

      <div className="acc-stats">
        {stats.map(([label, value, Icon, color]) => (
          <div className="card acc-stat" key={label}>
            <div className={`acc-icon ${color}`}>
              <Icon size={23}/>
            </div>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {message && <div className="acc-success" role="status">{message}</div>}
      {error && <p className="err" role="alert">{error}</p>}

      <section className="card">
        <div className="acc-header">
          <h3>Danh sách tài khoản</h3>
          <button className="btn g" onClick={load} disabled={loading}>
            <RefreshCw size={16}/> Làm mới
          </button>
        </div>

        <div className="acc-filters">
          <div className="acc-search">
            <Search size={18}/>
            <input value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm tên hoặc tài khoản..."/>
          </div>

          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="">Tất cả vai trò</option>
            {Object.entries(ROLES).map(([v, label]) =>
              <option key={v} value={v}>{label}</option>
            )}
          </select>

          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="1">Hoạt động</option>
            <option value="0">Đã khóa</option>
          </select>
        </div>

        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Đăng nhập cuối</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="acc-user">
                      <div className="acc-avatar">
                        {r.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong>{r.username}</strong>
                        <small>{r.full_name}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`acc-role ${r.role}`}>
                      {ROLES[r.role]}
                    </span>
                  </td>
                  <td>
                    <span className={Number(r.is_active) ? 'acc-active' : 'acc-locked'}>
                      {Number(r.is_active) ? '● Hoạt động' : '● Đã khóa'}
                    </span>
                  </td>
                  <td>{fmtDate(r.last_login)}</td>
                  <td>
                    <div className="acc-actions">
                      <button className="btn g sm" title="Chỉnh sửa"
                        onClick={() => open('edit', r)}>
                        <Pencil size={15}/> Sửa
                      </button>
                      <button className="btn g sm" title="Đặt lại mật khẩu"
                        onClick={() => open('password', r)}>
                        <KeyRound size={15}/> Mật khẩu
                      </button>
                      <button className="btn g sm"
                        disabled={protectedAccount(r)}
                        onClick={() => open('toggle', r)}>
                        {Number(r.is_active) ? <Lock size={15}/> : <Unlock size={15}/>}
                        {protectedAccount(r) ? 'Bảo vệ' : Number(r.is_active) ? 'Khóa' : 'Mở khóa'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={5} className="empty">
                    {loading ? 'Đang tải dữ liệu...' : 'Không có tài khoản phù hợp'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="acc-note">
          Hiển thị {filtered.length}/{rows.length} tài khoản.
          Ưu tiên khóa thay vì xóa để bảo toàn lịch sử hoạt động.
        </p>
      </section>

      <dialog ref={dialog} className="acc-dialog"
        onCancel={e => { if (busy) e.preventDefault(); }}
        aria-labelledby="acc-dialog-title">
        <form onSubmit={save}>
          <div className="acc-header">
            <h3 id="acc-dialog-title">{titles[mode]}</h3>
            <button type="button" className="btn g sm"
              disabled={busy} onClick={() => dialog.current.close()}
              aria-label="Đóng">
              <X size={20}/>
            </button>
          </div>

          {(mode === 'create' || mode === 'edit') && (
            <div className="acc-form">
              <label>Tên đăng nhập *
                <input required maxLength={50}
                  value={form.username}
                  onChange={e => change('username', e.target.value)}/>
              </label>
              <label>Họ và tên *
                <input required maxLength={100}
                  value={form.full_name}
                  onChange={e => change('full_name', e.target.value)}/>
              </label>
              <label>Vai trò
                <select value={form.role}
                  disabled={selected && protectedAccount(selected)}
                  onChange={e => change('role', e.target.value)}>
                  {Object.entries(ROLES).map(([v, label]) =>
                    <option key={v} value={v}>{label}</option>
                  )}
                </select>
              </label>
              <label>Trạng thái
                <select value={form.is_active}
                  disabled={selected && protectedAccount(selected)}
                  onChange={e => change('is_active', e.target.value)}>
                  <option value={1}>Hoạt động</option>
                  <option value={0}>Đã khóa</option>
                </select>
              </label>
            </div>
          )}

          {(mode === 'create' || mode === 'password') && (
            <label className="acc-password">
              {mode === 'password' ? 'Mật khẩu mới' : 'Mật khẩu'} *
              <input type="password" required minLength={10}
                maxLength={72} autoComplete="new-password"
                value={form.password}
                onChange={e => change('password', e.target.value)}/>
              <small>
                Tối thiểu 10 ký tự, có chữ hoa, chữ thường,
                số và ký tự đặc biệt.
              </small>
            </label>
          )}

          {mode === 'toggle' && (
            <p>Bạn có chắc chắn muốn
              {Number(selected?.is_active) ? ' khóa ' : ' mở khóa '}
              tài khoản <strong>{selected?.username}</strong> không?
            </p>
          )}

          {formError && <p className="err" role="alert">{formError}</p>}

          <div className="acc-dialog-actions">
            <button type="button" className="btn g" disabled={busy}
              onClick={() => dialog.current.close()}>Hủy bỏ</button>
            <button className="btn" disabled={busy}>
              {busy ? 'Đang xử lý...' : 'Xác nhận'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
