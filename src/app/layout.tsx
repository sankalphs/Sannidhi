import type { Metadata } from "next";
import { Geist, Geist_Mono, Young_Serif } from "next/font/google";

import { ConvexClientProvider } from "@/components/shell/convex-provider";
import { DemoBanner } from "@/components/shell/demo-banner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  weight: "400",
  subsets: ["latin"],
});

const TITLE = "Sannidhi — Adaptive Attendance";
const DESCRIPTION =
  "Adaptive trust-based attendance for institutions: passkey check-ins, rotating session challenges, and a tamper-evident record of every decision.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Sannidhi",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/* Applies the chalkboard theme before first paint so dark-mode users never see a light flash. */
const themeInitScript = `try{if(matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${youngSerif.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <a
          href="#main-content"
          className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <DemoBanner />
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
