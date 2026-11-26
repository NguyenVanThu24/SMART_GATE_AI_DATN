const fs = require('fs/promises');
const crypto = require('crypto');
const path = require('path');

const SECRETS_DIR =
  process.env.GOOGLE_DRIVE_SECRETS_DIR ||
  '/run/secrets/google_drive';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TIMEOUT = 30000;

let accessToken = null;
let expiresAt = 0;
let refreshPromise = null;

async function readConfig(filename) {
  const content = await fs.readFile(
    path.join(SECRETS_DIR, filename),
    'utf8'
  );

  return JSON.parse(content);
}

async function refreshAccessToken() {
  const config = await readConfig('token.json');

  if (
    !config.client_id ||
    !config.client_secret ||
    !config.refresh_token
  ) {
    throw new Error('Google OAuth config invalid');
  }

  const body = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    refresh_token: config.refresh_token,
    grant_type: 'refresh_token'
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(TIMEOUT)
  });

  if (!response.ok) {
    throw new Error(
      `Google OAuth HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.access_token || !data.expires_in) {
    throw new Error('Google access token invalid');
  }

  accessToken = data.access_token;
  expiresAt = Date.now() + Number(data.expires_in) * 1000;

  return accessToken;
}

async function getAccessToken() {
  if (
    accessToken &&
    Date.now() < expiresAt - 60000
  ) {
    return accessToken;
  }

  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function request(url, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(TIMEOUT)
    });

    if (response.status === 401 && attempt === 0) {
      await response.body?.cancel();
      accessToken = null;
      expiresAt = 0;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();

      const error = new Error(
        `Google Drive HTTP ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  throw new Error('Google Drive authentication failed');
}

function escapeQuery(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

async function getRootFolderId() {
  const config = await readConfig('drive_config.json');

  if (!config.root_folder_id) {
    throw new Error('Google Drive root folder missing');
  }

  return config.root_folder_id;
}

async function getFile(fileId) {
  const fields =
    'id,name,mimeType,parents,size,md5Checksum,trashed,appProperties';

  try {
    return await request(
      `${API}/files/${encodeURIComponent(fileId)}` +
      `?fields=${encodeURIComponent(fields)}`
    );
  } catch (error) {
    if (error.status === 404) {
      return null;
    }

    throw error;
  }
}

async function checkConnection() {
  const rootId = await getRootFolderId();
  const folder = await getFile(rootId);

  if (
    !folder ||
    folder.trashed ||
    folder.mimeType !== FOLDER_MIME
  ) {
    throw new Error('Google Drive root folder invalid');
  }

  return {
    connected: true,
    folderName: folder.name
  };
}

async function findFolder(name, parentId) {
  const query = [
    `name = '${escapeQuery(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${escapeQuery(parentId)}' in parents`,
    'trashed = false'
  ].join(' and ');

  const params = new URLSearchParams({
    q: query,
    spaces: 'drive',
    fields: 'nextPageToken,files(id,name)',
    pageSize: '100'
  });

  const result = await request(
    `${API}/files?${params}`
  );

  const folders = result.files || [];

  if (folders.length > 1 || result.nextPageToken) {
    throw new Error('Duplicate Google Drive folders');
  }

  return folders[0] || null;
}

async function ensureFolder(name, parentId) {
  const existing = await findFolder(name, parentId);

  if (existing) {
    return existing.id;
  }

  const folder = await request(
    `${API}/files?fields=id,name`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId]
      })
    }
  );

  return folder.id;
}

async function ensureEventFolder(date, eventId) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(eventId)) {
    throw new Error('Invalid event UUID');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid event date');
  }

  const [year, month, day] = date.split('-');

  let parentId = await getRootFolderId();

  for (const name of [
    year,
    month,
    day,
    eventId.toLowerCase()
  ]) {
    parentId = await ensureFolder(name, parentId);
  }

  return parentId;
}

async function generateFileId() {
  const result = await request(
    `${API}/files/generateIds?count=1&space=drive`
  );

  if (!result.ids?.[0]) {
    throw new Error('Cannot generate Google Drive file ID');
  }

  return result.ids[0];
}

async function uploadJpeg({
  fileId,
  parentId,
  filename,
  buffer,
  eventId
}) {
  if (!fileId || !parentId || !eventId) {
    throw new Error('Missing upload metadata');
  }

  if (!['snapshot.jpg', 'plate.jpg'].includes(filename)) {
    throw new Error('Invalid evidence filename');
  }

  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 4 ||
    buffer.length > 2 * 1024 * 1024 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    throw new Error('Invalid JPEG buffer');
  }

  const checksum = crypto
    .createHash('md5')
    .update(buffer)
    .digest('hex');

  function verify(file) {
    if (
      !file ||
      file.trashed ||
      file.id !== fileId ||
      file.name !== filename ||
      file.mimeType !== 'image/jpeg' ||
      !file.parents?.includes(parentId) ||
      file.appProperties?.event_id !== eventId ||
      file.appProperties?.evidence_type !== filename ||
      file.md5Checksum !== checksum ||
      Number(file.size) !== buffer.length
    ) {
      throw new Error('Google Drive file verification failed');
    }

    return file;
  }

  const existing = await getFile(fileId);

  if (existing) {
    return verify(existing);
  }

  const boundary =
    'smartgate_' + crypto.randomBytes(16).toString('hex');

  const metadata = {
    id: fileId,
    name: filename,
    mimeType: 'image/jpeg',
    parents: [parentId],
    appProperties: {
      event_id: eventId,
      evidence_type: filename
    }
  };

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      '\r\n'
    ),
    Buffer.from(
      `--${boundary}\r\n` +
      'Content-Type: image/jpeg\r\n\r\n'
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const fields =
    'id,name,mimeType,parents,size,md5Checksum,trashed,appProperties';

  try {
    const file = await request(
      `${UPLOAD_API}/files?uploadType=multipart` +
      `&fields=${encodeURIComponent(fields)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

    return verify(file);
  } catch (error) {
    if (error.status === 409) {
      return verify(await getFile(fileId));
    }

    throw error;
  }
}


async function listChildren(parentId) {
  const files = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      q: `'${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum)',
      pageSize: '100'
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const result = await request(`${API}/files?${params}`);

    files.push(...(result.files || []));
    pageToken = result.nextPageToken;

  } while (pageToken);

  return files;
}

module.exports = {
  listChildren,
  checkConnection,
  getRootFolderId,
  getFile,
  ensureFolder,
  ensureEventFolder,
  generateFileId,
  uploadJpeg
};
