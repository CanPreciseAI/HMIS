#!/usr/bin/env node
/**
 * Creates 5 demo logins per staff actor in the Apollo Hospital tenant and
 * approves them: auth user + identity + staff profile + employee + role
 * assignment + approved access request.
 *
 * Format: <actorname><i>@gmail.com, i = 1..5, password cuarti2c for all.
 * Safe to re-run: existing accounts are updated, not duplicated.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const ROOT = process.cwd();
const PASSWORD = "cuarti2c";
const ADMIN_EMAIL = "prajvalakka021@gmail.com";

const ACTORS = [
  {
    role: "doctor",
    prefix: "doctor",
    code: "DOC",
    designation: "doctor",
    departments: ["Radiology", "General", "Laboratory"],
    specializations: [
      "General Medicine",
      "Cardiology",
      "Pathology",
      "Internal Medicine",
      "Radiology",
    ],
    people: [
      ["Dr. Ananya Rao", "9845012301"],
      ["Dr. Rohan Mehta", "9845012302"],
      ["Dr. Priya Nair", "9845012303"],
      ["Dr. Karthik Reddy", "9845012304"],
      ["Dr. Sneha Kulkarni", "9845012305"],
    ],
  },
  {
    role: "nurse",
    prefix: "nurse",
    code: "NUR",
    designation: "nurse",
    departments: ["General"],
    people: [
      ["Divya Menon", "9845012311"],
      ["Aarti Sharma", "9845012312"],
      ["Rekha Pillai", "9845012313"],
      ["Sunita Yadav", "9845012314"],
      ["Neha Joshi", "9845012315"],
    ],
  },
  {
    role: "receptionist",
    prefix: "receptionist",
    code: "REC",
    designation: "receptionist",
    departments: ["General", "Administration"],
    people: [
      ["Pooja Shetty", "9845012321"],
      ["Ramesh Gupta", "9845012322"],
      ["Shruti Desai", "9845012323"],
      ["Vivek Patil", "9845012324"],
      ["Meena Iyer", "9845012325"],
    ],
  },
  {
    role: "pharmacist",
    prefix: "pharmacist",
    code: "PHA",
    designation: "pharmacist",
    departments: ["General"],
    people: [
      ["Sandeep Kulkarni", "9845012331"],
      ["Farah Sheikh", "9845012332"],
      ["Nikhil Rao", "9845012333"],
      ["Anjali Verma", "9845012334"],
      ["Imran Sait", "9845012335"],
    ],
  },
  {
    role: "lab_technician",
    prefix: "labtechnician",
    code: "LAB",
    designation: "lab_technician",
    departments: ["Laboratory"],
    people: [
      ["Suresh Babu", "9845012341"],
      ["Latha Krishnan", "9845012342"],
      ["Manish Tiwari", "9845012343"],
      ["Deepa Nambiar", "9845012344"],
      ["Arvind Kumar", "9845012345"],
    ],
  },
  {
    role: "insurance",
    prefix: "insurance",
    code: "INS",
    designation: null,
    departments: ["Administration", "General"],
    people: [
      ["Ritu Malhotra", "9845012351"],
      ["Sameer Khan", "9845012352"],
      ["Kavita Rane", "9845012353"],
      ["Ajay Bhat", "9845012354"],
      ["Nisha Fernandes", "9845012355"],
    ],
  },
  {
    role: "hospital_admin",
    prefix: "hospitaladmin",
    code: "HAD",
    designation: "admin",
    departments: ["Administration"],
    people: [
      ["Harish Prasad", "9845012361"],
      ["Shalini Kapoor", "9845012362"],
      ["Girish Naik", "9845012363"],
      ["Bhavna Shah", "9845012364"],
      ["Mohan Das", "9845012365"],
    ],
  },
  {
    role: "admin",
    prefix: "admin",
    code: "ADM",
    designation: "admin",
    departments: ["Administration"],
    people: [
      ["Aditya Rao", "9845012371"],
      ["Swati Jain", "9845012372"],
      ["Rajesh Kamath", "9845012373"],
      ["Tanvi Shah", "9845012374"],
      ["Vikas Hegde", "9845012375"],
    ],
  },
];

const AVAILABILITY = ["available", "busy", "on_leave", "off_duty"];
const ROLE_LABELS = {
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  pharmacist: "Pharmacist",
  lab_technician: "Lab Technician",
  insurance: "Insurance",
  hospital_admin: "Hospital Administrator",
  admin: "Platform Administrator",
};

function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function main() {
  const env = {
    ...readEnvFile(join(ROOT, ".env")),
    ...readEnvFile(join(ROOT, ".env.local")),
  };
  const sql = postgres(env.SUPABASE_DB_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
  });

  try {
    const [tenant] = await sql`
      select e.tenant_id as id, f.id as facility_id
      from public.employees e
      join public.facilities f on f.tenant_id = e.tenant_id
      join auth.users u on u.id = e.user_id
      where lower(u.email) = 'doc@gmail.com'
      order by f.facility_code = 'MAIN' desc
      limit 1
    `;
    if (!tenant) throw new Error("Could not resolve the demo hospital tenant.");
    const [admin] = await sql`
      select id from auth.users where lower(email) = ${ADMIN_EMAIL} limit 1
    `;
    if (!admin) throw new Error(`No admin account for ${ADMIN_EMAIL}.`);

    const departments = new Map(
      (
        await sql`select id, name from public.departments where tenant_id = ${tenant.id}`
      ).map((row) => [row.name, row.id]),
    );
    const designations = new Map(
      (
        await sql`select id, code from public.designations`
      ).map((row) => [row.code, row.id]),
    );

    const created = [];
    let index = 0;

    await sql.begin(async (tx) => {
      for (const actor of ACTORS) {
        for (let i = 1; i <= 5; i += 1) {
          index += 1;
          const email = `${actor.prefix}${i}@gmail.com`;
          const [fullName, phone] = actor.people[i - 1];
          const department =
            actor.departments[(i - 1) % actor.departments.length];
          const specialization = actor.specializations
            ? actor.specializations[i - 1]
            : null;
          const licenseNumber =
            actor.role === "doctor" ? `MCI-2026-${4000 + index}` : null;
          const availability = AVAILABILITY[(i - 1) % AVAILABILITY.length];
          let tenantId = tenant.id;
          let facilityId = tenant.facility_id;
          let departmentId = departments.get(department) ?? null;
          let employeeCode = `DUM-${actor.code}-${i}`;

          if (actor.role === "hospital_admin") {
            // The app allows one hospital administrator per hospital, so each
            // demo administrator gets their own demo hospital.
            const slug = `demo-hospital-${i}`;
            let [demo] = await tx`
              select id from public.tenants where slug = ${slug} limit 1
            `;
            if (!demo) {
              [demo] = await tx`
                insert into public.tenants (name, slug, status)
                values (${`Demo Hospital ${i}`}, ${slug}, 'active')
                returning id
              `;
            }
            tenantId = demo.id;
            let [facility] = await tx`
              select id from public.facilities
              where tenant_id = ${tenantId} and facility_code = 'MAIN' limit 1
            `;
            if (!facility) {
              [facility] = await tx`
                insert into public.facilities
                  (tenant_id, name, facility_code, address)
                values (${tenantId}, ${`Demo Hospital ${i}`}, 'MAIN',
                        'Demo campus')
                returning id
              `;
            }
            facilityId = facility.id;
            let [demoDepartment] = await tx`
              select id from public.departments
              where facility_id = ${facilityId} and department_code = 'ADMIN'
              limit 1
            `;
            if (!demoDepartment) {
              [demoDepartment] = await tx`
                insert into public.departments
                  (tenant_id, facility_id, name, department_code)
                values (${tenantId}, ${facilityId}, 'Administration', 'ADMIN')
                returning id
              `;
            }
            departmentId = demoDepartment.id;
            employeeCode = `HADM-${i}`;
          }
          // The staff_role enum has no hospital_admin/platform-admin value, so
          // those accounts pass the signup trigger as staff and get their real
          // role from the tenant role assignment instead.
          const metadataRole =
            actor.role === "admin" || actor.role === "hospital_admin"
              ? "receptionist"
              : actor.role;

          let [user] = await tx`
            select id from auth.users where lower(email) = lower(${email}) limit 1
          `;

          if (!user) {
            [user] = await tx`
              insert into auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at, phone, is_sso_user, is_anonymous
              ) values (
                '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
                'authenticated', 'authenticated', ${email},
                extensions.crypt(${PASSWORD}, extensions.gen_salt('bf')),
                now(),
                ${tx.json({ provider: "email", providers: ["email"] })},
                ${tx.json({
                  account_type: "staff",
                  role: metadataRole,
                  tenant_id: tenant.id,
                  full_name: fullName,
                  phone,
                  department,
                  specialization,
                  license_number: licenseNumber,
                })},
                now(), now(), ${phone}, false, false
              )
              returning id
            `;
            await tx`
              insert into auth.identities
                (id, provider_id, user_id, identity_data, provider,
                 created_at, updated_at, last_sign_in_at)
              values (
                gen_random_uuid(), ${user.id}, ${user.id},
                ${tx.json({ sub: user.id, email, email_verified: true })},
                'email', now(), now(), now()
              )
            `;
          } else {
            await tx`
              update auth.users
              set encrypted_password =
                    extensions.crypt(${PASSWORD}, extensions.gen_salt('bf')),
                  email_confirmed_at = coalesce(email_confirmed_at, now()),
                  updated_at = now()
              where id = ${user.id}
            `;
          }

          await tx`
            insert into public.staff_profiles
              (id, full_name, phone, department, specialization, license_number)
            values (${user.id}, ${fullName}, ${phone}, ${department},
                    ${specialization}, ${licenseNumber})
            on conflict (id) do update
              set full_name = excluded.full_name,
                  phone = excluded.phone,
                  department = excluded.department,
                  specialization = excluded.specialization,
                  license_number = excluded.license_number
          `;
          await tx`
            insert into public.users (id, email, phone, auth_subject)
            values (${user.id}, ${email}, ${phone}, ${user.id}::text)
            on conflict (id) do update
              set email = excluded.email, phone = excluded.phone
          `;
          if (actor.role !== "hospital_admin") {
            await tx`
              insert into public.user_roles (user_id, role)
              values (${user.id}, ${actor.role}::public.staff_role)
              on conflict (user_id, role) do nothing
            `;
          }

          const [employee] = await tx`
            insert into public.employees
              (tenant_id, employee_code, user_id, department_id,
               designation_id, employment_status, availability)
            values (
              ${tenantId}, ${employeeCode}, ${user.id}, ${departmentId},
              ${designations.get(actor.designation) ?? null}, 'active',
              ${availability}
            )
            on conflict (tenant_id, employee_code) do update
              set user_id = excluded.user_id,
                  department_id = excluded.department_id,
                  designation_id = excluded.designation_id,
                  employment_status = 'active',
                  availability = excluded.availability
            returning id
          `;

          const roleId = await tx`
            select public.ensure_tenant_role(${tenantId}, ${actor.role}) as id
          `;
          await tx`
            insert into public.user_role_assignments
              (user_id, role_id, tenant_id, facility_id, valid_from)
            select ${user.id}, ${roleId[0].id}, ${tenantId},
                   ${facilityId}, now()
            where ${roleId[0].id}::uuid is not null
              and not exists (
                select 1 from public.user_role_assignments a
                where a.user_id = ${user.id}
                  and a.tenant_id = ${tenantId}
                  and a.role_id = ${roleId[0].id}
              )
          `;

          if (actor.role === "admin" || actor.role === "hospital_admin") {
            // These roles are granted, not requested, and are not staff_role
            // enum values the request table can store.
            await tx`
              delete from public.staff_approval_requests where user_id = ${user.id}
            `;
          } else {
            await tx`
              insert into public.staff_approval_requests
                (user_id, requested_role, full_name, email, phone, status,
                 submitted_at, reviewed_at, reviewed_by, tenant_id)
              values (
                ${user.id}, ${actor.role}::public.staff_role, ${fullName},
                ${email}, ${phone}, 'approved', now(), now(), ${admin.id},
                ${tenant.id}
              )
              on conflict (user_id) do update
                set requested_role = excluded.requested_role,
                    full_name = excluded.full_name,
                    email = excluded.email,
                    phone = excluded.phone,
                    status = 'approved',
                    reviewed_at = now(),
                    reviewed_by = ${admin.id},
                    tenant_id = ${tenant.id}
            `;
          }

          created.push({
            email,
            role: actor.role,
            roleLabel: ROLE_LABELS[actor.role],
            name: fullName,
            phone,
            department,
            employeeCode,
            employeeId: employee.id,
          });
        }
      }
    });

    // GoTrue reads its token columns into non-nullable fields; a NULL there
    // makes password sign-in fail with "Database error querying schema".
    await sql`
      update auth.users
      set confirmation_token = coalesce(confirmation_token, ''),
          recovery_token = coalesce(recovery_token, ''),
          email_change_token_new = coalesce(email_change_token_new, ''),
          email_change = coalesce(email_change, ''),
          email_change_token_current = coalesce(email_change_token_current, ''),
          phone_change = coalesce(phone_change, ''),
          phone_change_token = coalesce(phone_change_token, ''),
          reauthentication_token = coalesce(reauthentication_token, '')
      where email in ${sql(created.map((row) => row.email))}
    `;

    const lines = [
      "CanPreciseAI — demo staff logins (Apollo Hospital)",
      "Password for every account: cuarti2c",
      "",
      "Format: <actorname><i>@gmail.com (i = 1..5)",
      "",
    ];
    let lastRole = null;
    for (const row of created) {
      if (row.role !== lastRole) {
        lines.push(`${row.roleLabel.toUpperCase()}`);
        lastRole = row.role;
      }
      lines.push(
        `  ${row.email.padEnd(24)} ${row.name.padEnd(22)} ${row.department.padEnd(16)} ${row.phone}   ${row.employeeCode}`,
      );
    }
    lines.push("", `Total accounts: ${created.length}`);
    writeFileSync(join(ROOT, "DEMO_LOGINS.txt"), `${lines.join("\n")}\n`);

    console.log(`Created/updated ${created.length} accounts.`);
    console.log(`Wrote ${join(ROOT, "DEMO_LOGINS.txt")}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  const message = String(error.message ?? error).replace(
    /postgres(?:ql)?:\/\/\S+/gi,
    "[hidden database URL]",
  );
  console.error(`Failed: ${message}`);
  process.exitCode = 1;
});
