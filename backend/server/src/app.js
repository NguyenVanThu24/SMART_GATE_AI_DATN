require('dotenv').config();
const express = require('express'), cors = require('cors'), http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const db = require('./config/db');
const mqttService = require('./services/mqttService');
const driveSyncWorker = require('./services/driveSyncWorker');
const telegramAlertWorker = require('./services/telegramAlertWorker');
const { notFound, errorHandler } = require('./middlewares/error');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || '*' } });
app.set('io', io);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes'));
app.use(notFound);
app.use(errorHandler);

io.on('connection', (s) => console.log('[socket] client', s.id));

(async () => {
  try { // mật khẩu mẫu 'RESET' trong SQL -> đặt thành Admin@123
    const hash = bcrypt.hashSync('Admin@123', 10);
    const [r] = await db.query("UPDATE accounts SET password_hash=? WHERE password_hash='RESET'", [hash]);
    if (r.affectedRows) console.log(`[seed] đã đặt mật khẩu mặc định Admin@123 cho ${r.affectedRows} tài khoản`);
  } catch (e) { console.error('[seed] bỏ qua:', e.message); }
  server.listen(process.env.PORT || 3000, () => {
    console.log('Smart Gate API chạy tại cổng', process.env.PORT || 3000);


    if (process.env.HARDWARE_MODE === 'mqtt') {
      try {
        mqttService.start();
      } catch (error) {
        console.error('[MQTT] Startup failed:', error.message);
      }
    }

    telegramAlertWorker.start().catch(() => {
      console.error('[telegram] Worker startup failed');
    });

    driveSyncWorker.start().catch(error => {
      console.error('[drive] Worker startup failed:', error.message);
    });
  });
})();
