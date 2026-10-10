import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Rail } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "CityCycle: hourly bike demand forecast",
  description: "Hourly demand forecasts, ops guidance and AI planning agents for a city bike-share operator.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Rail />
          <div className="stage">{children}</div>
        </div>
      </body>
    </html>
  );
}
