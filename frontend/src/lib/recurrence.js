export const RECURRENCE_LABELS = {
  once: 'Engangs',
  daily: 'Hver dag',
  'weekly:mon': 'Hver mandag',
  'weekly:tue': 'Hver tirsdag',
  'weekly:wed': 'Hver onsdag',
  'weekly:thu': 'Hver torsdag',
  'weekly:fri': 'Hver fredag',
  'weekly:sat': 'Hver lørdag',
  'weekly:sun': 'Hver søndag',
};

export const RECURRENCE_OPTIONS = Object.entries(RECURRENCE_LABELS).map(([value, label]) => ({
  value,
  label,
}));
