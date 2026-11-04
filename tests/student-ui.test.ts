import { test } from "node:test";
import assert from "node:assert/strict";
import { readStudentView, studentViewKey } from "../utils/studentNavigation";
import { ViewState } from "../types";
import {
  supportAttachmentPayload,
  validateStudentAttachments,
} from "../utils/studentAttachments";
import { formatPersianTextNumbers } from "../utils/numberUtils";

test("student navigation restores only supported views and preserves the payment callback destination", () => {
  assert.equal(readStudentView("?view=booking"), ViewState.BUS);
  assert.equal(readStudentView("?view=tickets"), ViewState.TICKETS);
  assert.equal(readStudentView("?view=ideas"), ViewState.FEEDBACK);
  assert.equal(
    readStudentView("?view=home&topupTransactionId=0012&topupStatus=success"),
    ViewState.WALLET,
  );
  assert.equal(studentViewKey(ViewState.BUS), "booking");
  assert.equal(studentViewKey(ViewState.ADMIN_DASHBOARD), undefined);
});

test("untrusted URL values cannot select administrative views, prototypes or external destinations", () => {
  for (const value of [
    "__proto__",
    "constructor",
    "ADMIN_DASHBOARD",
    "https://example.test",
    "<script>",
    "missing",
  ]) {
    assert.equal(
      readStudentView("?view=" + encodeURIComponent(value)),
      ViewState.HOME,
    );
  }
});

test("support attachments enforce count, per-file size, total size and allowed formats before reading", () => {
  const file = { type: "text/plain", size: 1024 };
  assert.equal(validateStudentAttachments(Array(5).fill(file)), "");
  assert.match(validateStudentAttachments(Array(6).fill(file)), /۵ فایل/);
  assert.match(
    validateStudentAttachments([{ ...file, size: 5 * 1024 * 1024 + 1 }]),
    /۵ مگابایت/,
  );
  assert.match(
    validateStudentAttachments(
      [{ ...file, size: 4 * 1024 * 1024 + 1 }],
      [{ size: 4 * 1024 * 1024 }],
    ),
    /۸ مگابایت/,
  );
  assert.equal(
    validateStudentAttachments(
      [{ ...file, size: 4 * 1024 * 1024 }],
      [{ size: 4 * 1024 * 1024 }],
    ),
    "",
  );
  assert.match(
    validateStudentAttachments([{ ...file, type: "text/html" }]),
    /فرمت فایل/,
  );
});

test("attachment UI metadata never changes the support API payload contract", () => {
  assert.deepEqual(
    supportAttachmentPayload([
      {
        name: "evidence.txt",
        dataUrl: "data:text/plain;base64,SGVsbG8=",
        size: 5,
      },
    ]),
    [{ name: "evidence.txt", dataUrl: "data:text/plain;base64,SGVsbG8=" }],
  );
});

test("Persian display formatting preserves leading zeros and never converts currency units", () => {
  assert.equal(formatPersianTextNumbers("001,200 تومان"), "۰۰۱٬۲۰۰ تومان");
  assert.equal(formatPersianTextNumbers("500 ریال"), "۵۰۰ ریال");
});

test("authenticated downloads preserve the configured API prefix once and never send tokens to another origin", async () => {
  const originalFetch = globalThis.fetch;
  const globals = [
    "window",
    "document",
    "localStorage",
    "sessionStorage",
  ] as const;
  const previous = globals.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const requests: { url: string; authorization: string | null }[] = [];
  let downloadedName = "";
  const link = {
    href: "",
    download: "",
    click() {
      downloadedName = this.download;
    },
  };
  Object.defineProperties(globalThis, {
    window: {
      configurable: true,
      value: { location: { origin: "http://127.0.0.1" } },
    },
    localStorage: {
      configurable: true,
      value: { getItem: () => "isolated-test-token" },
    },
    sessionStorage: { configurable: true, value: { getItem: () => null } },
    document: {
      configurable: true,
      value: {
        createElement: () => link,
        body: { appendChild() {}, removeChild() {} },
      },
    },
  });
  globalThis.fetch = (async (
    url: string | URL | Request,
    options?: RequestInit,
  ) => {
    if (String(url) === "/runtime-config.json")
      return new Response(
        JSON.stringify({ apiBasePath: "/custom-api", retryCount: 0 }),
      );
    requests.push({
      url: String(url),
      authorization: new Headers(options?.headers).get("Authorization"),
    });
    return new Response("isolated text export", {
      headers: {
        "content-disposition": 'attachment; filename="ticket-test.txt"',
      },
    });
  }) as typeof fetch;
  try {
    const { initializeFrontendConfig } =
      await import("../config/frontend-config");
    await initializeFrontendConfig();
    const { downloadAuthenticatedFile, supportTicketTxtUrl } =
      await import("../services/apiService");
    await downloadAuthenticatedFile(
      supportTicketTxtUrl("0001"),
      "fallback.txt",
    );
    assert.deepEqual(requests, [
      {
        url: "/custom-api/support/tickets/0001/txt",
        authorization: "Bearer isolated-test-token",
      },
    ]);
    assert.equal(downloadedName, "ticket-test.txt");
    await assert.rejects(
      downloadAuthenticatedFile(
        "https://outside.example/export",
        "blocked.txt",
      ),
      /همین دامنه/,
    );
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globals.forEach((key, index) => {
      if (previous[index])
        Object.defineProperty(globalThis, key, previous[index]!);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
