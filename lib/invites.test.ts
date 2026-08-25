import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { coachExists, validateInviteToken } from "./invites";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

function fakeAdmin({
  invite,
  coachCount,
}: {
  invite?: { email: string; status: string; expires_at: string } | null;
  coachCount?: number;
}) {
  return {
    from(table: string) {
      if (table === "invites") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: invite ?? null }) }) }) };
      }
      if (table === "profiles") {
        return { select: () => ({ eq: () => Promise.resolve({ count: coachCount ?? 0 }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const mockedCreateAdminClient = vi.mocked(createAdminClient);

beforeEach(() => {
  mockedCreateAdminClient.mockReset();
});

describe("validateInviteToken", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  it("returns the invite's email for a pending, unexpired token", async () => {
    mockedCreateAdminClient.mockReturnValue(
      fakeAdmin({ invite: { email: "coach@example.com", status: "pending", expires_at: future } }) as never,
    );
    await expect(validateInviteToken("tok")).resolves.toEqual({ email: "coach@example.com" });
  });

  it("returns null when no invite matches the token", async () => {
    mockedCreateAdminClient.mockReturnValue(fakeAdmin({ invite: null }) as never);
    await expect(validateInviteToken("missing")).resolves.toBeNull();
  });

  it("returns null when the invite was already accepted", async () => {
    mockedCreateAdminClient.mockReturnValue(
      fakeAdmin({ invite: { email: "a@b.com", status: "accepted", expires_at: future } }) as never,
    );
    await expect(validateInviteToken("tok")).resolves.toBeNull();
  });

  it("returns null when the invite has expired", async () => {
    mockedCreateAdminClient.mockReturnValue(
      fakeAdmin({ invite: { email: "a@b.com", status: "pending", expires_at: past } }) as never,
    );
    await expect(validateInviteToken("tok")).resolves.toBeNull();
  });
});

describe("coachExists", () => {
  it("returns false when no coach profile exists yet", async () => {
    mockedCreateAdminClient.mockReturnValue(fakeAdmin({ coachCount: 0 }) as never);
    await expect(coachExists()).resolves.toBe(false);
  });

  it("returns true once a coach profile exists", async () => {
    mockedCreateAdminClient.mockReturnValue(fakeAdmin({ coachCount: 1 }) as never);
    await expect(coachExists()).resolves.toBe(true);
  });

  it("returns false when count comes back null", async () => {
    mockedCreateAdminClient.mockReturnValue(fakeAdmin({ coachCount: undefined }) as never);
    await expect(coachExists()).resolves.toBe(false);
  });
});
