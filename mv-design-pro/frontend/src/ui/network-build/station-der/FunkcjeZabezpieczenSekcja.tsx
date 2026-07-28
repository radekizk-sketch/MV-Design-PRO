/**
 * Sekcja „Funkcje zabezpieczeniowe" na ekranie wytwórcy (karta E21-3, audyt E-21 P7/P8).
 *
 * CO ZASTĘPUJE. Do V12K-245 ekran pokazywał JEDEN wiersz: „Funkcje ANSI wymagane:
 * 50, 51, 50N, 51N, 67, 67N, 27, 59, 81U, 81O, 50G, 51G, 78" — stałą listę sklejoną
 * z katalogu po fladze `required_for_der`, identyczną dla KAŻDEJ instalacji PV w kraju.
 * Właściciel nazwał to wprost: „samo wyświetlenie kodów nie stanowi projektu
 * zabezpieczeń". Lista została usunięta, a tu wchodzi to, co ją zastępuje: zestaw
 * WYPROWADZONY z faktów o obiekcie, z uzasadnieniem każdej pozycji.
 *
 * ZERO REGUŁY W PREZENTACJI. Ten komponent nic nie dobiera i nic nie ocenia — pobiera
 * wynik reguły domenowej (`domain/der_protection_functions.py`) i go pokazuje. Rodziny
 * 50N/51N i 50G/51G wykluczają się na podstawie toru pomiaru prądu zerowego, 67N wymaga
 * toru napięcia zerowego, wymagania OSD nie są wyprowadzane — to wszystko rozstrzyga
 * backend, nie ten plik.
 */

import { useEffect, useState } from 'react';

export interface FunkcjaWymagana {
  readonly kod: string;
  readonly nazwa_pl: string;
  readonly podstawa_pl: string;
  readonly chroniony_obiekt_pl: string;
  readonly zrodlo_pomiaru_pl: string;
}

export interface KwestiaOtwarta {
  readonly kod: string;
  readonly opis_pl: string;
  readonly skutek_pl: string;
}

export interface OcenaUrzadzenia {
  readonly protection_catalog_ref: string | null;
  readonly nazwa: string | null;
  readonly brakujace_funkcje: readonly string[];
  readonly ostrzezenia_przeznaczenia: readonly string[];
  readonly pokrywa_wymagania: boolean;
}

export interface DoborFunkcji {
  readonly fakty: {
    readonly neutral_grounding_mode: string;
    readonly zero_sequence_current_source: string;
    readonly zero_sequence_voltage_source: string;
  };
  readonly dobor: {
    readonly wymagane: readonly FunkcjaWymagana[];
    readonly kwestie_otwarte: readonly KwestiaOtwarta[];
  };
  readonly urzadzenie: OcenaUrzadzenia;
}

