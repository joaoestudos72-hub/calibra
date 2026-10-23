// Ícone, tom visual e destino de cada tipo de aviso.
export const KIND = {
  maintenance: { icon: 'wrench', tone: '', href: '#/maintenance' },
  maintenance_km: { icon: 'gauge', tone: '', href: '#/maintenance' },
  wash: { icon: 'drop', tone: 'info', href: '#/washes/reminders' },
  routine: { icon: 'calendar', tone: '', href: '#/routine' },
  fine_due: { icon: 'alert', tone: 'danger', href: '#/fines' },
  fine_appeal: { icon: 'shield', tone: 'warn', href: '#/fines' },
};
export const kindOf = (k) => KIND[k] || KIND.routine;
