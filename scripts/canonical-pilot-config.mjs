const REQUIRED = [
  "PILOT_BASE_URL",
  "PILOT_EXPECTED_HOST",
  "PILOT_CONFIRM",
  "PILOT_INSTITUTION_SLUG",
  "PILOT_ADMIN_EMAIL",
  "PILOT_TEACHER_EMAIL",
  "PILOT_STUDENT_EMAIL",
  "PILOT_PARENT_EMAIL",
  "PILOT_PASSWORD",
];

export function getPreviewProtectionHeaders(env = process.env) {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return {};
  if (secret.length > 4096 || /[\r\n]/.test(secret)) {
    throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET no es válido.");
  }
  return { "x-vercel-protection-bypass": secret };
}

export function getPreviewProtectionHeadersForUrl(requestUrl, expectedHost, env = process.env) {
  const url = new URL(requestUrl);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== expectedHost.toLowerCase()) return {};
  return getPreviewProtectionHeaders(env);
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

export function loadCanonicalPilotConfig(env = process.env) {
  for (const name of REQUIRED) required(env, name);
  if (env.PILOT_CONFIRM !== "PREVIEW_ONLY") {
    throw new Error("PILOT_CONFIRM debe ser PREVIEW_ONLY.");
  }

  const baseUrl = new URL(required(env, "PILOT_BASE_URL"));
  const expectedHost = required(env, "PILOT_EXPECTED_HOST").toLowerCase();
  const hostname = baseUrl.hostname.toLowerCase();
  if (baseUrl.protocol !== "https:") throw new Error("El piloto desplegado exige HTTPS.");
  if (hostname !== expectedHost) throw new Error("PILOT_EXPECTED_HOST no coincide con PILOT_BASE_URL.");
  if (!hostname.endsWith(".vercel.app") || !hostname.includes("-git-")) {
    throw new Error("El runner solo admite deployments Preview de Vercel con un host -git-.");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("PILOT_BASE_URL no puede contener credenciales, query ni fragmento.");
  }

  const slug = required(env, "PILOT_INSTITUTION_SLUG");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("PILOT_INSTITUTION_SLUG no es válido.");
  const password = required(env, "PILOT_PASSWORD");
  if (password.length < 10 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password)) {
    throw new Error("PILOT_PASSWORD debe tener al menos 10 caracteres, una letra y un número.");
  }

  const emails = {
    admin: required(env, "PILOT_ADMIN_EMAIL").toLowerCase(),
    teacher: required(env, "PILOT_TEACHER_EMAIL").toLowerCase(),
    student: required(env, "PILOT_STUDENT_EMAIL").toLowerCase(),
    parent: required(env, "PILOT_PARENT_EMAIL").toLowerCase(),
  };
  if (new Set(Object.values(emails)).size !== 4 || Object.values(emails).some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
    throw new Error("Los cuatro correos piloto deben ser válidos y distintos.");
  }

  const scratch = required(env, "KIROCREW_SCRATCH");
  return Object.freeze({
    baseUrl: baseUrl.origin,
    expectedHost,
    institution: {
      name: env.PILOT_INSTITUTION_NAME?.trim() || "Colegio Piloto",
      slug,
    },
    users: {
      admin: { name: "Administración Piloto", email: emails.admin },
      teacher: { name: "Docente Piloto", email: emails.teacher },
      student: { name: "Estudiante Piloto", email: emails.student },
      parent: { name: "Tutor Piloto", email: emails.parent },
    },
    password,
    headless: env.PILOT_HEADLESS !== "false",
    scratch,
  });
}
