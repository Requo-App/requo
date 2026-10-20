import { describe, expect, it } from "vitest";
import { resolveInquiryAttachmentContentType } from "@/features/inquiries/attachment-content";

const pdf = Buffer.from("%PDF-1.7\nA sample PDF body\n%%EOF");

describe("inquiry attachment byte validation", () => {
  it("detects PDFs independently of storage metadata", async () => {
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(pdf), "Roof Plan.PDF"))
      .resolves.toBe("application/pdf");
  });

  it.each(["plan.jpg", "plan.txt", "plan.exe"])("rejects PDF bytes named %s", async (name) => {
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(pdf), name)).rejects.toThrow();
  });

  it.each([
    ["photo.jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["photo.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZt8AAAAASUVORK5CYII=", "base64"), "image/png"],
    ["photo.webp", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(16)]), "image/webp"],
  ])("accepts allowed image bytes for %s", async (name, bytes, mime) => {
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(bytes), name)).resolves.toBe(mime);
  });

  it("distinguishes legacy Word documents from other compound files", async () => {
    const bytes = Buffer.alloc(1024);
    Buffer.from("d0cf11e0a1b11ae1", "hex").copy(bytes);
    bytes[30] = 9; // 512-byte sectors; directory starts in sector zero.
    Buffer.from("0609020000000000c000000000000046", "hex").copy(bytes, 592);
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(bytes), "plan.doc")).resolves.toBe("application/msword");
    bytes.fill(0, 592, 608); // Unknown compound-file class is not Word.
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(bytes), "plan.doc")).rejects.toThrow();
  });

  it("recognizes an OOXML Word archive", async () => {
    const bytes = Buffer.from("UEsDBAoAAAAIAAAAISisbhJangAAANwAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbF2PsQ7CMBBDf6XKitqrGBhQ24UdGPiBU3JtI5pLlBwF/p4EpA6Mlu1nubu9A6Xq5RZOvZpFwhEg6ZkcpsYH4uyMPjqULOMEAfUdJ4J92x5AexZiqaUw1NBdVorRGqquGOWMjnoFTx8NGK8fLiebTFPV6Vcry73CEBarUaxnWNn8bdZ+HK2mrV9oIXpNKVme3NJsjkPLu4KHoYPvqeEDUEsDBAoAAAAAAEWYVF0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAgAAAAhKF9b0UwNAAAACwAAABEAAAB3b3JkL2RvY3VtZW50LnhtbLNJyU8uzU3NK9G3AwBQSwECFAAKAAAACAAAACEorG4SWp4AAADcAAAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAAAEWYVF0AAAAAAAAAAAAAAAAFAAAAAAAAAAAAEAAAAM8AAAB3b3JkL1BLAQIUAAoAAAAIAAAAIShfW9FMDQAAAAsAAAARAAAAAAAAAAAAAAAAAPIAAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALMAAAAuAQAAAAA=", "base64");
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(bytes), "plan.docx")).resolves.toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(bytes), "plan.pdf")).rejects.toThrow();
  });

  it("accepts UTF-8 text with whitespace", async () => {
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(Buffer.from("Café\nRoof measurements:\t25 m²\r\n")), "notes.txt"))
      .resolves.toBe("text/plain");
  });

  it.each([
    Buffer.from("not a PDF"),
    Buffer.from([0, 1, 2, 3, 4]),
    Buffer.from([0xff, 0xff, 0xff]),
    Buffer.alloc(0),
  ])("rejects invalid or mislabeled content", async (bytes) => {
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(bytes), "plan.pdf")).rejects.toThrow();
  });

  it.each([Buffer.from([0, 1, 2]), Buffer.from([0xff, 0xff])])("rejects binary data disguised as text", async (bytes) => {
    await expect(resolveInquiryAttachmentContentType(new Uint8Array(bytes), "notes.txt")).rejects.toThrow();
  });
});
