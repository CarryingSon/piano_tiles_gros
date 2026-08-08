"use client";

import { useEffect, useRef, useState } from "react";
import { event, navLinks, tickets } from "@/data/event";
import Wordmark from "./Wordmark";

/**
 * Lepljiva navigacija: ob pomiku se skrči in dobi temno podlago.
 * Na mobilnem meni odpre celozaslonski seznam; ob vznožju je stalna
 * vrstica z CTA za vstopnice (prikaže se, ko junaški del zapusti zaslon,
 * da ne prekriva glavnega CTA-ja).
 */
export default function Nav() {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      setCompact(window.scrollY > 24);
      setShowBar(window.scrollY > window.innerHeight * 0.7);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[padding,background-color,border-color] duration-300 border-b ${
          compact
            ? "bg-night/90 backdrop-blur border-line py-2"
            : "bg-transparent border-transparent py-4"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a
            href="#vrh"
            aria-label="Glasbeni Atlas — na vrh strani"
            className="shrink-0"
          >
            <Wordmark
              className={`w-auto transition-[height] duration-300 ${compact ? "h-8" : "h-10"}`}
            />
          </a>

          <nav aria-label="Glavna navigacija" className="hidden md:block">
            <ul className="flex items-center gap-7">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm uppercase tracking-widest text-fog transition-colors hover:text-atlas"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={tickets.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-block bg-atlas px-5 py-2.5 font-display text-sm uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5"
            >
              Vstopnice
            </a>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobilni-meni"
              className="md:hidden flex h-11 w-11 flex-col items-center justify-center gap-1.5 border border-line"
            >
              <span className="sr-only">Odpri meni</span>
              <span aria-hidden className="h-0.5 w-5 bg-atlas" />
              <span aria-hidden className="h-0.5 w-5 bg-atlas" />
              <span aria-hidden className="h-0.5 w-5 bg-atlas" />
            </button>
          </div>
        </div>
      </header>

      {/* Celozaslonski mobilni meni */}
      {open && (
        <div
          id="mobilni-meni"
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Meni"
          className="fixed inset-0 z-[60] flex flex-col bg-night/98 backdrop-blur md:hidden"
        >
          <div className="flex items-center justify-between px-4 py-4">
            <Wordmark className="h-8 w-auto" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-11 w-11 items-center justify-center border border-line text-atlas text-2xl leading-none"
            >
              <span className="sr-only">Zapri meni</span>
              <span aria-hidden>×</span>
            </button>
          </div>
          <nav
            aria-label="Mobilna navigacija"
            className="flex flex-1 items-center px-6"
          >
            <ul className="space-y-6">
              {navLinks.map((link, i) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline gap-4 font-display text-4xl uppercase text-white transition-colors hover:text-atlas"
                  >
                    <span className="text-sm text-atlas">
                      0{i + 1}
                    </span>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="px-6 pb-10">
            <a
              href={tickets.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block bg-atlas px-6 py-4 text-center font-display text-xl uppercase text-night"
            >
              {tickets.ctaLabelLong}
            </a>
          </div>
        </div>
      )}

      {/* Stalni mobilni CTA ob vznožju — pojavi se po junaškem delu */}
      <div
        aria-hidden={!showBar}
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-line bg-night/95 backdrop-blur transition-transform duration-300 sm:hidden ${
          showBar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="min-w-0 text-xs leading-tight text-fog">
            <span className="block font-semibold text-white">
              {event.dateHuman} · {event.city}
            </span>
            {tickets.priceFromHuman} · {tickets.provider}
          </p>
          <a
            href={tickets.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={showBar ? 0 : -1}
            className="shrink-0 bg-atlas px-5 py-3 font-display text-sm uppercase text-night"
          >
            Vstopnice
          </a>
        </div>
      </div>
    </>
  );
}
