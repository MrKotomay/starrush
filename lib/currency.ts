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
    return Math.round(safeAmount)
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

  if (currency === "STARS" && options.compactStars !== false) {
    return String(Math.max(0, Math.floor(safeAmount)))
  }

  const minimumFractionDigits =
    options.minimumFractionDigits ?? (currency === "TON" ? 2 : 0)
  const maximumFractionDigits =
    options.maximumFractionDigits ?? (currency === "TON" ? 2 : 2)

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(safeAmount)
}
