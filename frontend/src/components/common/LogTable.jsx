import { useCallback, useState } from 'react';
import PlateBadge from './PlateBadge';
import StatusBadge from './StatusBadge';
import EvidenceModal from './EvidenceModal';
import { RESULTS, DIRECTION, fmtDate } from '../../utils/constants';

export default function LogTable({ rows, actions }) {
  const [selectedId, setSelectedId] = useState(null);

  const closeEvidence = useCallback(() => {
    setSelectedId(null);
  }, []);

  const selected = rows.find(
    (row) => row.id === selectedId
  );

  return (
    <>
      <div className="wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Biển số</th>
              <th>Chủ xe / Khách</th>
              <th>Hướng</th>
              <th>Cổng</th>
              <th>Kết quả</th>
              <th>Lý do</th>
              <th>Tin cậy</th>
              <th>Ảnh bằng chứng</th>
              {actions && <th />}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.created_at)}</td>

                <td>
                  <PlateBadge>{r.plate_number}</PlateBadge>
                </td>

                <td>{r.owner || 'Không xác định'}</td>
                <td>{DIRECTION[r.direction]}</td>
                <td>{r.gate_name}</td>

                <td>
                  <StatusBadge kind={RESULTS[r.result][0]}>
                    {RESULTS[r.result][1]}
                  </StatusBadge>
                </td>

                <td>{r.reason}</td>
                <td>{r.confidence}%</td>

                <td>
                  {r.event_id && (r.image_path || r.plate_image_path) ? (
                    <button
                      type="button"
                      className="evidence-view-btn"
                      onClick={() => setSelectedId(r.id)}
                    >
                      📷 Xem ảnh
                    </button>
                  ) : (
                    <span className="evidence-no-image">
                      Chưa có ảnh
                    </span>
                  )}
                </td>

                {actions && (
                  <td className="act">
                    {actions(r)}
                  </td>
                )}
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td
                  colSpan={actions ? 10 : 9}
                  className="empty"
                >
                  Chưa có dữ liệu
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <EvidenceModal
          key={selected.id}
          row={selected}
          onClose={closeEvidence}
        />
      )}
    </>
  );
}
