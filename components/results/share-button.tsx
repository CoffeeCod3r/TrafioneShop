"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, Link2, Loader2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import { cardUrl } from "@/lib/og/card";

type ShareButtonProps = { resultId: string; refCode: string | null };

type Status = "idle" | "working" | "downloaded" | "copied" | "error";

/**
 * Shares the 1080×1920 PNG card through the Web Share API (TikTok, Instagram, Messenger…).
 * Falls back to downloading the image when file sharing is not available.
 */
export function ShareButton({ resultId, refCode }: ShareButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  // Prefetched so navigator.share runs right after the tap (Safari requires a fresh user gesture).
  const fileRef = useRef<File | null>(null);
  const fileName = `prezenty-${refCode ?? resultId.slice(0, 8)}.png`;

  function shareUrl(): string {
    const url = new URL(`/wynik/${resultId}`, window.location.origin);
    if (refCode) url.searchParams.set("ref", refCode);
    return url.toString();
  }

  async function loadFile(): Promise<File> {
    if (fileRef.current) return fileRef.current;
    const response = await fetch(cardUrl(resultId));
    if (!response.ok) throw new Error("card unavailable");
    fileRef.current = new File([await response.blob()], fileName, { type: "image/png" });
    return fileRef.current;
  }

  // Prefetch the PNG (~250 KB) only when the button gets close to the screen, not on every view.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadFile().catch(() => undefined);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch once per result
  }, [resultId]);

  function download(file: File) {
    const href = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = href;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setStatus("downloaded");
  }

  async function share() {
    track("share_clicked", { method: "card" });
    setStatus("working");
    let file: File;
    try {
      file = await loadFile();
    } catch {
      setStatus("error");
      return;
    }

    const data: ShareData = {
      files: [file],
      title: "Prezentoskop",
      // Many apps drop `url` when files are shared, so the link goes into the text too.
      text: `AI dobrało prezenty w 60 sekund. Zobacz: ${shareUrl()}`,
    };
    if (navigator.canShare?.(data)) {
      try {
        await navigator.share(data);
        setStatus("idle");
        return;
      } catch (caught) {
        if ((caught as DOMException).name === "AbortError") {
          setStatus("idle");
          return;
        }
        // NotAllowedError etc.: fall through to download.
      }
    }
    download(file);
  }

  async function copyLink() {
    track("share_clicked", { method: "link" });
    try {
      await navigator.clipboard.writeText(shareUrl());
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="xl" onClick={share} disabled={status === "working"}>
        {status === "working" ? <Loader2 className="animate-spin" aria-hidden /> : <Share2 aria-hidden />}
        Udostępnij wynik
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={copyLink} className="self-center">
        {status === "copied" ? <Check aria-hidden /> : <Link2 aria-hidden />}
        {status === "copied" ? "Link skopiowany" : "Kopiuj link"}
      </Button>
      <p className="text-center text-sm text-muted-foreground" role="status" aria-live="polite">
        {status === "downloaded" && (
          <span className="inline-flex items-center gap-1">
            <Download className="size-4" aria-hidden />
            Obraz pobrany. Dodaj go do relacji lub wiadomości.
          </span>
        )}
        {status === "error" && "Nie udało się przygotować obrazu. Spróbuj ponownie."}
      </p>
    </div>
  );
}
