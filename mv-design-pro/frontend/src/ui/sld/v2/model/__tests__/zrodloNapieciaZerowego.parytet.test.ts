/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC (decyzja właściciela 2026-10-29 pkt 4) — źródło napięcia
 * zerowego 3U₀ funkcji 67N na schemacie (`zrodloU0Pola`, `zrodloU0WidokuPola`,
 * `tekstOdniesieniaZrodlaU0`).
 *
 * PO CO. Reguła warunku 67N jest jedna (`backend/src/enm/zrodlo_napiecia_zerowego.py`), a schemat
 * liczy ją z migawki modelu, żeby narysować odniesienie „3U₀ ← przekładnik pola pomiaru napięcia"
 * przy przekaźniku i ostrzeżenie 67N bez źródła. Fikstura powstaje Z WYNIKU BACKENDU
 * (`backend/tests/ci/test_parytet_zrodla_u0.py`, strażnik równości fikstury z backendem i słownika
 * kodów braków); ten test sprawdza, że lustro daje dla każdego przypadku ten sam wynik.
 *
 * ILOCZYN CECH (z fikstury): wykonanie pola {Z.10, Z.11.1} × pole pomiaru napięcia Z.17 w sekcji
 * {obecne, brak} × powiązanie {potwierdzone, brak} + iniekcje modelu (aparat nieobecny, aparat
 * nie jest przekładnikiem napięciowym, bez otwartego trójkąta, pole nie mierzy napięcia szyn,
 * inna sekcja, bez Ferrantiego, oba braki naraz, własny przekładnik z otwartym trójkątem) ×
 * kolejność pól modelu {jak w modelu, odwrócona}.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, EnergyNetworkModel, ProtectionAssignment } from '../../../../../types/enm';
import { sterownikTestowy } from '../../../../../test/sterownik';
import {
  FUNKCJE_WYMAGAJACE_ZRODLA_U0,
  OZNACZENIE_POLA_BEZ_NUMERU,
  OZNACZENIE_VT_BEZ_OZNACZENIA,
  tekstOdniesieniaZrodlaU0,
  zrodloU0Deskryptora,
  zrodloU0Pola,
  zrodloU0WidokuPola,
  type KodBrakuZrodlaU0,
} from '../zrodloNapieciaZerowego';
import fikstura from './fixtures/parytet_zrodla_u0.json';

interface PrzypadekParytetu {
  readonly nazwa: string;
  readonly pole_ref: string;
  readonly bays: readonly Bay[];
  /** Sterowniki pól — nośnik wejścia 3U₀ (otwarty trójkąt) i funkcji pola. */
  readonly protection_assignments: readonly ProtectionAssignment[];
  readonly oczekiwane: {
    readonly potwierdzone: boolean;
    readonly vt_ref: string | null;
    readonly pole_zrodla_ref: string | null;
    readonly kody_brakow: readonly KodBrakuZrodlaU0[];
  };
}

const przypadki = fikstura.przypadki as unknown as readonly PrzypadekParytetu[];

function migawka(
  bays: readonly Bay[],
  sterowniki: readonly ProtectionAssignment[] = [],
): Pick<EnergyNetworkModel, 'bays' | 'protection_assignments'> {
  return { bays: [...bays], protection_assignments: [...sterowniki] };
}

function migawkaPrzypadku(p: PrzypadekParytetu, bays: readonly Bay[] = p.bays) {
  return migawka(bays, p.protection_assignments);
}

function pole(przypadek: PrzypadekParytetu): Bay {
  const wynik = przypadek.bays.find((b) => b.ref_id === przypadek.pole_ref);
  if (!wynik) throw new Error(`brak pola ${przypadek.pole_ref} w przypadku ${przypadek.nazwa}`);
  return wynik;
}

describe('źródło 3U₀ — parytet z backendem (fikstura z wyniku `zrodlo_u0_pola`)', () => {
  it('fikstura niesie iloczyn cech i każdy kod braku', () => {
    expect(przypadki.length).toBeGreaterThanOrEqual(21);
    const kody = new Set(przypadki.flatMap((p) => p.oczekiwane.kody_brakow));
    expect([...kody].sort()).toEqual([...fikstura.kody_brakow].sort());
    expect(FUNKCJE_WYMAGAJACE_ZRODLA_U0).toEqual(fikstura.funkcje_wymagajace_zrodla_u0);
  });

  it.each(przypadki.map((p) => [p.nazwa, p] as const))('%s — wynik lustra równy backendowi', (_n, przypadek) => {
    const wynik = zrodloU0Pola(migawkaPrzypadku(przypadek), pole(przypadek));
    expect({
      potwierdzone: wynik.potwierdzone,
      vt_ref: wynik.vtRef,
      pole_zrodla_ref: wynik.poleZrodlaRef,
      kody_brakow: wynik.kodyBrakow,
    }).toEqual(przypadek.oczekiwane);
  });

  it.each(przypadki.map((p) => [p.nazwa, p] as const))(
    '%s — kolejność pól modelu nie zmienia wyniku (determinizm)',
    (_n, przypadek) => {
      const wprost = zrodloU0Pola(migawkaPrzypadku(przypadek), pole(przypadek));
      const odwrocone = zrodloU0Pola(
        migawka([...przypadek.bays].reverse(), [...przypadek.protection_assignments].reverse()),
        pole(przypadek),
      );
      expect(odwrocone).toEqual(wprost);
    },
  );
});

