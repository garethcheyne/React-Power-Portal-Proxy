import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Power Portal Proxy",
  description: "Dashboard for Power Portal Proxy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full w-full">
      <body
        className="antialiased h-full w-full m-0 p-0"
      >
        {children}
      </body>
    </html>
  );
}
