import type { ReactNode } from "react";

export default function Notice({
  tone = "info",
  children,
}: {
  tone?: "success" | "error" | "info";
  children: ReactNode;
}) {
  return (
    <p role="status" className={`notice notice-${tone}`}>
      {children}
    </p>
  );
}
