import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderHoverTip } from '@/components/portal/header-hover-tip';

describe('HeaderHoverTip', () => {
  it('shows a Vazirmatn tooltip on hover and hides it after leave', async () => {
    const user = userEvent.setup();
    render(
      <HeaderHoverTip content="توان خرید">
        <button type="button">کیف پول</button>
      </HeaderHoverTip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'کیف پول' }));
    const tip = await screen.findByRole('tooltip', { name: 'توان خرید' });
    expect(tip).toHaveClass('font-sans');
    expect(tip).toHaveClass('fixed');
    await user.unhover(screen.getByRole('button', { name: 'کیف پول' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
