"use client";

import type { AnchorHTMLAttributes } from "react";

import { track } from "@/lib/analytics/client";

type TrackedLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  source: "free" | "share" | "web";
  position: number;
};

/** Outbound product link that also sends "product_clicked" (only with analytics consent). */
export function TrackedLink({ source, position, onClick, ...props }: TrackedLinkProps) {
  return (
    <a
      {...props}
      onClick={(event) => {
        track("product_clicked", { source, position });
        onClick?.(event);
      }}
    />
  );
}
