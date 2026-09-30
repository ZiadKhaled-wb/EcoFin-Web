import type { ReactNode } from "react";
import Button, { type ButtonProps } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Props = Omit<ButtonProps, "children" | "icon" | "fullWidth" | "loadingLabel"> & {
    /** Required: icon-only buttons have no visible text. Also used as the tooltip. */
    label: string;
    icon: ReactNode;
};

/** Square icon-only button. 44px by default (36 sm, 56 lg). */
export default function IconButton({ label, icon, variant = "ghost", className, ...rest }: Props) {
    return (
        <Button
        variant={variant}
        aria-label={label}
        title={label}
        loadingLabel=""
        className={cn("btn-icon", className)}
        {...rest}
        >
        {icon}
        </Button>
    );
}