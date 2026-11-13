import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
export default function MainLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div><Sidebar open={open} onClose={() => setOpen(false)} />
      <main><Topbar onMenu={() => setOpen((o) => !o)} /><Outlet /></main></div>
  );
}
