const mqtt = require('mqtt');
const fs = require('fs');
const { randomUUID } = require('crypto');

let client = null;
let ready = false;

const availability = new Map();
const pending = new Map();

function rejectPending(message) {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error(message));
  }

  pending.clear();
}

exports.start = () => {
  if (client) return;

  const password = fs.readFileSync(
    '/run/secrets/mqtt/backend_password',
    'utf8'
  ).trim();

  client = mqtt.connect(
    process.env.MQTT_URL || 'mqtt://smartgate_mqtt:1883',
    {
      clientId: 'smartgate-backend',
      username: 'smartgate_backend',
      password,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 5000,
      keepalive: 15,
      queueQoSZero: false
    }
  );

  client.on('connect', () => {
    ready = false;
    availability.clear();

    client.subscribe([
      'smartgate/gates/+/status',
      'smartgate/gates/+/availability'
    ], { qos: 1 }, (error, granted) => {
      if (error || !granted ||
          granted.some(item => item.qos >= 128)) {
        console.error('[MQTT] SUBSCRIBE FAILED');
        return;
      }

      ready = true;
      console.log('[MQTT] BACKEND CONNECTED');
    });
  });

  client.on('message', (topic, payload) => {
    const match = topic.match(
      /^smartgate\/gates\/(\d+)\/(status|availability)$/
    );

    if (!match) return;

    const gateId = Number(match[1]);
    const type = match[2];

    if (type === 'availability') {
      const online = payload.toString() === 'online';

      availability.set(gateId, online);

      console.log(
        `[MQTT] GATE ${gateId}: ${online ? 'ONLINE' : 'OFFLINE'}`
      );

      if (!online) {
        for (const [id, item] of pending) {
          if (item.gateId === gateId) {
            clearTimeout(item.timer);
            pending.delete(id);
            item.reject(new Error('ESP32 offline'));
          }
        }
      }

      return;
    }

    try {
      const data = JSON.parse(payload.toString());
      const item = pending.get(data.command_id);

      if (!item) return;

      if (item.gateId !== gateId ||
          data.gate_id !== gateId ||
          data.status !== item.expected) {
        return;
      }

      clearTimeout(item.timer);
      pending.delete(data.command_id);

      console.log(
        `[MQTT] ACK GATE ${gateId}: ${data.status}`
      );

      item.resolve(data);

    } catch {
      console.error('[MQTT] INVALID STATUS');
    }
  });

  client.on('close', () => {
    ready = false;
    availability.clear();
    rejectPending('MQTT disconnected');
  });

  client.on('error', error => {
    console.error('[MQTT]', error.message);
  });
};

exports.sendCommand = async (gateId, action) => {
  gateId = Number(gateId);

  if (!['open', 'close'].includes(action)) {
    throw new Error('Invalid barrier action');
  }

  if (!client || !client.connected || !ready) {
    throw new Error('MQTT broker unavailable');
  }

  if (availability.get(gateId) !== true) {
    throw new Error('ESP32 offline');
  }

  const commandId = randomUUID();

  const expected =
    action === 'open' ? 'open' : 'closed';

  const topic =
    `smartgate/gates/${gateId}/command`;

  const payload = JSON.stringify({
    gate_id: gateId,
    command_id: commandId,
    action
  });

  return new Promise((resolve, reject) => {
    const fail = error => {
      const item = pending.get(commandId);

      if (!item) return;

      clearTimeout(item.timer);
      pending.delete(commandId);
      reject(error);
    };

    const timer = setTimeout(() => {
      fail(new Error('ESP32 ACK timeout'));
    }, 5000);

    pending.set(commandId, {
      gateId,
      expected,
      timer,
      resolve,
      reject
    });

    console.log(
      `[MQTT] COMMAND GATE ${gateId}: ${action}`
    );

    client.publish(topic, payload, {
      qos: 0,
      retain: false
    }, error => {
      if (error) fail(error);
    });
  });
};

exports.getHealth = (gateId = 1) => {
  const connected = Boolean(client?.connected && ready);
  return {
    connected,
    device: !connected ? 'unknown'
      : availability.has(Number(gateId))
        ? (availability.get(Number(gateId)) ? 'online' : 'offline')
        : 'unknown'
  };
};
