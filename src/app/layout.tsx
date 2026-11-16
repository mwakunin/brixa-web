import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { en } from "@/strings/en";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: en.app.name, template: `%s · ${en.app.name}` },
  description: en.app.description,
  // A staff tool behind sign-in: nothing here is for a search engine.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
