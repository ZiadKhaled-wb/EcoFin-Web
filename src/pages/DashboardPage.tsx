import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/ui/Card";
import PageContainer from "@/components/ui/PageContainer";
import { useAuthStore } from "@/store/authStore";

/** Placeholder landing page. Replace with real metrics when the reporting module lands. */
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <PageContainer>
      <PageHeader title="لوحة التحكم" description={`مرحبًا ${user?.username ?? user?.email ?? ""}`} />
      <Card title="ابدأ من هنا" description="الوحدات تُضاف تباعًا من القائمة الجانبية.">
        <p className="type-body">تم تسجيل الدخول بنجاح.</p>
      </Card>
    </PageContainer>
  );
}