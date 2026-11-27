import { formatPhone, isStoredPhone } from "./phone";
import { formatMytWhen } from "./schedule";

/** wa.me deep link with a pre-filled message (design §7). No API, no cost. */
export function whatsappLink(storedPhone: string, message: string): string {
  if (!isStoredPhone(storedPhone)) {
    throw new Error("WhatsApp links need a phone stored as 60XXXXXXXXX");
  }
  return `https://wa.me/${storedPhone}?text=${encodeURIComponent(message)}`;
}

export interface TechnicianJob {
  technicianName: string;
  orderNo: string;
  serviceType: string;
  customerName: string;
  customerPhone: string;
  address: string;
  scheduledAt: string;
}

/** Message an admin sends a technician after assigning a job (Module 1 bonus). */
export function technicianJobMessage(job: TechnicianJob): string {
  return [
    `Hi ${job.technicianName}, new job assigned:`,
    `${job.orderNo} – ${job.serviceType}`,
    `When: ${formatMytWhen(job.scheduledAt)}`,
    `Customer: ${job.customerName} (${formatPhone(job.customerPhone)})`,
    `Address: ${job.address}`,
  ].join("\n");
}
