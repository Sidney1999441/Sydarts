import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "Darts Tournament MVP",
  description: "Team-first darts tournament management system"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <html lang="zh-CN">
      <body>
        <Header userEmail={user?.email || null} profile={profile} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
