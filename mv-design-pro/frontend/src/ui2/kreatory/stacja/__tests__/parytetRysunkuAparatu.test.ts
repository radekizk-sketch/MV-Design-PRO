/**
 * Parytet rysunku aparatu: podgląd rozdzielnicy kreatora stacji × kanwa SLD (karta
 * UX-04/ROZDZIELNICA-SN-KOREKTA, D4 — testy parytetu GPZ / stacje A–D / podgląd kreatora /
 * eksport). Kreator rysuje pole z BOM szablonu (`SYMBOL_RODZAJU_BOM`), kanwa — z rekordów aparatów
 * pola modelu (`symbolIdForPrimaryDeviceKind`). Szablony dostępne w kreatorze stacji SN/nN mają
 * wariant rysunku kanoniczny (`render_variant = 'kanoniczny'`, szablony GPZ są `tylko_gpz`), więc
 * dla każdego rodzaju aparatu szablonu oba miejsca MUSZĄ dać ten sam glif — dwa różne rysunki tego
 * samego aparatu to druga prawda (eksport SVG/PDF rysuje scenę kanwy tymi samymi glifami
 * `SYMBOL_GLYPHS`, więc parytet kanwa ↔ eksport wynika z jednej listy `daneGlifuSymbolu`).
 *
 * Iloczyn: każdy rodzaj aparatu szablonu (`RODZAJ_Z_KIND_SZABLONU`, tablica zamknięta względem
 * kontraktu backendu) × wariant {kanoniczny}. Wyjątki są jawne i nazwane: aparat główny pola —
 * kreator rysuje aparat WSKAZANY z katalogu (`symbolAparatuGlownego`), nie rodzaj szablonu; jego
 * parytet przypina drugi blok: klasa wyrobu katalogu APARAT_SN (`RODZAJE_APARATU_SN`) → glif
 * kreatora (`SYMBOL_RODZAJU_APARATU`) × glif kanwy rodzaju aparatu pola, na który adapter mapuje
 * tę klasę (`RODZAJ_APARATU_Z_KLASY_WYROBU`).
 *
 * Decyzja architekta FUSE (karta UX-04/ROZDZIELNICA-SN-KOREKTA): wkładka bezpiecznikowa (`FUSE`,
 * glif `fuse`) i rozłącznik bezpiecznikowy jako aparat główny (`FUSE_SWITCH`, glif `fuseSwitch`)
 * to dwa urządzenia i dwa rodzaje — dawna „rozbieżność zgłoszona” (rekord `FUSE` w dwóch
 * znaczeniach) zniknęła, FUSE jest w parytecie.
 */
import { describe, expect, it } from 'vitest';

import { RODZAJE_APARATU_SN } from '../../../../ui/catalog/wartosciKodoweKarty';
import { RODZAJ_APARATU_Z_KLASY_WYROBU } from '../../../../ui/sld/v2/canvas/enmToSldAdapter';
import { symbolIdForPrimaryDeviceKind } from '../../../../ui/sld/v3/compose/apparatusSequence';
import type { BayPrimaryDeviceKind } from '../../../../types/enm';
import { RODZAJ_Z_KIND_SZABLONU, SYMBOL_RODZAJU_APARATU, SYMBOL_RODZAJU_BOM } from '../generatorSldPola';

/** Rodzaj szablonu → rodzaj rekordu aparatu modelu (materializacja szablonu w pole). */
const RODZAJ_MODELU: Readonly<Record<keyof typeof RODZAJ_Z_KIND_SZABLONU, BayPrimaryDeviceKind>> = {
  CB: 'CB',
  LOAD_SWITCH: 'LOAD_SWITCH',
  DS_BUS: 'DS',
  DS_LINE: 'DS',
  DS_BRANCH: 'DS',
  ES: 'ES',
  CT: 'CT',
  VT: 'VT',
  FUSE: 'FUSE',
  SURGE_ARRESTER: 'SURGE_ARRESTER',
  CABLE_HEAD: 'CABLE_HEAD',
  TRANSFORMER_DEVICE: 'TRANSFORMER_DEVICE',
  THREE_POSITION_SWITCH: 'THREE_POSITION_SWITCH',
  VOLTAGE_INDICATOR: 'VOLTAGE_INDICATOR',
  CORE_BALANCE_CT: 'CORE_BALANCE_CT',
  UNBALANCE_CT: 'UNBALANCE_CT',
  PHASE_TO_PHASE_VT: 'PHASE_TO_PHASE_VT',
};

