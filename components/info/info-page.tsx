import type { ReactNode } from "react";

/** Layout of the trust pages (O nas, Jak zarabiamy, Kontakt): readable text, no marketing decoration. */
export function InfoPage({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-6 py-10 leading-relaxed [&_h2]:mt-4 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
        {lead && <p className="text-lg">{lead}</p>}
      </header>
      {children}
    </article>
  );
}
