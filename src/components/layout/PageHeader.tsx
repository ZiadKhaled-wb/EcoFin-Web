import type { ReactNode } from "react";
import Breadcrumb, { type Crumb } from "@/components/ui/Breadcrumb";

/** Every page starts with this: breadcrumbs, the single h1, optional description and primary actions. */
export default function PageHeader({
        title,
        description,
        breadcrumbs,
        actions,
    }: {
    title: string;
    description?: string;
    breadcrumbs?: Crumb[];
    actions?: ReactNode;
    }) {
    return (
        <div className="space-y-2 pb-6">
        {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
            <h1 className="type-page-title">{title}</h1>
            {description && <p className="type-caption mt-1">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        </div>
    );
}