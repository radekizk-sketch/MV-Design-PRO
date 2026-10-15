/**
 * KARTA OBWODU nN — panel odpływu domeny nN w formie tabelki rysunkowej (werdykt
 * wizualny właściciela B-02 z 2026-10-15: „kupa tekstu bez sensu, 0/10, ma wyglądać jak
 * kopia schematów CAD").
 *
 * Zasada prezentacji: jak tabelka obliczeniowa na arkuszu rysunku wykonawczego — sekcje
 * z nagłówkiem kapitalikami, wiersze „wielkość → wartość", tabela warunków SWZ
 * (warunek · wynik · limit · ocena) i PRZYPISY podstaw ([1], [2]…) zamiast akapitów.
 * Pełny rekord werdyktu wyjaśnialnego (stosowalność, dowód, zakres ważności, ślad) jest
 * dostępny JEDNYM kliknięciem („Pełny rekord dowodu"), nie wylany na pierwszy plan.
 *
 * Zero fizyki: wszystkie liczby, limity, podstawy i oceny pochodzą z odpowiedzi
 * backendu (rekordy K/W pakietu `werdykt`, werdykt TN `swz.werdykt`). Warunki
 * matematyczne TT/IT renderuje `MathInline` z pól `warunek_latex` rekordów K.
 * Identyfikatory modelu (ref) nie są pokazywane — nazwy z grafu projekcji.
 */

import type { CSSProperties, ReactNode } from 'react';

import { MathInline } from '../../../proof/MathRenderer';
import { KartaWerdyktu, NAZWA_STANU_ZRODLA_PL, wielkoscPl } from '../../../../ui2/wyniki/wzorzec/KartaWerdyktu';
import { InformacjeAudytowe } from '../../../../ui2/wyniki/wzorzec/InformacjeAudytowe';
import type { OcenaKryterium, PodstawaWymagania, SemantykaKoloru } from '../../../../ui2/wyniki/wzorzec/werdykt';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { jestWerdyktemTtIt, type SwzTnVerdict, type SwzTtItVerdict } from '../canvas/overlay';
import { kodyAnsiPelne, nazwyFunkcjiPl, stanSlowny, wpisAparatu, znakiIecPelne } from './symbolRegistry';
import type { LvDomainProjectionV1, LvDomainSwzFeederV1, LvEnergizationState } from './types';
import { plFixed, type PaletaNn } from './visualGrammar';

export interface MetrykaKarty {
  readonly kod: string;
  readonly tekst: string;
}

export interface KartaObwoduNnProps {
  readonly feeder: LvDomainSwzFeederV1;
  readonly transformerRef: string;
  readonly projection: LvDomainProjectionV1;
  readonly paleta: PaletaNn;
  /** Metryki aktywnego przebiegu dla aparatu odpływu (sformatowane przez widok). */
  readonly metryki: readonly MetrykaKarty[];
  readonly wynikPrzebiegu: { readonly tekst: string; readonly nieaktualny: boolean };
  /** `dok` — kolumna obok rysunku (rysunek się nie zasłania); `nakladka` — wąski ekran. */
  readonly ulozenie: 'dok' | 'nakladka';
  readonly szerokosc: number;
  readonly wysokosc?: number;
  readonly onClose: () => void;
}

/** Stan zasilania zacisku — słowo polskie zamiast kodu enum (§19: język inżynierski). */
const SLOWO_STANU_ZASILANIA: Readonly<Record<LvEnergizationState, string>> = {
  ENERGIZED: 'zasilony',
  DEENERGIZED: 'niezasilony',
  UNKNOWN: 'nieznany',
  CONFLICT: 'konflikt źródeł',
  MULTISOURCE: 'zasilany wielostronnie',
};

function slowoStanu(state: LvEnergizationState | undefined): string {
  return state ? SLOWO_STANU_ZASILANIA[state] ?? state : 'brak danych';
}

/** Znak oceny wiersza z SEMANTYKI etykiety backendu (nie ze statusu — mapa statusu
 *  na tekst żyje wyłącznie w backendzie; tu tylko kolor i glif). */
function znakSemantyki(semantyka: SemantykaKoloru): string {
  switch (semantyka) {
    case 'pozytywna':
      return '✓';
    case 'negatywna':
      return '✗';
    case 'ostrzegawcza':
      return '?';
    default:
      return '–';
  }
}

function tonSemantyki(semantyka: SemantykaKoloru, paleta: PaletaNn): string {
  switch (semantyka) {
    case 'pozytywna':
      return paleta.tonOk;
    case 'negatywna':
      return paleta.tonBledu;
    case 'ostrzegawcza':
      return paleta.tonOstrzegawczy;
    default:
      return paleta.kreskaWygaszona;
  }
}

