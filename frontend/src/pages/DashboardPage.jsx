import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CarFront, Warehouse, Users, ShieldAlert, Clock3,
  RefreshCw, ArrowRight, Activity, AlertCircle,
  BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell
} from 'recharts';

import api from '../services/api';
import useSocket from '../hooks/useSocket';
import LogTable from '../components/common/LogTable';
import '../styles/dashboard.css';

const cards = [
  { key: 'vehicles', label: 'Xe đã đăng ký',
    Icon: CarFront, color: '#2563eb', bg: '#dbeafe' },
  { key: 'inside', label: 'Xe bên trong (ước tính)',
    Icon: Warehouse, color: '#16a34a', bg: '#dcfce7' },
  { key: 'visitorsToday', label: 'Khách hôm nay',
    Icon: Users, color: '#7c3aed', bg: '#ede9fe' },
  { key: 'deniedToday', label: 'Từ chối hôm nay',
    Icon: ShieldAlert, color: '#dc2626', bg: '#fee2e2' },
  { key: 'pending', label: 'Chờ xác nhận',
    Icon: Clock3, color: '#d97706', bg: '#fef3c7' },
];

function fillWeek(rows) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());

  const part = type => Number(date.find(p => p.type === type).value);
  const today = Date.UTC(part('year'), part('month') - 1, part('day'));
  const counts = new Map(rows.map(row => [row.d, Number(row.c)]));

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today - (6 - i) * 86400000);
    const d = `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}`;
    return { d, c: counts.get(d) || 0 };
  });
}

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  const active = useRef(null);

  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);

    try {
      const response = await api.get('/dashboard', {
        params: { days },
        signal: controller.signal,
        timeout: 10000
      });

      if (controller.signal.aborted) return;

      setData(response.data);
      setUpdated(new Date());
      setError('');
    } catch (e) {
      if (!controller.signal.aborted) {
        setError('Không thể tải dữ liệu thống kê. Vui lòng thử lại.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => {
      clearInterval(timer);
      active.current?.abort();
    };
  }, [load]);

  useSocket('plate:detected', load);
  useSocket('plate:updated', load);
  useSocket('connect', load);

  const week = data?.traffic || [];
  const outcomes = [
    ['Cho phép', 'allowed', '#16a34a'],
    ['Từ chối', 'denied', '#dc2626'],
    ['Duyệt thủ công', 'manual', '#2563eb'],
    ['Chờ xác nhận', 'pending', '#d97706']
  ].map(([name, key, color]) => ({
    name, color,
    value: week.reduce((sum, row) => sum + Number(row[key] || 0), 0)
  }));
  const services = data?.services;
  const countStatus = (rows, status) =>
    Number(rows?.find(row => row.status === status)?.total || 0);
  const healthRows = [
    ['Backend API', services?.backend],
    ['Cơ sở dữ liệu MySQL', services?.database],
    ['AI Engine', services?.ai?.reachable ? true : null],
    ['Camera IP', services?.ai?.camera],
    ['Kết nối MQTT', services?.mqtt?.connected],
    ['ESP32', services?.hardwareMode === 'mqtt'
      ? services?.mqtt?.device === 'online' ? true
      : services?.mqtt?.device === 'offline' ? false : null
      : null]
  ];
  const total = week.reduce((sum, row) => sum + Number(row.c || 0), 0);

  return (
    <div className="sg-dashboard">
      <div className="sg-page-heading">
        <div>
          <div className="sg-eyebrow">
            <Activity size={15} /> SMART SECURITY SYSTEM
          </div>
          <h1>Tổng quan hệ thống</h1>
          <p>Quản lý và giám sát hoạt động ra vào phương tiện.</p>
        </div>

        <div className="sg-dashboard-actions">
          <select value={days}
            aria-label="Khoảng thời gian thống kê"
            onChange={e => setDays(Number(e.target.value))}>
            <option value={1}>Hôm nay</option>
            <option value={7}>7 ngày gần nhất</option>
            <option value={30}>30 ngày gần nhất</option>
          </select>
        <button className="btn g sg-refresh"
          onClick={load} disabled={loading}>
          <RefreshCw size={16}
            className={loading ? 'sg-spinning' : ''} />
          Làm mới
        </button>
        </div>
      </div>

      {error && (
        <div className="sg-dashboard-error" role="alert">
          <AlertCircle size={19} />
          {error}
          {data && ' Đang hiển thị dữ liệu lần tải trước.'}
        </div>
      )}

      <div className="sg-stat-grid">
        {cards.map(({ key, label, Icon, color, bg }) => (
          <div className="card sg-stat-card" key={key}>
            <div className="sg-stat-icon"
              style={{ color, background: bg }}>
              <Icon size={22} strokeWidth={1.8} />
            </div>
            <strong className="sg-stat-number">
              {data ? Number(data.stats[key] ?? 0).toLocaleString('vi-VN') : '—'}
            </strong>
            <span className="sg-stat-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="sg-dashboard-grid">
        <section className="card sg-chart-card">
          <div className="sg-card-heading">
            <div>
              <h3>Lưu lượng phương tiện</h3>
              <p>Lượt nhận diện theo hướng trong {days} ngày</p>
            </div>
            <BarChart3 size={21} color="#64748b" />
          </div>

          <div className="sg-chart-total">
            {data ? total.toLocaleString('vi-VN') : '—'}
            <span> lượt ghi nhận</span>
          </div>

          <div className="sg-chart-area">
            {data ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week}
                  margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3"
                    vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="d" axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis allowDecimals={false}
                    axisLine={false} tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: '#eff6ff' }}
                    formatter={(v, name) => [v, name]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="incoming" name="Lượt vào"
                    fill="#2563eb" radius={[4,4,0,0]} maxBarSize={32} />
                  <Bar dataKey="outgoing" name="Lượt ra"
                    fill="#14b8a6" radius={[4,4,0,0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="sg-chart-placeholder">
                {loading ? 'Đang tải thống kê...' : 'Chưa tải được dữ liệu'}
              </div>
            )}
          </div>
        </section>

        <section className="card sg-summary-card">
          <div className="sg-card-heading">
            <div>
              <h3>Điều hành an ninh</h3>
              <p>Các thông tin cần theo dõi</p>
            </div>
            <ShieldAlert size={21} color="#64748b" />
          </div>

          <div className="sg-alert-summary danger">
            <ShieldAlert size={23} />
            <div>
              <strong>{data ? data.stats.deniedToday : '—'}</strong>
              <span>Lượt bị từ chối hôm nay</span>
            </div>
          </div>

          <div className="sg-alert-summary warning">
            <Clock3 size={23} />
            <div>
              <strong>{data ? data.stats.pending : '—'}</strong>
              <span>Lượt đang chờ xác nhận</span>
            </div>
          </div>

          <Link to="/gate" className="sg-action-link">
            Mở giám sát trực tiếp <ArrowRight size={16} />
          </Link>

          <div className="sg-last-update">
            Cập nhật: {updated ? updated.toLocaleTimeString('vi-VN') : '—'}
          </div>
        </section>
      </div>


      <div className="sg-advanced-grid">
        <section className="card sg-chart-card">
          <div className="sg-card-heading">
            <div>
              <h3>Kết quả nhận diện</h3>
              <p>Phân bố kết quả trong {days} ngày</p>
            </div>
          </div>

          <div className="sg-donut">
            {total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={outcomes} dataKey="value"
                    nameKey="name" innerRadius="55%"
                    outerRadius="85%" paddingAngle={2}>
                    {outcomes.map(item =>
                      <Cell key={item.name} fill={item.color} />
                    )}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="sg-chart-placeholder">
              {data ? 'Không có sự kiện' : 'Chưa tải dữ liệu'}
            </div>}
          </div>

          {outcomes.map(item => (
            <div className="sg-health-row" key={item.name}>
              <i style={{background:item.color}} />
              <span>{item.name}</span>
              <strong>{data ? item.value : '—'}</strong>
            </div>
          ))}
        </section>

        <section className="card sg-chart-card">
          <div className="sg-card-heading">
            <div>
              <h3>Trạng thái hệ thống</h3>
              <p>Kiểm tra tự động mỗi 30 giây</p>
            </div>
            <Activity size={20} />
          </div>

          {healthRows.map(([name, status]) => (
            <div className="sg-health-row" key={name}>
              <i className={error ? 'unknown'
                : status === true ? 'online'
                : status === false ? 'offline' : 'unknown'} />
              <span>{name}</span>
              <strong>{error ? 'Dữ liệu cũ'
                : status === true ? 'Hoạt động'
                : status === false ? 'Mất kết nối'
                : 'Chưa xác định'}</strong>
            </div>
          ))}

          <p className="sg-health-note">
            Trạng thái kết nối không xác nhận vị trí vật lý của barie.
          </p>
        </section>

        <section className="card sg-chart-card">
          <div className="sg-card-heading">
            <div>
              <h3>Ảnh và cảnh báo</h3>
              <p>Thống kê tích lũy từ Database</p>
            </div>
          </div>

          {[
            ['Drive đã đồng bộ', data?.drive, 'synced'],
            ['Drive chờ xử lý', data?.drive, 'pending'],
            ['Drive đang đồng bộ', data?.drive, 'syncing'],
            ['Drive thất bại', data?.drive, 'failed'],
            ['Telegram đã gửi', data?.telegram, 'sent'],
            ['Telegram chờ gửi', data?.telegram, 'pending'],
            ['Telegram đang gửi', data?.telegram, 'sending'],
            ['Telegram thất bại', data?.telegram, 'failed'],
            ['Telegram chưa xác định', data?.telegram, 'uncertain']
          ].map(([label, rows, status]) => (
            <div className="sg-health-row" key={label}>
              <span>{label}</span>
              <strong>{data ? countStatus(rows,status) : '—'}</strong>
            </div>
          ))}
          <p className="sg-health-note">
            Kết quả xử lý đã lưu, không phải kiểm tra kết nối đám mây.
          </p>
        </section>
      </div>

      <section className="card sg-recent-card">
        <div className="sg-card-heading">
          <div>
            <h3>Hoạt động ra vào gần đây</h3>
            <p>Dữ liệu mới nhất từ hệ thống nhận diện</p>
          </div>
          <Link to="/history" className="sg-history-link">
            Xem lịch sử <ArrowRight size={16} />
          </Link>
        </div>

        {data ? (
          <LogTable rows={data.recent || []} />
        ) : (
          <div className="empty">
            {loading ? 'Đang tải dữ liệu...' : 'Chưa tải được dữ liệu'}
          </div>
        )}
      </section>
    </div>
  );
}
