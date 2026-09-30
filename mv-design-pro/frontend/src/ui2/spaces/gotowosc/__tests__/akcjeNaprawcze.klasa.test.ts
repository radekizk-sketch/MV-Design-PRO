/**
 * Test KLASY akcji naprawczych gotowości (karta C-12, decyzja K-12 opcja A).
 *
 * Klasa, nie instancja: akcja naprawcza jest wykonawcą dla KAŻDEGO kodu
 * kanonicznego rejestru gotowości (snapshot `fixtures/readiness_registry_snapshot.json`,
 * pilnowany testem dryfu po stronie backendu:
 * `backend/tests/domain/test_fikstura_rejestru_gotowosci_frontu.py`) i dla KAŻDEGO
 * emitera akcji naprawczej odpowiedzi operacji domenowej (walidator ENM + bloki
 * domenowe `_build_readiness`). Kod bez dostawcy formularza i bez nazwanej odmowy
 * zapala ten test na czerwono.
 *
 * Iloczyn cech, w którym defekt mógłby się schować:
 *   kod rejestru (145) × rodzaj odpowiedzi (formularz / przestrzeń / odmowa)
 *   × element wskazany albo nie × akcja emitera dołączona albo nie;
 *   emiter (typ akcji × typ okna × panel) × kod spoza kanonu;
 *   pole fokusu × element z tą własnością albo bez niej.
 * Wykonanie sprawdzane przez `wykonajAkcjeNaprawcza` na realnych store'ach
 * (przestrzeń powłoki, trasa hash, selekcja, aktywny formularz) — bez mocków.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { CanonicalOpName } from '../../../../types/domainOps';
import type { FixAction, FixActionType } from '../../../../ui/types';
import { ROUTES } from '../../../../ui/navigation/routes';
import {
  selectActiveOperationForm,
  useNetworkBuildStore,
} from '../../../../ui/network-build/networkBuildStore';
import { useNotificationStore } from '../../../../ui/notifications/store';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { SPACES } from '../../../shell/spaces';
import { useShellStore } from '../../../shell/useShellStore';
import { ZAKLADKI } from '../../wyniki/obszary';
import {
  AKCJE_KODOW_KANONU,
  operacjaMaFormularz,
  poleFokusu,
  rozwiazAkcjeNaprawcza,
  wykonajAkcjeNaprawcza,
} from '../akcjeNaprawcze';
import type { ProblemGotowosci } from '../grupowanieCelow';
import rejestr from './fixtures/readiness_registry_snapshot.json';

interface WpisRejestru {
  code: string;
  area: string;
  fix_navigation: Record<string, string> | null;
}
interface Emiter {
  action_type: FixActionType;
  modal_type: string | null;
  panel: string | null;
}

const KODY = (rejestr as unknown as { codes: WpisRejestru[] }).codes;
const EMITERY = (rejestr as unknown as { emitery_akcji: Emiter[] }).emitery_akcji;
const ODWZOROWANIE = (rejestr as unknown as { validator_mapping: Record<string, string> })
  .validator_mapping;

const ELEMENT = 'el-1';
const SNAPSHOT = {
  sources: [{ ref_id: ELEMENT, name: 'Źródło GPZ', sk3_mva: 250, sk3_min_mva: null }],
  buses: [],
  branches: [],
  transformers: [],
  loads: [],
  generators: [],
  substations: [],
};

function problem(
  code: string,
  opcje: { element?: boolean; fixAction?: FixAction | null; kanon?: WpisRejestru | null } = {},
): ProblemGotowosci {
  const kanon = opcje.kanon === undefined ? KODY.find((k) => k.code === code) ?? null : opcje.kanon;
  return {
    code,
    waga: 'BLOKADA',
    elementRef: opcje.element === false ? null : ELEMENT,
    opisPl: 'Opis problemu.',
    cel: 'wspolne',
    fixAction: opcje.fixAction ?? null,
    priorytetKanoniczny: 1,
    kodKanoniczny: kanon?.code ?? null,
    nawigacjaKanoniczna: kanon?.fix_navigation ?? null,
  };
}

function akcjaEmitera(emiter: Emiter): FixAction {
  return {
    action_type: emiter.action_type,
    element_ref: ELEMENT,
    modal_type: emiter.modal_type,
    panel: emiter.panel,
    step: null,
    focus: ELEMENT,
    payload_hint: null,
  };
}

/** Identyfikator maszynowy w tekście dla projektanta (kod kropkowy albo snake_case). */
const IDENTYFIKATOR_MASZYNOWY = /\b[a-z0-9]+(?:[._][a-z0-9]+)+\b/;

