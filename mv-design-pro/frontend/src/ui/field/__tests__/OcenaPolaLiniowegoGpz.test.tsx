/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 2 — ocena pola liniowego GPZ na karcie pola.
 *
 * Dane: fikstura wygenerowana z `build_field_read_model` backendu na scenach budowanych
 * operacjami domenowymi (`backend/tests/ci/test_parytet_oceny_pola_liniowego.py` — strażnik
 * równości fikstury z backendem i lustra typów z dataclass). Front testuje kształt, który backend
 * naprawdę wysyła.
 *
 * ILOCZYN CECH: klasa {przyjęta z sieci, zadeklarowana} × pomiar AJEE {wymagany z rdzeniem,
 * wymagany bez rdzenia, niewymagany} × niezgodności {brak, jedna, dwie} × status oceny funkcji
 * {każdy obecny w fikstorze}. Wyrocznia: rekordy fikstury (każdy wiersz funkcji niesie status
 * RAZEM z kryterium, podstawą, przyczyną i dowodem — status nigdy nie stoi sam).
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NAZWA_WERYFIKACJI_PL } from '../../catalog/api';
import { OcenaPolaLiniowegoGpz } from '../OcenaPolaLiniowegoGpz';
import type { OcenaPolaLiniowego } from '../useFieldReadModel';
import { NAZWA_KLASY_POLA_PL } from '../wyposazeniePola';
import przypadki from './fixtures/ocena_pola_liniowego.json';

const PRZYPADKI = przypadki as unknown as readonly { readonly nazwa: string; readonly ocena: OcenaPolaLiniowego }[];

