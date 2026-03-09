export type SupportedCurrency = "TON" | "STARS"

type FormatCurrencyAmountOptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  compactStars?: boolean
}

function toFiniteNumber(value: number) {
  return Number.isFinite(value) ? value : 0
}

export function isIntegerCurrency(currency: SupportedCurrency) {
  return currency === "STARS"
}

export function roundCurrencyAmount(currency: SupportedCurrency, amount: number) {
  const safeAmount = Math.max(0, toFiniteNumber(amount))
  if (isIntegerCurrency(currency)) {
    return Math.floor(safeAmount)
  }
  return Math.round(safeAmount * 100) / 100
}

export function currencyIconPath(currency: SupportedCurrency) {
  return currency === "STARS" ? "/stars.svg" : "/ton.svg"
}

export function formatCurrencyAmount(
  currency: SupportedCurrency,
  amount: number,
  options: FormatCurrencyAmountOptions = {},
) {
  const safeAmount = Math.max(0, toFiniteNumber(amount))

  if (currency === "STARS") {
    return String(Math.max(0, Math.floor(safeAmount)))
  }

  const minimumFractionDigits = options.minimumFractionDigits ?? 2
  const maximumFractionDigits = options.maximumFractionDigits ?? 2

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(safeAmount)
}
