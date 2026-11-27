"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { FormState } from "@/lib/result";

import { createOrderAction, dayLoadAction } from "./actions";
import { errorProps, FormField, SELECT_CLASS } from "./FormField";
import type { ServiceType, Technician, TechnicianJobSlot } from "./queries";
import { mytDateTimeToIso, TIME_SLOTS } from "./schedule";
import { TechnicianPicker } from "./TechnicianPicker";

interface NewOrderFormProps {
  serviceTypes: ServiceType[];
  technicians: Technician[];
  initialDate: string;
  initialLoad: TechnicianJobSlot[];
}

export function NewOrderForm({
  serviceTypes,
  technicians,
  initialDate,
  initialLoad,
}: NewOrderFormProps) {
  const [state, submit, isSubmitting] = useActionState<FormState, FormData>(
    createOrderAction,
    null,
  );
  const [, startTransition] = useTransition();
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("10:00");
  const [technicianId, setTechnicianId] = useState("");
  const [load, setLoad] = useState(initialLoad);
  const [isLoadingDay, startLoadingDay] = useTransition();
  const latestDate = useRef(initialDate);

  const errors = state && !state.ok ? (state.error.fields ?? {}) : {};
  const formError = state && !state.ok && !state.error.fields ? state.error.message : undefined;

  function handleDateChange(next: string) {
    setDate(next);
    latestDate.current = next;
    startLoadingDay(async () => {
      try {
        const slots = await dayLoadAction(next);
        // Ignore answers for a date the user has already moved away from.
        if (latestDate.current === next) setLoad(slots);
      } catch {
        if (latestDate.current === next) setLoad([]);
      }
    });
  }

  // Submit without React's automatic form reset, so a rejected form keeps its values.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isSubmitting}
      className="grid gap-6 lg:grid-cols-2"
    >
      <fieldset className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
        <legend className="px-1 font-heading text-lg">Customer</legend>
        <FormField id="new-customerName" label="Customer name" error={errors.customerName}>
          <Input
            id="new-customerName"
            name="customerName"
            autoComplete="off"
            {...errorProps("new-customerName", errors.customerName)}
          />
        </FormField>
        <FormField
          id="new-customerPhone"
          label="Phone"
          error={errors.customerPhone}
          hint="For WhatsApp updates, e.g. 012-345 6789"
        >
          <Input
            id="new-customerPhone"
            name="customerPhone"
            type="tel"
            inputMode="tel"
            {...errorProps("new-customerPhone", errors.customerPhone, true)}
          />
        </FormField>
        <FormField id="new-customerAddress" label="Address" error={errors.customerAddress}>
          <Textarea
            id="new-customerAddress"
            name="customerAddress"
            rows={2}
            {...errorProps("new-customerAddress", errors.customerAddress)}
          />
        </FormField>
        <FormField
          id="new-problemDescription"
          label="Problem description"
          error={errors.problemDescription}
        >
          <Textarea
            id="new-problemDescription"
            name="problemDescription"
            rows={3}
            {...errorProps("new-problemDescription", errors.problemDescription)}
          />
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
        <legend className="px-1 font-heading text-lg">Job</legend>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="new-serviceTypeId" label="Service type" error={errors.serviceTypeId}>
            <select
              id="new-serviceTypeId"
              name="serviceTypeId"
              className={SELECT_CLASS}
              defaultValue=""
              {...errorProps("new-serviceTypeId", errors.serviceTypeId)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {serviceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="new-quoted" label="Quoted price (RM)" error={errors.quoted}>
            <Input
              id="new-quoted"
              name="quoted"
              inputMode="decimal"
              placeholder="250.00"
              {...errorProps("new-quoted", errors.quoted)}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="new-date" label="Date" error={errors.date}>
            <Input
              id="new-date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => handleDateChange(event.target.value)}
              {...errorProps("new-date", errors.date)}
            />
          </FormField>
          <FormField id="new-time" label="Time" error={errors.time}>
            <select
              id="new-time"
              name="time"
              className={SELECT_CLASS}
              value={time}
              onChange={(event) => setTime(event.target.value)}
              {...errorProps("new-time", errors.time)}
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <TechnicianPicker
          id="new-technicianId"
          technicians={technicians}
          load={load}
          candidateIso={mytDateTimeToIso(date, time)}
          value={technicianId}
          onChange={setTechnicianId}
          error={errors.technicianId}
          isLoading={isLoadingDay}
          emptyOption="Leave unassigned (New)"
        />
        <FormField id="new-adminNotes" label="Admin notes (optional)" error={errors.adminNotes}>
          <Textarea
            id="new-adminNotes"
            name="adminNotes"
            rows={2}
            placeholder="Gate code, parking, pets…"
            {...errorProps("new-adminNotes", errors.adminNotes)}
          />
        </FormField>
      </fieldset>

      <div className="flex items-center justify-end gap-4 lg:col-span-2">
        <p role="alert" className="text-sm text-destructive">
          {formError ?? (Object.keys(errors).length > 0 ? "Check the highlighted fields." : "")}
        </p>
        <Button type="submit" size="lg" className="rounded-full px-8" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create order"}
        </Button>
      </div>
    </form>
  );
}
