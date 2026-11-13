export default function DataTable({ columns, rows, actions }) {
  return (
    <div className="wrap"><table>
      <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{actions && <th />}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}{actions && <td className="act">{actions(r)}</td>}</tr>
        ))}
        {!rows.length && <tr><td colSpan={columns.length + 1} className="empty">Chưa có dữ liệu</td></tr>}
      </tbody>
    </table></div>
  );
}
