import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { CalendarIcon } from '@/components/ui/Icons';
import { cn } from '@/lib/cn';
import { normalizeDigits } from '@/lib/number';
import { t } from '@/i18n';

type Part = 'day' | 'month' | 'year';
type Parts = Record<Part, string>;

const ORDER: Part[] = ['day', 'month', 'year'];
const LENGTH: Record<Part, number> = { day: 2, month: 2, year: 4 };
const EMPTY: Parts = { day: '', month: '', year: '' };

/** "2026-10-01" -> its three parts; anything else -> empty parts. */
function split(value: string): Parts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? { year: m[1]!, month: m[2]!, day: m[3]! } : EMPTY;
}

/** The ISO date when the three parts make a real day (31 Feb doesn't), else "". */
function compose({ day, month, year }: Parts): string {
  if (year.length !== 4 || !month || !day) return '';
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1000 || m < 1 || m > 12 || d < 1) return '';
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return '';
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A pasted date: "2026-10-01", "01/10/2026", "1-10-2026" (day first, as in Egypt). */
function parsePasted(text: string): Parts | null {
  const s = normalizeDigits(text.trim());
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return { year: m[1]!, month: m[2]!.padStart(2, '0'), day: m[3]!.padStart(2, '0') };
  m = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})$/.exec(s);
  if (m) return { day: m[1]!.padStart(2, '0'), month: m[2]!.padStart(2, '0'), year: m[3]! };
  return null;
}

/** The setter React watches: setting it this way makes React fire the input's onChange. */
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

/** The Input props: `type`, `icon` and `ltr` are accepted and ignored (always a date, LTR digits). */
export type DateInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  icon?: ReactNode;
  ltr?: boolean;
  ref?: Ref<HTMLInputElement>;
};

/**
 * A date field in the page's language: day / month / year boxes (يوم / شهر / سنة in Arabic, in
 * reading order) instead of the browser's own date box, whose format (mm/dd/yyyy) follows the
 * browser and can't be translated. Same contract as `<input type="date">`: `value` is
 * "YYYY-MM-DD" or "", and `onChange` gets a change event of a real date input, so callers keep
 * reading `e.target.value`. The calendar button opens the device's date picker.
 *
 * Typing moves on by itself (two digits for the day and month), "/" or "-" also moves on,
 * Backspace in an empty box goes back, and a pasted date fills all three. Arabic-Indic digits
 * are accepted.
 */
export default function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  name,
  disabled,
  required,
  readOnly,
  invalid,
  className,
  ref,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
}: DateInputProps) {
  const current = typeof value === 'string' ? value : '';
  const [parts, setParts] = useState<Parts>(() => split(current));
  const [seen, setSeen] = useState(current);
  const native = useRef<HTMLInputElement | null>(null);
  const boxes = useRef<Record<Part, HTMLInputElement | null>>({
    day: null,
    month: null,
    year: null,
  });

  // A new value from outside (a "clear" button, the picker, a reset) replaces what is shown,
  // unless it is what the boxes already say (a half-typed date stays while it says "").
  if (current !== seen) {
    setSeen(current);
    if (current !== compose(parts)) setParts(split(current));
  }

  function emit(next: Parts) {
    setParts(next);
    const iso = compose(next);
    const el = native.current;
    if (!el || iso === current || !valueSetter) return;
    valueSetter.call(el, iso);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const focus = (part: Part | undefined) => {
    const el = part ? boxes.current[part] : null;
    el?.focus();
    el?.select();
  };
  const after = (part: Part) => ORDER[ORDER.indexOf(part) + 1];
  const before = (part: Part) => ORDER[ORDER.indexOf(part) - 1];

  function type(part: Part, e: ChangeEvent<HTMLInputElement>) {
    const raw = normalizeDigits(e.target.value);
    const pasted = parsePasted(raw);
    if (pasted) {
      emit(pasted);
      return;
    }
    let digits = raw.replace(/\D/g, '').slice(0, LENGTH[part]);
    let done = digits.length === LENGTH[part] || (/[-/.\s]$/.test(raw) && digits.length > 0);
    // "5" can only be the 5th day and "2" only February: no need to wait for a second digit.
    if (part === 'day' && digits.length === 1 && Number(digits) > 3) done = true;
    if (part === 'month' && digits.length === 1 && Number(digits) > 1) done = true;
    if (done && part !== 'year' && digits.length === 1) digits = '0' + digits;
    emit({ ...parts, [part]: digits });
    if (done) focus(after(part));
  }

  function key(part: Part, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && parts[part] === '' && before(part)) {
      e.preventDefault();
      focus(before(part));
    }
  }

  function paste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = parsePasted(e.clipboardData.getData('text'));
    if (!pasted) return;
    e.preventDefault();
    emit(pasted);
  }

  function openPicker() {
    const el = native.current;
    if (el && typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // Not allowed here (an iframe, an old browser): type the date instead.
      }
    }
    focus('day');
  }

  const bad = invalid || ariaInvalid === true || ariaInvalid === 'true';
  const locked = disabled || readOnly;
  return (
    <div
      role="group"
      aria-describedby={describedBy}
      className={cn(
        'field-input relative flex items-center gap-1',
        'focus-within:border-brand-600 focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand-600/25',
        disabled && 'bg-line text-ink-mute',
        bad && 'field-input-error',
        className,
      )}
    >
      {ORDER.map((part, i) => (
        <span key={part} className="flex items-center gap-1">
          {i > 0 && (
            <span aria-hidden="true" className="text-ink-mute">
              /
            </span>
          )}
          <input
            ref={(el) => {
              boxes.current[part] = el;
            }}
            id={part === 'day' ? id : undefined}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            placeholder={t(`ui.date.${part}`)}
            aria-label={part === 'day' && id ? undefined : t(`ui.date.${part}`)}
            aria-invalid={bad ? true : undefined}
            aria-describedby={describedBy}
            value={parts[part]}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            onChange={(e) => type(part, e)}
            onKeyDown={(e) => key(part, e)}
            onPaste={paste}
            onFocus={(e) => e.target.select()}
            className={cn(
              'min-w-0 border-0 bg-transparent p-0 text-center tabular-nums outline-none',
              'placeholder:text-ink-mute/60 disabled:cursor-not-allowed',
              part === 'year' ? 'w-[4.5ch]' : 'w-[3ch]',
            )}
          />
        </span>
      ))}
      <span className="relative ms-auto">
        <button
          type="button"
          onClick={openPicker}
          disabled={locked}
          aria-label={t('ui.date.openPicker')}
          className="flex size-8 items-center justify-center rounded-control text-ink-mute hover:bg-line hover:text-ink disabled:cursor-not-allowed"
        >
          <CalendarIcon />
        </button>
        {/* The real date input: holds the value for onChange and forms, and opens the picker. */}
        <input
          ref={(el) => {
            native.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) ref.current = el;
          }}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          value={current}
          min={min}
          max={max}
          disabled={disabled}
          onChange={onChange}
          className="pointer-events-none absolute inset-0 size-full opacity-0"
        />
      </span>
    </div>
  );
}
