import type { ReactNode } from "react";

/** Label + control slot + help + error. Shared by every field-like component. */
    export default function FieldShell({
        id,
        label,
        error,
        help,
        children,
    }: {
        id: string;
        label: string;
        error?: string;
        help?: string;
        children: ReactNode;
    }) {
    return (
        <div className="space-y-1.5">
        <label htmlFor={id} className="field-label">
            {label}
        </label>
        {children}
        {help && !error && (
            <p id={`${id}-help`} className="help-text">
            {help}
            </p>
        )}
        {error && (
            <p id={`${id}-error`} role="alert" className="error-text">
            {error}
            </p>
        )}
        </div>
    );
}