import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function calculateAverage(numbers: number[]): number | null {
	if (numbers.length === 0) return null;

	const sum = numbers.reduce((acc, num) => acc + num, 0);
	const avg = sum / numbers.length;
	return Math.round(avg * 100) / 100;
}

export function calculateMedian(numbers: number[]): number | null {
	if (numbers.length === 0) return null;

	const sorted = [...numbers].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const isEven = sorted.length % 2 === 0;

	const median = isEven ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

	return Math.round(median * 100) / 100;
}
