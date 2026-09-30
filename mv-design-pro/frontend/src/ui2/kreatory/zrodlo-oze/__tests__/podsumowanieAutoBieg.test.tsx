/**
 * D4: testy pomocnika łączenia statusu auto-biegu + panelu podsumowania
 * (raport zgodności ✓/⚠/❌ + BOM). Prezentacja danych backendu 1:1, ZERO fizyki.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PodsumowanieAutoBieg } from '../PodsumowanieAutoBieg';
import { polaczStatusBiegu, type ListaMaterialowa, type RaportZgodnosci } from '../podsumowanieApi';

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

const RAPORT: RaportZgodnosci = {
  wersja: '1.0',
  source_ref: 'gen-1',
  source_name: 'Blok PV SN',
  werdykt: 'NIEZGODNY',
  komunikat_krytyczny: 'Nie można wygenerować projektu.',
  pozycje: [
    {
      check_id: 'moc_transformatora',
      kategoria: 'walidacja_D1',
      status: 'FAIL',
      code: 'converter.der_sn.moc_transformatora_niewystarczajaca',
      message_pl: '❌ Moc transformatora jest niewystarczająca (ΣS=1 MVA > dopuszczalne 0.1 MVA).',
    },
  ],
  podsumowanie: { pass: 0, warn: 0, fail: 1, razem: 1 },
};

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
  it('błąd krytyczny D1: werdykt niezgodny + komunikat kanonu + komunikat 1:1', () => {
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
    expect(screen.getByTestId('mvd-kreator-oze-werdykt')).toHaveTextContent('Projekt niezgodny');
    expect(screen.getByTestId('mvd-kreator-oze-krytyczny')).toHaveTextContent(
      'Nie można wygenerować projektu.',
    );
    expect(screen.getByTestId('mvd-kreator-oze-check-moc_transformatora')).toHaveTextContent(
      '❌ Moc transformatora jest niewystarczająca',
    );
    expect(screen.getByTestId('mvd-kreator-oze-bom-tabela')).toHaveTextContent('Kabel SN przyłączeniowy');
    expect(screen.getByTestId('mvd-kreator-oze-status-tekst')).toHaveTextContent('nieudany');
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
