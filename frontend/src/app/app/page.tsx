import { Suspense } from "react";
import { ChatShell } from "@/components/ChatShell";

export default function AppPage() {
  return (
    <Suspense fallback={null}>
      <ChatShell />
    </Suspense>
  );
}

