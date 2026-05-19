import { describe, expect, it } from 'vitest';

import {
  publicElementLabelFromRef,
  sanitizePublicReadinessMessage,
} from '../publicReadinessMessage';

describe('publicReadinessMessage', () => {
  it('zastępuje surową referencję ZKSN i nazwę pola technicznego komunikatem projektowym', () => {
    const message = "ZKSN 'bp/bf3889bdd774c8d9641a27a39552deb8/zksn' nie ma stanu łącznika (switch_state).";

    const publicMessage = sanitizePublicReadinessMessage(message);

    expect(publicMessage).toBe('ZKSN wymaga wskazania stanu normalnego łącznika.');
    expect(publicMessage).not.toContain('bp/');
    expect(publicMessage).not.toContain('switch_state');
  });

  it('używa nazwy publicznej elementu, a dla surowego identyfikatora daje typ techniczny', () => {
    const snapshot = {
      branches: [
        {
          ref_id: 'seg/main-a',
          name: 'Kabel YAKXS 3x120 do S01',
        },
      ],
    };

    expect(publicElementLabelFromRef(snapshot, 'seg/main-a')).toBe('Kabel YAKXS 3x120 do S01');
    expect(publicElementLabelFromRef(snapshot, 'bp/abc/zksn')).toBe('ZKSN');
  });
});
