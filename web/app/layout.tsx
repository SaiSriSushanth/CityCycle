import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Chrome } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "CityCycle: hourly bike demand forecast",
  description: "Hourly demand forecasts, ops guidance and AI planning agents for a city bike-share operator.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Caveat:wght@600;700&family=Nunito:wght@400;600;700;800&display=swap"
        />
      </head>
      <body>
        {/* Wobble filters: used on box edges only, so the text inside stays sharp. */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
          <filter id="wobble" x="-3%" y="-3%" width="106%" height="106%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="wobble-sm" x="-6%" y="-10%" width="112%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
