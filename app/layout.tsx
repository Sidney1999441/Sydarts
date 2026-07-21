import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { getSiteThemeSettings, themeCssVariables } from "@/lib/theme";

export const metadata: Metadata = {
  title: "SYDARTS",
  description: "Modern darts league, scoring and player data platform"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ user, profile }, theme] = await Promise.all([
    getCurrentUserAndProfile(),
    getSiteThemeSettings()
  ]);

  return (
    <html lang="zh-CN">
      <body style={themeCssVariables(theme)}>
        <Header userEmail={user?.email || null} profile={profile} theme={theme} />
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
