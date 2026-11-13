import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
const items = [
  ['/', '📊 Tổng quan'], ['/gate', '📹 Giám sát cổng'], ['/vehicles', '🚙 Phương tiện'], ['/employees', '👤 Nhân viên'],
  ['/visitors', '🧾 Khách'], ['/history', '🕘 Lịch sử ra/vào'], ['/accounts', '🔐 Tài khoản', 'admin'],
];
export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  return (
    <aside className={open ? 'show' : ''}>
      <h2>🚗 SMART GATE AI</h2>
      {items.filter((i) => !i[2] || i[2] === user.role).map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/'} onClick={onClose}>{label}</NavLink>
      ))}
      <button onClick={logout}>⎋ Đăng xuất</button>
    </aside>
  );
}
