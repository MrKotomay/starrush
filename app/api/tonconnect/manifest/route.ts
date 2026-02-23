import { jsonUtf8 } from "@/lib/http"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = `${url.protocol}//${url.host}`

  return jsonUtf8({
    url: origin,
    name: "StarRush",
    iconUrl: `${origin}/icon.svg`,
    termsOfUseUrl: `${origin}`,
    privacyPolicyUrl: `${origin}`,
  })
}
