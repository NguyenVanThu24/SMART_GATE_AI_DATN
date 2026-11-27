import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, UserRound, LockKeyhole,
  Eye, EyeOff, ArrowRight, LoaderCircle,
  AlertCircle, Camera, ScanLine, Activity
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import background from '../assets/security-gate.svg';
import '../styles/login.css';

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const submitting = useRef(false);

  const remaining = Math.max(
    0, Math.ceil((blockedUntil - now) / 1000)
  );

  useEffect(() => {
    if (!blockedUntil) return;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [blockedUntil]);

  if (user) return <Navigate to="/" replace />;

  const submit = async e => {
    e.preventDefault();

    if (submitting.current || remaining > 0) return;

    if (!username.trim() || !password) {
      setError('Vui lòng nhập đầy đủ thông tin.');
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError('Mật khẩu vượt quá độ dài được hỗ trợ.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError('');

    try {
      await login(username.trim(), password);
      setPassword('');
      nav('/', { replace: true });
    } catch (e) {
      const status = e.response?.status;

      if (status === 429) {
        const seconds = Number(
          e.response?.data?.retry_after ||
          e.response?.headers?.['retry-after']
        ) || 60;

        const time = Date.now();

        setNow(time);
        setBlockedUntil(time + Math.max(1, seconds) * 1000);
        setError('Quá nhiều lần đăng nhập. Vui lòng chờ.');
      } else if (status === 401) {
        setError('Tên đăng nhập hoặc mật khẩu không chính xác.');
      } else if (status === 400) {
        setError('Thông tin đăng nhập không hợp lệ.');
      } else {
        setError('Không thể kết nối hệ thống. Vui lòng thử lại.');
      }

      setPassword('');
      setVisible(false);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="sg-login">
      <section
        className="sg-login-hero"
        style={{ backgroundImage: `url(${background})` }}
      >
        <div className="sg-login-brand">
          <ShieldCheck size={35} />
          <div>
            <strong>SMART GATE AI</strong>
            <small>INTELLIGENT SECURITY SYSTEM</small>
          </div>
        </div>

        <div className="sg-login-intro">
          <span className="sg-login-tag">
            COMPUTER VISION & AI
          </span>

          <h1>Kiểm soát thông minh.<br/>An ninh chủ động.</h1>

          <p>
            Hệ thống quản lý và giám sát phương tiện
            ra vào ứng dụng trí tuệ nhân tạo.
          </p>

          <div className="sg-login-features">
            <span><ScanLine size={19}/> Nhận diện biển số AI</span>
            <span><Camera size={19}/> Giám sát trực tiếp</span>
            <span><Activity size={19}/> Cảnh báo an ninh</span>
          </div>
        </div>
      </section>

      <section className="sg-login-panel">
        <form className="sg-login-form" onSubmit={submit}>
          <div className="sg-login-shield">
            <ShieldCheck size={34}/>
          </div>

          <div className="sg-login-welcome">SMART GATE AI</div>
          <h2>Đăng nhập hệ thống</h2>

          <p className="sg-login-description">
            Vui lòng xác thực tài khoản để tiếp tục.
          </p>

          <label htmlFor="sg-username">Tên đăng nhập</label>
          <div className="sg-login-field">
            <UserRound size={19}/>
            <input
              id="sg-username"
              name="username"
              autoComplete="username"
              placeholder="Nhập tên đăng nhập"
              value={username}
              maxLength={50}
              required
              disabled={busy}
              onChange={e => setUsername(e.target.value)}
            />
          </div>

          <label htmlFor="sg-password">Mật khẩu</label>
          <div className="sg-login-field">
            <LockKeyhole size={19}/>
            <input
              id="sg-password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              value={password}
              required
              disabled={busy}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="sg-password-toggle"
              aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={visible}
              onClick={() => setVisible(v => !v)}
            >
              {visible ? <EyeOff size={19}/> : <Eye size={19}/>}
            </button>
          </div>

          {error && (
            <div className="sg-login-error" role="alert">
              <AlertCircle size={19}/>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="sg-login-submit"
            disabled={busy || remaining > 0}
          >
            {busy ? (
              <>
                <LoaderCircle size={19} className="sg-login-spin"/>
                Đang xác thực...
              </>
            ) : remaining > 0 ? (
              `Thử lại sau ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
            ) : (
              <>Đăng nhập <ArrowRight size={19}/></>
            )}
          </button>

          <div className="sg-login-notice">
            <LockKeyhole size={15}/>
            Chỉ dành cho người được cấp quyền
          </div>

          <div className="sg-login-copyright">
            © {new Date().getFullYear()} SMART GATE AI
            <br/>Hệ thống quản lý phương tiện thông minh
          </div>
        </form>
      </section>
    </div>
  );
}
