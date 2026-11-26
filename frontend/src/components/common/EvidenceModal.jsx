import { useEffect, useState } from 'react';
import api from '../../services/api';
import './EvidenceModal.css';

const SYNC_STATUS = {
  not_required: ['Chưa đồng bộ', 'neutral'],
  pending: ['Đang chờ đồng bộ', 'warning'],
  syncing: ['Đang đồng bộ', 'warning'],
  synced: ['Đã đồng bộ Google Drive', 'success'],
  failed: ['Đồng bộ thất bại', 'danger']
};

function EvidenceImage({ id, type, title, available }) {
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    let active = true;
    let objectUrl = null;

    setSrc('');
    setError('');
    setLoading(true);

    if (!available) {
      setLoading(false);
      setError('Chưa có ảnh');
      return;
    }

    api.get(`/history/${id}/evidence/${type}`, {
      responseType: 'blob',
      signal: controller.signal
    })
      .then(({ data }) => {
        if (!active) return;

        if (data.type !== 'image/jpeg') {
          throw new Error('Invalid image response');
        }

        objectUrl = URL.createObjectURL(data);
        setSrc(objectUrl);
      })
      .catch((e) => {
        if (!active) return;

        setError(
          e.response?.status === 404
            ? 'Không tìm thấy ảnh'
            : 'Không thể tải ảnh'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, type, available]);

  return (
    <div className="evidence-image-card">
      <h4>{title}</h4>

      <div className="evidence-image-frame">
        {loading && <span>Đang tải ảnh...</span>}

        {error && (
          <span className="evidence-error">
            {error}
          </span>
        )}

        {src && (
          <img src={src} alt={title} />
        )}
      </div>

      {src && (
        <a
          className="evidence-download"
          href={src}
          download={`${id}-${type}.jpg`}
        >
          Tải ảnh xuống
        </a>
      )}
    </div>
  );
}

export default function EvidenceModal({ row, onClose }) {
  const [syncStatus, syncClass] =
    SYNC_STATUS[row.drive_sync_status] ||
    ['Chưa xác định', 'neutral'];

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };

    const oldOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      className="evidence-overlay"
      onClick={onClose}
    >
      <section
        className="evidence-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết ảnh bằng chứng"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="evidence-header">
          <div>
            <h2>Ảnh bằng chứng</h2>
            <p>
              Sự kiện #{row.id} — {row.plate_number}
            </p>
          </div>

          <button
            type="button"
            className="evidence-close"
            onClick={onClose}
            aria-label="Đóng"
            autoFocus
          >
            ×
          </button>
        </div>

        <div className="evidence-grid">
          <EvidenceImage
            id={row.id}
            type="snapshot"
            title="Ảnh toàn cảnh"
            available={Boolean(row.image_path)}
          />

          <EvidenceImage
            id={row.id}
            type="plate"
            title="Ảnh biển số"
            available={Boolean(row.plate_image_path)}
          />
        </div>

        <div className="evidence-footer">
          <span className={`evidence-sync ${syncClass}`}>
            ● {syncStatus}
          </span>

          <button
            type="button"
            className="btn g"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}
