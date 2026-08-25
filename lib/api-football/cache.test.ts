import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTeamInfo } from "./client";
import { getTeamInfo } from "./cache";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, fetchTeamInfo: vi.fn() };
});

const mockedCreateAdminClient = vi.mocked(createAdminClient);
const mockedFetchTeamInfo = vi.mocked(fetchTeamInfo);

function fakeAdmin({
  cached,
  upsert = vi.fn(async () => ({ error: null })),
}: {
  cached: { payload: unknown; fetched_at: string } | null;
  upsert?: ReturnType<typeof vi.fn>;
}) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cached }) }) }),
      upsert,
    }),
  };
}

beforeEach(() => {
  mockedCreateAdminClient.mockReset();
  mockedFetchTeamInfo.mockReset();
});

describe("cached() via getTeamInfo", () => {
  it("returns the cached payload without calling the API when still within TTL", async () => {
    const payload = [{ team: { id: 1, name: "Sporting", logo: "", country: "Portugal" } }];
    mockedCreateAdminClient.mockReturnValue(
      fakeAdmin({ cached: { payload, fetched_at: new Date().toISOString() } }) as never,
    );

    const result = await getTeamInfo(1);

    expect(result).toEqual(payload);
    expect(mockedFetchTeamInfo).not.toHaveBeenCalled();
  });

  it("fetches fresh data and stores it when there's no cache entry", async () => {
    const fresh = [{ team: { id: 2, name: "Benfica", logo: "", country: "Portugal" } }];
    const upsert = vi.fn(async () => ({ error: null }));
    mockedCreateAdminClient.mockReturnValue(fakeAdmin({ cached: null, upsert }) as never);
    mockedFetchTeamInfo.mockResolvedValue(fresh);

    const result = await getTeamInfo(2);

    expect(result).toEqual(fresh);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ cache_key: "team:2:info", team_id: 2, payload: fresh }),
    );
  });

  it("fetches fresh data when the cached entry is past its TTL (24h for team info)", async () => {
    const fresh = [{ team: { id: 3, name: "Porto", logo: "", country: "Portugal" } }];
    const stalePayload = [{ team: { id: 3, name: "Porto (old)", logo: "", country: "Portugal" } }];
    const expired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockedCreateAdminClient.mockReturnValue(
      fakeAdmin({ cached: { payload: stalePayload, fetched_at: expired } }) as never,
    );
    mockedFetchTeamInfo.mockResolvedValue(fresh);

    const result = await getTeamInfo(3);

    expect(result).toEqual(fresh);
    expect(mockedFetchTeamInfo).toHaveBeenCalledOnce();
  });

  it("serves stale cached data instead of throwing when the API call fails", async () => {
    const stalePayload = [{ team: { id: 4, name: "Braga", logo: "", country: "Portugal" } }];
    const expired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockedCreateAdminClient.mockReturnValue(
      fakeAdmin({ cached: { payload: stalePayload, fetched_at: expired } }) as never,
    );
    mockedFetchTeamInfo.mockRejectedValue(new Error("rate limited"));

    await expect(getTeamInfo(4)).resolves.toEqual(stalePayload);
  });

  it("propagates the error when the API call fails and there's no cached data to fall back to", async () => {
    mockedCreateAdminClient.mockReturnValue(fakeAdmin({ cached: null }) as never);
    mockedFetchTeamInfo.mockRejectedValue(new Error("rate limited"));

    await expect(getTeamInfo(5)).rejects.toThrow("rate limited");
  });
});
