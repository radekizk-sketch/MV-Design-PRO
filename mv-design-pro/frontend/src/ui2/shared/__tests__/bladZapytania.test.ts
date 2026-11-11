/**
 * Jedno źródło komunikatu o nieudanym zapytaniu (karta komunikatów, commit 4).
 *
 * Iloczyn cech: {status 0, 400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503, 504, 418, 302}
 * × {z czynnością, bez czynności} × {z adresem odpowiedzi, bez adresu}; dla `bladOdpowiedzi`:
 * {detail łańcuch, detail pusty, detail obiekt, brak JSON} × {z czynnością, bez czynności}.
 * Niezmienniki: treść po polsku, kod HTTP w nawiasie na końcu, ani adres zapytania, ani
 * angielski `statusText` nigdy nie trafiają do treści; adres zostaje w polu diagnostycznym.
 */
import { describe, expect, it } from 'vitest';

import {
  BladZapytania,
  bladOdpowiedzi,
  bladZapytania,
  komunikatZapytania,
  opisStatusuHttp,
} from '../bladZapytania';

const STATUSY = [0, 302, 400, 401, 403, 404, 409, 413, 418, 422, 429, 500, 502, 503, 504];
const ADRES = '/api/cases/case-1/runs/v126/ssci_impedance';

function odpowiedzJson(status: number, cialo: unknown, url = ADRES): Response {
  return {
    status,
    url,
    statusText: 'Internal Server Error',
    json: async () => cialo,
  } as unknown as Response;
}

function odpowiedzBezJson(status: number): Response {
  return {
    status,
    url: ADRES,
    statusText: 'Not Found',
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  } as unknown as Response;
}

describe('opisStatusuHttp', () => {
  it.each(STATUSY)('status %i ma niepusty opis po polsku bez kodu i bez angielskiego', (s) => {
    const opis = opisStatusuHttp(s);
    expect(opis.length).toBeGreaterThan(5);
    expect(opis).not.toMatch(/\d{3}/);
    expect(opis).not.toMatch(/\b(?:request|failed|error|not found|server)\b/i);
  });

  it('rozróżnia klasy statusów (każda klasa ma inny opis)', () => {
    const opisy = new Set([404, 409, 422, 500, 503, 0, 403].map(opisStatusuHttp));
    expect(opisy.size).toBe(7);
  });
});

describe('komunikatZapytania × bladZapytania', () => {
  for (const status of STATUSY) {
    for (const czynnosc of [undefined, 'Nie udało się pobrać widoku pola', 'Eksport CGMES:']) {
      for (const url of [ADRES, undefined]) {
        it(`status ${status}, czynność ${czynnosc ?? '—'}, adres ${url ? 'jest' : 'brak'}`, () => {
          const odpowiedz = url === undefined ? { status } : { status, url };
          const tresc = komunikatZapytania(odpowiedz, czynnosc);
          expect(tresc.endsWith(`(HTTP ${status}).`)).toBe(true);
          expect(tresc).toContain(opisStatusuHttp(status));
          expect(tresc).not.toContain('/api/');
          expect(tresc).not.toMatch(/Request|failed|statusText|Not Found/);
          expect(tresc).not.toMatch(/[.:]: /);
          expect(tresc.startsWith(czynnosc?.replace(/[.:]+$/, '') ?? 'Zapytanie do serwera')).toBe(
            true,
          );

          const blad = bladZapytania(odpowiedz, czynnosc);
          expect(blad).toBeInstanceOf(BladZapytania);
          expect(blad).toBeInstanceOf(Error);
          expect(blad.message).toBe(tresc);
          expect(blad.status).toBe(status);
          expect(blad.adres).toBe(url ?? null);
        });
      }
    }
  }
});

describe('bladOdpowiedzi', () => {
  it.each([
    ['detail łańcuch, bez czynności', odpowiedzJson(422, { detail: ' Brak szyny zasilającej. ' }), undefined, 'Brak szyny zasilającej.'],
    ['detail łańcuch, z czynnością', odpowiedzJson(422, { detail: 'Brak szyny.' }), 'Błąd porównania', 'Błąd porównania: Brak szyny.'],
    ['detail pusty, z czynnością', odpowiedzJson(500, { detail: '   ' }), 'Błąd porównania', 'Błąd porównania: wewnętrzny błąd serwera obliczeń (HTTP 500).'],
    ['detail obiekt, bez czynności', odpowiedzJson(409, { detail: { kod: 'X' } }), undefined, 'Zapytanie do serwera nie powiodło się: stan modelu zmienił się w międzyczasie — odśwież widok i ponów (HTTP 409).'],
    ['ciało null, z czynnością', odpowiedzJson(404, null), 'Nie udało się pobrać', 'Nie udało się pobrać: serwer nie znalazł żądanego zasobu (HTTP 404).'],
    ['brak JSON, bez czynności', odpowiedzBezJson(404), undefined, 'Zapytanie do serwera nie powiodło się: serwer nie znalazł żądanego zasobu (HTTP 404).'],
  ])('%s', async (_opis, odpowiedz, czynnosc, oczekiwana) => {
    const blad = await bladOdpowiedzi(odpowiedz, czynnosc);
    expect(blad).toBeInstanceOf(BladZapytania);
    expect(blad.message).toBe(oczekiwana);
    expect(blad.message).not.toContain(ADRES);
    expect(blad.adres).toBe(ADRES);
  });
});
