import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Styled Radix dropdown. Keyboard (arrows, typeahead, Esc), focus return and roles come from Radix.
 * Direction comes from the app-level DirectionProvider (main.tsx).
 * Use for row actions and account menus. For choosing a value in a form use Select.
 */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
        className,
        sideOffset = 8,
        align = "end",
        ...props
    }: ComponentProps<typeof Menu.Content>) {
    return (
        <Menu.Portal>
        <Menu.Content sideOffset={sideOffset} align={align} className={cn("menu-content", className)} {...props} />
        </Menu.Portal>
    );
}

export function DropdownMenuItem({
        icon,
        tone = "default",
        className,
        children,
        ...props
    }: ComponentProps<typeof Menu.Item> & { icon?: ReactNode; tone?: "default" | "danger" }) {
    return (
        <Menu.Item className={cn("menu-item", tone === "danger" && "menu-item-danger", className)} {...props}>
        {icon}
        {children}
        </Menu.Item>
    );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
    return <Menu.Label className={cn("px-3 py-2", className)} {...props} />;
}

export function DropdownMenuSeparator() {
    return <Menu.Separator className="my-1.5 h-px bg-line" />;
}