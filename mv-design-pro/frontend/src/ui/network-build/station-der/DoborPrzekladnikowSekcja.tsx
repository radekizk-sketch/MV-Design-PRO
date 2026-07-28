/**
 * Sekcja „Dobór przekładników" na ekranie wytwórcy (karta E21-4, audyt E-21 pkt P9).
 *
 * CO ZASTĘPUJE. Ekran pokazywał przekładniki jako NAZWY katalogowe („CT 200/5 A kl.
 * 5P10 10 VA", „VT 20 kV / 100 V kl. 3P") i nic więcej. Właściciel: „bez sprawdzenia
 * przekładni wobec prądu chronionego toru, obciążalności cieplnej i dynamicznej,
 * nasycenia oraz zgodności z wejściem przekaźnika jego wybór nie ma wiarygodności
 * inżynierskiej". Nazwa nie jest dowodem doboru — dowodem jest RACHUNEK.
 *
 * CO POKAZUJE. Dla każdego kryterium: nazwę, podstawę normową, wartość WYMAGANĄ przez
 * tor i wartość DOSTĘPNĄ w typie, werdykt i skutek niespełnienia. Brak danej jest
 * TRZECIM STANEM — widocznym, nazwanym i blokującym potwierdzenie doboru.
 *
 * ZERO REGUŁY I ZERO FIZYKI W PREZENTACJI: wszystkie werdykty, rachunki i wymagania
 * przychodzą z reguły domenowej (`domain/dobor_przekladnika.py`) przez endpoint
 * `.../instrument-transformers`. Ten plik nic nie liczy i niczego nie rozstrzyga.
 */

import { useEffect, useState } from 'react';

export type WerdyktKryterium = 'spelnione' | 'niespelnione' | 'informacja' | 'brak_danych';

export interface KryteriumDoboru {
  readonly kod: string;
  readonly nazwa_pl: string;
  readonly podstawa_pl: string;
  readonly werdykt: WerdyktKryterium;
  readonly wymagane: string | null;
  readonly dostepne: string | null;
  readonly komentarz_pl: string | null;
}

export interface WynikDoboru {
  readonly kryteria: readonly KryteriumDoboru[];
  readonly dobor_potwierdzony: boolean;
  readonly liczba_niespelnionych: number;
  readonly liczba_bez_danych: number;
}

export interface GniazdoPrzekladnika {
  readonly catalog_ref: string | null;
  readonly nazwa: string | null;
  readonly wynik: WynikDoboru | null;
}

export interface DoborPrzekladnikow {
  readonly wejscia: {
    readonly napiecie_sieci_v: number | null;
    readonly prad_roboczy_a: number | null;
    readonly ik_ka: number | null;
    readonly ip_ka: number | null;
    readonly run_ref_zwarciowy: string | null;
  };
  readonly przekladnik_pradowy: GniazdoPrzekladnika;
  readonly przekladnik_napieciowy: GniazdoPrzekladnika;
}

