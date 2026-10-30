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
 * ocena z `/api/v1/catalog/audit2/validate-vt-grounding` — rekord K werdyktu wyjaśnialnego,
 * pokazany etykietą rekordu (`EtykietaWerdyktu`) i jego zdaniem (karta WERDYKT-MIGRACJA-190:
 * dawna flaga `ok` i własne „zgodny z siecią…” usunięte). Karta typu bez współczynnika też
 * idzie do backendu i wraca jako rekord „ocena niewykonana” z nazwanym brakiem. Bez rekordu
 * zostają wyłącznie braki, których nie ma czego oceniać (typ spoza katalogu, sposób
 * uziemienia nieustalony w modelu) — nazwane wprost jako brak danych, nigdy jako status.
 *
 * SPOSÓB UZIEMIENIA Z MODELU (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA). Typ punktu
 * neutralnego sieci SN pola nie pochodzi już z wyboru w konfiguratorze (katalog
 * „wariantów uziemienia” audytu 2 był drugą prawdą obok modelu), tylko z backendu:
 * `fetchUziemienieSnStacji` czyta zespół uziemiający sekcji pola (`enm.uziemienie_sekcji`)
 * tą samą regułą co dowód zgodności przekładników w pakiecie dowodów. Pole bez
 * ustalonego typu dostaje nazwaną przyczynę backendu — nigdy domysł.
 */

import { useEffect, useState } from 'react';

import { fetchVtTypes } from '../../../catalog/api';
import { fetchUziemienieSnStacji, validateVtGroundingApi } from '../../station-der/audit2-api';
import { EtykietaWerdyktu } from '../../../../ui2/wyniki/wzorzec/KartaWerdyktu';
import type { OcenaKryterium } from '../../../../ui2/wyniki/wzorzec/werdykt';

/** Stacja projektu, której model niesie uziemienie sieci SN pól. */
export interface KontekstUziemieniaStacji {
  readonly projectId: string;
  readonly stationId: string;
  /** Rewizja modelu — zmiana modelu (np. nowy zespół uziemiający) = nowe sprawdzenie. */
  readonly rewizja: number | null;
}

export interface PoleZPrzekladnikiem {
  readonly bayDesignation: string;
  readonly vtCatalogRef: string | null;
}

interface WierszWerdyktu {
  readonly bayDesignation: string;
  readonly nazwaTypu: string | null;
  readonly wspolczynnik: number | null;
  /** Rekord K z backendu; `null` — brak danych, którego nie ma czego oceniać. */
  readonly ocena: OcenaKryterium | null;
  readonly komunikat: string;
}

export interface WalidacjaVtPolaSekcjaProps {
  readonly pola: readonly PoleZPrzekladnikiem[];
  /** `null` — brak aktywnego projektu albo stacji (uziemienia nie ma skąd odczytać). */
  readonly kontekst: KontekstUziemieniaStacji | null;
}

export function WalidacjaVtPolaSekcja({
  pola,
  kontekst,
}: WalidacjaVtPolaSekcjaProps): JSX.Element | null {
  const [wiersze, setWiersze] = useState<readonly WierszWerdyktu[] | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  const zPrzekladnikiem = pola.filter((pole) => pole.vtCatalogRef);
  const klucz = zPrzekladnikiem.map((p) => `${p.bayDesignation}:${p.vtCatalogRef}`).join('|');

  const projectId = kontekst?.projectId ?? null;
  const stationId = kontekst?.stationId ?? null;
  const rewizja = kontekst?.rewizja ?? null;

  useEffect(() => {
    if (projectId === null || stationId === null || klucz === '') {
      setWiersze(null);
      return;
    }
    let aktualne = true;
    void (async () => {
      try {
        const [typy, uziemienie] = await Promise.all([
          fetchVtTypes(),
          fetchUziemienieSnStacji({
            projectId,
            stationId,
            pola: zPrzekladnikiem.map((pole) => pole.bayDesignation),
          }),
        ]);
        const wyniki = await Promise.all(
          zPrzekladnikiem.map(async (pole): Promise<WierszWerdyktu> => {
            const uziemieniePola = uziemienie.pola.find(
              (wpis) => wpis.oznaczenie === pole.bayDesignation,
            );
            const typUziemienia = uziemieniePola?.typ_punktu_neutralnego ?? null;
            if (typUziemienia === null) {
              // Sposób uziemienia sieci SN pola nieustalony w modelu — brak podstawy
              // sprawdzenia (nie „niezgodność”); przyczynę nazywa backend.
              return {
                bayDesignation: pole.bayDesignation,
                nazwaTypu: null,
                wspolczynnik: null,
                ocena: null,
                komunikat:
                  uziemieniePola?.przyczyna_braku
                  ?? 'Sposobu uziemienia punktu neutralnego sieci SN pola nie ustalono.',
              };
            }
            const typ = typy.find((t) => t.id === pole.vtCatalogRef);
            if (!typ) {
              // TYP SPOZA KATALOGU BACKENDU — to nie jest „niezgodność", tylko brak
              // podstawy do jakiegokolwiek sprawdzenia. Dokładnie ten stan zostawiał
              // po sobie równoległy katalog frontu.
              return {
                bayDesignation: pole.bayDesignation,
                nazwaTypu: null,
                wspolczynnik: null,
                ocena: null,
                komunikat:
                  `Typ ${pole.vtCatalogRef} nie występuje w katalogu — zgodności `
                  + 'ze sposobem uziemienia nie da się sprawdzić.',
              };
            }
            const fv = typ.rated_voltage_factor ?? null;
            const odpowiedz = await validateVtGroundingApi({
              voltage_factor: fv,
              grounding_type: typUziemienia,
            });
            return {
              bayDesignation: pole.bayDesignation,
              nazwaTypu: typ.name,
              wspolczynnik: fv,
              ocena: odpowiedz.ocena,
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
  }, [klucz, projectId, stationId, rewizja]);

  if (klucz === '') return null;

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
      {(projectId === null || stationId === null) && (
        <p className="text-xs text-scada-grounded" data-testid="vt-walidacja-bez-projektu">
          Sposób uziemienia sieci SN czytany jest z modelu projektu — wybierz aktywny projekt
          i stację, aby sprawdzić zgodność przekładników.
        </p>
      )}
      {projectId !== null && stationId !== null && blad === null && wiersze === null && (
        <p className="text-xs text-scada-muted">Sprawdzanie zgodności…</p>
      )}
      {wiersze?.map((wiersz) => (
        <p
          key={wiersz.bayDesignation}
          data-testid={`vt-validation-${wiersz.bayDesignation}`}
          // Status maszynowy rekordu K albo `brak-danych` — trzeci stan MUSI być odróżnialny,
          // inaczej brak podstawy wyglądałby jak zgodność.
          data-status={wiersz.ocena?.status_maszynowy ?? 'brak-danych'}
          className="text-xs text-scada-muted"
        >
          <span className="font-mono-eng">{wiersz.bayDesignation}</span>
          {' · '}
          {wiersz.nazwaTypu ?? 'typ spoza katalogu'}
          {wiersz.wspolczynnik !== null && ` · F_v = ${wiersz.wspolczynnik}`}
          {' '}
          {wiersz.ocena !== null ? (
            <EtykietaWerdyktu
              etykieta={wiersz.ocena.etykieta}
              status={wiersz.ocena.status_maszynowy}
              testid={`vt-validation-etykieta-${wiersz.bayDesignation}`}
              zwarta
            />
          ) : (
            <span className="text-scada-grounded">brak danych</span>
          )}
          {' — '}
          {wiersz.komunikat}
        </p>
      ))}
    </div>
  );
}
