import QRCode from "qrcode";
import type { Ticket } from "../types";

export async function downloadTicketImage(ticket: Ticket) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("ذخیره تصویر بلیت در این مرورگر امکان‌پذیر نیست.");
  canvas.width = 720;
  context.font = "700 24px VazirmatnStudent, Tahoma";
  const lines: { text: string; y: number; font: string }[] = [];
  let y = 150;
  const wrap = (text: string) => {
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > 620 && line) {
        lines.push({ text: line, y, font: context.font });
        y += 38;
        line = word;
      } else line = next;
    }
    if (line) {
      lines.push({ text: line, y, font: context.font });
      y += 38;
    }
  };
  wrap(`از ${ticket.origin}`);
  wrap(`به ${ticket.destination}`);
  y += 14;
  context.font = "500 21px VazirmatnStudent, Tahoma";
  for (const text of [
    `تاریخ: ${ticket.date}   ساعت: ${ticket.time}`,
    `صندلی: ${ticket.seatNumber}   قیمت: ${ticket.price}`,
    `شماره بلیت: ${ticket.id}`,
  ]) {
    wrap(text);
  }
  // Compute the document height from the route before painting, so long names cannot crop the QR.
  canvas.height = Math.max(1100, Math.ceil(y + 500));
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#2764e7";
  context.fillRect(0, 0, canvas.width, 106);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.direction = "rtl";
  context.font = "800 30px VazirmatnStudent, Tahoma";
  context.fillStyle = "#fff";
  context.fillText("بلیت سرویس دانشگاه ـ ویرا", 360, 53);
  context.fillStyle = "#132c48";
  for (const line of lines) {
    context.font = line.font;
    context.fillText(line.text, 360, line.y);
  }
  const qr = await QRCode.toDataURL(ticket.qrCode, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: "H",
  });
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("تصویر QR آماده نشد."));
    image.src = qr;
  });
  context.drawImage(image, 200, y + 22, 320, 320);
  y += 380;
  context.font = "800 40px VazirmatnStudent, Tahoma";
  context.fillText(ticket.validationCode || "", 360, y);
  context.font = "500 18px VazirmatnStudent, Tahoma";
  context.fillStyle = "#66788d";
  context.fillText(
    ticket.status === "active"
      ? "بلیت برای روز صدور معتبر است."
      : "این تصویر وضعیت فعلی بلیت را تغییر نمی‌دهد.",
    360,
    y + 48,
  );
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `ticket-${ticket.id}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
