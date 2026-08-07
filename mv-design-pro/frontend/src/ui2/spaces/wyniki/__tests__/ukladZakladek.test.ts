/*
 * Pin układu paska zakładek warsztatu Wyników (karta V126-JEZYK, defekt ze
 * zrzutu 3/3 właściciela: pasek przelewał się poza kadr, kolumna treści zwinięta,
 * zdania ucięte w połowie).
 *
 * DLACZEGO PIN KONTRAKTU CSS, A NIE POMIAR W jsdom: jsdom nie prowadzi układu
 * (żadnych szerokości, żadnego zawijania), więc „pomiar" w nim byłby atrapą
 * udającą dowód. Realny pomiar przy 1280/1440/1920 px wykonano w ŻYWEJ aplikacji
 * (zrzuty `docs/sld/audyt-2026-08/v126-jezyk-*`), a tutaj przypinamy WŁASNOŚCI,
 * bez których ten pomiar nie może wyjść poprawnie — usunięcie którejkolwiek
 * przywraca defekt i zapala czerwień.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const KATALOG = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(KATALOG, '..', 'wynikiWarsztat.css'), 'utf-8');

/** Treść reguły dla dokładnego selektora (bez reguł pochodnych). */
function regula(selektor: string): string {
  const wzorzec = new RegExp(
    `(^|\\n)\\s*${selektor.replace(/[.+]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  );
  const dopasowanie = CSS.match(wzorzec);
  expect(dopasowanie, `brak reguły CSS dla selektora ${selektor}`).not.toBeNull();
  return dopasowanie?.[2] ?? '';
}

describe('układ paska zakładek warsztatu Wyników (V126-JEZYK)', () => {
  it('pasek zakładek ZAWIJA się do kolejnych rzędów (nie wyjeżdża poza kadr)', () => {
    const tresc = regula('.mvd-wyniki-zakladki');
    expect(tresc).toMatch(/flex-wrap:\s*wrap/);
  });

  it('pasek nie zabiera wysokości kolumnie treści (flex: 0 0 auto)', () => {
    expect(regula('.mvd-wyniki-zakladki')).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('zakładka nie jest ściskana ani łamana w połowie wyrazu', () => {
    const tresc = regula('.mvd-wyniki-zakladka');
    expect(tresc).toMatch(/white-space:\s*nowrap/);
    expect(tresc).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('kolumna treści może się zwęzić bez wypychania paska (min-width: 0)', () => {
    const tresc = regula('.mvd-wyniki-tresc');
    expect(tresc).toMatch(/min-width:\s*0/);
    expect(tresc).toMatch(/min-height:\s*0/);
    expect(tresc).toMatch(/overflow:\s*auto/);
  });

  it('grupy zakładek też zawijają się wewnętrznie', () => {
    const tresc = regula('.mvd-wyniki-grupa');
    expect(tresc).toMatch(/flex-wrap:\s*wrap/);
    expect(tresc).toMatch(/min-width:\s*0/);
  });

  it('kontrola dodatnia: parser reguł widzi treść, a nie pustkę', () => {
    // Gdyby `regula()` zwracała pusty łańcuch dla każdego selektora, wszystkie
    // asercje wyżej przechodziłyby fałszywie — ten przypadek to wyklucza.
    expect(regula('.mvd-wyniki-warsztat')).toMatch(/flex-direction:\s*column/);
    expect(() => regula('.mvd-selektor-ktorego-nie-ma')).toThrow();
  });
});
