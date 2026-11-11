/**
 * F8c pkt 4 — testy palety DER (PV/BESS/FW) na kanwie v3 (checklista
 * bramkująca §F8c, pozycja 4 „DER-paleta"). Wzorzec fixture/setup identyczny
 * jak `sldCanvasV3Workspace.test.tsx` (F8a) — TA SAMA sieć testowa.
 *
 * Mechanizm REALNY v2 (zweryfikowany w `SldWorkspaceContainer.tsx`, patrz
 * nagłówek `SldCanvasV3Workspace.tsx`): klik przycisku PV/BESS/FW uzbraja
 * (`useDerDragDrop.startDrag`), NASTĘPNY klik w symbol stacji „zrzuca"
 * (`dropOnStation`), zaznacza stację i zapisuje szkic DER — formularz układu
 * PV/BESS/FW otwiera PRAWY INSPEKTOR tej stacji (UI-02b, `FormularzSzkicuDer`);
 * kanwa nie ma własnego panelu. NIE natywne HTML5 `dragover`/`drop` (`hoverStation` w hooku jest DEAD CODE
 * w v2, sprawdzone grepem: zero wywołań w `SldWorkspaceContainer.tsx`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useKontekstElementuKanwy } from '../../../shared/kontekstElementuKanwy';
import { InspektorKanwyTestowy } from '../../../../network-build/inspektor-elementu/__tests__/inspektorKanwyTestowy';
import { odpowiedzKlasyfikacji } from '../../../../../ui2/oze/ncrfg/__tests__/atrapaKlasyfikacji';

const pierwotnyFetch = global.fetch;
afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
  useKontekstElementuKanwy.getState().wyczysc();
  global.fetch = pierwotnyFetch;
});

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

/**
 * KD-8 poz. 2: pas narzędzi kanwy jest JEDNYM rzędem — przy wąskiej kanwie
 * (te testy renderują 800 px) grupy o niższej randze są ZWINIĘTE do menu
 * „Narzędzia", zamiast nachodzić na sąsiadów. Użytkownik sięga po nie jednym
 * klikiem w to menu i test idzie DOKŁADNIE tą samą drogą — nie zakłada, że
 * kontrolka jest zawsze w pasie (założenie, które maskowałoby zwinięcie).
 */
function rozwinZwinieteNarzedzia(): void {
  const menu = screen.queryByTestId('sld-v3-toolbar-menu-toggle');
  if (menu && screen.queryByTestId('sld-v3-toolbar-menu') === null) {
    fireEvent.click(menu);
  }
}

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useSnapshotStore.setState({ snapshot: enm });
  // Formularz szkicu pyta backend o katalog przekształtników i klasyfikację NC RfG —
  // granica `fetch`: klasyfikacja z atrapy wspólnej, katalog pusty (stan zerowy uczciwy).
  global.fetch = vi.fn(async (input: RequestInfo | URL) =>
    odpowiedzKlasyfikacji(String(input)) ?? new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
});

