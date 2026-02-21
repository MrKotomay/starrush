import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildPublicPlayerProfile, PublicPlayerProfile } from "@/lib/game/public-player";

type PublicUserRecord = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

type UserLookupClient = Pick<Prisma.TransactionClient, "user">;

function mapUserToPublicPlayerProfile(
  user: PublicUserRecord | null,
  fallbackUserId: string,
): PublicPlayerProfile {
  if (!user) {
    return buildPublicPlayerProfile({ userId: fallbackUserId });
  }

  return buildPublicPlayerProfile({
    userId: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.photoUrl,
  });
}

export async function loadPublicPlayerProfile(
  userId: string,
  client: UserLookupClient = db,
): Promise<PublicPlayerProfile> {
  const user = (await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
    },
  })) as PublicUserRecord | null;

  return mapUserToPublicPlayerProfile(user, userId);
}
