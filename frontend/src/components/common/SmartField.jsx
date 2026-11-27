import { useEffect, useId, useRef, useState } from 'react';
import { Search, UserPlus, Plus, X } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function SmartField({ f, value, onChange, disabled }) {
  const { user } = useAuth();
  const uid = useId();
  const [opts, setOpts] = useState([]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);

  const isEmployee = f.optionsFrom === '/employees';

  const canCreate = isEmployee
    ? ['admin', 'manager'].includes(user.role)
    : f.optionsFrom === '/departments' && user.role === 'admin';

  useEffect(() => {
    if (!f.optionsFrom) return;

    let active = true;
    setLoading(true);

    api.get(f.optionsFrom)
      .then(({ data }) => {
        if (active) setOpts(data);
      })
      .catch(e => {
        if (active) setError(errMsg(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [f.optionsFrom]);

  const selected = opts.find(
    x => String(x.id) === String(value)
  );

  const normalize = text => String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

  const filtered = opts.filter(x =>
    normalize(`${x[f.optLabel] || ''} ${x.employee_code || ''}`)
      .includes(normalize(query))
  );

  const updateDraft = (key, val) =>
    setDraft(s => ({ ...s, [key]: val }));

  const startCreate = () => {
    setError('');
    setDraft(isEmployee
      ? { full_name: query.trim(), employee_code: '', phone: '', position: '' }
      : { name: query.trim() });
    setCreating(true);
  };

  const create = async () => {
    if (lock.current || disabled) return;
    setError('');

    const payload = Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [k, v.trim()])
    );

    if (isEmployee && (!payload.full_name || !payload.employee_code)) {
      setError('Vui lòng nhập họ tên và mã nhân viên.');
      return;
    }

    if (!isEmployee && !payload.name) {
      setError('Vui lòng nhập tên phòng ban.');
      return;
    }

    lock.current = true;
    setBusy(true);

    try {
      const { data } = await api.post(f.optionsFrom, payload);

      if (!data.id) throw new Error('Missing record ID');

      setOpts(old => [...old, { ...payload, id: data.id }]);
      onChange(f.name, String(data.id));
      setQuery('');
      setCreating(false);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const common = {
    id: uid,
    value: value ?? '',
    required: f.required,
    disabled,
    onChange: e => onChange(f.name, e.target.value)
  };

  if (!f.optionsFrom) {
    return (
      <div className="sg-smart-field">
        <label htmlFor={uid}>
          {f.label}{f.required && <span className="sg-required"> *</span>}
        </label>

        {f.type === 'select' ? (
          <select {...common}>
            {f.allowEmpty && <option value="">— Không chọn —</option>}
            {(f.options || []).map(o =>
              <option key={o.value} value={o.value}>{o.label}</option>
            )}
          </select>
        ) : (
          <>
            <input
              {...common}
              type={f.type || 'text'}
              list={f.suggestions ? `${uid}-list` : undefined}
              placeholder={f.placeholder || ''}
              maxLength={f.maxLength}
              autoComplete={f.type === 'password' ? 'new-password' : undefined}
            />
            {f.suggestions && (
              <datalist id={`${uid}-list`}>
                {f.suggestions.map(x => <option key={x} value={x} />)}
              </datalist>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sg-smart-field">
      <label htmlFor={uid}>{f.label}</label>

      <div className="sg-field-search">
        <Search size={16} />
        <input
          value={query}
          disabled={disabled || busy}
          onChange={e => setQuery(e.target.value)}
          placeholder={isEmployee ? 'Tìm tên hoặc mã nhân viên...' : 'Tìm phòng ban...'}
          aria-label={`Tìm ${f.label}`}
        />
      </div>

      <select {...common} disabled={disabled || loading || busy}>
        <option value="">— Không chọn —</option>

        {selected && !filtered.some(x => x.id === selected.id) && (
          <option value={selected.id}>{selected[f.optLabel]}</option>
        )}

        {value && !selected && (
          <option value={value}>Bản ghi #{value}</option>
        )}

        {filtered.map(x => (
          <option key={x.id} value={x.id}>
            {x[f.optLabel]}{x.employee_code ? ` — ${x.employee_code}` : ''}
          </option>
        ))}
      </select>

      {loading && <small>Đang tải dữ liệu...</small>}

      {!loading && query && !filtered.length && (
        <small>Không tìm thấy kết quả phù hợp.</small>
      )}

      {canCreate && !creating && (
        <button
          type="button"
          className="sg-add-related"
          disabled={disabled || busy || loading}
          onClick={startCreate}
        >
          {isEmployee ? <UserPlus size={15} /> : <Plus size={15} />}
          {isEmployee ? 'Thêm nhân viên mới' : 'Thêm phòng ban mới'}
        </button>
      )}

      {creating && (
        <div className="sg-related-editor">
          <div className="sg-related-heading">
            <strong>{isEmployee ? 'Nhân viên mới' : 'Phòng ban mới'}</strong>
            <button type="button" disabled={busy} onClick={() => setCreating(false)}>
              <X size={16} />
            </button>
          </div>

          <small>Dữ liệu sẽ được lưu riêng ngay khi bấm Tạo và chọn.</small>

          {isEmployee ? (
            <>
              <label>Họ và tên *</label>
              <input maxLength={100} value={draft.full_name} disabled={busy} onChange={e => updateDraft('full_name', e.target.value)} />
              <label>Mã nhân viên *</label>
              <input maxLength={20} value={draft.employee_code} disabled={busy} onChange={e => updateDraft('employee_code', e.target.value)} />
              <label>Số điện thoại</label>
              <input maxLength={15} value={draft.phone} disabled={busy} onChange={e => updateDraft('phone', e.target.value)} />
              <label>Chức vụ</label>
              <input maxLength={100} value={draft.position} disabled={busy} onChange={e => updateDraft('position', e.target.value)} />
            </>
          ) : (
            <>
              <label>Tên phòng ban *</label>
              <input maxLength={100} value={draft.name} disabled={busy} onChange={e => updateDraft('name', e.target.value)} />
            </>
          )}

          <button
            type="button"
            className="btn"
            disabled={busy || disabled}
            onClick={create}
          >
            {busy ? 'Đang tạo...' : 'Tạo và chọn'}
          </button>
        </div>
      )}

      {error && <small className="sg-field-error" role="alert">{error}</small>}
    </div>
  );
}