describe('SldCanvasV3Workspace — F8c pkt 4: paleta DER', () => {
  it('(a) startDrag (klik przycisku PV) + drop (klik stacji) zaznacza stację i otwiera w INSPEKTORZE formularz DER z pre-fillem {stationId, kind}', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    const stationOwnerRef = scene.symbols[stationIndex].meta?.ownerRef;
    expect(stationOwnerRef).toBeTruthy();

    const { container } = render(
      <>
        <SldCanvasV3Workspace width={800} height={600} />
        <InspektorKanwyTestowy />
      </>,
    );
    rozwinZwinieteNarzedzia();

    fireEvent.click(screen.getByTestId('der-palette-btn-PV'));
    expect(screen.getByTestId('sld-v3-der-cancel')).toBeTruthy();

    // Karta S9-4: rysunek jest bierny, celem kliku jest UCHWYT obiektu
    // (warstwa `sld-v3-trafienia`) — ten sam węzeł, w który trafia mysz
    // użytkownika. Intencja testu (drop DER na stację) bez zmian.
    const stationTestId = scene.symbols[stationIndex].meta?.testId ?? `sld-v3-symbol-${stationIndex}`;
    const stationHit = container.querySelector(`[data-hit-for="${stationTestId}"][data-hit-role="obrys"]`);
    expect(stationHit, 'stacja ma uchwyt trafienia').toBeTruthy();
    fireEvent.click(stationHit!);

    // Uzbrojenie skonsumowane (drop wykonany) — wskaźnik „▸ Wskaż stację" znika.
    expect(screen.queryByTestId('sld-v3-der-cancel')).toBeNull();
    // Stacja zaznaczona, formularz DER w inspektorze dla WŁAŚNIE zrzuconej stacji.
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual([stationOwnerRef]);
    expect(useKontekstElementuKanwy.getState().szkicDer).toEqual({ stationRef: stationOwnerRef, derKind: 'PV' });
    const formularz = screen.getByTestId('inspektor-der-formularz');
    expect(screen.getByTestId('inspektor-der-typ')).toHaveValue('PV');
    expect(formularz.textContent).toContain('Nowy układ PV/BESS/FW w stacji');
    // Kanwa nie renderuje własnego panelu: formularz leży WYŁĄCZNIE w inspektorze.
    expect(container.querySelector('[data-testid="sld-canvas-v3"]')!.closest('[data-testid="inspektor-testowy"]')).toBeNull();
    expect(screen.getByTestId('inspektor-testowy').contains(formularz)).toBe(true);
  });

  it('(b) drop poza stacją (klik w aparaturę) = anuluj bez akcji — uzbrojenie znika, formularz DER NIE otwiera się', () => {
    const scene = buildSceneV3(enm, 0);
    const apparatusIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'apparatus');
    expect(apparatusIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(
      <>
        <SldCanvasV3Workspace width={800} height={600} />
        <InspektorKanwyTestowy />
      </>,
    );

    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('der-palette-btn-BESS'));
    expect(screen.getByTestId('sld-v3-der-cancel')).toBeTruthy();

    // Karta S9-4: klik w uchwyt aparatu (patrz komentarz w teście (a)).
    const apparatusTestId = scene.symbols[apparatusIndex].meta?.testId ?? `sld-v3-symbol-${apparatusIndex}`;
    const apparatusHit = container.querySelector(`[data-hit-for="${apparatusTestId}"][data-hit-role="obrys"]`);
    expect(apparatusHit, 'aparat ma uchwyt trafienia').toBeTruthy();
    fireEvent.click(apparatusHit!);

    // Anulowane — wskaźnik uzbrojenia znika.
    expect(screen.queryByTestId('sld-v3-der-cancel')).toBeNull();
    // Zero akcji: formularz NIE otwarty, szkic nie zapisany (klik podczas anulowania
    // nie przechodzi też do normalnej selekcji w TYM SAMYM kliku — patrz
    // `handleElementClick` w `SldCanvasV3Workspace.tsx`).
    expect(screen.queryByTestId('inspektor-der-formularz')).toBeNull();
    expect(useKontekstElementuKanwy.getState().szkicDer).toBeNull();
    // Selekcja globalna też nietknięta tym klikiem (anulowanie = zero akcji).
    expect(useSelectionStore.getState().selectedElement).toBeNull();
  });

  it('(c) szkic DER żyje tylko przy swojej stacji: klik innej stacji porzuca szkic, a „Anuluj" w inspektorze go zamyka', () => {
    const scene = buildSceneV3(enm, 0);
    // Dwie RÓŻNE stacje (pierwszy symbol każdej) — testId sceny albo indeks symbolu.
    const stacje = scene.symbols
      .map((symbol, index) => ({ symbol, testId: symbol.meta?.testId ?? `sld-v3-symbol-${index}` }))
      // Zwinięty blok GPZ pominięty: klik w niego rozwija GPZ (KD-5) — to polecenie widoku.
      .filter(({ symbol }) => symbol.meta?.elementKind === 'station' && symbol.meta?.ownerRef && symbol.symbolId !== 'gpzCollapsed')
      .filter((wpis, i, wszystkie) => wszystkie.findIndex((w) => w.symbol.meta!.ownerRef === wpis.symbol.meta!.ownerRef) === i)
      .map(({ symbol, testId }) => ({ meta: { ownerRef: symbol.meta!.ownerRef!, testId } }));
    const { container } = render(
      <>
        <SldCanvasV3Workspace width={800} height={600} />
        <InspektorKanwyTestowy />
      </>,
    );
    // Tylko stacje z uchwytem trafienia w tym kadrze (stacje poza arkuszem go nie mają).
    const zUchwytem = stacje.filter((st) =>
      container.querySelector(`[data-hit-for="${st.meta.testId}"][data-hit-role="obrys"]`) !== null,
    );
    stacje.splice(0, stacje.length, ...zUchwytem);
    expect(stacje.length).toBeGreaterThanOrEqual(2);
    const uchwytStacji = (kontener: HTMLElement, i: number) => {
      const el = kontener.querySelector(`[data-hit-for="${stacje[i].meta.testId}"][data-hit-role="obrys"]`);
      expect(el, `uchwyt stacji ${stacje[i].meta.ownerRef}`).not.toBeNull();
      return el!;
    };
    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('der-palette-btn-FW'));
    fireEvent.click(uchwytStacji(container, 0));
    expect(screen.getByTestId('inspektor-der-typ')).toHaveValue('FW');

    fireEvent.click(uchwytStacji(container, 1));
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual([stacje[1].meta.ownerRef]);
    expect(screen.queryByTestId('inspektor-der-formularz')).toBeNull();
    expect(useKontekstElementuKanwy.getState().szkicDer).toBeNull();

    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('der-palette-btn-PV'));
    fireEvent.click(uchwytStacji(container, 1));
    expect(screen.getByTestId('inspektor-der-formularz')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('inspektor-der-anuluj'));
    expect(screen.queryByTestId('inspektor-der-formularz')).toBeNull();
    // Anulowanie szkicu nie zdejmuje wskazania stacji.
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual([stacje[1].meta.ownerRef]);
  });
  it('(d) wskazanie INNEGO obiektu spoza kanwy (drzewo układu) chowa formularz szkicu — szkic nie wisi przy cudzym obiekcie', () => {
    const scene = buildSceneV3(enm, 0);
    const stacje = scene.symbols
      .map((symbol, index) => ({ symbol, testId: symbol.meta?.testId ?? `sld-v3-symbol-${index}` }))
      .filter(({ symbol }) => symbol.meta?.elementKind === 'station' && symbol.meta?.ownerRef && symbol.symbolId !== 'gpzCollapsed');
    const { container } = render(
      <>
        <SldCanvasV3Workspace width={800} height={600} />
        <InspektorKanwyTestowy />
      </>,
    );
    const zUchwytem = stacje.filter((st) => container.querySelector(`[data-hit-for="${st.testId}"][data-hit-role="obrys"]`) !== null);
    expect(zUchwytem.length).toBeGreaterThanOrEqual(1);
    const stacja = zUchwytem[0];
    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('der-palette-btn-BESS'));
    fireEvent.click(container.querySelector(`[data-hit-for="${stacja.testId}"][data-hit-role="obrys"]`)!);
    expect(screen.getByTestId('inspektor-der-typ')).toHaveValue('BESS');
    // Drzewo układu wskazuje obiekt TYM SAMYM wywołaniem magazynu selekcji, które
    // wykonuje jego wiersz (`selectElement`) — bez kontekstu kliknięcia kanwy.
    const innaStacja = (enm.substations ?? []).find((st) => st.ref_id !== stacja.symbol.meta!.ownerRef)!;
    act(() => useSelectionStore.getState().selectElement({ id: innaStacja.ref_id, type: 'Station', name: innaStacja.name ?? innaStacja.ref_id }));
    expect(screen.queryByTestId('inspektor-der-formularz')).toBeNull();
  });
});
