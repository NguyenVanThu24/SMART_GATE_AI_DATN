const db = require('../config/db');
const barrier = require('../services/barrierService');
const detection = require('../services/detectionService');
const evidenceLog = require('../services/evidenceLogService');
const { LOG_SQL } = require('../services/queries');

exports.list = async (req, res) => res.json((await db.query('SELECT * FROM gates ORDER BY id'))[0]);
exports.barrier = async (req, res) => {
  const { action } = req.body;
  if (!['open', 'close'].includes(action)) return res.status(400).json({ message: 'action phải là open hoặc close' });
  const status = await barrier.set(req.params.id, action, 'manual', req.user.id, req.app.get('io'));
  res.json({ status });
};
exports.simulate = async (req, res) => // giả lập AI nhận diện (để test khi chưa có AI)
  res.json(await detection.process({ gate_id: req.params.id, plate: req.body.plate, confidence: req.body.confidence ?? 97 }, req.app.get('io')));
// Endpoint cho Python AI
exports.detect = async (req, res) => {
  const io = req.app.get('io');

  // Xu ly nhan dien va chong trung truoc
  const row = await detection.process(req.body, io);

  // Luu anh bang chung va cap nhat MySQL
  const updated = await evidenceLog.attachEvidence(
    row,
    req.body,
    io
  );

  return res.json(updated);
};

exports.history = async (req, res) => {
  const {
    from, to, result, q, gate_id, direction,
    drive, telegram, paginated
  } = req.query;

  const w = [];
  const p = [];

  const validDate = value =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;

  if ((from && !validDate(from)) ||
      (to && !validDate(to)) ||
      (from && to && from > to)) {
    return res.status(400).json({
      message: 'Khoảng thời gian không hợp lệ'
    });
  }

  if (from) {
    w.push('a.created_at >= ?');
    p.push(from + ' 00:00:00');
  }

  if (to) {
    w.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    p.push(to);
  }

  const filters = [
    [result, 'a.result',
      ['allowed', 'denied', 'manual', 'pending']],
    [direction, 'a.direction', ['in', 'out']],
    [drive, 'a.drive_sync_status',
      ['not_required', 'pending', 'syncing', 'synced', 'failed']],
    [telegram, 'a.telegram_status',
      ['not_required', 'pending', 'sending', 'sent', 'failed', 'uncertain']]
  ];

  for (const [value, column, allowed] of filters) {
    if (!value) continue;

    if (!allowed.includes(value)) {
      return res.status(400).json({
        message: 'Bộ lọc không hợp lệ'
      });
    }

    w.push(`${column} = ?`);
    p.push(value);
  }

  if (gate_id) {
    const id = Number(gate_id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: 'Cổng không hợp lệ'
      });
    }

    w.push('a.gate_id = ?');
    p.push(id);
  }

  if (q) {
    if (typeof q !== 'string' || q.length > 100) {
      return res.status(400).json({
        message: 'Từ khóa không hợp lệ'
      });
    }

    const term = `%${q.trim()}%`;

    w.push(`(
      a.plate_number LIKE ?
      OR e.full_name LIKE ?
      OR vs.full_name LIKE ?
    )`);

    p.push(term, term, term);
  }

  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';

  const bounded = (value, fallback, max) => {
    const n = Number(value);

    return Number.isSafeInteger(n) && n > 0
      ? Math.min(n, max)
      : fallback;
  };

  // Preserve the original response format.
  if (paginated !== '1') {
    const limit = bounded(req.query.limit, 200, 1000);

    const [rows] = await db.query(
      `${LOG_SQL} ${where}
       ORDER BY a.id DESC LIMIT ?`,
      [...p, limit]
    );

    return res.json(rows);
  }

  const pageSize = bounded(req.query.pageSize, 20, 100);
  const requestedPage = bounded(req.query.page, 1, 1000000);

  const [[summary]] = await db.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(a.result='allowed'),0) AS allowed,
       COALESCE(SUM(a.result='denied'),0) AS denied,
       COALESCE(SUM(a.result='manual'),0) AS manual,
       COALESCE(SUM(a.result='pending'),0) AS pending
     FROM access_logs a
     JOIN gates g ON g.id=a.gate_id
     LEFT JOIN vehicles v ON v.id=a.vehicle_id
     LEFT JOIN employees e ON e.id=v.employee_id
     LEFT JOIN visitors vs ON vs.id=a.visitor_id
     ${where}`,
    p
  );

  const total = Number(summary.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const [rows] = await db.query(
    `${LOG_SQL} ${where}
     ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...p, pageSize, (page - 1) * pageSize]
  );

  return res.json({
    rows,
    total,
    page,
    pageSize,
    totalPages,
    summary
  });
};

