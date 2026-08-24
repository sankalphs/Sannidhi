import type { Metadata } from "next";
import { Geist, Geist_Mono, Young_Serif } from "next/font/google";

import { ConvexClientProvider } from "@/components/shell/convex-provider";

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

export const metadata: Metadata = {
  title: "Sannidhi — Adaptive Attendance",
  description:
    "Adaptive trust-based attendance for institutions: passkey check-ins, rotating session challenges, and a tamper-evident record of every decision.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${youngSerif.variable} antialiased`}
      >
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
