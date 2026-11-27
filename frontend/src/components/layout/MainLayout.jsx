import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import '../../styles/layout.css';

export default function MainLayout() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  return (
    <div className="sg-shell">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      {open && (
        <button className="sg-backdrop"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)} />
      )}

      <main className="sg-main">
        <Topbar onMenu={() => setOpen(v => !v)} />
        <div className="sg-content">
          <Outlet />
        </div>
        <footer className="sg-footer">
          SMART GATE AI — Hệ thống quản lý phương tiện thông minh
        </footer>
      </main>
    </div>
  );
}
