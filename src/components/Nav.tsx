"use client";

import { useEffect, useRef, useState } from "react";
import { event, navLinks, tickets } from "@/data/event";
import Wordmark from "./Wordmark";

/**
 * Lebdeča navigacija se prikaže, ko junaški del zapusti zaslon.
 * Na mobilnem meni odpre celozaslonski seznam; ob vznožju je stalna
 * vrstica z CTA za vstopnice.
 */
export default function Nav() {
  const [showNav, setShowNav] = useState(false);
  const [open, setOpen] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = document.getElementById("vrh");

    const onScroll = () => {
      setShowBar(window.scrollY > window.innerHeight * 0.7);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (!hero) {
      return () => window.removeEventListener("scroll", onScroll);
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShowNav(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(hero);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
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
        aria-hidden={!showNav}
        inert={!showNav}
        className={`fixed left-1/2 top-3 z-50 w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 rounded-2xl border border-atlas/35 bg-coal/90 shadow-[0_16px_50px_rgb(0_0_0/0.55),0_0_24px_rgb(252_219_39/0.08)] ring-1 ring-white/10 backdrop-blur-xl transition-[opacity,transform,visibility] duration-300 sm:top-4 ${
          showNav
            ? "visible translate-y-0 opacity-100"
            : "invisible pointer-events-none -translate-y-4 opacity-0"
        }`}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:h-16 sm:px-4">
          <a
            href="#vrh"
            aria-label="Glasbeni Atlas — na vrh strani"
            className="shrink-0"
          >
            <Wordmark className="h-7 w-auto sm:h-8" />
          </a>

          <nav aria-label="Glavna navigacija" className="hidden md:block">
            <ul className="flex items-center gap-5 lg:gap-7">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-xs uppercase tracking-widest text-fog transition-colors hover:text-atlas"
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
              className="hidden rounded-xl border border-atlas bg-atlas px-4 py-2 font-display text-xs uppercase tracking-wide text-night shadow-[0_4px_18px_rgb(252_219_39/0.16)] transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-white sm:inline-block"
            >
              Vstopnice
            </a>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobilni-meni"
              className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-xl border border-atlas/35 bg-night/70 transition-colors hover:border-atlas md:hidden"
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
              className="block rounded-xl bg-atlas px-6 py-4 text-center font-display text-xl uppercase text-night"
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
            className="shrink-0 rounded-xl bg-atlas px-5 py-3 font-display text-sm uppercase text-night"
          >
            Vstopnice
          </a>
        </div>
      </div>
    </>
  );
}
