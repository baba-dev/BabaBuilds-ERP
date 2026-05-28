import { describe, expect, it } from "vitest";
import { parseProposalSections } from "@/lib/proposals/parser";

describe("parseProposalSections", () => {
  it("returns an empty array when the proposal is null or undefined", () => {
    expect(parseProposalSections(null)).toEqual([]);
    expect(parseProposalSections(undefined)).toEqual([]);
  });

  it("parses modern richSections when it is a pre-parsed JSON array", () => {
    const proposal = {
      richSections: [
        { title: "Intro Section", body: "Hello body", mediaUrl: "https://x.com/image.png" },
        { title: "Deliverables", body: "Detailed scope" }
      ]
    };
    const parsed = parseProposalSections(proposal);
    expect(parsed).toEqual([
      { title: "Intro Section", body: "Hello body", mediaUrl: "https://x.com/image.png" },
      { title: "Deliverables", body: "Detailed scope", mediaUrl: "" }
    ]);
  });

  it("parses modern richSections when it is a serialized JSON string", () => {
    const proposal = {
      richSections: JSON.stringify([
        { title: "Scope of work", body: "We will build it.", mediaUrl: "" }
      ])
    };
    const parsed = parseProposalSections(proposal);
    expect(parsed).toEqual([
      { title: "Scope of work", body: "We will build it.", mediaUrl: "" }
    ]);
  });

  it("fallback parses richSections serialized inside declineReason hack", () => {
    const proposal = {
      declineReason: JSON.stringify({
        richSections: [
          { title: "Fallback Title", body: "Fallback Body", mediaUrl: "https://media.org" }
        ]
      })
    };
    const parsed = parseProposalSections(proposal);
    expect(parsed).toEqual([
      { title: "Fallback Title", body: "Fallback Body", mediaUrl: "https://media.org" }
    ]);
  });

  it("fallback parses richMedia serialized inside declineReason hack", () => {
    const proposal = {
      declineReason: JSON.stringify({
        richMedia: [
          { title: "Video Guide", url: "https://youtube.com/v" }
        ]
      })
    };
    const parsed = parseProposalSections(proposal);
    expect(parsed).toEqual([
      { title: "Video Guide", body: "", mediaUrl: "https://youtube.com/v" }
    ]);
  });

  it("returns an empty array when declineReason is a normal text string", () => {
    const proposal = {
      declineReason: "The quote is too expensive, we need to negotiate."
    };
    expect(parseProposalSections(proposal)).toEqual([]);
  });
});
