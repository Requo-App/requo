import { describe, expect, it } from "vitest";

import { parsePublishedPorts } from "../../scripts/supabase-local-ports";

describe("parsePublishedPorts", () => {
  it("extracts unique host ports from docker's published port list", () => {
    expect(
      parsePublishedPorts(
        "0.0.0.0:54321->8000/tcp, [::]:54321->8000/tcp",
      ),
    ).toEqual([54321]);
  });

  it("handles containers that publish several ports", () => {
    expect(
      parsePublishedPorts("0.0.0.0:54321->8000/tcp, 0.0.0.0:54324->8025/tcp"),
    ).toEqual([54321, 54324]);
  });

  it("ignores exposed ports that are not published to the host", () => {
    expect(parsePublishedPorts("5000/tcp, 8080/tcp")).toEqual([]);
  });
});
