import { useId, type SelectHTMLAttributes } from "react";
import FieldShell from "@/components/ui/FieldShell";
import { describedBy } from "@/lib/a11y";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
        label: string;
        options: SelectOption[];
        /** Empty first option, e.g. "اختر...". Value is "" so `required` works. */
        placeholder?: string;
        error?: string;
        help?: string;
        invalid?: boolean;
    };

    /**
     * Native <select> on purpose: best accessibility, keyboard and mobile pickers.
     * Use a combobox (future) only when you need search or multi-select.
     */
export default function Select({
        label,
        options,
        placeholder,
        error,
        help,
        invalid,
        id,
        className,
        ...rest
    }: Props) {
    const autoId = useId();
    const selectId = id ?? autoId;
    const bad = !!error || invalid;

    return (
        <FieldShell id={selectId} label={label} error={error} help={help}>
        <div className="relative">
            <select
            id={selectId}
            aria-invalid={bad ? true : undefined}
            aria-describedby={describedBy(selectId, error, help)}
            className={cn("field-input appearance-none pe-10", bad && "field-input-error", className)}
            {...rest}
            >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
                </option>
            ))}
            </select>
            <ChevronDownIcon
            className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-mute"
            />
        </div>
        </FieldShell>
    );
}