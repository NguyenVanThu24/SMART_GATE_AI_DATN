import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GateMonitorPage from './pages/GateMonitorPage';
import HistoryPage from './pages/HistoryPage';
import ResourcePage from './components/common/ResourcePage';
import PlateBadge from './components/common/PlateBadge';
import StatusBadge from './components/common/StatusBadge';
import { fmtDate, VEHICLE_TYPES, ROLES } from './utils/constants';

const yesNo = (v) => <StatusBadge kind={v ? 'ok' : 'er'}>{v ? 'Được phép' : 'Khóa'}</StatusBadge>;
const Vehicles = () => (
  <ResourcePage title="Quản lý phương tiện" endpoint="/vehicles" searchHint="Tìm biển số, chủ xe..."
    columns={[
      { key: 'plate_number', label: 'Biển số', render: (r) => <PlateBadge>{r.plate_number}</PlateBadge> },
      { key: 'vehicle_type', label: 'Loại', render: (r) => VEHICLE_TYPES[r.vehicle_type] },
      { key: 'brand', label: 'Hãng' }, { key: 'color', label: 'Màu' },
      { key: 'owner', label: 'Chủ xe', render: (r) => r.owner || '—' },
      { key: 'is_allowed', label: 'Quyền mở cổng', render: (r) => yesNo(r.is_allowed) },
      { key: 'valid_to', label: 'Hết hạn', render: (r) => r.valid_to || '—' },
    ]}
    fields={[
      { name: 'plate_number', label: 'Biển số', required: true },
      { name: 'vehicle_type', label: 'Loại xe', type: 'select', options: Object.entries(VEHICLE_TYPES).map(([value, label]) => ({ value, label })), default: 'car' },
      { name: 'brand', label: 'Hãng xe' }, { name: 'color', label: 'Màu sắc' },
      { name: 'employee_id', label: 'Chủ xe (nhân viên)', type: 'select', optionsFrom: '/employees', optLabel: 'full_name', allowEmpty: true },
      { name: 'is_allowed', label: 'Quyền mở cổng', type: 'select', options: [{ value: 1, label: 'Được phép' }, { value: 0, label: 'Khóa' }], default: 1 },
      { name: 'valid_from', label: 'Hiệu lực từ', type: 'date' }, { name: 'valid_to', label: 'Hiệu lực đến', type: 'date' },
    ]} />
);
const Employees = () => (
  <ResourcePage title="Quản lý nhân viên" endpoint="/employees" searchHint="Tìm tên, mã, SĐT..."
    columns={[
      { key: 'employee_code', label: 'Mã NV' }, { key: 'full_name', label: 'Họ tên' },
      { key: 'department', label: 'Phòng ban', render: (r) => r.department || '—' },
      { key: 'position', label: 'Chức vụ' }, { key: 'phone', label: 'SĐT' },
      { key: 'status', label: 'Trạng thái', render: (r) => <StatusBadge kind={r.status === 'active' ? 'ok' : 'er'}>{r.status === 'active' ? 'Hoạt động' : 'Ngừng'}</StatusBadge> },
    ]}
    fields={[
      { name: 'employee_code', label: 'Mã nhân viên', required: true }, { name: 'full_name', label: 'Họ tên', required: true },
      { name: 'phone', label: 'Số điện thoại' }, { name: 'email', label: 'Email' },
      { name: 'department_id', label: 'Phòng ban', type: 'select', optionsFrom: '/departments', optLabel: 'name', allowEmpty: true },
      { name: 'position', label: 'Chức vụ' },
      { name: 'status', label: 'Trạng thái', type: 'select', options: [{ value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Ngừng' }], default: 'active' },
    ]} />
);
const VS = { pending: ['wa', 'Chờ duyệt'], approved: ['ok', 'Đã duyệt'], rejected: ['er', 'Từ chối'], done: ['mu', 'Đã ra'] };
const Visitors = () => (
  <ResourcePage title="Quản lý khách" endpoint="/visitors" searchHint="Tìm khách, biển số..."
    columns={[
      { key: 'full_name', label: 'Họ tên' }, { key: 'id_number', label: 'CCCD' },
      { key: 'plate_number', label: 'Biển số', render: (r) => r.plate_number ? <PlateBadge>{r.plate_number}</PlateBadge> : '—' },
      { key: 'host', label: 'Người tiếp', render: (r) => r.host || '—' }, { key: 'purpose', label: 'Mục đích' },
      { key: 'visit_date', label: 'Ngày' },
      { key: 'status', label: 'Trạng thái', render: (r) => <StatusBadge kind={VS[r.status][0]}>{VS[r.status][1]}</StatusBadge> },
    ]}
    fields={[
      { name: 'full_name', label: 'Họ tên khách', required: true }, { name: 'id_number', label: 'CCCD' }, { name: 'phone', label: 'SĐT' },
      { name: 'plate_number', label: 'Biển số xe' },
      { name: 'host_employee_id', label: 'Người tiếp', type: 'select', optionsFrom: '/employees', optLabel: 'full_name', allowEmpty: true },
      { name: 'purpose', label: 'Mục đích' }, { name: 'visit_date', label: 'Ngày đến', type: 'date', required: true },
      { name: 'time_from', label: 'Từ giờ', type: 'time' }, { name: 'time_to', label: 'Đến giờ', type: 'time' },
      { name: 'status', label: 'Trạng thái', type: 'select', default: 'pending', options: Object.entries(VS).map(([value, v]) => ({ value, label: v[1] })) },
    ]} />
);
const Accounts = () => (
  <ResourcePage title="Quản lý tài khoản" endpoint="/accounts" searchHint="Tìm tài khoản..."
    columns={[
      { key: 'username', label: 'Tài khoản' }, { key: 'full_name', label: 'Họ tên' },
      { key: 'role', label: 'Vai trò', render: (r) => ROLES[r.role] },
      { key: 'last_login', label: 'Đăng nhập cuối', render: (r) => fmtDate(r.last_login) },
      { key: 'is_active', label: 'Trạng thái', render: (r) => <StatusBadge kind={r.is_active ? 'ok' : 'er'}>{r.is_active ? 'Hoạt động' : 'Khóa'}</StatusBadge> },
    ]}
    fields={[
      { name: 'username', label: 'Tên đăng nhập', required: true }, { name: 'full_name', label: 'Họ tên', required: true },
      { name: 'password', label: 'Mật khẩu (để trống nếu không đổi)', type: 'password' },
      { name: 'role', label: 'Vai trò', type: 'select', default: 'guard', options: Object.entries(ROLES).map(([value, label]) => ({ value, label })) },
      { name: 'is_active', label: 'Trạng thái', type: 'select', default: 1, options: [{ value: 1, label: 'Hoạt động' }, { value: 0, label: 'Khóa' }] },
    ]} />
);

function Protected({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><MainLayout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="gate" element={<GateMonitorPage />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="employees" element={<Employees />} />
        <Route path="visitors" element={<Visitors />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="accounts" element={<Protected roles={['admin']}><Accounts /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
