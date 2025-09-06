import type { Metadata } from "next";
import { Inter, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/app/components/theme-provider";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { PostHogProvider } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const pixelify = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixelify" });

export const metadata: Metadata = {
  title: "GDGoC Prompting Challenge",
  description: "GDGoC Prompting Challenge - Prompt Your Way to the Top",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${pixelify.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NuqsAdapter>
            <PostHogProvider>
              {children}
            </PostHogProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
