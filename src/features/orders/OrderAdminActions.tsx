"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { ActionDialog } from "./ActionDialog";
import { assignOrderAction, rescheduleOrderAction, updateOrderAction } from "./actions";
import { errorProps, FormField, SELECT_CLASS } from "./FormField";
import type { OrderStatus } from "./labels";
import { formatPhone } from "./phone";
import type { ServiceType, Technician, TechnicianJobSlot } from "./queries";
import { mytParts, slotsIncluding } from "./schedule";
import { TechnicianPicker } from "./TechnicianPicker";

export interface EditableOrder {
  id: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  problemDescription: string;
  serviceTypeId: number;
  quotedSen: number;
  adminNotes: string | null;
  scheduledAt: string;
  technicianId: string | null;
}

interface OrderAdminActionsProps {
  order: EditableOrder;
  serviceTypes: ServiceType[];
  technicians: Technician[];
  /** Open jobs on the order's date, for job counts and clash warnings. */
  dayLoad: TechnicianJobSlot[];
}

const EDITABLE: readonly OrderStatus[] = ["new", "assigned", "in_progress"];
const RESCHEDULABLE: readonly OrderStatus[] = ["new", "assigned"];

function ReasonField({ errors, required }: { errors: Record<string, string>; required: boolean }) {
  return (
    <FormField
      id="dlg-reason"
      label={required ? "Reason" : "Reason (optional)"}
      error={errors.reason}
    >
      <Input id="dlg-reason" name="reason" {...errorProps("dlg-reason", errors.reason)} />
    </FormField>
  );
}

interface ReassignPickerProps {
  technicians: Technician[];
  load: TechnicianJobSlot[];
  scheduledAt: string;
  currentTechnicianId: string | null;
  error?: string;
}

function ReassignPicker({
  technicians,
  load,
  scheduledAt,
  currentTechnicianId,
  error,
}: ReassignPickerProps) {
  const [technicianId, setTechnicianId] = useState("");
  return (
    <TechnicianPicker
      id="dlg-technicianId"
      technicians={technicians}
      load={load}
      candidateIso={scheduledAt}
      value={technicianId}
      onChange={setTechnicianId}
      error={error}
      emptyOption="Choose…"
      excludeId={currentTechnicianId}
    />
  );
}

export function OrderAdminActions({
  order,
  serviceTypes,
  technicians,
  dayLoad,
}: OrderAdminActionsProps) {
  if (!EDITABLE.includes(order.status)) return null;
  const isOverride = order.status === "in_progress";
  const { date, time } = mytParts(order.scheduledAt);

  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        triggerLabel="Edit details"
        title="Edit order details"
        description={
          isOverride
            ? "The job has started, so a reason is required."
            : "Update customer and job details."
        }
        submitLabel="Save changes"
        action={updateOrderAction.bind(null, order.id)}
      >
        {(errors) => (
          <>
            <FormField id="dlg-customerName" label="Customer name" error={errors.customerName}>
              <Input
                id="dlg-customerName"
                name="customerName"
                defaultValue={order.customerName}
                {...errorProps("dlg-customerName", errors.customerName)}
              />
            </FormField>
            <FormField id="dlg-customerPhone" label="Phone" error={errors.customerPhone}>
              <Input
                id="dlg-customerPhone"
                name="customerPhone"
                type="tel"
                defaultValue={formatPhone(order.customerPhone)}
                {...errorProps("dlg-customerPhone", errors.customerPhone)}
              />
            </FormField>
            <FormField id="dlg-customerAddress" label="Address" error={errors.customerAddress}>
              <Textarea
                id="dlg-customerAddress"
                name="customerAddress"
                rows={2}
                defaultValue={order.customerAddress}
                {...errorProps("dlg-customerAddress", errors.customerAddress)}
              />
            </FormField>
            <FormField
              id="dlg-problemDescription"
              label="Problem description"
              error={errors.problemDescription}
            >
              <Textarea
                id="dlg-problemDescription"
                name="problemDescription"
                rows={2}
                defaultValue={order.problemDescription}
                {...errorProps("dlg-problemDescription", errors.problemDescription)}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="dlg-serviceTypeId" label="Service type" error={errors.serviceTypeId}>
                <select
                  id="dlg-serviceTypeId"
                  name="serviceTypeId"
                  defaultValue={order.serviceTypeId}
                  className={SELECT_CLASS}
                >
                  {serviceTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="dlg-quoted" label="Quoted price (RM)" error={errors.quoted}>
                <Input
                  id="dlg-quoted"
                  name="quoted"
                  inputMode="decimal"
                  defaultValue={(order.quotedSen / 100).toFixed(2)}
                  {...errorProps("dlg-quoted", errors.quoted)}
                />
              </FormField>
            </div>
            <FormField id="dlg-adminNotes" label="Admin notes" error={errors.adminNotes}>
              <Textarea
                id="dlg-adminNotes"
                name="adminNotes"
                rows={2}
                defaultValue={order.adminNotes ?? ""}
                {...errorProps("dlg-adminNotes", errors.adminNotes)}
              />
            </FormField>
            {isOverride && <ReasonField errors={errors} required />}
          </>
        )}
      </ActionDialog>

      <ActionDialog
        triggerLabel={order.technicianId ? "Reassign" : "Assign technician"}
        title={order.technicianId ? "Reassign technician" : "Assign technician"}
        description={
          order.technicianId
            ? "The current technician loses access to this job. A reason is required."
            : "The job moves to Assigned."
        }
        submitLabel="Assign"
        action={assignOrderAction.bind(null, order.id)}
      >
        {(errors) => (
          <>
            <ReassignPicker
              technicians={technicians}
              load={dayLoad}
              scheduledAt={order.scheduledAt}
              currentTechnicianId={order.technicianId}
              error={errors.technicianId}
            />
            {order.technicianId && <ReasonField errors={errors} required />}
          </>
        )}
      </ActionDialog>

      {RESCHEDULABLE.includes(order.status) && (
        <ActionDialog
          triggerLabel="Reschedule"
          title="Reschedule job"
          description="Counts as a reschedule for the assigned technician."
          submitLabel="Reschedule"
          action={rescheduleOrderAction.bind(null, order.id)}
        >
          {(errors) => (
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormField id="dlg-date" label="Date" error={errors.date}>
                  <Input
                    id="dlg-date"
                    name="date"
                    type="date"
                    defaultValue={date}
                    {...errorProps("dlg-date", errors.date)}
                  />
                </FormField>
                <FormField id="dlg-time" label="Time">
                  <select id="dlg-time" name="time" defaultValue={time} className={SELECT_CLASS}>
                    {slotsIncluding(time).map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <ReasonField errors={errors} required />
            </>
          )}
        </ActionDialog>
      )}
    </div>
  );
}
