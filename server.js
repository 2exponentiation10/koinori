const express = require("express");
const path = require("path");
const crypto = require("crypto");
const compression = require("compression");
const helmet = require("helmet");

const { MIN_ATTENDEES, NOTICE_ITEMS } = require("./src/config");
const {
  buildDashboard,
  cancelReservation,
  createReservation,
} = require("./src/reservationService");

const app = express();
const port = Number(process.env.PORT || 3000);
const configuredAdminKey = process.env.ADMIN_KEY || "";
const trustProxyEnabled = process.env.TRUST_PROXY === "1";
const secureCookiesEnabled = process.env.COOKIE_SECURE === "1";
const adminCookieName = "koinori_admin";
const adminSessionMaxAgeMs = 1000 * 60 * 60 * 12;
const adminSessionToken = configuredAdminKey
  ? crypto.createHash("sha256").update(`admin:${configuredAdminKey}`).digest("hex")
  : "";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", trustProxyEnabled);
app.disable("x-powered-by");

app.use(express.urlencoded({ extended: false }));
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(express.static(path.join(__dirname, "public")));

function parseCookies(req) {
  const header = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
  const cookies = {};

  header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex === -1) {
        return;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();

      try {
        cookies[key] = decodeURIComponent(value);
      } catch (_error) {
        cookies[key] = value;
      }
    });

  return cookies;
}

function normalizeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/admin")) {
    return "/admin";
  }

  return value;
}

function hasAdminSession(req) {
  if (!configuredAdminKey) {
    return true;
  }

  const cookies = parseCookies(req);
  return cookies[adminCookieName] === adminSessionToken;
}

function isAdminAuthorized(req) {
  return hasAdminSession(req);
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthorized(req)) {
    const returnTo = normalizeReturnTo(req.originalUrl);
    res.redirect(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }

  next();
}

function normalizeFormValues(values = {}, fallbackDate) {
  return {
    reservationDate: values.reservationDate || fallbackDate,
    communityName: values.communityName || "",
    requesterName: values.requesterName || "",
    attendees: values.attendees || MIN_ATTENDEES,
    slotId: Number(values.slotId || 1),
    contact: values.contact || "",
    note: values.note || "",
  };
}

function buildFlashQuery(message, level) {
  const params = new URLSearchParams();

  if (message) {
    params.set("message", message);
  }

  if (level) {
    params.set("level", level);
  }

  return params;
}

function redirectWithFlash(res, pathname, baseParams, message, level) {
  const params = new URLSearchParams(baseParams);
  const flashParams = buildFlashQuery(message, level);

  flashParams.forEach((value, key) => {
    params.set(key, value);
  });

  const query = params.toString();
  res.redirect(query ? `${pathname}?${query}` : pathname);
}

function readFlash(req) {
  return {
    message: typeof req.query.message === "string" ? req.query.message : "",
    level: typeof req.query.level === "string" ? req.query.level : "info",
  };
}

function renderPublicPage(req, res, options = {}) {
  const dashboard = buildDashboard(options.date || req.query.date);
  const flash = readFlash(req);

  res.status(options.statusCode || 200).render("index", {
    ...dashboard,
    noticeItems: NOTICE_ITEMS,
    minAttendees: MIN_ATTENDEES,
    flashMessage: options.message || flash.message,
    flashLevel: options.level || flash.level,
    formValues: normalizeFormValues(options.formValues, dashboard.selectedDate),
  });
}

function renderAdminPage(req, res, options = {}) {
  const dashboard = buildDashboard(options.date || req.query.date);
  const flash = readFlash(req);

  res.status(options.statusCode || 200).render("admin", {
    ...dashboard,
    noticeItems: NOTICE_ITEMS,
    minAttendees: MIN_ATTENDEES,
    adminAuthEnabled: Boolean(configuredAdminKey),
    flashMessage: options.message || flash.message,
    flashLevel: options.level || flash.level,
  });
}

function renderAdminLoginPage(req, res, options = {}) {
  if (!configuredAdminKey) {
    res.redirect(normalizeReturnTo(req.query.returnTo));
    return;
  }

  if (hasAdminSession(req)) {
    res.redirect(normalizeReturnTo(options.returnTo || req.query.returnTo));
    return;
  }

  res.status(options.statusCode || 200).render("admin-login", {
    flashMessage: options.message || "",
    flashLevel: options.level || "error",
    returnTo: normalizeReturnTo(options.returnTo || req.query.returnTo),
  });
}

app.get("/", (req, res) => {
  renderPublicPage(req, res);
});

app.post("/reservations", (req, res) => {
  try {
    const result = createReservation(req.body);
    const message =
      result.status === "confirmed"
        ? `${result.slot.label} 예약이 완료되었습니다. ${result.room.name}에 자동 배정되었습니다.`
        : `${result.slot.label}은 만석입니다. 대기 ${result.waitlistPosition}번으로 등록되었습니다.`;

    redirectWithFlash(
      res,
      "/",
      { date: result.reservationDate },
      message,
      result.status === "confirmed" ? "success" : "info",
    );
  } catch (error) {
    renderPublicPage(req, res, {
      statusCode: 400,
      message: error.message || "예약 처리 중 오류가 발생했습니다.",
      level: "error",
      formValues: req.body,
      date: req.body.reservationDate,
    });
  }
});

app.get("/admin", requireAdmin, (req, res) => {
  renderAdminPage(req, res);
});

app.get("/admin/login", (req, res) => {
  renderAdminLoginPage(req, res);
});

app.post("/admin/login", (req, res) => {
  const submittedKey = typeof req.body.adminKey === "string" ? req.body.adminKey : "";
  const returnTo = normalizeReturnTo(req.body.returnTo || req.query.returnTo);

  if (!configuredAdminKey) {
    res.redirect(returnTo);
    return;
  }

  if (submittedKey !== configuredAdminKey) {
    renderAdminLoginPage(req, res, {
      statusCode: 401,
      message: "관리자 키가 올바르지 않습니다.",
      level: "error",
      returnTo,
    });
    return;
  }

  res.cookie(adminCookieName, adminSessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookiesEnabled,
    maxAge: adminSessionMaxAgeMs,
    path: "/",
  });
  res.redirect(returnTo);
});

app.post("/admin/logout", (req, res) => {
  res.clearCookie(adminCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookiesEnabled,
    path: "/",
  });
  res.redirect("/admin/login");
});

app.post("/admin/reservations/:id/cancel", requireAdmin, (req, res) => {
  const reservationId = Number(req.params.id);

  try {
    const result = cancelReservation(reservationId);

    if (!result) {
      redirectWithFlash(
        res,
        "/admin",
        {
          date: req.body.date,
        },
        "이미 취소되었거나 존재하지 않는 예약입니다.",
        "error",
      );
      return;
    }

    const promotedMessage = result.promoted
      ? ` 대기 1순위였던 ${result.promoted.communityName} 예약이 자동 승격되었습니다.`
      : "";

    redirectWithFlash(
      res,
      "/admin",
      {
        date: result.cancelled.reservationDate,
      },
      `${result.cancelled.communityName} 예약을 취소했습니다.${promotedMessage}`,
      "success",
    );
  } catch (error) {
    renderAdminPage(req, res, {
      statusCode: 400,
      message: error.message || "예약 취소 중 오류가 발생했습니다.",
      level: "error",
      date: req.body.date,
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((_req, res) => {
  res.status(404).send("페이지를 찾을 수 없습니다.");
});

const server = app.listen(port, () => {
  console.log(`Koinori service listening on http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
