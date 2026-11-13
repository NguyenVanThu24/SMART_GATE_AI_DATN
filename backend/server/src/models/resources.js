// Định nghĩa các tài nguyên CRUD (bảng, câu SELECT, trường được phép ghi)
const normPlate = (d) => { if (d.plate_number) d.plate_number = String(d.plate_number).toUpperCase().replace(/\s/g, ''); };
module.exports = {
  vehicles: {
    table: 'vehicles', orderBy: 'v.id DESC', search: ['v.plate_number', 'e.full_name'], before: normPlate,
    select: 'SELECT v.*, e.full_name AS owner FROM vehicles v LEFT JOIN employees e ON e.id=v.employee_id',
    fields: ['plate_number', 'vehicle_type', 'brand', 'color', 'employee_id', 'is_allowed', 'valid_from', 'valid_to'],
  },
  employees: {
    table: 'employees', orderBy: 'e.id DESC', search: ['e.full_name', 'e.employee_code', 'e.phone'],
    select: 'SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON d.id=e.department_id',
    fields: ['employee_code', 'full_name', 'phone', 'email', 'department_id', 'position', 'status'],
  },
  visitors: {
    table: 'visitors', orderBy: 'vs.visit_date DESC, vs.id DESC', search: ['vs.full_name', 'vs.plate_number', 'vs.phone'], before: normPlate,
    select: 'SELECT vs.*, e.full_name AS host FROM visitors vs LEFT JOIN employees e ON e.id=vs.host_employee_id',
    fields: ['full_name', 'id_number', 'phone', 'plate_number', 'host_employee_id', 'purpose', 'visit_date', 'time_from', 'time_to', 'status'],
    onCreate: (d, user) => { d.created_by = user.id; },
  },
  accounts: {
    table: 'accounts', orderBy: 'id DESC', search: ['username', 'full_name'], hash: true,
    select: 'SELECT id, username, full_name, role, is_active, last_login, created_at FROM accounts',
    fields: ['username', 'full_name', 'role', 'is_active'],
  },
  departments: { table: 'departments', orderBy: 'id', search: ['name'], select: 'SELECT * FROM departments', fields: ['name'] },
};
