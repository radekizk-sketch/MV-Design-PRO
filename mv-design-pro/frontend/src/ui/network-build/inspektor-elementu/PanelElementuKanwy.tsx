/**
 * UI-02b JEDEN-INSPEKTOR → K6 KARTA TECHNICZNA — sekcje prawego inspektora dla obiektu
 * schematu. Kanwa nie ma własnego panelu: klik elementu zaznacza go, a te sekcje (nad oknem
 * technicznym w `LegacyInspektor` albo w `InspectorEngineeringView`) pokazują, w kolejności
 * pracy projektanta:
 *  - nagłówek: rodzaj i nazwa obiektu (stacja — rodzaj z topologii, ta sama reguła co drzewo
 *    projektu), stacja › pole, identyfikator globalny aparatu;
 *  - formularz nowego układu PV/BESS/FW po upuszczeniu z palety (`FormularzSzkicuDer`);
 *  - kartę techniczną obiektu (`KartaTechnicznaElementu`): identyfikacja, rozdzielnica z tabelą
 *    pól, transformator z danymi tabliczki i źródłem danej, strona nN, przyłączenia…;
 *  - węzeł SN (ZK SN, słup rozgałęźny) i stan aparatu z rekordu źródła runtime modelu;
 *  - w trybie edycji modelu: stan obiektu (istniejący / projektowany) pola, aparatu pola albo
 *    łącznika poza polem — edytor operacji `set_object_state` (`ui/field/EdytorStanuObiektuPola`);
 *  - wyniki oglądanego przebiegu pod nazwą analizy („Obliczenia zwarciowe”, „Rozpływ mocy”) —
 *    wielkości z rejestru wspólnego z etykietami kanwy: brak z przyczyną / nieaktualne / wartość;
 *  - wejście do pełnej konfiguracji odcinka (E-12) i karty węzła (E-14 / E-15);
 *  - na końcu, ZWINIĘTE, działania z TEGO SAMEGO rejestru i kontekstu dostępności co menu
 *    kontekstowe kanwy (`akcjeElementu`), wykonywane tym samym wykonawcą; pozycja niedostępna
 *    jest nieaktywna (`aria-disabled`) z przyczyną w opisie przycisku.
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
import { OPIS_POLOZENIA_PL } from '../../sld/v2/model/stanAparatowPola';
import { stanKaflaPolozenia } from '../../sld/v3/symbols/glyphs';
import { STATE_COLOR } from '../../sld/v3/theme/colorTokens';
import type { DaneElementuKanwy } from '../../sld/shared/daneElementuKanwy';
import { StanObiektuWInspektorze } from '../../field/EdytorStanuObiektuPola';
import { FormularzSzkicuDer } from './FormularzSzkicuDer';
import { KartaTechnicznaElementu } from './KartaTechnicznaElementu';
import { TekstZWzorami } from '../../../ui2/kreatory/rama/tekstZWzorami';
import {
  NAZWA_RODZAJU,
  TYTUL_WYNIKOW_PL,
  etykietaElementuKanwy,
  type StanPaneluElementu,
  type StanWynikowElementu,
} from './stanPaneluElementu';

const STYL_SEKCJI = {
  borderColor: 'var(--mvd-line)',
  fontSize: 'var(--mvd-font-size-data)',
  color: 'var(--mvd-ink)',
} as const;

export function PasekDzialanElementu({
  akcje,
  onAkcja,
}: {
  readonly akcje: readonly SldMenuAction[];
  readonly onAkcja: (actionId: string) => void;
}): JSX.Element | null {
  if (akcje.length === 0) return null;
  // V12K-352: ten sam kanon sekcji co menu kontekstowe kanwy (`SEKCJE_MENU_SLD`) —
  // pasek działań i menu pokazują te same pozycje w tych samych sekcjach i kolejności.
  const grupy = SEKCJE_MENU_SLD
    .map((grupa) => ({ grupa, pozycje: akcje.filter((akcja) => akcja.section === grupa) }))
    .filter((wpis) => wpis.pozycje.length > 0);
  return (
    <section data-testid="inspektor-dzialania" aria-label="Dostępne czynności" className="flex flex-col gap-2 border-b px-4 py-3" style={STYL_SEKCJI}>
      <h4 className="font-semibold" style={{ fontSize: 'var(--mvd-font-size-data)' }}>Dostępne czynności</h4>
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
  const tytul = wyniki.analiza ? TYTUL_WYNIKOW_PL[wyniki.analiza] : 'Wyniki obliczeń';
  return (
    <section data-testid="inspektor-wyniki" data-stan={wyniki.stan} data-analiza={wyniki.analiza ?? undefined} data-run-id={wyniki.runId ?? undefined} data-swiezosc={wyniki.swiezosc ?? undefined} aria-label={tytul} className="flex flex-col gap-2 border-b px-4 py-3" style={STYL_SEKCJI}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold" data-testid="inspektor-wyniki-tytul" style={{ fontSize: 'var(--mvd-font-size-data)' }}>{tytul}</h4>
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
              <div key={metryka.code} className="mvd-kt-wiersz" data-testid={`inspektor-wynik-${metryka.code}`}>
                <dt className="mvd-kt-etykieta">
                  <TekstZWzorami tekst={metryka.symbol ? `${metryka.label} ${metryka.symbol}` : metryka.label} />
                </dt>
                <dd className="mvd-kt-wartosc mvd-num">{metryka.value}</dd>
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
    <div className="mvd-kt-wiersz">
      <dt className="mvd-kt-etykieta">{etykieta}</dt>
      <dd data-testid={testId} className="mvd-kt-wartosc" style={wartosc === null ? { color: 'var(--mvd-muted)' } : undefined}>
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

export const BRAK_POLOZENIA_W_MODELU = 'brak stanu w modelu';

/**
 * Karta #135 × GPZ-PARYTET cz. 2: położenie łącznika z MODELU (ten sam rachunek co glif
 * kanwy), telemetria (tryb, komunikacja, uzależnienie, chwila zmiany) WYŁĄCZNIE z rekordu
 * źródła runtime; brak rekordu = „brak telemetrii", nigdy wartość domyślna. Układ wierszy ten sam
 * co karta techniczna K6 (`mvd-kt-wiersz`: etykieta w jednej linii, wartość obok albo pod nią).
 */