beforeEach(() => {
  useNetworkBuildStore.getState().reset();
  useNotificationStore.getState().clearAll();
  useSelectionStore.getState().clearSelection();
  useSnapshotStore.setState({ snapshot: SNAPSHOT } as never);
  useShellStore.setState({ activeSpace: 'gotowosc', wynikiTab: null, wynikiTabElement: null });
  window.location.hash = '';
});

describe('tabela akcji kodów kanonu — kompletna względem rejestru', () => {
  it('fikstura niepusta (snapshot nie zdegenerował się do [])', () => {
    expect(KODY.length).toBeGreaterThan(100);
    expect(EMITERY.length).toBeGreaterThan(20);
  });

  it('tabela nie ma kodów spoza rejestru (martwe wpisy)', () => {
    const rejestrowe = new Set(KODY.map((k) => k.code));
    expect(Object.keys(AKCJE_KODOW_KANONU).filter((k) => !rejestrowe.has(k))).toEqual([]);
  });

  it.each(KODY.map((k): [string] => [k.code]))('kod „%s" ma dostawcę formularza albo nazwaną odmowę', (code) => {
    const wpis = AKCJE_KODOW_KANONU[code];
    expect(wpis, `brak wpisu w AKCJE_KODOW_KANONU dla ${code}`).toBeDefined();
    if (wpis.rodzaj === 'formularz') {
      expect(operacjaMaFormularz(wpis.operacja), `${wpis.operacja} bez formularza`).toBe(true);
    } else {
      expect(wpis.powodPl.length).toBeGreaterThan(20);
      expect(wpis.powodPl).not.toMatch(IDENTYFIKATOR_MASZYNOWY);
      if (wpis.rodzaj === 'przestrzen') {
        expect(SPACES.map((s) => s.id)).toContain(wpis.przestrzen);
        if (wpis.zakladkaWynikow) {
          expect(wpis.przestrzen).toBe('wyniki');
          expect(ZAKLADKI.map((z) => z.id)).toContain(wpis.zakladkaWynikow);
        }
      }
    }
  });

  it('operacja bez formularza NIE jest dostawcą (predykat zapala się na czerwono)', () => {
    expect(operacjaMaFormularz('delete_element')).toBe(false);
    expect(operacjaMaFormularz('set_connection_conditions')).toBe(false);
  });
});

describe('wykonanie — iloczyn: kod × element × akcja emitera', () => {
  const przypadki: Array<[string, boolean, boolean]> = [];
  for (const { code } of KODY) {
    for (const element of [true, false]) {
      for (const zAkcjaEmitera of [true, false]) przypadki.push([code, element, zAkcjaEmitera]);
    }
  }

  it.each(przypadki)('kod „%s", element=%s, akcja emitera=%s', (code, element, zAkcjaEmitera) => {
    const p = problem(code, {
      element,
      fixAction: zAkcjaEmitera ? akcjaEmitera(EMITERY[0]) : null,
    });
    const wpis = AKCJE_KODOW_KANONU[code];
    const akcja = rozwiazAkcjeNaprawcza(p, SNAPSHOT as never);
    expect(akcja?.rodzaj).toBe(wpis.rodzaj);

    wykonajAkcjeNaprawcza(p);
    const stanPowloki = useShellStore.getState();
    if (wpis.rodzaj === 'formularz') {
      // Jedna nawigacja (D1): przestrzeń + trasa schematu, potem formularz operacji z tabeli.
      expect(stanPowloki.activeSpace).toBe('schemat');
      expect(window.location.hash.startsWith(ROUTES.SLD.hash)).toBe(true);
      expect(selectActiveOperationForm(useNetworkBuildStore.getState())?.op).toBe(wpis.operacja);
      if (element) {
        expect(useSelectionStore.getState().selectedElement?.id).toBe(ELEMENT);
      }
    } else if (wpis.rodzaj === 'przestrzen') {
      expect(stanPowloki.activeSpace).toBe(wpis.przestrzen);
      expect(selectActiveOperationForm(useNetworkBuildStore.getState())).toBeNull();
      expect(stanPowloki.wynikiTab).toBe(wpis.zakladkaWynikow ?? null);
      expect(useNotificationStore.getState().notifications.slice(-1)[0]?.message).toBe(wpis.powodPl);
    } else {
      expect(stanPowloki.activeSpace).toBe('gotowosc');
      expect(selectActiveOperationForm(useNetworkBuildStore.getState())).toBeNull();
    }
  });
});

