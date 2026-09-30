import type { ReactNode } from "react";
import { InboxIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

/** "Nothing here yet". Always say what to do next, and offer the action. */
export default function EmptyState({
        icon = <InboxIcon width={24} height={24} />,
        title,
        description,
        action,
        tone = "neutral",
        role,
        className,
    }: {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    tone?: "neutral" | "danger";
    role?: "alert" | "status";
    className?: string;
    }) {
    return (
        <div role={role} className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
        <span
            aria-hidden
            className={cn(
            "flex size-12 items-center justify-center rounded-full",
            tone === "danger" ? "bg-danger-50 text-danger-600" : "bg-brand-50 text-brand-600",
            )}
        >
            {icon}
        </span>
        <h3 className="type-section-title">{title}</h3>
        {description && <p className="type-caption max-w-sm">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
        </div>
    );
}