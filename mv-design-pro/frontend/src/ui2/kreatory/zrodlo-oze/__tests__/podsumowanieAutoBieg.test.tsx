/**
 * D4: testy pomocnika łączenia statusu auto-biegu + panelu podsumowania
 * (raport zgodności z rekordów werdyktu + BOM). Prezentacja danych backendu 1:1, ZERO fizyki.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PodsumowanieAutoBieg } from '../PodsumowanieAutoBieg';
import {
  polaczStatusBiegu,
  pozycjaOceniona,
  type ListaMaterialowa,
  type RaportZgodnosci,
} from '../podsumowanieApi';
import raportyZgodnosci from './raportyZgodnosci.json';

afterEach(() => cleanup());

describe('polaczStatusBiegu', () => {
  it('pusta lista → null (auto-bieg wyłączony)', () => {
    expect(polaczStatusBiegu([])).toBeNull();
  });
  it('wszystkie DONE → DONE', () => {
    expect(polaczStatusBiegu(['DONE', 'DONE'])).toBe('DONE');
  });
  it('dowolny FAILED → FAILED', () => {
    expect(polaczStatusBiegu(['DONE', 'FAILED'])).toBe('FAILED');
  });
  it('częściowo w toku → RUNNING', () => {
    expect(polaczStatusBiegu(['DONE', 'RUNNING'])).toBe('RUNNING');
  });
});

/**
 * Raporty z backendu (fixtura generatora `generuj_fixtury_ocen_fe.py` — funkcja końcówki
 * `build_compliance_report_from_track` na torze zmaterializowanym operacją zapisu kreatora).
 * Ręcznie złożony raport mógłby mieć etykietę niezgodną z rekordem — tu jest to niemożliwe.
 */
const RAPORTY = raportyZgodnosci as unknown as Record<
  'zgodny' | 'z_uwagami' | 'niezgodny' | 'bez_danych',
  RaportZgodnosci
>;
const RAPORT = RAPORTY.niezgodny;

const BOM: ListaMaterialowa = {
  wersja: '1.0',
  source_ref: 'gen-1',
  source_name: 'Blok PV SN',
  pozycje: [
    {
      lp: 1,
      kategoria: 'kabel_sn',
      element: 'Kabel SN przyłączeniowy',
      catalog_ref: 'cable-x',
      typ_nazwa: 'Kabel XRUHAKXS 1×120',
      ref_id: 'cab-1',
      parametry: { przekroj_mm2: 50, dlugosc_km: 0.05 },
      parametry_opis: [
        { etykieta: 'Przekrój', wartosc: 50, jednostka: 'mm²' },
        { etykieta: 'Długość', wartosc: 0.05, jednostka: 'km' },
      ],
      ilosc: 0.05,
      jednostka: 'km',
    },
  ],
  count: 1,
  braki_ogniw: [],
  koszt: {
    status: 'BRAK_CENNIKA',
    kod: 'BRAK_CENNIKA',
    komunikat_pl:
      'Nie można wyznaczyć listy materiałowej (cennik 2026-09): brak ceny inwestycyjnej dla pozycji: Kabel SN przyłączeniowy.',
    wersja_cennika: '2026-09',
    type_ids: ['cable-x'],
    pozycje_bez_typu: [],
  },
};

