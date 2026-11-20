import { useEffect, useState } from 'react';
import api, { errMsg } from '../services/api';
import useSocket from '../hooks/useSocket';
import PlateBadge from '../components/common/PlateBadge';
import StatusBadge from '../components/common/StatusBadge';
import LogTable from '../components/common/LogTable';
import { RESULTS } from '../utils/constants';

const BARRIER = { open: ['ok', 'Đang mở'], closed: ['mu', 'Đóng'], error: ['er', 'Lỗi'] };
export default function GateMonitorPage() {
  const [gates, setGates] = useState([]); const [logs, setLogs] = useState([]);
  const [sim, setSim] = useState({ gate: 1, plate: '29A-123.45' }); const [msg, setMsg] = useState('');
  const load = () => { api.get('/gates').then((r) => setGates(r.data)); api.get('/history', { params: { limit: 15 } }).then((r) => setLogs(r.data)); };
  useEffect(load, []);
  useSocket('plate:detected', (row) => setLogs((l) => [row, ...l].slice(0, 15)));
  useSocket('plate:updated', (row) => setLogs((l) => l.map((x) => (x.id === row.id ? row : x))));
  useSocket('barrier:status', ({ gate_id, status }) => setGates((g) => g.map((x) => (x.id === gate_id ? { ...x, barrier_status: status } : x))));

  const act = (fn) => fn().catch((e) => setMsg(errMsg(e)));
  const barrier = (id, action) => act(() => api.post(`/gates/${id}/barrier`, { action }));
  const simulate = (e) => { e.preventDefault(); setMsg(''); act(() => api.post(`/gates/${sim.gate}/simulate`, { plate: sim.plate })); };
  const resolve = (id, action) => act(() => api.put(`/history/${id}/resolve`, { action }));
  const last = logs[0];
  return (
    <>
      <div className="top"><h2>Giám sát cổng</h2></div>
      <div className="grid g2">
        <div className="card"><h3>Nhận diện mới nhất</h3>
          <div className="cam" style={{ position: 'relative', overflow: 'hidden' }}>
            <img
              src={`http://${window.location.hostname}:5000/video_feed`}
              alt="Camera EZVIZ H1c - Smart Gate AI"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
            />
            <span
              className="live"
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 2
              }}
            >
              ● LIVE
            </span>
          </div>

          {last ? (<div style={{ marginTop: 12 }}>
            <p><PlateBadge>{last.plate_number}</PlateBadge> &nbsp;<StatusBadge kind={RESULTS[last.result][0]}>{RESULTS[last.result][1]}</StatusBadge></p>
            <p>{last.owner || 'Không xác định'} — {last.reason} ({last.gate_name})</p>
          </div>) : <p>Chưa có lượt nhận diện</p>}
        </div>
        <div className="card"><h3>Cổng &amp; Barrier</h3>
          {gates.map((g) => (
            <div key={g.id} className="grow"><div><b>{g.name}</b><br /><StatusBadge kind={BARRIER[g.barrier_status][0]}>{BARRIER[g.barrier_status][1]}</StatusBadge></div>
              <div><button className="btn o sm" onClick={() => barrier(g.id, 'open')}>Mở</button> <button className="btn r sm" onClick={() => barrier(g.id, 'close')}>Đóng</button></div></div>))}
          <h3 style={{ marginTop: 16 }}>Giả lập nhận diện (test)</h3>
          <form onSubmit={simulate}>
            <select value={sim.gate} onChange={(e) => setSim({ ...sim, gate: e.target.value })}>{gates.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            <input style={{ marginTop: 8 }} value={sim.plate} onChange={(e) => setSim({ ...sim, plate: e.target.value })} placeholder="Biển số" />
            <button className="btn full" style={{ marginTop: 8 }}>Gửi nhận diện</button>
          </form>
          {msg && <p className="err">{msg}</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}><h3>Lượt gần đây (realtime)</h3>
        <LogTable rows={logs} actions={(r) => r.result === 'pending' && (<>
          <button className="btn o sm" onClick={() => resolve(r.id, 'allow')}>Cho qua</button>
          <button className="btn r sm" onClick={() => resolve(r.id, 'deny')}>Từ chối</button></>)} />
      </div>
    </>
  );
}
