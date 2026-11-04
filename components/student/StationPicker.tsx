import React, { useId, useMemo, useState } from "react";
import { Icons } from "../Icons";
import { ResourceState, Station } from "../../types";
import { BottomSheet, StatusMessage } from "./StudentUI";

interface StationPickerProps {
  kind: "origin" | "destination";
  value: string;
  stations: Station[];
  resource: ResourceState;
  excludedId?: string;
  onChange: (id: string) => void;
  onRetry: () => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

const normalize = (text: string) =>
  text
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .trim()
    .toLocaleLowerCase("fa");

export default function StationPicker({
  kind,
  value,
  stations,
  resource,
  excludedId,
  onChange,
  onRetry,
  label: labelOverride,
  placeholder,
  disabled = false,
}: StationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = useId();
  const label =
    labelOverride || (kind === "origin" ? "مبدأ حرکت" : "مقصد نهایی");
  const active = useMemo(
    () => stations.filter((station) => station.isActive !== false),
    [stations],
  );
  const selected = active.find((station) => station.id === value);
  const filtered = useMemo(
    () =>
      active.filter((station) =>
        normalize(station.name).includes(normalize(query)),
      ),
    [active, query],
  );
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  return (
    <div className="student-station-field">
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      <span
        className={`student-route-dot ${kind === "destination" ? "student-route-dot-destination" : ""}`}
        aria-hidden="true"
      />
      <button
        type="button"
        id={id}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="student-station-button"
      >
        <span
          className={`student-station-name ${selected ? "" : "student-station-placeholder"}`}
        >
          {selected?.name ||
            placeholder ||
            (kind === "origin" ? "انتخاب ایستگاه مبدأ" : "انتخاب ایستگاه مقصد")}
        </span>
        {selected && <small>انتخاب‌شده</small>}
        <Icons.ChevronDown size={22} aria-hidden="true" />
      </button>
      <BottomSheet
        open={open}
        onClose={close}
        title={label}
        icon={<Icons.MapPin size={25} />}
        className="student-station-sheet"
      >
        <p className="student-station-help">
          ایستگاه را انتخاب کنید؛ جست‌وجو اختیاری است.
        </p>
        <div className="student-station-search">
          <Icons.Search size={23} aria-hidden="true" />
          <input
            className="student-input"
            aria-label={`جستجوی ${label}`}
            placeholder="جستجوی ایستگاه…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>
        {resource.status === "loading" || resource.status === "idle" ? (
          <StatusMessage loading>در حال دریافت ایستگاه‌ها…</StatusMessage>
        ) : resource.status === "error" ? (
          <StatusMessage error={resource.error} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <StatusMessage>ایستگاهی یافت نشد.</StatusMessage>
        ) : (
          <div
            role="listbox"
            aria-label={label}
            className="student-station-list"
          >
            {filtered.map((station) => (
              <button
                type="button"
                role="option"
                key={station.id}
                aria-selected={station.id === value}
                aria-disabled={station.id === excludedId}
                disabled={disabled || station.id === excludedId}
                className="student-station-option"
                onClick={() => {
                  onChange(station.id);
                  close();
                }}
              >
                <Icons.MapPin size={23} aria-hidden="true" />
                <span>{station.name}</span>
                <i aria-hidden="true">
                  {station.id === value ? (
                    <Icons.CheckCircle size={20} />
                  ) : (
                    <Icons.ArrowRight size={19} className="rotate-180" />
                  )}
                </i>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
