export type PublicPlayerProfile = {
  userId: string;
  displayName: string;
  username: string | null;
  isHidden: boolean;
  visibleToCurrentUserOnly: boolean;
  avatarUrl: string | null;
};

export type PublicPlayerProfileInput = {
  userId: string;
  displayName?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isHidden?: boolean | null;
  visibleToCurrentUserOnly?: boolean | null;
  avatarUrl?: string | null;
};

function toTrimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolvePublicPlayerDisplayName(input: PublicPlayerProfileInput): string {
  const explicitDisplayName = toTrimmedOrNull(input.displayName);
  if (explicitDisplayName) return explicitDisplayName;

  const firstName = toTrimmedOrNull(input.firstName);
  const lastName = toTrimmedOrNull(input.lastName);
  const fullName = [firstName, lastName].filter((part): part is string => Boolean(part)).join(" ");
  if (fullName.length > 0) return fullName;

  const username = toTrimmedOrNull(input.username);
  if (username) return username;

  return `user-${input.userId.slice(0, 6)}`;
}

export function buildPublicPlayerProfile(input: PublicPlayerProfileInput): PublicPlayerProfile {
  const username = toTrimmedOrNull(input.username);
  const isHidden = input.isHidden === true;
  const visibleToCurrentUserOnly =
    typeof input.visibleToCurrentUserOnly === "boolean" ? input.visibleToCurrentUserOnly : isHidden;
  const avatarUrl = toTrimmedOrNull(input.avatarUrl);

  return {
    userId: input.userId,
    displayName: resolvePublicPlayerDisplayName(input),
    username,
    isHidden,
    visibleToCurrentUserOnly,
    avatarUrl,
  };
}