describe('emitery akcji spoza kanonu — każdy prowadzi do formularza albo elementu', () => {
  const przypadki = EMITERY.map((e): [string, string, string, Emiter] => [
    e.action_type,
    String(e.modal_type),
    String(e.panel),
    e,
  ]);

  it.each(przypadki)('akcja %s, okno %s, panel %s', (_a, _m, _p, emiter) => {
    const p = problem('KOD-SPOZA-KANONU', { fixAction: akcjaEmitera(emiter), kanon: null });
    const akcja = rozwiazAkcjeNaprawcza(p, SNAPSHOT as never);
    expect(akcja).not.toBeNull();
    expect(akcja?.rodzaj).not.toBe('odmowa');
    if (akcja?.rodzaj === 'formularz') {
      expect(operacjaMaFormularz(akcja.operacja)).toBe(true);
    }

    wykonajAkcjeNaprawcza(p);
    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(useSelectionStore.getState().selectedElement?.id).toBe(ELEMENT);
    const formularz = selectActiveOperationForm(useNetworkBuildStore.getState());
    if (akcja?.rodzaj === 'formularz') expect(formularz?.op).toBe(akcja.operacja);
    else expect(formularz).toBeNull();
    // Żaden emiter nie kończy się komunikatem „nie przypisano formularza".
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('kod walidatora z odwzorowaniem na kanon idzie tabelą kanonu (jedno źródło)', () => {
    for (const [kodWalidatora, kodKanonu] of Object.entries(ODWZOROWANIE)) {
      const kanon = KODY.find((k) => k.code === kodKanonu) ?? null;
      const p = problem(kodWalidatora, { kanon, fixAction: akcjaEmitera(EMITERY[0]) });
      expect(rozwiazAkcjeNaprawcza(p)?.rodzaj).toBe(AKCJE_KODOW_KANONU[kodKanonu].rodzaj);
    }
  });

  it('problem bez kanonu i bez akcji emitera nie ma akcji (wiersz: „Wymaga interwencji")', () => {
    expect(rozwiazAkcjeNaprawcza(problem('KOD-BEZ-DROGI', { kanon: null }))).toBeNull();
  });
});

describe('pole fokusu — własność elementu migawki', () => {
  const zPolem = KODY.filter(
    (k) => AKCJE_KODOW_KANONU[k.code]?.rodzaj === 'formularz'
      && (AKCJE_KODOW_KANONU[k.code] as { operacja: CanonicalOpName }).operacja === 'update_element_parameters'
      && k.fix_navigation?.focus,
  );

  it('rejestr ma kody edycji parametrów z polem fokusu', () => {
    expect(zPolem.length).toBeGreaterThan(20);
  });

  it.each(zPolem.map((k): [string, string] => [k.code, k.fix_navigation!.focus]))(
    'kod „%s": pole „%s" trafia do formularza TYLKO, gdy element je ma',
    (code, pole) => {
      const zWlasnoscia = { ...SNAPSHOT, sources: [{ ref_id: ELEMENT, [pole]: null }] };
      const bezWlasnosci = { ...SNAPSHOT, sources: [{ ref_id: ELEMENT }] };
      expect(poleFokusu(zWlasnoscia as never, ELEMENT, pole)).toBe(pole);
      expect(poleFokusu(bezWlasnosci as never, ELEMENT, pole)).toBeNull();

      useSnapshotStore.setState({ snapshot: zWlasnoscia } as never);
      wykonajAkcjeNaprawcza(problem(code));
      expect(selectActiveOperationForm(useNetworkBuildStore.getState())?.context).toMatchObject({
        element_ref: ELEMENT,
        field: pole,
      });

      useNetworkBuildStore.getState().reset();
      useSnapshotStore.setState({ snapshot: bezWlasnosci } as never);
      wykonajAkcjeNaprawcza(problem(code));
      const kontekst = selectActiveOperationForm(useNetworkBuildStore.getState())?.context ?? {};
      expect(kontekst).toMatchObject({ element_ref: ELEMENT });
      expect(kontekst).not.toHaveProperty('field');
    },
  );
});
