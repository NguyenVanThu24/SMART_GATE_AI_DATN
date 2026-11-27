const db = require('../config/db');
const { LOG_SQL } = require('./queries');
const { saveEvidence } = require('./evidenceService');

exports.attachEvidence = async (row, payload, io) => {
  if (!row || !row.id || !row.event_id) {
    return row;
  }

  if (
    !payload.snapshot_base64 ||
    !payload.plate_base64
  ) {
    return row;
  }

  try {
    // Lay ngay su kien theo mui gio Viet Nam
    const [[current]] = await db.query(
      `SELECT *,
        DATE_FORMAT(
          CONVERT_TZ(created_at, @@session.time_zone, '+07:00'),
          '%Y-%m-%d'
        ) AS evidence_date
       FROM access_logs
       WHERE id = ? AND event_id = ?`,
      [row.id, row.event_id]
    );

    if (!current) {
      return row;
    }

    // Khong ghi de anh da luu
    if (
      current.image_path &&
      current.plate_image_path
    ) {
      const [[existing]] = await db.query(
        `${LOG_SQL} WHERE a.id = ?`,
        [row.id]
      );

      return existing || row;
    }

    // Luu anh vao Docker Volume
    const paths = await saveEvidence({
      event_id: current.event_id,
      created_at: current.evidence_date,
      snapshot_base64: payload.snapshot_base64,
      plate_base64: payload.plate_base64
    });

    // Cap nhat MySQL sau khi luu du hai anh
    const [result] = await db.query(
      `UPDATE access_logs
       SET image_path = ?,
           plate_image_path = ?,
           drive_sync_status = 'pending',
           drive_sync_error = NULL,
           telegram_next_retry_at = CASE
             WHEN telegram_status = 'pending'
               AND telegram_attempts = 0
             THEN NOW()
             ELSE telegram_next_retry_at
           END
       WHERE id = ?
         AND event_id = ?
         AND drive_sync_status = 'not_required'`,
      [
        paths.image_path,
        paths.plate_image_path,
        current.id,
        current.event_id
      ]
    );

    const [[updated]] = await db.query(
      `${LOG_SQL} WHERE a.id = ?`,
      [current.id]
    );

    if (updated && result.affectedRows > 0) {
      console.log(
        'EVIDENCE SAVED:',
        current.id,
        current.event_id
      );

      if (io) {
        io.emit('plate:updated', updated);
      }
    }

    return updated || row;

  } catch (err) {
    // Loi luu anh khong lam mat su kien nhan dien
    console.error(
      'EVIDENCE ERROR:',
      row.id,
      err.message
    );

    return row;
  }
};
