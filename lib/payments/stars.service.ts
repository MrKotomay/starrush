import { jsonUtf8 } from "@/lib/http"

type TelegramApiError = {
  ok: false
  error_code?: number
  description?: string
}

type TelegramApiSuccess<T> = {
  ok: true
  result: T
}

type TelegramApiResult<T> = TelegramApiSuccess<T> | TelegramApiError

async function callTelegram<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED")
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  const result = (await response.json().catch(() => ({}))) as TelegramApiResult<T>

  if (!response.ok || !result || result.ok !== true) {
    const description = "description" in result ? result.description : undefined
    const code = "error_code" in result ? result.error_code : response.status
    throw new Error(`TELEGRAM_API_${method}_FAILED:${code ?? "unknown"}:${description ?? "unknown"}`)
  }

  return result.result
}

export async function createStarsInvoiceLink(input: {
  amount: number
  invoicePayload: string
  title?: string
  description?: string
}) {
  const title = input.title ?? "StarRush пополнение"
  const description = input.description ?? `Пополнение ${input.amount} Stars`

  return callTelegram<string>("createInvoiceLink", {
    title,
    description,
    payload: input.invoicePayload,
    currency: "XTR",
    prices: [
      {
        label: "Telegram Stars",
        amount: input.amount,
      },
    ],
  })
}

export async function answerPreCheckoutQuery(input: {
  preCheckoutQueryId: string
  ok: boolean
  errorMessage?: string
}) {
  return callTelegram<boolean>("answerPreCheckoutQuery", {
    pre_checkout_query_id: input.preCheckoutQueryId,
    ok: input.ok,
    error_message: input.ok ? undefined : input.errorMessage ?? "Payment validation failed",
  })
}

export function telegramWebhookUnauthorizedResponse() {
  return jsonUtf8({ ok: false, error: "FORBIDDEN" }, { status: 403 })
}
