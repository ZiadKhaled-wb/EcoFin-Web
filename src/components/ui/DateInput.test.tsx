import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FormField from '@/components/ui/FormField';
import Input from '@/components/ui/Input';
import { renderApp } from '@/test/renderApp';
import { t } from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

/** A labelled date field as the pages use it (FormField type="date"), with its value shown. */
function Harness({
  initial = '',
  onValue,
  min,
  max,
}: {
  initial?: string;
  onValue?: (v: string) => void;
  min?: string;
  max?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FormField
        type="date"
        ltr
        label="From"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          setValue(e.target.value);
          onValue?.(e.target.value);
        }}
      />
      <output data-testid="value">{value}</output>
      <button type="button" onClick={() => setValue('')}>
        clear
      </button>
    </>
  );
}

const box = (part: 'day' | 'month' | 'year') =>
  part === 'day'
    ? screen.getByLabelText('From')
    : screen.getByRole('textbox', { name: t(`ui.date.${part}`) });
const value = () => screen.getByTestId('value').textContent;

describe('DateInput', () => {
  it('shows day, month and year in Arabic (يوم / شهر / سنة), not mm/dd/yyyy', async () => {
    await renderApp(<Harness />, { lang: 'ar' });
    expect(screen.getByLabelText('From')).toHaveAttribute('placeholder', 'يوم');
    expect(screen.getByRole('textbox', { name: 'شهر' })).toHaveAttribute('placeholder', 'شهر');
    expect(screen.getByRole('textbox', { name: 'سنة' })).toHaveAttribute('placeholder', 'سنة');
    expect(screen.queryByPlaceholderText(/mm/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'فتح التقويم' })).toBeInTheDocument();
  });

  it('shows Day / Month / Year in English', async () => {
    await renderApp(<Harness />, { lang: 'en' });
    expect(screen.getByLabelText('From')).toHaveAttribute('placeholder', 'Day');
    expect(box('month')).toHaveAttribute('placeholder', 'Month');
    expect(box('year')).toHaveAttribute('placeholder', 'Year');
  });

  it('typing the digits moves from day to month to year and gives YYYY-MM-DD', async () => {
    const onValue = vi.fn();
    await renderApp(<Harness onValue={onValue} />, { lang: 'en' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '01102026');
    expect(value()).toBe('2026-10-01');
    expect(onValue).toHaveBeenLastCalledWith('2026-10-01');
    expect(box('year')).toHaveFocus();
  });

  it('accepts Arabic-Indic digits, single digits with "/" and an obvious first digit', async () => {
    await renderApp(<Harness />, { lang: 'ar' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '٥٢٢٠٢٧');
    expect(value()).toBe('2027-02-05');
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(value()).toBe('');
    await user.type(screen.getByLabelText('From'), '1/1/2026');
    expect(value()).toBe('2026-01-01');
  });

  it('a date that does not exist (31 February) gives no value', async () => {
    await renderApp(<Harness />, { lang: 'en' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '31022026');
    expect(value()).toBe('');
    expect(screen.getByLabelText('From')).toHaveValue('31');
    // The boxes show a date the form doesn't have: marked invalid, and a form won't submit it.
    expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true');
    expect((screen.getByLabelText('From') as HTMLInputElement).validationMessage).toBe(
      t('ui.date.invalid'),
    );
  });

  it('a half-typed date is marked invalid once the focus leaves the field', async () => {
    await renderApp(<Harness />, { lang: 'en' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '1203');
    expect(box('year')).toHaveFocus();
    expect(screen.getByLabelText('From')).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true');
    expect(value()).toBe('');
  });

  it('a required date that is not a real day blocks the form', async () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    await renderApp(
      <form onSubmit={submit}>
        <FormField type="date" label="Start" value="" required onChange={() => {}} />
        <button type="submit">save</button>
      </form>,
      { lang: 'en' },
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Start'), '30022026');
    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('passes on aria-label, one focus and one blur for the whole field, and data-*', async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    await renderApp(
      <>
        <Input
          type="date"
          aria-label="Due"
          data-testid="due"
          value=""
          onChange={() => {}}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <button type="button">elsewhere</button>
      </>,
      { lang: 'en' },
    );
    const user = userEvent.setup();
    expect(screen.getByRole('group', { name: 'Due' })).toHaveAttribute('data-testid', 'due');
    await user.click(screen.getByRole('textbox', { name: 'Due' }));
    await user.click(box('month'));
    await user.click(box('year'));
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('a pasted date fills all three boxes, ISO or day first', async () => {
    await renderApp(<Harness />, { lang: 'en' });
    fireEvent.paste(screen.getByLabelText('From'), {
      clipboardData: { getData: () => '2026-12-25' },
    });
    expect(value()).toBe('2026-12-25');
    fireEvent.paste(box('year'), { clipboardData: { getData: () => '05/11/2026' } });
    expect(value()).toBe('2026-11-05');
    expect(box('month')).toHaveValue('11');
  });

  it('shows a value from outside and empties when it is cleared', async () => {
    await renderApp(<Harness initial="2026-03-09" />, { lang: 'en' });
    expect(screen.getByLabelText('From')).toHaveValue('09');
    expect(box('month')).toHaveValue('03');
    expect(box('year')).toHaveValue('2026');
    await userEvent.setup().click(screen.getByRole('button', { name: 'clear' }));
    expect(screen.getByLabelText('From')).toHaveValue('');
    expect(box('year')).toHaveValue('');
  });

  it('Backspace in an empty box goes back to the previous one', async () => {
    await renderApp(<Harness />, { lang: 'en' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '12');
    expect(box('month')).toHaveFocus();
    await user.keyboard('{Backspace}');
    expect(screen.getByLabelText('From')).toHaveFocus();
  });

  it('keeps min and max on the real date input used by the picker', async () => {
    const { container } = await renderApp(<Harness min="2026-01-01" max="2026-12-31" />, {
      lang: 'en',
    });
    const native = container.querySelector('input[type="date"]');
    expect(native).toHaveAttribute('min', '2026-01-01');
    expect(native).toHaveAttribute('max', '2026-12-31');
    expect(native).toHaveAttribute('tabindex', '-1');
    expect(within(screen.getByRole('group')).getAllByRole('textbox')).toHaveLength(3);
  });
});
