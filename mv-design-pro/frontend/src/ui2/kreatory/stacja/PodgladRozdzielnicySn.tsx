/**
 * Podgląd rozdzielnicy SN — SCHEMAT JEDNOKRESKOWY kroku „Pola rozdzielnicy"
 * kreatora stacji (karta SLD-GEN-POLA; werdykt właściciela 2026-08-13: rysunek
 * pokazujący cztery jednakowe ikony różniące się podpisem — 3/10, ODRZUCONY).
 *
 * WYŁĄCZNIE PREZENTACJA. Rysunek pola generuje `generatorSldPola.ts` z
 * RZECZYWISTEJ kompozycji aparatów (BOM szablonu rodziny), rozdzielnicę składa
 * `podgladRozdzielnicy.ts`, symbole rysuje KANON SLD v3
 * (`ui/sld/v3/symbols/glyphs`), a ten plik zamienia gotową scenę na SVG.
 * Zero fizyki, zero obliczeń — geometria to układ rysunku.
 *
 * BUDOWA (wzorzec: schemat E1 rozdzielnicy ROTOBLOK i schemat RGSN 15 kV):
 *   · nagłówek pakietu — producent i rodzina, klasa napięciowa, prąd szyn,
 *     prąd zwarciowy, liczba jednostek, szerokość, werdykt konfiguracji
 *     (werdykt pochodzi z walidatora backendu, NIE jest liczony w UI),
 *   · tabela pól nad szyną — numer pola + nazwa funkcji (jak w tabeli funkcji
 *     schematu wykonawczego); szerokość kolumny wynika z jej treści,
 *   · szyna zbiorcza z napięciem, przerwana w polu sprzęgłowym,
 *   · pola: PEŁNY tor pionowy w kolejności pozycji aparatów kompozycji —
 *     odłącznik szynowy, aparat główny, przekładnik, odłącznik liniowy,
 *     uziemnik na odgałęzieniu do ziemi, tor pomiarowy z boku, przedział
 *     kablowy z głowicą, transformator i kreska strony nN; każdy aparat z
 *     własnym oznaczeniem operatorskim (Q1/Q0/T1/Q2/Q9/GK/TR),
 *   · opisy pod polami — nazwa katalogowa aparatu, jego znamiona, pakiet pola.
 *
 * Motywy z automatu: kolory z tokenów `--mvd-*`, glify rysowane `currentColor`.
 */

import { SYMBOL_GLYPHS } from '../../../ui/sld/v3/symbols/glyphs';
import { LABEL_TYPOGRAPHY } from '../../../ui/sld/v3/core/text';
import type { SwitchgearFamily } from '../../../ui/catalog/SwitchgearFamilyPicker';
import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';
import type { MVApparatusCatalogType, TransformerType } from '../../../ui/catalog/types';
import type { StationSnFieldTemplate } from './stacjaModel';
import {
  GRUBOSC_SZYNY,
  GRUBOSC_TORU,
  KLASA_APARATU,
  KLASA_OZNACZENIA,
  KLASA_ROLI,
  ODSTEP_TABELA_SZYNA,
  SKALA_SYMBOLU,
  WYS_WIERSZA_APARATU,
  WYS_WIERSZA_ROLI,
  pozycjaOznaczenia,
  zbudujPodglad,
  type NaglowekRozdzielnicy,
  type StatusKonfiguracji,
} from './podgladRozdzielnicy';
import { STACJA_STRINGS as T } from './strings';

export interface PodgladRozdzielnicySnProps {
  snFields: readonly StationSnFieldTemplate[];
  /** Katalog APARAT_SN — źródło rodzaju aparatu (symbol) i jego znamion (opis). */
  aparaty?: readonly MVApparatusCatalogType[];
  /** Katalog TRAFO_SN_NN + wskazany typ — opis transformatora pola TR. */
  transformatory?: readonly TransformerType[];
  transformatorRef?: string | null;
  /** Napięcie szyny SN z kontekstu operacji [kV]. */
  snVoltageKv?: number;
  /** Kompletne szablony pól — nośnik KOMPOZYCJI APARATÓW rysowanych w polach. */
  szablonyPol?: readonly CompleteMvBayTemplateSummary[];
  /** Rodzina rozdzielnicy (nagłówek pakietu: Un, In szyn, Ik, konstrukcja). */
  rodzina?: SwitchgearFamily | null;
  producent?: string | null;
  /** Werdykt walidatora backendu dla bieżącej konfiguracji. */
  statusKonfiguracji?: StatusKonfiguracji;
  komunikatStatusu?: string | null;
  testid?: string;
}

/** Nazwa PL werdyktu konfiguracji + token koloru statusu. */
const STATUS_PREZENTACJA: Readonly<
  Record<StatusKonfiguracji, { etykieta: string; token: string }>
