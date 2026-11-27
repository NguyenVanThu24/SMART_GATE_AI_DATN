const db = require('../config/db');

const reject = (res, message, status = 400) =>
  res.status(status).json({ message });

exports.protectAccount = async (req, res, next) => {
  try {
    const method = req.method;

    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
      return next();
    }

    const body = req.body || {};
    const id = req.params.id;

    if (method === 'POST' || method === 'PUT') {
      if (body.role !== undefined &&
          !['admin', 'manager', 'guard'].includes(body.role)) {
        return reject(res, 'Vai trò không hợp lệ');
      }

      if (body.is_active !== undefined &&
          ![0, 1, '0', '1', true, false].includes(body.is_active)) {
        return reject(res, 'Trạng thái không hợp lệ');
      }

      if (method === 'POST' || body.password) {
        const p = body.password;

        if (
          typeof p !== 'string' ||
          p.length < 10 ||
          Buffer.byteLength(p, 'utf8') > 72 ||
          !/[A-Z]/.test(p) ||
          !/[a-z]/.test(p) ||
          !/[0-9]/.test(p) ||
          !/[^A-Za-z0-9\s]/.test(p)
        ) {
          return reject(
            res,
            'Mật khẩu cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt; tối đa 72 byte'
          );
        }
      } else if (body.password === '') {
        delete body.password;
      } else if (body.password !== undefined) {
        return reject(res, 'Mật khẩu không hợp lệ');
      }
    }

    if (method === 'PUT' || method === 'DELETE') {
      if (!/^[1-9]\d*$/.test(String(id))) {
        return reject(res, 'ID tài khoản không hợp lệ');
      }

      const [[account]] = await db.query(
        'SELECT id, role, is_active FROM accounts WHERE id=?',
        [id]
      );

      if (!account) {
        return reject(res, 'Không tìm thấy tài khoản', 404);
      }

      const deleting = method === 'DELETE';

      const locking =
        body.is_active !== undefined &&
        Number(body.is_active) === 0;

      const demoting =
        body.role !== undefined &&
        body.role !== 'admin';

      if (
        Number(account.id) === Number(req.user.id) &&
        (deleting || locking || demoting)
      ) {
        return reject(
          res,
          'Không thể tự xóa, khóa hoặc hạ quyền tài khoản đang sử dụng',
          403
        );
      }

      if (
        account.role === 'admin' &&
        account.is_active &&
        (deleting || locking || demoting)
      ) {
        return reject(
          res,
          'Tài khoản quản trị đang hoạt động được bảo vệ',
          403
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

exports.protectVisitor = (req, res, next) => {
  if (req.user.role !== 'guard') return next();

  if (req.method === 'DELETE') {
    return reject(
      res,
      'Bảo vệ không có quyền xóa hồ sơ khách',
      403
    );
  }

  if (req.method === 'POST') {
    if (req.body.status && req.body.status !== 'pending') {
      return reject(
        res,
        'Khách đăng ký phải chờ quản lý phê duyệt',
        403
      );
    }

    req.body.status = 'pending';
  }

  if (req.method === 'PUT') {
    return reject(
      res,
      'Bảo vệ không có quyền sửa hồ sơ khách đã đăng ký',
      403
    );
  }

  next();
};
