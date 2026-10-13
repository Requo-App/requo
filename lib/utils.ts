import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Text-style classes from the BoardUI typography scale (e.g.
 * `text-body-medium`, `text-title-1-semibold`). tailwind-merge has no view
 * of our Tailwind theme, so without this group it treats them as text-color
 * utilities and silently drops them next to a real color. If you add or
 * rename a text style in typography.css, mirror the change here.
 */
const TEXT_FAMILIES = [
  "large-title",
  "display-1",
  "display-2",
  "display-3",
  "display-4",
  "title-1",
  "title-2",
  "title-3",
  "headline",
  "body",
  "body-2",
  "caption-1",
  "caption-2",
] as const

const TEXT_WEIGHTS = ["regular", "medium", "semibold", "bold"] as const

const TEXT_STYLE_SUFFIXES = TEXT_FAMILIES.flatMap((family) =>
  TEXT_WEIGHTS.map((weight) => `${family}-${weight}`),
)

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TEXT_STYLE_SUFFIXES }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