export async function fetchDoborFunkcji(
  projectId: string,
  caseId: string,
  generatorRef: string,
): Promise<DoborFunkcji> {
  const endpoint =
    `/api/projects/${projectId}/cases/${caseId}/generators/`
    + `${encodeURIComponent(generatorRef)}/protection-functions`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać doboru funkcji zabezpieczeniowych (${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (!maObowiazkowyKsztalt(payload)) {
    // KSZTALT SPRAWDZANY, NIE ZAKLADANY. Bez tej kontroli odpowiedz o innym kształcie
    // (starsza wersja API, atrapa w tescie, blad proxy) wywracala CALA karte gotowosci
    // — a nie tylko te sekcje. Zamiast wyjatku w renderze projektant dostaje nazwany
    // powod, reszta karty dziala.
    throw new Error(
      'Odpowiedź doboru funkcji ma nieoczekiwany kształt — sprawdź wersję API.',
    );
  }
  return payload;
}

function maObowiazkowyKsztalt(payload: unknown): payload is DoborFunkcji {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const rekord = payload as Record<string, unknown>;
  const dobor = rekord.dobor as Record<string, unknown> | undefined;
  const urzadzenie = rekord.urzadzenie as Record<string, unknown> | undefined;
  return (
    typeof rekord.fakty === 'object'
    && rekord.fakty !== null
    && typeof dobor === 'object'
    && dobor !== null
    && Array.isArray(dobor.wymagane)
    && Array.isArray(dobor.kwestie_otwarte)
    && typeof urzadzenie === 'object'
    && urzadzenie !== null
    && Array.isArray(urzadzenie.brakujace_funkcje)
    && Array.isArray(urzadzenie.ostrzezenia_przeznaczenia)
  );
}

/** Opis toru pomiarowego po polsku — ta sama treść, którą rozstrzyga reguła. */
function torPomiaruPl(fakty: DoborFunkcji['fakty']): string {
  const uziemienie: Record<string, string> = {
    izolowany: 'sieć izolowana',
    cewka_petersena: 'sieć kompensowana (cewka Petersena)',
    rezystor: 'sieć uziemiona przez rezystor',
    bezposrednio_uziemiony: 'sieć bezpośrednio uziemiona',
    nieznany: 'punkt neutralny nieokreślony w modelu',
  };
  const prad: Record<string, string> = {
    suma_ct: 'prąd zerowy z sumy prądów fazowych',
    przekladnik_ferrantiego: 'prąd zerowy z przekładnika ziemnozwarciowego',
    zewnetrzne: 'prąd zerowy ze źródła zewnętrznego',
    brak: 'brak toru prądu zerowego',
  };
  const napiecie: Record<string, string> = {
    otwarty_trojkat_vt: 'napięcie zerowe z otwartego trójkąta',
    uzwojenie_resztkowe_vt: 'napięcie zerowe z uzwojenia resztkowego',
    obliczone: 'napięcie zerowe wyznaczone obliczeniowo',
    brak: 'brak toru napięcia zerowego',
  };
  return [
    uziemienie[fakty.neutral_grounding_mode] ?? fakty.neutral_grounding_mode,
    prad[fakty.zero_sequence_current_source] ?? fakty.zero_sequence_current_source,
    napiecie[fakty.zero_sequence_voltage_source] ?? fakty.zero_sequence_voltage_source,
  ].join(' · ');
}

export interface FunkcjeZabezpieczenSekcjaProps {
  readonly derId: string;
  readonly projectId: string | null;
  readonly caseId: string | null;
}

export function FunkcjeZabezpieczenSekcja({
  derId,
  projectId,
  caseId,
}: FunkcjeZabezpieczenSekcjaProps): JSX.Element {
  const [dane, setDane] = useState<DoborFunkcji | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !caseId) return;
    let aktualne = true;
    void (async () => {
      try {
        const wynik = await fetchDoborFunkcji(projectId, caseId, derId);
        if (aktualne) {
          setDane(wynik);
          setBlad(null);
        }
      } catch (error) {
        if (aktualne) {
          setDane(null);
          setBlad(error instanceof Error ? error.message : 'Nie udało się pobrać doboru funkcji.');
        }
      }
    })();
    return () => {
      aktualne = false;
    };
  }, [caseId, derId, projectId]);

  if (!projectId || !caseId) {
    return (
      <section className="space-y-2" data-testid="funkcje-zabezpieczen-sekcja">
        <h3 className="text-sm font-semibold text-scada-text">Funkcje zabezpieczeniowe</h3>
        <p className="text-xs text-scada-grounded" data-testid="funkcje-brak-kontekstu">
          Wybierz projekt i przypadek obliczeniowy, żeby pokazać dobór funkcji.
        </p>
      </section>
    );
  }

  if (blad) {
    return (
      <section className="space-y-2" data-testid="funkcje-zabezpieczen-sekcja">
        <h3 className="text-sm font-semibold text-scada-text">Funkcje zabezpieczeniowe</h3>
        <p className="text-xs text-scada-alarm" data-testid="funkcje-blad">{blad}</p>
      </section>
    );
  }

  if (!dane) {
    return (
      <section className="space-y-2" data-testid="funkcje-zabezpieczen-sekcja">
        <h3 className="text-sm font-semibold text-scada-text">Funkcje zabezpieczeniowe</h3>
        <p className="text-xs text-scada-muted">Pobieranie doboru z modelu…</p>
      </section>
    );
  }

  const { dobor, urzadzenie, fakty } = dane;

  return (
    <section className="space-y-3" data-testid="funkcje-zabezpieczen-sekcja">
      <div>
        <h3 className="text-sm font-semibold text-scada-text">Funkcje zabezpieczeniowe</h3>
        <p className="text-xs text-scada-muted">
          Zestaw wyprowadzony z faktów o polu, nie z listy uniwersalnej.
        </p>
        <p className="text-xs text-scada-muted" data-testid="funkcje-tor-pomiaru">
          {torPomiaruPl(fakty)}
        </p>
      </div>

      <ul className="space-y-2">
        {dobor.wymagane.map((funkcja) => {
          const brakuje = urzadzenie.brakujace_funkcje.includes(funkcja.kod);
          return (
            <li
              key={funkcja.kod}
              className="border-b border-scada-border/60 pb-2"
              data-testid={`funkcja-${funkcja.kod}`}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono-eng text-sm text-scada-sn">{funkcja.kod}</span>
                <span className="text-sm text-scada-text">{funkcja.nazwa_pl}</span>
                {brakuje && (
                  <span
                    className="text-xs text-scada-alarm"
                    data-testid={`funkcja-brak-w-urzadzeniu-${funkcja.kod}`}
                  >
                    wybrane urządzenie tej funkcji nie realizuje
                  </span>
                )}
              </div>
              <p className="text-xs text-scada-muted">{funkcja.podstawa_pl}</p>
              <p className="text-xs text-scada-muted">
                Chroniony obiekt: {funkcja.chroniony_obiekt_pl} · Pomiar:{' '}
                {funkcja.zrodlo_pomiaru_pl}
              </p>
            </li>
          );
        })}
      </ul>

      {urzadzenie.ostrzezenia_przeznaczenia.length > 0 && (
        <div
          className="rounded border border-scada-grounded/60 bg-scada-surface/40 p-2"
          data-testid="funkcje-ostrzezenie-przeznaczenia"
        >
          <p className="text-xs font-semibold text-scada-grounded">Przeznaczenie urządzenia</p>
          {urzadzenie.ostrzezenia_przeznaczenia.map((tekst) => (
            <p key={tekst} className="text-xs text-scada-muted">{tekst}</p>
          ))}
        </div>
      )}

      {dobor.kwestie_otwarte.length > 0 && (
        <div
          className="rounded border border-scada-border/60 bg-scada-surface/40 p-2"
          data-testid="funkcje-kwestie-otwarte"
        >
          <p className="text-xs font-semibold text-scada-text">
            Do rozstrzygnięcia przed projektem nastaw
          </p>
          <ul className="mt-1 space-y-1">
            {dobor.kwestie_otwarte.map((kwestia) => (
              <li key={kwestia.kod} className="text-xs text-scada-muted">
                {kwestia.opis_pl} <span className="block">{kwestia.skutek_pl}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
