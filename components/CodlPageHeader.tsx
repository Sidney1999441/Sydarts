import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const posterMap = {
  focus: {
    src: "/codl/codl-focus-poster.jpg",
    position: "74% 34%"
  },
  pattern: {
    src: "/codl/codl-pattern-poster.jpg",
    position: "62% 36%"
  },
  white: {
    src: "/codl/codl-white-poster.jpg",
    position: "58% 32%"
  }
};

export function CodlPageHeader({
  kicker,
  title,
  description,
  icon,
  actions,
  poster = "pattern",
  dark = false,
  className
}: {
  kicker: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  poster?: keyof typeof posterMap;
  dark?: boolean;
  className?: string;
}) {
  const asset = posterMap[poster];

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg border border-wire p-5 shadow-[0_22px_58px_rgb(17_24_39/0.08)] sm:p-6",
        dark ? "bg-primary text-white" : "bg-surface text-ink",
        className
      )}
    >
      <img
        src={asset.src}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: asset.position }}
      />
      <div className={cn("absolute inset-0", dark ? "bg-primary/90" : "bg-white/80")} />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <img
            src={dark ? "/codl/codl-logo-dark.png" : "/codl/codl-logo-light.png"}
            alt="CODL logo"
            className={cn("mb-4 h-auto w-[150px] object-contain sm:w-[210px]", dark && "mix-blend-normal")}
          />
          <div className={cn("codl-page-kicker", dark && "text-white")}>
            <span className={cn("codl-rule", dark && "bg-white")} aria-hidden />
            {kicker}
          </div>
          <div className="mt-3 flex items-center gap-3">
            {icon ? (
              <span
                className={cn(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-lg",
                  dark ? "bg-white text-primary" : "bg-primary text-white"
                )}
              >
                {icon}
              </span>
            ) : null}
            <h1 className={cn("text-3xl font-black sm:text-4xl", dark ? "text-white" : "text-primary")}>
              {title}
            </h1>
          </div>
          {description ? (
            <p className={cn("mt-3 max-w-2xl text-sm font-bold leading-6", dark ? "text-white/70" : "text-muted")}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}
