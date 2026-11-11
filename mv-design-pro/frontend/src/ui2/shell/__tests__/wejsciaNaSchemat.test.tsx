/*
 * Test produktowy jednej drogi „Pokaż na schemacie" (karta SLD-SKALA-I-NAWIGACJA, część W).
 *
 * ILOCZYN CECH (CLAUDE.md, reguła KLASA NIE INSTANCJA, pkt 2):
 *   wejście (rejestr ekranów niżej) × rodzaj elementu (7 rodzajów z karty:
 *   szyna, linia/kabel, transformator, łącznik, pole, stacja, źródło)
 *   × kanwa schematu na ekranie (nie / tak).
 *
 * Każda kombinacja ćwiczy REALNĄ ścieżkę: realny komponent, realne sklepy (selekcja,
 * migawka, powłoka, powrót), natywny klik przez `userEvent` — bez mocków sklepów i bez
 * syntetycznych zdarzeń. Oczekiwanie jest JEDNO dla całego rejestru, bo droga jest
 * jedna (`pokazElementNaSchemacie`):
 *   - poza kanwą: zaznaczenie z typem z migawki, wskazanie kamery „kadruj", przejście
 *     do przestrzeni „Schemat", wpis „Wróć do", a „Wróć do" przywraca ekran źródłowy;
 *   - nad kanwą: zaznaczenie + „kadruj", przestrzeń bez zmian, bez wpisu powrotu
 *     (wyjątek: nakładka — okno przeglądu zbiorczego — zapisuje powrót do siebie);
 *   - element nieobecny w modelu: brak przycisku (nie ma czego pokazać).
 *
 * Wejście, które „tylko zaznacza" (dawne zdarzenie DOM bez odbiorcy, samo zdarzenie
 * `selekcja`, `selectElement` bez kamery) albo zgaduje typ elementu, czerwieni tu
 * siedem przypadków naraz.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ELEMENTY_SIEDMIU_RODZAJOW, ustawMigawkeZElementami, zamontujKanweSchematu } from '../../../test/schematTestowy';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useSelectionStore } from '../../../ui/selection/store';
import { useShellStore } from '../useShellStore';
import { usePowrotZeSchematu, wrocDoEkranu } from '../powrotZeSchematu';
import { PrzyciskPokazNaSchemacie } from '../../shared/PrzyciskPokazNaSchemacie';
import { KrokDowodu } from '../../wyniki/dowod/KrokDowodu';
import { mapujKroki } from '../../wyniki/dowod/dowodModel';
import { traceStepsFixture } from '../../wyniki/dowod/__tests__/fixtures';
import { SemanticIssuesBanner } from '../../../ui/tech-card/SemanticIssuesBanner';
import { AuditTrailPanel } from '../../../ui/audit/AuditTrailPanel';
import { DiagnosticsPanel } from '../../../ui/enm-inspector/DiagnosticsPanel';
import { useEnmInspectorStore } from '../../../ui/enm-inspector/store';
import { KontekstPrzegladuZbiorczego, PokazZPrzegladu } from '../../../ui/network-build/mass-review/wejscieZPrzegladu';

interface Wejscie {
  readonly nazwa: string;
  /** Renderuje ekran wejścia dla refu elementu. */
  readonly renderuj: (ref: string) => void;
  /** Identyfikator testowy przycisku wejścia dla refu. */
  readonly testId: (ref: string) => string;
  /** Nakładka nad kanwą zapisuje powrót do siebie także wtedy, gdy przestrzeń się nie zmienia. */
  readonly nakladka?: { readonly etykieta: string; readonly zamknij: ReturnType<typeof vi.fn> };
}

const zamknijPrzeglad = vi.fn();

/** Rejestr ekranów wejścia — wszystkie warstwy, w których „Pokaż na schemacie" było zepsute albo pozorne. */
const REJESTR_WEJSC: readonly Wejscie[] = [
  {
    nazwa: 'przycisk wspólny ekranów wyników (zwarcia, dynamika, aparatura, zbieżność, gdzie użyty)',
    renderuj: (ref) => render(<PrzyciskPokazNaSchemacie elementRef={ref} zrodlo="test-produktowy" />),
    testId: () => 'mvd-pokaz-na-schemacie',
  },
  {
    nazwa: 'krok dowodu obliczeń',
    renderuj: (ref) =>
      render(<KrokDowodu krok={{ ...mapujKroki(traceStepsFixture())[0], elementId: ref }} szczegolyAudytowe={false} />),
    testId: () => 'mvd-dowod-pokaz-na-schemacie',
  },
  {
    nazwa: 'baner problemów semantycznych karty technicznej',
    renderuj: (ref) =>
      render(
        <SemanticIssuesBanner
          issues={[{ code: 'semantic.test', message: 'Naruszenie', severity: 'ERROR', element_id: ref, field: null, suggested_fix: null }]}
        />,
      ),
    testId: () => 'semantic-issue-action-semantic.test',
  },
  {
    nazwa: 'dziennik operacji',
    renderuj: (ref) => {
      useSnapshotStore.setState({
        operationHistory: [
          { id: 'op-1', timestamp: '2026-11-11T10:00:00Z', operation: 'update_element', elementRef: ref, elementName: ref, status: 'success' },
        ],
      } as never);
      render(<AuditTrailPanel />);
    },
    testId: () => 'audit-trail-show-element-op-1',
  },
  {
    nazwa: 'diagnostyka inspektora modelu',
    renderuj: (ref) =>
      render(
        <DiagnosticsPanel
          report={{
            status: 'FAIL',
            issues: [{ code: 'E-D01', severity: 'BLOCKER', message_pl: 'Brak danych.', affected_refs: [ref], hints: [] }],
            analysis_matrix: { entries: [] },
            blocker_count: 1,
            warning_count: 0,
            info_count: 0,
          } as never}
        />,
      ),
    testId: () => 'diagnostic-issue-pokaz-E-D01',
  },
  {
    nazwa: 'kontrola techniczna układu (okno przeglądu zbiorczego)',
    renderuj: (ref) =>
      render(
        <KontekstPrzegladuZbiorczego.Provider
          value={{ zamknij: zamknijPrzeglad, powrot: { etykieta: 'Kontrola techniczna układu — Łączniki' } }}
        >
          <PokazZPrzegladu elementRef={ref} />
        </KontekstPrzegladuZbiorczego.Provider>,
      ),
    testId: (ref) => `mass-review-pokaz-${ref}`,
    nakladka: { etykieta: 'Kontrola techniczna układu — Łączniki', zamknij: zamknijPrzeglad },
  },
];

