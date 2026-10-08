const REQUIRED = [
  "PILOT_BASE_URL",
  "PILOT_EXPECTED_HOST",
  "PILOT_CONFIRM",
  "PILOT_INSTITUTION_SLUG",
  "PILOT_ADMIN_EMAIL",
  "PILOT_TEACHER_EMAIL",
  "PILOT_STUDENT_EMAIL",
  "PILOT_PARENT_EMAIL",
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

export async function handlePreviewProtectionRoute(route, expectedHost, env = process.env) {
  const request = route.request();
  const protectionHeaders = getPreviewProtectionHeadersForUrl(request.url(), expectedHost, env);
  if (!Object.keys(protectionHeaders).length) {
    await route.continue();
    return;
  }

  const response = await route.fetch({
    headers: { ...request.headers(), ...protectionHeaders },
    maxRedirects: 0,
  });
  await route.fulfill({ response });
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function validPassword(value, name) {
  if (value.length < 10 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value) || !/\d/.test(value)) {
    throw new Error(`${name} debe tener al menos 10 caracteres, una letra y un número.`);
  }
  return value;
}

export function loadCanonicalPilotConfig(env = process.env) {
  for (const name of REQUIRED) required(env, name);
  if (env.PILOT_CONFIRM !== "PREVIEW_ONLY") {
    throw new Error("PILOT_CONFIRM debe ser PREVIEW_ONLY.");
  }

  const mode = env.PILOT_MODE?.trim() || "bootstrap";
  if (!new Set(["bootstrap", "existing"]).has(mode)) {
    throw new Error("PILOT_MODE debe ser bootstrap o existing.");
  }
  const runId = mode === "existing" ? required(env, "PILOT_RUN_ID") : env.PILOT_RUN_ID?.trim() || "";
  if (runId && !/^[a-z0-9](?:[a-z0-9-]{0,14}[a-z0-9])?$/.test(runId)) {
    throw new Error("PILOT_RUN_ID debe usar 1-16 caracteres en minúsculas, números o guiones.");
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
  const userPassword = validPassword(env.PILOT_USER_PASSWORD?.trim() || required(env, "PILOT_PASSWORD"), "PILOT_USER_PASSWORD");
  const adminPassword = mode === "existing"
    ? validPassword(required(env, "PILOT_ADMIN_PASSWORD"), "PILOT_ADMIN_PASSWORD")
    : userPassword;

  const emails = {
    admin: required(env, "PILOT_ADMIN_EMAIL").toLowerCase(),
    teacher: required(env, "PILOT_TEACHER_EMAIL").toLowerCase(),
    student: required(env, "PILOT_STUDENT_EMAIL").toLowerCase(),
    parent: required(env, "PILOT_PARENT_EMAIL").toLowerCase(),
  };
  if (new Set(Object.values(emails)).size !== 4 || Object.values(emails).some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
    throw new Error("Los cuatro correos piloto deben ser válidos y distintos.");
  }

  const tag = runId ? ` ${runId}` : "";
  const codeTag = runId ? runId.toUpperCase() : "101";
  const scratch = required(env, "KIROCREW_SCRATCH");
  return Object.freeze({
    mode,
    runId,
    baseUrl: baseUrl.origin,
    expectedHost,
    institution: {
      name: env.PILOT_INSTITUTION_NAME?.trim() || "Colegio Piloto",
      slug,
    },
    users: {
      admin: { name: "Administración Piloto", email: emails.admin },
      teacher: { name: `Docente Piloto${tag}`, email: emails.teacher },
      student: { name: `Estudiante Piloto${tag}`, email: emails.student },
      parent: { name: `Tutor Piloto${tag}`, email: emails.parent },
    },
    artifacts: {
      periodName: `Año escolar piloto${tag}`,
      unitName: `Departamento Académico${tag}`,
      courseName: `Curso Piloto${tag}`,
      courseCode: `PIL-${codeTag}`,
      sectionTitle: `Fundamentos${tag}`,
      lessonTitle: `Actividad inicial${tag}`,
      assignmentTitle: `Entrega del piloto${tag}`,
      announcementTitle: `Aviso del curso piloto${tag}`,
      submissionText: `Reflexión persistente del estudiante piloto${tag}.`,
      imageName: `aviso-piloto${runId ? `-${runId}` : ""}.png`,
    },
    adminPassword,
    userPassword,
    password: userPassword,
    headless: env.PILOT_HEADLESS !== "false",
    scratch,
  });
}
