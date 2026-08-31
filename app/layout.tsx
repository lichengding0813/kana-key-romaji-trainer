import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "かなキー｜新标日日语输入练习",
  description: "按《新标准日本语》课次练习词汇、假名与罗马音输入。",
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
