import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

// Cabinet Grotesk is an ITF font: its licence forbids redistribution, so it is
// loaded from the Fontshare CDN rather than self-hosted (design doc §9).
const CABINET_GROTESK_CSS = "https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800&display=swap";

export const metadata: Metadata = {
  title: "Sejuk Sejuk Ops",
  description: "Order, assignment, completion and review for aircond service jobs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={CABINET_GROTESK_CSS} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
