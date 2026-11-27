const r = require('express').Router();
const { auth, role, aiKey } = require('../middlewares/auth');
const { wrap } = require('../middlewares/error');
const crud = require('../controllers/crudController');
const R = require('../models/resources');
const P = require('../middlewares/accountProtection');
const A = require('../controllers/authController');
const G = require('../controllers/gateController');

r.post('/auth/login', wrap(A.login));
r.post('/ai/detect', aiKey, wrap(G.detect)); // Python AI gọi vào đây

const E = require('../controllers/evidenceController');
const Camera = require('../controllers/cameraController');

r.get('/camera/stream', wrap(Camera.stream));

r.use(auth);

r.post('/camera/ticket', Camera.ticket);
r.get('/auth/me', (req, res) => res.json(req.user));

const mount = (path, cfg, writeRoles) => {
  const c = crud(cfg), w = role(...writeRoles);
  r.get(path, wrap(c.list)); r.post(path, w, wrap(c.create));
  r.put(`${path}/:id`, w, wrap(c.update)); r.delete(`${path}/:id`, w, wrap(c.remove));
};
mount('/vehicles', R.vehicles, ['admin', 'manager']);
mount('/employees', R.employees, ['admin', 'manager']);
r.use('/visitors', P.protectVisitor);
mount('/visitors', R.visitors, ['admin', 'manager', 'guard']);
mount('/departments', R.departments, ['admin']);
r.use('/accounts', role('admin'));
const accounts = crud(R.accounts);
r.get('/accounts', wrap(accounts.list));
r.post('/accounts', P.protectAccount, wrap(accounts.create));
r.put('/accounts/:id', P.protectAccount, wrap(accounts.update));
r.delete('/accounts/:id', P.protectAccount, wrap(accounts.remove));

r.get('/dashboard', wrap(G.dashboard));
r.get('/history', wrap(G.history));
r.get('/history/:id/evidence/:type', wrap(E.getImage));
r.put('/history/:id/resolve', wrap(G.resolve));
r.get('/gates', wrap(G.list));
r.post('/gates/:id/barrier', wrap(G.barrier));
r.post('/gates/:id/simulate', wrap(G.simulate));
module.exports = r;
