const db = require('../config/db');
const bcrypt = require('bcryptjs');
const bad = (m) => Object.assign(new Error(m), { status: 400 });

module.exports = (cfg) => {
  const pick = (body, isNew, user) => {
    const d = {};
    cfg.fields.forEach((f) => { if (body[f] !== undefined) d[f] = body[f] === '' ? null : body[f]; });
    if (cfg.hash && body.password) d.password_hash = bcrypt.hashSync(body.password, 10);
    if (cfg.hash && isNew && !d.password_hash) throw bad('Vui lòng nhập mật khẩu');
    cfg.before && cfg.before(d);
    if (isNew && cfg.onCreate) cfg.onCreate(d, user);
    return d;
  };
  return {
    list: async (req, res) => {
      let sql = cfg.select; const p = []; const q = req.query.q;
      if (q && cfg.search.length) {
        sql += ' WHERE (' + cfg.search.map((c) => `${c} LIKE ?`).join(' OR ') + ')';
        cfg.search.forEach(() => p.push(`%${q}%`));
      }
      const [rows] = await db.query(`${sql} ORDER BY ${cfg.orderBy}`, p);
      res.json(rows);
    },
    create: async (req, res) => {
      const d = pick(req.body, true, req.user);
      const [r] = await db.query(`INSERT INTO ${cfg.table} SET ?`, [d]);
      res.status(201).json({ id: r.insertId });
    },
    update: async (req, res) => {
      const d = pick(req.body, false, req.user);
      if (!Object.keys(d).length) throw bad('Không có dữ liệu cập nhật');
      await db.query(`UPDATE ${cfg.table} SET ? WHERE id=?`, [d, req.params.id]);
      res.json({ ok: true });
    },
    remove: async (req, res) => {
      if (cfg.table === 'accounts' && +req.params.id === req.user.id) throw bad('Không thể xóa tài khoản đang đăng nhập');
      await db.query(`DELETE FROM ${cfg.table} WHERE id=?`, [req.params.id]);
      res.json({ ok: true });
    },
  };
};
