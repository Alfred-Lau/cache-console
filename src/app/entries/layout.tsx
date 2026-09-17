import type { ReactNode } from "react";
import { requirePageSession } from "@/app/_lib/guards";

export default async function EntriesLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePageSession();
  return children;
}
