const TECHNICAL_SUFFIX_RE = /\s+(?:(?=[a-z0-9]{7,10}$)(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{7,10}|[0-9a-f]{12,})$/i;

export function looksLikeTechnicalId(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(trimmed)
    || /^E2E[_-]/i.test(trimmed)
    || (/^[A-Z0-9_:-]{16,}$/.test(trimmed) && /[_:-]/.test(trimmed))
    || /^[a-z]+[:/_-][a-z0-9/_-]{8,}$/i.test(trimmed)
    || /^[0-9a-f]{16,}$/i.test(trimmed);
}

export function stripTechnicalSuffix(value: string): string {
  return value.trim().replace(TECHNICAL_SUFFIX_RE, '').trim();
}

export function projectDisplayName(
  name: string | null | undefined,
  id: string | null | undefined,
): string {
  if (name && !looksLikeTechnicalId(name)) return stripTechnicalSuffix(name);
  if (id) return 'Projekt bez nazwy';
  return 'Nie otwarto projektu';
}

export function calculationScopeDisplayName(
  name: string | null | undefined,
  id: string | null | undefined,
): string {
  if (name && !looksLikeTechnicalId(name)) {
    const cleaned = stripTechnicalSuffix(name).replace(/^Przypadek\b/i, 'Zakres');
    return cleaned || 'Zakres bez nazwy';
  }
  return id ? 'Zakres bez nazwy' : 'Skonfiguruj zakres';
}