exports.resolve = async (req, res) => { // bảo vệ duyệt thủ công các lượt 'pending'
  const allow = req.body.action === 'allow';
  const [[log]] = await db.query('SELECT * FROM access_logs WHERE id=?', [req.params.id]);
  if (!log) return res.status(404).json({ message: 'Không tìm thấy lượt' });
  if (log.result !== 'pending') return res.status(400).json({ message: 'Lượt này đã được xử lý' });
  await db.query('UPDATE access_logs SET result=?, reason=?, operator_id=? WHERE id=?',
    [allow ? 'manual' : 'denied', allow ? 'Bảo vệ xác nhận thủ công' : 'Bảo vệ từ chối', req.user.id, log.id]);
  if (allow) await barrier.set(log.gate_id, 'open', 'manual', req.user.id, req.app.get('io'));
  const [[row]] = await db.query(`${LOG_SQL} WHERE a.id=?`, [log.id]);
  req.app.get('io').emit('plate:updated', row);
  res.json(row);
};
exports.dashboard = async (req, res) => {
  const days = [1, 7, 30].includes(Number(req.query.days))
    ? Number(req.query.days) : 7;

  const one = async sql =>
    Number(Object.values((await db.query(sql))[0][0])[0]);

  const stats = {
    vehicles: await one('SELECT COUNT(*) FROM vehicles'),
    employees: await one('SELECT COUNT(*) FROM employees'),
    inside: await one(`SELECT COUNT(*) FROM access_logs a
      WHERE a.result IN ('allowed','manual')
      AND a.direction='in'
      AND a.id=(SELECT MAX(b.id) FROM access_logs b
      WHERE b.plate_number=a.plate_number
      AND b.result IN ('allowed','manual'))`),
    visitorsToday: await one(
      'SELECT COUNT(*) FROM visitors WHERE visit_date=CURDATE()'
    ),
    deniedToday: await one(`SELECT COUNT(*) FROM access_logs
      WHERE result='denied' AND created_at>=CURDATE()
      AND created_at<CURDATE()+INTERVAL 1 DAY`),
    pending: await one(
      "SELECT COUNT(*) FROM access_logs WHERE result='pending'"
    )
  };

  const [calendar] = await db.query(`
    WITH RECURSIVE dates AS (
      SELECT CURDATE()-INTERVAL ${days - 1} DAY AS day
      UNION ALL
      SELECT day+INTERVAL 1 DAY FROM dates WHERE day<CURDATE()
    )
    SELECT DATE_FORMAT(dates.day,'%d/%m') AS d,
      COUNT(a.id) AS c,
      SUM(CASE WHEN a.direction='in' THEN 1 ELSE 0 END) AS incoming,
      SUM(CASE WHEN a.direction='out' THEN 1 ELSE 0 END) AS outgoing,
      SUM(CASE WHEN a.result='allowed' THEN 1 ELSE 0 END) AS allowed,
      SUM(CASE WHEN a.result='denied' THEN 1 ELSE 0 END) AS denied,
      SUM(CASE WHEN a.result='manual' THEN 1 ELSE 0 END) AS manual,
      SUM(CASE WHEN a.result='pending' THEN 1 ELSE 0 END) AS pending
    FROM dates LEFT JOIN access_logs a
      ON a.created_at>=dates.day
      AND a.created_at<dates.day+INTERVAL 1 DAY
    GROUP BY dates.day ORDER BY dates.day
  `);

  const traffic = calendar.map(row => Object.fromEntries(
    Object.entries(row).map(([k,v]) => [k,k==='d'?v:Number(v)])
  ));

  const [week] = await db.query(`
    SELECT DATE_FORMAT(created_at,'%d/%m') AS d, COUNT(*) AS c
    FROM access_logs
    WHERE created_at>=CURDATE()-INTERVAL 6 DAY
      AND created_at<CURDATE()+INTERVAL 1 DAY
    GROUP BY DATE(created_at),d ORDER BY DATE(created_at)
  `);

  const [recent] = await db.query(
    `${LOG_SQL} ORDER BY a.id DESC LIMIT 8`
  );

  const [drive] = await db.query(`
    SELECT drive_sync_status AS status, COUNT(*) AS total
    FROM access_logs GROUP BY drive_sync_status
  `);

  const [telegram] = await db.query(`
    SELECT telegram_status AS status, COUNT(*) AS total
    FROM access_logs GROUP BY telegram_status
  `);

  const [gates] = await db.query(`
    SELECT id,name,barrier_status,is_active
    FROM gates ORDER BY id
  `);

  const mqtt = require('../services/mqttService').getHealth(
    Number(process.env.MQTT_GATE_ID || 1)
  );

  let ai = { reachable: false, camera: null };

  try {
    const response = await fetch(
      'http://smartgate_ai:5000/health',
      { signal: AbortSignal.timeout(2000) }
    );
    if (response.ok) {
      const health = await response.json();
      ai = {
        reachable: true,
        camera: typeof health.camera_connected === 'boolean'
          ? health.camera_connected : null
      };
    }
  } catch {}

  res.json({
    stats, week, recent, traffic, days,
    services: {
      backend: true, database: true, ai, mqtt,
      hardwareMode: process.env.HARDWARE_MODE || 'mock'
    },
    drive, telegram, gates
  });
};