export async function fetchDoborPrzekladnikow(
  projectId: string,
  caseId: string,
  generatorRef: string,
): Promise<DoborPrzekladnikow> {
  const endpoint =
    `/api/projects/${projectId}/cases/${caseId}/generators/`
    + `${encodeURIComponent(generatorRef)}/instrument-transformers`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać doboru przekładników (${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (!maObowiazkowyKsztalt(payload)) {
    // KSZTALT SPRAWDZANY, NIE ZAKLADANY — odpowiedz o innym kształcie wywracałaby
    // całą kartę gotowości, a nie tylko tę sekcję (precedens V12K-252).
    throw new Error('Odpowiedź doboru przekładników ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return payload;
}

function maObowiazkowyKsztalt(payload: unknown): payload is DoborPrzekladnikow {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const rekord = payload as Record<string, unknown>;
  return (
    typeof rekord.wejscia === 'object'
    && rekord.wejscia !== null
    && maKsztaltGniazda(rekord.przekladnik_pradowy)
    && maKsztaltGniazda(rekord.przekladnik_napieciowy)
  );
}

function maKsztaltGniazda(wartosc: unknown): boolean {
  if (typeof wartosc !== 'object' || wartosc === null) return false;
  const gniazdo = wartosc as Record<string, unknown>;
  if (!('catalog_ref' in gniazdo) || !('wynik' in gniazdo)) return false;
  if (gniazdo.wynik === null) return true;
  const wynik = gniazdo.wynik as Record<string, unknown>;
  return Array.isArray(wynik.kryteria) && typeof wynik.dobor_potwierdzony === 'boolean';
}

export function werdyktPl(werdykt: WerdyktKryterium): string {
  switch (werdykt) {
    case 'spelnione':
      return 'spełnione';
    case 'niespelnione':
      return 'niespełnione';
    case 'informacja':
      return 'do rozważenia';
    case 'brak_danych':
      return 'brak danej';
  }
}

/**
 * Zdanie podsumowujące dobór.
 *
 * NIGDY nie mówi „dobór potwierdzony", dopóki jakiekolwiek kryterium jest bez danych —
 * to ta sama zasada, która rządzi regułą: „nie wiem" nie awansuje na „spełnione".
 */
function podsumowaniePl(wynik: WynikDoboru): string {
  if (wynik.dobor_potwierdzony) return 'Wszystkie kryteria spełnione — dobór potwierdzony.';
  const czesci: string[] = [];
  if (wynik.liczba_niespelnionych > 0) {
    czesci.push(`${wynik.liczba_niespelnionych} kryteriów niespełnionych`);
  }
  if (wynik.liczba_bez_danych > 0) {
    czesci.push(`${wynik.liczba_bez_danych} kryteriów bez kompletu danych`);
  }
  return `Dobór niepotwierdzony: ${czesci.join(', ')}.`;
}

function klasaWerdyktu(werdykt: WerdyktKryterium): string {
  if (werdykt === 'niespelnione') return 'text-scada-alarm';
  if (werdykt === 'brak_danych') return 'text-scada-grounded';
  return 'text-scada-muted';
}

function Gniazdo({
  tytul,
  gniazdo,
  prefiks,
}: {
  readonly tytul: string;
  readonly gniazdo: GniazdoPrzekladnika;
  readonly prefiks: string;
}): JSX.Element {
  if (gniazdo.catalog_ref === null) {
    return (
      <article className="space-y-1" data-testid={`dobor-${prefiks}`}>
        <h4 className="text-sm text-scada-text">{tytul}</h4>
        <p className="text-xs text-scada-muted" data-testid={`dobor-${prefiks}-brak-wiazania`}>
          Przekładnik nie jest wybrany — wskaż typ z katalogu, żeby sprawdzić dobór.
        </p>
      </article>
    );
  }

  if (gniazdo.wynik === null) {
    return (
      <article className="space-y-1" data-testid={`dobor-${prefiks}`}>
        <h4 className="text-sm text-scada-text">{tytul}</h4>
        <p className="text-xs text-scada-grounded" data-testid={`dobor-${prefiks}-typ-nieznany`}>
          Typ {gniazdo.catalog_ref} nie występuje w katalogu — kryteriów nie da się sprawdzić.
        </p>
      </article>
    );
  }

  return (
    <article className="space-y-2" data-testid={`dobor-${prefiks}`}>
      <div>
        <h4 className="text-sm text-scada-text">{tytul}</h4>
        <p className="text-xs text-scada-muted">{gniazdo.nazwa ?? gniazdo.catalog_ref}</p>
        <p
          className={gniazdo.wynik.dobor_potwierdzony ? 'text-xs text-scada-muted' : 'text-xs text-scada-grounded'}
          data-testid={`dobor-${prefiks}-podsumowanie`}
        >
          {podsumowaniePl(gniazdo.wynik)}
        </p>
      </div>

      <ul className="space-y-2">
        {gniazdo.wynik.kryteria.map((kryterium) => (
          <li
            key={kryterium.kod}
            className="border-b border-scada-border/60 pb-2"
            data-testid={`kryterium-${kryterium.kod}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-scada-text">{kryterium.nazwa_pl}</span>
              <span
                className={`text-xs ${klasaWerdyktu(kryterium.werdykt)}`}
                data-testid={`kryterium-werdykt-${kryterium.kod}`}
              >
                {werdyktPl(kryterium.werdykt)}
              </span>
            </div>
            {(kryterium.wymagane !== null || kryterium.dostepne !== null) && (
              <p className="text-xs text-scada-muted" data-testid={`kryterium-rachunek-${kryterium.kod}`}>
                wymagane: {kryterium.wymagane ?? '—'} · dostępne: {kryterium.dostepne ?? '—'}
              </p>
            )}
            <p className="text-xs text-scada-muted">{kryterium.podstawa_pl}</p>
            {kryterium.komentarz_pl !== null && (
              <p className={`text-xs ${klasaWerdyktu(kryterium.werdykt)}`}>{kryterium.komentarz_pl}</p>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

export interface DoborPrzekladnikowSekcjaProps {
  readonly derId: string;
  readonly projectId: string | null;
  readonly caseId: string | null;
}

export function DoborPrzekladnikowSekcja({
  derId,
  projectId,
  caseId,
}: DoborPrzekladnikowSekcjaProps): JSX.Element {
  const [dane, setDane] = useState<DoborPrzekladnikow | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !caseId) return;
    let aktualne = true;
    void (async () => {
      try {
        const wynik = await fetchDoborPrzekladnikow(projectId, caseId, derId);
        if (aktualne) {
          setDane(wynik);
          setBlad(null);
        }
      } catch (error) {
        if (aktualne) {
          setDane(null);
          setBlad(
            error instanceof Error ? error.message : 'Nie udało się pobrać doboru przekładników.',
          );
        }
      }
    })();
    return () => {
      aktualne = false;
    };
  }, [caseId, derId, projectId]);

  if (!projectId || !caseId) {
    return (
      <section className="space-y-2" data-testid="dobor-przekladnikow-sekcja">
        <h3 className="text-sm font-semibold text-scada-text">Dobór przekładników</h3>
        <p className="text-xs text-scada-grounded" data-testid="dobor-brak-kontekstu">
          Wybierz projekt i przypadek obliczeniowy, żeby sprawdzić dobór.
        </p>
      </section>
    );
  }

  if (blad) {
    return (
      <section className="space-y-2" data-testid="dobor-przekladnikow-sekcja">
        <h3 className="text-sm font-semibold text-scada-text">Dobór przekładników</h3>
        <p className="text-xs text-scada-alarm" data-testid="dobor-blad">{blad}</p>
      </section>
    );
  }

  if (!dane) {
    return (
      <section className="space-y-2" data-testid="dobor-przekladnikow-sekcja">
        <h3 className="text-sm font-semibold text-scada-text">Dobór przekładników</h3>
        <p className="text-xs text-scada-muted">Pobieranie kryteriów doboru…</p>
      </section>
    );
  }

  const { wejscia } = dane;
  return (
    <section className="space-y-3" data-testid="dobor-przekladnikow-sekcja">
      <div>
        <h3 className="text-sm font-semibold text-scada-text">Dobór przekładników</h3>
        <p className="text-xs text-scada-muted">
          Każde kryterium z podstawą normową i rachunkiem: co wymaga tor, co daje typ.
        </p>
        <p className="text-xs text-scada-muted" data-testid="dobor-wejscia">
          {/* Prądy zwarciowe pochodzą z przebiegu; ich BRAK jest tu widoczny wprost,
              żeby projektant wiedział, dlaczego część kryteriów nie ma werdyktu. */}
          {[
            wejscia.napiecie_sieci_v !== null
              ? `napięcie sieci ${(wejscia.napiecie_sieci_v / 1000).toFixed(1)} kV`
              : 'napięcie sieci nieznane',
            wejscia.prad_roboczy_a !== null
              ? `prąd roboczy toru ${wejscia.prad_roboczy_a.toFixed(0)} A`
              : 'prąd roboczy toru nieznany',
            wejscia.ik_ka !== null
              ? `Ik″ ${wejscia.ik_ka.toFixed(2)} kA z obliczeń zwarciowych`
              : 'prądy zwarciowe: brak zakończonego przebiegu',
          ].join(' · ')}
        </p>
      </div>

      <Gniazdo
        tytul="Przekładnik prądowy"
        gniazdo={dane.przekladnik_pradowy}
        prefiks="przekladnik-pradowy"
      />
      <Gniazdo
        tytul="Przekładnik napięciowy"
        gniazdo={dane.przekladnik_napieciowy}
        prefiks="przekladnik-napieciowy"
      />
    </section>
  );
}
