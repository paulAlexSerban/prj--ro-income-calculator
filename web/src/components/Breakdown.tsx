import type { BreakdownLine, RegimeResult } from "@offer-compare/engine";
import { money, ratePercent } from "@/lib/format";
import { Badge } from "./ui";

export function FormulaList({ lines }: { lines: BreakdownLine[] }) {
  return (
    <div className="grid gap-2">
      {lines.map((line) => (
        <details key={line.key} className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span>{line.label}</span>
            <span className="num">{money(line.amount_ron)}</span>
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">{line.formula}</p>
        </details>
      ))}
    </div>
  );
}

export function RegimeCard({ regime }: { regime: RegimeResult }) {
  return (
    <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{regime.label}</h3>
        {regime.best ? <Badge className="border-teal-700 text-teal-700">Best net</Badge> : null}
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Net / month</dt>
          <dd className="num">{money(regime.net_monthly_ron)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Net / year</dt>
          <dd className="num">{money(regime.net_yearly_ron)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Effective tax</dt>
          <dd className="num">{ratePercent(regime.effective_tax_rate)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Employer cost / month</dt>
          <dd className="num">{regime.employer_cost_monthly_ron == null ? "—" : money(regime.employer_cost_monthly_ron)}</dd>
        </div>
      </dl>
      {regime.warnings.length ? (
        <ul className="mb-3 grid gap-1 text-xs text-amber-700 dark:text-amber-400">
          {regime.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <FormulaList lines={regime.lines} />
    </article>
  );
}
