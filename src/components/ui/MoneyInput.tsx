import NumberInput from "@/components/ui/NumberInput";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof NumberInput>, "decimals" | "allowNegative">;

/** Egyptian pounds, 2 decimals, never negative. For refunds or adjustments use NumberInput. */
export default function MoneyInput({ suffix = "ج.م", ...rest }: Props) {
    return <NumberInput decimals={2} suffix={suffix} {...rest} />;
}