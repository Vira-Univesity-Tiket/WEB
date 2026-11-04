import { ViewState } from "../types";

export const studentViews: Record<string, ViewState> = {
  home: ViewState.HOME,
  booking: ViewState.BUS,
  tickets: ViewState.TICKETS,
  wallet: ViewState.WALLET,
  support: ViewState.SUPPORT,
  ideas: ViewState.FEEDBACK,
  profile: ViewState.PROFILE,
};

export const readStudentView = (search: string): ViewState => {
  const params = new URLSearchParams(search);
  if (params.has("topupTransactionId")) return ViewState.WALLET;
  const key = params.get("view") || "home";
  return Object.hasOwn(studentViews, key) ? studentViews[key] : ViewState.HOME;
};

export const studentViewKey = (view: ViewState) =>
  Object.keys(studentViews).find((key) => studentViews[key] === view);
