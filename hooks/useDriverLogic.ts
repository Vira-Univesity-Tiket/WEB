import { useEffect, useRef, useState } from "react";
import {
  DriverScanItem,
  DriverScheduleCard,
  DriverSession,
  DriverSummary,
  driverLogin,
  driverRegister,
  driverScanCode,
  driverScanQr,
  getDriverSummary,
  getDriverDashboard,
  getDriverRecentScans,
  driverCreateRouteRequest,
  driverListRouteRequests,
  getStations,
  clearDriverAuthToken,
  hasDriverAuthToken,
} from "../services/apiService";
import type { DriverRouteRequest, ResourceState, Station } from "../types";
import {
  DriverDocumentKind,
  DriverPage,
  driverAccountErrors,
  driverPersonalErrors,
  driverRegistrationPayload,
  emptyDriverDraft,
  isDriverDocument,
  readDriverPage,
} from "../utils/driverRegistration";
import { toEnglishDigits } from "../utils/numberUtils";

const DRIVER_STORAGE_KEY = "vira_driver_session";
type ResourceKey = "summary" | "services" | "scans" | "stations" | "requests";
type ScanState = {
  type: "idle" | "loading" | "success" | "error" | "unknown";
  title: string;
  detail?: string;
};
const emptyResources = (): Record<ResourceKey, ResourceState> =>
  Object.fromEntries(
    ["summary", "services", "scans", "stations", "requests"].map((key) => [
      key,
      { status: "idle", error: "" },
    ]),
  ) as Record<ResourceKey, ResourceState>;
const object = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};
const string = (value: unknown) => (typeof value === "string" ? value : "");
function cachedSession(): DriverSession | null {
  const candidate = object(localStorage.getItem(DRIVER_STORAGE_KEY));
  if (
    candidate.status === "active" &&
    typeof candidate.id === "string" &&
    /^\d{1,20}$/.test(candidate.id) &&
    typeof candidate.name === "string" &&
    typeof candidate.username === "string" &&
    hasDriverAuthToken()
  ) {
    return {
      id: candidate.id,
      name: candidate.name,
      username: candidate.username,
      licensePlate: string(candidate.licensePlate),
      phone: string(candidate.phone),
      status: "active",
    };
  }
  localStorage.removeItem(DRIVER_STORAGE_KEY);
  return null;
}

