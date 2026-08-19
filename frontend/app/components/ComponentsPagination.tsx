"use client";

import { useRef } from "react";

type ComponentsPaginationProps = {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
};

function buildVisiblePages(page: number, totalPages: number): number[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  const nextStart = Math.max(1, end - 4);

  return Array.from({ length: end - nextStart + 1 }, (_, index) => nextStart + index);
}

export function ComponentsPagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange
}: ComponentsPaginationProps) {
  const limitInputRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const visiblePages = buildVisiblePages(page, totalPages);

  function commitLimit() {
    const nextLimit = Number(limitInputRef.current?.value ?? limit);

    if (!Number.isFinite(nextLimit) || nextLimit < 1) {
      if (limitInputRef.current) {
        limitInputRef.current.value = String(limit);
      }
      return;
    }

    const normalizedLimit = Math.floor(nextLimit);

    if (normalizedLimit !== limit) {
      onLimitChange(normalizedLimit);
    }

    if (limitInputRef.current) {
      limitInputRef.current.value = String(normalizedLimit);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-300">
          Page <span className="font-medium text-slate-100">{page}</span> of{" "}
          <span className="font-medium text-slate-100">{totalPages}</span> ·{" "}
          <span className="font-medium text-slate-100">{total}</span> total components
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>Rows per page</span>
          <input
            key={limit}
            ref={limitInputRef}
            type="number"
            min={1}
            step={1}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitLimit();
              }
            }}
            defaultValue={limit}
            className="w-24 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-400/40"
            aria-label="Rows per page"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>

        {visiblePages[0] > 1 ? (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              1
            </button>
            {visiblePages[0] > 2 ? <span className="px-1 text-slate-500">…</span> : null}
          </>
        ) : null}

        {visiblePages.map((visiblePage) => {
          const isActive = visiblePage === page;

          return (
            <button
              key={visiblePage}
              type="button"
              onClick={() => onPageChange(visiblePage)}
              className={[
                "rounded-xl border px-3 py-2 text-sm transition",
                isActive
                  ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
              ].join(" ")}
            >
              {visiblePage}
            </button>
          );
        })}

        {visiblePages[visiblePages.length - 1] < totalPages ? (
          <>
            {visiblePages[visiblePages.length - 1] < totalPages - 1 ? (
              <span className="px-1 text-slate-500">…</span>
            ) : null}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              {totalPages}
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
