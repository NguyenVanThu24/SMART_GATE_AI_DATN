const crypto = require('crypto');
const http = require('http');
const db = require('../config/db');

const tickets = new Map();
const TICKET_TTL = 30000;
const MAX_TICKETS = 1000;

const cleanup = setInterval(() => {
  const now = Date.now();

  for (const [key, value] of tickets) {
    if (value.expires <= now) tickets.delete(key);
  }
}, 15000);

cleanup.unref();

exports.ticket = (req, res) => {
  if (tickets.size >= MAX_TICKETS) {
    return res.status(429).json({
      message: 'Quá nhiều yêu cầu camera'
    });
  }

  const ticket = crypto.randomBytes(32).toString('hex');

  tickets.set(ticket, {
    userId: req.user.id,
    role: req.user.role,
    expires: Date.now() + TICKET_TTL
  });

  res.set('Cache-Control', 'no-store');

  res.json({
    ticket,
    expires_in: 30
  });
};

exports.stream = async (req, res) => {
  const ticket = req.query.ticket;

  if (
    typeof ticket !== 'string' ||
    !/^[a-f0-9]{64}$/.test(ticket)
  ) {
    return res.sendStatus(401);
  }

  const session = tickets.get(ticket);
  tickets.delete(ticket);

  if (!session || session.expires <= Date.now()) {
    return res.sendStatus(401);
  }

  const [[user]] = await db.query(
    'SELECT id, role, is_active FROM accounts WHERE id=?',
    [session.userId]
  );

  if (!user || !user.is_active || user.role !== session.role) {
    return res.sendStatus(401);
  }

  if (res.destroyed) return;

  let upstream;
  let checking = false;
  let timer;
  let lifetime;

  const close = () => {
    clearInterval(timer);
    clearTimeout(lifetime);
    upstream?.destroy();
  };

  res.once('close', close);

  upstream = http.get(
    'http://smartgate_ai:5000/video_feed',
    response => {
      if (
        response.statusCode !== 200 ||
        !String(response.headers['content-type'])
          .startsWith('multipart/x-mixed-replace')
      ) {
        response.destroy();
        if (!res.headersSent) res.sendStatus(502);
        else res.destroy();
        return;
      }

      res.set({
        'Content-Type': response.headers['content-type'],
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no'
      });

      res.flushHeaders();

      response.on('error', () => res.destroy());
      response.on('aborted', () => res.destroy());

      response.pipe(res);
    }
  );

  upstream.setTimeout(20000, () => {
    upstream.destroy(new Error('Camera timeout'));
  });

  upstream.on('error', () => {
    if (!res.headersSent && !res.destroyed) {
      res.sendStatus(502);
    } else {
      res.destroy();
    }
  });

  timer = setInterval(async () => {
    if (checking || res.destroyed) return;

    checking = true;

    try {
      const [[current]] = await db.query(
        'SELECT role, is_active FROM accounts WHERE id=?',
        [session.userId]
      );

      if (
        !current ||
        !current.is_active ||
        current.role !== session.role
      ) {
        res.destroy();
      }
    } catch {
      res.destroy();
    } finally {
      checking = false;
    }
  }, 15000);

  // Buộc cấp lại vé định kỳ để xác thực lại JWT.
  lifetime = setTimeout(() => res.destroy(), 300000);
};
