import type { Metadata } from "next";

import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Checkout",
  description: "Completing your Requo checkout.",
});

export default function CheckoutLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className="checkout-light-force min-h-dvh bg-[#f7f9f7] text-[#172b24]"
      style={{ colorScheme: "light" }}
    >
      {children}
    </div>
  );
}
