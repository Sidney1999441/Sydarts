import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { defaultSiteTheme, themeCssVariables } from "@/lib/theme";

export const metadata: Metadata = {
  title: "CODL 2026",
  description: "Caliburn Office Darts League scoring and data platform"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile } = await getCurrentUserAndProfile();
  const codlTheme = defaultSiteTheme;

  return (
    <html lang="zh-CN">
      <body style={themeCssVariables(codlTheme)}>
        <div className="codl-backdrop" aria-hidden />
        <Header userEmail={user?.email || null} profile={profile} theme={codlTheme} />
        <main className="relative mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
