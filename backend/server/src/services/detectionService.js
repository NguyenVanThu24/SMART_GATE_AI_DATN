
const db = require('../config/db');
const barrier = require('./barrierService');
const { LOG_SQL, normPlate, PLATE_EXPR } = require('./queries');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const httpError = (message, status) =>
  Object.assign(new Error(message), { status });

async function getLogByEventId(eventId) {
  const [[row]] = await db.query(
    `${LOG_SQL} WHERE a.event_id=?`,
    [eventId]
  );
  return row;
}

function verifyDuplicate(row, gateId, plate) {
  if (
    Number(row.gate_id) !== Number(gateId) ||
    normPlate(row.plate_number) !== normPlate(plate)
  ) {
    throw httpError(
      'event_id đã được sử dụng cho cổng hoặc biển số khác',
      409
    );
  }
}

exports.process = async (
  {
    gate_id,
    plate,
    confidence = 100,
    image_path = null,
    event_id = null
  },
  io
) => {
  if (!plate || !String(plate).trim()) {
    throw httpError('Thiếu biển số', 400);
  }

  if (event_id != null) {
    if (
      typeof event_id !== 'string' ||
      !UUID_PATTERN.test(event_id)
    ) {
      throw httpError('event_id phải là UUID hợp lệ', 400);
    }
    event_id = event_id.toLowerCase();
  }

  const [[gate]] = await db.query(
    'SELECT * FROM gates WHERE id=? AND is_active=1',
    [gate_id]
  );

  if (!gate) {
    throw httpError('Cổng không tồn tại hoặc đã tắt', 404);
  }

  // Kiểm tra nhanh sự kiện đã được xử lý.
  if (event_id) {
    const existing = await getLogByEventId(event_id);
    if (existing) {
      verifyDuplicate(existing, gate_id, plate);
      return existing;
    }
  }

  const key = normPlate(plate);
  const direction = gate.direction === 'out' ? 'out' : 'in';

  let vehicle_id = null;
  let visitor_id = null;
  let result = 'denied';
  let reason = 'Biển số chưa đăng ký';

  const [[v]] = await db.query(
    `SELECT *,
      (valid_from IS NULL OR valid_from<=CURDATE())
      AND (valid_to IS NULL OR valid_to>=CURDATE()) AS in_range
     FROM vehicles WHERE ${PLATE_EXPR}=?`,
    [key]
  );

  if (v) {
    vehicle_id = v.id;

    if (!v.is_allowed) {
      reason = 'Xe bị khóa quyền';
    } else if (!v.in_range) {
      reason = 'Hết hạn đăng ký';
    } else {
      result = 'allowed';
      reason = 'Xe nhân viên hợp lệ';
    }
  } else {
    const [[vs]] = await db.query(
      `SELECT * FROM visitors
       WHERE ${PLATE_EXPR}=?
       AND status='approved'
       AND visit_date=CURDATE()
       AND (time_from IS NULL OR CURTIME()>=time_from)
       AND (time_to IS NULL OR CURTIME()<=time_to)
       LIMIT 1`,
      [key]
    );

    if (vs) {
      visitor_id = vs.id;
      result = 'allowed';
      reason = 'Khách đã được duyệt';
    }
  }

  if (
    result === 'allowed' &&
    +confidence < (+process.env.MIN_CONFIDENCE || 80)
  ) {
    result = 'pending';
    reason = 'Độ tin cậy thấp, cần bảo vệ xác nhận';
  }

  let insertId;

  try {
    const [r] = await db.query(
      `INSERT INTO access_logs
       (gate_id, plate_number, confidence, direction,
        vehicle_id, visitor_id, result, reason,
        image_path, event_id,
        telegram_status, telegram_next_retry_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,
         CASE WHEN ? = 'pending'
           THEN DATE_ADD(NOW(), INTERVAL 30 SECOND)
           ELSE NULL END)`,
      [
        gate_id,
        String(plate).toUpperCase(),
        confidence,
        direction,
        vehicle_id,
        visitor_id,
        result,
        reason,
        image_path,
        event_id,
        result === 'denied' && event_id
          ? 'pending' : 'not_required',
        result === 'denied' && event_id
          ? 'pending' : 'not_required'
      ]
    );

    insertId = r.insertId;
  } catch (err) {
    // Hai request đồng thời cùng event_id:
    // MySQL UNIQUE chỉ cho phép một request INSERT thành công.
    if (err.code === 'ER_DUP_ENTRY' && event_id) {
      const existing = await getLogByEventId(event_id);

      if (existing) {
        verifyDuplicate(existing, gate_id, plate);
        return existing;
      }
    }

    throw err;
  }

  // Chỉ bản ghi vừa INSERT thành công mới đi đến bước mở barrier.
  const aiTestMode = process.env.AI_TEST_MODE !== 'false';

  if (result === 'allowed' && !aiTestMode) {
    await barrier.set(gate_id, 'open', 'auto', null, io);

    if (visitor_id && direction === 'out') {
      await db.query(
        "UPDATE visitors SET status='done' WHERE id=?",
        [visitor_id]
      );
    }
  }

  const [[row]] = await db.query(
    `${LOG_SQL} WHERE a.id=?`,
    [insertId]
  );

  io.emit('plate:detected', row);
  return row;
};
