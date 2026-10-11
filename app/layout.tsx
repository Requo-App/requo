import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/shared/motion-provider";
import {
  getReloadLoadingInitScript,
  ReloadLoadingOverlay,
} from "@/components/shared/reload-loading-overlay";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { WebMCPProvider } from "@/components/shared/webmcp-provider";
import { StructuredData } from "@/components/seo/structured-data";
import { Toaster } from "@/components/ui/sonner";
import { getThemeInitScript } from "@/features/theme/init-script";
import { TooltipProvider } from "@/components/ui/tooltip";
import { legalConfig } from "@/features/legal/config";
import { env } from "@/lib/env";
import { themeCookieKey, themeStorageKey } from "@/features/theme/types";
import {
  getOrganizationStructuredData,
  getWebsiteStructuredData,
} from "@/lib/seo/structured-data";
import {
  absoluteUrl,
  getSiteUrl,
  siteDescription,
  siteName,
  siteSameAs,
  siteTagline,
} from "@/lib/seo/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const brandFont = localFont({
  src: "../public/fonts/ApfelGrotezk-Fett.woff2",
  variable: "--font-brand",
  display: "swap",
  weight: "700",
});

const mittelFont = localFont({
  src: "../public/fonts/ApfelGrotezk-Mittel.woff2",
  variable: "--font-mittel",
  display: "swap",
  weight: "500",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  applicationName: siteName,
  alternates: {
    canonical: "/",
  },
  description: siteDescription,
  metadataBase: siteUrl,
  openGraph: {
    description: siteDescription,
    images: [
      {
        alt: `${siteName} social preview`,
        height: 630,
        url: "/opengraph-image",
        width: 1200,
      },
    ],
    locale: "en_US",
    siteName,
    title: siteName,
    type: "website",
    url: siteUrl.toString(),
  },
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
    index: true,
  },
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  icons: {
    apple: "/logo.svg",
    icon: "/logo.svg",
    shortcut: "/logo.svg",
  },
  twitter: {
    card: "summary_large_image",
    description: siteDescription,
    images: ["/twitter-image"],
    title: siteName,
  },
  ...(env.GOOGLE_SITE_VERIFICATION
    ? {
        verification: {
          google: env.GOOGLE_SITE_VERIFICATION,
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationStructuredData = getOrganizationStructuredData({
    address: {
      addressCountry: legalConfig.country,
      addressLocality: "Lucena City",
      addressRegion: "Quezon",
    },
    description: siteTagline,
    email: legalConfig.supportEmail,
    logoUrl: absoluteUrl("/logo.svg"),
    name: siteName,
    sameAs: siteSameAs,
    url: siteUrl.toString(),
  });
  const websiteStructuredData = getWebsiteStructuredData({
    description: siteDescription,
    name: siteName,
    url: siteUrl.toString(),
  });

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${brandFont.variable} ${mittelFont.variable} ${inter.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
        <ReloadLoadingOverlay />
        <Script id="requo-theme-init" strategy="beforeInteractive">
          {getThemeInitScript({
            cookieKey: themeCookieKey,
            storageKey: themeStorageKey,
          })}
        </Script>
        <Script id="requo-reload-loading-init" strategy="beforeInteractive">
          {getReloadLoadingInitScript()}
        </Script>
        <div id="app-root-content">
          <StructuredData
            data={organizationStructuredData}
            id="requo-organization-structured-data"
          />
          <StructuredData
            data={websiteStructuredData}
            id="requo-website-structured-data"
          />
          <ThemeProvider
            defaultTheme="system"
            disableTransitionOnChange
            enableSystem
            storageKey={themeStorageKey}
          >
            <Suspense fallback={null}>
              <ScrollToTop />
              <WebMCPProvider />
            </Suspense>
            <MotionProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster />
            </MotionProvider>
          </ThemeProvider>
          <Analytics />
          <SpeedInsights />
        </div>
      </body>
    </html>
  );
}
