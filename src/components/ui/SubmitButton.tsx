import Button, { type ButtonProps } from "@/components/ui/Button";

type Props = Omit<ButtonProps, "children" | "fullWidth"> & { label: string };

/** Form submit button: a full-width `Button` that defaults to type="submit". */
export default function SubmitButton({ label, loadingLabel, type = "submit", ...rest }: Props) {
    return (
        <Button type={type} fullWidth loadingLabel={loadingLabel ?? label} {...rest}>
        {label}
        </Button>
    );
}