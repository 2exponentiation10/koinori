function readState(id) {
  const element = document.getElementById(id);

  if (!element) {
    return null;
  }

  try {
    return JSON.parse(element.textContent || "{}");
  } catch (_error) {
    return null;
  }
}

function setActivePage(pageName, options = {}) {
  const pageCards = Array.from(document.querySelectorAll("[data-page]"));
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));

  pageCards.forEach((card) => {
    card.classList.toggle("is-active", card.dataset.page === pageName);
  });

  pageButtons.forEach((button) => {
    if (button.classList.contains("page-tab")) {
      button.classList.toggle("is-active", button.dataset.goPage === pageName);
    }
  });

  if (options.scroll === true) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function initAdminPage(adminState) {
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));
  const settingTabs = Array.from(document.querySelectorAll("[data-setting-slot-tab]"));
  const settingPanels = Array.from(document.querySelectorAll("[data-setting-slot]"));
  const presetButtons = Array.from(document.querySelectorAll("[data-apply-mode]"));
  const modeInputs = Array.from(document.querySelectorAll(".mode-group input[type='radio']"));
  const deleteRoomButtons = Array.from(document.querySelectorAll("[data-delete-room]"));

  if (!pageButtons.length) {
    return;
  }

  let activePage = adminState.initialPage || "summary";
  let activeSettingSlotId = Number(adminState.initialSettingSlotId);
  let historyReady = false;
  let historyRestoring = false;

  function buildAdminUrl(pageName, slotId) {
    const url = new URL(window.location.href);
    url.searchParams.set("page", pageName);

    if (slotId) {
      url.searchParams.set("settingSlot", String(slotId));
    } else {
      url.searchParams.delete("settingSlot");
    }

    return `${url.pathname}?${url.searchParams.toString()}`;
  }

  function syncHistory(mode = "push") {
    const state = {
      app: "koinori-admin",
      page: activePage,
      settingSlotId: activeSettingSlotId,
    };
    const url = buildAdminUrl(activePage, activePage === "slots" ? activeSettingSlotId : null);

    if (!historyReady || mode === "replace") {
      window.history.replaceState(state, "", url);
      historyReady = true;
      return;
    }

    if (historyRestoring) {
      historyRestoring = false;
      return;
    }

    window.history.pushState(state, "", url);
  }

  function activateSettingSlot(slotId, options = {}) {
    activeSettingSlotId = Number(slotId);

    settingTabs.forEach((tab) => {
      tab.classList.toggle("is-active", Number(tab.dataset.settingSlotTab) === Number(slotId));
    });

    settingPanels.forEach((panel) => {
      panel.classList.toggle("is-active", Number(panel.dataset.settingSlot) === Number(slotId));
    });

    if (options.history !== false && activePage === "slots") {
      syncHistory(options.historyMode || "push");
    }
  }

  function updateModePill(input) {
    const group = input.closest(".mode-group");
    const fixedLabelField = input
      .closest(".settings-room-card")
      .querySelector("[data-fixed-label-input]");

    if (group) {
      Array.from(group.querySelectorAll(".mode-pill")).forEach((pill) => {
        const pillInput = pill.querySelector("input[type='radio']");

        pill.classList.toggle("is-selected", Boolean(pillInput && pillInput.checked));
      });
    }

    if (fixedLabelField) {
      const shouldEnable = input.value === "fixed" && input.checked && !input.disabled;

      fixedLabelField.disabled = !shouldEnable;

      if (!shouldEnable) {
        fixedLabelField.value = "";
      }
    }
  }

  pageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activePage = button.dataset.goPage;
      setActivePage(activePage, { scroll: false });
      syncHistory("push");
    });
  });

  settingTabs.forEach((button) => {
    button.addEventListener("click", () => {
      activateSettingSlot(button.dataset.settingSlotTab, { historyMode: "push" });
    });
  });

  modeInputs.forEach((input) => {
    updateModePill(input);

    input.addEventListener("change", () => {
      updateModePill(input);
    });
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const slotId = button.dataset.targetSlot;
      const mode = button.dataset.applyMode;
      const panel = document.querySelector(`[data-setting-slot='${slotId}']`);

      if (!panel) {
        return;
      }

      Array.from(panel.querySelectorAll(".mode-group")).forEach((group) => {
        const targetInput = group.querySelector(`input[value='${mode}']`);

        if (!targetInput || targetInput.disabled) {
          return;
        }

        targetInput.checked = true;
        updateModePill(targetInput);
      });
    });
  });

  deleteRoomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const roomId = button.dataset.deleteRoom;
      const date = button.dataset.deleteDate;
      const confirmed = window.confirm(
        "이 방을 삭제하시겠습니까? 예약/설정 이력이 있으면 숨김 처리됩니다.",
      );

      if (!confirmed) {
        return;
      }

      const form = document.createElement("form");
      form.method = "post";
      form.action = `/admin/rooms/${roomId}/delete`;

      const dateInput = document.createElement("input");
      dateInput.type = "hidden";
      dateInput.name = "date";
      dateInput.value = date;
      form.appendChild(dateInput);

      document.body.appendChild(form);
      form.submit();
    });
  });

  window.addEventListener("popstate", (event) => {
    const state = event.state;

    if (!state || state.app !== "koinori-admin") {
      return;
    }

    historyRestoring = true;
    activePage = state.page || "summary";
    activeSettingSlotId = Number(state.settingSlotId || adminState.initialSettingSlotId);
    setActivePage(activePage, { scroll: false });
    activateSettingSlot(activeSettingSlotId, { scroll: false, history: false });
  });

  setActivePage(activePage, { scroll: false });

  const initialSettingTab =
    settingTabs.find(
      (tab) => Number(tab.dataset.settingSlotTab) === Number(adminState.initialSettingSlotId),
    ) || settingTabs[0];

  if (initialSettingTab) {
    activateSettingSlot(initialSettingTab.dataset.settingSlotTab, { history: false });
  }

  syncHistory("replace");
}

document.addEventListener("DOMContentLoaded", () => {
  const adminState = readState("admin-state");

  if (adminState) {
    initAdminPage(adminState);
  }
});
