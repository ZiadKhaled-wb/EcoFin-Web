import { cn } from "@/lib/cn";

/** Placeholder block while content loads. Size it with className (h-4 w-32...). */
export default function Skeleton({ className }: { className?: string }) {
    return <div aria-hidden className={cn("skeleton", className)} />;
}