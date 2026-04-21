"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, Loader2 } from "lucide-react";

import { Stepper } from "@/components/apply/Stepper";
import { StepCard } from "@/components/apply/StepCard";
import { CertificateUpload } from "@/components/apply/CertificateUpload";
import { EntityTypePicker } from "@/components/apply/EntityTypePicker";
import { SpeciesFocusChips } from "@/components/apply/SpeciesFocusChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  applyStep1Schema,
  applyStep2Schema,
  applyStep3Schema,
  applyStep4Schema,
  applySubmissionSchema,
  countryLabels,
  defaultSubmission,
  type ApplyCountry,
  type ApplySpecies,
  type ApplySubmissionValues
} from "@/lib/apply-schema";
import { submitApplication } from "@/lib/apply-api";

const DRAFT_KEY = "fetcht.shelter-apply.draft";
const RESULT_KEY = "fetcht.shelter-apply.lastResult";

type StepKey = "entity" | "registration" | "org" | "contact" | "review";

const STEP_LABELS: Record<StepKey, string> = {
  entity: "Entity type",
  registration: "Registration",
  org: "Organisation",
  contact: "Contact",
  review: "Review"
};
const STEP_ORDER: StepKey[] = ["entity", "registration", "org", "contact", "review"];

// Zod error → { fieldName: message } helper. Zod v4's `path` uses
// `PropertyKey[]` (so theoretically symbol); our schemas only ever use
// string keys so we narrow as we go.
function flattenIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key =
      issue.path
        .map((p) => (typeof p === "symbol" ? p.description ?? "" : String(p)))
        .join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

type SubmitState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | {
      phase: "done";
      id: string;
      accessToken: string;
      slaDeadline: string;
    }
  | { phase: "error"; message: string };

