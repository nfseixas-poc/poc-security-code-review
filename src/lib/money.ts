/** Converte um valor em reais ("150.10") para centavos (15010). */
export function reaisToCents(value: string): number {
  return Math.floor(parseFloat(value) * 100);
}

/** Formata centavos como moeda brasileira: 15010 -> "R$ 150,10". */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
