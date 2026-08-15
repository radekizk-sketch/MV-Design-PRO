/**
 * KARTA KLIK-ETYKIETA-KOTWICA — SKUTKI DLA PROJEKTANTA, mierzone NA ŻYWEJ KANWIE.
 *
 * Wyrocznia `kotwicaJednoZrodlo.contract.test.ts` bada rozstrzyganie tematu na
 * scenie. Ten plik sprawdza TRZY ŚCIEŻKI, którymi rozjazd docierał do
 * użytkownika — każdą przez realny uchwyt trafienia w wyrenderowanym drzewie,
 * nie przez wywołanie handlera:
 *
 *  (a) MENU KONTEKSTOWE — prawy klik w napis napięcia szyny otwierał menu STACJI
 *      z pozycją „Usuń stację";
 *  (b) SZUFLADA SZCZEGÓŁÓW — klik w napis „TR1" transformatora otwierał panel
 *      STACJI (albo nie otwierał nic);
 *  (c) SELEKCJA — napis transformatora deklarował `'station'`, więc (c1) NIE
 *      odpalało się rozwiązanie REALNEGO refu transformatora (deklaracja §16-v3
 *      była nieprawdziwa dla uchwytu), a (c2) przy uzbrojonej palecie OZE
 *      odpalał się `derDrag.dropOnStation()` Z REFEM TRANSFORMATORA — hook v2
 *      nie weryfikuje argumentu, więc szuflada OZE powstawała, pokazując jako
 *      nazwę SUFIKS RYSUNKOWY.
 *
 * ŚCIEŻKA NATYWNA (Zero-Debt pkt 5, precedens martwego lewego kliku): kliki idą
 * przez `userEvent` na węzeł warstwy `sld-v3-trafienia` — pełną sekwencję
 * pointerdown → mousedown → mouseup → click, czyli tę, którą wysyła przeglądarka.
 * Żadnego `dispatchEvent` ani wywołania handlera wprost.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
/** Sieć z ROZWINIĘTYM GPZ (110/15 kV + magistrala + 2 stacje SN/nN). Wybrana
 *  POMIAREM, nie z wygody: przy kadrze „Dopasuj widok" na 1600×1000 kanwa rysuje
 *  tu KOMPLET rodzajów napisów potrzebnych tej karcie (zmierzone: 7 wierszy pasma
 *  nazw stacji, 3 wiersze nazwy transformatora, 1 wiersz nazwy źródła, 2 napisy
 *  napięcia szyny + napis szyny WN + napis sekcji GPZ). Sieć referencyjna 52
 *  stacji mieści się w kadrze dopiero na LOD 0, gdzie GPZ jest ZWINIĘTY i żaden
 *  z tych napisów nie powstaje — tam te ścieżki są nieosiągalne dla użytkownika,
 *  więc pokrycie wszystkich trzech LOD-ów niesie wyrocznia sceny
 *  (`kotwicaJednoZrodlo.contract.test.ts`), a ten plik mierzy realny klik. */
const fixturePath = resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'gpzFeeder.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
});

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useSnapshotStore.setState({ snapshot: enm });
});

/** Uchwyt trafienia NAPISU o `ownerRef` pasującym do wzorca — węzeł warstwy
 *  `sld-v3-trafienia`, czyli ten, w który w przeglądarce faktycznie trafia
 *  kursor (rysunek kanwy jest bierny, karta S9-4). */
function uchwytNapisu(container: HTMLElement, fragmentRefu: string): Element | null {
  const wezly = container.querySelectorAll('[data-hit-klasa="etykieta"][data-hit-role="obrys"][data-hit-owner-ref]');
  for (const wezel of Array.from(wezly)) {
    if ((wezel.getAttribute('data-hit-owner-ref') ?? '').includes(fragmentRefu)) return wezel;
  }
  return null;
}

const REF_TRANSFORMATORA_GPZ = (enm.transformers ?? []).find((t) => (t.ref_id ?? '').startsWith('gpz/'))?.ref_id;

describe('(a) menu kontekstowe napisu napięcia szyny', () => {
  it('prawy klik w napis napięcia szyny NIE otwiera menu stacji z „Usuń stację"', async () => {
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} />);
    const napis = uchwytNapisu(container, '#busbar-voltage') ?? uchwytNapisu(container, '#hv-bus-label');
    expect(napis, 'kanwa musi rysować napis napięcia szyny (uchwyt w warstwie trafień)').toBeTruthy();

    await user.pointer({ target: napis!, keys: '[MouseRight]' });

    // Sedno defektu (b) z nagłówka `canvasMenuSubject`, wracające na uchwytach:
    // operacja usunięcia STACJI zaproponowana nad napisem o SZYNIE.
    expect(screen.queryByText('Usuń stację')).toBeNull();
    expect(screen.queryByText('Otwórz konfigurator stacji')).toBeNull();
  });
});

