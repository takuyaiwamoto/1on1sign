import "./globals.css";

import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { cn } from "@/lib/utils";

const notoSans = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "700"]
});

export const metadata: Metadata = {
  title: "Online Sign System",
  description: "1対1オンラインサイン体験アプリ"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={cn("bg-white text-slate-900", notoSans.variable)}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
