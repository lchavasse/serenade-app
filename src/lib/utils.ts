import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRatingLabel(value: number) {
  const labels = {
      1: "Charming",
      2: "Sweet",
      3: "Playful",
      4: "Flirty",
      5: "Romantic",
      6: "Passionate",
      7: "Sultry",
      8: "Steamy",
      9: "Spicy",
      10: "Kinky"
    }
    return labels[value as keyof typeof labels] || "Romantic"
}
