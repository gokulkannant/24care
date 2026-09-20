import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "24 Care | Triage assistant",
  description: "A clinician-confirmed care-intake demo for IPM's 24×7 workflow.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