const ILOCZYN = REJESTR_WEJSC.flatMap((wejscie) =>
  ELEMENTY_SIEDMIU_RODZAJOW.flatMap((r) =>
    [false, true].map((kanwa) => ({ wejscie, rodzaj: r.rodzaj, typ: r.typ, element: r.element, kanwa })),
  ),
);

const stanSelekcji = useSelectionStore.getState();
const stanMigawki = useSnapshotStore.getState();
let odmontujKanwe: (() => void) | null = null;

beforeEach(() => {
  window.location.hash = '#wyniki-test';
  useShellStore.setState({ activeSpace: 'wyniki' });
  usePowrotZeSchematu.setState({ wpis: null, doOdebrania: null });
  useEnmInspectorStore.setState({ severityFilter: null });
  zamknijPrzeglad.mockClear();
});

afterEach(() => {
  cleanup();
  odmontujKanwe?.();
  odmontujKanwe = null;
  useSelectionStore.setState(stanSelekcji, true);
  useSnapshotStore.setState(stanMigawki, true);
  usePowrotZeSchematu.setState({ wpis: null, doOdebrania: null });
  window.location.hash = '';
});

describe('Jedna droga „Pokaż na schemacie": wejście × rodzaj elementu × kanwa na ekranie', () => {
  it('iloczyn pokrywa cały rejestr wejść i wszystkie siedem rodzajów', () => {
    expect(new Set(ELEMENTY_SIEDMIU_RODZAJOW.map((r) => r.rodzaj)).size).toBe(7);
    expect(ILOCZYN).toHaveLength(REJESTR_WEJSC.length * 7 * 2);
  });

  it.each(ILOCZYN.map((p) => [`${p.wejscie.nazwa} × ${p.rodzaj} × ${p.kanwa ? 'nad kanwą' : 'poza kanwą'}`, p] as const))(
    '%s',
    async (_opis, { wejscie, typ, element, kanwa }) => {
      ustawMigawkeZElementami([element]);
      if (kanwa) {
        useShellStore.setState({ activeSpace: 'schemat' });
        odmontujKanwe = zamontujKanweSchematu();
      }
      const przestrzenPrzed = useShellStore.getState().activeSpace;
      wejscie.renderuj(element.id);

      const przycisk = screen.getByTestId(wejscie.testId(element.id));
      // Jedna etykieta w całej aplikacji; cel wskaźnika i klawiatura — natywny <button>.
      expect(przycisk).toHaveTextContent('Pokaż na schemacie');
      expect(przycisk.tagName).toBe('BUTTON');
      await userEvent.click(przycisk);

      const selekcja = useSelectionStore.getState();
      expect(selekcja.selectedElement).toMatchObject({ id: element.id, type: typ });
      expect(selekcja.sldWskazanie).toMatchObject({ ref: element.id, tryb: 'kadruj' });
      if (wejscie.nakladka) expect(wejscie.nakladka.zamknij).toHaveBeenCalledTimes(1);

      const wpis = usePowrotZeSchematu.getState().wpis;
      if (!kanwa) {
        expect(useShellStore.getState().activeSpace).toBe('schemat');
        expect(wpis).toMatchObject({ przestrzen: przestrzenPrzed, hash: '#wyniki-test' });
        // „Wróć do" przywraca ekran źródłowy; zaznaczenie zostaje (ten sam wiersz).
        wrocDoEkranu();
        expect(useShellStore.getState().activeSpace).toBe(przestrzenPrzed);
        expect(window.location.hash).toBe('#wyniki-test');
        expect(useSelectionStore.getState().selectedElement?.id).toBe(element.id);
        expect(usePowrotZeSchematu.getState().wpis).toBeNull();
      } else {
        expect(useShellStore.getState().activeSpace).toBe('schemat');
        if (wejscie.nakladka) expect(wpis?.etykieta).toBe(wejscie.nakladka.etykieta);
        else expect(wpis).toBeNull();
      }
    },
  );

  it.each(REJESTR_WEJSC.map((w) => [w.nazwa, w] as const))(
    '%s: element nieobecny w modelu nie ma przycisku',
    (_nazwa, wejscie) => {
      ustawMigawkeZElementami([ELEMENTY_SIEDMIU_RODZAJOW[0].element]);
      wejscie.renderuj('usuniety-z-modelu');
      expect(screen.queryByTestId(wejscie.testId('usuniety-z-modelu'))).toBeNull();
      expect(useSelectionStore.getState().sldWskazanie).toBeNull();
      expect(useShellStore.getState().activeSpace).toBe('wyniki');
    },
  );
});
