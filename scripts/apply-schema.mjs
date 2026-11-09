#!/usr/bin/env node
/**
 * Applies the CanPreciseAI HMIS schema in drizzle/migrations to Supabase/Postgres.
 *
 * Usage:
 *   node scripts/apply-schema.mjs                   # migrations only
 *   node scripts/apply-schema.mjs --seed             # migrations and demo data
 *   node scripts/apply-schema.mjs --seed-only        # demo data after migrations
 *
 * The URL is read from `.env.local` (or `.env`) when it is not already
 * exported. For Supabase, use the session pooler URL if the direct host is
 * unreachable from your network.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "drizzle", "migrations");
const MIGRATION_TABLE = "public.canprecise_schema_migrations";
const SEED_FILE = join(ROOT, "supabase", "seed-demo-data.sql");

export const LEGACY_MARKERS = {
  "0000_hmis_staff_auth.sql": [
    ["type", "public.staff_role"],
    ["table", "public.staff_profiles"],
    ["table", "public.user_roles"],
    ["function", "public.handle_new_staff()"],
  ],
  "0001_patient_accounts.sql": [
    ["table", "public.patient_profiles"],
    ["table", "public.staff_approval_requests"],
    ["function", "public.review_staff_access_request(uuid,boolean)"],
    ["function", "public.promote_confirmed_staff_admin()"],
  ],
  "0002_hmis_multi_tenant_core.sql": [
    ["table", "public.tenants"],
    ["table", "public.user_role_assignments"],
    ["function", "public.is_tenant_member(uuid)"],
    ["function", "public.has_permission(text)"],
  ],
  "0003_hmis_entry_wiring.sql": [
    ["function", "public.default_facility_id()"],
    ["function", "public.ensure_department(uuid,text)"],
    ["function", "public.my_employment()"],
  ],
  "0004_hmis_shared_foundations.sql": [
    ["table", "public.document_metadata"],
    ["table", "public.approval_steps"],
    ["table", "public.beds"],
  ],
  "0005_hmis_patients_clinical.sql": [
    ["table", "public.patients"],
    ["table", "public.patient_portal_access"],
    ["table", "public.patient_merge_repoints"],
  ],
  "0006_hmis_diagnostics.sql": [
    ["table", "public.lab_orders"],
    ["table", "public.radiology_reports"],
    ["table", "public.imaging_studies"],
  ],
  "0007_hmis_stock_pharmacy.sql": [
    ["table", "public.inventory_locations"],
    ["table", "public.prescriptions"],
    ["table", "public.dispense_allocations"],
  ],
  "0008_hmis_billing.sql": [
    ["table", "public.charge_catalog"],
    ["table", "public.invoices"],
    ["table", "public.service_charge_map"],
  ],
  "0009_hmis_finance.sql": [
    ["table", "public.legal_entities"],
    ["table", "public.journal_entries"],
    ["table", "public.vendors"],
  ],
  "0010_hmis_procurement_assets.sql": [
    ["table", "public.purchase_requisitions"],
    ["table", "public.assets"],
    ["table", "public.vendor_payments"],
  ],
  "0011_hmis_hr_payroll.sql": [
    ["table", "public.attendance_records"],
    ["table", "public.payroll_runs"],
    ["table", "public.employee_exit_settlements"],
  ],
  "0012_hmis_audit_integration.sql": [
    ["table", "public.audit_events"],
    ["table", "public.integration_messages"],
    ["table", "public.notification_jobs"],
  ],
  "0019_existing_hospital_admin_registration.sql": [
    ["index", "public.hospital_admin_registration_requests_tenant_status_idx"],
  ],
  "0021_one_hospital_admin_per_hospital.sql": [
    ["index", "public.tenants_normalized_name_key"],
    ["index", "public.hospital_admin_registration_requests_pending_name_key"],
    ["function", "public.enforce_single_hospital_admin()"],
  ],
  "0022_staff_invoice_updates.sql": [
    ["function", "public.is_patient_account()"],
  ],
  "0023_auth_registration_handler.sql": [
    ["trigger", "auth.users:on_staff_auth_user_created"],
  ],
  "0024_invoice_edit_roles.sql": [
    ["function", "public.is_tenant_receptionist(uuid)"],
  ],
  "0025_staff_invoice_drafts.sql": [
    [
      "function",
      "public.create_staff_draft_invoice(uuid,uuid,uuid,numeric,numeric,numeric)",
    ],
  ],
  "0026_itemized_staff_invoice_drafts.sql": [
    [
      "function",
      "public.create_staff_draft_invoice(uuid,uuid,uuid,jsonb,numeric,numeric)",
    ],
  ],
  "0027_medicine_catalog_inventory_stock.sql": [
    [
      "function",
      "public.manage_medicine_inventory_mapping(uuid,uuid,uuid,numeric,text)",
    ],
    ["function", "public.get_medicine_catalog_stock(uuid)"],
  ],
  "0028_medicine_stock_link_state.sql": [
    ["function", "public.get_medicine_catalog_stock(uuid)"],
  ],
  "0029_ward_nurse_bed_updates.sql": [
    ["function", "public.is_tenant_nurse(uuid)"],
  ],
  "0030_staff_availability.sql": [
    ["function", "public.set_my_availability(text)"],
  ],
  "0031_demo_medicine_catalog.sql": [
    ["function", "public.seed_demo_medicine_catalog(uuid)"],
  ],
  "0032_wards.sql": [
    ["table", "public.wards"],
    ["function", "public.seed_demo_wards(uuid)"],
  ],
  "0033_patient_registration_approval.sql": [
    ["function", "public.pending_patient_registrations()"],
  ],
  "0034_patient_approval_role_names.sql": [
    ["index", "public.patient_profiles_registration_status_idx"],
  ],
  "0035_medicine_requests.sql": [["table", "public.medicine_requests"]],
  "0036_appointment_doctor_response.sql": [
    ["function", "public.respond_to_appointment(uuid,text,text)"],
  ],
  "0037_bed_occupied_flag.sql": [["index", "public.beds_occupied_idx"]],
};

export function deriveLegacyBaseline(files, markerStates) {
  const baseline = [];
  let foundUnapplied = false;

  for (const file of files) {
    const markers = markerStates[file];
    if (!markers?.length) {
      throw new Error(`Missing legacy-schema markers for ${file}`);
    }

    const present = markers.filter(Boolean).length;
    if (present !== 0 && present !== markers.length) {
      throw new Error(
        `Legacy schema is incomplete for ${file}; refusing to guess which SQL was applied.`,
      );
    }

    const applied = present === markers.length;
    if (applied && foundUnapplied) {
      throw new Error(
        `Legacy schema has a migration gap before ${file}; repair it before applying migrations.`,
      );
    }
    if (!applied) foundUnapplied = true;
    else baseline.push(file);
  }

  return baseline;
}

export function validateSupabaseProjectUrl(projectUrl, databaseUrl) {
  const project = new URL(projectUrl);
  const database = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (localHosts.has(project.hostname) && localHosts.has(database.hostname)) {
    return;
  }

  const projectRef = project.hostname.match(
    /^([a-z0-9-]+)\.supabase\.co$/i,
  )?.[1];
  if (!projectRef) {
    throw new Error(
      "SUPABASE_URL must be your project's Supabase URL so the database target can be verified.",
    );
  }

  const directDatabaseRef = database.hostname.match(
    /^db\.([a-z0-9-]+)\.supabase\.co$/i,
  )?.[1];
  const poolerUser = decodeURIComponent(database.username);
  const isMatchingPooler =
    database.hostname.endsWith(".pooler.supabase.com") &&
    poolerUser === `postgres.${projectRef}`;
  if (directDatabaseRef !== projectRef && !isMatchingPooler) {
    throw new Error(
      "SUPABASE_DB_URL does not match the project identified by SUPABASE_URL. Update both values to the same Supabase project before applying migrations.",
    );
  }
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function migrationChecksum(body) {
  return createHash("sha256").update(body).digest("hex");
}

async function readLegacyMarkerStates(sql, files) {
  const states = {};
  for (const file of files) {
    const markers = LEGACY_MARKERS[file];
    if (!markers) {
      throw new Error(
        `Add legacy-schema markers for migration ${file} before applying it.`,
      );
    }
    const tables = markers.filter(([kind]) => kind === "table");
    const indexes = markers.filter(([kind]) => kind === "index");
    const types = markers.filter(([kind]) => kind === "type");
    const functions = markers.filter(([kind]) => kind === "function");
    const triggers = markers.filter(([kind]) => kind === "trigger");
    const present = [];

    const relations = [...tables, ...indexes];
    if (relations.length) {
      const rows = await sql`
        select marker, to_regclass(marker) is not null as present
        from unnest(${sql.array(relations.map(([, marker]) => marker))}::text[]) as markers(marker)
      `;
      const byName = new Map(
        rows.map(({ marker, present }) => [marker, present]),
      );
      present.push(
        ...relations.map(([, marker]) => byName.get(marker) === true),
      );
    }

    if (types.length) {
      const rows = await sql`
        select marker, to_regtype(marker) is not null as present
        from unnest(${sql.array(types.map(([, marker]) => marker))}::text[]) as markers(marker)
      `;
      const byName = new Map(
        rows.map(({ marker, present }) => [marker, present]),
      );
      present.push(...types.map(([, marker]) => byName.get(marker) === true));
    }

    if (functions.length) {
      const rows = await sql`
        select marker, to_regprocedure(marker) is not null as present
        from unnest(${sql.array(functions.map(([, marker]) => marker))}::text[]) as markers(marker)
      `;
      const byName = new Map(
        rows.map(({ marker, present }) => [marker, present]),
      );
      present.push(
        ...functions.map(([, marker]) => byName.get(marker) === true),
      );
    }

    if (triggers.length) {
      const rows = await sql`
        select marker,
          exists (
            select 1
            from pg_trigger trigger_row
            where trigger_row.tgrelid = to_regclass(split_part(marker, ':', 1))
              and trigger_row.tgname = split_part(marker, ':', 2)
              and not trigger_row.tgisinternal
          ) as present
        from unnest(${sql.array(triggers.map(([, marker]) => marker))}::text[]) as markers(marker)
      `;
      const byName = new Map(
        rows.map(({ marker, present }) => [marker, present]),
      );
      present.push(
        ...triggers.map(([, marker]) => byName.get(marker) === true),
      );
    }

    states[file] = present;
  }
  return states;
}

function validateAppliedPrefix(files, appliedRows, checksums) {
  const appliedFiles = appliedRows.map(({ filename }) => filename);
  if (appliedFiles.some((file, index) => file !== files[index])) {
    throw new Error(
      "The migration ledger is not a continuous prefix of the migration files. Repair it before continuing.",
    );
  }
  for (const row of appliedRows) {
    if (row.checksum !== checksums.get(row.filename)) {
      throw new Error(
        `Applied migration ${row.filename} has changed. Add a new migration instead of editing it.`,
      );
    }
  }
}

async function main() {
  const fileEnv = {
    ...readEnvFile(join(ROOT, ".env")),
    ...readEnvFile(join(ROOT, ".env.local")),
  };
  const url =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    fileEnv.DATABASE_URL ||
    fileEnv.SUPABASE_DB_URL;

  if (!url) {
    throw new Error(
      "No database connection string found. Add SUPABASE_DB_URL to .env.local or export it in your shell.",
    );
  }
  if (!/^postgres(ql)?:\/\//.test(url) || /[<>]/.test(url)) {
    throw new Error(
      "SUPABASE_DB_URL must be a PostgreSQL connection URI with all placeholders replaced.",
    );
  }
  const projectUrl =
    process.env.SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    fileEnv.VITE_SUPABASE_URL;
  if (!projectUrl) {
    throw new Error(
      "Set SUPABASE_URL to your own Supabase project in .env.local so the database target can be verified.",
    );
  }
  validateSupabaseProjectUrl(projectUrl, url);

  const files = readdirSync(MIGRATIONS)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  if (!files.length)
    throw new Error(`No migration files found in ${MIGRATIONS}`);

  const bodies = new Map(
    files.map((file) => [file, readFileSync(join(MIGRATIONS, file), "utf8")]),
  );
  const checksums = new Map(
    files.map((file) => [file, migrationChecksum(bodies.get(file))]),
  );
  const wantsSeed = process.argv.includes("--seed");
  const seedOnly = process.argv.includes("--seed-only");
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  let locked = false;

  try {
    await sql`select pg_advisory_lock(hashtext('canpreciseai:schema-migrations'))`;
    locked = true;
    await sql.unsafe(`
      create table if not exists ${MIGRATION_TABLE} (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);
    await sql.unsafe(`
      revoke all on table ${MIGRATION_TABLE} from anon, authenticated;
      alter table ${MIGRATION_TABLE} enable row level security;
    `);

    const appliedRows = await sql`
      select filename, checksum
      from ${sql.unsafe(MIGRATION_TABLE)}
      order by filename
    `;
    const recordedNames = new Set(appliedRows.map(({ filename }) => filename));
    const unknownMigrations = [...recordedNames].filter(
      (file) => !checksums.has(file),
    );
    if (unknownMigrations.length) {
      throw new Error(
        `Migration ledger contains files missing from this checkout: ${unknownMigrations.join(", ")}`,
      );
    }
    validateAppliedPrefix(files, appliedRows, checksums);

    let completed = appliedRows.length;
    if (appliedRows.length === 0) {
      const markerStates = await readLegacyMarkerStates(sql, files);
      const baseline = deriveLegacyBaseline(files, markerStates);
      if (baseline.length) {
        await sql.begin(async (tx) => {
          for (const filename of baseline) {
            await tx`
              insert into ${tx.unsafe(MIGRATION_TABLE)} (filename, checksum)
              values (${filename}, ${checksums.get(filename)})
            `;
          }
        });
        completed = baseline.length;
        console.log(`Recorded ${completed} previously applied migration(s).`);
      }
    }

    if (seedOnly && completed !== files.length) {
      throw new Error(
        "Cannot seed demo data until all migrations are applied. Run `npm run db:apply` first.",
      );
    }

    if (!seedOnly) {
      for (const file of files.slice(completed)) {
        process.stdout.write(`→ ${file} ... `);
        await sql.begin(async (tx) => {
          await tx.unsafe(bodies.get(file));
          await tx`
            insert into ${tx.unsafe(MIGRATION_TABLE)} (filename, checksum)
            values (${file}, ${checksums.get(file)})
          `;
        });
        console.log("ok");
      }
    }

    if (wantsSeed || seedOnly) {
      if (!existsSync(SEED_FILE))
        throw new Error(`Seed file not found: ${SEED_FILE}`);
      process.stdout.write("→ seed-demo-data.sql ... ");
      const notices = [];
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(SEED_FILE, "utf8"), [], {
          onnotice: (notice) => notices.push(notice.message),
        });
      });
      console.log("ok");
      for (const notice of notices) console.log(`   ${notice}`);
    }

    await sql.unsafe("notify pgrst, 'reload schema'");
    console.log("\nDone. PostgREST schema cache reload requested.");
  } finally {
    if (locked) {
      await sql`select pg_advisory_unlock(hashtext('canpreciseai:schema-migrations'))`;
    }
    await sql.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const code = error.code ? ` [${error.code}]` : "";
    const safeMessage = error.message.replace(
      /postgres(?:ql)?:\/\/\S+/gi,
      "[hidden database URL]",
    );
    console.error(`\nMigration failed${code}: ${safeMessage}`);
    if (error.code === "ENOTFOUND") {
      console.error(
        "Check that the Supabase project is active and the database hostname is correct. If your network cannot reach the direct database host, use the session-pooler URI from Project Settings → Database.",
      );
    }
    process.exitCode = 1;
  });
}
