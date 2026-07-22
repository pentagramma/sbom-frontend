import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitHub Repo Lookup",
  description: "Login gate and repository metadata search."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#141312] text-white antialiased">{children}</body>
    </html>
  );
}
