/**
 * KARTA WYPOSAŻENIA POLA — skład katalogowego pola SN w kroku „Pola
 * rozdzielnicy SN" (etap S3, kanon `KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §3).
 *
 * PO CO. Pole SN jest KOMPLETNĄ JEDNOSTKĄ FUNKCJONALNĄ rodziny, a nie „rolą plus
 * jeden aparat". Karta pokazuje to, co realnie wchodzi w skład pola wg karty
 * katalogowej producenta: aparaty w kolejności montażowej, z oznaczeniami
 * operatorskimi (Q1, Q9…) i ze statusem wyposażenia.
 *
 * DWA STATUSY, DWA ZACHOWANIA (kontrakt `BayDeviceInstanceTemplate`):
 *  · `FABRYCZNY` — znacznik STAŁY: aparat wchodzi z kartą wyrobu, projektant go
 *    nie wybiera i nie usuwa,
 *  · `OPCJA` — dopuszczalne doposażenie; STEROWALNE dokładnie wtedy, gdy operacja
 *    budowy stacji ma dla tego rodzaju aparatu pole payloadu
 *    (`equipment.ct|vt|relay`). Wtedy kontrolką jest picker pozycji katalogowej:
 *    wskazanie = doposażenie powstaje razem ze stacją, wyczyszczenie = nie
 *    powstaje. Rodzaj bez pola w operacji NIE dostaje kontrolki — przełącznik
 *    bez skutku w modelu jest zakazany (phantom rule), więc mówimy wprost, że
 *    kreator tego nie zapisuje.
 *
 * Aparat spoza listy pola jest NIEDOPUSZCZALNY — to brak wpisu, nie status,
 * więc karta nie ma trzeciego stanu do pokazania.
 *
 * WYŁĄCZNIE PREZENTACJA: zero fizyki, zero werdyktu, zero doboru. Parametry
 * pozycji katalogowej materializuje backend.
 */

import { PoleKatalogu } from '../rama';
import type { CTCatalogType, ProtectionDeviceType, VTCatalogType } from '../../../ui/catalog/types';
import type { KluczWyposazenia, PozycjaWyposazenia } from './konfiguratorRozdzielnicy';
import type { WyposazeniePolaWpis } from './stacjaModel';
import { STACJA_STRINGS as T } from './strings';

/**
 * Klucz wyposażenia → pole wpisu wyposażenia pola. JEDNO odwzorowanie dla całej
 * karty; komplet kluczy jest przypięty testem wobec
 * `KLUCZ_WYPOSAZENIA_Z_APARATU` i wobec bloków budowanych przez
 * `zbudujWyposazeniePolaDoPayloadu`, żeby dołożenie czwartego rodzaju
 * doposażenia w jednym miejscu nie przeszło po cichu w drugim.
 */
export const POLE_WPISU_WYPOSAZENIA: Readonly<
  Record<KluczWyposazenia, keyof Pick<WyposazeniePolaWpis, 'ct_catalog_ref' | 'vt_catalog_ref' | 'relay_catalog_ref'>>
> = {
  ct: 'ct_catalog_ref',
  vt: 'vt_catalog_ref',
  relay: 'relay_catalog_ref',
};

/**
 * Wyposażenie, które przyjmuje OPERACJA BUDOWY STACJI (`sn_fields[].equipment`).
 * Karta pyta o ten zbiór, zamiast zakładać, że każdy ekran umie zapisać każde
 * doposażenie: operacja dokładania pojedynczego pola (`add_sn_bay`) nie ma pola
 * `equipment` w kontrakcie, więc na tamtym ekranie kontrolka byłaby przełącznikiem
 * bez skutku w modelu. Jeden zbiór na ekran, jawnie przekazany — nigdy domyślny.
 */
export const KLUCZE_OPERACJI_STACYJNEJ: ReadonlySet<KluczWyposazenia> = new Set(
  Object.keys(POLE_WPISU_WYPOSAZENIA) as KluczWyposazenia[],
);

/** Ekran bez pola wyposażenia w kontrakcie operacji — same readouty statusów. */
export const BEZ_DOPOSAZENIA: ReadonlySet<KluczWyposazenia> = new Set();

export interface KartaWyposazeniaPolaProps {
  /** Skład pola z karty katalogowej rodziny (kolejność montażowa). */
  readonly pozycje: readonly PozycjaWyposazenia[];
  /** Czy pole ma w ogóle wskazany szablon katalogowy (inaczej: nie ma czego składać). */
  readonly szablonWskazany: boolean;
  /** Doposażenie, które przyjmuje operacja TEGO ekranu (patrz stałe wyżej). */
  readonly kluczeOperacji: ReadonlySet<KluczWyposazenia>;
  readonly wyposazenie?: WyposazeniePolaWpis;
  readonly ctTypy?: readonly CTCatalogType[];
  readonly vtTypy?: readonly VTCatalogType[];
  readonly przekazniki?: readonly ProtectionDeviceType[];
  readonly onZmianaWyposazenia?: (zmiana: Partial<WyposazeniePolaWpis>) => void;
  readonly testid: string;
}

