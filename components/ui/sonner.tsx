"use client"

// Legacy path for the app-wide toaster. Previously backed by sonner — now
// renders the BoardUI `Notification` stack via `NotificationToaster`, styled
// with the Requo system. `app/layout.tsx` keeps rendering `<Toaster />`
// unchanged.

export { NotificationToaster as Toaster } from "@/components/shared/notification-toaster";
