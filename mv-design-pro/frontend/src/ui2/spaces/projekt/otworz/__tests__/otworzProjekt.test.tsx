import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OtworzProjekt } from '../OtworzProjekt';
import { OTWORZ_STRINGS, PRZYKLADY } from '../strings';
import type { ProjektWiersz } from '../adapters/projektyAdapter';

function projekty(): ProjektWiersz[] {
  return [{ id: 'PR1', nazwa: 'Sieć SN Rejon Wschód', ostatniaZmianaISO: '2026-07-10T09:15:00Z' }];
}

describe('OtworzProjekt — ekran W-102 (cel → przykłady → istniejące projekty)', () => {
  // K4 §c (zero fabrykacji): sekcja przykładów renderuje się WYŁĄCZNIE, gdy
  // wołający dostarcza listę (czyli ma realnego dostawcę materializacji) —
  // testy sekcji przykładów przekazują `przyklady={PRZYKLADY}` jawnie.
  it('renderuje trzy sekcje w kolejności: cel, przykłady, istniejące projekty (przy dostawcy przykładów)', () => {
    const { container } = render(
      <OtworzProjekt
        projekty={projekty()}
        przyklady={PRZYKLADY}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    // Nagłówki sekcji (klasa `mvd-pulpit-cases-title`) — odróżnione od nagłówków
    // pojedynczych kafli (`mvd-kafel-title`) wewnątrz tych sekcji.
    const naglowkiSekcji = Array.from(
      container.querySelectorAll<HTMLElement>('.mvd-pulpit-cases-title'),
    ).map((h) => h.textContent);
    expect(naglowkiSekcji).toEqual([
      OTWORZ_STRINGS.celTytul,
      OTWORZ_STRINGS.przykladyTytul,
      OTWORZ_STRINGS.projektyTytul,
    ]);
  });

  it('renderuje nagłówek okna', () => {
    render(
      <OtworzProjekt
        projekty={[]}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: OTWORZ_STRINGS.tytul })).toBeInTheDocument();
  });

  it('renderuje wszystkie 5 gotowych przykładów (P-01…P-05) z opisami przy dostawcy', () => {
    render(
      <OtworzProjekt
        projekty={[]}
        przyklady={PRZYKLADY}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    for (const p of PRZYKLADY) {
      expect(screen.getByText(p.nazwa)).toBeInTheDocument();
      expect(screen.getByText(p.opis)).toBeInTheDocument();
    }
  });

  it('bez dostawcy przykładów (domyślnie) sekcja przykładów NIE renderuje się — zero fabrykacji (K4 §c)', () => {
    render(
      <OtworzProjekt
        projekty={[]}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    expect(screen.queryByText(OTWORZ_STRINGS.przykladyTytul)).toBeNull();
    for (const p of PRZYKLADY) {
      expect(screen.queryByText(p.nazwa)).toBeNull();
    }
  });

  it('klik kafla celu → onNowyProjekt z identyfikatorem celu', () => {
    const onNowyProjekt = vi.fn();
    render(
      <OtworzProjekt
        projekty={[]}
        onOtworzProjekt={() => {}}
        onNowyProjekt={onNowyProjekt}
        onWczytajPrzyklad={() => {}}
      />,
    );
    fireEvent.click(screen.getByText(OTWORZ_STRINGS.celAudyt));
    expect(onNowyProjekt).toHaveBeenCalledWith('audyt');
  });

  it('klik kafla przykładu → onWczytajPrzyklad z jego id (P-01)', () => {
    const onWczytajPrzyklad = vi.fn();
    render(
      <OtworzProjekt
        projekty={[]}
        przyklady={PRZYKLADY}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={onWczytajPrzyklad}
      />,
    );
    fireEvent.click(screen.getByText(PRZYKLADY[0].nazwa));
    expect(onWczytajPrzyklad).toHaveBeenCalledWith('P-01');
  });

  it('2× klik wiersza istniejącego projektu → onOtworzProjekt z id', () => {
    const onOtworzProjekt = vi.fn();
    render(
      <OtworzProjekt
        projekty={projekty()}
        onOtworzProjekt={onOtworzProjekt}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    fireEvent.doubleClick(screen.getByText('Sieć SN Rejon Wschód'));
    expect(onOtworzProjekt).toHaveBeenCalledWith('PR1');
  });

  it('przekazuje stan „ładowanie" do listy istniejących projektów', () => {
    render(
      <OtworzProjekt
        projekty={[]}
        ladowanieProjektow
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    expect(screen.getByText(OTWORZ_STRINGS.ladowanieProjektow)).toBeInTheDocument();
  });

  it('pusta lista istniejących projektów (bez ładowania) → komunikat pustego stanu', () => {
    render(
      <OtworzProjekt
        projekty={[]}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    expect(screen.getByText(OTWORZ_STRINGS.brakProjektow)).toBeInTheDocument();
  });
});

describe('OtworzProjekt — inne drogi zdobycia projektu (E1: arkusz XLSX, archiwum ZIP)', () => {
  // Bez otwartego projektu pulpit z kaflami nie istnieje, więc wejścia do importu
  // z arkusza i odtworzenia z archiwum MUSZĄ być osiągalne z tego ekranu —
  // inaczej projektant z arkuszem od operatora nie ma gdzie kliknąć.
  it('renderuje wejścia do importu z arkusza i archiwum, gdy wołający je dostarcza', () => {
    const arkusz = vi.fn();
    const archiwum = vi.fn();
    render(
      <OtworzProjekt
        projekty={[]}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
        onOtworzImportArkusza={arkusz}
        onOtworzArchiwum={archiwum}
      />,
    );
    expect(screen.getByTestId('mvd-projekty-inne-drogi')).toHaveTextContent(
      OTWORZ_STRINGS.inneDrogiTytul,
    );
    fireEvent.click(screen.getByTestId('mvd-projekty-droga-arkusz'));
    expect(arkusz).toHaveBeenCalledTimes(1);
    expect(archiwum).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('mvd-projekty-droga-archiwum'));
    expect(archiwum).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: OTWORZ_STRINGS.drogaArkuszAkcja })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: OTWORZ_STRINGS.drogaArchiwumAkcja })).toBeInTheDocument();
  });

  it('bez dostawców wejścia się nie renderują (zero martwych kontrolek)', () => {
    render(
      <OtworzProjekt
        projekty={[]}
        onOtworzProjekt={() => {}}
        onNowyProjekt={() => {}}
        onWczytajPrzyklad={() => {}}
      />,
    );
    expect(screen.queryByTestId('mvd-projekty-inne-drogi')).toBeNull();
    expect(screen.queryByTestId('mvd-projekty-droga-arkusz')).toBeNull();
  });
});
