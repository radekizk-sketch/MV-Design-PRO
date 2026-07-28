/**
 * Zgodność przekładnika napięciowego z uziemieniem sieci — sekcja karty zabezpieczeń.
 *
 * CO ZASTĘPUJE (V12K-257). Karta zabezpieczeń trzymała WŁASNY katalog czterech
 * przekładników napięciowych (`VT_CATALOG` w `station-der/protection-catalogs.ts`)
 * i WŁASNĄ kopię reguły normowej (`isVtVoltageFactorValidForGrounding`). Skutki były
 * dwa i oba realne:
 *
 *  1. Identyfikatory z tego katalogu (`vt_20kv_dual` i trzy pokrewne) NIE ISTNIEJĄ
 *     w katalogu backendu, a select zapisywał je do modelu — więc dobór przekładnika
 *     (V12K-255) widział „typ nieznany katalogowi" i nie miał czego sprawdzić.
 *  2. Reguła w warstwie prezentacji była TRZECIĄ kopią wymagań IEC 61869-3 i miała
 *     te same zaniżone progi, które V12K-256 poprawił w backendzie (1,5 przy
 *     uziemieniu przez rezystor, 1,2 przy bezpośrednim). Ekran mówiłby „zgodne"
 *     tam, gdzie backend mówi „niezgodne".
 *
 * ZERO REGUŁY I ZERO KATALOGU W PREZENTACJI: typy pochodzą z `/api/catalog/vt-types`,
 * werdykt z `/api/v1/catalog/audit2/validate-vt-grounding`. Ten plik nic nie liczy
 * i niczego nie rozstrzyga — pokazuje odpowiedzi backendu i uczciwie nazywa braki.
 */

import { useEffect, useState } from 'react';

import { fetchVtTypes } from '../../../catalog/api';
import type { VTCatalogType } from '../../../catalog/types';
import { validateVtGroundingApi } from '../../station-der/audit2-api';

export type TypUziemieniaSn =
  | 'isolated'
  | 'petersen_coil'
  | 'resistor_grounded'
  | 'directly_grounded';

export interface PoleZPrzekladnikiem {
  readonly bayDesignation: string;
  readonly vtCatalogRef: string | null;
}

interface WierszWerdyktu {
  readonly bayDesignation: string;
  readonly nazwaTypu: string | null;
  readonly wspolczynnik: number | null;
  readonly ok: boolean | null;
  readonly komunikat: string;
}

export interface WalidacjaVtPolaSekcjaProps {
  readonly pola: readonly PoleZPrzekladnikiem[];
  readonly typUziemienia?: TypUziemieniaSn;
}

export function WalidacjaVtPolaSekcja({
  pola,
  typUziemienia,
}: WalidacjaVtPolaSekcjaProps): JSX.Element | null {
  const [wiersze, setWiersze] = useState<readonly WierszWerdyktu[] | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  const zPrzekladnikiem = pola.filter((pole) => pole.vtCatalogRef);
  const klucz = zPrzekladnikiem.map((p) => `${p.bayDesignation}:${p.vtCatalogRef}`).join('|');

  useEffect(() => {
    if (!typUziemienia || klucz === '') {
      setWiersze(null);
      return;
    }
    let aktualne = true;
    void (async () => {
      try {
        const typy: VTCatalogType[] = await fetchVtTypes();
        const wyniki = await Promise.all(
          zPrzekladnikiem.map(async (pole): Promise<WierszWerdyktu> => {
            const typ = typy.find((t) => t.id === pole.vtCatalogRef);
            if (!typ) {
              // TYP SPOZA KATALOGU BACKENDU — to nie jest „niezgodność", tylko brak
              // podstawy do jakiegokolwiek sprawdzenia. Dokładnie ten stan zostawiał
              // po sobie równoległy katalog frontu.
              return {
                bayDesignation: pole.bayDesignation,
                nazwaTypu: null,
                wspolczynnik: null,
                ok: null,
                komunikat:
                  `Typ ${pole.vtCatalogRef} nie występuje w katalogu — zgodności `
                  + 'ze sposobem uziemienia nie da się sprawdzić.',
              };
            }
            const fv = typ.rated_voltage_factor ?? null;
            if (fv === null) {
              return {
                bayDesignation: pole.bayDesignation,
                nazwaTypu: typ.name,
                wspolczynnik: null,
                ok: null,
                komunikat:
                  'Karta tego typu nie podaje współczynnika napięciowego — sprawdzenie '
                  + 'wymaga uzupełnienia danych producenta.',
              };
            }
            const odpowiedz = await validateVtGroundingApi({
              voltage_factor: fv,
              grounding_type: typUziemienia,
            });
            return {
              bayDesignation: pole.bayDesignation,
              nazwaTypu: typ.name,
              wspolczynnik: fv,
              ok: odpowiedz.ok,
              komunikat: odpowiedz.message_pl,
            };
          }),
        );
        if (aktualne) {
          setWiersze(wyniki);
          setBlad(null);
        }
      } catch (error) {
        if (aktualne) {
          setWiersze(null);
          setBlad(
            error instanceof Error
              ? error.message
              : 'Nie udało się sprawdzić zgodności przekładników napięciowych.',
          );
        }
      }
    })();
    return () => {
      aktualne = false;
    };
    // `klucz` opisuje komplet wejść (pole + typ) jako STRING — tablica obiektów
    // zmieniałaby tożsamość przy każdym renderze i zapętliła pobieranie.
  }, [klucz, typUziemienia]);

  if (!typUziemienia || klucz === '') return null;

  return (
    <div data-testid="vt-grounding-validation" className="space-y-1">
      <p className="text-xs font-semibold text-scada-text">
        Zgodność przekładnika napięciowego ze sposobem uziemienia sieci (IEC 61869-3)
      </p>
      {blad !== null && (
        <p className="text-xs text-scada-alarm" data-testid="vt-walidacja-blad">
          {blad}
        </p>
      )}
      {blad === null && wiersze === null && (
        <p className="text-xs text-scada-muted">Sprawdzanie zgodności…</p>
      )}
      {wiersze?.map((wiersz) => (
        <p
          key={wiersz.bayDesignation}
          data-testid={`vt-validation-${wiersz.bayDesignation}`}
          className={
            wiersz.ok === false
              ? 'text-xs text-scada-alarm'
              : wiersz.ok === null
                ? 'text-xs text-scada-grounded'
                : 'text-xs text-scada-muted'
          }
        >
          <span className="font-mono-eng">{wiersz.bayDesignation}</span>
          {' · '}
          {wiersz.nazwaTypu ?? 'typ spoza katalogu'}
          {wiersz.wspolczynnik !== null && ` · F_v = ${wiersz.wspolczynnik}`}
          {' — '}
          {wiersz.ok === true ? 'zgodny z siecią o tym sposobie uziemienia' : wiersz.komunikat}
        </p>
      ))}
    </div>
  );
}