/**
 * Rodzaje spoza parytetu — lista ZAMKNIĘTA, każdy wpis z przyczyną merytoryczną:
 *  · CB, LOAD_SWITCH — aparat główny pola: kreator rysuje aparat WSKAZANY z katalogu
 *    (`symbolAparatuGlownego`), rodzaj szablonu jest tylko domyślny;
 *  · UNBALANCE_CT, PHASE_TO_PHASE_VT — występują wyłącznie w szablonie pola baterii GPZ (Z.16,
 *    `tylko_gpz`, odmowa W051 poza sekcją GPZ — pin backendu
 *    `tests/network_model/catalog/test_rodzaje_aparatu_tylko_gpz.py`), więc kreator stacji
 *    SN/nN nigdy ich nie rysuje; na kanwie rysuje je glif baterii (`capacitorBank`), nie tor pola.
 */
const POZA_PARYTETEM: ReadonlySet<string> = new Set(['CB', 'LOAD_SWITCH', 'UNBALANCE_CT', 'PHASE_TO_PHASE_VT']);

describe('parytet glifu aparatu: podgląd kreatora × kanwa SLD (wariant kanoniczny)', () => {
  it('tablica rodzajów modelu pokrywa wszystkie rodzaje szablonu', () => {
    expect(Object.keys(RODZAJ_MODELU).sort()).toEqual(Object.keys(RODZAJ_Z_KIND_SZABLONU).sort());
  });

  for (const kind of Object.keys(RODZAJ_Z_KIND_SZABLONU) as (keyof typeof RODZAJ_Z_KIND_SZABLONU)[]) {
    if (POZA_PARYTETEM.has(kind)) continue;
    const kreator = (): string => SYMBOL_RODZAJU_BOM[RODZAJ_Z_KIND_SZABLONU[kind]];
    const kanwa = (): string | null => symbolIdForPrimaryDeviceKind(RODZAJ_MODELU[kind], 'kanoniczny');
    it(`${kind}: ten sam glif w kreatorze i na kanwie`, () => {
      expect(kreator(), kind).toBe(kanwa());
    });
  }
});

/**
 * Rozbieżność ZGŁOSZONA architektowi (wykryta tym testem, meldunek karty
 * UX-04/ROZDZIELNICA-SN-KOREKTA): reklozer jest w modelu wyłącznikiem (`CB`, backend
 * `wyposazenie_pola.RODZAJE_KATALOGOWE_APARATU["CB"]` = WYLACZNIK | REKLOZER), więc kanwa rysuje go
 * glifem `breaker`; kreator rysuje wybraną pozycję katalogu glifem `recloser` (test kreatora „inny
 * aparat główny = inny rysunek” przypina to rozróżnienie). Rekord aparatu pola nie niesie klasy
 * wyrobu (tylko `catalog_ref`), więc kanwa nie odróżni reklozera bez decyzji o kontrakcie
 * (osobny rodzaj aparatu albo cecha rysunku z pozycji katalogu). Test przypina STAN: gdy
 * rozbieżność zniknie, zaczerwieni się i wymusi przeniesienie REKLOZER do parytetu.
 */
const ROZBIEZNOSC_ZGLOSZONA_APARATU_GLOWNEGO: ReadonlySet<string> = new Set(['REKLOZER']);

describe('parytet glifu aparatu głównego: klasa wyrobu katalogu → kreator × kanwa', () => {
  for (const klasa of RODZAJE_APARATU_SN) {
    if (ROZBIEZNOSC_ZGLOSZONA_APARATU_GLOWNEGO.has(klasa)) {
      it(`${klasa}: rozbieżność zgłoszona (reklozer w kreatorze, wyłącznik na kanwie)`, () => {
        const rodzaj = RODZAJ_APARATU_Z_KLASY_WYROBU[klasa];
        expect([SYMBOL_RODZAJU_APARATU[klasa], symbolIdForPrimaryDeviceKind(rodzaj, 'kanoniczny')]).toEqual([
          'recloser',
          'breaker',
        ]);
      });
      continue;
    }
    it(`${klasa}: ten sam glif w kreatorze i na kanwie`, () => {
      const rodzaj = RODZAJ_APARATU_Z_KLASY_WYROBU[klasa];
      expect(rodzaj, `${klasa}: klasa wyrobu bez rodzaju aparatu pola`).toBeDefined();
      expect(SYMBOL_RODZAJU_APARATU[klasa], klasa).toBe(symbolIdForPrimaryDeviceKind(rodzaj, 'kanoniczny'));
    });
  }
});
