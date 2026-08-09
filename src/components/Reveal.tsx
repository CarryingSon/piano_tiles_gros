"use client";

import { useEffect } from "react";

/**
 * Vklopi razkrivanje elementov .reveal ob pomiku (IntersectionObserver).
 * Brez JS ali ob prefers-reduced-motion ostane vse vidno — glej globals.css.
 */
export default function Reveal() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 639px)");
    if (reduced.matches || mobile.matches || !("IntersectionObserver" in window)) {
      return;
    }

    document.documentElement.classList.add("reveal-armed");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-shown");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("reveal-armed");
    };
  }, []);

  return null;
}
