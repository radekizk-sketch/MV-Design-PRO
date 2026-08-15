/**
 * Wytrzymałość zwarciowa aparatury pola (I_dyn / I_th) — sekcja karty zabezpieczeń.
 *
 * CO ZASTĘPUJE (K7-B). Karta zabezpieczeń liczyła ten werdykt SAMA:
 * `validateDeviceWithstand` w `station-der/protection-catalogs.ts` skalowała
 * I_th do czasu wyłączenia (I_th_eff = I_th_zn · √(t_zn / t_wył)), wyznaczała
 * wykorzystanie obu kryteriów i sama układała zdanie „wytrzymała / BLOKER” —
 * na podstawie WŁASNEJ kopii katalogu aparatury. Były to liczby bezpieczeństwa,
 * których nie widział żaden solver i których nie obejmował żaden ślad WHITE BOX,
 * a przy tym druga, niezależna od backendu implementacja tej samej normy
 * (IEC 60909) — czyli dokładnie ten sam układ, który przy przekładnikach
 * napięciowych dał ekran mówiący „zgodne” tam, gdzie backend mówił „niezgodne”.
 *
 * ZERO FIZYKI I ZERO KATALOGU W PREZENTACJI: werdykt pochodzi z
 * `POST /api/v1/catalog/audit2/validate-device-withstand`, komunikat jest
 * tekstem backendu. Ten plik nic nie liczy — pokazuje odpowiedź i uczciwie
 * nazywa stany, w których odpowiedzi nie ma.
 */

import { useEffect, useState } from 'react';

import {
  fetchDeviceWithstandCatalog,
  validateDeviceWithstandApi,
  type DeviceWithstandValidationResponse,
} from '../../station-der/audit2-api';

/** Dane pola potrzebne do sprawdzenia wytrzymałości (z konfiguracji stacji). */
export interface PoleZAparatura {
  readonly bayDesignation: string;
  readonly deviceCatalogRef: string;
  readonly i_peak_calculated_ka: number;
  readonly i_thermal_calculated_ka: number;
  readonly t_clearing_s: number;
}

interface WierszWerdyktu {
  readonly bayDesignation: string;
  /**
   * `null` = APARAT SPOZA KATALOGU. To nie jest „nie wytrzymuje", tylko brak
   * podstawy do jakiegokolwiek sprawdzenia — trzeci stan MUSI być odróżnialny,
   * inaczej pole z referencją donikąd wyglądałoby jak pole niezgodne
   * (rozstrzygnięcie przeniesione z sekcji przekładników napięciowych, V12K-257).
   */
  readonly odpowiedz: DeviceWithstandValidationResponse | null;
  readonly komunikat: string;
}

export interface WalidacjaWytrzymalosciAparaturySekcjaProps {
  readonly pola: readonly PoleZAparatura[];
}

export function WalidacjaWytrzymalosciAparaturySekcja({
  pola,
}: WalidacjaWytrzymalosciAparaturySekcjaProps): JSX.Element | null {
  const [wiersze, setWiersze] = useState<readonly WierszWerdyktu[] | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  // `klucz` opisuje komplet wejść jako STRING — tablica obiektów zmieniałaby
  // tożsamość przy każdym renderze i zapętliła pobieranie (wzorzec z sekcji
  // zgodności przekładnika napięciowego).
  const klucz = pola
    .map(
      (p) =>
        `${p.bayDesignation}:${p.deviceCatalogRef}:${p.i_peak_calculated_ka}:`
        + `${p.i_thermal_calculated_ka}:${p.t_clearing_s}`,
    )
    .join('|');

  useEffect(() => {
    if (klucz === '') {
      setWiersze(null);
      setBlad(null);
      return;
    }
    let aktualne = true;
    void (async () => {
      try {
        const katalog = await fetchDeviceWithstandCatalog();
        const wyniki = await Promise.all(
          pola.map(async (pole): Promise<WierszWerdyktu> => {
            if (!katalog.some((aparat) => aparat.id === pole.deviceCatalogRef)) {
              // APARAT SPOZA KATALOGU BACKENDU — brak podstawy do sprawdzenia,
              // a nie werdykt negatywny.
              return {
                bayDesignation: pole.bayDesignation,
                odpowiedz: null,
                komunikat:
                  `Aparat ${pole.deviceCatalogRef} nie występuje w katalogu — `
                  + 'wytrzymałości zwarciowej nie da się sprawdzić.',
              };
            }
            const odpowiedz = await validateDeviceWithstandApi({
              device_id: pole.deviceCatalogRef,
              i_peak_calculated_ka: pole.i_peak_calculated_ka,
              i_thermal_calculated_ka: pole.i_thermal_calculated_ka,
              t_clearing_s: pole.t_clearing_s,
            });
            return {
              bayDesignation: pole.bayDesignation,
              odpowiedz,
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
              : 'Nie udało się sprawdzić wytrzymałości zwarciowej aparatury.',
          );
        }
      }
    })();
    return () => {
      aktualne = false;
    };
  }, [klucz]);

  if (klucz === '') return null;

  return (
    <div data-testid="device-withstand-validation" className="space-y-1">
      <div className="text-[10px] font-medium text-scada-muted">
        Wytrzymałość zwarciowa aparatury (I_dyn, I_th) — IEC 60909
      </div>
      {blad !== null && (
        <p
          className="text-[11px] text-scada-alarm"
          data-testid="device-withstand-blad"
        >
          {blad} Werdykt pochodzi z backendu — bez odpowiedzi nie ma podstawy do oceny.
        </p>
      )}
      {blad === null && wiersze === null && (
        <p className="text-[11px] text-scada-muted" data-testid="device-withstand-oczekiwanie">
          Sprawdzanie wytrzymałości…
        </p>
      )}
      <div className="grid grid-cols-1 gap-1">
        {wiersze?.map((wiersz) => (
          <div
            key={wiersz.bayDesignation}
            data-testid={`withstand-${wiersz.bayDesignation}`}
            // Znacznik maszynowy werdyktu: `true` / `false` / `nieustalone`.
            data-withstand-ok={
              wiersz.odpowiedz === null ? 'nieustalone' : String(wiersz.odpowiedz.ok)
            }
            className={
              'rounded border px-2 py-1 text-[11px] '
              + (wiersz.odpowiedz === null
                ? 'border-scada-border bg-scada-panel/40 text-scada-muted'
                : wiersz.odpowiedz.ok
                  ? 'border-sygnal-ok bg-sygnal-ok-tlo text-sygnal-ok-tusz'
                  : 'border-sygnal-blokada bg-sygnal-blokada-tlo text-sygnal-blokada-tusz')
            }
          >
            <span className="font-mono">{wiersz.bayDesignation}</span>
            {': '}
            {wiersz.komunikat}
          </div>
        ))}
      </div>
    </div>
  );
}
