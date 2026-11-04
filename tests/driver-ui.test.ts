import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentError,
  driverPersonalErrors,
  driverRegistrationPayload,
  emptyDriverDraft,
  isDriverDocument,
  normalizeDriverPhone,
  readDriverPage,
  validPersianDate,
} from "../utils/driverRegistration";

test("driver navigation restores only operational views and cannot turn a query into approval", () => {
  for (const value of ["dashboard", "scan", "request", "profile"])
    assert.equal(readDriverPage("?driverView=" + value), value);
  for (const value of [
    "__proto__",
    "constructor",
    "admin",
    "review",
    "active",
    "https://outside.example",
  ])
    assert.equal(readDriverPage("?driverView=" + value), "dashboard");
});
test("Persian birth dates reject impossible days, follow the platform leap calendar and add no age restriction", () => {
  assert.equal(validPersianDate("1403", "12", "30"), true);
  assert.equal(validPersianDate("1402", "12", "30"), false);
  assert.equal(validPersianDate("1380", "1", "31"), true);
  assert.equal(validPersianDate("1380", "7", "31"), false);
  assert.equal(validPersianDate("1380", "0", "1"), false);
  assert.equal(validPersianDate("1380", "1", "0"), false);
  assert.equal(validPersianDate("1200", "1", "1"), true);
});
test("driver documents use the existing 3 MiB contract and never accept remote or SVG preview sources", () => {
  assert.equal(
    documentError({ type: "application/pdf", size: 3 * 1024 * 1024 }),
    "",
  );
  assert.match(
    documentError({ type: "image/png", size: 3 * 1024 * 1024 + 1 }),
    /۳/,
  );
  assert.match(documentError({ type: "image/svg+xml", size: 12 }), /PNG/);
  assert.notEqual(documentError({ type: "image/png", size: 0 }), "");
  assert.equal(isDriverDocument("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(isDriverDocument("https://outside.example/document.png"), false);
  assert.equal(isDriverDocument("data:image/svg+xml;base64,PHN2Zy8+"), false);
});
test("registration preserves identity strings and the current API shape while excluding filenames and UI state", () => {
  const draft = emptyDriverDraft();
  Object.assign(draft, {
    name: "راننده آزمایش",
    nationalCode: "۰۰۸۴۵۷۵۹۴۸",
    phone: "+98 912 000 0002",
    birthYear: "1380",
    birthMonth: "1",
    birthDay: "2",
    regUsername: "driver-test",
    regPassword: "test-password",
  });
  draft.plate = { part1: "01", letter: "ب", part2: "023", part3: "04" };
  assert.equal(normalizeDriverPhone("٠٩١٢٠٠٠٠٠٠٢"), "09120000002");
  assert.deepEqual(driverPersonalErrors(draft), {});
  const payload = driverRegistrationPayload(draft);
  assert.equal(payload.nationalCode, "0084575948");
  assert.equal(payload.phone, "09120000002");
  assert.equal(payload.birthDate, "1380/1/2");
  assert.equal(payload.plateData.part1, "01");
  assert.deepEqual(
    Object.keys(payload).sort(),
    [
      "birthDate",
      "documents",
      "name",
      "nationalCode",
      "password",
      "phone",
      "plateData",
      "username",
    ].sort(),
  );
});