describe('PodsumowanieAutoBieg', () => {
  it('błąd krytyczny D1: etykieta raportu z rekordu wymagania + komunikat kanonu + komunikat 1:1', () => {
    render(
      <PodsumowanieAutoBieg
        runStatus="FAILED"
        autoBieg
        raport={RAPORT}
        bom={BOM}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    expect(RAPORT.werdykt).toBe('NIEZGODNY');
    const etykieta = screen.getByTestId('mvd-kreator-oze-werdykt-etykieta');
    expect(etykieta).toHaveTextContent(RAPORT.ocena_wymagania.etykieta.etykieta_pl);
    expect(etykieta).toHaveAttribute('data-semantyka', 'negatywna');
    expect(screen.getByTestId('mvd-kreator-oze-werdykt-zdanie')).toHaveTextContent(
      RAPORT.wyjasnienie.zdanie_pl,
    );
    expect(screen.getByTestId('mvd-kreator-oze-krytyczny')).toHaveTextContent(
      'Nie można wygenerować projektu.',
    );
    expect(screen.getByTestId('mvd-kreator-oze-check-moc_transformatora')).toHaveTextContent(
      'przekracza dopuszczalną moc transformatora (100 kVA',
    );
    expect(screen.getByTestId('mvd-kreator-oze-bom-tabela')).toHaveTextContent('Kabel SN przyłączeniowy');
    expect(screen.getByTestId('mvd-kreator-oze-status-tekst')).toHaveTextContent('nieudany');
  });

  // Iloczyn cech: stan raportu (zgodny / z uwagami / niezgodny / bez danych) × rodzaj pozycji
  // (z rekordem / informacyjna) × miejsce etykiety (raport / pozycja / licznik). Etykieta
  // i semantyka zawsze z rekordu; kod `werdykt`/`status` nie jest tekstem ekranu.
  describe.each(Object.entries(RAPORTY))('raport „%s”', (_nazwa, raport) => {
    it('etykieta raportu, pozycji i liczników pochodzi z rekordów, informacja bez etykiety', () => {
      render(
        <PodsumowanieAutoBieg
          runStatus="DONE"
          autoBieg
          raport={raport}
          bom={null}
          onOtworzDokumentacje={() => {}}
          onZakoncz={() => {}}
        />,
      );
      const naglowek = screen.getByTestId('mvd-kreator-oze-werdykt');
      expect(screen.getByTestId('mvd-kreator-oze-werdykt-etykieta')).toHaveTextContent(
        raport.ocena_wymagania.etykieta.etykieta_pl,
      );
      expect(naglowek).not.toHaveTextContent(raport.werdykt);
      expect(screen.queryByTestId('mvd-kreator-oze-krytyczny') !== null).toBe(
        raport.komunikat_krytyczny !== null,
      );

      for (const pozycja of raport.pozycje) {
        const wiersz = screen.getByTestId(`mvd-kreator-oze-check-${pozycja.check_id}`);
        expect(wiersz).toHaveTextContent(pozycja.message_pl);
        expect(wiersz).not.toHaveTextContent(new RegExp(`\\b${pozycja.status}\\b`));
        if (pozycjaOceniona(pozycja)) {
          expect(wiersz).toHaveAttribute('data-semantyka', pozycja.ocena.etykieta.semantyka);
          expect(wiersz).toHaveTextContent(pozycja.ocena.etykieta.etykieta_pl);
        } else {
          expect(wiersz).toHaveAttribute('data-semantyka', 'informacja');
          expect(wiersz.querySelector('.mvd-werdykt-plakietka')).toBeNull();
        }
      }

      // Liczniki: suma = liczba pozycji z rekordem; każdy licznik niesie etykietę rekordu.
      const liczniki = screen.queryAllByTestId('mvd-kreator-oze-raport-licznik');
      const zRekordem = raport.pozycje.filter(pozycjaOceniona);
      const suma = liczniki.reduce((acc, el) => acc + Number(el.querySelector('.mvd-num')?.textContent), 0);
      expect(suma).toBe(zRekordem.length);
      for (const licznik of liczniki) {
        const etykietaPl = licznik.querySelector('.mvd-werdykt-plakietka')?.textContent;
        expect(Number(licznik.querySelector('.mvd-num')?.textContent)).toBe(
          zRekordem.filter((p) => p.ocena.etykieta.etykieta_pl === etykietaPl).length,
        );
      }
      expect(screen.queryByTestId('mvd-kreator-oze-raport-informacje') !== null).toBe(
        raport.podsumowanie.informacja > 0,
      );
    });
  });

  it('brak danych kaskady ≠ spełnia: raport nierozstrzygnięty, etykieta neutralna, nie pozytywna', () => {
    const raport = RAPORTY.bez_danych;
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={raport}
        bom={null}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    expect(raport.werdykt).toBe('NIEROZSTRZYGNIETY');
    expect(screen.getByTestId('mvd-kreator-oze-werdykt-etykieta')).toHaveAttribute(
      'data-semantyka',
      'neutralna',
    );
    const kaskada = raport.pozycje.find((p) => p.kategoria === 'kaskada_pradowa');
    expect(kaskada && pozycjaOceniona(kaskada) && kaskada.ocena.status_maszynowy).toBe('NIE_OCENIONO');
  });

  it('uzasadnienie raportu: natywny klik rozwija kartę rekordu wymagania', async () => {
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={RAPORTY.zgodny}
        bom={null}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    const raport = RAPORTY.zgodny;
    const karta = screen.getByTestId(`mvd-werdykt-${raport.ocena_wymagania.wymaganie_id}`);
    expect(karta).toHaveAttribute('data-poziom', 'W');
    expect(karta).toHaveTextContent('Uzasadnienie oceny doborów toru');
    const przelacz = screen.getByTestId(`mvd-werdykt-${raport.ocena_wymagania.wymaganie_id}-zakres-przelacz`);
    expect(przelacz).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(przelacz);
    expect(przelacz).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(`mvd-werdykt-${raport.ocena_wymagania.wymaganie_id}-zakres`)).toHaveTextContent(
      raport.ocena_wymagania.zakres_waznosci.opis_pl,
    );
  });

  it('brak toru DER-SN: uczciwe stany zerowe raportu i BOM', () => {
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={null}
        bom={null}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    expect(screen.queryByTestId('mvd-kreator-oze-werdykt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-oze-bom-tabela')).not.toBeInTheDocument();
  });

  it('lista materiałowa: nazwa typu zamiast identyfikatora, koszt jako zdanie odmowy z backendu', () => {
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={RAPORT}
        bom={BOM}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    const tabela = screen.getByTestId('mvd-kreator-oze-bom-tabela');
    expect(tabela).toHaveTextContent('Kabel XRUHAKXS 1×120');
    expect(tabela).not.toHaveTextContent('cable-x');
    expect(tabela).toHaveTextContent('Przekrój: 50 mm² · Długość: 0.05 km');
    expect(tabela).not.toHaveTextContent('przekroj_mm2');
    const koszt = screen.getByTestId('mvd-kreator-oze-bom-koszt');
    expect(koszt).toHaveAttribute('data-status', 'BRAK_CENNIKA');
    expect(koszt).toHaveTextContent('Nie można wyznaczyć listy materiałowej');
    expect(koszt).not.toHaveTextContent('BRAK_CENNIKA');
    expect(koszt).not.toHaveTextContent('0,00');
  });

  it('lista materiałowa: typ spoza katalogu nazwany, brak ilości jako zdanie z backendu', () => {
    const bom: ListaMaterialowa = {
      ...BOM,
      pozycje: [{ ...BOM.pozycje[0], typ_nazwa: null, ilosc: null }],
      koszt: {
        status: 'BRAK_ILOSCI',
        kod: 'BRAK_ILOSCI_POZYCJI',
        komunikat_pl: 'Nie można wyznaczyć kosztu listy materiałowej: brak ilości dla pozycji: Kabel SN przyłączeniowy.',
        pozycje_bez_ilosci: ['Kabel SN przyłączeniowy'],
      },
    };
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={RAPORT}
        bom={bom}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    expect(screen.getByTestId('mvd-kreator-oze-bom-tabela')).toHaveTextContent('typ spoza katalogu');
    expect(screen.getByTestId('mvd-kreator-oze-bom-koszt')).toHaveTextContent('brak ilości dla pozycji');
  });

  it('lista materiałowa wyceniona: kwota 1:1 z backendu, cennik, stan źródła i ceny nieustalone', () => {
    const bom: ListaMaterialowa = {
      ...BOM,
      koszt: {
        status: 'WYCENIONE',
        suma_capex: 1234567.5,
        waluta: 'PLN',
        wersja_cennika: '2026-09',
        data_cen: '2026-09-30',
        stan_zrodla: 'NIEUSTALONE',
        pozycje_nieustalone: ['Kabel SN przyłączeniowy'],
      },
    };
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={RAPORT}
        bom={bom}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    const koszt = screen.getByTestId('mvd-kreator-oze-bom-koszt');
    expect(koszt).toHaveTextContent('Koszt inwestycyjny (CAPEX)');
    expect(koszt.textContent?.replace(/\s/g, ' ')).toContain('1 234 567,50 PLN'.replace(/\s/g, ' '));
    expect(koszt).toHaveTextContent('cennik 2026-09 z dnia 2026-09-30');
    expect(koszt).toHaveTextContent('stan źródła cen: nieustalone');
    expect(koszt).toHaveTextContent('Ceny o nieustalonym źródle: Kabel SN przyłączeniowy');
  });

  it('akcje: Otwórz Dokumentację i Zakończ wywołują realne callbacki', async () => {
    const otworz = vi.fn();
    const zakoncz = vi.fn();
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={RAPORT}
        bom={BOM}
        onOtworzDokumentacje={otworz}
        onZakoncz={zakoncz}
      />,
    );
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-otworz-dokumentacje'));
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zakoncz'));
    expect(otworz).toHaveBeenCalledTimes(1);
    expect(zakoncz).toHaveBeenCalledTimes(1);
  });
});
