import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes with clsx
 * Works with NativeWind in React Native
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
