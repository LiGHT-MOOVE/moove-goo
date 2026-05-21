import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goo Blob Editor",
  description: "A grid-based p5 blob editor with partner goo bridges and vector SVG export.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.className} flex min-h-full flex-col bg-[#f5f4ef] text-slate-950 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
