import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { AlertIcon } from "@/components/ui/Icons";

/** A region failed to load. Always offer a retry when one exists. */
export default function ErrorState({
        title = "تعذر تحميل البيانات",
        description = "حدث خطأ أثناء الاتصال بالخادم. حاول مرة أخرى.",
        onRetry,
        className,
    }: {
    title?: string;
    description?: string;
    onRetry?: () => void;
    className?: string;
    }) {
    return (
        <EmptyState
        role="alert"
        tone="danger"
        icon={<AlertIcon width={24} height={24} />}
        title={title}
        description={description}
        className={className}
        action={
            onRetry && (
            <Button variant="secondary" onClick={onRetry}>
                إعادة المحاولة
            </Button>
            )
        }
        />
    );
}