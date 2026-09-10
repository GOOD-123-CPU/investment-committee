import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "智投委 AI — 多智能体 AI 投资委员会",
  description:
    "AI Fund Manager：由基本面、行业、宏观、量化、舆情、风控等多专业 AI Agent 协同完成投研分析、多空辩论与投委会决策的可解释投资研究系统。",
  keywords: ["AI 投资委员会", "AI Fund Manager", "多智能体", "投资研究", "AI Score", "Bull Bear 辩论"],
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: "/logo.svg",
  },
  openGraph: {
    title: "智投委 AI — 多智能体 AI 投资委员会",
    description: "多 Agent 协同投研、辩论与决策的可解释投资研究系统",
    siteName: "AI Investment Committee",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
