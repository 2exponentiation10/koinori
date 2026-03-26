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

  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function initAdminPage(adminState) {
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));
  const settingTabs = Array.from(document.querySelectorAll("[data-setting-slot-tab]"));
  const settingPanels = Array.from(document.querySelectorAll("[data-setting-slot]"));
  const presetButtons = Array.from(document.querySelectorAll("[data-apply-mode]"));
  const modeInputs = Array.from(document.querySelectorAll(".mode-group input[type='radio']"));

  if (!pageButtons.length) {
    return;
  }

  function activateSettingSlot(slotId) {
    settingTabs.forEach((tab) => {
      tab.classList.toggle("is-active", Number(tab.dataset.settingSlotTab) === Number(slotId));
    });

    settingPanels.forEach((panel) => {
      panel.classList.toggle("is-active", Number(panel.dataset.settingSlot) === Number(slotId));
    });
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
      setActivePage(button.dataset.goPage);
    });
  });

  settingTabs.forEach((button) => {
    button.addEventListener("click", () => {
      activateSettingSlot(button.dataset.settingSlotTab);
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

  setActivePage(adminState.initialPage || "summary", { scroll: false });

  const initialSettingTab =
    settingTabs.find(
      (tab) => Number(tab.dataset.settingSlotTab) === Number(adminState.initialSettingSlotId),
    ) || settingTabs[0];

  if (initialSettingTab) {
    activateSettingSlot(initialSettingTab.dataset.settingSlotTab);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const adminState = readState("admin-state");

  if (adminState) {
    initAdminPage(adminState);
  }
});
