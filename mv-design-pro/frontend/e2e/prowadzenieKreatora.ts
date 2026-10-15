/**
 * Zapis kreatora ścieżką PROWADZENIA PROJEKTANTA (karta PROWADZENIE-KREATORY, 2026-10-15).
 *
 * Kreator nie wyszarza zapisu brakiem danych: klik „Zapisz” przy braku daje JEDNO
 * wskazanie „co — po co” (`mvd-kreator-wskazanie`), przestawia krok i przenosi fokus na
 * wskazaną kontrolkę. Ten pomocnik przechodzi DOKŁADNIE tę ścieżkę natywnymi klikami:
 * klik zapisu → odczyt wskazania → kontrolka z fokusem → uzupełnienie → ponowny klik — aż
 * kreator się zamknie. Wartości wpływające na wyniki podaje test JAWNIE (`wartosci`, po
 * `data-testid` kontrolki); dla listy wyboru bez wartości testowej wybierana jest pierwsza
 * pozycja listy różna od bieżącej i jeszcze niepróbowana w tym polu (wybór testu, nie domysł
 * produktu) — wskazanie KONFLIKTU (np. karta pola niezgodna z aparatem) prowadzi więc do
 * kolejnej pozycji, a nie do ponownego wyboru tej samej. Pole liczbowe bez wartości testowej
 * kończy bieg błędem z treścią wskazania — test ma powiedzieć, czego chce.
 *
 * Zwraca przebieg wskazań: testy mogą przypiąć kolejność i treść braków (dowód, że kreator
 * prowadzi do konkretnych pól, a nie mówi ogólnikiem).
 */

import { expect, type Page } from '@playwright/test';

export interface WskazanieKreatora {
  readonly komunikat: string;
  readonly pole: string;
}

export interface OpcjeZapisuZPrzewodnikiem {
  /** `data-testid` korzenia kreatora (znika po udanym zapisie). */
  readonly kreator: string;
  /** `data-testid` przycisku akcji kreatora (zapis albo podgląd na żądanie). */
  readonly zapisz: string;
  /**
   * `data-testid` elementu, którego pojawienie się kończy przebieg (np. wynik podglądu).
   * Bez niego koniec = zamknięcie kreatora po zapisie.
   */
  readonly koniec?: string;
  /** Wartości testowe per `data-testid` kontrolki wskazanej przez kreator. */
  readonly wartosci?: Readonly<Record<string, string>>;
  /**
   * Krok przed każdym klikiem akcji — dla akcji osadzonej w kroku (np. „Przelicz podgląd”):
   * wskazanie przestawia krok na pole braku, więc trzeba wrócić do kroku akcji.
   */
  readonly przedAkcja?: () => Promise<void>;
  /** Górna granica liczby wskazań (zabezpieczenie przed pętlą). */
  readonly limit?: number;
  /** Czas na zamknięcie kreatora albo pojawienie się wskazania po kliku. */
  readonly timeout?: number;
}

async function poleZFokusem(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const aktywny = document.activeElement;
    if (!aktywny || aktywny === document.body) return null;
    return aktywny.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
  });
}

export async function zapiszZPrzewodnikiem(
  page: Page,
  opcje: OpcjeZapisuZPrzewodnikiem,
): Promise<WskazanieKreatora[]> {
  const { kreator, zapisz, wartosci = {}, limit = 20, timeout = 60000 } = opcje;
  const korzen = page.getByTestId(kreator);
  const zrobione = async (): Promise<boolean> =>
    opcje.koniec ? (await page.getByTestId(opcje.koniec).count()) > 0 : (await korzen.count()) === 0;
  const wskazanie = page.getByTestId('mvd-kreator-wskazanie');
  const przebieg: WskazanieKreatora[] = [];
  /** Pozycje list już wybrane przez pomocnika w danym polu (bez zadanej wartości testowej). */
  const sprobowane = new Map<string, Set<string>>();

  for (let i = 0; i < limit; i += 1) {
    if (opcje.przedAkcja) await opcje.przedAkcja();
    await page.getByTestId(zapisz).click();
    await expect
      .poll(async () => ((await zrobione()) || (await wskazanie.count()) > 0 ? 'tak' : 'nie'), {
        timeout,
      })
      .toBe('tak');
    if (await zrobione()) return przebieg;

    const komunikat = ((await wskazanie.textContent()) ?? '').trim();
    await expect.poll(() => poleZFokusem(page), { timeout: 10000 }).not.toBeNull();
    const pole = await poleZFokusem(page);
    if (!pole || pole === zapisz) {
      throw new Error(`Wskazanie bez kontrolki do uzupełnienia: „${komunikat}”`);
    }
    const powtorka = przebieg.some((w) => w.pole === pole && w.komunikat === komunikat);
    przebieg.push({ komunikat, pole });

    const kontrolka = page.getByTestId(pole);
    const tag = await kontrolka.evaluate((el) => el.tagName.toLowerCase());
    const zadana = wartosci[pole];
    if (tag === 'select') {
      const { opcjeListy, biezaca } = await kontrolka.evaluate((el) => ({
        opcjeListy: [...(el as HTMLSelectElement).options]
          .filter((o) => o.value !== '' && !o.disabled)
          .map((o) => o.value),
        biezaca: (el as HTMLSelectElement).value,
      }));
      const proby = sprobowane.get(pole) ?? new Set<string>();
      const wybor =
        zadana !== undefined && !powtorka
          ? zadana
          : opcjeListy.find((v) => v !== biezaca && !proby.has(v));
      if (!wybor) {
        throw new Error(`Lista ${pole} nie ma kolejnej pozycji do wyboru („${komunikat}”)`);
      }
      proby.add(wybor);
      sprobowane.set(pole, proby);
      await kontrolka.selectOption(wybor);
    } else {
      if (powtorka) {
        throw new Error(`Kreator wskazuje ponownie to samo pole ${pole}: „${komunikat}”`);
      }
      if (zadana === undefined) {
        throw new Error(`Brak wartości testowej dla pola ${pole} („${komunikat}”)`);
      }
      await kontrolka.fill(zadana);
    }
    // Zmiana wskazanej kontrolki gasi wskazanie (rama kreatora) — następny klik niesie
    // świeże wskazanie, nie poprzednie zdanie.
    await expect(wskazanie).toHaveCount(0, { timeout: 10000 });
  }
  throw new Error(`Kreator ${kreator} nie zapisał się po ${limit} wskazaniach: ${JSON.stringify(przebieg)}`);
}

/**
 * Wartości testowe kreatora źródła zasilania (GPZ) dla pól, których kreator nie dobiera
 * sam (wpływają na wyniki): czas zwarcia, uziemienie punktu neutralnego, Z0/Z1.
 */
export const WARTOSCI_TESTOWE_GPZ: Readonly<Record<string, string>> = {
  'mvd-kreator-zrodlo-tk': '1',
  'mvd-kreator-zrodlo-uziemienie': 'resistor_grounded',
  'mvd-kreator-zrodlo-uziemienie-ohm': '12',
  'mvd-kreator-zrodlo-z0z1': '3',
  'mvd-kreator-zrodlo-sk3': '250',
  'mvd-kreator-zrodlo-rx': '0.1',
};
