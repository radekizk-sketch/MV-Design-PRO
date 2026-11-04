/**
 * Karta 3 — Rozdzielnia SN (PR-8a, brief 2 §8 karta 3).
 *
 * Karta JEDNA-SCIEZKA-EDYCJI: dawniej typ układu, prąd znamionowy i prąd zwarciowy znamionowy
 * były kontrolkami bez zapisu (`onChange` nikt nie obsługiwał), a wartości 630 A / 16 kA były
 * wpisane w kod konfiguratora i udawały daną rozdzielnicy. Teraz:
 * - typ układu wynika z modelu (pole o roli sprzęgła ⇒ sekcjonowany) — odczyt;
 * - znamiona rozdzielnicy to znamiona APARATURY pól stacji z katalogu (`apparatus_catalog_ref`
 *   pola → `GET /api/catalog/mv-apparatus-types`); wartością stacji jest najsłabszy aparat
 *   (ogranicza całą rozdzielnicę). Gdy karta aparatu nie podaje znamienia, pokazana jest
 *   wartość robocza z rejestru backendu (`wartosci_robocze`, zasada nr 4) z jakością
 *   „szacowana" i źródłem. Zmiana znamion = zmiana aparatu pola (karta „Aparatura").
 * - pole bez aparatu w modelu to brak MODELU (nie brak katalogu) — pokazany jawnie.
 */

export type BusbarLayout = 'single_busbar' | 'sectioned_busbar' | 'simplified' | 'busbarless';

/** Znamię rozdzielnicy z aparatury pól — wartość, źródło i jakość danej. */
export interface ZnamieRozdzielnicy {
  readonly wartosc: number;
  readonly jednostka: string;
  /** Aparat ograniczający (nazwa pozycji katalogu) i pole, w którym stoi. */
  readonly zrodloPl: string;
  /** `DATASHEET` — dana karty producenta; `ESTIMATED` — wartość robocza rejestru backendu. */
  readonly jakosc: 'DATASHEET' | 'ESTIMATED';
  /** Podstawa wartości roboczej (norma / założenie) — tylko dla `ESTIMATED`. */
  readonly podstawaPl?: string | null;
}

export interface StationConfigSnSwitchgearCardProps {
  readonly layout: BusbarLayout;
  /** Napięcie szyny SN stacji z modelu; `null` — model go nie podaje (bez domysłu). */
  readonly nominalVoltageKv: number | null;
  /** Prąd znamionowy rozdzielnicy (najsłabszy aparat pól) albo `null` — brak aparatu w polach. */
  readonly ratedCurrent?: ZnamieRozdzielnicy | null;
  /** Prąd zwarciowy znamionowy (cieplny 1 s) rozdzielnicy albo `null`. */
  readonly ratedShortCircuit?: ZnamieRozdzielnicy | null;
  /** Pola SN stacji bez aparatu w modelu (brak modelu, nie katalogu). */
  readonly baysWithoutApparatus?: number;
  readonly sectionsCount: number;
  readonly hasCoupler: boolean;
  readonly baysCount: number;
  readonly reservesCount: number;
  readonly readinessLabelPl: string;
  /** Przejście do karty aparatury pól (jedyna droga zmiany znamion). */
  readonly onOpenApparatus?: () => void;
}

const LAYOUT_LABEL_PL: Record<BusbarLayout, string> = {
  single_busbar: 'Pojedynczy system szyn',
  sectioned_busbar: 'Sekcjonowany system szyn',
  simplified: 'Układ uproszczony',
  busbarless: 'Układ bezszynowy',
};

const LICZBA_PL = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });

function Znamie({ label, znamie, testId }: { label: string; znamie: ZnamieRozdzielnicy | null | undefined; testId: string }) {
  return (
    <div data-testid={testId} data-jakosc={znamie?.jakosc ?? 'BRAK'}>
      <div className="text-scada-muted">{label}</div>
      {znamie ? (
        <>
          <div className="font-mono text-scada-text">
            {LICZBA_PL.format(znamie.wartosc)} {znamie.jednostka}
            {znamie.jakosc === 'ESTIMATED' && <span className="ml-1 text-[10px] text-scada-muted">(wartość robocza)</span>}
          </div>
          <div className="text-[10px] text-scada-muted">
            {znamie.zrodloPl}
            {znamie.jakosc === 'ESTIMATED' && znamie.podstawaPl ? ` · ${znamie.podstawaPl}` : ''}
          </div>
        </>
      ) : (
        <div className="text-scada-muted italic">brak aparatu w polach</div>
      )}
    </div>
  );
}

export function StationConfigSnSwitchgearCard(
  props: StationConfigSnSwitchgearCardProps,
): JSX.Element {
  const {
    layout, nominalVoltageKv, ratedCurrent = null, ratedShortCircuit = null, baysWithoutApparatus = 0,
    sectionsCount, hasCoupler, baysCount, reservesCount, readinessLabelPl, onOpenApparatus,
  } = props;

  return (
    <div data-testid="station-config-sn-switchgear" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Rozdzielnia SN
      </div>

      <div>
        <div className="text-scada-muted">Typ układu (z modelu pól)</div>
        <div data-testid="sn-switchgear-layout" data-layout={layout} className="text-scada-text">
          {LAYOUT_LABEL_PL[layout]}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-scada-muted">Napięcie znamionowe</div>
          <div className="font-mono text-scada-text">{nominalVoltageKv !== null ? `${nominalVoltageKv} kV` : 'brak danych'}</div>
        </div>
        <Znamie label="Prąd znamionowy" znamie={ratedCurrent} testId="sn-switchgear-in-a" />
        <Znamie label="Prąd zwarciowy znamionowy (1 s)" znamie={ratedShortCircuit} testId="sn-switchgear-isc-ka" />
        <div>
          <div className="text-scada-muted">Sekcje</div>
          <div className="font-mono text-scada-text">{sectionsCount}</div>
        </div>
        <div>
          <div className="text-scada-muted">Sprzęgło sekcyjne</div>
          <div className={hasCoupler ? 'text-status-ok' : 'text-scada-muted italic'}>
            {hasCoupler ? '✓ obecne' : 'brak'}
          </div>
        </div>
        <div>
          <div className="text-scada-muted">Pola</div>
          <div className="font-mono text-scada-text">{baysCount}</div>
        </div>
        <div>
          <div className="text-scada-muted">Rezerwy</div>
          <div className="font-mono text-scada-text">{reservesCount}</div>
        </div>
        <div>
          <div className="text-scada-muted">Zakres konfiguracji</div>
          <div className="text-scada-text">{readinessLabelPl}</div>
        </div>
      </div>

      {baysWithoutApparatus > 0 && (
        <div data-testid="sn-switchgear-bays-without-apparatus" className="text-[10px] text-scada-muted">
          Pola bez aparatu w modelu: {baysWithoutApparatus} — znamiona rozdzielnicy liczone z pól z aparatem.
        </div>
      )}
      {onOpenApparatus && (
        <button
          type="button"
          data-testid="sn-switchgear-open-apparatus"
          onClick={onOpenApparatus}
          className="self-start rounded border border-scada-border px-2 py-1 text-scada-text hover:border-scada-sn"
        >
          Zmień aparaturę pól
        </button>
      )}
    </div>
  );
}