export function SekcjaStanuAparatu({ stan }: { readonly stan: DaneElementuKanwy['apparatusState'] }): JSX.Element {
  const polozenie = stan?.actualState ? OPIS_POLOZENIA_PL[stan.actualState] : BRAK_POLOZENIA_W_MODELU;
  // Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC: ten sam kafel stanu co na kanwie (JEDNA
  // tabela `STATE_COLOR`, ta sama reguła `stanKaflaPolozenia`) — inspektor i rysunek mówią
  // o położeniu tym samym kolorem; tekst obok niesie treść (kolor nie jest jedynym nośnikiem).
  const kafel = stan?.actualState ? stanKaflaPolozenia(stan.actualState) : null;
  return (
    <section data-testid="inspektor-stan-aparatu" aria-label="Stan i telemetria aparatu" className="flex flex-col gap-2 border-b px-4 py-3" style={STYL_SEKCJI}>
      <h4 className="font-semibold" style={{ fontSize: 'var(--mvd-font-size-data)' }}>Stan i telemetria aparatu</h4>
      <dl className="mvd-kt-wiersze">
        <div className="mvd-kt-wiersz">
          <dt className="mvd-kt-etykieta">Położenie łącznika (model)</dt>
          <dd className="mvd-kt-wartosc flex items-center gap-2">
            {kafel && (
              <span
                aria-hidden="true"
                data-testid="inspektor-aparat-kafel"
                data-kafel-stanu={kafel}
                style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: STATE_COLOR[kafel] }}
              />
            )}
            <span data-testid="inspektor-aparat-stan">{polozenie}</span>
          </dd>
        </div>
        <div className="mvd-kt-wiersz">
          <dt className="mvd-kt-etykieta">Tryb sterowania</dt>
          <dd data-testid="inspektor-aparat-tryb" className="mvd-kt-wartosc">{controlModeLabel(stan?.controlMode ?? null)}</dd>
        </div>
        <div className="mvd-kt-wiersz">
          <dt className="mvd-kt-etykieta">Komunikacja</dt>
          <dd data-testid="inspektor-aparat-komunikacja" className="mvd-kt-wartosc">{communicationOkLabel(stan?.communicationOk ?? null)}</dd>
        </div>
        <div className="mvd-kt-wiersz">
          <dt className="mvd-kt-etykieta">Uzależnienie operacyjne</dt>
          <dd data-testid="inspektor-aparat-uzaleznienie" className="mvd-kt-wartosc">{interlockBlockedLabel(stan?.interlockBlocked ?? null)}</dd>
        </div>
        <div className="mvd-kt-wiersz">
          <dt className="mvd-kt-etykieta">Ostatnia zmiana</dt>
          <dd data-testid="inspektor-aparat-zmiana" className="mvd-kt-wartosc mvd-num">{stan?.lastChangeAt ?? BRAK_TELEMETRII}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Operacja modelu spoza rejestru menu kanwy (skróty widoku inżynierskiego: przypisanie
 *  katalogu, edycja parametrów…) — pokazywana w tym samym zwiniętym bloku działań. */
