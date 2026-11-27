const db = require('../config/db');
const mqttService = require('./mqttService');

const timers = {};
const busy = new Set();

function isPhysicalGate(gateId) {
  return process.env.HARDWARE_MODE === 'mqtt' &&
    Number(gateId) === Number(process.env.MQTT_GATE_ID || 1);
}

async function sendToHardware(gate, action) {
  if (isPhysicalGate(gate.id)) {
    await mqttService.sendCommand(gate.id, action);
  } else {
    console.log(
      `[BARRIER MOCK] ${gate.name}: ${action.toUpperCase()}`
    );
  }
}

exports.set = async (gateId, action, mode, accountId, io) => {
  gateId = Number(gateId);

  if (!['open', 'close'].includes(action)) {
    throw Object.assign(
      new Error('Lenh barie khong hop le'),
      { status: 400 }
    );
  }

  if (busy.has(gateId)) {
    throw Object.assign(
      new Error('Cong dang xu ly lenh khac'),
      { status: 409 }
    );
  }

  busy.add(gateId);

  try {
    const [[gate]] = await db.query(
      'SELECT * FROM gates WHERE id=?',
      [gateId]
    );

    if (!gate || !gate.is_active) {
      throw Object.assign(
        new Error('Cong khong ton tai hoac da tat'),
        { status: 404 }
      );
    }

    clearTimeout(timers[gateId]);
    delete timers[gateId];

    let status = action === 'open' ? 'open' : 'closed';
    let eventAction = action;

    try {
      await sendToHardware(gate, action);
    } catch (error) {
      status = 'error';
      eventAction = 'error';

      console.error(
        '[BARRIER] HARDWARE ERROR:',
        error.message
      );
    }

    await db.query(
      'UPDATE gates SET barrier_status=? WHERE id=?',
      [status, gateId]
    );

    await db.query(
      `INSERT INTO barrier_events
       (gate_id,action,triggered_by,account_id)
       VALUES (?,?,?,?)`,
      [gateId, eventAction, mode, accountId || null]
    );

    if (io) {
      io.emit('barrier:status', {
        gate_id: gateId,
        status
      });
    }

    // Auto close is enabled only for mock gates.
    if (!isPhysicalGate(gateId) && status === 'open') {
      timers[gateId] = setTimeout(() => {
        exports.set(
          gateId, 'close', 'auto', null, io
        ).catch(console.error);
      }, (+process.env.BARRIER_AUTO_CLOSE_SEC || 8) * 1000);
    }

    return status;

  } finally {
    busy.delete(gateId);
  }
};
