const express = require("express");
const path = require("path");
const crypto = require("crypto");
const compression = require("compression");
const helmet = require("helmet");

const { MIN_ATTENDEES, NOTICE_ITEMS } = require("./src/config");
const { buildPublicAppState } = require("./src/publicAppState");
const {
  buildDashboard,
  cancelReservation,
  cancelReservationByLookup,
  createReservation,
  updateRoomMetadata,
  updateRoomSlotSettings,
} = require("./src/reservationService");

const app = express();
const port = Number(process.env.PORT || 3000);
const configuredAdminKey = process.env.ADMIN_KEY || process.env.ADMIN_PIN || "";
const trustProxyEnabled = process.env.TRUST_PROXY === "1";
const secureCookiesEnabled = process.env.COOKIE_SECURE === "1";
const adminCookieName = "koinori_admin";
const adminSessionMaxAgeMs = 1000 * 60 * 60 * 12;
const adminCredentialSet = new Set([configuredAdminKey].filter(Boolean));
const adminAuthEnabled = adminCredentialSet.size > 0;
const adminSessionSecret = configuredAdminKey;
const adminSessionToken = adminSessionSecret
  ? crypto.createHash("sha256").update(`admin:${adminSessionSecret}`).digest("hex")
  : "";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", trustProxyEnabled);
app.disable("x-powered-by");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);
app.use(express.static(path.join(__dirname, "dist", "public")));
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

function normalizePage(value, allowedPages, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  return allowedPages.includes(value) ? value : fallback;
}

