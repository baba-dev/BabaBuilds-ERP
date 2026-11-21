import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export const slugifyHeading = (raw: string) =>
  raw.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const text = (node: ReactNode): string => (typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : "");

export const blogMdxComponents = {
  h2: ({ children }: ComponentPropsWithoutRef<"h2">) => (
    <h2 id={slugifyHeading(text(children))} className="mt-12 scroll-mt-28 text-balance text-3xl font-black tracking-tight text-foreground">{children}</h2>
  ),
  h3: ({ children }: ComponentPropsWithoutRef<"h3">) => (
    <h3 id={slugifyHeading(text(children))} className="mt-8 scroll-mt-28 text-xl font-bold text-foreground">{children}</h3>
  ),
  p: ({ children }: ComponentPropsWithoutRef<"p">) => <p className="mt-4 text-lg leading-8 text-muted-body">{children}</p>,
  ul: ({ children }: ComponentPropsWithoutRef<"ul">) => <ul className="mt-4 list-disc space-y-2 ps-6 text-lg leading-8 text-muted-body marker:text-orange-600">{children}</ul>,
  ol: ({ children }: ComponentPropsWithoutRef<"ol">) => <ol className="mt-4 list-decimal space-y-2 ps-6 text-lg leading-8 text-muted-body marker:font-bold marker:text-orange-600">{children}</ol>,
  strong: ({ children }: ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href = "", children }: ComponentPropsWithoutRef<"a">) => (
    <Link href={href} className="font-semibold text-orange-700 underline decoration-orange-300 underline-offset-4 hover:decoration-orange-600 dark:text-orange-300">{children}</Link>
  ),
  blockquote: ({ children }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="mt-6 rounded-r-2xl border-s-4 border-orange-500 bg-orange-50/70 px-5 py-1 pb-4 dark:bg-orange-950/20">{children}</blockquote>
  ),
  table: ({ children }: ComponentPropsWithoutRef<"table">) => (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-border"><table className="w-full min-w-[32rem] border-collapse text-start text-base">{children}</table></div>
  ),
  th: ({ children }: ComponentPropsWithoutRef<"th">) => <th className="border-b border-border bg-surface-elevated px-4 py-3 text-start font-semibold text-foreground">{children}</th>,
  td: ({ children }: ComponentPropsWithoutRef<"td">) => <td className="border-b border-border px-4 py-3 align-top text-muted-body">{children}</td>,
  hr: () => <hr className="my-10 border-border" />,
  Figure: ({ src, alt, caption, width = 1440, height = 900, priority }: { src: string; alt: string; caption?: string; width?: number; height?: number; priority?: boolean }) => (
    <figure className="my-8">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-sm">
        <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes="(min-width: 768px) 720px, 100vw" className="h-auto w-full" />
      </div>
      {caption ? <figcaption className="mt-3 text-sm text-muted-body">{caption}</figcaption> : null}
    </figure>
  ),
};
