import { unstable_cache } from "next/cache";
import { InvalidateDemoButton } from "@/app/_components/invalidate-demo-button";

const getDemoSnapshot = unstable_cache(
  async () => ({
    timestamp: new Date().toISOString(),
    random: Math.random(),
  }),
  ["demo-snapshot"],
  { tags: ["demo"] },
);

export default async function DemoPage() {
  const snapshot = await getDemoSnapshot();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">联动演示</h1>
      <p className="max-w-2xl text-sm leading-6 text-zinc-400">
        这只是演示 Next.js 自身缓存标签失效：本页用 <code>unstable_cache</code>{" "}
        把一个真实的时间戳和随机数缓存起来，并打上 <code>demo</code> 标签。点击按钮会调用{" "}
        <code>POST /api/next-cache/revalidate</code>，再 <code>router.refresh()</code>
        。它不是 KV 缓存、也不是 SQLite 条目失效。
      </p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm">
        <div>时间戳：{snapshot.timestamp}</div>
        <div className="mt-2">随机数：{snapshot.random}</div>
      </div>
      <InvalidateDemoButton />
    </div>
  );
}