export interface OperacjaModeluInspektora {
  readonly id: string;
  readonly etykietaPl: string;
  readonly onClick: () => void;
  readonly niedostepnaPl?: string | null;
  readonly wariant?: 'danger';
}

/** Działania obiektu na końcu inspektora, ZWINIĘTE (K6): rozwinięcie jednym klikiem w nagłówek
 *  listy, liczba pozycji w nagłówku. Pozycje rejestru menu kanwy i operacje modelu widoku
 *  inżynierskiego są w JEDNYM bloku — nie ma drugiej, rozwiniętej listy operacji poniżej. */
export function DzialaniaZwiniete({
  akcje,
  onAkcja,
  operacje = [],
}: {
  readonly akcje: readonly SldMenuAction[];
  readonly onAkcja: (actionId: string) => void;
  readonly operacje?: readonly OperacjaModeluInspektora[];
}): JSX.Element | null {
  const liczba = akcje.length + operacje.length;
  if (liczba === 0) return null;
  return (
    <details data-testid="inspektor-dzialania-zwiniete" className="border-b" style={{ borderColor: 'var(--mvd-line)' }}>
      <summary
        data-testid="inspektor-dzialania-rozwin"
        className="cursor-pointer px-4 py-2 font-semibold"
        style={{ fontSize: 'var(--mvd-font-size-data)', color: 'var(--mvd-ink)' }}
      >
        Dostępne czynności ({liczba})
      </summary>
      <PasekDzialanElementu akcje={akcje} onAkcja={onAkcja} />
      {operacje.length > 0 && (
        <section
          data-testid="inspektor-operacje-modelu"
          aria-label="Operacje modelu"
          className="flex flex-col gap-1 border-b px-4 py-3"
          style={STYL_SEKCJI}
        >
          <span style={{ color: 'var(--mvd-muted)' }}>Operacje modelu</span>
          <div className="flex flex-wrap gap-1.5">
            {operacje.map((operacja) => (
              <button
                key={operacja.id}
                type="button"
                className="mvd-btn"
                data-testid={`inspektor-operacja-${operacja.id}`}
                aria-disabled={operacja.niedostepnaPl ? true : undefined}
                title={operacja.niedostepnaPl ?? operacja.etykietaPl}
                onClick={operacja.niedostepnaPl ? undefined : operacja.onClick}
                style={operacja.wariant === 'danger' && !operacja.niedostepnaPl ? { color: 'var(--mvd-err)' } : undefined}
              >
                {operacja.etykietaPl}
              </button>
            ))}
          </div>
        </section>
      )}
    </details>
  );
}