function tonStatusuTn(status: SwzTnVerdict['status'], paleta: PaletaNn): string {
  if (status === 'spełnia') return paleta.tonOk;
  if (status === 'nie spełnia') return paleta.tonBledu;
  return paleta.tonOstrzegawczy;
}

/** Klucz przypisu podstawy: dokument + jednostka redakcyjna + stan (ta sama podstawa = ten sam numer). */
function kluczPodstawy(p: PodstawaWymagania): string {
  return `${p.dokument}|${p.jednostka_redakcyjna ?? ''}|${p.status}`;
}

function tekstPodstawy(p: PodstawaWymagania): string {
  const jednostka = p.jednostka_redakcyjna ? ` · ${p.jednostka_redakcyjna}` : '';
  return `${p.dokument}${jednostka} — stan źródła: ${NAZWA_STANU_ZRODLA_PL[p.status]}`;
}

// ---------------------------------------------------------------------------
// Klocki arkusza
// ---------------------------------------------------------------------------

function Sekcja({ tytul, paleta, children, testid }: {
  readonly tytul: ReactNode;
  readonly paleta: PaletaNn;
  readonly children: ReactNode;
  readonly testid?: string;
}): JSX.Element {
  return (
    <section data-testid={testid} style={{ borderTop: `1px solid ${paleta.kreskaWygaszona}`, padding: '6px 10px 8px' }}>
      <div style={{ fontSize: 10, letterSpacing: 0.8, fontWeight: 700, color: paleta.kreskaWygaszona, textTransform: 'uppercase', marginBottom: 4 }}>
        {tytul}
      </div>
      {children}
    </section>
  );
}

function Wiersz({ nazwa, paleta, children, testid, dane }: {
  readonly nazwa: string;
  readonly paleta: PaletaNn;
  readonly children: ReactNode;
  readonly testid?: string;
  readonly dane?: Readonly<Record<string, string>>;
}): JSX.Element {
  return (
    <div data-testid={testid} {...dane} style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 6, padding: '1px 0', fontSize: 11 }}>
      <span style={{ color: paleta.kreskaWygaszona }}>{nazwa}</span>
      <span style={{ color: paleta.kreskaBazowa, fontFamily: 'monospace' }}>{children}</span>
    </div>
  );
}

const KOMORKA: CSSProperties = { padding: '3px 4px', verticalAlign: 'top', textAlign: 'left' };

