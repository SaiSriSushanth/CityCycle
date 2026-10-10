import type { ReactNode } from "react";

const I = (d: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

export const icons = {
  logo: I(<><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-8h5l3 8M10 8l2 8M9 5h3" /></>),
  forecast: I(<path d="M3 17l5-6 4 3 6-8M3 21h18" />),
  ops: I(<><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>),
  whatif: I(<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />),
  agent: I(<><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5" /></>),
  checks: I(<><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5L16 9.5" /></>),
  log: I(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></>),
  brand: (
    <svg viewBox="0 0 52 36" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 14.2c5-.5 9 3.4 8.8 8.3-.2 4.7-4.2 8-8.9 7.6-4.8-.4-7.8-4.2-7.5-8.6.3-4.3 3.3-7 7.6-7.3z" />
      <path d="M40.5 14.5c4.7-.6 8.7 3 8.6 8-.1 4.6-4 7.8-8.6 7.5-4.7-.4-7.6-4.1-7.4-8.4.2-4.2 3.1-6.7 7.4-7.1z" />
      <path d="M12 22.3l7.3-11.2h12.6l7.8 11M19.3 11.1l6.6 11.2M30.5 11.1l-4.6 11.2" />
      <path d="M32 11.1l-1-4.2h5M19 10.8h-4M44 6c2 .8 3 2 3.4 3.6" />
    </svg>
  ),
  check: I(<path d="M5 12l5 5 9-10" />),
};
