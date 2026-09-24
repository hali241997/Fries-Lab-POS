export function formatMoney(value: number): string {
  return `Rs. ${Math.round(value)}`;
}