describe('OcenaPolaLiniowegoGpz — ocena z modelu odczytu pola', () => {
  it('fikstura pokrywa iloczyn klasy, AJEE i liczby niezgodności', () => {
    expect(new Set(PRZYPADKI.map((p) => p.ocena.klasa_przyjeta))).toEqual(new Set([true, false]));
    expect(new Set(PRZYPADKI.map((p) => `${p.ocena.ajee_wymagany}|${p.ocena.ajee_rdzen_obecny}`))).toEqual(
      new Set(['true|true', 'true|false', 'false|false']),
    );
    expect(new Set(PRZYPADKI.map((p) => p.ocena.niezgodnosci.length))).toEqual(new Set([0, 1, 2]));
  });

  for (const { nazwa, ocena } of PRZYPADKI) {
    it(`${nazwa}: klasa, sieć za polem, AJEE, funkcje z wyjaśnieniem, niezgodności z akcją`, () => {
      render(<OcenaPolaLiniowegoGpz ocena={ocena} />);
      const karta = screen.getByTestId('ocena-pola-liniowego');
      expect(karta.getAttribute('data-klasa')).toBe(ocena.klasa_oceny);
      const klasa = screen.getByTestId('ocena-pola-liniowego-klasa').textContent ?? '';
      expect(klasa).toContain(NAZWA_KLASY_POLA_PL[ocena.klasa_oceny]);
      expect(klasa.includes('przyjęta z sieci za polem')).toBe(ocena.klasa_przyjeta);

      const ajee = screen.getByTestId('ocena-pola-liniowego-ajee');
      expect(ajee.getAttribute('data-wymagany')).toBe(String(ocena.ajee_wymagany));
      expect(ajee.textContent).toContain(ocena.ajee_przyczyna);
      if (ocena.ajee_wymagany) {
        expect(ajee.textContent).toContain(ocena.ajee_rdzen_obecny ? 'ma rdzeń rozliczeniowy' : 'nie ma rdzenia rozliczeniowego');
      }

      const moduly = screen.queryByTestId('ocena-pola-liniowego-moduly');
      expect(moduly ? within(moduly).getAllByRole('listitem').map((li) => li.getAttribute('data-ref')) : []).toEqual(
        ocena.moduly.map((m) => m.ref_id),
      );

      const wiersze = within(screen.getByTestId('ocena-pola-liniowego-funkcje')).getAllByRole('row').slice(1);
      expect(wiersze.map((w) => [w.getAttribute('data-kod'), w.getAttribute('data-status')])).toEqual(
        ocena.oceny_funkcji.map((f) => [f.kod, f.status]),
      );
      ocena.oceny_funkcji.forEach((f, i) => {
        const tekst = wiersze[i].textContent ?? '';
        const czesci = [
          f.funkcja_pl,
          f.kryterium,
          f.podstawa,
          f.etykieta.etykieta_pl,
          f.wyjasnienie.przyczyna_pl ?? '',
          ...f.wyjasnienie.czego_brakuje,
          ...f.wyjasnienie.zastrzezenia,
          f.dowod,
        ];
        for (const czesc of czesci) {
          expect(tekst, `${f.kod}: ${czesc}`).toContain(czesc);
        }
        // Etykieta i jej semantyka koloru pochodzą z rekordu backendu, nie z mapy frontu.
        expect(wiersze[i].querySelector('[data-semantyka]')?.getAttribute('data-semantyka')).toBe(
          f.etykieta.semantyka,
        );
        // Funkcja zależna od operatora nigdy nie jest oceniona jako spełniona.
        if (f.wymog === 'NA_ZADANIE_OSD') expect(f.status).not.toBe('SPELNIA');
      });

      const niezgodnosci = screen.queryByTestId('ocena-pola-liniowego-niezgodnosci');
      const pozycje = niezgodnosci ? within(niezgodnosci).getAllByRole('listitem') : [];
      expect(pozycje.map((li) => li.getAttribute('data-kod'))).toEqual(ocena.niezgodnosci.map((n) => n.kod));
      ocena.niezgodnosci.forEach((n, i) => {
        expect(pozycje[i].textContent).toContain(n.komunikat_pl);
        expect(pozycje[i].textContent).toContain(`Akcja: ${n.akcja_pl}`);
      });

      // Obwody wtórne funkcji wg wzorca (uzupełnienie właściciela 2026-10-29): każdy wiersz
      // niesie blok rysunku, z czego funkcja mierzy, na co działa i status weryfikacji źródła.
      const obwody = within(screen.getByTestId('ocena-pola-liniowego-obwody')).getAllByRole('row').slice(1);
      expect(obwody.map((w) => [w.getAttribute('data-kod'), w.getAttribute('data-obecna'), w.getAttribute('data-weryfikacja')])).toEqual(
        (ocena.obwody_funkcji ?? []).map((o) => [o.kod, String(o.obecna), o.weryfikacja]),
      );
      (ocena.obwody_funkcji ?? []).forEach((o, i) => {
        const tekst = obwody[i].textContent ?? '';
        for (const czesc of [o.funkcja_pl, o.blok_rysunku ?? '—', ...o.wejscia_pl, o.wyjscia_pl, NAZWA_WERYFIKACJI_PL[o.weryfikacja], o.uwaga ?? '']) {
          expect(tekst, `${o.kod}: ${czesc}`).toContain(czesc);
        }
      });
      const sygnaly = within(screen.getByTestId('ocena-pola-liniowego-sygnaly')).getAllByRole('row').slice(1);
      expect(sygnaly.map((w) => w.getAttribute('data-sygnal'))).toEqual(ocena.obwody_wtorne!.sygnaly.map((s) => s.nazwa));
      ocena.obwody_wtorne!.sygnaly.forEach((s, i) => {
        // Skrót, którego standard nie rozwija, nie dostaje odgadniętego znaczenia.
        expect(sygnaly[i].textContent).toContain(s.znaczenie_pl ?? 'rozwinięcia skrótu standard nie podaje');
      });
      expect(screen.getByTestId('ocena-pola-liniowego-naped').textContent).toContain('silnikowy (M)');

      const nz = screen.queryByTestId('ocena-pola-liniowego-napiecie-zwrotne');
      expect(Boolean(nz)).toBe(Boolean(ocena.napiecie_zwrotne));
      if (ocena.napiecie_zwrotne && nz) {
        expect(nz.getAttribute('data-stan')).toBe(ocena.napiecie_zwrotne.stan_pomiaru);
        expect(nz.getAttribute('data-mozliwe')).toBe(String(ocena.napiecie_zwrotne.mozliwe));
        for (const czesc of [ocena.napiecie_zwrotne.stan_pomiaru_pl, ocena.napiecie_zwrotne.wyjasnienie_pl, ocena.napiecie_zwrotne.pomiar_pl]) {
          expect(nz.textContent).toContain(czesc);
        }
      }
    });
  }

  it('fikstura pokrywa napięcie zwrotne {brak wzorca, możliwe} i funkcję poza rysunkiem wzorca', () => {
    expect(new Set(PRZYPADKI.map((p) => (p.ocena.napiecie_zwrotne ? String(p.ocena.napiecie_zwrotne.mozliwe) : 'brak')))).toEqual(
      new Set(['brak', 'true']),
    );
    expect(PRZYPADKI.some((p) => (p.ocena.obwody_funkcji ?? []).some((o) => o.blok_rysunku === null))).toBe(true);
    expect(PRZYPADKI.some((p) => (p.ocena.obwody_funkcji ?? []).some((o) => !o.obecna))).toBe(true);
  });
});
