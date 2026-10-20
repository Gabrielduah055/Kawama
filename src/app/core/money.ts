import { OrderLine } from './store.models';

export function cedisToPesewas(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function pesewasToCedis(value: number): number {
  return Number.isFinite(value) ? value / 100 : 0;
}

export function orderLinesTotalPesewas(lines: readonly OrderLine[]): number {
  return lines.reduce((total, line) => total + cedisToPesewas(line.product.price) * line.quantity, 0);
}
