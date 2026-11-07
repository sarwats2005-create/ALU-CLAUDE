"use client";
import { Fragment, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpenText,
  Coins,
  DatabaseBackup,
  Eraser,
  Factory,
  HandCoins,
  History,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Vault,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/lib/client/app-context";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SectionLabel, SummaryCell, SummaryStrip } from "@/components/Summary";
import { cx } from "@/lib/cx";
import { RULES, skuFor } from "@/lib/rules";
import { fmtAmount, fmtKg, fmtMoney, fmtRate } from "@/lib/money";
import {
  ABOUT_CHANGELOG,
  ABOUT_CORE,
  ABOUT_SECTIONS,
  ABOUT_UPDATED,
  ABOUT_VERSION,
  ruleFlag,
  ruleText,
  type AboutFlag,
  type AboutIcon,
  type AboutSection,
  type ChangeType,
  type L,
} from "@/lib/about";

export type AboutLive = {
  lowStockKg: string;
  customerDueUsd: string;
  beneficiaryDueUsd: string;
  overdueDays: number;
  vaultMinUsd: string;
  vaultMinIqd: string;
  expenseVaultMode: string;
  expensePin: boolean;
  flags: Record<AboutFlag, boolean>;
};

const ICONS: Record<AboutIcon, LucideIcon> = {
  core: Sparkles,
  money: Coins,
  pos: ShoppingCart,
  purchase: Truck,
  processing: Factory,
  customers: Users,
  beneficiaries: HandCoins,
  vault: Vault,
  expenses: Wallet,
  invoices: ReceiptText,
  reports: BarChart3,
  alerts: Bell,
  access: ShieldCheck,
  backup: DatabaseBackup,
  erase: Eraser,
};

const CHANGE_TONE: Record<ChangeType, "success" | "brand" | "danger"> = {
  added: "success",
  changed: "brand",
  removed: "danger",
};

/** "2026-10-04" → "04/10/2026" (plain string work: same on server and browser, no hydration drift). */
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** **bold** → <strong>. */
function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-ink">
            {p}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

const norm = (s: string) => s.replace(/\*\*/g, "").toLowerCase();

export function AboutView({ live }: { live: AboutLive }) {
  const { t, lang, rate, user, can } = useApp();
  const ku = lang === "ku";
  const [q, setQ] = useState("");

  // Every {placeholder} is filled from the enforced constants (RULES) or the live settings.
  const vals = useMemo<Record<string, string>>(
    () => ({
      editHours: String(RULES.editWindowHours),
      eraseMin: String(RULES.eraseMinutes),
      pinTries: String(RULES.pinMaxTries),
      pinLock: String(RULES.pinLockMinutes),
      loginTries: String(RULES.loginMaxTries),
      loginWindow: String(RULES.loginWindowMinutes),
      dailyHours: String(RULES.dailySnapshotHours),
      keepDaily: String(RULES.keepDailySnapshots),
      keepOther: String(RULES.keepOtherSnapshots),
      folderDays: String(RULES.folderBackupDays),
      pinMin: String(RULES.pinMinDigits),
      pinMax: String(RULES.pinMaxDigits),
      skuExample: skuFor(1),
      rate: `100 USD = ${fmtRate(rate)} IQD`,
      lowStock: fmtKg(live.lowStockKg),
      custDue: fmtMoney(live.customerDueUsd),
      benDue: fmtMoney(live.beneficiaryDueUsd),
      overdueDays: String(live.overdueDays),
      vaultMinUsd: fmtMoney(live.vaultMinUsd),
      vaultMinIqd: fmtAmount(live.vaultMinIqd, "IQD"),
      expVault: t(
        live.expenseVaultMode === "USD"
          ? "about.vUSD"
          : live.expenseVaultMode === "IQD"
            ? "about.vIQD"
            : "about.vAsk",
      ),
      expPin: t(live.expensePin ? "about.pinOn" : "about.pinOff"),
    }),
    [live, rate, t],
  );
  const fill = (s: string) =>
    s.replace(/\{(\w+)\}/g, (m, k: string) => vals[k] ?? m);
  const pick = (l: L) => fill(ku ? l[1] : l[0]);
  /** A rule matches the search in either language. */
  const query = norm(q.trim());
  const hit = (l: L) =>
    !query ||
    norm(fill(l[0])).includes(query) ||
    norm(fill(l[1])).includes(query);

  const visible = (s: AboutSection) =>
    user.isOwner || (!s.ownerOnly && (!s.pages || s.pages.some((p) => can(p))));
  const sections = ABOUT_SECTIONS.filter(visible)
    .map((s) => ({
      ...s,
      shown: s.rules.filter(
        (r) =>
          hit(ruleText(r)) || (!!query && (hit(s.title) || hit(s.summary))),
      ),
    }))
    .filter((s) => s.shown.length > 0);
  const core = ABOUT_CORE.filter(hit);
  const total = core.length + sections.reduce((n, s) => n + s.shown.length, 0);

  return (
    <div className="min-w-0">
      <PageHeader title={t("about.title")} subtitle={t("about.subtitle")} />

      {/* Live values: the same numbers the app enforces right now. */}
      <SectionLabel id="about-live">{t("about.live")}</SectionLabel>
      <SummaryStrip cols={4} className="mb-6 md:mb-8">
        <SummaryCell
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
          label={t("about.rate")}
          value={<span dir="ltr">{fmtRate(rate)}</span>}
          sub={t("about.rateSub")}
        />
        <SummaryCell
          icon={<ReceiptText className="h-4 w-4" aria-hidden="true" />}
          label={t("about.editWindow")}
          value={t("about.editWindowV", { n: RULES.editWindowHours })}
          sub={t("about.editWindowSub")}
        />
        <SummaryCell
          icon={<Factory className="h-4 w-4" aria-hidden="true" />}
          label={t("about.lowStock")}
          value={<span dir="ltr">{fmtKg(live.lowStockKg)}</span>}
          sub={t("about.lowStockSub")}
        />
        <SummaryCell
          icon={<History className="h-4 w-4" aria-hidden="true" />}
          label={t("about.version")}
          value={<span dir="ltr">v{ABOUT_VERSION}</span>}
          sub={t("about.updated", { d: dmy(ABOUT_UPDATED) })}
          href="#about-changes"
        />
      </SummaryStrip>

      {/* Search: the fastest way to the one rule you're looking for. */}
      <div className="mb-6 md:mb-8">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("about.search")}
            aria-label={t("about.search")}
            className="h-14 w-full rounded-ctl border-2 border-transparent bg-surface ps-12 pe-14 text-body text-ink outline-none placeholder:text-muted transition-colors duration-200 focus:border-brand [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={t("common.clear")}
              className="absolute end-1.5 top-1/2 inline-flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-ctl text-muted hover:bg-tint hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {query ? (
          <p className="mt-2 text-meta text-muted" aria-live="polite">
            {total
              ? t("about.matches", { n: total })
              : t("about.noMatch", { q: q.trim() })}
          </p>
        ) : null}
      </div>

      {/* The 5 core rules first (serial position + 80/20): the one card with colour. */}
      {core.length ? (
        <section
          aria-labelledby="about-core"
          className="mb-8 overflow-hidden rounded-card bg-surface"
        >
          <div className="flex items-start gap-3 bg-tint px-4 py-4 md:px-6">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="about-core" className="text-title font-semibold text-ink">
                {t("about.core")}
              </h2>
              <p className="text-meta text-muted">{t("about.coreHint")}</p>
            </div>
          </div>
          <ol className="divide-y divide-line-soft">
            {core.map((r) => (
              <li key={r[0]} className="flex gap-3 px-4 py-4 md:px-6">
                <span
                  className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-caption font-bold text-on-brand"
                  aria-hidden="true"
                >
                  {ABOUT_CORE.indexOf(r) + 1}
                </span>
                <p className="min-w-0 text-body leading-relaxed text-ink">
                  <Rich text={pick(r)} />
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sections.length ? (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          {/* Contents: sticky on desktop, a scrollable chip row on phones. */}
          <nav
            aria-label={t("about.contents")}
            className="min-w-0 lg:sticky lg:top-6 lg:self-start"
          >
            <SectionLabel>{t("about.contents")}</SectionLabel>
            <ul className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
              {sections.map((s) => {
                const Icon = ICONS[s.icon];
                return (
                  <li key={s.id} className="shrink-0">
                    <a
                      href={`#rule-${s.id}`}
                      className="flex h-14 items-center gap-2.5 whitespace-nowrap rounded-ctl bg-surface px-4 text-meta font-semibold text-ink transition-all duration-200 hover:scale-[1.02] hover:bg-tint-2 lg:bg-transparent lg:px-3 lg:hover:bg-surface"
                    >
                      <Icon
                        className="h-4 w-4 shrink-0 text-brand-ink"
                        aria-hidden="true"
                      />
                      <span className="truncate">{pick(s.title)}</span>
                    </a>
                  </li>
                );
              })}
              <li className="shrink-0">
                <a
                  href="#about-changes"
                  className="flex h-14 items-center gap-2.5 whitespace-nowrap rounded-ctl bg-surface px-4 text-meta font-semibold text-ink transition-all duration-200 hover:scale-[1.02] hover:bg-tint-2 lg:bg-transparent lg:px-3 lg:hover:bg-surface"
                >
                  <History
                    className="h-4 w-4 shrink-0 text-brand-ink"
                    aria-hidden="true"
                  />
                  {t("about.changes")}
                </a>
              </li>
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-5">
            <SectionLabel>{t("about.byArea")}</SectionLabel>
            {sections.map((s) => {
              const Icon = ICONS[s.icon];
              return (
                <Card
                  key={s.id}
                  className="min-w-0 scroll-mt-20 overflow-hidden"
                  aria-labelledby={`rule-${s.id}-h`}
                >
                  <div
                    id={`rule-${s.id}`}
                    className="flex scroll-mt-20 items-start gap-3 border-b border-line-soft px-4 py-4 md:px-6"
                  >
                    <span
                      className={cx(
                        "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
                        s.icon === "erase"
                          ? "bg-danger-tint text-danger-ink"
                          : "bg-tint text-brand-ink",
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2
                          id={`rule-${s.id}-h`}
                          className="text-title font-semibold text-ink"
                        >
                          {pick(s.title)}
                        </h2>
                        {s.ownerOnly ? (
                          <Badge tone="warning">{t("about.ownerOnly")}</Badge>
                        ) : null}
                      </div>
                      <p className="text-meta text-muted">{pick(s.summary)}</p>
                    </div>
                    <span className="hidden shrink-0 text-caption text-muted sm:block">
                      {t("about.rules", { n: s.rules.length })}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-3 px-4 py-4 md:px-6">
                    {s.shown.map((r) => {
                      const flag = ruleFlag(r);
                      const off = flag !== null && !live.flags[flag];
                      return (
                        <li
                          key={ruleText(r)[0]}
                          className={cx("flex gap-3", off && "opacity-60")}
                        >
                          <span
                            className={cx(
                              "mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full",
                              off ? "bg-muted" : "bg-brand",
                            )}
                            aria-hidden="true"
                          />
                          <p className="min-w-0 flex-1 text-body leading-relaxed text-ink">
                            <Rich text={pick(ruleText(r))} />
                            {off ? (
                              <span
                                className="ms-2 inline-block align-middle"
                                title={t("about.offHint")}
                              >
                                <Badge>{t("about.off")}</Badge>
                              </span>
                            ) : null}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}

            {/* Change log: the record of every rule added, changed or removed. */}
            <Card
              className="min-w-0 scroll-mt-20"
              aria-labelledby="about-changes-h"
            >
              <div
                id="about-changes"
                className="flex scroll-mt-20 items-center gap-3 border-b border-line-soft px-4 py-4 md:px-6"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tint text-brand-ink">
                  <History className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2
                  id="about-changes-h"
                  className="text-title font-semibold text-ink"
                >
                  {t("about.changes")}
                </h2>
              </div>
              <ol className="flex flex-col px-4 py-2 md:px-6">
                {ABOUT_CHANGELOG.map((c, i) => (
                  <li
                    key={c.version}
                    className={cx(
                      "grid gap-x-4 gap-y-2 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]",
                      i > 0 && "border-t border-line-soft",
                    )}
                  >
                    <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0.5">
                      <span
                        className="fig text-body font-bold text-ink"
                        dir="ltr"
                      >
                        v{c.version}
                      </span>
                      <span className="fig text-caption text-muted" dir="ltr">
                        {dmy(c.date)}
                      </span>
                    </div>
                    <ul className="flex min-w-0 flex-col gap-2">
                      {c.items.map((it) => (
                        <li
                          key={it.text[0]}
                          className="flex items-start gap-2.5"
                        >
                          <Badge
                            tone={CHANGE_TONE[it.type]}
                            className="mt-0.5 shrink-0"
                          >
                            {t(`about.${it.type}`)}
                          </Badge>
                          <span className="min-w-0 text-body text-ink">
                            {pick(it.text)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      ) : query && !core.length ? (
        <Card className="p-8 text-center">
          <BookOpenText
            className="mx-auto mb-3 h-8 w-8 text-muted"
            aria-hidden="true"
          />
          <p className="text-body text-muted">
            {t("about.noMatch", { q: q.trim() })}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
