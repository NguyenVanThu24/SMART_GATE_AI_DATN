const fs = require('fs/promises');
const path = require('path');

const db = require('../config/db');
const drive = require('./googleDriveService');

const EVIDENCE_ROOT = '/app/storage/evidence';

const POLL_INTERVAL = 10000;
const RETRY_DELAY = 60000;
const MAX_ATTEMPTS = 5;

let started = false;
let running = false;
let timer = null;

function validateEvidencePaths(row) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(row.event_id || '')) {
    throw new Error('Invalid event UUID');
  }

  const eventId = row.event_id.toLowerCase();

  const pattern =
    /^(\d{4})\/(\d{2})\/(\d{2})\/([0-9a-f-]{36})\/snapshot\.jpg$/;

  const match = String(row.image_path || '').match(pattern);

  if (!match || match[4] !== eventId) {
    throw new Error('Invalid snapshot path');
  }

  const directory =
    `${match[1]}/${match[2]}/${match[3]}/${eventId}`;

  if (row.plate_image_path !== `${directory}/plate.jpg`) {
    throw new Error('Invalid plate image path');
  }

  return {
    eventId,
    date: `${match[1]}-${match[2]}-${match[3]}`,
    snapshot: path.join(EVIDENCE_ROOT, row.image_path),
    plate: path.join(EVIDENCE_ROOT, row.plate_image_path)
  };
}

async function readEvidence(filename) {
  const realRoot = await fs.realpath(EVIDENCE_ROOT);
  const realFile = await fs.realpath(filename);

  if (!realFile.startsWith(realRoot + path.sep)) {
    throw new Error('Evidence path outside storage');
  }

  const stat = await fs.stat(realFile);

  if (
    !stat.isFile() ||
    stat.size < 4 ||
    stat.size > 2 * 1024 * 1024
  ) {
    throw new Error('Invalid evidence file size');
  }

  return fs.readFile(realFile);
}

async function recoverInterruptedEvents() {
  const [result] = await db.query(`
    UPDATE access_logs
    SET
      drive_sync_status = CASE
        WHEN drive_sync_attempts >= ?
        THEN 'failed'
        ELSE 'pending'
      END,
      drive_sync_error = 'Recovered interrupted synchronization'
    WHERE drive_sync_status = 'syncing'
  `, [MAX_ATTEMPTS]);

  console.log(
    '[drive] Recovered interrupted events:',
    result.affectedRows
  );
}

async function claimNextEvent() {
  const [[row]] = await db.query(`
    SELECT
      id,
      event_id,
      image_path,
      plate_image_path,
      drive_snapshot_id,
      drive_plate_id,
      drive_sync_attempts
    FROM access_logs
    WHERE drive_sync_status = 'pending'
      AND drive_sync_attempts < ?
      AND event_id IS NOT NULL
      AND image_path IS NOT NULL
      AND plate_image_path IS NOT NULL
    ORDER BY id ASC
    LIMIT 1
  `, [MAX_ATTEMPTS]);

  if (!row) {
    return null;
  }

  const [result] = await db.query(`
    UPDATE access_logs
    SET
      drive_sync_status = 'syncing',
      drive_sync_attempts = drive_sync_attempts + 1,
      drive_sync_error = NULL
    WHERE id = ?
      AND drive_sync_status = 'pending'
  `, [row.id]);

  if (result.affectedRows !== 1) {
    return null;
  }

  row.drive_sync_attempts =
    Number(row.drive_sync_attempts) + 1;

  return row;
}

async function reserveFileIds(row) {
  const snapshotId =
    row.drive_snapshot_id ||
    await drive.generateFileId();

  const plateId =
    row.drive_plate_id ||
    await drive.generateFileId();

  const [result] = await db.query(`
    UPDATE access_logs
    SET
      drive_snapshot_id = ?,
      drive_plate_id = ?
    WHERE id = ?
      AND drive_sync_status = 'syncing'
  `, [snapshotId, plateId, row.id]);

  if (result.affectedRows !== 1) {
    throw new Error('Cannot reserve Drive file IDs');
  }

  return { snapshotId, plateId };
}

async function syncEvent(row) {
  const files = validateEvidencePaths(row);

  const snapshot = await readEvidence(files.snapshot);
  const plate = await readEvidence(files.plate);

  const parentId = await drive.ensureEventFolder(
    files.date,
    files.eventId
  );

  const ids = await reserveFileIds(row);

  await drive.uploadJpeg({
    fileId: ids.snapshotId,
    parentId,
    filename: 'snapshot.jpg',
    buffer: snapshot,
    eventId: files.eventId
  });

  await drive.uploadJpeg({
    fileId: ids.plateId,
    parentId,
    filename: 'plate.jpg',
    buffer: plate,
    eventId: files.eventId
  });

  const [result] = await db.query(`
    UPDATE access_logs
    SET
      drive_sync_status = 'synced',
      drive_sync_error = NULL,
      drive_synced_at = NOW()
    WHERE id = ?
      AND drive_sync_status = 'syncing'
  `, [row.id]);

  if (result.affectedRows !== 1) {
    throw new Error('Cannot finalize Drive synchronization');
  }

  console.log(
    '[drive] SYNCED:',
    row.id,
    files.eventId
  );
}

async function handleFailure(row, error) {
  const status =
    row.drive_sync_attempts >= MAX_ATTEMPTS
      ? 'failed'
      : 'pending';

  const message = String(
    error.message || 'Unknown synchronization error'
  ).slice(0, 500);

  await db.query(`
    UPDATE access_logs
    SET
      drive_sync_status = ?,
      drive_sync_error = ?
    WHERE id = ?
      AND drive_sync_status = 'syncing'
  `, [status, message, row.id]);

  console.error(
    '[drive] SYNC ERROR:',
    row.id,
    'attempt:',
    row.drive_sync_attempts,
    'status:',
    status,
    message
  );
}

function schedule(delay) {
  if (!started) return;

  timer = setTimeout(tick, delay);
}

async function tick() {
  if (!started || running) return;

  running = true;

  let delay = POLL_INTERVAL;
  let row = null;

  try {
    row = await claimNextEvent();

    if (row) {
      console.log(
        '[drive] SYNCING:',
        row.id,
        'attempt:',
        row.drive_sync_attempts
      );

      await syncEvent(row);
    }
  } catch (error) {
    delay = RETRY_DELAY;

    if (row) {
      try {
        await handleFailure(row, error);
      } catch (dbError) {
        console.error(
          '[drive] Cannot update failed event:',
          dbError.message
        );
      }
    } else {
      console.error(
        '[drive] Worker error:',
        error.message
      );
    }
  } finally {
    running = false;
    schedule(delay);
  }
}

async function start() {
  if (started) return;

  started = true;

  try {
    await recoverInterruptedEvents();

    console.log('[drive] WORKER STARTED');

    schedule(1000);
  } catch (error) {
    started = false;
    throw error;
  }
}

function stop() {
  started = false;

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  console.log('[drive] WORKER STOPPED');
}

module.exports = {
  start,
  stop
};
