/**
 * UI-02b JEDEN-INSPEKTOR — sekcje prawego inspektora przejęte z dawnej szuflady
 * szczegółów kanwy. Kanwa nie ma już własnego panelu: klik elementu zaznacza go, a te
 * sekcje (w `InspectorEngineeringView`) pokazują dla tej samej selekcji:
 *  - kontekst obiektu na schemacie (rodzaj, stacja › pole, identyfikator globalny aparatu);
 *  - formularz nowego układu PV/BESS/FW po upuszczeniu z palety (`FormularzSzkicuDer`);
 *  - pasek działań z TEGO SAMEGO rejestru i kontekstu dostępności co menu kontekstowe kanwy
 *    (`akcjeElementu`), wykonywanych tym samym wykonawcą; pozycja niedostępna jest
 *    nieaktywna (`aria-disabled`) z przyczyną w opisie przycisku;
 *  - „Wyniki" — wielkości elementu z nakładki wyników: brak / nieaktualne / wartość;
 *  - węzeł SN (ZK SN, słup rozgałęźny) i stan aparatu z rekordu źródła runtime modelu;
 *  - wejście do pełnej konfiguracji odcinka (E-12) i karty węzła (E-14 / E-15).
 * Zero fizyki: każda liczba pochodzi z modelu albo z wyniku backendu.
 */
import type { JSX } from 'react';

import {
  BRAK_TELEMETRII,
  communicationOkLabel,
  controlModeLabel,
  interlockBlockedLabel,
} from '../../field/fieldLabels';
import { SEKCJE_MENU_SLD, type SldMenuAction } from '../../sld/v2/command/SldCommandService';
import type { DaneElementuKanwy, RodzajElementuKanwy } from '../../sld/shared/daneElementuKanwy';
import { FormularzSzkicuDer } from './FormularzSzkicuDer';
import type { StanPaneluElementu, StanWynikowElementu } from './stanPaneluElementu';

const STYL_SEKCJI = {
  borderColor: 'var(--mvd-line)',
  fontSize: 'var(--mvd-font-size-data)',
  color: 'var(--mvd-ink)',
} as const;

const NAZWA_RODZAJU: Readonly<Record<NonNullable<RodzajElementuKanwy>, string>> = {
  station: 'Stacja SN/nN',
  bay: 'Pole',
  apparatus: 'Aparat',
  transformer: 'Transformator',
  der: 'Źródło rozproszone',
  cable_run: 'Ciąg SN',
  node: 'Węzeł sieci SN',
};

const REF_WEWNETRZNY = /\b(?:stn|seg|gpz|bus|bay|pv|bess|fw|source)\/[^\s]+/i;

function etykietaPubliczna(wartosc: string | null | undefined): wartosc is string {
  return Boolean(wartosc && !REF_WEWNETRZNY.test(wartosc));
}

/** Nazwa obiektu na schemacie — publiczna etykieta, kod stacji albo nazwa rodzaju. */
export function etykietaElementuKanwy(dane: DaneElementuKanwy): string {
  if (etykietaPubliczna(dane.label)) return dane.label;
  if (dane.kind === 'station' && dane.stationCode) return dane.stationCode;
  return dane.kind ? NAZWA_RODZAJU[dane.kind] : 'Element schematu';
}

