"use client";

/**
 * Renders the appropriate payment method brand logo (SVG) based on
 * the payment method string stored on the subscription. Falls back
 * to a generic card icon when the method is unrecognized.
 */

import { CreditCard, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentMethodIconProps = {
  method: string | null | undefined;
  className?: string;
};

export function PaymentMethodIcon({ method, className }: PaymentMethodIconProps) {
  const normalized = (method ?? "").toLowerCase().replace(/[\s•·\d]/g, "").trim();

  if (normalized.includes("visa")) {
    return <VisaLogo className={className} />;
  }
  if (normalized.includes("mastercard") || normalized.includes("master")) {
    return <MastercardLogo className={className} />;
  }
  if (normalized.includes("google") || normalized.includes("gpay")) {
    return <GooglePayLogo className={className} />;
  }
  if (normalized.includes("apple") || normalized.includes("applepay")) {
    return <ApplePayLogo className={className} />;
  }
  if (normalized.includes("paypal")) {
    return <PayPalLogo className={className} />;
  }
  if (normalized.includes("qrph") || normalized.includes("qr")) {
    return <QrCode className={cn("size-5 text-muted-foreground", className)} />;
  }
  if (normalized.includes("amex") || normalized.includes("american")) {
    return <AmexLogo className={className} />;
  }

  return <CreditCard className={cn("size-5 text-muted-foreground", className)} />;
}

function VisaLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-auto", className)} viewBox="0 0 48 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Visa">
      <path d="M19.5 1.2L16.2 14.8H13L16.3 1.2H19.5ZM34.8 9.8L36.5 4.8L37.5 9.8H34.8ZM38.5 14.8H41.5L38.9 1.2H36.2C35.5 1.2 34.9 1.6 34.6 2.2L29.5 14.8H33L33.7 12.8H37.8L38.5 14.8ZM30.2 10.2C30.2 6.5 25 6.3 25 4.6C25 4 25.5 3.4 26.6 3.2C27.2 3.2 28.8 3.1 30.5 3.9L31.2 1.5C30.3 1.2 29.1 0.8 27.7 0.8C24.3 0.8 21.9 2.7 21.9 5.3C21.9 7.2 23.5 8.3 24.8 8.9C26.1 9.5 26.5 9.9 26.5 10.5C26.5 11.3 25.5 11.7 24.6 11.7C22.8 11.7 21.7 11.2 20.9 10.8L20.2 13.3C21 13.7 22.5 14 24.1 14C27.7 14 30.1 12.2 30.2 10.2ZM12.5 1.2L7.5 14.8H4L1.5 3.5C1.4 3 1.2 2.8 0.8 2.6C0 2.2 -0.3 2 -0.3 2L0 1.2H5.2C5.9 1.2 6.5 1.7 6.7 2.4L7.9 9.2L11 1.2H12.5Z" fill="currentColor"/>
    </svg>
  );
}

function MastercardLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-auto", className)} viewBox="0 0 32 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
      <circle cx="12" cy="10" r="8" fill="#EB001B"/>
      <circle cx="20" cy="10" r="8" fill="#F79E1B"/>
      <path d="M16 3.8C17.8 5.2 19 7.5 19 10C19 12.5 17.8 14.8 16 16.2C14.2 14.8 13 12.5 13 10C13 7.5 14.2 5.2 16 3.8Z" fill="#FF5F00"/>
    </svg>
  );
}

function GooglePayLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-auto", className)} viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Google Pay">
      <path d="M19.2 7.8V12H17.8V1.5H21.4C22.3 1.5 23.1 1.8 23.7 2.4C24.3 3 24.7 3.7 24.7 4.6C24.7 5.5 24.3 6.3 23.7 6.8C23.1 7.4 22.3 7.7 21.4 7.7H19.2V7.8ZM19.2 2.8V6.4H21.4C22 6.4 22.5 6.2 22.8 5.8C23.2 5.4 23.4 5 23.4 4.6C23.4 4.1 23.2 3.7 22.8 3.3C22.5 3 22 2.8 21.4 2.8H19.2Z" fill="currentColor"/>
      <path d="M28.2 5C29.2 5 30 5.3 30.6 5.9C31.2 6.5 31.5 7.3 31.5 8.3V12H30.2V11H30.1C29.5 11.8 28.8 12.2 27.9 12.2C27.1 12.2 26.5 12 26 11.5C25.5 11.1 25.2 10.5 25.2 9.8C25.2 9.1 25.5 8.5 26 8.1C26.6 7.7 27.3 7.5 28.2 7.5C29 7.5 29.6 7.6 30.1 7.9V7.6C30.1 7.1 29.9 6.7 29.5 6.4C29.2 6.1 28.7 5.9 28.2 5.9C27.4 5.9 26.8 6.2 26.4 6.9L25.2 6.2C25.8 5.4 26.8 5 28.2 5ZM26.5 9.9C26.5 10.2 26.7 10.5 27 10.7C27.3 10.9 27.6 11 28 11C28.5 11 29 10.8 29.5 10.4C29.9 10 30.1 9.5 30.1 9C29.7 8.7 29.1 8.5 28.3 8.5C27.7 8.5 27.2 8.7 26.9 8.9C26.6 9.2 26.5 9.5 26.5 9.9Z" fill="currentColor"/>
      <path d="M37.5 5.2L33.5 14.2H32.1L33.5 11.2L31 5.2H32.5L34.2 9.6L36 5.2H37.5Z" fill="currentColor"/>
      <path d="M12.8 6.8C12.8 6.4 12.8 6 12.7 5.6H7V7.9H10.2C10.1 8.6 9.7 9.3 9.1 9.7V11.2H11C12.1 10.2 12.8 8.6 12.8 6.8Z" fill="#4285F4"/>
      <path d="M7 12.6C8.6 12.6 9.9 12.1 11 11.2L9.1 9.7C8.5 10.1 7.8 10.4 7 10.4C5.5 10.4 4.2 9.3 3.8 7.9H1.8V9.5C2.9 11.6 4.8 12.6 7 12.6Z" fill="#34A853"/>
      <path d="M3.8 7.9C3.6 7.3 3.6 6.7 3.8 6.1V4.5H1.8C1.1 5.9 1.1 7.5 1.8 8.9L3.8 7.9Z" fill="#FBBC04"/>
      <path d="M7 3.6C7.9 3.6 8.7 3.9 9.3 4.5L11 2.8C9.9 1.8 8.6 1.2 7 1.2C4.8 1.2 2.9 2.4 1.8 4.5L3.8 6.1C4.2 4.7 5.5 3.6 7 3.6Z" fill="#EA4335"/>
    </svg>
  );
}

function ApplePayLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-auto", className)} viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Apple Pay">
      <path d="M7.3 2.4C7.7 1.9 8 1.2 7.9 0.5C7.3 0.5 6.5 0.9 6.1 1.4C5.7 1.8 5.3 2.6 5.4 3.2C6 3.3 6.8 2.9 7.3 2.4Z" fill="currentColor"/>
      <path d="M7.9 3.4C6.9 3.3 6.1 3.9 5.6 3.9C5.1 3.9 4.4 3.4 3.6 3.4C2.6 3.5 1.7 4 1.2 4.8C0.2 6.5 0.9 9 1.9 10.4C2.4 11.1 3 11.9 3.8 11.9C4.5 11.8 4.8 11.4 5.7 11.4C6.6 11.4 6.9 11.9 7.6 11.8C8.4 11.8 8.9 11.1 9.4 10.4C10 9.6 10.2 8.8 10.2 8.8C10.2 8.8 8.7 8.2 8.7 6.4C8.7 4.9 9.9 4.2 10 4.2C9.3 3.2 8.2 3.4 7.9 3.4Z" fill="currentColor"/>
      <path d="M14.8 1.2C16.8 1.2 18.2 2.6 18.2 4.6C18.2 6.7 16.8 8.1 14.7 8.1H12.8V11.8H11.4V1.2H14.8ZM12.8 6.9H14.4C15.8 6.9 16.7 6 16.7 4.6C16.7 3.3 15.8 2.4 14.4 2.4H12.8V6.9Z" fill="currentColor"/>
      <path d="M21.8 5C23.2 5 24.2 5.8 24.3 7H22.9C22.8 6.4 22.4 6 21.8 6C21.1 6 20.6 6.5 20.6 7.3V7.3C20.6 8.2 21.1 8.7 21.8 8.7C22.4 8.7 22.8 8.4 22.9 7.8H24.3C24.2 9 23.2 9.8 21.8 9.8C20.2 9.8 19.2 8.8 19.2 7.4C19.2 6 20.2 5 21.8 5Z" fill="currentColor"/>
      <path d="M27.8 5C29.2 5 30.2 5.8 30.3 7H28.9C28.8 6.4 28.4 6 27.8 6C27.1 6 26.6 6.5 26.6 7.3V7.3C26.6 8.2 27.1 8.7 27.8 8.7C28.4 8.7 28.8 8.4 28.9 7.8H30.3C30.2 9 29.2 9.8 27.8 9.8C26.2 9.8 25.2 8.8 25.2 7.4C25.2 6 26.2 5 27.8 5Z" fill="currentColor"/>
    </svg>
  );
}

function PayPalLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-auto", className)} viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="PayPal">
      <path d="M14.2 2H10.5C10.2 2 10 2.2 9.9 2.5L8.5 11.5C8.5 11.7 8.6 11.9 8.8 11.9H10.6C10.9 11.9 11.1 11.7 11.1 11.4L11.5 9C11.5 8.7 11.8 8.5 12 8.5H13.2C15.5 8.5 16.8 7.4 17.2 5.2C17.4 4.3 17.2 3.5 16.7 3C16.1 2.3 15.3 2 14.2 2Z" fill="#253B80"/>
      <path d="M26.2 2H22.5C22.2 2 22 2.2 21.9 2.5L20.5 11.5C20.5 11.7 20.6 11.9 20.8 11.9H22.7C22.9 11.9 23 11.8 23.1 11.6L23.5 9C23.5 8.7 23.8 8.5 24 8.5H25.2C27.5 8.5 28.8 7.4 29.2 5.2C29.4 4.3 29.2 3.5 28.7 3C28.1 2.3 27.3 2 26.2 2Z" fill="#179BD7"/>
      <path d="M33 5.5L32.5 8.3C32.5 8.4 32.5 8.5 32.6 8.5H34.2C36 8.5 37 7.6 37.3 5.9C37.4 5.2 37.3 4.6 36.9 4.2C36.5 3.7 35.8 3.5 34.9 3.5H32.5C32.3 3.5 32.1 3.7 32 3.9L33 5.5Z" fill="#253B80"/>
    </svg>
  );
}

function AmexLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-auto", className)} viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="American Express">
      <rect x="1" y="1" width="38" height="14" rx="2" fill="#006FCF"/>
      <path d="M7 11L9.5 5H11.5L14 11H12.2L11.7 9.8H9.3L8.8 11H7ZM10.5 6.5L9.7 8.6H11.3L10.5 6.5Z" fill="white"/>
      <path d="M14.5 11V5H17.5L18.8 8.5L20 5H23V11H21.5V6.8L20 11H17.8L16.2 6.8V11H14.5Z" fill="white"/>
      <path d="M24 11V5H28.5V6.2H25.5V7.4H28.3V8.5H25.5V9.8H28.5V11H24Z" fill="white"/>
      <path d="M30 11L32 8L30 5H31.8L33 7L34.2 5H36L34 8L36 11H34.2L33 9L31.8 11H30Z" fill="white"/>
    </svg>
  );
}