describe('źródło 3U₀ — deskryptor schematu i odniesienie przy przekaźniku', () => {
  const potwierdzony = przypadki.find((p) => p.nazwa === 'z10_z17_obecne_potwierdzone');
  const bezPowiazania = przypadki.find((p) => p.nazwa === 'z10_z17_obecne_bez_powiazania');
  if (!potwierdzony || !bezPowiazania) throw new Error('brak przypadków bazowych fikstury');

  it('potwierdzone źródło ⇒ odniesienie z oznaczeniem przekładnika i pola pomiaru napięcia', () => {
    const zrodlo = zrodloU0Pola(migawkaPrzypadku(potwierdzony), pole(potwierdzony));
    const polePomiaru = potwierdzony.bays.find((b) => b.ref_id === zrodlo.poleZrodlaRef);
    expect(polePomiaru?.funkcja_pomiaru).toBe('NAPIECIA_SZYN');
    expect(zrodlo.vtOznaczenie).toBe('T1');
    const tekst = tekstOdniesieniaZrodlaU0(zrodlo);
    expect(tekst).toMatch(/^3U₀ \(Z, Zz\) ← T1, pole /);
    expect(tekst).toContain(zrodlo.poleZrodlaOznaczenie ?? '∅');
  });

  // Pomiar 2026-10-29 (`nazwa_bez_identyfikatora_guard` na backendzie, klasa „identyfikator jako
  // nazwa”): bez oznaczenia przekładnika i pola odniesienie pokazywało `device_ref` i `ref_id`.
  // Iloczyn: oznaczenie przekładnika {jest, brak} × oznaczenie pola {numer, nazwa, brak}.
  for (const vtOznaczony of [true, false]) {
    for (const polePo of ['numer', 'nazwa', 'brak'] as const) {
      it(`odniesienie bez identyfikatorów — przekładnik ${vtOznaczony ? 'z oznaczeniem' : 'bez oznaczenia'} × pole: ${polePo}`, () => {
        const wzorzec = zrodloU0Pola(migawkaPrzypadku(potwierdzony), pole(potwierdzony));
        const bays = potwierdzony.bays.map((b): Bay => {
          if (b.ref_id !== wzorzec.poleZrodlaRef) return b;
          return {
            ...b,
            bay_number: polePo === 'numer' ? '7' : null,
            name: polePo === 'brak' ? '' : 'Pole pomiaru napięcia sekcji 1',
            primary_devices: (b.primary_devices ?? []).map((a) =>
              a.device_ref === wzorzec.vtRef ? { ...a, designation: vtOznaczony ? 'T1' : '' } : a,
            ),
          };
        });
        const zrodlo = zrodloU0Pola(migawkaPrzypadku(potwierdzony, bays), pole(potwierdzony));
        expect(zrodlo.potwierdzone).toBe(true);
        expect(zrodlo.vtOznaczenie).toBe(vtOznaczony ? 'T1' : OZNACZENIE_VT_BEZ_OZNACZENIA);
        expect(zrodlo.poleZrodlaOznaczenie).toBe(
          { numer: '7', nazwa: 'Pole pomiaru napięcia sekcji 1', brak: OZNACZENIE_POLA_BEZ_NUMERU }[polePo],
        );
        const tekst = tekstOdniesieniaZrodlaU0(zrodlo) ?? '';
        expect(tekst.startsWith('3U₀ (Z, Zz) ← ')).toBe(true);
        expect(tekst, 'identyfikator aparatu w tekście').not.toContain(zrodlo.vtRef ?? '∅');
        expect(tekst, 'identyfikator pola w tekście').not.toContain(zrodlo.poleZrodlaRef ?? '∅');
      });
    }
  }

  it('niepotwierdzone źródło ⇒ brak odniesienia (zero fikcji na schemacie)', () => {
    const zrodlo = zrodloU0Pola(migawkaPrzypadku(bezPowiazania), pole(bezPowiazania));
    expect(zrodlo.potwierdzone).toBe(false);
    expect(tekstOdniesieniaZrodlaU0(zrodlo)).toBeNull();
    expect(tekstOdniesieniaZrodlaU0(undefined)).toBeNull();
  });

  it('deskryptor: pole bez powiązania i bez 67N nie niesie źródła; z 67N albo powiązaniem — niesie', () => {
    const baza = pole(bezPowiazania);
    // Sterownik pola bez wejścia 3U₀: funkcje {51, 50} — bez źródła; {51, 67N} — źródło
    // rozstrzygnięte, niepotwierdzone (podstawa ostrzeżenia „!" przy przekaźniku).
    const zSterownikiem = (kody: readonly string[]) =>
      migawka(bezPowiazania.bays, [
        ...bezPowiazania.protection_assignments.filter((s) => s.bay_ref !== baza.ref_id),
        sterownikTestowy({ bayRef: baza.ref_id, kody }),
      ]);
    expect(zrodloU0WidokuPola(zSterownikiem(['51', '50']), baza)).toBeUndefined();
    expect(zrodloU0Deskryptora(zSterownikiem(['51', '50']), baza)).toEqual({});
    expect('zrodloU0' in zrodloU0Deskryptora(zSterownikiem(['51', '50']), baza)).toBe(false);
    expect(zrodloU0WidokuPola(zSterownikiem(['51', '67N']), baza)?.potwierdzone).toBe(false);
    const zPowiazaniem = pole(potwierdzony);
    expect(zrodloU0Deskryptora(migawkaPrzypadku(potwierdzony), zPowiazaniem).zrodloU0?.potwierdzone).toBe(true);
  });
});
