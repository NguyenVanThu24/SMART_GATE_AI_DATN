const jwt = require('jsonwebtoken');
exports.auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(t, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'Chưa đăng nhập hoặc token hết hạn' }); }
};
exports.role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Không đủ quyền thực hiện' });
exports.aiKey = (req, res, next) =>
  req.headers['x-api-key'] === process.env.AI_API_KEY ? next() : res.status(401).json({ message: 'API key không hợp lệ' });
