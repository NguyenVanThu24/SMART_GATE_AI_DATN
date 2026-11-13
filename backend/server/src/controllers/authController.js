const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
exports.login = async (req, res) => {
  const { username, password } = req.body;
  const [[u]] = await db.query('SELECT * FROM accounts WHERE username=?', [username || '']);
  if (!u || !u.is_active || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
  await db.query('UPDATE accounts SET last_login=NOW() WHERE id=?', [u.id]);
  const user = { id: u.id, username: u.username, full_name: u.full_name, role: u.role };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '8h' }), user });
};
