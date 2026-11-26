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
  const { from, to, result, q, limit = 200 } = req.query; const w = []; const p = [];
  if (from) { w.push('a.created_at>=?'); p.push(from + ' 00:00:00'); }
  if (to) { w.push('a.created_at<=?'); p.push(to + ' 23:59:59'); }
  if (result) { w.push('a.result=?'); p.push(result); }
  if (q) { w.push('(a.plate_number LIKE ? OR e.full_name LIKE ? OR vs.full_name LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const [rows] = await db.query(`${LOG_SQL} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`, [...p, +limit]);
  res.json(rows);
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
  const one = async (sql) => Object.values((await db.query(sql))[0][0])[0];
  const stats = {
    vehicles: await one('SELECT COUNT(*) FROM vehicles'),
    inside: await one(`SELECT COUNT(*) FROM access_logs a WHERE a.result IN ('allowed','manual') AND a.direction='in'
      AND a.id=(SELECT MAX(b.id) FROM access_logs b WHERE b.plate_number=a.plate_number AND b.result IN ('allowed','manual'))`),
    visitorsToday: await one('SELECT COUNT(*) FROM visitors WHERE visit_date=CURDATE()'),
    deniedToday: await one("SELECT COUNT(*) FROM access_logs WHERE result='denied' AND DATE(created_at)=CURDATE()"),
    pending: await one("SELECT COUNT(*) FROM access_logs WHERE result='pending'"),
  };
  const [week] = await db.query(`SELECT DATE_FORMAT(created_at,'%d/%m') AS d, COUNT(*) AS c FROM access_logs
    WHERE created_at>=CURDATE()-INTERVAL 6 DAY GROUP BY DATE(created_at), d ORDER BY DATE(created_at)`);
  const [recent] = await db.query(`${LOG_SQL} ORDER BY a.id DESC LIMIT 8`);
  res.json({ stats, week, recent });
};
