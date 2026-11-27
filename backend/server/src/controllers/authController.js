const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 10000;

const attempts = new Map();

const dummyHash = bcrypt.hashSync(
  crypto.randomBytes(32).toString('hex'), 10
);

function cleanup() {
  const now = Date.now();

  for (const [key, value] of attempts) {
    if (value.expiresAt <= now) {
      attempts.delete(key);
    }
  }
}

const timer = setInterval(cleanup, 60000);
timer.unref();

function getAttempt(key) {
  const entry = attempts.get(key);

  if (entry && entry.expiresAt > Date.now()) {
    return entry;
  }

  attempts.delete(key);
  return null;
}

function reserveAttempt(key) {
  let entry = getAttempt(key);

  if (!entry) {
    entry = {
      count: 0,
      expiresAt: Date.now() + WINDOW_MS
    };

    attempts.set(key, entry);
  }

  entry.count++;
}

function tooMany(res, seconds) {
  res.set('Retry-After', String(Math.max(1, seconds)));

  return res.status(429).json({
    message: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.',
    retry_after: Math.max(1, seconds)
  });
}

exports.login = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const { username, password } = req.body || {};

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    username.trim().length > 50 ||
    !password ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({
      message: 'Thông tin đăng nhập không hợp lệ'
    });
  }

  const name = username.trim();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const accountKey = 'account:' + name.toLowerCase();
  const ipKey = 'ip:' + ip;

  const accountEntry = getAttempt(accountKey);
  const ipEntry = getAttempt(ipKey);

  const blocked = [
    accountEntry?.count >= MAX_ATTEMPTS
      ? accountEntry : null,
    ipEntry?.count >= 30
      ? ipEntry : null
  ].filter(Boolean);

  if (blocked.length) {
    const expiresAt = Math.max(
      ...blocked.map(entry => entry.expiresAt)
    );

    return tooMany(
      res,
      Math.ceil((expiresAt - Date.now()) / 1000)
    );
  }

  if (attempts.size >= MAX_ENTRIES - 2) {
    cleanup();

    if (attempts.size >= MAX_ENTRIES - 2) {
      return tooMany(res, 60);
    }
  }

  // Reserve before async operations to limit parallel requests.
  reserveAttempt(accountKey);
  reserveAttempt(ipKey);

  const [[u]] = await db.query(
    'SELECT * FROM accounts WHERE username=?',
    [name]
  );

  const valid = await bcrypt.compare(
    password,
    u?.password_hash || dummyHash
  );

  if (!u || !u.is_active || !valid) {
    console.warn('[AUTH] LOGIN_FAILED');

    return res.status(401).json({
      message: 'Sai tài khoản hoặc mật khẩu'
    });
  }

  await db.query(
    'UPDATE accounts SET last_login=NOW() WHERE id=?',
    [u.id]
  );

  const user = {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    role: u.role
  };

  const token = jwt.sign(
    user,
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '8h'
    }
  );

  attempts.delete(accountKey);

  const currentIp = getAttempt(ipKey);
  if (currentIp) {
    currentIp.count = Math.max(0, currentIp.count - 1);
  }

  console.info('[AUTH] LOGIN_SUCCESS account_id=' + u.id);

  return res.json({ token, user });
};
