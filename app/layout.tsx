import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "팀 가계부",
  description: "식당별 예산과 사용 내역을 관리하는 팀 내부 웹앱",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
