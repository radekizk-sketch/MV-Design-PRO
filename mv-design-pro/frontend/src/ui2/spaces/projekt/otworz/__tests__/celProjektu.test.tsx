import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CelProjektu } from '../CelProjektu';
import { OTWORZ_STRINGS } from '../strings';

describe('CelProjektu — wybór celu projektu (W-102)', () => {
  it('renderuje nagłówek „Co projektujesz?" i konsekwencję wyboru', () => {
    render(<CelProjektu onWybierzCel={() => {}} />);
    expect(screen.getByText(OTWORZ_STRINGS.celTytul)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.celKonsekwencja)).toBeInTheDocument();
  });

  it('renderuje cztery kafle celu z dokładnymi etykietami PL', () => {
    render(<CelProjektu onWybierzCel={() => {}} />);
    expect(screen.getByText(OTWORZ_STRINGS.celNowaSiec)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.celPrzylaczenieOze)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.celRozbudowa)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.celAudyt)).toBeInTheDocument();
  });

  it('każdy kafel ma opis PL', () => {
    render(<CelProjektu onWybierzCel={() => {}} />);
    expect(screen.getByText(OTWORZ_STRINGS.celNowaSiecOpis)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.celPrzylaczenieOzeOpis)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.celRozbudowaOpis)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.celAudytOpis)).toBeInTheDocument();
  });

  it('klik „Nowa sieć SN" → onWybierzCel("nowa-siec")', () => {
    const onWybierzCel = vi.fn();
    render(<CelProjektu onWybierzCel={onWybierzCel} />);
    fireEvent.click(screen.getByText(OTWORZ_STRINGS.celNowaSiec));
    expect(onWybierzCel).toHaveBeenCalledWith('nowa-siec');
  });

  it('klik „Przyłączenie źródła OZE" → onWybierzCel("przylaczenie-oze")', () => {
    const onWybierzCel = vi.fn();
    render(<CelProjektu onWybierzCel={onWybierzCel} />);
    fireEvent.click(screen.getByText(OTWORZ_STRINGS.celPrzylaczenieOze));
    expect(onWybierzCel).toHaveBeenCalledWith('przylaczenie-oze');
  });

  it('klik „Rozbudowa istniejącej sieci" → onWybierzCel("rozbudowa")', () => {
    const onWybierzCel = vi.fn();
    render(<CelProjektu onWybierzCel={onWybierzCel} />);
    fireEvent.click(screen.getByText(OTWORZ_STRINGS.celRozbudowa));
    expect(onWybierzCel).toHaveBeenCalledWith('rozbudowa');
  });

  it('klik „Audyt istniejącej sieci" → onWybierzCel("audyt")', () => {
    const onWybierzCel = vi.fn();
    render(<CelProjektu onWybierzCel={onWybierzCel} />);
    fireEvent.click(screen.getByText(OTWORZ_STRINGS.celAudyt));
    expect(onWybierzCel).toHaveBeenCalledWith('audyt');
  });

  it('kafle są przyciskami z dostępną nazwą (tytuł + opis)', () => {
    render(<CelProjektu onWybierzCel={() => {}} />);
    const przyciski = screen.getAllByRole('button');
    expect(przyciski).toHaveLength(4);
    expect(
      przyciski.some((p) => p.getAttribute('aria-label')?.startsWith(OTWORZ_STRINGS.celNowaSiec)),
    ).toBe(true);
  });
});
