import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Video, VideoOff, Cpu, Radio, CircuitBoard,
  RefreshCw, ShieldCheck, Clock3, Camera,
  FlaskConical, AlertTriangle, ArrowUp, ArrowDown
} from 'lucide-react';

import api, { errMsg } from '../services/api';
import useSocket from '../hooks/useSocket';
import useSecureCamera from '../hooks/useSecureCamera';
import PlateBadge from '../components/common/PlateBadge';
import StatusBadge from '../components/common/StatusBadge';
import LogTable from '../components/common/LogTable';
import EvidenceModal from '../components/common/EvidenceModal';
import { RESULTS, fmtDate } from '../utils/constants';
import '../styles/gate-monitor.css';

const DASHBOARD_API = '/dashboard';

const BARRIER = {
  open: ['ok', 'Đang mở'],
  closed: ['mu', 'Đóng'],
  error: ['er', 'Lỗi']
};



function HealthCard({ icon: Icon, name, status }) {
  const state = status === true
    ? 'online'
    : status === false ? 'offline' : 'unknown';

  return (
    <div className="gm-health-card">
      <div className={`gm-health-icon ${state}`}>
        <Icon size={22} />
      </div>
      <div>
        <span>{name}</span>
        <strong className={`gm-state ${state}`}>
          {status === true ? 'Hoạt động'
            : status === false ? 'Mất kết nối'
            : 'Chưa xác định'}
        </strong>
      </div>
    </div>
  );
}

