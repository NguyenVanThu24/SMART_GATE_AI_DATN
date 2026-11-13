const r = require('express').Router();
const { auth, role, aiKey } = require('../middlewares/auth');
const { wrap } = require('../middlewares/error');
const crud = require('../controllers/crudController');
const R = require('../models/resources');
const A = require('../controllers/authController');
const G = require('../controllers/gateController');

r.post('/auth/login', wrap(A.login));
r.post('/ai/detect', aiKey, wrap(G.detect)); // Python AI gọi vào đây

r.use(auth);
r.get('/auth/me', (req, res) => res.json(req.user));

const mount = (path, cfg, writeRoles) => {
  const c = crud(cfg), w = role(...writeRoles);
  r.get(path, wrap(c.list)); r.post(path, w, wrap(c.create));
  r.put(`${path}/:id`, w, wrap(c.update)); r.delete(`${path}/:id`, w, wrap(c.remove));
};
mount('/vehicles', R.vehicles, ['admin', 'manager']);
mount('/employees', R.employees, ['admin', 'manager']);
mount('/visitors', R.visitors, ['admin', 'manager', 'guard']);
mount('/departments', R.departments, ['admin']);
r.use('/accounts', role('admin'));
mount('/accounts', R.accounts, ['admin']);

r.get('/dashboard', wrap(G.dashboard));
r.get('/history', wrap(G.history));
r.put('/history/:id/resolve', wrap(G.resolve));
r.get('/gates', wrap(G.list));
r.post('/gates/:id/barrier', wrap(G.barrier));
r.post('/gates/:id/simulate', wrap(G.simulate));
module.exports = r;