> = {
  VALID: { etykieta: T.statusKonfiguracjiValid, token: 'var(--mvd-ok)' },
  INVALID: { etykieta: T.statusKonfiguracjiInvalid, token: 'var(--mvd-err)' },
  NIESPRAWDZONA: { etykieta: T.statusKonfiguracjiNiesprawdzona, token: 'var(--mvd-muted)' },
  SPRAWDZANIE: { etykieta: T.statusKonfiguracjiSprawdzanie, token: 'var(--mvd-muted)' },
};

/**
 * Nagłówek pakietu rozdzielnicy. Pozycja bez danych katalogowych pokazuje jawny
 * brak (kreskę), nigdy wartości domyślnej — projektant ma widzieć, czego karta
 * katalogowa nie niesie.
 */
function NaglowekPakietu({ naglowek }: { naglowek: NaglowekRozdzielnicy }) {
  const status = STATUS_PREZENTACJA[naglowek.status];
  const pozycje: readonly { etykieta: string; wartosc: string | null }[] = [
    { etykieta: T.naglowekRodzina, wartosc: naglowek.rodzina },
    { etykieta: T.naglowekKonstrukcja, wartosc: naglowek.konstrukcja },
    { etykieta: T.naglowekNapiecie, wartosc: naglowek.klasaNapiecia },
    { etykieta: T.naglowekPradSzyn, wartosc: naglowek.pradSzyn },
    { etykieta: T.naglowekPradZwarciowy, wartosc: naglowek.pradZwarciowy },
    { etykieta: T.naglowekJednostki, wartosc: String(naglowek.liczbaJednostek) },
    { etykieta: T.naglowekSzerokosc, wartosc: naglowek.szerokoscCalkowita },
  ];
  return (
    <div className="mvd-podglad-naglowek" data-testid="mvd-podglad-naglowek">
      <div className="mvd-podglad-naglowek-tytul">
        <strong>{naglowek.producent ?? T.naglowekBrakProducenta}</strong>
        <span
          className="mvd-podglad-naglowek-status"
          data-testid="mvd-podglad-status"
          data-status={naglowek.status}
          style={{ color: status.token }}
          title={naglowek.komunikatStatusu ?? undefined}
        >
          {status.etykieta}
        </span>
      </div>
      <dl className="mvd-podglad-naglowek-dane">
        {pozycje.map((p) => (
          <div key={p.etykieta} className="mvd-podglad-naglowek-pozycja">
            <dt>{p.etykieta}</dt>
            <dd>{p.wartosc ?? T.naglowekBrakDanej}</dd>
          </div>
        ))}
      </dl>
      {naglowek.status === 'INVALID' && naglowek.komunikatStatusu ? (
        <p className="mvd-podglad-naglowek-komunikat">{naglowek.komunikatStatusu}</p>
      ) : null}
    </div>
  );
}

