import PlateBadge from './PlateBadge';
import StatusBadge from './StatusBadge';
import { RESULTS, DIRECTION, fmtDate } from '../../utils/constants';
export default function LogTable({ rows, actions }) {
  return (
    <div className="wrap"><table>
      <thead><tr><th>Thời gian</th><th>Biển số</th><th>Chủ xe / Khách</th><th>Hướng</th><th>Cổng</th><th>Kết quả</th><th>Lý do</th><th>Tin cậy</th>{actions && <th />}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td><PlateBadge>{r.plate_number}</PlateBadge></td><td>{r.owner || 'Không xác định'}</td>
            <td>{DIRECTION[r.direction]}</td><td>{r.gate_name}</td>
            <td><StatusBadge kind={RESULTS[r.result][0]}>{RESULTS[r.result][1]}</StatusBadge></td><td>{r.reason}</td><td>{r.confidence}%</td>
            {actions && <td className="act">{actions(r)}</td>}</tr>
        ))}
        {!rows.length && <tr><td colSpan="9" className="empty">Chưa có dữ liệu</td></tr>}
      </tbody>
    </table></div>
  );
}
