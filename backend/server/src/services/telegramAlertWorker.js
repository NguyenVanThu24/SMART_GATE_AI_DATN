const fs = require('fs/promises');
const path = require('path');

const db = require('../config/db');
const telegram = require('./telegramService');

const ROOT = '/app/storage/evidence';
const MAX_ATTEMPTS = 5;
const POLL_INTERVAL = 5000;

let started = false;
let timer = null;

async function readEvidence(row, filename, type) {
  const pattern =
    /^(\d{4}\/\d{2}\/\d{2})\/([0-9a-f-]{36})\/(snapshot|plate)\.jpg$/;

  const match = String(filename || '').match(pattern);

  if (
    !match ||
    match[2] !== String(row.event_id).toLowerCase() ||
    match[3] !== type
  ) {
    throw new Error('Invalid evidence path');
  }

  const root = await fs.realpath(ROOT);
  const file = await fs.realpath(path.join(ROOT, filename));

  if (!file.startsWith(root + path.sep)) {
    throw new Error('Invalid evidence location');
  }

  const stat = await fs.stat(file);

  if (!stat.isFile() || stat.size < 4 || stat.size > 2097152) {
    throw new Error('Invalid evidence size');
  }

  return fs.readFile(file);
}

function buildMessage(row) {
  return [
    '🚨 SMART GATE AI - CẢNH BÁO PHƯƠNG TIỆN',
    '',
    `Biển số: ${row.plate_number}`,
    `Thời gian: ${row.created_at}`,
    `Vị trí: ${row.gate_name || row.gate_id}`,
    `Hướng: ${row.direction === 'out' ? 'Ra' : 'Vào'}`,
    'Kết quả: TỪ CHỐI',
    `Lý do: ${row.reason || 'Không có quyền truy cập'}`,
    `Độ tin cậy: ${row.confidence ?? 'N/A'}%`,
    `Mã sự kiện: #${row.id}`
  ].join('\n');
}

async function claimNext() {
  const [[row]] = await db.query(`
    SELECT a.*, g.name AS gate_name
    FROM access_logs a
    LEFT JOIN gates g ON g.id = a.gate_id
    WHERE a.telegram_status = 'pending'
      AND a.result = 'denied'
      AND a.telegram_attempts < ?
      AND (
        a.telegram_next_retry_at IS NULL
        OR a.telegram_next_retry_at <= NOW()
      )
    ORDER BY a.id
    LIMIT 1
  `, [MAX_ATTEMPTS]);

  if (!row) return null;

  const [result] = await db.query(`
    UPDATE access_logs
    SET telegram_status = 'sending',
        telegram_attempts = telegram_attempts + 1,
        telegram_error = NULL
    WHERE id = ?
      AND telegram_status = 'pending'
      AND result = 'denied'
  `, [row.id]);

  if (result.affectedRows !== 1) return null;

  row.telegram_attempts = Number(row.telegram_attempts) + 1;

  return row;
}

async function sendAlert(row) {
  let snapshot;
  let plate;

  const message = buildMessage(row);

  if (row.image_path && row.plate_image_path) {
    try {
      snapshot = await readEvidence(
        row, row.image_path, 'snapshot'
      );

      plate = await readEvidence(
        row, row.plate_image_path, 'plate'
      );
    } catch {
      console.warn('[telegram] Evidence unavailable:', row.id);
    }
  }

  let result;

  if (snapshot && plate) {
    result = await telegram.sendEvidence(
      message,
      snapshot,
      plate
    );
  } else {
    result = await telegram.sendMessage(
      message + '\nẢnh bằng chứng: Chưa có'
    );
  }

  const messageId = Array.isArray(result)
    ? result[0]?.message_id
    : result?.message_id;

  if (!messageId) {
    throw new telegram.TelegramError(
      'Missing Telegram message ID',
      false,
      true
    );
  }

  try {
    const [updated] = await db.query(`
      UPDATE access_logs
      SET telegram_status = 'sent',
          telegram_message_id = ?,
          telegram_sent_at = NOW(),
          telegram_error = NULL,
          telegram_next_retry_at = NULL
      WHERE id = ?
        AND telegram_status = 'sending'
    `, [messageId, row.id]);

    if (updated.affectedRows !== 1) {
      throw new Error('Cannot finalize alert');
    }
  } catch {
    throw new telegram.TelegramError(
      'Telegram sent but database confirmation failed',
      false,
      true
    );
  }

  console.log('[telegram] SENT:', row.id);
}

async function handleFailure(row, error) {
  const retry =
    error.retryable &&
    row.telegram_attempts < MAX_ATTEMPTS;

  const status = error.uncertain
    ? 'uncertain'
    : retry ? 'pending' : 'failed';

  const delay = Math.min(
    86400,
    Math.max(60, Number(error.retryAfter) || 60)
  );

  const message = error instanceof telegram.TelegramError
    ? error.message.slice(0, 500)
    : 'Telegram worker internal error';

  await db.query(`
    UPDATE access_logs
    SET telegram_status = ?,
        telegram_error = ?,
        telegram_next_retry_at =
          CASE WHEN ? = 'pending'
            THEN DATE_ADD(NOW(), INTERVAL ? SECOND)
            ELSE NULL
          END
    WHERE id = ?
      AND telegram_status = 'sending'
  `, [status, message, status, delay, row.id]);

  console.error(
    '[telegram] ERROR:',
    row.id,
    status,
    message
  );
}

async function tick() {
  if (!started) return;

  let row;

  try {
    row = await claimNext();

    if (row) {
      await sendAlert(row);
    }
  } catch (error) {
    if (row) {
      try {
        await handleFailure(row, error);
      } catch {
        console.error(
          '[telegram] Cannot update event:',
          row.id
        );
      }
    } else {
      console.error('[telegram] Worker database error');
    }
  } finally {
    if (started) {
      timer = setTimeout(tick, POLL_INTERVAL);
    }
  }
}

async function start() {
  if (started) return;

  await telegram.getConfig();

  const [result] = await db.query(`
    UPDATE access_logs
    SET telegram_status = 'uncertain',
        telegram_error = 'Interrupted during Telegram delivery'
    WHERE telegram_status = 'sending'
  `);

  console.log(
    '[telegram] Interrupted events:',
    result.affectedRows
  );

  started = true;

  console.log('[telegram] WORKER STARTED');

  timer = setTimeout(tick, 1000);
}

function stop() {
  started = false;

  if (timer) clearTimeout(timer);
}

module.exports = { start, stop };
