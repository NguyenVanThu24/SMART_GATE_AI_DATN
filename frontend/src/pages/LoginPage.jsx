import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../services/api';
export default function LoginPage() {
  const { user, login } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ username: 'admin', password: 'Admin@123' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(f.username, f.password); nav('/'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="lc" onSubmit={submit}>
        <div className="logo">🚗</div><h1>SMART GATE AI</h1>
        <p>Hệ thống quản lý xe ra vào cơ quan<br />Computer Vision &amp; AI</p>
        <label>Tên đăng nhập</label><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <label>Mật khẩu</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <p className="err">{err}</p>}
        <button className="btn full" disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
      </form>
    </div>
  );
}
