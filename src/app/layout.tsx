import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://zeepkist.vercel.app"),
  title: "VierDeVrijdag | Wonders of Work",
  description:
    "Fullscreen eventbeeld en verplaatsbare spreektijdtimer voor Wonders of Work events.",
  applicationName: "Zeepkist",
  authors: [{ name: "ericvrp" }],
  creator: "ericvrp",
  publisher: "ericvrp",
  keywords: ["Wonders of Work", "VierDeVrijdag", "timer", "events"],
  icons: {
    icon: "/wonders-of-work.svg",
    shortcut: "/wonders-of-work.svg",
    apple: "/wonders-of-work.svg",
  },
  openGraph: {
    title: "Zeepkist | Wonders of Work Timer",
    description:
      "Fullscreen eventbeeld en verplaatsbare spreektijdtimer voor Wonders of Work events.",
    url: "/",
    siteName: "Zeepkist",
    type: "website",
    locale: "nl_NL",
  },
  twitter: {
    card: "summary",
    title: "Zeepkist | Wonders of Work Timer",
    description:
      "Fullscreen eventbeeld en verplaatsbare spreektijdtimer voor Wonders of Work events.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
