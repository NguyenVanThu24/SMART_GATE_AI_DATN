const fs = require('fs/promises');

const SECRET_ROOT = '/run/secrets/telegram';

class TelegramError extends Error {
  constructor(message, retryable = false, uncertain = false, retryAfter = 60) {
    super(message);
    this.retryable = retryable;
    this.uncertain = uncertain;
    this.retryAfter = retryAfter;
  }
}

async function getConfig() {
  const token = (
    await fs.readFile(`${SECRET_ROOT}/bot_token`, 'utf8')
  ).trim();

  const chatId = (
    await fs.readFile(`${SECRET_ROOT}/chat_id`, 'utf8')
  ).trim();

  if (!/^\d+:[A-Za-z0-9_-]{30,50}$/.test(token)) {
    throw new TelegramError('Invalid Telegram token');
  }

  if (!/^-?\d+$/.test(chatId)) {
    throw new TelegramError('Invalid Telegram chat ID');
  }

  return { token, chatId };
}

async function request(method, buildBody) {
  const { token, chatId } = await getConfig();
  const body = buildBody(chatId);

  let response;

  try {
    response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: 'POST',
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(30000)
      }
    );
  } catch {
    throw new TelegramError(
      'Telegram connection outcome unknown',
      false,
      true
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new TelegramError(
      'Invalid Telegram response',
      false,
      true
    );
  }

  if (!response.ok || !data.ok) {
    const code = Number(data.error_code || response.status);

    if (code === 429) {
      throw new TelegramError(
        'Telegram rate limit',
        true,
        false,
        Math.max(60, Number(data.parameters?.retry_after) || 60)
      );
    }

    if (code >= 500) {
      throw new TelegramError(
        `Telegram HTTP ${code}: outcome unknown`,
        false,
        true
      );
    }

    throw new TelegramError(`Telegram HTTP ${code}`);
  }

  return data.result;
}

async function sendMessage(text) {
  return request('sendMessage', chatId =>
    new URLSearchParams({
      chat_id: chatId,
      text
    })
  );
}

async function sendEvidence(text, snapshot, plate) {
  return request('sendMediaGroup', chatId => {
    const form = new FormData();

    form.append('chat_id', chatId);

    form.append('media', JSON.stringify([
      {
        type: 'photo',
        media: 'attach://snapshot',
        caption: text
      },
      {
        type: 'photo',
        media: 'attach://plate',
        caption: 'Ảnh biển số'
      }
    ]));

    form.append(
      'snapshot',
      new Blob([snapshot], { type: 'image/jpeg' }),
      'snapshot.jpg'
    );

    form.append(
      'plate',
      new Blob([plate], { type: 'image/jpeg' }),
      'plate.jpg'
    );

    return form;
  });
}

module.exports = {
  getConfig,
  sendMessage,
  sendEvidence,
  TelegramError
};
