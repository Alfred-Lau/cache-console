import { stats } from "@/lib/cache";
import { requirePageSession } from "@/app/_lib/guards";
import { listRecentOps } from "@/app/_lib/ops";
import { OpsChart } from "@/app/_components/ops-chart";
import { RefreshButton } from "@/app/_components/refresh-button";

export const runtime = "nodejs";

function formatHitRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatAt(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN");
}

export default async function OverviewPage() {
  await requirePageSession();
  const data = stats();
  const ops = listRecentOps(20);

  const cards = [
    { label: "条目数", value: String(data.total) },
    { label: "活跃", value: String(data.active) },
    { label: "已过期", value: String(data.expired) },
    { label: "命中率", value: formatHitRate(data.hitRate) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">概览</h1>
          <p className="mt-1 text-sm text-zinc-400">
            数据来自 SQLite 缓存库，刷新会重新读取服务端统计。
          </p>
        </div>
        <RefreshButton />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4"
          >
            <div className="text-sm text-zinc-400">{card.label}</div>
            <div className="mt-2 font-mono text-2xl text-zinc-50">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">最近 7 天 sets / gets</h2>
        <OpsChart series={data.series} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Top 命中键</h2>
          {data.topKeys.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无条目</p>
          ) : (
            <ol className="space-y-2">
              {data.topKeys.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 font-mono text-sm"
                >
                  <span className="min-w-0 truncate text-zinc-200">{item.key}</span>
                  <span className="shrink-0 text-zinc-400">{item.hits}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">最近操作</h2>
          {ops.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无操作</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-auto text-sm">
              {ops.map((op) => (
                <li key={op.id} className="flex flex-wrap gap-x-3 gap-y-1 text-zinc-300">
                  <span className="font-mono text-zinc-500">{formatAt(op.at)}</span>
                  <span className="text-emerald-400">{op.action}</span>
                  <span className="min-w-0 break-all font-mono">{op.key ?? "—"}</span>
                  <span className="text-zinc-500">{op.source}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
