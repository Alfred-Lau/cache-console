"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type EntryMeta = {
  key: string;
  namespace: string;
  preview: string;
  size_bytes: number;
  tags: string[];
  ttl_seconds: number | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  hits: number;
  misses: number;
};

type ListResponse = {
  items: EntryMeta[];
  total: number;
  page: number;
  pageSize: number;
};

function formatAt(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString("zh-CN");
}

function prettyValue(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // keep raw
  }
  return value;
}

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function EntriesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "expired">("all");
  const [sort, setSort] = useState<"updated" | "hits" | "size" | "key">("updated");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newTtl, setNewTtl] = useState("");
  const [newTags, setNewTags] = useState("");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullValues, setFullValues] = useState<Record<string, string>>({});
  const [editValue, setEditValue] = useState("");
  const [editTtl, setEditTtl] = useState("");
  const [editTags, setEditTags] = useState("");

  const [clearPrefix, setClearPrefix] = useState("");
  const [clearConfirm, setClearConfirm] = useState("");

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (tag) sp.set("tag", tag);
    sp.set("status", status);
    sp.set("sort", sort);
    sp.set("order", order);
    sp.set("page", String(page));
    sp.set("pageSize", String(pageSize));
    return sp.toString();
  }, [q, tag, status, sort, order, page, pageSize]);

  const showNotice = useCallback((ok: boolean, text: string) => {
    setNotice({ ok, text });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/entries?${query}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        showNotice(false, `加载失败 (${res.status})`);
        return;
      }
      const json = (await res.json()) as ListResponse;
      setData(json);
    } catch {
      showNotice(false, "加载失败");
    } finally {
      setLoading(false);
    }
  }, [query, router, showNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  async function api(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const res = await fetch(url, init);
    if (res.status === 401) {
      router.replace("/login");
      return { ok: false, status: 401, body: null };
    }
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  }

  async function createEntry(event: FormEvent) {
    event.preventDefault();
    const ttlSeconds = newTtl.trim() === "" ? undefined : Number(newTtl);
    if (ttlSeconds != null && !Number.isFinite(ttlSeconds)) {
      showNotice(false, "TTL 必须是数字");
      return;
    }
    const result = await api("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: newKey,
        value: newValue,
        ttlSeconds,
        tags: parseTags(newTags),
      }),
    });
    if (result.status === 409) {
      showNotice(false, "键已存在，请用编辑覆盖");
      return;
    }
    if (!result.ok) {
      showNotice(false, "创建失败");
      return;
    }
    setNewKey("");
    setNewValue("");
    setNewTtl("");
    setNewTags("");
    showNotice(true, "已创建");
    await load();
  }

  async function expand(key: string, meta: EntryMeta) {
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    const result = await api(`/api/entries/${encodeURIComponent(key)}`, { method: "GET" });
    if (!result.ok || !result.body || typeof result.body !== "object") {
      showNotice(false, "读取值失败");
      return;
    }
    const entry = result.body as { value?: string; ttl_seconds?: number | null; tags?: string[] };
    const value = typeof entry.value === "string" ? entry.value : meta.preview;
    setFullValues((prev) => ({ ...prev, [key]: value }));
    setEditValue(value);
    setEditTtl(entry.ttl_seconds != null ? String(entry.ttl_seconds) : "");
    setEditTags((entry.tags ?? meta.tags).join(", "));
  }

  async function saveEdit(key: string) {
    const ttlSeconds = editTtl.trim() === "" ? null : Number(editTtl);
    if (ttlSeconds != null && !Number.isFinite(ttlSeconds)) {
      showNotice(false, "TTL 必须是数字");
      return;
    }
    const result = await api(`/api/entries/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        value: editValue,
        ttlSeconds,
        tags: parseTags(editTags),
      }),
    });
    if (!result.ok) {
      showNotice(false, "保存失败");
      return;
    }
    showNotice(true, "已保存");
    await load();
  }

  async function remove(key: string) {
    if (!window.confirm(`删除键 ${key}？`)) return;
    const result = await api(`/api/entries/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!result.ok) {
      showNotice(false, "删除失败");
      return;
    }
    showNotice(true, "已删除");
    if (expanded === key) setExpanded(null);
    await load();
  }

  async function purge() {
    const result = await api("/api/entries/purge", { method: "POST" });
    if (!result.ok) {
      showNotice(false, "清理失败");
      return;
    }
    const purged =
      result.body && typeof result.body === "object" && "purged" in result.body
        ? Number((result.body as { purged: number }).purged)
        : 0;
    showNotice(true, `已清理 ${purged} 条过期`);
    await load();
  }

  async function clearAll(event: FormEvent) {
    event.preventDefault();
    const result = await api("/api/entries/clear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirm: clearConfirm,
        prefix: clearPrefix.trim() || undefined,
      }),
    });
    if (!result.ok) {
      showNotice(false, "清空失败，请确认输入 DELETE");
      return;
    }
    setClearConfirm("");
    showNotice(true, "已清空");
    await load();
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">条目</h1>
        <p className="mt-1 text-sm text-zinc-400">搜索、编辑和清理 SQLite 中的缓存条目。</p>
      </div>

      {notice ? (
        <p className={`text-sm ${notice.ok ? "text-emerald-400" : "text-red-400"}`}>
          {notice.text}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={q}
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
            placeholder="搜索键或值"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={tag}
            onChange={(event) => {
              setPage(1);
              setTag(event.target.value);
            }}
            placeholder="标签筛选"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as typeof status);
            }}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="all">全部</option>
            <option value="active">活跃</option>
            <option value="expired">已过期</option>
          </select>
          <div className="flex gap-2">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="updated">更新时间</option>
              <option value="hits">命中</option>
              <option value="size">大小</option>
              <option value="key">键名</option>
            </select>
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value as typeof order)}
              className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void purge()}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            清理过期
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">新建条目</h2>
        <form onSubmit={(event) => void createEntry(event)} className="grid gap-3 md:grid-cols-2">
          <input
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            placeholder="键"
            required
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={newTtl}
            onChange={(event) => setNewTtl(event.target.value)}
            placeholder="TTL 秒（可空）"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <textarea
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            placeholder="值"
            required
            rows={3}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm md:col-span-2"
          />
          <input
            value={newTags}
            onChange={(event) => setNewTags(event.target.value)}
            placeholder="标签，逗号分隔"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm md:col-span-2"
          />
          <button
            type="submit"
            className="w-fit rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950"
          >
            创建
          </button>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-zinc-800 text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">键</th>
              <th className="px-3 py-2 font-medium">预览</th>
              <th className="px-3 py-2 font-medium">标签</th>
              <th className="px-3 py-2 font-medium">命中</th>
              <th className="px-3 py-2 font-medium">过期</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={6}>
                  加载中…
                </td>
              </tr>
            ) : null}
            {data?.items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={6}>
                  没有条目
                </td>
              </tr>
            ) : null}
            {data?.items.map((item) => (
              <Fragment key={item.key}>
                <tr className="border-b border-zinc-800/80">
                  <td className="px-3 py-2 font-mono">{item.key}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-zinc-400">
                    {item.preview}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{item.tags.join(", ") || "—"}</td>
                  <td className="px-3 py-2 font-mono">{item.hits}</td>
                  <td className="px-3 py-2 text-zinc-400">{formatAt(item.expires_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void expand(item.key, item)}
                        className="text-emerald-400 hover:underline"
                      >
                        {expanded === item.key ? "收起" : "展开"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item.key)}
                        className="text-red-400 hover:underline"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded === item.key ? (
                  <tr className="border-b border-zinc-800">
                    <td colSpan={6} className="bg-zinc-950 px-3 py-3">
                      <div className="grid gap-3">
                        <pre className="overflow-x-auto rounded-md border border-zinc-800 p-3 font-mono text-xs text-zinc-300">
                          {prettyValue(fullValues[item.key] ?? item.preview)}
                        </pre>
                        <textarea
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          rows={5}
                          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            value={editTtl}
                            onChange={(event) => setEditTtl(event.target.value)}
                            placeholder="TTL 秒（空=不过期）"
                            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                          />
                          <input
                            value={editTags}
                            onChange={(event) => setEditTags(event.target.value)}
                            placeholder="标签，逗号分隔"
                            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void saveEdit(item.key)}
                          className="w-fit rounded-md bg-zinc-100 px-3 py-1.5 text-sm text-zinc-950"
                        >
                          保存编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
        <span>
          共 {data?.total ?? 0} 条，第 {page} / {totalPages} 页
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-md border border-zinc-700 px-3 py-1 disabled:opacity-40"
        >
          上一页
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-md border border-zinc-700 px-3 py-1 disabled:opacity-40"
        >
          下一页
        </button>
      </div>

      <section className="rounded-xl border border-red-900/50 bg-zinc-900 p-4">
        <h2 className="mb-2 text-sm font-medium text-red-300">清空</h2>
        <p className="mb-3 text-sm text-zinc-400">
          二次确认：必须在确认框输入 DELETE。可填前缀只清一部分。
        </p>
        <form onSubmit={(event) => void clearAll(event)} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={clearPrefix}
            onChange={(event) => setClearPrefix(event.target.value)}
            placeholder="前缀（可空）"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={clearConfirm}
            onChange={(event) => setClearConfirm(event.target.value)}
            placeholder='输入 DELETE'
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600"
          >
            清空
          </button>
        </form>
      </section>
    </div>
  );
}
