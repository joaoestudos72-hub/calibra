import { idParam } from '../lib/http.js';
import * as R from './resources.js';
import { register as registerAuth } from './auth.js';
import { register as registerAttachments } from './attachments.js';
import { dashboard, spending, vehicleHistory } from '../services/dashboard.js';
import { listNotifications, snooze, wake, complete, syncUser } from '../services/notifications.js';
import { completeReminder } from '../services/reminders.js';

export function buildRouter(router) {
  registerAuth(router);
  registerAttachments(router);

  router.get('/api/health', () => ({ ok: true }), { public: true });
  router.get('/api/meta', () => ({ vehicle_types: R.VEHICLE_TYPES }));
  router.get('/api/dashboard', ({ user }) => dashboard(user.id));

  R.vehicles.register(router, '/api/vehicles');
  router.get('/api/vehicles/:id/summary', ({ user, params }) => {
    const id = idParam(params.id);
    const vehicle = R.vehicles.get(user.id, id);
    return { vehicle, spending: spending(user.id, id), history: vehicleHistory(user.id, id) };
  });
  R.maintenances.register(router, '/api/maintenances');
  R.expenses.register(router, '/api/expenses');
  R.washes.register(router, '/api/washes');
  R.fines.register(router, '/api/fines');
  R.reminders.register(router, '/api/reminders');
  router.post('/api/reminders/:id/complete', ({ user, params }) => {
    completeReminder(user.id, idParam(params.id));
    syncUser(user.id);
    return R.reminders.get(user.id, idParam(params.id));
  });

  router.get('/api/notifications', ({ user, query }) =>
    listNotifications(user.id, ['active', 'snoozed', 'done', 'all'].includes(query.state) ? query.state : 'active'));
  router.get('/api/notifications/count', ({ user }) => listNotifications(user.id, 'active').counts);
  router.post('/api/notifications/:id/snooze', async ({ user, params, body }) => snooze(user.id, idParam(params.id), await body()));
  router.post('/api/notifications/:id/wake', ({ user, params }) => wake(user.id, idParam(params.id)));
  router.post('/api/notifications/:id/complete', ({ user, params }) => complete(user.id, idParam(params.id)));
}
