import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
});

const title = "Moove Goo";
const description = "Logo generator for Moove. Draw connected goo blobs, save projects, and export vector SVGs.";
const image = {
  url: "/moove-goo.png",
  width: 1792,
  height: 2056,
  alt: "Moove Goo editor preview",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://moove-goo.vercel.app/"),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: title,
    title,
    description,
    images: [image],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image],
  },
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
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
