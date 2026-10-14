/**
 * Notice rendering for the email body: permission requests and forms (questions).
 */

import { describe, expect, test } from "bun:test";

import { formNotice, permissionNotice } from "../src/events";

describe("formNotice", () => {
  test("renders the question and its options", () => {
    const notice = formNotice(
      {
        type: "form.created",
        data: {
          form: {
            id: "f1",
            sessionID: "s",
            title: "需要你的选择",
            fields: [
              {
                key: "answer",
                type: "string",
                title: "部署到哪个环境？",
                required: true,
                options: [
                  { value: "prod", label: "生产" },
                  { value: "dev", label: "开发", description: "先试" },
                ],
              },
            ],
          },
        },
      },
      "D:/Desktop",
    );
    expect(notice?.subject).toBe("opencode · 需要你回答 [D:/Desktop]");
    expect(notice?.body).toContain("**部署到哪个环境？**（必填）");
    expect(notice?.body).toContain("- 生产");
    expect(notice?.body).toContain("- 开发 — 先试");
    expect(notice?.body).toContain("邮件不支持回答问题");
  });

  test("only handles form events", () => {
    expect(formNotice({ type: "permission.asked" }, "x")).toBeNull();
  });

  test("returns null for an unrelated event", () => {
    expect(formNotice({ type: "session.step.ended" }, "x")).toBeNull();
  });
});

describe("permissionNotice", () => {
  test("renders the action and the resource range", () => {
    const notice = permissionNotice(
      {
        type: "permission.asked",
        data: { id: "p1", action: "external_directory", resources: ["C:/Users/1/perm/*"] },
      },
      "D:/Desktop",
    );
    expect(notice?.subject).toBe("opencode · 需要授权 [D:/Desktop]");
    expect(notice?.body).toContain("工具: **external_directory**");
    expect(notice?.body).toContain("- `C:/Users/1/perm/*`");
  });
});