function hasAdminSession(req) {
  if (!adminAuthEnabled) {
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

function serializeForTemplate(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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

function renderPublicApp(req, res, options = {}) {
  const flash = readFlash(req);
  const initialScreen = normalizePage(
    options.screen || req.query.screen,
    ["intro", "room", "slot", "form", "status"],
    "intro",
  );
  const initialState = buildPublicAppState({
    dateInput: options.date || req.query.date,
    initialScreen,
    formValues: options.formValues,
    roomId: options.roomId || req.query.roomId,
    slotId: options.slotId || req.query.slotId,
    message: options.message || flash.message,
    level: options.level || flash.level,
    waitlistPrompt: options.waitlistPrompt,
  });

  res.status(options.statusCode || 200).render("public-app", {
    appTitle: initialState.appTitle,
    serializedInitialState: serializeForTemplate(initialState),
  });
}

function buildWaitlistPrompt(result) {
  return {
    roomId: result.room.id,
    slotId: result.slot.id,
    message: `${result.room.name} ${result.slot.label}은 먼저 신청한 팀이 있어 대기 ${result.waitlistPosition}번으로 등록됩니다.`,
    waitlistPosition: result.waitlistPosition,
  };
}

function handlePublicReservation(req, res, options = {}) {
  const wantsJson = Boolean(options.json);

  try {
    const result = createReservation(req.body);

    if (result.status === "waitlist_confirm_required") {
      const waitlistPrompt = buildWaitlistPrompt(result);
      const message = `${result.room.name} ${result.slot.label}은 먼저 접수한 팀이 있습니다.`;

      if (wantsJson) {
        res.status(409).json({
          ok: false,
          code: "WAITLIST_CONFIRM_REQUIRED",
          message,
          state: buildPublicAppState({
            dateInput: result.reservationDate,
            initialScreen: "form",
            formValues: req.body,
            roomId: result.room.id,
            slotId: result.slot.id,
            message,
            level: "info",
            waitlistPrompt,
          }),
        });
        return;
      }

      renderPublicApp(req, res, {
        statusCode: 409,
        message,
        level: "info",
        formValues: req.body,
        date: result.reservationDate,
        screen: "form",
        roomId: result.room.id,
        slotId: result.slot.id,
        waitlistPrompt,
      });
      return;
    }

    const message =
      result.status === "confirmed"
        ? `${result.room.name} ${result.slot.label} 예약 완료`
        : `${result.room.name} ${result.slot.label} 대기 ${result.waitlistPosition}번 등록 완료`;
    const level = result.status === "confirmed" ? "success" : "info";

    if (wantsJson) {
      res.json({
        ok: true,
        status: result.status,
        message,
        state: buildPublicAppState({
          dateInput: result.reservationDate,
          initialScreen: "status",
          roomId: result.room.id,
          slotId: result.slot.id,
          message,
          level,
          recentAction: {
            type: result.status,
            reservationNumber: result.reservationNumber,
            communityName: req.body.communityName,
            roomName: result.room.name,
            slotLabel: result.slot.label,
            timeRange: result.slot.timeRange,
            contactLastFour: result.contactLastFour,
          },
        }),
      });
      return;
    }

    redirectWithFlash(
      res,
      "/status",
      {
        date: result.reservationDate,
        roomId: result.room.id,
      },
      message,
      level,
    );
  } catch (error) {
    const message = error.message || "예약 처리 중 오류가 발생했습니다.";

    if (wantsJson) {
      res.status(400).json({
        ok: false,
        code: "VALIDATION_ERROR",
        message,
        state: buildPublicAppState({
          dateInput: req.body.reservationDate,
          initialScreen: "form",
          formValues: req.body,
          roomId: req.body.roomId,
          slotId: req.body.slotId,
          message,
          level: "error",
        }),
      });
      return;
    }

    renderPublicApp(req, res, {
      statusCode: 400,
      message,
      level: "error",
      formValues: req.body,
      date: req.body.reservationDate,
      screen: "form",
      roomId: req.body.roomId,
      slotId: req.body.slotId,
    });
  }
}

function handlePublicCancellation(req, res, options = {}) {
  const wantsJson = Boolean(options.json);

  try {
    const result = cancelReservationByLookup(req.body);
    const promotedMessage = result.promoted
      ? ` 대기 1순위 ${result.promoted.communityName}팀이 자동으로 확정되었습니다.`
      : "";
    const message = `${result.cancelled.communityName} 예약 취소 완료.${promotedMessage}`;

    if (wantsJson) {
      res.json({
        ok: true,
        message,
        state: buildPublicAppState({
          dateInput: result.cancelled.reservationDate,
          initialScreen: "status",
          roomId: result.cancelled.roomId,
          slotId: result.cancelled.slotId,
          message,
          level: "success",
          recentAction: {
            type: "cancelled",
            reservationNumber: result.cancelled.reservationNumber,
            communityName: result.cancelled.communityName,
            roomName: result.cancelled.roomName,
            slotLabel: result.cancelled.slot.label,
            timeRange: result.cancelled.slot.timeRange,
          },
        }),
      });
      return;
    }

    redirectWithFlash(
      res,
      "/status",
      {
        date: result.cancelled.reservationDate,
        roomId: result.cancelled.roomId,
      },
      message,
      "success",
    );
  } catch (error) {
    const message = error.message || "예약 취소 중 오류가 발생했습니다.";

    if (wantsJson) {
      res.status(400).json({
        ok: false,
        code: "VALIDATION_ERROR",
        message,
        state: buildPublicAppState({
          dateInput: req.body.reservationDate,
          initialScreen: "status",
          message,
          level: "error",
          cancelLookup: {
            reservationNumber: req.body.reservationNumber,
            contactLastFour: req.body.contactLastFour,
          },
        }),
      });
      return;
    }

    renderPublicApp(req, res, {
      statusCode: 400,
      message,
      level: "error",
      screen: "status",
    });
  }
}

function renderAdminPage(req, res, options = {}) {
  const dashboard = buildDashboard(options.date || req.query.date);
  const flash = readFlash(req);
  const initialPage = normalizePage(
    options.page || req.query.page,
    ["summary", "settings", "control", "waitlist"],
    "summary",
  );
  const initialSettingSlotId = Number(
    options.settingSlot || req.query.settingSlot || dashboard.defaultSlotId,
  );
  const adminSlotState = dashboard.slotDetails.map((slot) => ({
    id: slot.id,
    label: slot.label,
    timeRange: slot.timeRange,
  }));

  res.status(options.statusCode || 200).render("admin", {
    ...dashboard,
    noticeItems: NOTICE_ITEMS,
    minAttendees: MIN_ATTENDEES,
    adminAuthEnabled,
    flashMessage: options.message || flash.message,
    flashLevel: options.level || flash.level,
    serializedAdminState: serializeForTemplate({
      selectedDate: dashboard.selectedDate,
      slotDetails: adminSlotState,
      summary: dashboard.summary,
      initialPage,
      initialSettingSlotId,
    }),
  });
}

function renderAdminLoginPage(req, res, options = {}) {
  if (!adminAuthEnabled) {
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
  renderPublicApp(req, res, { screen: "intro" });
});

app.get("/status", (req, res) => {
  renderPublicApp(req, res, { screen: "status" });
});

app.get("/board", (req, res) => {
  const params = new URLSearchParams(req.query);
  const query = params.toString();

  res.redirect(query ? `/status?${query}` : "/status");
});

app.post("/reservations", (req, res) => {
  handlePublicReservation(req, res);
});

app.post("/api/reservations", (req, res) => {
  handlePublicReservation(req, res, { json: true });
});

app.post("/api/reservations/cancel", (req, res) => {
  handlePublicCancellation(req, res, { json: true });
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

  if (!adminAuthEnabled) {
    res.redirect(returnTo);
    return;
  }

  if (!adminCredentialSet.has(submittedKey)) {
    renderAdminLoginPage(req, res, {
      statusCode: 401,
      message: "관리 비밀번호가 올바르지 않습니다.",
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
          page: "control",
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
        page: "control",
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
      page: "control",
    });
  }
});

app.post("/admin/settings/slots/:slotId", requireAdmin, (req, res) => {
  const slotId = Number(req.params.slotId);
  const reservationDate = req.body.date;

  try {
    const settings = Object.keys(req.body)
      .filter((key) => key.startsWith("mode_"))
      .map((key) => {
        const roomId = key.slice("mode_".length);

        return {
          roomId,
          mode: req.body[key],
          label: req.body[`label_${roomId}`],
        };
      });
    const result = updateRoomSlotSettings({
      reservationDate,
      slotId,
      settings,
    });
    const promotedMessage =
      result.promotions.length > 0
        ? ` 대기 ${result.promotions.length}팀이 자동으로 확정 처리되었습니다.`
        : "";

    redirectWithFlash(
      res,
      "/admin",
      {
        date: result.reservationDate,
        page: "settings",
        settingSlot: result.slot.id,
      },
      `${result.slot.label} 방 운영 설정을 저장했습니다.${promotedMessage}`,
      "success",
    );
  } catch (error) {
    renderAdminPage(req, res, {
      statusCode: 400,
      message: error.message || "방 운영 설정 저장 중 오류가 발생했습니다.",
      level: "error",
      date: reservationDate,
      page: "settings",
      settingSlot: slotId,
    });
  }
});

app.post("/admin/settings/rooms", requireAdmin, (req, res) => {
  try {
    const rooms = Object.keys(req.body)
      .filter((key) => key.startsWith("capacity_"))
      .map((key) => ({
        roomId: key.slice("capacity_".length),
        capacity: req.body[key],
        description: req.body[`description_${key.slice("capacity_".length)}`],
        imageUrl: req.body[`imageUrl_${key.slice("capacity_".length)}`],
      }));

    updateRoomMetadata({ rooms });

    redirectWithFlash(
      res,
      "/admin",
      {
        date: req.body.date,
        page: "settings",
      },
      "방 정보를 저장했습니다.",
      "success",
    );
  } catch (error) {
    renderAdminPage(req, res, {
      statusCode: 400,
      message: error.message || "방 정보 저장 중 오류가 발생했습니다.",
      level: "error",
      date: req.body.date,
      page: "settings",
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