export default function ApplyPage() {
  const [values, setValues] = useState<ApplySubmissionValues>(defaultSubmission);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ phase: "idle" });
  const [hydrated, setHydrated] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  // Restore draft on mount. Done after first render so SSR doesn't try to
  // read localStorage (Next will hydrate and rerun the effect).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          values?: ApplySubmissionValues;
          stepIdx?: number;
        };
        if (parsed.values) setValues({ ...defaultSubmission, ...parsed.values });
        if (
          typeof parsed.stepIdx === "number" &&
          parsed.stepIdx >= 0 &&
          parsed.stepIdx < STEP_ORDER.length
        ) {
          setStepIdx(parsed.stepIdx);
        }
      }
      // If a previous submission is cached, surface the success screen again.
      const resultRaw = window.localStorage.getItem(RESULT_KEY);
      if (resultRaw) {
        const parsed = JSON.parse(resultRaw) as SubmitState & { phase: "done" };
        if (parsed.phase === "done") setSubmitState(parsed);
      }
    } catch {
      /* corrupted draft — ignore */
    }
    setHydrated(true);
  }, []);

  // Persist draft on every change (once hydrated).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ values, stepIdx })
      );
    } catch {
      /* storage full — ignore */
    }
  }, [values, stepIdx, hydrated]);

  const currentStep = STEP_ORDER[stepIdx];

  // Per-step validation. Each step only validates its own fields; the
  // final review step runs the full schema server-side-equivalent.
  const validateCurrent = (): boolean => {
    let result;
    switch (currentStep) {
      case "entity":
        result = applyStep1Schema.safeParse({
          country: values.country,
          entityType: values.entityType
        });
        break;
      case "registration":
        result = applyStep2Schema.safeParse({
          registrationNumber: values.registrationNumber,
          registrationCertificateUrl: values.registrationCertificateUrl
        });
        break;
      case "org":
        result = applyStep3Schema.safeParse({
          orgName: values.orgName,
          orgAddress: values.orgAddress || undefined,
          operatingRegionCountry: values.operatingRegionCountry,
          operatingRegionCity: values.operatingRegionCity,
          speciesFocus: values.speciesFocus,
          donationUrl: values.donationUrl || undefined
        });
        break;
      case "contact":
        result = applyStep4Schema.safeParse({
          primaryContactName: values.primaryContactName,
          primaryContactEmail: values.primaryContactEmail,
          primaryContactPhone: values.primaryContactPhone || undefined
        });
        break;
      case "review":
        result = applySubmissionSchema.safeParse(values);
        break;
    }
    if (!result || result.success) {
      setErrors({});
      return true;
    }
    setErrors(flattenIssues(result.error.issues));
    return false;
  };

  const next = () => {
    if (!validateCurrent()) return;
    if (stepIdx < STEP_ORDER.length - 1) setStepIdx(stepIdx + 1);
  };
  const back = () => {
    setErrors({});
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };
  const jumpTo = (idx: number) => {
    if (idx < stepIdx) {
      setErrors({});
      setStepIdx(idx);
    }
  };
  const update = <K extends keyof ApplySubmissionValues>(
    key: K,
    value: ApplySubmissionValues[K]
  ) => {
    setValues((prev: ApplySubmissionValues) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!validateCurrent()) return;
    setSubmitState({ phase: "submitting" });
    try {
      const result = await submitApplication({
        entityType: values.entityType,
        country: values.country,
        registrationNumber: values.registrationNumber,
        registrationCertificateUrl: values.registrationCertificateUrl,
        orgName: values.orgName,
        orgAddress: values.orgAddress || undefined,
        operatingRegionCountry: values.operatingRegionCountry,
        operatingRegionCity: values.operatingRegionCity,
        speciesFocus: values.speciesFocus,
        donationUrl: values.donationUrl || undefined,
        primaryContactName: values.primaryContactName,
        primaryContactEmail: values.primaryContactEmail,
        primaryContactPhone: values.primaryContactPhone || undefined
      });
      const done: SubmitState = {
        phase: "done",
        id: result.id,
        accessToken: result.accessToken,
        slaDeadline: result.slaDeadline
      };
      setSubmitState(done);
      try {
        window.localStorage.setItem(RESULT_KEY, JSON.stringify(done));
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setSubmitState({
        phase: "error",
        message:
          err instanceof Error ? err.message : "Submission failed — try again"
      });
    }
  };

  const statusUrl = useMemo(() => {
    if (submitState.phase !== "done" || typeof window === "undefined") return "";
    return `${window.location.origin}/apply/status?token=${encodeURIComponent(
      submitState.accessToken
    )}`;
  }, [submitState]);

  if (submitState.phase === "done") {
    return (
      <ConfirmationScreen
        slaDeadline={submitState.slaDeadline}
        statusUrl={statusUrl}
        justCopied={justCopied}
        onCopy={() => {
          navigator.clipboard.writeText(statusUrl).then(() => {
            setJustCopied(true);
            setTimeout(() => setJustCopied(false), 2000);
          });
        }}
        onStartOver={() => {
          try {
            window.localStorage.removeItem(RESULT_KEY);
          } catch {
            /* ignore */
          }
          setValues(defaultSubmission);
          setStepIdx(0);
          setSubmitState({ phase: "idle" });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-2">New shelter application</p>
        <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-[color:var(--foreground)]">
          Join Fetcht as a verified shelter
        </h1>
        <p className="mt-2 text-[15px] text-[color:var(--muted-foreground)] max-w-2xl">
          Tell us about your organisation and upload your registration
          certificate. Our team reviews every application within 48 hours.
        </p>
      </div>

      <Stepper
        steps={STEP_ORDER.map((k) => STEP_LABELS[k])}
        current={stepIdx}
        onJumpTo={jumpTo}
      />

      {currentStep === "entity" && (
        <StepCard
          eyebrow={`Step 1 of 5`}
          title="What kind of organisation are you?"
          description="We localise the document checks to your country's legal landscape. Pick the country where your shelter is officially registered."
          footer={
            <Button onClick={next} className="w-full sm:w-auto">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          }
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="apply-country">Country of registration</Label>
              <Select
                value={values.country}
                onValueChange={(v) => {
                  update("country", v as ApplyCountry);
                  // If the wizard's "operating region country" is still its
                  // default, mirror the change to save the user a click.
                  if (values.operatingRegionCountry === "TR" || !values.operatingRegionCountry) {
                    update("operatingRegionCountry", v as ApplyCountry);
                  }
                  update("entityType", "");
                }}
              >
                <SelectTrigger
                  id="apply-country"
                  className="h-11 rounded-xl border-[color:var(--border)] bg-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(countryLabels) as ApplyCountry[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {countryLabels[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.country && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.country}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-entity-type">Entity type</Label>
              <EntityTypePicker
                country={values.country}
                value={values.entityType}
                onChange={(slug) => update("entityType", slug)}
              />
              {errors.entityType && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.entityType}
                </p>
              )}
            </div>
          </div>
        </StepCard>
      )}

      {currentStep === "registration" && (
        <StepCard
          eyebrow="Step 2 of 5"
          title="Show us you're registered"
          description="Enter your registration/charity number and upload a copy of the certificate. We only share this document with our review team."
          footer={
            <>
              <Button variant="outline" onClick={back} className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={next} className="w-full sm:w-auto">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="apply-regnum">Registration number</Label>
              <Input
                id="apply-regnum"
                value={values.registrationNumber}
                onChange={(e) => update("registrationNumber", e.target.value)}
                placeholder="e.g. 1234567"
                className="h-11 rounded-xl"
                maxLength={100}
              />
              {errors.registrationNumber && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.registrationNumber}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Registration certificate</Label>
              <CertificateUpload
                value={values.registrationCertificateUrl}
                onChange={(url) => update("registrationCertificateUrl", url)}
                error={errors.registrationCertificateUrl}
              />
            </div>
          </div>
        </StepCard>
      )}

      {currentStep === "org" && (
        <StepCard
          eyebrow="Step 3 of 5"
          title="Your organisation"
          description="Where you operate and which animals you care for. The operating region can be different from your registration country — we base our in-app rules on where the animals are."
          footer={
            <>
              <Button variant="outline" onClick={back} className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={next} className="w-full sm:w-auto">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="apply-orgname">Organisation name</Label>
              <Input
                id="apply-orgname"
                value={values.orgName}
                onChange={(e) => update("orgName", e.target.value)}
                placeholder="e.g. Istanbul Street Paws Association"
                className="h-11 rounded-xl"
                maxLength={150}
              />
              {errors.orgName && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.orgName}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-orgaddr">Address (optional)</Label>
              <Input
                id="apply-orgaddr"
                value={values.orgAddress}
                onChange={(e) => update("orgAddress", e.target.value)}
                placeholder="Street, building, district"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="apply-opcountry">Operating country</Label>
                <Select
                  value={values.operatingRegionCountry}
                  onValueChange={(v) =>
                    update("operatingRegionCountry", v as ApplyCountry)
                  }
                >
                  <SelectTrigger
                    id="apply-opcountry"
                    className="h-11 rounded-xl border-[color:var(--border)] bg-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(countryLabels) as ApplyCountry[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {countryLabels[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apply-opcity">Operating city</Label>
                <Input
                  id="apply-opcity"
                  value={values.operatingRegionCity}
                  onChange={(e) => update("operatingRegionCity", e.target.value)}
                  placeholder="e.g. Istanbul"
                  className="h-11 rounded-xl"
                />
                {errors.operatingRegionCity && (
                  <p className="text-[12px] text-[color:var(--destructive)]">
                    {errors.operatingRegionCity}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Species focus</Label>
              <SpeciesFocusChips
                value={values.speciesFocus as ApplySpecies[]}
                onChange={(v) => update("speciesFocus", v)}
                error={errors.speciesFocus}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-donation">Donation link (optional)</Label>
              <Input
                id="apply-donation"
                value={values.donationUrl}
                onChange={(e) => update("donationUrl", e.target.value)}
                placeholder="https://…"
                className="h-11 rounded-xl"
                inputMode="url"
              />
              {errors.donationUrl && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.donationUrl}
                </p>
              )}
            </div>
          </div>
        </StepCard>
      )}

      {currentStep === "contact" && (
        <StepCard
          eyebrow="Step 4 of 5"
          title="Primary contact"
          description="The person we should message about this application. This becomes the primary login for your shelter once approved."
          footer={
            <>
              <Button variant="outline" onClick={back} className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={next} className="w-full sm:w-auto">
                Review &amp; submit
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          }
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="apply-contactname">Full name</Label>
              <Input
                id="apply-contactname"
                value={values.primaryContactName}
                onChange={(e) => update("primaryContactName", e.target.value)}
                className="h-11 rounded-xl"
                maxLength={100}
              />
              {errors.primaryContactName && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.primaryContactName}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-contactemail">Email</Label>
              <Input
                id="apply-contactemail"
                type="email"
                value={values.primaryContactEmail}
                onChange={(e) => update("primaryContactEmail", e.target.value)}
                className="h-11 rounded-xl"
                inputMode="email"
              />
              {errors.primaryContactEmail && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.primaryContactEmail}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-contactphone">Phone (optional)</Label>
              <Input
                id="apply-contactphone"
                value={values.primaryContactPhone}
                onChange={(e) => update("primaryContactPhone", e.target.value)}
                placeholder="+90 212 555 00 00"
                className="h-11 rounded-xl"
                inputMode="tel"
              />
              {errors.primaryContactPhone && (
                <p className="text-[12px] text-[color:var(--destructive)]">
                  {errors.primaryContactPhone}
                </p>
              )}
            </div>
          </div>
        </StepCard>
      )}

      {currentStep === "review" && (
        <StepCard
          eyebrow="Step 5 of 5"
          title="Review your application"
          description="One last look before submission. Click any section to edit."
          footer={
            <>
              <Button
                variant="outline"
                onClick={back}
                disabled={submitState.phase === "submitting"}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitState.phase === "submitting"}
                className="w-full sm:w-auto"
              >
                {submitState.phase === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>Submit application</>
                )}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <ReviewSection
              title="Entity type"
              onEdit={() => jumpTo(0)}
              rows={[
                ["Country", countryLabels[values.country]],
                ["Entity", values.entityType]
              ]}
            />
            <ReviewSection
              title="Registration"
              onEdit={() => jumpTo(1)}
              rows={[
                ["Registration number", values.registrationNumber],
                [
                  "Certificate",
                  values.registrationCertificateUrl ? (
                    <a
                      href={values.registrationCertificateUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[color:var(--primary)] underline underline-offset-2 inline-flex items-center gap-1"
                    >
                      View file <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    ""
                  )
                ]
              ]}
            />
            <ReviewSection
              title="Organisation"
              onEdit={() => jumpTo(2)}
              rows={[
                ["Name", values.orgName],
                ["Address", values.orgAddress || "—"],
                [
                  "Operating region",
                  `${
                    countryLabels[values.operatingRegionCountry]
                  } · ${values.operatingRegionCity}`
                ],
                [
                  "Species focus",
                  (values.speciesFocus as ApplySpecies[])
                    .map((s) =>
                      s.length > 0
                        ? s[0]!.toUpperCase() + s.slice(1).replace("_", " ")
                        : s
                    )
                    .join(", ") || "—"
                ],
                ["Donation URL", values.donationUrl || "—"]
              ]}
            />
            <ReviewSection
              title="Primary contact"
              onEdit={() => jumpTo(3)}
              rows={[
                ["Name", values.primaryContactName],
                ["Email", values.primaryContactEmail],
                ["Phone", values.primaryContactPhone || "—"]
              ]}
            />
          </div>

          {submitState.phase === "error" && (
            <div className="rounded-xl border border-[color:var(--destructive)]/40 bg-[color:var(--destructive-soft)] p-4 text-sm text-[color:var(--destructive)]">
              {submitState.message}
            </div>
          )}
        </StepCard>
      )}
    </div>
  );
}

function ReviewSection({
  title,
  rows,
  onEdit
}: {
  title: string;
  rows: [string, React.ReactNode][];
  onEdit: () => void;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border)] bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12px] font-semibold text-[color:var(--primary)] hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
              {label}
            </dt>
            <dd className="mt-0.5 text-[14px] text-[color:var(--foreground)] break-words">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ConfirmationScreen({
  slaDeadline,
  statusUrl,
  justCopied,
  onCopy,
  onStartOver
}: {
  slaDeadline: string;
  statusUrl: string;
  justCopied: boolean;
  onCopy: () => void;
  onStartOver: () => void;
}) {
  const deadlineLabel = useMemo(() => {
    const d = new Date(slaDeadline);
    return Number.isNaN(d.getTime())
      ? "within 48 hours"
      : d.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        });
  }, [slaDeadline]);
  return (
    <div className="rounded-[24px] bg-[color:var(--card)] shadow-[var(--shadow-card)] border border-[color:var(--border)] overflow-hidden">
      <div className="bg-[color:var(--primary-soft)] px-6 md:px-10 py-8 md:py-10">
        <p className="eyebrow">Application received</p>
        <h1 className="mt-2 text-[26px] md:text-[32px] font-semibold tracking-tight text-[color:var(--foreground)]">
          We'll get back to you by {deadlineLabel}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-[color:var(--muted-foreground)] leading-[1.55]">
          Our team reviews every application manually. You'll receive a
          decision within 48 hours, and can check progress anytime using the
          link below.
        </p>
      </div>
      <div className="px-6 md:px-10 py-6 space-y-4">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
            Status link — save this
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate text-[13px] text-[color:var(--foreground)]">
              {statusUrl}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={onCopy}
              className="shrink-0"
            >
              <Copy className="h-4 w-4" />
              {justCopied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button asChild>
            <Link href={statusUrl ? statusUrl.replace(window.location.origin, "") : "/apply"}>
              Go to status page
            </Link>
          </Button>
          <Button variant="ghost" onClick={onStartOver}>
            Start a new application
          </Button>
        </div>
      </div>
    </div>
  );
}