describe('(b)+(c) napis transformatora GPZ', () => {
  it('klik w napis „TR1" selekcjonuje TRANSFORMATOR realnym refem (deklaracja §16-v3)', async () => {
    expect(REF_TRANSFORMATORA_GPZ, 'fixtura niesie transformator GPZ').toBeTruthy();
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} />);
    const napis = uchwytNapisu(container, `${REF_TRANSFORMATORA_GPZ}#label`);
    expect(napis, 'kanwa musi rysować napis pasma nazw transformatora GPZ').toBeTruthy();
    // Ref RYSUNKOWY uchwytu jest kompozytem — to on był dotąd wynoszony do
    // selekcji, bo tabela napisów deklarowała dla niego `'station'`.
    expect(napis!.getAttribute('data-hit-owner-ref')).toContain('#label');

    await user.click(napis!);

    const zaznaczony = useSelectionStore.getState().selectedElements[0];
    expect(zaznaczony, 'klik w napis musi cokolwiek zaznaczyć').toBeTruthy();
    expect(zaznaczony!.type).toBe('TransformerBranch');
    expect(zaznaczony!.id, 'selekcja niesie REALNY ref transformatora, nie kompozyt rysunku').toBe(
      REF_TRANSFORMATORA_GPZ,
    );
    expect(zaznaczony!.id).not.toContain('#');
  });

  it('klik w napis „TR1" otwiera szufladę TRANSFORMATORA, nie stacji', async () => {
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} />);
    const napis = uchwytNapisu(container, `${REF_TRANSFORMATORA_GPZ}#label`);
    expect(napis).toBeTruthy();

    await user.click(napis!);

    const etykieta = screen.queryByTestId('sld-v2-detail-drawer-label');
    expect(etykieta, 'szuflada szczegółów musi się otworzyć').toBeTruthy();
    // Nazwa panelu nie może być SUFIKSEM RYSUNKOWYM ani kodem stacji — panel ma
    // dotyczyć transformatora, którego napis kliknięto.
    expect(etykieta!.textContent ?? '').not.toContain('name-row');
    expect(etykieta!.textContent ?? '').not.toContain('#');
  });

  it('uzbrojona paleta OZE: klik w napis transformatora NIE zrzuca układu (uczciwa odmowa)', async () => {
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} />);

    // Uzbrojenie przez REALNY przycisk palety — nie przez wymuszony stan hooka.
    const przycisk = screen.queryByTestId('der-palette-btn-PV');
    expect(przycisk, 'paleta OZE musi być dostępna na kanwie').toBeTruthy();
    await user.click(przycisk!);
    expect(przycisk!.getAttribute('data-der-active')).toBe('true');

    const napis = uchwytNapisu(container, `${REF_TRANSFORMATORA_GPZ}#label`);
    expect(napis).toBeTruthy();
    await user.click(napis!);

    // `useDerDragDrop.dropOnStation` NIE weryfikuje swojego argumentu (przyjmuje
    // dowolny łańcuch), a `buildDerDropDetailDrawerData` nie znajdując stacji
    // pokazuje jako nazwę ostatni człon refu — czyli sufiks rysunkowy.
    // Odmowa musi paść po stronie kanwy, w jedynym miejscu, które zna model.
    const etykieta = screen.queryByTestId('sld-v2-detail-drawer-label');
    expect(etykieta?.textContent ?? '').not.toContain('name-row');
    // Uzbrojenie zostaje ANULOWANE (reguła v3 „klik gdzie indziej = anuluj"),
    // więc projektant nie utknie w stanie uzbrojonym.
    expect(przycisk!.getAttribute('data-der-active')).toBe('false');
  });
});

describe('napis nazwy STACJI — ścieżka, która ma DZIAŁAĆ (kontrola, że naprawa nie odcięła nadmiaru)', () => {
  it('klik w napis nazwy stacji nadal selekcjonuje STACJĘ realnym refem', async () => {
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} />);
    const refStacji = (enm.substations ?? []).find((s) => (s.ref_id ?? '').startsWith('stn/'))?.ref_id;
    expect(refStacji).toBeTruthy();
    const napis = uchwytNapisu(container, `${refStacji}#name-row`);
    expect(napis, 'kanwa rysuje pasmo nazw stacji').toBeTruthy();

    await user.click(napis!);

    const zaznaczony = useSelectionStore.getState().selectedElements[0];
    expect(zaznaczony!.type).toBe('Station');
    expect(zaznaczony!.id).toBe(refStacji);
  });

  it('uzbrojona paleta OZE: klik w napis nazwy stacji ZRZUCA układ z refem STACJI (nie kompozytem)', async () => {
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} />);
    const refStacji = (enm.substations ?? []).find((s) => (s.ref_id ?? '').startsWith('stn/'))?.ref_id;
    const przycisk = screen.queryByTestId('der-palette-btn-PV');
    expect(przycisk).toBeTruthy();
    await user.click(przycisk!);

    const napis = uchwytNapisu(container, `${refStacji}#name-row`);
    expect(napis).toBeTruthy();
    await user.click(napis!);

    const etykieta = screen.queryByTestId('sld-v2-detail-drawer-label');
    expect(etykieta, 'zrzut na stację otwiera szufladę OZE').toBeTruthy();
    // Do tej karty `dropOnStation` dostawał kompozyt `…/station#name-row-0`,
    // więc `sldData.stations.find` chybiał i nazwą panelu stawał się sufiks
    // rysunkowy „station#name-row-0". Teraz ref jest refem STACJI.
    expect(etykieta!.textContent ?? '').not.toContain('name-row');
  });
});
