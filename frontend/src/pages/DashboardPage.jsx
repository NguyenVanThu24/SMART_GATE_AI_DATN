import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import useSocket from '../hooks/useSocket';
import StatCard from '../components/common/StatCard';
import LogTable from '../components/common/LogTable';
export default function DashboardPage() {
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get('/dashboard').then((r) => setD(r.data)), []);
  useEffect(() => { load(); }, [load]);
  useSocket('plate:detected', load); useSocket('plate:updated', load);
  if (!d) return <p>Đang tải...</p>;
  const max = Math.max(1, ...d.week.map((w) => w.c));
  return (
    <>
      <div className="top"><h2>Tổng quan</h2></div>
      <div className="grid g4">
        <StatCard value={d.stats.vehicles} label="Xe đã đăng ký" />
        <StatCard value={d.stats.inside} label="Xe đang trong cơ quan" />
        <StatCard value={d.stats.visitorsToday} label="Khách hôm nay" />
        <StatCard value={d.stats.deniedToday} label="Lượt bị từ chối hôm nay" color="var(--er)" />
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Lượt ra/vào 7 ngày qua</h3>
        <div className="bars">{d.week.map((w) => (
          <div key={w.d} className="barc"><i>{w.c}</i><div style={{ height: `${(w.c / max) * 100}%` }} /><small>{w.d}</small></div>))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}><h3>Hoạt động gần đây</h3><LogTable rows={d.recent} /></div>
    </>
  );
}
