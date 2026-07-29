import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FreshnessBadge } from '../FreshnessBadge';
import { INSPECTOR_STRINGS, znacznikNieaktualne } from '../strings';

describe('FreshnessBadge — świeżość wg rewizji', () => {
  it('stan aktualny: rewizja danej równa rewizji modelu → „aktualne", brak „Przelicz"', () => {
    render(<FreshnessBadge rewizjaDanej={215} rewizjaModelu={215} onPrzelicz={() => {}} />);
    expect(screen.getByText(INSPECTOR_STRINGS.aktualne)).toBeInTheDocument();
    expect(screen.queryByText(INSPECTOR_STRINGS.przelicz)).not.toBeInTheDocument();
  });

  it('stan nieaktualny: rewizja starsza → „nieaktualne (rew. a → b)" + akcja „Przelicz"', () => {
    const onPrzelicz = vi.fn();
    render(<FreshnessBadge rewizjaDanej={214} rewizjaModelu={215} onPrzelicz={onPrzelicz} />);
    expect(screen.getByText(znacznikNieaktualne(214, 215))).toBeInTheDocument();
    fireEvent.click(screen.getByText(INSPECTOR_STRINGS.przelicz));
    expect(onPrzelicz).toHaveBeenCalledTimes(1);
  });

  it('nieaktualny bez callbacku: brak przycisku „Przelicz"', () => {
    render(<FreshnessBadge rewizjaDanej={210} rewizjaModelu={215} />);
    expect(screen.getByText(znacznikNieaktualne(210, 215))).toBeInTheDocument();
    expect(screen.queryByText(INSPECTOR_STRINGS.przelicz)).not.toBeInTheDocument();
  });

  it('pokazAktualne=false: stan aktualny nic nie renderuje', () => {
    const { container } = render(
      <FreshnessBadge rewizjaDanej={215} rewizjaModelu={215} pokazAktualne={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('znacznik nieaktualny ma role="status" (a11y)', () => {
    render(<FreshnessBadge rewizjaDanej={214} rewizjaModelu={215} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
