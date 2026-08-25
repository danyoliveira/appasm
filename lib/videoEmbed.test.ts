import { describe, expect, it } from "vitest";
import { getVideoEmbedUrl } from "./videoEmbed";

describe("getVideoEmbedUrl", () => {
  it("embeds a standard youtube watch URL", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("embeds a youtube watch URL without www or extra params", () => {
    expect(getVideoEmbedUrl("https://youtube.com/watch?v=xyz&t=30s")).toBe(
      "https://www.youtube.com/embed/xyz",
    );
  });

  it("returns null for a youtube watch URL missing the v param", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/watch")).toBeNull();
  });

  it("embeds a youtube shorts URL", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/shorts/short123")).toBe(
      "https://www.youtube.com/embed/short123",
    );
  });

  it("passes through an already-embed youtube URL", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/embed/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("returns null for an unrecognized youtube path", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/channel/abc")).toBeNull();
  });

  it("embeds a youtu.be short link", () => {
    expect(getVideoEmbedUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("embeds a mobile youtube URL (m. prefix)", () => {
    expect(getVideoEmbedUrl("https://m.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("embeds a numeric vimeo URL", () => {
    expect(getVideoEmbedUrl("https://vimeo.com/12345678")).toBe(
      "https://player.vimeo.com/video/12345678",
    );
  });

  it("returns null for a non-numeric vimeo path", () => {
    expect(getVideoEmbedUrl("https://vimeo.com/some-channel")).toBeNull();
  });

  it("passes through an already-embed vimeo player URL", () => {
    expect(getVideoEmbedUrl("https://player.vimeo.com/video/12345678")).toBe(
      "https://player.vimeo.com/video/12345678",
    );
  });

  it("returns null for an unsupported host", () => {
    expect(getVideoEmbedUrl("https://example.com/video.mp4")).toBeNull();
  });

  it("returns null for an invalid URL", () => {
    expect(getVideoEmbedUrl("not a url")).toBeNull();
  });
});
