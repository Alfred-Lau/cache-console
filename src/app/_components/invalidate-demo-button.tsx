"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InvalidateDemoButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/next-cache/revalidate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag: "demo" }),
      });
      if (res.status === 401) {
        setMessage("需要登录后才能使标签失效。");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage(data?.error ?? `失败 (${res.status})`);
        return;
      }
      router.refresh();
      setMessage("已使 demo 标签失效并刷新。");
    } catch {
      setMessage("请求失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={pending}
        className="w-fit rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "失效中…" : "从控制台使它失效"}
      </button>
      {message ? <p className="text-sm text-zinc-400">{message}</p> : null}
    </div>
  );
}
