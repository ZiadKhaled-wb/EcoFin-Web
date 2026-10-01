import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/config/navigation";

function Leaf({ item, nested, onNavigate }: { item: NavItem; nested?: boolean; onNavigate?: () => void }) {
    if (!item.to) return null;
    const Icon = item.icon;
    return (
        <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) => cn("sidebar-link", nested && "ps-11", isActive && "sidebar-link-active")}
        >
        {Icon && !nested && <Icon />}
        <span className="truncate">{item.label}</span>
        </NavLink>
    );
}

function Group({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
    const { pathname } = useLocation();
    const active = item.children?.some((c) => c.to && pathname.startsWith(c.to)) ?? false;
    const [open, setOpen] = useState(active);
    const panelId = `nav-${item.id}`;
    const Icon = item.icon;

    return (
        <div>
        <button
            type="button"
            className={cn("sidebar-link justify-between", active && !open && "text-brand-800")}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
        >
            <span className="flex items-center gap-3">
            {Icon && <Icon />}
            {item.label}
            </span>
            <ChevronDownIcon size={16} className={cn("transition-transform duration-200", open && "rotate-180")} />
        </button>
        {open && (
            <div id={panelId} className="mt-1 space-y-1">
            {item.children?.map((c) => (
                <Leaf key={c.id} item={c} nested onNavigate={onNavigate} />
            ))}
            </div>
        )}
        </div>
    );
    }

    /** The menu list. Shared by the desktop sidebar and the mobile drawer. */
    export default function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
    return (
        <nav aria-label="القائمة الرئيسية" className="space-y-1 p-3">
        {items.map((item) =>
            item.children ? (
            <Group key={item.id} item={item} onNavigate={onNavigate} />
            ) : (
            <Leaf key={item.id} item={item} onNavigate={onNavigate} />
            ),
        )}
        </nav>
    );
}