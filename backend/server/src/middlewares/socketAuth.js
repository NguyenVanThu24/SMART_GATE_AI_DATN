const jwt = require('jsonwebtoken');
const db = require('../config/db');

async function verifySession(token) {
  if (typeof token !== 'string' || !token) {
    throw new Error('UNAUTHORIZED');
  }

  const decoded = jwt.verify(
    token,
    process.env.JWT_SECRET,
    { algorithms: ['HS256'] }
  );

  if (!Number.isSafeInteger(decoded.id) || decoded.id <= 0) {
    throw new Error('UNAUTHORIZED');
  }

  const [[user]] = await db.query(
    `SELECT id, username, role, is_active
     FROM accounts WHERE id=? LIMIT 1`,
    [decoded.id]
  );

  if (!user || !user.is_active) {
    throw new Error('UNAUTHORIZED');
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

module.exports = function installSocketAuth(io) {
  io.use(async (socket, next) => {
    try {
      socket.data.user = await verifySession(
        socket.handshake.auth?.token
      );
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', socket => {
    let checking = false;

    const timer = setInterval(async () => {
      if (checking || !socket.connected) return;

      checking = true;

      try {
        const current = await verifySession(
          socket.handshake.auth?.token
        );

        if (current.role !== socket.data.user.role) {
          throw new Error('ROLE_CHANGED');
        }
      } catch {
        socket.emit('auth:expired');
        socket.disconnect(true);
      } finally {
        checking = false;
      }
    }, 15000);

    socket.on('disconnect', () => {
      clearInterval(timer);
    });
  });
};
