"use client";

// Presentational table for one page of components. All data — pagination,
// filtering, download — is owned by ComponentsPanel; this renders rows and the
// empty state, nothing more.

import type { ScanComponent } from "../lib/scan-api";

export function ComponentsTable({ components }: { components: ScanComponent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-slate-950/60 text-slate-300">
          <tr>
            <th className="px-6 py-3 font-medium">Name</th>
            <th className="px-6 py-3 font-medium">Version</th>
            <th className="px-6 py-3 font-medium">Type</th>
            <th className="px-6 py-3 font-medium">PURL</th>
            <th className="px-6 py-3 font-medium">Licenses</th>
            <th className="px-6 py-3 font-medium">Direct</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {components.length ? (
            components.map((component) => (
              <tr key={component.id} className="align-top text-slate-100">
                <td className="px-6 py-4 font-medium">{component.name}</td>
                <td className="px-6 py-4 font-mono text-slate-300">{component.version}</td>
                <td className="px-6 py-4 text-slate-300">{component.type}</td>
                <td className="px-6 py-4 font-mono text-xs text-slate-300">{component.purl}</td>
                <td className="px-6 py-4 text-slate-300">
                  <div className="flex flex-wrap gap-2">
                    {component.licenses.map((license) => (
                      <span
                        key={license}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs"
                      >
                        {license}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={[
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                      component.direct
                        ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                        : "border border-slate-500/20 bg-slate-500/10 text-slate-300"
                    ].join(" ")}
                  >
                    {component.direct ? "Direct" : "Transitive"}
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-6 py-6 text-slate-400" colSpan={6}>
                No components on this page.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
