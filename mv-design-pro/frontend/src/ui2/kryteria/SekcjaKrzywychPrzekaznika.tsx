/**
 * Readout krzywych koordynacji DOBRANEGO przekaźnika (karta KD-3, pozycja 9).
 *
 * OGNIWO ŁAŃCUCHA. Kanoniczny katalog MV odpowiada na pytanie „co wolno wstawić
 * do modelu", biblioteka analityczna — „jakie ten wyrób ma charakterystyki".
 * Do tej pory nic ich nie łączyło, więc od dobranego przekaźnika NIE DAŁO SIĘ
 * przejść do jego krzywych inaczej niż ręcznym szukaniem po nazwie. Ten readout
 * pokazuje je od razu przy wyborze — powiązanie idzie z DANYCH KATALOGU
 * (`analytical_library_ref`), a nie z dopasowania nazw w prezentacji.
 *
 * Brak odpowiednika = zdanie z kanonu gotowości, nigdy zgadnięte krzywe.
 */

import { useEffect, useState } from 'react';

import {
  komunikatyKodow,
  pobierzRejestrGotowosci,
  type WpisRejestruGotowosci,
} from './rejestrGotowosci';
import { KRYTERIA_STRINGS as T } from './strings';

export interface KrzywePrzekaznika {
  readonly device_type_id: string;
  readonly name_pl: string;
  readonly vendor: string | null;
  readonly analytical_library_ref: string | null;
  readonly functions_supported: readonly string[];
  readonly curves_supported: readonly string[];
  readonly readiness_codes: readonly string[];
  readonly model?: string;
}

/** Klient końcówki powiązania kanon ↔ biblioteka krzywych. */
export async function pobierzKrzywePrzekaznika(
  deviceTypeId: string,
  signal?: AbortSignal,
): Promise<KrzywePrzekaznika> {
  const odpowiedz = await fetch(
    `/api/catalog/mv-protection-device-types/${encodeURIComponent(deviceTypeId)}/curves`,
    { signal },
  );
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się pobrać charakterystyk przekaźnika (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (
    typeof dane !== 'object'
    || dane === null
    || !Array.isArray((dane as Record<string, unknown>).curves_supported)
  ) {
    throw new Error('Odpowiedź o charakterystykach ma nieoczekiwany kształt.');
  }
  return dane as KrzywePrzekaznika;
}

export interface SekcjaKrzywychPrzekaznikaProps {
  relayRef: string | null;
  testidSufiks: string;
  klient?: typeof pobierzKrzywePrzekaznika;
  klientRejestru?: typeof pobierzRejestrGotowosci;
}

export function SekcjaKrzywychPrzekaznika({
  relayRef,
  testidSufiks,
  klient = pobierzKrzywePrzekaznika,
  klientRejestru = pobierzRejestrGotowosci,
}: SekcjaKrzywychPrzekaznikaProps): JSX.Element | null {
  const [dane, setDane] = useState<KrzywePrzekaznika | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [rejestr, setRejestr] = useState<ReadonlyMap<string, WpisRejestruGotowosci> | null>(null);

  useEffect(() => {
    let aktywne = true;
    klientRejestru()
      .then((mapa) => {
        if (aktywne) setRejestr(mapa);
      })
      .catch(() => {
        if (aktywne) setRejestr(null);
      });
    return () => {
      aktywne = false;
    };
  }, [klientRejestru]);

  useEffect(() => {
    if (!relayRef) {
      setDane(null);
      return undefined;
    }
    let aktywne = true;
    klient(relayRef)
      .then((wynik) => {
        if (!aktywne) return;
        setDane(wynik);
        setBlad(null);
      })
      .catch(() => {
        if (!aktywne) return;
        setDane(null);
        setBlad(T.bladLiczenia);
      });
    return () => {
      aktywne = false;
    };
  }, [relayRef, klient]);

  if (!relayRef) return null;

  const braki = komunikatyKodow(dane?.readiness_codes ?? [], rejestr);

  return (
    <section className="mvd-kryteria" data-testid={`mvd-kryteria-krzywe-${testidSufiks}`}>
      <h4 className="mvd-kryteria__tytul">{T.krzyweTytul}</h4>
      <p className="mvd-kryteria__opis">{T.krzyweOpis}</p>
      {blad ? <p className="mvd-kryteria__uwaga">{blad}</p> : null}
      {dane ? (
        <>
          <div className="mvd-kryteria__wiersz">
            <span className="mvd-kryteria__etykieta">{T.krzyweFunkcje}</span>
            <span className="mvd-kryteria__wartosc">
              {dane.functions_supported.length > 0
                ? dane.functions_supported.join(' · ')
                : T.kreska}
            </span>
          </div>
          <div className="mvd-kryteria__wiersz">
            <span className="mvd-kryteria__etykieta">{T.krzyweLista}</span>
            <span className="mvd-kryteria__wartosc">
              {dane.curves_supported.length > 0 ? dane.curves_supported.join(' · ') : T.kreska}
            </span>
          </div>
          {braki.length > 0 ? (
            <ul className="mvd-kryteria__braki" data-testid={`mvd-kryteria-krzywe-braki-${testidSufiks}`}>
              {braki.map((tekst) => (
                <li key={tekst}>{tekst}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mvd-kryteria__opis">{T.ladowanie}</p>
      )}
    </section>
  );
}
