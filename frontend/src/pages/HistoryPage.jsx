import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import LogTable from '../components/common/LogTable';
import { DIRECTION } from '../utils/constants';
export default function HistoryPage() {
  const [f, setF] = useState({ from: '', to: '', result: '', q: '' }); const [rows, setRows] = useState([]);
  const load = useCallback(() => api.get('/history', { params: f }).then((r) => setRows(r.data)), [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const exportCsv = () => {
    const head = ['Thời gian', 'Biển số', 'Chủ xe', 'Hướng', 'Cổng', 'Kết quả', 'Lý do'];
    const body = rows.map((r) => [r.created_at, r.plate_number, r.owner || '', DIRECTION[r.direction], r.gate_name, r.result, r.reason]);
    const csv = '\ufeff' + [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'lich-su-ra-vao.csv'; a.click();
  };
  return (
    <>
      <div className="top"><h2>Lịch sử ra/vào</h2></div>
      <div className="tool">
        <input type="date" value={f.from} onChange={set('from')} /><input type="date" value={f.to} onChange={set('to')} />
        <select value={f.result} onChange={set('result')}><option value="">Tất cả kết quả</option><option value="allowed">Cho phép</option><option value="denied">Từ chối</option><option value="manual">Bảo vệ duyệt</option><option value="pending">Chờ xác nhận</option></select>
        <input placeholder="🔎 Biển số / tên..." value={f.q} onChange={set('q')} />
        <button className="btn g" onClick={exportCsv}>Xuất CSV</button>
      </div>
      <div className="card"><LogTable rows={rows} /></div>
    </>
  );
}
