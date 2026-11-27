import { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ShieldCheck, LayoutDashboard, Video, History,
  CarFront, Users, ContactRound, UserCog,
  LogOut, X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';

const groups = [
  {
    title: 'GIÁM SÁT',
    items: [
      ['/', 'Tổng quan', LayoutDashboard],
      ['/gate', 'Giám sát trực tiếp', Video],
      ['/history', 'Lịch sử ra vào', History],
    ],
  },
  {
    title: 'QUẢN LÝ DỮ LIỆU',
    items: [
      ['/vehicles', 'Phương tiện', CarFront, ['admin', 'manager']],
      ['/employees', 'Nhân viên', Users, ['admin', 'manager']],
      ['/visitors', 'Khách đến', ContactRound],
    ],
  },
  {
    title: 'HỆ THỐNG',
    items: [
      ['/accounts', 'Tài khoản', UserCog, ['admin']],
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const logoutDialog = useRef(null);

  return (
    <aside className={`sg-sidebar ${open ? 'show' : ''}`}>
      <div className="sg-brand">
        <div className="sg-brand-icon">
          <ShieldCheck size={27} />
        </div>
        <div>
          <strong>SMART GATE AI</strong>
          <small>SECURITY MANAGEMENT</small>
        </div>
        <button className="sg-sidebar-close"
          onClick={onClose} aria-label="Đóng menu">
          <X size={20} />
        </button>
      </div>

      <nav className="sg-navigation">
        {groups.map(group => {
          const items = group.items.filter(item =>
            !item[3] ||
            (Array.isArray(item[3])
              ? item[3].includes(user.role)
              : item[3] === user.role)
          );
          if (!items.length) return null;

          return (
            <section className="sg-nav-group" key={group.title}>
              <div className="sg-nav-label">{group.title}</div>
              {items.map(([to, label, Icon]) => (
                <NavLink key={to} to={to}
                  end={to === '/'} onClick={onClose}>
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </section>
          );
        })}
      </nav>

      <div className="sg-sidebar-footer">
        <div className="sg-profile">
          <div className="sg-avatar">
            {(user.full_name || user.username || 'U')
              .charAt(0).toUpperCase()}
          </div>
          <div className="sg-profile-info">
            <strong>{user.full_name || user.username}</strong>
            <small>{ROLES[user.role]}</small>
          </div>
        </div>

        <button className="sg-logout" onClick={() => logoutDialog.current?.showModal()}>
          <LogOut size={18} />
          Đăng xuất
        </button>

        <div className="sg-version">
          SMART GATE AI · v1.0
        </div>
      </div>

      <dialog ref={logoutDialog}
        className="sg-logout-dialog"
        aria-labelledby="sg-logout-title"
        aria-describedby="sg-logout-description"
      >
        <div className="sg-logout-symbol">
          <LogOut size={29}/>
        </div>

        <h2 id="sg-logout-title">Xác nhận đăng xuất</h2>

        <p id="sg-logout-description">
          Bạn có chắc chắn muốn đăng xuất khỏi hệ thống
          SMART GATE AI không?
        </p>

        <div className="sg-logout-actions">
          <button type="button" autoFocus
            className="sg-logout-cancel"
            onClick={() => logoutDialog.current?.close()}>
            Hủy bỏ
          </button>

          <button type="button"
            className="sg-logout-confirm"
            onClick={() => {
              logoutDialog.current?.close();
              logout();
            }}>
            Đăng xuất
          </button>
        </div>
      </dialog>

    </aside>
  );
}