export function PasekDzialanElementu({
  akcje,
  onAkcja,
}: {
  readonly akcje: readonly SldMenuAction[];
  readonly onAkcja: (actionId: string) => void;
}): JSX.Element | null {
  if (akcje.length === 0) return null;
  // V12K-351: ten sam kanon sekcji co menu kontekstowe kanwy (`SEKCJE_MENU_SLD`) —
  // pasek działań i menu pokazują te same pozycje w tych samych sekcjach i kolejności.
  const grupy = SEKCJE_MENU_SLD
    .map((grupa) => ({ grupa, pozycje: akcje.filter((akcja) => akcja.section === grupa) }))
    .filter((wpis) => wpis.pozycje.length > 0);
  return (
    <section data-testid="inspektor-dzialania" aria-label="Działania elementu" className="flex flex-col gap-2 border-b px-4 py-3" style={STYL_SEKCJI}>
      <h4 className="font-semibold" style={{ fontSize: 'var(--mvd-font-size-data)' }}>Działania</h4>
      {grupy.map(({ grupa, pozycje }) => (
        <div key={grupa} role="group" aria-label={grupa} data-testid={`inspektor-dzialania-${grupa}`} className="flex flex-col gap-1">
          <span style={{ color: 'var(--mvd-muted)' }}>{grupa}</span>
          <div className="flex flex-wrap gap-1.5">
            {pozycje.map((akcja) => {
              const niedostepna = Boolean(akcja.disabled);
              const przyczyna = niedostepna
                ? akcja.disabledReasonPl ?? 'Działanie niedostępne dla tego obiektu.'
                : undefined;
              // `aria-disabled`, nie `disabled`: przycisk zostaje osiągalny klawiaturą i czytnikiem,
              // a przyczyna niedostępności jest jego opisem (nie znika jak `title` na dotyku).
              return (
                <button
                  type="button"
                  key={akcja.id}
                  className="mvd-btn"
                  data-testid={`inspektor-akcja-${akcja.id}`}
                  data-disabled={niedostepna ? 'true' : 'false'}
                  aria-disabled={niedostepna || undefined}
                  aria-describedby={niedostepna ? `inspektor-akcja-${akcja.id}-przyczyna` : undefined}
                  title={przyczyna ?? akcja.labelPl}
                  onClick={niedostepna ? undefined : () => onAkcja(akcja.id)}
                  style={grupa === 'Usuń' && !niedostepna ? { color: 'var(--mvd-err)' } : undefined}
                >
                  {akcja.labelPl}
                  {przyczyna && (
                    <span id={`inspektor-akcja-${akcja.id}-przyczyna`} className="mvd-sr-only">{przyczyna}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export function SekcjaWynikowElementu({ wyniki }: { readonly wyniki: StanWynikowElementu }): JSX.Element {
  return (
    <section data-testid="inspektor-wyniki" data-stan={wyniki.stan} aria-label="Wyniki elementu" className="flex flex-col gap-2 border-b px-4 py-3" style={STYL_SEKCJI}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold" style={{ fontSize: 'var(--mvd-font-size-data)' }}>Wyniki</h4>
        {wyniki.stan === 'nieaktualne' && (
          <span className="mvd-tag mvd-tag-warn" data-testid="inspektor-wyniki-nieaktualne">Nieaktualne</span>
        )}
      </div>
      {wyniki.stan === 'brak' ? (
        <p data-testid="inspektor-wyniki-brak" style={{ color: 'var(--mvd-muted)' }}>{wyniki.powodPl}</p>
      ) : (
        <>
          {wyniki.stan === 'nieaktualne' && (
            <p style={{ color: 'var(--mvd-warn)' }}>
              Model zmieniono po obliczeniach — wartości dotyczą poprzedniego stanu sieci. Uruchom obliczenia ponownie.
            </p>
          )}
          <dl className="flex flex-col gap-1">
            {wyniki.metryki.map((metryka) => (
              <div key={metryka.code} className="mvd-kafel-kv-row" data-testid={`inspektor-wynik-${metryka.code}`}>
                <dt className="mvd-kafel-kv-label">{metryka.label}</dt>
                <dd className="mvd-kafel-kv-value mvd-num">{metryka.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function Wiersz({ etykieta, wartosc, testId }: { readonly etykieta: string; readonly wartosc: string | null; readonly testId: string }): JSX.Element {
  return (
    <div className="mvd-kafel-kv-row">
      <dt className="mvd-kafel-kv-label">{etykieta}</dt>
      <dd data-testid={testId} className="mvd-kafel-kv-value" style={wartosc === null ? { color: 'var(--mvd-muted)' } : undefined}>
        {wartosc ?? 'brak danych w modelu'}
      </dd>
    </div>
  );
}

export function SekcjaWezlaSn({ wezel }: { readonly wezel: NonNullable<DaneElementuKanwy['nodeSpec']> }): JSX.Element {
  const nazwaTypu = wezel.nodeKind === 'zksn'
    ? 'Złącze kablowe SN'
    : wezel.nodeKind === 'branch_pole'
      ? 'Słup rozgałęźny SN'
      : wezel.nodeKind === 'nmo'
        ? 'Punkt normalnie otwarty'
        : 'Węzeł SN';
  return (
    <section data-testid="inspektor-wezel" aria-label="Węzeł magistrali SN" className="flex flex-col gap-2 border-b px-4 py-3" style={STYL_SEKCJI}>
      <h4 className="font-semibold" style={{ fontSize: 'var(--mvd-font-size-data)' }}>Węzeł magistrali SN</h4>
      <dl className="flex flex-col gap-1">
        <Wiersz etykieta="Rodzaj węzła" wartosc={nazwaTypu} testId="inspektor-wezel-rodzaj" />
        <Wiersz
          etykieta="Napięcie znamionowe"
          wartosc={wezel.voltageKv != null ? `${wezel.voltageKv.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kV` : null}
          testId="inspektor-wezel-napiecie"
        />
        <Wiersz
          etykieta="Połączone odcinki"
          wartosc={wezel.connectedSegmentsCount != null ? String(wezel.connectedSegmentsCount) : null}
          testId="inspektor-wezel-odcinki"
        />
        <Wiersz etykieta="Pozycja katalogowa" wartosc={wezel.catalogRef} testId="inspektor-wezel-katalog" />
      </dl>
      {wezel.blockers.length > 0 ? (
        <div data-testid="inspektor-wezel-braki">
          <span className="mvd-tag mvd-tag-warn">Do uzupełnienia ({wezel.blockers.length})</span>
          <ul className="mt-1 list-disc pl-5" style={{ color: 'var(--mvd-warn)' }}>
            {wezel.blockers.map((bloker) => <li key={bloker}>{bloker}</li>)}
          </ul>
        </div>
      ) : (
        <span className="mvd-tag mvd-tag-ok" data-testid="inspektor-wezel-kompletny">Dane węzła kompletne</span>
      )}
    </section>
  );
}

/** Położenie łącznika w modelu — ten sam stan, który rysuje glif kanwy. */
export const POLOZENIE_LACZNIKA_PL: Readonly<Record<'closed' | 'open' | 'unknown', string>> = {
  closed: 'zamknięty',
  open: 'otwarty',
  unknown: 'nieustalony (model niejednoznaczny)',
};
export const BRAK_POLOZENIA_W_MODELU = 'brak stanu w modelu';

/**
 * Karta #135 × GPZ-PARYTET cz. 2: położenie łącznika z MODELU (ten sam rachunek co glif
 * kanwy), telemetria (tryb, komunikacja, uzależnienie, chwila zmiany) WYŁĄCZNIE z rekordu
 * źródła runtime; brak rekordu = „brak telemetrii", nigdy wartość domyślna.
 */
export function SekcjaStanuAparatu({ stan }: { readonly stan: DaneElementuKanwy['apparatusState'] }): JSX.Element {
  const polozenie = stan?.actualState ? POLOZENIE_LACZNIKA_PL[stan.actualState] : BRAK_POLOZENIA_W_MODELU;
  return (
    <section data-testid="inspektor-stan-aparatu" aria-label="Stan i telemetria aparatu" className="flex flex-col gap-2 border-b px-4 py-3" style={STYL_SEKCJI}>
      <h4 className="font-semibold" style={{ fontSize: 'var(--mvd-font-size-data)' }}>Stan i telemetria aparatu</h4>
      <dl className="flex flex-col gap-1">
        <div className="mvd-kafel-kv-row">
          <dt className="mvd-kafel-kv-label">Położenie łącznika (model)</dt>
          <dd data-testid="inspektor-aparat-stan" className="mvd-kafel-kv-value">{polozenie}</dd>
        </div>
        <div className="mvd-kafel-kv-row">
          <dt className="mvd-kafel-kv-label">Tryb sterowania</dt>
          <dd data-testid="inspektor-aparat-tryb" className="mvd-kafel-kv-value">{controlModeLabel(stan?.controlMode ?? null)}</dd>
        </div>
        <div className="mvd-kafel-kv-row">
          <dt className="mvd-kafel-kv-label">Komunikacja</dt>
          <dd data-testid="inspektor-aparat-komunikacja" className="mvd-kafel-kv-value">{communicationOkLabel(stan?.communicationOk ?? null)}</dd>
        </div>
        <div className="mvd-kafel-kv-row">
          <dt className="mvd-kafel-kv-label">Uzależnienie operacyjne</dt>
          <dd data-testid="inspektor-aparat-uzaleznienie" className="mvd-kafel-kv-value">{interlockBlockedLabel(stan?.interlockBlocked ?? null)}</dd>
        </div>
        <div className="mvd-kafel-kv-row">
          <dt className="mvd-kafel-kv-label">Ostatnia zmiana</dt>
          <dd data-testid="inspektor-aparat-zmiana" className="mvd-kafel-kv-value mvd-num">{stan?.lastChangeAt ?? BRAK_TELEMETRII}</dd>
        </div>
      </dl>
    </section>
  );
}

export function PanelElementuKanwy({ stan }: { readonly stan: StanPaneluElementu }): JSX.Element {
  const { dane, akcje, wykonajAkcje, wyniki, szkicDer, daneSzkicuDer, konfiguracja } = stan;
  const kontekstStacji = dane
    ? [dane.parentStationLabel ?? (dane.kind !== 'station' && dane.stationCode ? `Stacja ${dane.stationCode}` : null), dane.parentBayLabel]
        .filter((czesc): czesc is string => Boolean(czesc))
        .join(' › ')
    : '';
  return (
    <div data-testid="inspektor-element-kanwy" data-rodzaj={dane?.kind ?? ''} data-element-id={dane?.elementId ?? ''}>
      {dane && (
        <div className="flex flex-col gap-0.5 border-b px-4 py-2" style={STYL_SEKCJI} data-testid="inspektor-element-kontekst">
          <span>
            <span style={{ color: 'var(--mvd-muted)' }}>{dane.kind ? NAZWA_RODZAJU[dane.kind] : 'Element'}: </span>
            <span data-testid="inspektor-element-etykieta" className="font-semibold">{etykietaElementuKanwy(dane)}</span>
          </span>
          {kontekstStacji && <span data-testid="inspektor-element-sciezka" style={{ color: 'var(--mvd-muted)' }}>{kontekstStacji}</span>}
          {dane.globalId && (
            <span data-testid="inspektor-element-identyfikator" className="mvd-num">Identyfikator: {dane.globalId}</span>
          )}
        </div>
      )}
      {szkicDer && daneSzkicuDer && <FormularzSzkicuDer dane={daneSzkicuDer} derKind={szkicDer.derKind} />}
      <PasekDzialanElementu akcje={akcje} onAkcja={wykonajAkcje} />
      {konfiguracja && (
        <div className="border-b px-4 py-3" style={STYL_SEKCJI}>
          <button type="button" className="mvd-btn" data-testid="inspektor-otworz-konfiguracje" onClick={konfiguracja.otworz}>
            {konfiguracja.etykietaPl}
          </button>
        </div>
      )}
      {dane?.kind === 'node' && dane.nodeSpec && <SekcjaWezlaSn wezel={dane.nodeSpec} />}
      {dane?.kind === 'apparatus' && <SekcjaStanuAparatu stan={dane.apparatusState ?? null} />}
      {(dane || stan.temat) && <SekcjaWynikowElementu wyniki={wyniki} />}
    </div>
  );
}
