import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Menu, ChevronRight, Wifi, WifiOff, CalendarDays
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';
import socket from '../../services/socket';

const titles = {
  '/': 'Tổng quan',
  '/gate': 'Giám sát trực tiếp',
  '/history': 'Lịch sử ra vào',
  '/vehicles': 'Phương tiện',
  '/employees': 'Nhân viên',
  '/visitors': 'Khách đến',
  '/accounts': 'Tài khoản',
};

export default function Topbar({ onMenu }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [connected, setConnected] = useState(socket.connected);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const online = () => setConnected(true);
    const offline = () => setConnected(false);

    socket.on('connect', online);
    socket.on('disconnect', offline);
    setConnected(socket.connected);

    const timer = setInterval(() => setNow(new Date()), 1000);

    return () => {
      socket.off('connect', online);
      socket.off('disconnect', offline);
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="sg-topbar">
      <div className="sg-breadcrumb">
        <button className="sg-menu-button"
          onClick={onMenu} aria-label="Mở menu">
          <Menu size={23} />
        </button>
        <span>Hệ thống</span>
        <ChevronRight size={15} />
        <strong>{titles[pathname] || 'Quản lý'}</strong>
      </div>

      <div className="sg-topbar-right">
        <div className="sg-clock">
          <CalendarDays size={17} />
          {now.toLocaleDateString('vi-VN')}
          <strong>{now.toLocaleTimeString('vi-VN')}</strong>
        </div>

        <div className={`sg-connection ${connected ? 'online' : 'offline'}`}>
          {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
          {connected ? 'Realtime' : 'Mất kết nối'}
        </div>

        <div className="sg-topbar-user">
          <strong>{user.full_name || user.username}</strong>
          <small>{ROLES[user.role]}</small>
        </div>
      </div>
    </header>
  );
}
