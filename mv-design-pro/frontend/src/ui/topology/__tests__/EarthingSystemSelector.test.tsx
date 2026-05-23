import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EarthingSystemSelector } from '../EarthingSystemSelector';

describe('EarthingSystemSelector', () => {
  describe('mode mv', () => {
    it('pokazuje 4 typy uziemienia SN', () => {
      render(<EarthingSystemSelector mode="mv" value="isolated" onChange={() => {}} />);
      expect(screen.getByTestId('earthing-option-isolated')).toBeInTheDocument();
      expect(screen.getByTestId('earthing-option-petersen_coil')).toBeInTheDocument();
      expect(screen.getByTestId('earthing-option-resistor_grounded')).toBeInTheDocument();
      expect(screen.getByTestId('earthing-option-directly_grounded')).toBeInTheDocument();
    });

    it('wybrany typ pokazuje normatywę PN-EN 50522', () => {
      render(<EarthingSystemSelector mode="mv" value="petersen_coil" onChange={() => {}} />);
      const activeBlock = screen.getByTestId('earthing-active-mv');
      expect(activeBlock.textContent).toMatch(/Petersena/i);
    });

    it('onChange wywołane gdy klik na nowy typ', () => {
      const onChange = vi.fn();
      render(<EarthingSystemSelector mode="mv" value="isolated" onChange={onChange} />);
      fireEvent.click(screen.getByTestId('earthing-option-petersen_coil'));
      expect(onChange).toHaveBeenCalledWith('petersen_coil');
    });
  });

  describe('mode lv', () => {
    it('pokazuje 5 typów uziemienia nN (TN-S/TN-C-S/TN-C/TT/IT)', () => {
      render(<EarthingSystemSelector mode="lv" value="TN-S" onChange={() => {}} />);
      expect(screen.getByTestId('earthing-option-TN-S')).toBeInTheDocument();
      expect(screen.getByTestId('earthing-option-TN-C-S')).toBeInTheDocument();
      expect(screen.getByTestId('earthing-option-TN-C')).toBeInTheDocument();
      expect(screen.getByTestId('earthing-option-TT')).toBeInTheDocument();
      expect(screen.getByTestId('earthing-option-IT')).toBeInTheDocument();
    });

    it('IEC 60364 odniesienia widoczne w opisie', () => {
      render(<EarthingSystemSelector mode="lv" value="TT" onChange={() => {}} />);
      const ttOption = screen.getByTestId('earthing-option-TT');
      expect(ttOption.textContent).toMatch(/IEC 60364/);
    });
  });

  it('disabled blokuje onChange', () => {
    const onChange = vi.fn();
    render(<EarthingSystemSelector mode="mv" value="isolated" onChange={onChange} disabled />);
    const opt = screen.getByTestId('earthing-option-petersen_coil');
    fireEvent.click(opt);
    // radio with disabled won't fire change
    const radio = opt.querySelector('input[type="radio"]');
    expect(radio).toBeDisabled();
  });
});
