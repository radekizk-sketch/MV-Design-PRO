import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MainMenuBar } from '../MainMenuBar';

describe('MainMenuBar', () => {
  it('eksponuje jeden wpis do kanonicznego edytora sieci', async () => {
    const user = userEvent.setup();
    render(<MainMenuBar />);

    await user.click(screen.getByRole('button', { name: 'Widok' }));

    expect(screen.getByRole('button', { name: /Edytor sieci/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Budowa sieci/i })).not.toBeInTheDocument();
  });
});