export default function GateMonitorPage() {
  const [gates, setGates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [evidenceId, setEvidenceId] = useState(null);
  const [sim, setSim] = useState({ gate: 1, plate: '' });

  const busyRef = useRef(false);
  const requestVersion = useRef(0);
  const eventVersion = useRef(0);

  const load = useCallback(async (signal) => {
    const version = ++requestVersion.current;
    const events = eventVersion.current;

    try {
      const [g, h] = await Promise.all([
        api.get('/gates', { signal }),
        api.get('/history', {
          params: { limit: 15 }, signal
        })
      ]);

      if (version !== requestVersion.current || signal?.aborted) return;

      if (events === eventVersion.current) {
        setGates(g.data);
        setLogs(h.data);
      }
    } catch (e) {
      if (!signal?.aborted) {
        setNotice({ error: true, text: errMsg(e) });
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const checkHealth = useCallback(async (signal) => {
    try {
      const r = await api.get(DASHBOARD_API, {
        params: { days: 1 },
        timeout: 7000,
        signal
      });

      if (signal?.aborted) return;

      setServices(r.data.services || null);
      setHealthError(!r.data.services);
      setUpdated(new Date());
    } catch {
      if (!signal?.aborted) {
        setHealthError(true);
        setServices(null);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let checking = false;

    const poll = async () => {
      if (checking) return;
      checking = true;
      try {
        await checkHealth(controller.signal);
      } finally {
        checking = false;
      }
    };

    load(controller.signal);
    poll();

    const timer = setInterval(poll, 10000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load, checkHealth]);

  useSocket('connect', () => {
    load();
    checkHealth();
  });

  useSocket('plate:detected', row => {
    eventVersion.current++;
    setLogs(old => [
      row,
      ...old.filter(item => item.id !== row.id)
    ].slice(0, 15));
  });

  useSocket('plate:updated', row => {
    eventVersion.current++;
    setLogs(old => old.map(item =>
      item.id === row.id ? { ...item, ...row } : item
    ));
  });

  useSocket('barrier:status', ({ gate_id, status }) => {
    eventVersion.current++;
    setGates(old => old.map(g =>
      Number(g.id) === Number(gate_id)
        ? { ...g, barrier_status: status }
        : g
    ));
  });

  const cameraConnected = services?.ai?.camera === true;

  const { streamUrl, ticketError } = useSecureCamera(
    cameraConnected && !streamError,
    streamKey
  );

  useEffect(() => {
    setFrameReady(false);
  }, [streamUrl]);

  const mqttConnected = services?.mqtt?.connected === true;
  const espOnline = services?.mqtt?.device === 'online';
  const mode = services?.hardwareMode;

  useEffect(() => {
    setFrameReady(false);
    setStreamError(false);
    setStreamKey(k => k + 1);
  }, [cameraConnected]);

  useEffect(() => {
    if (!cameraConnected || !streamError) return;

    const timer = setTimeout(() => {
      setStreamError(false);
      setFrameReady(false);
      setStreamKey(k => k + 1);
    }, 5000);

    return () => clearTimeout(timer);
  }, [cameraConnected, streamError]);

  const canControl = gate => {
    if (!gate || !Number(gate.is_active)) return false;
    if (healthError || !mode) return false;

    if (mode === 'mqtt' && Number(gate.id) === 1) {
      return mqttConnected && espOnline;
    }

    return true;
  };

  const execute = async (fn, success) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);

    try {
      const response = await fn();

      if (response?.data?.status === 'error') {
        throw new Error(
          response.data.message || 'Thiết bị không thực hiện được lệnh'
        );
      }

      setNotice({ error: false, text: success });
      await load();
    } catch (e) {
      setNotice({
        error: true,
        text: errMsg(e) || e.message || 'Thao tác thất bại'
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const confirmAction = async () => {
    const action = confirm;
    setConfirm(null);

    if (!action) return;

    if (action.type === 'barrier') {
      const gate = gates.find(g => g.id === action.id);

      if (!canControl(gate)) {
        setNotice({
          error: true,
          text: 'Cổng không sẵn sàng điều khiển.'
        });
        return;
      }

      await execute(
        () => api.post(`/gates/${action.id}/barrier`, {
          action: action.action
        }),
        'Đã xử lý lệnh điều khiển cổng.'
      );
    } else {
      await execute(
        () => api.put(`/history/${action.id}/resolve`, {
          action: action.action
        }),
        'Đã cập nhật kết quả xác nhận.'
      );
    }
  };

  useEffect(() => {
    if (!confirm) return;
    const escape = e => {
      if (e.key === 'Escape') setConfirm(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [confirm]);

  const simulate = e => {
    e.preventDefault();
    const plate = sim.plate.trim().toUpperCase();
    if (!plate) return;

    execute(
      () => api.post(`/gates/${sim.gate}/simulate`, { plate }),
      'Đã gửi dữ liệu giả lập nhận diện.'
    );
  };

  const last = logs[0];
  const evidence = logs.find(row => row.id === evidenceId);
  const result = last ? RESULTS[last.result] : null;

  const refresh = () => {
    load();
    checkHealth();
  };

  return (
    <div className="gm-page">
      <header className="gm-heading">
        <div>
          <div className="gm-eyebrow">
            <ShieldCheck size={16} />
            LIVE SECURITY MONITORING
          </div>
          <h2>Giám sát trực tiếp</h2>
          <p>Nhận diện phương tiện và điều hành cổng an ninh.</p>
        </div>
        <button className="btn g gm-refresh" onClick={refresh}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </header>

      <div className="gm-health-grid">
        <HealthCard icon={Video} name="Camera IP"
          status={services?.ai?.camera} />
        <HealthCard icon={Cpu} name="AI Engine"
          status={services?.ai?.reachable} />
        <HealthCard icon={Radio} name="MQTT Broker"
          status={services?.mqtt?.connected} />
        <HealthCard icon={CircuitBoard} name="ESP32"
          status={mode === 'mqtt'
            ? services?.mqtt?.device === 'online' ? true
              : services?.mqtt?.device === 'offline' ? false : null
            : null} />
      </div>

      {healthError && (
        <div className="gm-notice error">
          Chưa lấy được trạng thái hệ thống.
          Điều khiển cổng đang được khóa.
        </div>
      )}

      <div className="gm-main-grid">
        <section className="card gm-camera-card">
          <div className="gm-card-title">
            <div>
              <h3><Camera size={19} /> Camera giám sát</h3>
              <p>CAM 01 · EZVIZ · Cổng chính</p>
            </div>
            <span className={`gm-camera-status ${
              cameraConnected && frameReady && !streamError
                ? 'active' : 'inactive'
            }`}>
              {cameraConnected && frameReady && !streamError
                ? 'LIVE' : cameraConnected ? 'CONNECTING' : 'OFFLINE'}
            </span>
          </div>

          <div className="gm-video">
            {cameraConnected && !streamError && streamUrl && (
              <img
                key={streamUrl}
                src={streamUrl}
                referrerPolicy="no-referrer"
                alt="Luồng camera giám sát"
                onLoad={() => setFrameReady(true)}
                onError={() => {
                  setFrameReady(false);
                  setStreamError(true);
                }}
              />
            )}

            {(!cameraConnected || streamError || !frameReady) && (
              <div className="gm-video-placeholder">
                <VideoOff size={46} strokeWidth={1.5} />
                <strong>
                  {cameraConnected
                    ? 'Đang chờ luồng video'
                    : 'Camera chưa kết nối'}
                </strong>
                <span>
                  {ticketError
                    ? 'Đang kết nối lại dịch vụ camera bảo mật.'
                    : 'Hệ thống tự kiểm tra lại kết nối.'}
                </span>
                <button type="button"
                  onClick={() => {
                    setFrameReady(false);
                    setStreamError(false);
                    setStreamKey(k => k + 1);
                    checkHealth();
                  }}>
                  <RefreshCw size={15} /> Thử lại
                </button>
              </div>
            )}
          </div>

          <div className="gm-camera-footer">
            <span>Computer Vision &amp; AI</span>
            <span>
              <Clock3 size={13} />
              {updated ? updated.toLocaleTimeString('vi-VN') : '—'}
            </span>
          </div>

          <div className="gm-latest">
            <h3>Nhận diện gần nhất</h3>
            {last ? (
              <>
                <div className="gm-plate-row">
                  <PlateBadge>{last.plate_number}</PlateBadge>
                  {result && (
                    <StatusBadge kind={result[0]}>
                      {result[1]}
                    </StatusBadge>
                  )}
                </div>
                <div className="gm-detail-grid">
                  <div><span>Chủ phương tiện</span>
                    <strong>{last.owner || 'Không xác định'}</strong></div>
                  <div><span>Độ tin cậy</span>
                    <strong>{last.confidence ?? '—'}%</strong></div>
                  <div><span>Thời gian</span>
                    <strong>{fmtDate(last.created_at)}</strong></div>
                  <div><span>Cổng nhận diện</span>
                    <strong>{last.gate_name || '—'}</strong></div>
                </div>
                <div className="gm-reason">
                  {last.reason || 'Không có ghi chú'}
                </div>
                {last.event_id &&
                  (last.image_path || last.plate_image_path) && (
                    <button className="btn g gm-evidence"
                      onClick={() => setEvidenceId(last.id)}>
                      <Camera size={16} /> Xem ảnh bằng chứng
                    </button>
                  )}
              </>
            ) : <p>Chưa có dữ liệu nhận diện.</p>}
          </div>
        </section>

        <div className="gm-side">
          <section className="card gm-barriers">
            <div className="gm-card-title">
              <div>
                <h3><ShieldCheck size={19} /> Điều khiển barie</h3>
                <p>Quản lý trạng thái các cổng</p>
              </div>
            </div>

            {gates.map(g => {
              const physical = mode === 'mqtt' && Number(g.id) === 1;
              const status = BARRIER[g.barrier_status] || ['mu', 'Chưa rõ'];
              const disabled = busy || !canControl(g);

              return (
                <div className="gm-gate" key={g.id}>
                  <div className="gm-gate-heading">
                    <strong>{g.name}</strong>
                    <StatusBadge kind={status[0]}>
                      {status[1]}
                    </StatusBadge>
                  </div>
                  <p>
                    {!mode ? 'Chưa xác định chế độ'
                      : physical
                        ? `Cổng vật lý · ${espOnline ? 'Online' : 'Offline'}`
                        : 'Cổng mô phỏng'}
                  </p>
                  <div className="gm-gate-buttons">
                    <button className="btn o"
                      disabled={disabled}
                      onClick={() => setConfirm({
                        type: 'barrier', id: g.id,
                        action: 'open', name: g.name
                      })}>
                      <ArrowUp size={15} /> Mở cổng
                    </button>
                    <button className="btn r"
                      disabled={disabled}
                      onClick={() => setConfirm({
                        type: 'barrier', id: g.id,
                        action: 'close', name: g.name
                      })}>
                      <ArrowDown size={15} /> Đóng cổng
                    </button>
                  </div>
                </div>
              );
            })}

            {!gates.length && (
              <p>{loading ? 'Đang tải...' : 'Chưa có dữ liệu cổng'}</p>
            )}

            <p className="gm-small-note">
              Trạng thái phần mềm không xác nhận vị trí vật lý của barie.
            </p>
          </section>

          <section className="card gm-simulation">
            <h3><FlaskConical size={19} /> Giả lập nhận diện</h3>
            <p>Chỉ sử dụng để kiểm thử hệ thống.</p>

            <form onSubmit={simulate}>
              <label>Cổng kiểm thử</label>
              <select value={sim.gate}
                onChange={e => setSim({
                  ...sim, gate: Number(e.target.value)
                })}>
                {gates.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>

              <label>Biển số xe</label>
              <input required maxLength={15}
                placeholder="Ví dụ: 29A-123.45"
                value={sim.plate}
                onChange={e => setSim({
                  ...sim, plate: e.target.value.toUpperCase()
                })} />

              <button className="btn full"
                disabled={busy || !gates.some(g => Number(g.id) === sim.gate)}>
                Gửi nhận diện thử
              </button>
            </form>

            <p className="gm-small-note">
              Dữ liệu giả lập có thể được lưu vào lịch sử.
              Chỉ thử nghiệm khi phần cứng ở trạng thái an toàn.
            </p>
          </section>
        </div>
      </div>

      {notice && (
        <div role="status"
          className={`gm-notice ${notice.error ? 'error' : 'success'}`}>
          {notice.text}
        </div>
      )}

      <section className="card gm-history">
        <div className="gm-card-title">
          <div>
            <h3><Clock3 size={19} /> Lịch sử nhận diện gần đây</h3>
            <p>15 sự kiện gần nhất · Cập nhật theo thời gian thực</p>
          </div>
          <span>{logs.length} sự kiện</span>
        </div>

        <LogTable rows={logs} actions={r =>
          r.result === 'pending' && (
            <>
              <button className="btn o sm" disabled={busy}
                onClick={() => setConfirm({
                  type: 'resolve', id: r.id,
                  action: 'allow', name: r.plate_number
                })}>Cho qua</button>
              <button className="btn r sm" disabled={busy}
                onClick={() => setConfirm({
                  type: 'resolve', id: r.id,
                  action: 'deny', name: r.plate_number
                })}>Từ chối</button>
            </>
          )
        } />
      </section>

      {evidence && (
        <EvidenceModal key={evidence.id}
          row={evidence} onClose={() => setEvidenceId(null)} />
      )}

      {confirm && (
        <div className="gm-confirm-overlay"
          onClick={() => setConfirm(null)}>
          <div className="gm-confirm" role="dialog"
            aria-modal="true" aria-labelledby="gm-confirm-title"
            onClick={e => e.stopPropagation()}>
            <div className="gm-confirm-icon">
              <AlertTriangle size={28} />
            </div>
            <h3 id="gm-confirm-title">Xác nhận thao tác</h3>
            <p>
              Bạn có chắc chắn muốn {
                { open: 'mở cổng', close: 'đóng cổng',
                  allow: 'cho phép', deny: 'từ chối' }[confirm.action]
              }?
            </p>
            <strong>{confirm.name}</strong>
            <p className="gm-small-note">
              Kiểm tra khu vực cổng an toàn trước khi xác nhận.
            </p>
            <div className="gm-confirm-buttons">
              <button className="btn g" autoFocus
                onClick={() => setConfirm(null)}>Hủy bỏ</button>
              <button className="btn"
                onClick={confirmAction}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
