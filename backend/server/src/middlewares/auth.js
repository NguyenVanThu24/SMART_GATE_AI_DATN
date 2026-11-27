const jwt = require('jsonwebtoken');
const db = require('../config/db');

const unauthorized = res => res.status(401).json({
  message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'
});

exports.auth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer ([^\s]+)$/i.exec(header);

  if (!match) return unauthorized(res);

  let decoded;

  try {
    decoded = jwt.verify(
      match[1],
      process.env.JWT_SECRET,
      { algorithms: ['HS256'] }
    );

    if (!Number.isSafeInteger(decoded.id) || decoded.id <= 0) {
      return unauthorized(res);
    }
  } catch {
    return unauthorized(res);
  }

  try {
    const [[user]] = await db.query(
      `SELECT id, username, full_name, role, is_active
       FROM accounts
       WHERE id=? LIMIT 1`,
      [decoded.id]
    );

    if (!user || !user.is_active) {
      return unauthorized(res);
    }

    req.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    };

    next();
  } catch (error) {
    next(error);
  }
};

exports.role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({
        message: 'Không đủ quyền thực hiện'
      });

exports.aiKey = (req, res, next) =>
  process.env.AI_API_KEY &&
  req.headers['x-api-key'] === process.env.AI_API_KEY
    ? next()
    : res.status(401).json({
        message: 'API key không hợp lệ'
      });
