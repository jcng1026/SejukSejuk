import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { OrderAdminActions, type EditableOrder } from "@/features/orders/OrderAdminActions";
import { getOrderDetail, type OrderDetail } from "@/features/orders/order-detail";
import { OrderDetailView, OrderHeader } from "@/features/orders/OrderDetailView";
import { isStoredPhone } from "@/features/orders/phone";
import { listServiceTypes, listTechnicians, technicianDayLoad } from "@/features/orders/queries";
import { mytParts } from "@/features/orders/schedule";
import { technicianJobMessage, whatsappLink } from "@/features/orders/whatsapp";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Order · Sejuk Sejuk Ops" };

function toEditable(order: OrderDetail): EditableOrder {
  return {
    id: order.id,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    problemDescription: order.problemDescription,
    serviceTypeId: order.serviceTypeId,
    quotedSen: order.quotedSen,
    adminNotes: order.adminNotes,
    scheduledAt: order.scheduledAt,
    technicianId: order.technician?.id ?? null,
  };
}

/** wa.me link for the assigned technician, or null if there is no usable phone. */
function notifyTechnicianLink(order: OrderDetail): string | null {
  const technician = order.technician;
  if (!technician?.phone || !isStoredPhone(technician.phone)) return null;
  return whatsappLink(
    technician.phone,
    technicianJobMessage({
      technicianName: technician.fullName,
      orderNo: order.orderNo,
      serviceType: order.serviceType,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: order.customerAddress,
      scheduledAt: order.scheduledAt,
    }),
  );
}

async function Order({ params, searchParams }: PageProps<"/orders/[id]">) {
  const user = await requireUser(["admin", "manager"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  const order = await getOrderDetail(id);
  if (!order) notFound();

  const isAdmin = user.role === "admin";
  const [serviceTypes, technicians, dayLoad] = isAdmin
    ? await Promise.all([
        listServiceTypes(),
        listTechnicians(),
        technicianDayLoad(mytParts(order.scheduledAt).date),
      ])
    : [[], [], []];

  const justCreated = query.created === "1";
  const notifyLink = justCreated ? notifyTechnicianLink(order) : null;

  return (
    <div className="flex flex-col gap-5">
      {justCreated && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent p-4 text-sm"
        >
          <span className="font-semibold">Order {order.orderNo} created.</span>
          {notifyLink && (
            <Button asChild size="sm" className="rounded-full">
              <a href={notifyLink} target="_blank" rel="noopener noreferrer">
                Notify {order.technician?.fullName} on WhatsApp
              </a>
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <OrderHeader order={order} />
        {isAdmin && (
          <OrderAdminActions
            order={toEditable(order)}
            serviceTypes={serviceTypes}
            technicians={technicians}
            dayLoad={dayLoad}
          />
        )}
      </div>
      <OrderDetailView order={order} />
    </div>
  );
}

export default function OrderPage(props: PageProps<"/orders/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading order…</p>}>
      <Order {...props} />
    </Suspense>
  );
}
