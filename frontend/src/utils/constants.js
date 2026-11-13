export const VEHICLE_TYPES = { car: 'Ô tô', motorbike: 'Xe máy', truck: 'Xe tải', other: 'Khác' };
export const ROLES = { admin: 'Quản trị viên', manager: 'Quản lý', guard: 'Bảo vệ' };
export const RESULTS = { allowed: ['ok', 'Cho phép'], denied: ['er', 'Từ chối'], manual: ['ok', 'Bảo vệ duyệt'], pending: ['wa', 'Chờ xác nhận'] };
export const DIRECTION = { in: 'Vào', out: 'Ra' };
export const fmtDate = (s) => (s ? s.replace('T', ' ').slice(0, 16).split(' ').map((x, i) => (i ? x : x.split('-').reverse().join('/'))).join(' ') : '—');