export function PanelElementuKanwy({
  stan,
  dzialaniaPoza = false,
}: {
  readonly stan: StanPaneluElementu;
  /** `true` — działania renderuje wołający na samym końcu inspektora (widok inżynierski, który
   *  pod tym panelem ma jeszcze dowód obliczeń i schemat pola). */
  readonly dzialaniaPoza?: boolean;
}): JSX.Element {
  const { dane, akcje, wykonajAkcje, wyniki, szkicDer, daneSzkicuDer, konfiguracja, karta, edytuj } = stan;
  const kontekstStacji = dane
    ? [dane.parentStationLabel ?? (dane.kind !== 'station' && dane.stationCode ? `Stacja ${dane.stationCode}` : null), dane.parentBayLabel]
        .filter((czesc): czesc is string => Boolean(czesc))
        .join(' › ')
    : '';
  return (
    <div data-testid="inspektor-element-kanwy" data-rodzaj={dane?.kind ?? ''} data-element-id={dane?.elementId ?? ''}>
      {dane && (
        <div className="flex flex-col gap-0.5 border-b px-4 py-2" style={STYL_SEKCJI} data-testid="inspektor-element-kontekst">
          {/* Układ 1 (karta INSPEKTOR-I-NAWIGACJA): nazwa z oznaczeniem, pod nią rodzaj z napięciami. */}
          <span data-testid="inspektor-element-naglowek" className="font-semibold">
            {karta?.oznaczenieSchematu && (
              <>
                <span data-testid="inspektor-element-oznaczenie" className="mvd-num">{karta.oznaczenieSchematu}</span>
                {' · '}
              </>
            )}
            <span data-testid="inspektor-element-etykieta">{karta?.nazwa ?? etykietaElementuKanwy(dane)}</span>
          </span>
          <span style={{ color: 'var(--mvd-muted)' }}>
            <span data-testid="inspektor-element-rodzaj">{karta?.rodzajPl ?? (dane.kind ? NAZWA_RODZAJU[dane.kind] : 'Element')}</span>
            {karta?.napieciaPl && <span data-testid="inspektor-element-napiecia">{` · ${karta.napieciaPl}`}</span>}
          </span>
          {kontekstStacji && <span data-testid="inspektor-element-sciezka" style={{ color: 'var(--mvd-muted)' }}>{kontekstStacji}</span>}
          {dane.globalId && (
            <span data-testid="inspektor-element-identyfikator" className="mvd-num">Identyfikator: {dane.globalId}</span>
          )}
        </div>
      )}
      {szkicDer && daneSzkicuDer && <FormularzSzkicuDer dane={daneSzkicuDer} derKind={szkicDer.derKind} />}
      {karta && (
        <KartaTechnicznaElementu
          karta={karta}
          onEdytuj={edytuj}
          onOtworz={stan.otworzAparat}
          onAkcja={stan.wykonajAkcjeWiersza}
          onAkcjaKarty={stan.akcjaKarty}
          sekcjaWyrozniona={stan.sekcjaWyrozniona}
        />
      )}
      {dane?.kind === 'node' && dane.nodeSpec && <SekcjaWezlaSn wezel={dane.nodeSpec} />}
      {dane?.kind === 'apparatus' && <SekcjaStanuAparatu stan={dane.apparatusState ?? null} />}
      {stan.stanObiektuRef !== null && <StanObiektuWInspektorze elementRef={stan.stanObiektuRef} />}
      {(dane || stan.temat) && <SekcjaWynikowElementu wyniki={wyniki} />}
      {konfiguracja && (
        <div className="border-b px-4 py-3" style={STYL_SEKCJI}>
          <button type="button" className="mvd-btn" data-testid="inspektor-otworz-konfiguracje" onClick={konfiguracja.otworz}>
            {konfiguracja.etykietaPl}
          </button>
        </div>
      )}
      {!dzialaniaPoza && <DzialaniaZwiniete akcje={akcje} onAkcja={wykonajAkcje} />}
    </div>
  );
}
