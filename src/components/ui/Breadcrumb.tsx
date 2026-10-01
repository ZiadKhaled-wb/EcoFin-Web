import { Link } from "react-router-dom";
import { ChevronEndIcon } from "@/components/ui/Icons";

export type Crumb = { label: string; to?: string };

export default function Breadcrumb({ items }: { items: Crumb[] }) {
    return (
        <nav aria-label="مسار التنقل">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-mute">
            {items.map((c, i) => {
            const last = i === items.length - 1;
            return (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {c.to && !last ? (
                    <Link to={c.to} className="hover:text-brand-700 hover:underline">
                    {c.label}
                    </Link>
                ) : (
                    <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-ink" : undefined}>
                    {c.label}
                    </span>
                )}
                {!last && <ChevronEndIcon size={14} />}
                </li>
            );
            })}
        </ol>
        </nav>
    );
}