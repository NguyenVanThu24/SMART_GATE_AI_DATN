const db = require('../config/db');
const barrier = require('./barrierService');
const { LOG_SQL, normPlate, PLATE_EXPR } = require('./queries');

// Xử lý 1 kết quả nhận diện biển số: kiểm tra quyền -> ghi log -> mở barrier -> phát realtime
exports.process = async ({ gate_id, plate, confidence = 100, image_path = null }, io) => {
  const [[gate]] = await db.query('SELECT * FROM gates WHERE id=? AND is_active=1', [gate_id]);
  if (!gate) throw Object.assign(new Error('Cổng không tồn tại hoặc đã tắt'), { status: 404 });
  if (!plate) throw Object.assign(new Error('Thiếu biển số'), { status: 400 });
  const key = normPlate(plate);
  const direction = gate.direction === 'out' ? 'out' : 'in';
  let vehicle_id = null, visitor_id = null, result = 'denied', reason = 'Biển số chưa đăng ký';

  const [[v]] = await db.query(
    `SELECT *, (valid_from IS NULL OR valid_from<=CURDATE()) AND (valid_to IS NULL OR valid_to>=CURDATE()) AS in_range
     FROM vehicles WHERE ${PLATE_EXPR}=?`, [key]);
  if (v) {
    vehicle_id = v.id;
    if (!v.is_allowed) reason = 'Xe bị khóa quyền';
    else if (!v.in_range) reason = 'Hết hạn đăng ký';
    else { result = 'allowed'; reason = 'Xe nhân viên hợp lệ'; }
  } else {
    const [[vs]] = await db.query(
      `SELECT * FROM visitors WHERE ${PLATE_EXPR}=? AND status='approved' AND visit_date=CURDATE()
       AND (time_from IS NULL OR CURTIME()>=time_from) AND (time_to IS NULL OR CURTIME()<=time_to) LIMIT 1`, [key]);
    if (vs) { visitor_id = vs.id; result = 'allowed'; reason = 'Khách đã được duyệt'; }
  }
  if (result === 'allowed' && +confidence < (+process.env.MIN_CONFIDENCE || 80)) {
    result = 'pending'; reason = 'Độ tin cậy thấp, cần bảo vệ xác nhận';
  }
  const [r] = await db.query(
    'INSERT INTO access_logs (gate_id,plate_number,confidence,direction,vehicle_id,visitor_id,result,reason,image_path) VALUES (?,?,?,?,?,?,?,?,?)',
    [gate_id, String(plate).toUpperCase(), confidence, direction, vehicle_id, visitor_id, result, reason, image_path]);
  if (result === 'allowed') {
    await barrier.set(gate_id, 'open', 'auto', null, io);
    if (visitor_id && direction === 'out') await db.query("UPDATE visitors SET status='done' WHERE id=?", [visitor_id]);
  }
  const [[row]] = await db.query(`${LOG_SQL} WHERE a.id=?`, [r.insertId]);
  io.emit('plate:detected', row);
  return row;
};