/** Opcje pickera doposażenia — pozycje katalogu właściwego dla rodzaju aparatu. */
function opcjeDoposazenia(
  klucz: KluczWyposazenia,
  ctTypy: readonly CTCatalogType[],
  vtTypy: readonly VTCatalogType[],
  przekazniki: readonly ProtectionDeviceType[],
): { id: string; etykieta: string }[] {
  if (klucz === 'ct') {
    return ctTypy.map((t) => ({ id: t.id, etykieta: t.name }));
  }
  if (klucz === 'vt') {
    return vtTypy.map((t) => ({ id: t.id, etykieta: t.name }));
  }
  return przekazniki.map((t) => ({ id: t.id, etykieta: t.name }));
}

export function KartaWyposazeniaPola({
  pozycje,
  szablonWskazany,
  kluczeOperacji,
  wyposazenie,
  ctTypy = [],
  vtTypy = [],
  przekazniki = [],
  onZmianaWyposazenia,
  testid,
}: KartaWyposazeniaPolaProps) {
  if (!szablonWskazany) {
    return (
      <div className="mvd-kreator-info" data-testid={`${testid}-brak-pola`}>
        {T.wyposazenieBrakPola}
      </div>
    );
  }

  if (pozycje.length === 0) {
    return (
      <div className="mvd-kreator-info" data-testid={`${testid}-puste`}>
        {T.wyposazeniePuste}
      </div>
    );
  }

  return (
    <div data-testid={testid}>
      <div className="mvd-pole-etykieta">{T.wyposazenieTytul}</div>
      <ul className="mvd-kreator-lista-wyposazenia">
        {pozycje.map((pozycja) => {
          const klucz = pozycja.kluczWyposazenia;
          // Kontrolka powstaje TYLKO gdy: aparat jest opcją karty katalogowej,
          // ma odpowiednik w wyposażeniu pola I operacja tego ekranu to
          // wyposażenie przyjmuje. Każdy z trzech warunków jest konieczny —
          // odpuszczenie któregokolwiek daje przełącznik bez skutku w modelu.
          const sterowalna =
            pozycja.status === 'OPCJA' && klucz !== null && kluczeOperacji.has(klucz);
          const wybrana =
            klucz !== null ? (wyposazenie?.[POLE_WPISU_WYPOSAZENIA[klucz]] ?? null) : null;
          return (
            <li key={pozycja.ref} data-testid={`${testid}-pozycja-${pozycja.ref}`}>
              <span className="mvd-kreator-oznaczenie">{pozycja.oznaczenie}</span>
              <span className="mvd-kreator-nazwa-aparatu">{pozycja.nazwa}</span>
              {pozycja.status === 'FABRYCZNY' ? (
                <span
                  className="mvd-kreator-status mvd-kreator-status--fabryczny"
                  title={T.statusFabrycznyPomoc}
                  data-testid={`${testid}-status-${pozycja.ref}`}
                >
                  {T.statusFabryczny}
                </span>
              ) : (
                <span
                  className="mvd-kreator-status mvd-kreator-status--opcja"
                  data-testid={`${testid}-status-${pozycja.ref}`}
                >
                  {`${T.statusOpcja} · ${wybrana ? T.opcjaWybrana : T.opcjaNiewybrana}`}
                </span>
              )}
              {sterowalna && klucz !== null ? (
                <PoleKatalogu
                  etykieta={pozycja.nazwa}
                  wartosc={wybrana}
                  onZmiana={(id) =>
                    onZmianaWyposazenia?.({
                      [POLE_WPISU_WYPOSAZENIA[klucz]]: id,
                    } as Partial<WyposazeniePolaWpis>)
                  }
                  opcje={opcjeDoposazenia(klucz, ctTypy, vtTypy, przekazniki)}
                  status="ready"
                  placeholder={T.opcjaNiewybrana}
                  pomoc={T.opcjaPomoc}
                  testid={`${testid}-opcja-${pozycja.ref}`}
                />
              ) : null}
              {pozycja.status === 'OPCJA' && !sterowalna ? (
                <span
                  className="mvd-kreator-podpowiedz"
                  data-testid={`${testid}-bez-dostawcy-${pozycja.ref}`}
                >
                  {T.opcjaBezDostawcy}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