function TabelaWarunkow({ paleta, wiersze }: {
  readonly paleta: PaletaNn;
  readonly wiersze: readonly {
    readonly klucz: string;
    readonly warunek: ReactNode;
    readonly wynik: string;
    readonly limit: string;
    readonly przypis: number | null;
    readonly znak: string;
    readonly ton: string;
    readonly ocena: string;
  }[];
}): JSX.Element {
  const kreska = `1px solid ${paleta.kreskaWygaszona}`;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, border: kreska }}>
      <thead>
        <tr style={{ color: paleta.kreskaWygaszona, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <th style={{ ...KOMORKA, borderBottom: kreska }}>Warunek</th>
          <th style={{ ...KOMORKA, borderBottom: kreska, borderLeft: kreska }}>Wynik</th>
          <th style={{ ...KOMORKA, borderBottom: kreska, borderLeft: kreska }}>Limit</th>
          <th style={{ ...KOMORKA, borderBottom: kreska, borderLeft: kreska }}>Ocena</th>
        </tr>
      </thead>
      <tbody>
        {wiersze.map((w) => (
          <tr key={w.klucz} data-testid={`karta-obwodu-warunek-${w.klucz}`} style={{ borderTop: kreska }}>
            <td style={{ ...KOMORKA, color: paleta.kreskaBazowa }}>{w.warunek}</td>
            <td style={{ ...KOMORKA, borderLeft: kreska, fontFamily: 'monospace', whiteSpace: 'nowrap', color: paleta.kreskaBazowa }}>{w.wynik}</td>
            <td style={{ ...KOMORKA, borderLeft: kreska, fontFamily: 'monospace', whiteSpace: 'nowrap', color: paleta.kreskaBazowa }}>
              {w.limit}
              {w.przypis != null ? <sup style={{ color: paleta.kreskaWygaszona }}>{` [${w.przypis}]`}</sup> : null}
            </td>
            <td style={{ ...KOMORKA, borderLeft: kreska, color: w.ton }} title={w.ocena}>
              <span style={{ fontWeight: 700, marginRight: 4 }}>{w.znak}</span>
              <span style={{ fontSize: 10 }}>{w.ocena}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Przypisy({ paleta, pozycje }: { readonly paleta: PaletaNn; readonly pozycje: readonly { readonly n: number; readonly tekst: ReactNode; readonly testid?: string }[] }): JSX.Element {
  return (
    <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 10, color: paleta.kreskaWygaszona }}>
      {pozycje.map((p) => (
        <li key={p.n} data-testid={p.testid} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', padding: '1px 0' }}>
          <span>{`[${p.n}]`}</span>
          <span>{p.tekst}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// SWZ — układ TT/IT (rekord W werdyktu wyjaśnialnego) i TN (werdykt 3-stanowy)
// ---------------------------------------------------------------------------

function SekcjaSwzTtIt({ swz, paleta }: { readonly swz: SwzTtItVerdict; readonly paleta: PaletaNn }): JSX.Element {
  const w = swz.wymaganie;
  const numery = new Map<string, number>();
  const przypisy: { n: number; tekst: ReactNode; testid?: string }[] = [];
  const numerPodstawy = (p: PodstawaWymagania): number => {
    const klucz = kluczPodstawy(p);
    const istniejacy = numery.get(klucz);
    if (istniejacy != null) return istniejacy;
    const n = przypisy.length + 1;
    numery.set(klucz, n);
    przypisy.push({ n, tekst: tekstPodstawy(p) });
    return n;
  };
  let numerBrakuLimitu: number | null = null;
  const wierszBrakuLimitu = (): number => {
    if (numerBrakuLimitu != null) return numerBrakuLimitu;
    numerBrakuLimitu = przypisy.length + 1;
    przypisy.push({
      n: numerBrakuLimitu,
      testid: 'lv-domain-feeder-werdykt-tt-it-limit',
      tekst: `Limit bez podstawy: dopuszczalne napięcie dotykowe i warunki drugiego zwarcia (IEC 60364-4-41 §411.5/§411.6) — tekstu normy brak w repozytorium (kod ${swz.kod_odmowy_limitu ?? 'swz.limit_tt_it_brak_tekstu_normy'}).`,
    });
    return numerBrakuLimitu;
  };
  const wiersze = w.oceny_skladowe.map((k: OcenaKryterium) => {
    const limit = k.limit?.wartosc ?? null;
    const przypis = limit != null && k.limit ? numerPodstawy(k.limit.podstawa) : wierszBrakuLimitu();
    return {
      klucz: k.kryterium_id,
      warunek: <MathInline latex={k.kryterium.warunek_latex} />,
      wynik: k.wynik ? wielkoscPl(k.wynik.wartosc) : '—',
      limit: limit != null ? wielkoscPl(limit) : '—',
      przypis,
      znak: znakSemantyki(k.etykieta.semantyka),
      ton: tonSemantyki(k.etykieta.semantyka, paleta),
      ocena: k.etykieta.etykieta_pl,
    };
  });
  return (
    <div
      data-testid="lv-domain-feeder-werdykt-tt-it"
      data-uklad={swz.uklad}
      data-status-wymagania={w.status_maszynowy}
    >
      <TabelaWarunkow paleta={paleta} wiersze={wiersze} />
      <div data-testid="karta-obwodu-ocena-wymagania" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6, fontSize: 11 }}>
        <span style={{ color: paleta.kreskaWygaszona }}>{`Wymaganie (układ ${swz.uklad})`}</span>
        <span style={{ color: tonSemantyki(w.etykieta.semantyka, paleta), fontWeight: 700, textAlign: 'right' }}>
          {`${znakSemantyki(w.etykieta.semantyka)} ${w.etykieta.etykieta_pl}`}
        </span>
      </div>
      <Przypisy paleta={paleta} pozycje={przypisy} />
      <details data-testid="karta-obwodu-rekord-dowodu" style={{ marginTop: 8, fontSize: 11 }}>
        <summary style={{ cursor: 'pointer', color: paleta.tonInfo }}>Pełny rekord dowodu</summary>
        <div style={{ marginTop: 6 }}>
          <KartaWerdyktu rekord={w} naglowek={`Werdykt wyjaśnialny — układ ${swz.uklad}`} />
        </div>
      </details>
    </div>
  );
}

function SekcjaSwzTn({ swz, paleta }: { readonly swz: SwzTnVerdict; readonly paleta: PaletaNn }): JSX.Element {
  return (
    <div data-testid="lv-domain-feeder-swz-tn" data-swz-status={swz.status}>
      <TabelaWarunkow
        paleta={paleta}
        wiersze={[
          {
            klucz: 'swz.tn',
            warunek: 'Ik₁min ≥ Ia (t ≤ twym)',
            wynik: `${plFixed(swz.ik1_min_a, 0)} A`,
            limit: swz.ia_wymagane_a != null ? `${plFixed(swz.ia_wymagane_a, 0)} A` : '—',
            przypis: 1,
            znak: swz.status === 'spełnia' ? '✓' : swz.status === 'nie spełnia' ? '✗' : '?',
            ton: tonStatusuTn(swz.status, paleta),
            ocena: swz.status,
          },
        ]}
      />
      <Przypisy
        paleta={paleta}
        pozycje={[
          {
            n: 1,
            tekst: `IEC 60364-4-41 · Tab. 41.1${swz.t_wymagany_s != null ? ` — t wym = ${plFixed(swz.t_wymagany_s, 2)} s` : ''}`,
          },
        ]}
      />
      <div style={{ marginTop: 4, fontSize: 10, color: paleta.kreskaWygaszona }}>{swz.przyczyna_pl}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Karta
// ---------------------------------------------------------------------------

export function KartaObwoduNn({
  feeder,
  transformerRef,
  projection,
  paleta,
  metryki,
  wynikPrzebiegu,
  ulozenie,
  szerokosc,
  wysokosc,
  onClose,
}: KartaObwoduNnProps): JSX.Element {
  const trybEkspercki = useShellStore((stan) => stan.advancementMode) === 'expert';
  const graf = projection.graph;
  const ref = feeder.feeder_root_branch_ref;
  const urzadzenie = graf.devices.find((d) => d.ref_id === ref);
  const galaz = graf.branches.find((b) => b.ref_id === ref);
  const segment = graf.segments.find((s) => s.segment_id === ref);
  const zabezpieczenia = graf.protection_assignments.filter((p) => p.breaker_ref === ref);
  const aparat = urzadzenie ? wpisAparatu(urzadzenie.device_type, urzadzenie.device_kind, urzadzenie.catalog_namespace) : null;
  const nazwaSzyny = (busRef: string | null): string =>
    busRef ? graf.buses.find((b) => b.ref_id === busRef)?.name ?? 'szyna spoza projekcji' : 'brak';
  const nazwaTransformatora = graf.transformers.find((t) => t.ref_id === transformerRef)?.name ?? 'transformator spoza projekcji';
  const swz = feeder.swz.swz;

  const pozycja: CSSProperties = ulozenie === 'dok'
    ? { position: 'relative', width: szerokosc, height: wysokosc, flex: '0 0 auto', borderLeft: `1px solid ${paleta.kreskaWygaszona}` }
    : { position: 'absolute', top: 100, right: 16, bottom: 16, width: Math.min(szerokosc, 360), maxWidth: 'calc(100% - 32px)', border: `1px solid ${paleta.kreskaWygaszona}`, boxShadow: paleta.panelCien, zIndex: 4 };

  return (
    <aside
      data-testid="lv-domain-feeder-panel"
      data-feeder-ref={ref}
      data-ulozenie={ulozenie}
      style={{ ...pozycja, overflow: 'auto', background: paleta.panelTlo, color: paleta.kreskaBazowa, fontSize: 12 }}
    >
      {/* Nagłówek jak pole tabliczki rysunku: oznaczenie aparatu + klasa, zamknięcie. */}
      <div data-testid="lv-domain-feeder-aparat" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '8px 10px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
            {galaz?.name ?? 'aparat spoza projekcji'}
          </div>
          {aparat && urzadzenie ? (
            <div style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>
              {`${aparat.nazwaPl} · ${stanSlowny(urzadzenie.device_state).toLowerCase()} · ${galaz?.catalog_ref ?? 'bez katalogu'}`}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>Odpływ bez aparatu w modelu.</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij kartę obwodu"
          style={{ background: 'transparent', color: paleta.kreskaWygaszona, border: `1px solid ${paleta.kreskaWygaszona}`, borderRadius: 3, padding: '1px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          Zamknij
        </button>
      </div>

      <Sekcja tytul="Obwód" paleta={paleta}>
        <Wiersz nazwa="Zasilanie" paleta={paleta} testid="lv-domain-feeder-transformer" dane={{ 'data-transformer-ref': transformerRef }}>
          {`${nazwaTransformatora} · ${feeder.supply ?? 'brak danych'}`}
        </Wiersz>
        {feeder.supply_assumption_pl ? (
          <div data-testid="lv-domain-feeder-supply-assumption" style={{ color: paleta.tonOstrzegawczy, fontSize: 11 }}>{feeder.supply_assumption_pl}</div>
        ) : null}
        <Wiersz nazwa="Punkt najdalszy" paleta={paleta}>{`${nazwaSzyny(feeder.worst_point_bus_ref)} (${feeder.points.length} pkt)`}</Wiersz>
        <Wiersz nazwa="Łącznik" paleta={paleta} testid="lv-domain-feeder-lacznik">
          {segment ? (segment.connectivity_state === 'CLOSED' ? 'zamknięty' : 'otwarty') : 'brak danych odcinka'}
        </Wiersz>
        <Wiersz nazwa="Zaciski" paleta={paleta} testid="lv-domain-feeder-terminals">
          {segment
            ? `zacisk A ${slowoStanu(segment.from_terminal.energization_state)}, zacisk B ${slowoStanu(segment.to_terminal.energization_state)}`
            : 'brak danych odcinka'}
        </Wiersz>
      </Sekcja>

      <Sekcja tytul="Zabezpieczenia" paleta={paleta}>
        {zabezpieczenia.length === 0 ? (
          <div style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>Model nie przypisuje zabezpieczenia do tego aparatu.</div>
        ) : zabezpieczenia.map((z) => (
          <div key={z.ref_id} data-testid={`lv-domain-feeder-relay-${z.ref_id}`} style={{ fontSize: 11, padding: '1px 0' }}>
            <div style={{ fontWeight: 600 }}>{z.name}</div>
            <div style={{ fontFamily: 'monospace', color: paleta.kreskaWygaszona }}>
              {`${znakiIecPelne(z.function_codes).join(' · ') || '—'} (ANSI ${kodyAnsiPelne(z.function_codes).join(', ') || '—'}) · CT: ${z.ct_ref ?? 'brak'} · ${z.is_enabled ? 'aktywne' : 'wyłączone'}`}
            </div>
            <div style={{ color: paleta.kreskaWygaszona }}>{nazwyFunkcjiPl(z.function_codes).join(' · ') || '—'}</div>
          </div>
        ))}
      </Sekcja>

      <Sekcja
        tytul={swz && jestWerdyktemTtIt(swz) ? `Samoczynne wyłączenie — układ ${swz.uklad} · IEC 60364-4-41` : 'Samoczynne wyłączenie — IEC 60364-4-41'}
        paleta={paleta}
        testid="karta-obwodu-swz"
      >
        {swz && jestWerdyktemTtIt(swz) ? (
          <SekcjaSwzTtIt swz={swz} paleta={paleta} />
        ) : swz ? (
          <SekcjaSwzTn swz={swz} paleta={paleta} />
        ) : (
          <div data-testid="lv-domain-feeder-swz-odmowa" data-kod-odmowy={feeder.swz.kod_odmowy ?? undefined} style={{ color: paleta.tonOstrzegawczy, fontSize: 11 }}>
            {feeder.swz.reason_pl ?? `SWZ: ${feeder.swz.status}`}
            {feeder.swz.kod_odmowy ? <div style={{ fontFamily: 'monospace', color: paleta.kreskaWygaszona, marginTop: 2 }}>{`kod: ${feeder.swz.kod_odmowy}`}</div> : null}
          </div>
        )}
      </Sekcja>

      <Sekcja tytul="Wynik przebiegu" paleta={paleta}>
        <div style={{ fontSize: 11, color: wynikPrzebiegu.nieaktualny ? paleta.tonOstrzegawczy : paleta.kreskaWygaszona }}>{wynikPrzebiegu.tekst}</div>
        {metryki.length > 0 ? metryki.map((m) => (
          <Wiersz key={m.kod} nazwa={m.kod} paleta={paleta}>{m.tekst}</Wiersz>
        )) : (
          <div style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>Brak metryk tego odpływu w aktywnym przebiegu.</div>
        )}
      </Sekcja>

      <div style={{ padding: '0 10px 8px' }}>
        <InformacjeAudytowe
          trybEkspercki={trybEkspercki}
          testid="karta-obwodu-informacje-audytowe"
          wiersze={[
            { etykieta: 'Rewizja modelu', wartosc: String(projection.model_snapshot.revision) },
            { etykieta: 'Skrót modelu', wartosc: projection.model_snapshot.model_hash },
            { etykieta: 'Scenariusz', wartosc: projection.scenario_id },
            { etykieta: 'Aparat (ref)', wartosc: ref },
          ]}
        />
      </div>
    </aside>
  );
}
