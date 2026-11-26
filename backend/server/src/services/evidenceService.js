const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = '/app/storage/evidence';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeImage(value) {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error('Base64 khong hop le');
  }

  const buffer = Buffer.from(value, 'base64');

  if (buffer.toString('base64') !== value) {
    throw new Error('Base64 khong dung chuan');
  }

  if (
    buffer.length < 4 ||
    buffer.length > MAX_IMAGE_BYTES
  ) {
    throw new Error('Dung luong anh khong hop le');
  }

  // Kiem tra marker dau va cuoi JPEG
  if (
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    throw new Error('Anh khong phai JPEG hop le');
  }

  return buffer;
}

async function writeOnce(filename, buffer) {
  const temp = filename + '.' +
    crypto.randomUUID() + '.tmp';

  try {
    await fs.writeFile(temp, buffer, {
      flag: 'wx',
      mode: 0o600
    });

    try {
      // Tao file dich ma khong ghi de file cu
      await fs.link(temp, filename);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  } finally {
    await fs.rm(temp, { force: true });
  }
}

async function saveEvidence({
  event_id,
  snapshot_base64,
  plate_base64,
  created_at
}) {
  if (
    typeof event_id !== 'string' ||
    !UUID_PATTERN.test(event_id)
  ) {
    throw new Error('event_id khong hop le');
  }

  const snapshot = decodeImage(snapshot_base64);
  const plate = decodeImage(plate_base64);

  // Su dung ngay tao su kien trong MySQL
  // de retry khong tao thu muc ngay moi
  const date = String(created_at).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Ngay su kien khong hop le');
  }

  const [year, month, day] = date.split('-');

  const relativeDir = path.posix.join(
    year,
    month,
    day,
    event_id.toLowerCase()
  );

  const directory = path.join(ROOT, relativeDir);

  await fs.mkdir(directory, {
    recursive: true,
    mode: 0o700
  });

  await writeOnce(
    path.join(directory, 'snapshot.jpg'),
    snapshot
  );

  await writeOnce(
    path.join(directory, 'plate.jpg'),
    plate
  );

  return {
    image_path: path.posix.join(
      relativeDir, 'snapshot.jpg'
    ),
    plate_image_path: path.posix.join(
      relativeDir, 'plate.jpg'
    )
  };
}

module.exports = {
  saveEvidence
};
