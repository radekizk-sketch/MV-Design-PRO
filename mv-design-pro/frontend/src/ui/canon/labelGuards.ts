export const FORBIDDEN_USER_LABELS = [
  'MO',
  'AN',
  'ZA',
  'OZ',
  'RA',
  'AD',
  'HI',
  'Feeder',
  'Branch',
  'Case',
  'Snapshot',
  'Run',
  'Proof',
  'Grid Code',
  'Bay',
  'Busbar',
  'Overlay',
  'Workspace',
  'Modal',
  'Dialog',
  'Wizard',
  'Ready',
  'Stale',
  'Locked',
  'Disabled',
  'Input',
  'Output',
  'Default',
  'Error',
  'Warning',
  'Success',
  'Fallback',
  'Legacy',
  'Debug',
  'Mock',
  'TODO',
  'Placeholder',
  'Not implemented',
  'Coming soon',
  'Przypadek',
  'Etap 2',
  'wdrażane później',
  'panel w przygotowaniu',
] as const;

const TOKEN_FORBIDDEN_LABELS = new Set(['MO', 'AN', 'ZA', 'OZ', 'RA', 'AD', 'HI']);

export function findForbiddenUserLabels(text: string): string[] {
  const findings = new Set<string>();
  for (const label of FORBIDDEN_USER_LABELS) {
    if (TOKEN_FORBIDDEN_LABELS.has(label)) {
      const token = new RegExp(`(^|[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż])${label}($|[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż])`);
      if (token.test(text)) findings.add(label);
      continue;
    }
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelPattern = new RegExp(`\\b${escapedLabel}\\b`, 'i');
    if (labelPattern.test(text)) findings.add(label);
  }
  return [...findings].sort();
}
