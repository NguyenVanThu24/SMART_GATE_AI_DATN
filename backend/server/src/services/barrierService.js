const db = require('../config/db');
const timers = {};

// TODO phần cứng: gửi tín hiệu relay / serial / HTTP tới barrier ở đây (HARDWARE_MODE=mock là giả lập).
async function sendToHardware(gate, action) {
  console.log(`[BARRIER] ${gate.name}: ${action.toUpperCase()}`);
}

exports.set = async (gateId, action, mode, accountId, io) => {
  const [[gate]] = await db.query('SELECT * FROM gates WHERE id=?', [gateId]);
  if (!gate || !gate.is_active) throw Object.assign(new Error('Cổng không tồn tại hoặc đã tắt'), { status: 404 });
  let status = action === 'open' ? 'open' : 'closed';
  try { await sendToHardware(gate, action); }
  catch (e) { status = 'error'; action = 'error'; console.error('[BARRIER] lỗi phần cứng', e.message); }
  await db.query('UPDATE gates SET barrier_status=? WHERE id=?', [status, gateId]);
  await db.query('INSERT INTO barrier_events (gate_id,action,triggered_by,account_id) VALUES (?,?,?,?)', [gateId, action, mode, accountId || null]);
  io.emit('barrier:status', { gate_id: +gateId, status });
  clearTimeout(timers[gateId]);
  if (status === 'open') { // an toàn: tự động đóng barrier sau N giây
    timers[gateId] = setTimeout(() => exports.set(gateId, 'close', 'auto', null, io).catch(console.error),
      (+process.env.BARRIER_AUTO_CLOSE_SEC || 8) * 1000);
  }
  return status;
};
