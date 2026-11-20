import { useState } from "react";
import { LifeBuoy, Mail, MapPin, Phone } from "lucide-react";

import worldMap from "@/assets/world-map-dots.jpg";
import { Button as StatefulButton } from "@/components/ui/stateful-button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

const details = [
  {
    icon: Mail,
    label: "General enquiries",
    value: "hello@canprecise.ai",
    href: "mailto:hello@canprecise.ai",
  },
  {
    icon: Phone,
    label: "Front desk",
    value: "+91 80 4000 0000",
    href: "tel:+918040000000",
  },
  {
    icon: LifeBuoy,
    label: "Support",
    value: "support@canprecise.ai",
    href: "mailto:support@canprecise.ai",
  },
];

const mapPins = [
  { city: "Bengaluru", left: "67%", top: "44%", delay: "0s", primary: true },
  { city: "London", left: "47%", top: "27%", delay: "0.7s" },
  { city: "Dubai", left: "60%", top: "38%", delay: "1.4s" },
  { city: "Singapore", left: "73%", top: "50%", delay: "2.1s" },
  { city: "New York", left: "28%", top: "31%", delay: "2.8s" },
  { city: "Sydney", left: "82%", top: "67%", delay: "3.5s" },
];

const roles = [
  "Doctor",
  "Nurse",
  "Laboratory",
  "Pharmacy",
  "Reception",
  "Administration",
];

const fieldClass =
  "mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/25 transition focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/15";

function Field({
  label,
  name,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[11px] font-medium text-white/45">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete="off"
        className={fieldClass}
      />
    </label>
  );
}

export function ContactSection() {
  const [sent, setSent] = useState(false);

  const submit = async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setSent(true);
  };

  return (
    <section
      id="contact"
      className="relative z-10 border-t border-white/8 bg-[#030814]"
    >
      <div className="mx-auto grid w-full max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:px-10">
        <div>
          <span className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-cyan-200/80">
            <Mail className="size-5" aria-hidden="true" />
          </span>

          <h2 className="mt-5 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.08] tracking-[-0.035em] text-white">
            Talk to the team behind CanPreciseAI.
          </h2>
          <p className="mt-3 max-w-[440px] text-sm leading-relaxed text-white/45">
            Tell us how your hospital runs today and we will walk you through
            the workflow, the roles and the rollout.
          </p>

          <ul className="mt-7 space-y-3">
            {details.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="group flex items-center gap-3 text-sm text-white/55 transition hover:text-white"
                >
                  <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-cyan-200/70">
                    <item.icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-white/30">
                    {item.label}
                  </span>
                  <span className="font-medium group-hover:text-cyan-100">
                    {item.value}
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/8 bg-[#050d1c]">
            <GlowingEffect proximity={48} spread={30} />
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                We are here
              </p>
              <p className="inline-flex items-center gap-1.5 text-[10px] text-white/35">
                <MapPin
                  className="size-3 text-cyan-200/60"
                  aria-hidden="true"
                />
                Bengaluru, India
              </p>
            </div>

            <div className="relative h-44 overflow-hidden sm:h-48">
              <div className="cp-contact-map absolute inset-x-0 -bottom-6">
                <img
                  src={worldMap}
                  alt="World map of the regions CanPreciseAI supports"
                  className="w-full opacity-70 mix-blend-screen"
                />
                <span
                  className="cp-map-scan pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-[linear-gradient(90deg,transparent,rgba(103,232,249,0.18),transparent)]"
                  aria-hidden="true"
                />

                {mapPins.map((pin) => (
                  <span
                    key={pin.city}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: pin.left, top: pin.top }}
                    aria-hidden="true"
                  >
                    <span
                      className={`cp-map-pin ${
                        pin.primary ? "cp-map-pin-primary" : ""
                      }`}
                      style={{ animationDelay: pin.delay }}
                    >
                      <span
                        className="cp-map-pin-ring"
                        style={{ animationDelay: pin.delay }}
                      />
                    </span>
                  </span>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#050d1c] to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#050d1c] to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#050d1c] to-transparent" />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(10,24,48,0.95),rgba(4,10,22,0.98))] p-6 shadow-[0_50px_120px_-60px_rgba(0,0,0,0.95)] sm:p-8">
          <GlowingEffect proximity={80} spread={44} />
          <div
            className="cp-contact-dots pointer-events-none absolute inset-0"
            aria-hidden="true"
          />

          <form
            className="relative grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => event.preventDefault()}
          >
            <Field
              label="Full name"
              name="name"
              placeholder="Dr. Asha Rao"
              className="sm:col-span-1"
            />
            <Field
              label="Work email"
              name="email"
              type="email"
              placeholder="asha@hospital.org"
              className="sm:col-span-1"
            />
            <Field
              label="Hospital"
              name="hospital"
              placeholder="Kaveri Multi-Speciality"
              className="sm:col-span-1"
            />
            <label className="block">
              <span className="text-[11px] font-medium text-white/45">
                Your role
              </span>
              <select
                name="role"
                defaultValue="Doctor"
                className={cn(fieldClass, "appearance-none text-white/80")}
              >
                {roles.map((role) => (
                  <option key={role} value={role} className="bg-[#071022]">
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-[11px] font-medium text-white/45">
                Message
              </span>
              <textarea
                name="message"
                rows={4}
                placeholder="What would you like to see first?"
                className={cn(fieldClass, "h-auto resize-none py-2.5")}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <StatefulButton
                onClick={submit}
                loadingLabel="Sending…"
                successLabel="Message sent"
                className="min-w-[11.5rem]"
              >
                Send message
              </StatefulButton>
              <p className="text-[11px] text-white/30">
                We reply within one working day.
              </p>
            </div>

            {sent && (
              <p
                role="status"
                className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2 text-[11px] text-emerald-100/80 sm:col-span-2"
              >
                Thanks — your message is noted. Our team will be in touch.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
