import * as React from 'react';
import './styles/loading.css';

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';




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
      { name: 'plate_number', label: 'Biển số', required: true, maxLength: 15, placeholder: 'Ví dụ: 99A-123.45' },
      { name: 'vehicle_type', label: 'Loại xe', type: 'select', options: Object.entries(VEHICLE_TYPES).map(([value, label]) => ({ value, label })), default: 'car' },
      { name: 'brand', label: 'Hãng xe', maxLength: 50, placeholder: 'Nhập hoặc chọn hãng xe', suggestions: ['Honda', 'Toyota', 'Hyundai', 'Kia', 'Ford', 'Mazda', 'VinFast', 'Yamaha', 'Suzuki', 'Mitsubishi'] }, { name: 'color', label: 'Màu sắc', maxLength: 30, placeholder: 'Nhập hoặc chọn màu', suggestions: ['Trắng', 'Đen', 'Bạc', 'Xám', 'Đỏ', 'Xanh', 'Vàng', 'Nâu'] },
      { name: 'employee_id', label: 'Chủ phương tiện (nhân viên)', type: 'select', optionsFrom: '/employees', optLabel: 'full_name', allowEmpty: true },
      { name: 'is_allowed', label: 'Quyền mở cổng', type: 'select', options: [{ value: 1, label: 'Được phép' }, { value: 0, label: 'Khóa' }], default: 0 },
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
      { name: 'position', label: 'Chức vụ', maxLength: 100, suggestions: ['Nhân viên', 'Kỹ sư', 'Kỹ thuật viên', 'Trưởng phòng', 'Quản lý', 'Bảo vệ', 'Giám đốc', 'Chuyên viên'] },
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
      { name: 'purpose', label: 'Mục đích', suggestions: ['Họp đối tác', 'Giao hàng', 'Phỏng vấn', 'Bảo trì thiết bị', 'Liên hệ công việc', 'Nộp hồ sơ', 'Thăm quan'] }, { name: 'visit_date', label: 'Ngày đến', type: 'date', required: true },
      { name: 'time_from', label: 'Từ giờ', type: 'time' }, { name: 'time_to', label: 'Đến giờ', type: 'time' },
      { name: 'status', label: 'Trạng thái', type: 'select', default: 'pending', options: Object.entries(VS).map(([value, v]) => ({ value, label: v[1] })) },
    ]} />
);
const AccountsPage = React.lazy(() => import('./pages/AccountsPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const GateMonitorPage = React.lazy(() => import('./pages/GateMonitorPage'));
const HistoryPage = React.lazy(() => import('./pages/HistoryPage'));

function Protected({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
export default function App() {
  return (
    <React.Suspense fallback={
        <div className="sg-page-loading" role="status">
          <span className="sg-loading-spinner" />
          <strong>Đang tải dữ liệu...</strong>
          <small>SMART GATE AI</small>
        </div>
      }>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><MainLayout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="gate" element={<GateMonitorPage />} />
        <Route path="vehicles" element={<Protected roles={['admin', 'manager']}><Vehicles /></Protected>} />
        <Route path="employees" element={<Protected roles={['admin', 'manager']}><Employees /></Protected>} />
        <Route path="visitors" element={<Visitors />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="accounts" element={<Protected roles={['admin']}><AccountsPage /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      </React.Suspense>
  );
}