export function PodgladRozdzielnicySn({
  snFields,
  aparaty = [],
  transformatory = [],
  transformatorRef = null,
  snVoltageKv = 0,
  szablonyPol = [],
  rodzina = null,
  producent = null,
  statusKonfiguracji = 'NIESPRAWDZONA',
  komunikatStatusu = null,
  testid,
}: PodgladRozdzielnicySnProps) {
  const rysunek = zbudujPodglad({
    snFields,
    aparaty,
    transformatory,
    transformatorRef,
    snVoltageKv,
    szablonyPol,
    rodzina,
    producent,
    statusKonfiguracji,
    komunikatStatusu,
  });
  const { szerokosc, wysokosc, szynaY } = rysunek;

  // Kreski tabel arkusza: obramowanie + pionowe przegrody na granicach slotów.
  // Granica jest ZAWSZE krawędzią slotu policzoną w modelu — tabela funkcji nad
  // rysunkiem, tabela aparatury pod rysunkiem i sam rysunek nie mogą mieć trzech
  // różnych podziałów na kolumny (reguła KLASA §3: jedno źródło podziału).
  const tabela = (gora: number, dol: number): [number, number, number, number][] => {
    if (rysunek.sloty.length === 0) return [];
    const lewaPierwszego = rysunek.sloty[0].x - rysunek.sloty[0].szerokosc / 2;
    const ostatni = rysunek.sloty[rysunek.sloty.length - 1];
    const prawaOstatniego = ostatni.x + ostatni.szerokosc / 2;
    const kreski: [number, number, number, number][] = [
      [lewaPierwszego, gora, prawaOstatniego, gora],
      [lewaPierwszego, dol, prawaOstatniego, dol],
      [prawaOstatniego, gora, prawaOstatniego, dol],
    ];
    for (const slot of rysunek.sloty) {
      const lewa = slot.x - slot.szerokosc / 2;
      kreski.push([lewa, gora, lewa, dol]);
    }
    return kreski;
  };
  const naglowekGora = rysunek.naglowekY - LABEL_TYPOGRAPHY[KLASA_ROLI].fontSize - 4;
  // Dolna krawędź tabeli funkcji zostawia pas na opis szyny (napięcie) NAD
  // szyną — bez tego prześwitu napis wchodził w ostatni wiersz nazwy pola.
  const naglowekDol = szynaY - ODSTEP_TABELA_SZYNA + 4;
  const opisyGora = rysunek.opisyY - LABEL_TYPOGRAPHY[KLASA_APARATU].fontSize - 5;
  const opisyDol = rysunek.opisyY + (rysunek.wierszyOpisu - 1) * WYS_WIERSZA_APARATU + 6;
  const kreskiTabeli = [...tabela(naglowekGora, naglowekDol), ...tabela(opisyGora, opisyDol)];

  return (
    <div className="mvd-podglad-rozdzielnica" data-testid={testid}>
      <NaglowekPakietu naglowek={rysunek.naglowek} />
      {/* SKALA ARKUSZA: rysunek WOLNO zmniejszyć do szerokości panelu, ale nie
          wolno go POWIĘKSZAĆ ponad rozmiar własny. Bez tego ograniczenia wąski
          rysunek rozciągał się na całą szerokość panelu razem z wysokością:
          rozdzielnica BEZ PÓL (rodzina RMU przed wskazaniem bloku) dawała ~130 px
          rysunku rozdmuchane do ~850 px pustego pola pod nagłówkiem. Arkusz
          rysunkowy nie zmienia skali dlatego, że ktoś poszerzył okno. */}
      <svg
        viewBox={`0 0 ${szerokosc} ${wysokosc}`}
        role="img"
        aria-label={T.podgladTytul}
        style={{
          width: '100%',
          maxWidth: `${szerokosc}px`,
          height: 'auto',
          color: 'var(--mvd-ink)',
        }}
      >
        {/* --- Tabela pól (numer + funkcja), jak w schemacie wykonawczym --- */}
        {kreskiTabeli.map(([x1, y1, x2, y2], i) => (
          <line
            key={`tabela-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--mvd-line)"
            strokeWidth={0.8}
          />
        ))}
        {rysunek.sloty.map((slot) => {
          return (
            <g key={`naglowek-${slot.klucz}`}>
              <text
                x={slot.x}
                y={rysunek.naglowekY}
                textAnchor="middle"
                fill="var(--mvd-muted)"
                fontSize={LABEL_TYPOGRAPHY[KLASA_ROLI].fontSize}
                fontWeight={LABEL_TYPOGRAPHY[KLASA_ROLI].fontWeight}
              >
                {T.podgladPole(slot.numer)}
              </text>
              {slot.wierszeRoli.map((wiersz, i) => (
                <text
                  key={`rola-${slot.klucz}-${i}`}
                  x={slot.x}
                  y={rysunek.naglowekY + (i + 1) * WYS_WIERSZA_ROLI}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize={LABEL_TYPOGRAPHY[KLASA_ROLI].fontSize}
                  fontWeight={LABEL_TYPOGRAPHY[KLASA_ROLI].fontWeight}
                >
                  {wiersz}
                </text>
              ))}
            </g>
          );
        })}

        {/* --- Szyna zbiorcza (przerwana w polu sprzęgłowym) --- */}
        {rysunek.odcinkiSzyny.map(([x1, x2], i) => (
          <line
            key={`szyna-${i}`}
            x1={x1}
            y1={szynaY}
            x2={x2}
            y2={szynaY}
            stroke="var(--mvd-accent)"
            strokeWidth={GRUBOSC_SZYNY}
            strokeLinecap="square"
            data-testid={`mvd-podglad-szyna-${i}`}
          />
        ))}
        <text
          x={10}
          y={szynaY - 7}
          fill="var(--mvd-muted)"
          fontSize={LABEL_TYPOGRAPHY[KLASA_APARATU].fontSize}
          fontWeight={LABEL_TYPOGRAPHY[KLASA_APARATU].fontWeight}
        >
          {rysunek.etykietaSzyny}
        </text>

        {/* --- Pola: tor + symbole kanoniczne + oznaczenia + opisy --- */}
        {rysunek.sloty.map((slot) => (
          <g
            key={slot.klucz}
            // Numer W identyfikatorze: dwa pola tej samej roli (np. dwa
            // odgałęźne) miały dotąd IDENTYCZNY testid, więc każdy lokator
            // wskazywałby dwa węzły naraz.
            data-testid={`mvd-podglad-pole-${slot.numer}-${slot.rola}`}
            data-pole-numer={slot.numer}
          >
            {slot.scena.tor.map(([x1, y1, x2, y2], i) => (
              <line
                key={`tor-${slot.klucz}-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth={GRUBOSC_TORU}
              />
            ))}
            {/* Przedział kablowy — obwiednia strefy zakończenia kablowego pola.
                Kreska przerywana, bo to GRANICA PRZEDZIAŁU rozdzielnicy, a nie
                element toru prądowego. */}
            {slot.scena.strefaKablowa ? (
              <rect
                data-testid={`mvd-podglad-przedzial-${slot.numer}`}
                x={slot.scena.strefaKablowa.x}
                y={slot.scena.strefaKablowa.y}
                width={slot.scena.strefaKablowa.szerokosc}
                height={slot.scena.strefaKablowa.wysokosc}
                fill="none"
                stroke="var(--mvd-line)"
                strokeWidth={0.8}
                strokeDasharray="3 2"
              />
            ) : null}
            {/* Kreska strony nN pod transformatorem — wyprowadzenie 0,4 kV. */}
            {slot.scena.kreskaNn ? (
              <g data-testid={`mvd-podglad-nn-${slot.numer}`}>
                <line
                  x1={slot.scena.kreskaNn[0]}
                  y1={slot.scena.kreskaNn[2]}
                  x2={slot.scena.kreskaNn[1]}
                  y2={slot.scena.kreskaNn[2]}
                  stroke="currentColor"
                  strokeWidth={GRUBOSC_SZYNY * 0.6}
                  strokeLinecap="square"
                />
                <text
                  x={slot.scena.kreskaNn[1] + 3}
                  y={slot.scena.kreskaNn[2] + LABEL_TYPOGRAPHY[KLASA_OZNACZENIA].fontSize / 3}
                  fill="var(--mvd-muted)"
                  fontSize={LABEL_TYPOGRAPHY[KLASA_OZNACZENIA].fontSize}
                  fontWeight={LABEL_TYPOGRAPHY[KLASA_OZNACZENIA].fontWeight}
                >
                  {T.podgladStronaNn}
                </text>
              </g>
            ) : null}
            {slot.scena.symbole.map((symbol, i) => {
              const Glyph = SYMBOL_GLYPHS[symbol.id];
              const oznaczenie = pozycjaOznaczenia(symbol);
              // Powiększenie symbolu (SKALA_SYMBOLU) nakładane transformacją
              // grupy — glif kanonu rysuje się we WŁASNYCH współrzędnych, więc
              // żadna geometria biblioteki nie jest tu kopiowana.
              //
              // BEZ `state`: kreator konfiguruje SKŁAD rozdzielnicy, a nie
              // położenie łączników — podanie „closed" byłoby narysowaniem
              // stanu, którego formularz nie niesie. Glify kanonu mają dla
              // braku stanu własną, jawną reprezentację (§ „stan wyrażony
              // geometrią"), więc rysunek mówi „aparat jest", a nie „aparat
              // jest zamknięty".
              return (
                <g key={`symbol-${slot.klucz}-${i}`}>
                  <g
                    data-symbol-pola={symbol.id}
                    data-oznaczenie={symbol.oznaczenie}
                    transform={`translate(${symbol.x}, ${symbol.y}) scale(${SKALA_SYMBOLU})`}
                  >
                    <Glyph x={0} y={0} stroke="currentColor" />
                  </g>
                  {symbol.oznaczenie !== '' ? (
                    <text
                      x={oznaczenie.x}
                      y={oznaczenie.y}
                      textAnchor={oznaczenie.kotwica}
                      fill="var(--mvd-muted)"
                      fontSize={LABEL_TYPOGRAPHY[KLASA_OZNACZENIA].fontSize}
                      fontWeight={LABEL_TYPOGRAPHY[KLASA_OZNACZENIA].fontWeight}
                    >
                      {symbol.oznaczenie}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {slot.wierszeOpisu.map((wiersz, i) => {
              const nazwa = i < slot.wierszyNazwy;
              return (
                <text
                  key={`opis-${slot.klucz}-${i}`}
                  x={slot.x}
                  y={rysunek.opisyY + i * WYS_WIERSZA_APARATU}
                  textAnchor="middle"
                  fill={
                    slot.brakAparatu && nazwa
                      ? 'var(--mvd-err)'
                      : nazwa
                        ? 'currentColor'
                        : 'var(--mvd-muted)'
                  }
                  fontSize={LABEL_TYPOGRAPHY[KLASA_APARATU].fontSize}
                  fontWeight={nazwa ? 700 : LABEL_TYPOGRAPHY[KLASA_APARATU].fontWeight}
                >
                  {wiersz}
                </text>
              );
            })}
          </g>
        ))}
      </svg>
      <p className="mvd-podglad-rozdzielnica-opis">{T.podgladOpisRysunku}</p>
    </div>
  );
}