export function useDriverLogic() {
  const [session, setSession] = useState<DriverSession | null>(cachedSession);
  const [restoring, setRestoring] = useState(Boolean(session));
  const [page, setPage] = useState<DriverPage>(() =>
    readDriverPage(location.search),
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [registering, setRegistering] = useState(
    () =>
      !session &&
      new URLSearchParams(location.search).get("driverView") === "register",
  );
  const [regStep, setRegStep] = useState(1);
  const [draft, setDraft] = useState(emptyDriverDraft);
  const [registrationErrors, setRegistrationErrors] = useState<
    Record<string, string>
  >({});
  const [registrationPending, setRegistrationPending] = useState(false);
  const [rejection, setRejection] = useState("");
  const [summary, setSummary] = useState<DriverSummary | null>(null);
  const [services, setServices] = useState<DriverScheduleCard[]>([]);
  const [scans, setScans] = useState<DriverScanItem[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [requests, setRequests] = useState<DriverRouteRequest[]>([]);
  const [resources, setResources] = useState(emptyResources);
  const [routeOrigin, setRouteOrigin] = useState("");
  const [routeDestination, setRouteDestination] = useState("");
  const [routeTime, setRouteTime] = useState("");
  const [routePrice, setRoutePrice] = useState("50000");
  const [routeErrors, setRouteErrors] = useState<Record<string, string>>({});
  const [routePending, setRoutePending] = useState(false);
  const [routeNotice, setRouteNotice] = useState("");
  const [code, setCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<"camera" | "manual">("camera");
  const [scanPending, setScanPending] = useState(false);
  const [scanState, setScanState] = useState<ScanState>({
    type: "idle",
    title: "",
  });

  const mounted = useRef(true);
  const generation = useRef(0);
  const driverId = useRef(session?.id);
  const activeRequests = useRef<
    Partial<Record<ResourceKey, { generation: number; promise: Promise<void> }>>
  >({});
  const resourceRevision = useRef<Record<ResourceKey, number>>({
    summary: 0,
    services: 0,
    scans: 0,
    stations: 0,
    requests: 0,
  });
  const loginBusy = useRef(false),
    registerBusy = useRef(false),
    routeBusy = useRef(false);
  const scanBusy = useRef(false),
    scanOperation = useRef(0),
    scannerGeneration = useRef(0),
    cameraOpen = useRef(false);
  const dirtyScans = useRef(false);
  const uncertainScans = useRef(new Set<string>());

  const setResource = (
    key: ResourceKey,
    status: ResourceState["status"],
    error = "",
  ) => setResources((previous) => ({ ...previous, [key]: { status, error } }));
  const updateUrl = (target: string, replace = false) => {
    const url = new URL(location.href);
    if (target === "dashboard" || target === "login")
      url.searchParams.delete("driverView");
    else url.searchParams.set("driverView", target);
    const next = url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash)
      window.history[replace ? "replaceState" : "pushState"]({}, "", next);
  };
  const closeScanner = () => {
    cameraOpen.current = false;
    scannerGeneration.current += 1;
    setScannerOpen(false);
    setManualCode("");
    setScanState((previous) =>
      previous.type === "unknown" ? previous : { type: "idle", title: "" },
    );
    if (driverId.current && dirtyScans.current && !scanBusy.current) {
      dirtyScans.current = false;
      void refreshData(driverId.current, true);
    }
  };
  const navigate = (next: DriverPage) => {
    closeScanner();
    setPage(next);
    updateUrl(next);
  };
  const logout = (message = "") => {
    generation.current += 1;
    scannerGeneration.current += 1;
    scanOperation.current += 1;
    driverId.current = undefined;
    cameraOpen.current = false;
    scanBusy.current = false;
    dirtyScans.current = false;
    activeRequests.current = {};
    uncertainScans.current.clear();
    clearDriverAuthToken();
    localStorage.removeItem(DRIVER_STORAGE_KEY);
    setSession(null);
    setRestoring(false);
    setResources(emptyResources());
    setSummary(null);
    setScans([]);
    setServices([]);
    setStations([]);
    setRequests([]);
    setUsername("");
    setPassword("");
    setDraft(emptyDriverDraft());
    setRegistering(false);
    setRegStep(1);
    setPendingMessage("");
    setAuthError(message);
    setRejection("");
    setRegistrationErrors({});
    setCode("");
    setManualCode("");
    setScannerOpen(false);
    setScanPending(false);
    setScanState({ type: "idle", title: "" });
    setRouteOrigin("");
    setRouteDestination("");
    setRouteTime("");
    setRoutePrice("50000");
    setRouteErrors({});
    setRouteNotice("");
    routeBusy.current = false;
    setRoutePending(false);
    setPage("dashboard");
    updateUrl("login", true);
  };
  async function load<T>(
    key: ResourceKey,
    get: () => Promise<T>,
    apply: (value: T) => void,
    fresh = false,
  ) {
    const current = generation.current;
    const existing = activeRequests.current[key];
    if (!fresh && existing?.generation === current) return existing.promise;
    const revision = ++resourceRevision.current[key];
    const promise = (async () => {
      setResource(key, "loading");
      try {
        const data = await get();
        if (
          !mounted.current ||
          current !== generation.current ||
          revision !== resourceRevision.current[key]
        )
          return;
        apply(data);
        setResource(key, "ready");
      } catch (error) {
        if (
          !mounted.current ||
          current !== generation.current ||
          revision !== resourceRevision.current[key]
        )
          return;
        const failure = error as Error & { status?: number };
        if (failure.status === 401 || failure.status === 403) {
          logout(
            failure.message || "دسترسی این حساب معتبر نیست؛ دوباره وارد شوید.",
          );
          return;
        }
        setResource(
          key,
          "error",
          failure.message || "دریافت اطلاعات ناموفق بود.",
        );
      }
    })();
    activeRequests.current[key] = { generation: current, promise };
    await promise;
    if (activeRequests.current[key]?.promise === promise)
      delete activeRequests.current[key];
  }
  const array = <T>(value: T[]) => {
    if (!Array.isArray(value)) throw new Error("پاسخ فهرست معتبر نیست.");
    return value;
  };
  async function refreshData(id = driverId.current, fresh = false) {
    if (!id || !mounted.current) return;
    const current = generation.current;
    await Promise.all([
      load(
        "summary",
        () => getDriverSummary(id),
        (value) => {
          if (
            !value ||
            !Number.isFinite(value.boardedCount) ||
            !Number.isFinite(value.totalRevenue)
          )
            throw new Error("پاسخ آمار معتبر نیست.");
          setSummary(value);
        },
        fresh,
      ),
      load(
        "services",
        () => getDriverDashboard(id),
        (value) => setServices(array(value)),
        fresh,
      ),
      load(
        "scans",
        () => getDriverRecentScans(id),
        (value) => setScans(array(value)),
        fresh,
      ),
    ]);
    if (mounted.current && current === generation.current) setRestoring(false);
  }
  const refreshRoute = (fresh = false) => {
    if (!driverId.current || !mounted.current) return Promise.resolve();
    return Promise.all([
      load(
        "stations",
        getStations,
        (value) => setStations(array(value)),
        fresh,
      ),
      load(
        "requests",
        driverListRouteRequests,
        (value) => setRequests(array(value)),
        fresh,
      ),
    ]);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      scannerGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    if (session) void refreshData(session.id);
  }, [session?.id]);
  useEffect(() => {
    if (session && page === "request") void refreshRoute();
  }, [session?.id, page]);
  useEffect(() => {
    const pop = () => {
      closeScanner();
      setPage(readDriverPage(location.search));
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loginBusy.current) return;
    const user = toEnglishDigits(username).trim(),
      pass = toEnglishDigits(password).trim();
    if (user.length < 3 || pass.length < 4) {
      setAuthError("نام کاربری حداقل ۳ و رمز عبور حداقل ۴ کاراکتر باشد.");
      return;
    }
    loginBusy.current = true;
    setLoginPending(true);
    setAuthError("");
    const current = generation.current;
    try {
      const result = await driverLogin(user, pass);
      if (!mounted.current || current !== generation.current) return;
      if (result.status === "pending" && "message" in result) {
        clearDriverAuthToken();
        setPassword("");
        setPendingMessage(result.message);
        updateUrl("review");
        return;
      }
      if (
        result.status === "rejected" &&
        "data" in result &&
        "reason" in result
      ) {
        clearDriverAuthToken();
        const data = object(result.data),
          plate = object(data.plateData),
          documents = object(data.documents);
        const birth = string(data.birthDate).split("/");
        const next = emptyDriverDraft();
        next.name = string(data.name);
        next.nationalCode = string(data.nationalCode);
        next.phone = string(data.phone);
        [next.birthYear, next.birthMonth, next.birthDay] =
          birth.length === 3 ? birth : ["", "1", ""];
        next.birthMonth = String(Number(next.birthMonth) || 1);
        for (const key of ["part1", "part2", "part3"] as const)
          next.plate[key] = string(plate[key]);
        next.plate.letter = string(plate.letter) || "ع";
        for (const key of [
          "nationalCard",
          "licenseCard",
          "carCard",
        ] as DriverDocumentKind[]) {
          if (isDriverDocument(documents[key])) {
            next.documents[key] = documents[key];
            next.documentNames[key] = "مدرک درخواست قبلی";
          }
        }
        next.regUsername = string(data.username) || user;
        next.regPassword = pass;
        setDraft(next);
        setPassword("");
        setRejection(
          result.reason || "لطفاً اطلاعات درخواست قبلی را اصلاح کنید.",
        );
        setRegStep(1);
        setRegistering(true);
        updateUrl("register");
        return;
      }
      if (result.status !== "active" || !result.id)
        throw new Error("وضعیت حساب مجاز به ورود نیست.");
      generation.current += 1;
      driverId.current = result.id;
      activeRequests.current = {};
      setPassword("");
      setSession(result);
      setRestoring(true);
      setPage(readDriverPage(location.search));
      localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(result));
    } catch (error) {
      if (mounted.current && current === generation.current)
        setAuthError((error as Error).message || "ورود ناموفق بود.");
    } finally {
      loginBusy.current = false;
      if (mounted.current) setLoginPending(false);
    }
  };
  const beginRegistration = () => {
    setDraft(emptyDriverDraft());
    setRegistrationErrors({});
    setRejection("");
    setAuthError("");
    setRegStep(1);
    setRegistering(true);
    setPassword("");
    updateUrl("register");
  };
  const leaveRegistration = () => {
    if (registerBusy.current) return;
    setRegistering(false);
    setDraft(emptyDriverDraft());
    setRegistrationErrors({});
    setRegStep(1);
    setRejection("");
    updateUrl("login");
  };
  const advanceRegistration = () => {
    const errors =
      regStep === 1
        ? driverPersonalErrors(draft)
        : Object.values(draft.documents).every(isDriverDocument)
          ? {}
          : { documents: "هر سه مدرک معتبر را انتخاب کنید." };
    setRegistrationErrors(errors);
    if (Object.keys(errors).length === 0)
      setRegStep((previous) => Math.min(3, previous + 1));
  };
  const submitRegistration = async () => {
    if (registerBusy.current) return;
    const personal = driverPersonalErrors(draft),
      account = driverAccountErrors(draft);
    if (Object.keys(personal).length) {
      setRegStep(1);
      setRegistrationErrors(personal);
      return;
    }
    if (!Object.values(draft.documents).every(isDriverDocument)) {
      setRegStep(2);
      setRegistrationErrors({ documents: "مدارک را کامل کنید." });
      return;
    }
    if (Object.keys(account).length) {
      setRegistrationErrors(account);
      return;
    }
    registerBusy.current = true;
    setRegistrationPending(true);
    setRegistrationErrors({});
    const current = generation.current;
    try {
      const result = await driverRegister(driverRegistrationPayload(draft));
      if (!mounted.current || current !== generation.current) return;
      if (result.success !== true)
        throw new Error("ثبت درخواست توسط سرور تأیید نشد.");
      setUsername(draft.regUsername);
      setPassword("");
      setDraft(emptyDriverDraft());
      setRegistering(false);
      setRegStep(1);
      clearDriverAuthToken();
      setPendingMessage(
        "درخواست شما با موفقیت ثبت شد. کارشناسان ما مدارک شما را بررسی کرده و نتیجه را تا ۱۲ ساعت آینده از طریق همین سامانه به اطلاع شما خواهند رساند.",
      );
      updateUrl("review");
    } catch (error) {
      if (mounted.current && current === generation.current)
        setRegistrationErrors({
          form: (error as Error).message || "ثبت درخواست ناموفق بود.",
        });
    } finally {
      registerBusy.current = false;
      if (mounted.current) setRegistrationPending(false);
    }
  };
  const submitRoute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (routeBusy.current || !driverId.current) return;
    const errors: Record<string, string> = {};
    const price = Number(toEnglishDigits(routePrice));
    if (!routeOrigin) errors.origin = "مبدأ را انتخاب کنید.";
    if (!routeDestination) errors.destination = "مقصد را انتخاب کنید.";
    if (routeOrigin && routeOrigin === routeDestination)
      errors.destination = "مبدأ و مقصد باید متفاوت باشند.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(routeTime))
      errors.time = "ساعت حرکت معتبر وارد کنید.";
    if (!Number.isSafeInteger(price) || price < 1000 || price > 50000000)
      errors.price = "مبلغ باید بین ۱٬۰۰۰ و ۵۰٬۰۰۰٬۰۰۰ تومان باشد.";
    setRouteErrors(errors);
    setRouteNotice("");
    if (Object.keys(errors).length) return;
    routeBusy.current = true;
    setRoutePending(true);
    const current = generation.current;
    try {
      const result = await driverCreateRouteRequest({
        originStationId: routeOrigin,
        destinationStationId: routeDestination,
        departureTime: routeTime,
        priceToman: price,
      });
      if (!mounted.current || current !== generation.current) return;
      if (!result.success) throw new Error("ثبت درخواست توسط سرور تأیید نشد.");
      setRouteNotice("درخواست مسیر ثبت شد");
      setRouteOrigin("");
      setRouteDestination("");
      setRouteTime("");
      setRoutePrice("50000");
      await refreshRoute(true);
    } catch (error) {
      if (mounted.current && current === generation.current)
        setRouteErrors({
          form: (error as Error).message || "ثبت درخواست ناموفق بود.",
        });
    } finally {
      if (current === generation.current) {
        routeBusy.current = false;
        if (mounted.current) setRoutePending(false);
      }
    }
  };

  const scan = async (
    value: string,
    kind: "qr" | "code",
    source: "main" | "overlay" = "overlay",
  ) => {
    const id = driverId.current;
    if (!id || scanBusy.current) return;
    const signature = kind + ":" + value;
    if (uncertainScans.current.has(signature)) {
      setScanState({
        type: "unknown",
        title: "نتیجه ثبت نامشخص است",
        detail:
          "این درخواست را خودکار تکرار نمی‌کنیم؛ ابتدا سوابق سرور را بررسی کنید.",
      });
      return;
    }
    scanBusy.current = true;
    setScanPending(true);
    const operation = ++scanOperation.current;
    const current = generation.current,
      scanner = scannerGeneration.current;
    setScanState({ type: "loading", title: "در حال بررسی بلیت…" });
    try {
      const result =
        kind === "qr"
          ? await driverScanQr(id, value.trim())
          : await driverScanCode(id, value);
      if (!result?.ticketId || typeof result.passengerName !== "string")
        throw new Error("پاسخ ثبت مسافر قابل تأیید نیست.");
      if (
        !mounted.current ||
        current !== generation.current ||
        driverId.current !== id
      )
        return;
      dirtyScans.current = true;
      if (scanner !== scannerGeneration.current) return;
      setScanState({
        type: "success",
        title: "بلیت تایید شد",
        detail: `${result.passengerName} | ${result.count || 1} مسافر | کد ${result.validationCode || "ثبت نشده"}`,
      });
      if (kind === "code") {
        if (source === "main") setCode("");
        else setManualCode("");
      }
    } catch (error) {
      if (
        !mounted.current ||
        current !== generation.current ||
        driverId.current !== id
      )
        return;
      const failure = error as Error & { status?: number };
      const uncertain =
        !failure.status || failure.status >= 500 || failure.status === 429;
      if (uncertain) uncertainScans.current.add(signature);
      if (scanner !== scannerGeneration.current) return;
      setScanState({
        type: uncertain ? "unknown" : "error",
        title: uncertain
          ? "نتیجه ثبت نامشخص است"
          : failure.status === 409 && /قبلاً اسکن شده/.test(failure.message)
            ? "این بلیت قبلاً ثبت شده است"
            : "بلیت رد شد",
        detail: uncertain
          ? "ارتباط پس از ارسال کامل نشد. پیش از تلاش دوباره، سوابق ثبت مسافر را بررسی کنید."
          : failure.message || "کد بلیت معتبر نیست.",
      });
    } finally {
      if (operation === scanOperation.current) {
        scanBusy.current = false;
        if (mounted.current) setScanPending(false);
      }
      if (
        driverId.current === id &&
        !cameraOpen.current &&
        dirtyScans.current
      ) {
        dirtyScans.current = false;
        void refreshData(id, true);
      }
    }
  };
  const openScanner = () => {
    scannerGeneration.current += 1;
    cameraOpen.current = true;
    setScanState({ type: "idle", title: "" });
    setScannerMode("camera");
    setScannerOpen(true);
  };
  const enterCode = (value: string, source: "main" | "overlay") => {
    const cleaned = toEnglishDigits(value).replace(/\D/g, "").slice(0, 4);
    const previous = source === "main" ? code : manualCode;
    if (source === "main") setCode(cleaned);
    else setManualCode(cleaned);
    if (cleaned.length === 4 && cleaned !== previous)
      void scan(cleaned, "code", source);
  };
  useEffect(() => {
    if (
      !scannerOpen ||
      scannerMode !== "camera" ||
      !["success", "error"].includes(scanState.type)
    )
      return;
    const timer = setTimeout(
      () =>
        setScanState((previous) =>
          previous === scanState ? { type: "idle", title: "" } : previous,
        ),
      2500,
    );
    return () => clearTimeout(timer);
  }, [scanState, scannerOpen, scannerMode]);

  return {
    state: {
      session,
      restoring,
      page,
      username,
      password,
      loginPending,
      authError,
      pendingMessage,
      registering,
      regStep,
      draft,
      registrationErrors,
      registrationPending,
      rejection,
      summary,
      services,
      scans,
      stations,
      requests,
      resources,
      routeOrigin,
      routeDestination,
      routeTime,
      routePrice,
      routeErrors,
      routePending,
      routeNotice,
      code,
      manualCode,
      scannerOpen,
      scannerMode,
      scanPending,
      scanState,
    },
    actions: {
      setUsername,
      setPassword,
      login,
      logout,
      navigate,
      refreshData,
      refreshRoute,
      beginRegistration,
      leaveRegistration,
      setDraft,
      setRegStep,
      advanceRegistration,
      submitRegistration,
      backFromReview: () => {
        setPendingMessage("");
        updateUrl("login");
      },
      setRouteOrigin,
      setRouteDestination,
      setRouteTime,
      setRoutePrice,
      submitRoute,
      openScanner,
      closeScanner,
      setScannerMode,
      enterCode,
      scan,
      reviewScans: () => {
        closeScanner();
        setPage("dashboard");
        updateUrl("dashboard");
        void refreshData(undefined, true);
      },
    },
  };
}
export type DriverLogic = ReturnType<typeof useDriverLogic>;
