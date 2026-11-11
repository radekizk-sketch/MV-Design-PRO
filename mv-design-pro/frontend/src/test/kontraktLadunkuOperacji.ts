/**
 * Klucze ładunku operacji domenowej spoza kontraktu — predykat dla testów kreatorów.
 *
 * Kontrakt (`harness-fixtures/generated/kontrakt_ladunkow_operacji.json`) generuje backend
 * z `klucze_kontraktu` i `KSZTALTY_ZAGNIEZDZONE` (`domain/canonical_operations.py`) — tymi
 * samymi danymi, którymi czujnik dyspozytora odróżnia klucz czytany przez handler od
 * przepadającego bez śladu. Klucz, którego nie czyta nikt, to kontrolka-widmo: projektant
 * coś wpisał, model tego nie dostał (tak przepadała nazwa stacji dokładanej na końcu ciągu).
 *
 * Algorytm jest lustrem `klucze_spoza_kontraktu` z backendu; `wektory` kontraktu (wynik
 * policzony przez backend) przypinają oba predykaty parami
 * (`src/test/__tests__/kontraktLadunkuOperacji.test.ts`).
 */
import kontrakt from '../harness-fixtures/generated/kontrakt_ladunkow_operacji.json';

export interface KsztaltObiektu {
  pola: string[];
  zagniezdzone: Record<string, KsztaltObiektu>;
}

export interface WektorKontraktu {
  operacja: string;
  ladunek: Record<string, unknown>;
  obce: string[];
}

const OPERACJE = kontrakt.operacje as unknown as Record<string, KsztaltObiektu>;
export const WEKTORY_KONTRAKTU = kontrakt.wektory as unknown as WektorKontraktu[];

function escapeRegExp(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Klucz należy do pól — wprost albo do rodziny `prefiks_{x}_sufiks`. */
function wKontrakcie(klucz: string, pola: readonly string[]): boolean {
  if (pola.includes(klucz)) return true;
  return pola.some((wzor) => {
    if (!wzor.includes('{')) return false;
    const wyrazenie = wzor
      .split(/(\{[^}]*\})/)
      .map((czesc) => (czesc.startsWith('{') ? '.+' : escapeRegExp(czesc)))
      .join('');
    return new RegExp(`^(?:${wyrazenie})$`).test(klucz);
  });
}

function czyObiekt(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc);
}

function obceWObiekcie(
  obiekt: unknown,
  ksztalt: KsztaltObiektu,
  sciezka: string,
  wynik: string[],
): void {
  let elementy: Array<[string, unknown]>;
  if (czyObiekt(obiekt)) elementy = [[sciezka, obiekt]];
  else if (Array.isArray(obiekt)) elementy = obiekt.map((e, i) => [`${sciezka}[${i}]`, e]);
  else return; // napis/liczba w miejscu obiektu rozstrzyga handler (odmowa typu)
  for (const [prefiks, element] of elementy) {
    if (!czyObiekt(element)) continue;
    for (const [klucz, wartosc] of Object.entries(element)) {
      if (!wKontrakcie(klucz, ksztalt.pola)) wynik.push(`${prefiks}.${klucz}`);
      else if (klucz in ksztalt.zagniezdzone) {
        obceWObiekcie(wartosc, ksztalt.zagniezdzone[klucz], `${prefiks}.${klucz}`, wynik);
      }
    }
  }
}

/**
 * Klucze ładunku spoza kontraktu operacji (ścieżki: `station.switchgear.x`, `sn_fields[1].x`),
 * posortowane. Nieznana operacja = wyjątek (nadawca wysyła operację, której nie ma).
 */
export function kluczeSpozaKontraktu(operacja: string, ladunek: Record<string, unknown>): string[] {
  const ksztalt = OPERACJE[operacja];
  if (!ksztalt) throw new Error(`Nieznana operacja domenowa: ${operacja}`);
  const wynik = Object.keys(ladunek).filter((k) => !wKontrakcie(k, ksztalt.pola));
  for (const [klucz, pod] of Object.entries(ksztalt.zagniezdzone)) {
    if (klucz in ladunek) obceWObiekcie(ladunek[klucz], pod, klucz, wynik);
  }
  return wynik.sort();
}

/** Nazwa jest operacją domenową kontraktu. */
export function czyOperacjaDomenowa(nazwa: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPERACJE, nazwa);
}
