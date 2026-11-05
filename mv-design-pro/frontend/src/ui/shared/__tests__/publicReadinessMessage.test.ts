// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  publicElementLabelFromRef,
  sanitizePublicReadinessMessage,
} from '../publicReadinessMessage';

describe('publicReadinessMessage', () => {
  // Karta W5-C: dawny przykład (`branch_point.switch_state_missing`, „nie ma stanu łącznika
  // (switch_state)") opisywał kod skasowany razem z kopią stanu łączników portów; intencja
  // testu — surowa referencja ZKSN zastąpiona nazwą publiczną — na realnym komunikacie
  // bramy gotowości (`branch_point.catalog_ref_missing`).
  it('zastępuje surową referencję ZKSN nazwą publiczną w komunikacie gotowości', () => {
    const message = "Obiekt 'bp/bf3889bdd774c8d9641a27a39552deb8/zksn' wymaga wariantu katalogowego.";

    const publicMessage = sanitizePublicReadinessMessage(message);

    expect(publicMessage).toBe('ZKSN wymaga wariantu katalogowego.');
    expect(publicMessage).not.toContain('bp/');
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
