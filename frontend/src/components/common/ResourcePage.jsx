import { useCallback, useEffect, useState } from 'react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import DataTable from './DataTable';
import Modal from './Modal';

function Field({ f, value, onChange }) {
  const [opts, setOpts] = useState(f.options || []);
  useEffect(() => {
    if (f.optionsFrom) api.get(f.optionsFrom).then((r) => setOpts(r.data.map((x) => ({ value: x.id, label: x[f.optLabel] }))));
  }, [f.optionsFrom, f.optLabel]);
  const common = { value: value ?? '', required: f.required, onChange: (e) => onChange(f.name, e.target.value) };
  return (
    <div><label>{f.label}</label>
      {f.type === 'select'
        ? <select {...common}>{f.allowEmpty && <option value="">— Không chọn —</option>}{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : <input {...common} type={f.type || 'text'} />}
    </div>
  );
}

export default function ResourcePage({ title, endpoint, columns, fields, searchHint }) {
  const { user } = useAuth();
  const canWrite = endpoint === '/visitors' ? true : ['admin', 'manager'].includes(user.role);
  const canDelete = ['admin', 'manager'].includes(user.role);
  const [rows, setRows] = useState([]); const [q, setQ] = useState('');
  const [form, setForm] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(() => api.get(endpoint, { params: { q } }).then((r) => setRows(r.data)), [endpoint, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const openNew = () => { setErr(''); setForm(Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]))); };
  const openEdit = (r) => { setErr(''); setForm({ ...r, password: '' }); };
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    try { form.id ? await api.put(`${endpoint}/${form.id}`, form) : await api.post(endpoint, form); setForm(null); load(); }
    catch (x) { setErr(errMsg(x)); }
  };
  const del = async (r) => {
    if (!confirm('Xóa bản ghi này?')) return;
    try { await api.delete(`${endpoint}/${r.id}`); load(); } catch (x) { alert(errMsg(x)); }
  };
  return (
    <>
      <div className="top"><h2>{title}</h2></div>
      <div className="tool">
        <input placeholder={`🔎 ${searchHint || 'Tìm kiếm...'}`} value={q} onChange={(e) => setQ(e.target.value)} />
        {canWrite && <button className="btn" onClick={openNew}>+ Thêm mới</button>}
      </div>
      <div className="card">
        <DataTable columns={columns} rows={rows} actions={canWrite && ((r) => (<>
          <button className="btn g sm" onClick={() => openEdit(r)}>Sửa</button>
          {canDelete && <button className="btn r sm" onClick={() => del(r)}>Xóa</button>}</>))} />
      </div>
      {form && (
        <Modal title={form.id ? 'Cập nhật' : 'Thêm mới'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <div className="fgrid">{fields.map((f) => <Field key={f.name} f={f} value={form[f.name]} onChange={set} />)}</div>
            {err && <p className="err">{err}</p>}
            <div className="mf"><button type="button" className="btn g" onClick={() => setForm(null)}>Hủy</button><button className="btn">Lưu</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
