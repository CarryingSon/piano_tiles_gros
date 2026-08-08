import { organizer, tickets } from "@/data/event";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-night pb-24 pt-16 sm:pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <p className="font-display uppercase text-white">
              {organizer.name}
            </p>
            <address className="mt-3 space-y-1 text-sm not-italic leading-relaxed text-fog">
              <p>{organizer.address}</p>
              <p>
                <a
                  href={`mailto:${organizer.email}`}
                  className="underline-offset-4 hover:text-atlas hover:underline"
                >
                  {organizer.email}
                </a>
              </p>
              <p>
                <a
                  href={`tel:${organizer.phoneHref}`}
                  className="underline-offset-4 hover:text-atlas hover:underline"
                >
                  {organizer.phone}
                </a>
              </p>
            </address>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-fog">
              Spremljaj nas
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {organizer.socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fog underline-offset-4 hover:text-atlas hover:underline"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-fog">
              Vstopnice
            </p>
            <p className="mt-3 text-sm leading-relaxed text-fog">
              Vstopnice za Glasbeni Atlas prodaja{" "}
              <a
                href={tickets.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-atlas underline-offset-4 hover:underline"
              >
                {tickets.provider}
              </a>
              . Dogodek organizira {organizer.shortName} — Eventim je zunanji
              prodajalec vstopnic in ni organizator dogodka.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs text-fog sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {organizer.name}. Vse pravice
            pridržane.
          </p>
          <p>
            Fotografije in video: arhiv {organizer.shortName}, Glasbeni Atlas
            2022–2024.
          </p>
        </div>
      </div>
    </footer>
  );
}
