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

function setActivePage(pageName) {
  const pageCards = Array.from(document.querySelectorAll("[data-page]"));
  const pageTabs = Array.from(document.querySelectorAll("[data-go-page]"));

  pageCards.forEach((card) => {
    card.classList.toggle("is-active", card.dataset.page === pageName);
  });

  pageTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.goPage === pageName);
  });
}

function initPublicPage(publicState) {
  const slotIdInput = document.getElementById("slot-id-input");
  const roomIdInput = document.getElementById("room-id-input");
  const joinWaitlistInput = document.getElementById("join-waitlist-input");
  const dateInput = document.getElementById("reservation-date-input");
  const bookingSummary = document.getElementById("booking-summary");
  const summarySlotLabel = document.getElementById("summary-slot-label");
  const summaryRoomLabel = document.getElementById("summary-room-label");
  const roomStepGuide = document.getElementById("room-step-guide");
  const selectedSlotBanner = document.getElementById("selected-slot-banner");
  const submitButton = document.getElementById("booking-submit-button");
  const slotCards = Array.from(document.querySelectorAll("[data-slot-id]"));
  const roomPanels = Array.from(document.querySelectorAll("[data-slot-rooms]"));
  const roomButtons = Array.from(document.querySelectorAll("[data-slot-room-id]"));
  const waitlistButtons = Array.from(document.querySelectorAll("[data-waitlist-slot]"));
  const boardTabs = Array.from(document.querySelectorAll("[data-board-slot-tab]"));
  const boardPanels = Array.from(document.querySelectorAll("[data-board-slot]"));
  const modal = document.getElementById("admin-access-modal");
  const modalClose = document.getElementById("admin-modal-close");
  const adminTrigger = document.getElementById("admin-secret-trigger");
  const pageTabs = Array.from(document.querySelectorAll("[data-go-page]"));

  if (!slotIdInput || !summarySlotLabel || !summaryRoomLabel || !submitButton) {
    return;
  }

  const state = {
    currentPage: publicState.initialPage || "date",
    selectedDate: publicState.selectedDate,
    selectedSlotId: Number(publicState.formValues.slotId || publicState.defaultSlotId || 0),
    selectedRoomId: publicState.formValues.roomId ? Number(publicState.formValues.roomId) : null,
    joinWaitlist: publicState.formValues.joinWaitlist === "1",
    tapCount: 0,
  };

  function getSlot(slotId) {
    return publicState.slotDetails.find((slot) => slot.id === Number(slotId)) || null;
  }

  function getSelectedSlot() {
    return getSlot(state.selectedSlotId);
  }

  function getAvailableRoom(slot) {
    return slot ? slot.rooms.find((room) => room.selectable) || null : null;
  }

  function ensureSlotSelection() {
    let slot = getSelectedSlot();

    if (!slot) {
      slot = getSlot(publicState.defaultSlotId) || publicState.slotDetails[0] || null;
      state.selectedSlotId = slot ? slot.id : 0;
    }

    if (!slot) {
      return;
    }

    if (slot.remainingRooms > 0) {
      const selectedRoom = slot.rooms.find(
        (room) => room.roomId === state.selectedRoomId && room.selectable,
      );
      const fallbackRoom = selectedRoom || getAvailableRoom(slot);

      state.selectedRoomId = fallbackRoom ? fallbackRoom.roomId : null;
      state.joinWaitlist = false;
      return;
    }

    state.selectedRoomId = null;
    state.joinWaitlist = slot.canWaitlist;
  }

  function updateBoardSlot(slotId) {
    boardTabs.forEach((tab) => {
      tab.classList.toggle("is-active", Number(tab.dataset.boardSlotTab) === Number(slotId));
    });

    boardPanels.forEach((panel) => {
      panel.classList.toggle("is-active", Number(panel.dataset.boardSlot) === Number(slotId));
    });
  }

  function updateRoomPanels() {
    const selectedSlot = getSelectedSlot();
    const bannerTitle = selectedSlotBanner ? selectedSlotBanner.querySelector("strong") : null;
    const bannerBody = selectedSlotBanner ? selectedSlotBanner.querySelector("span") : null;

    roomPanels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.slotRooms) !== Number(state.selectedSlotId);
    });

    if (!selectedSlot) {
      if (bannerTitle) {
        bannerTitle.textContent = "선택한 타임 없음";
      }

      if (bannerBody) {
        bannerBody.textContent = "먼저 타임을 골라 주세요.";
      }

      roomStepGuide.textContent = "타임을 먼저 선택하면 해당 타임의 방 목록이 나옵니다.";
      return;
    }

    if (bannerTitle) {
      bannerTitle.textContent = `${selectedSlot.label} ${selectedSlot.timeRange}`;
    }

    if (bannerBody) {
      bannerBody.textContent = selectedSlot.detailLabel;
    }

    roomStepGuide.textContent =
      selectedSlot.remainingRooms > 0
        ? "원하는 방을 직접 선택해 주세요. 선택한 방으로 바로 예약됩니다."
        : selectedSlot.canWaitlist
          ? "이 타임은 만석입니다. 아래 버튼으로 대기 신청을 진행할 수 있습니다."
          : "이 타임은 현재 예약을 받지 않습니다.";
  }

  function updateSlotCards() {
    slotCards.forEach((card) => {
      card.classList.toggle("is-selected", Number(card.dataset.slotId) === Number(state.selectedSlotId));
    });
  }

  function updateRoomCards() {
    roomButtons.forEach((button) => {
      const sameSlot = Number(button.dataset.slotId) === Number(state.selectedSlotId);
      const sameRoom = Number(button.dataset.slotRoomId) === Number(state.selectedRoomId);

      button.classList.toggle("is-selected", sameSlot && sameRoom && !state.joinWaitlist);
    });

    waitlistButtons.forEach((button) => {
      button.classList.toggle(
        "is-selected",
        Number(button.dataset.waitlistSlot) === Number(state.selectedSlotId) && state.joinWaitlist,
      );
    });
  }

  function updateFormSummary() {
    const selectedSlot = getSelectedSlot();

    if (!selectedSlot) {
      summarySlotLabel.textContent = "선택 전";
      summaryRoomLabel.textContent = "선택 전";
      submitButton.disabled = true;
      return;
    }

    summarySlotLabel.textContent = `${selectedSlot.label} ${selectedSlot.timeRange}`;

    if (state.joinWaitlist) {
      summaryRoomLabel.textContent = "대기 신청";
    } else {
      const selectedRoom = selectedSlot.rooms.find((room) => room.roomId === state.selectedRoomId) || null;

      summaryRoomLabel.textContent = selectedRoom ? selectedRoom.roomName : "선택 전";
    }

    const isReady =
      publicState.bookingStatus.open &&
      selectedSlot.bookable &&
      (state.joinWaitlist || Number.isInteger(state.selectedRoomId));

    submitButton.disabled = !isReady;
    submitButton.textContent = state.joinWaitlist ? "대기 신청하기" : "예약 신청하기";

    if (bookingSummary) {
      bookingSummary.classList.toggle("is-waitlist", state.joinWaitlist);
    }
  }

  function syncFormInputs() {
    if (dateInput) {
      dateInput.value = state.selectedDate;
    }

    slotIdInput.value = state.selectedSlotId ? String(state.selectedSlotId) : "";
    roomIdInput.value = state.joinWaitlist ? "" : state.selectedRoomId ? String(state.selectedRoomId) : "";
    joinWaitlistInput.value = state.joinWaitlist ? "1" : "";
  }

  function render() {
    ensureSlotSelection();
    updateSlotCards();
    updateRoomPanels();
    updateRoomCards();
    updateFormSummary();
    updateBoardSlot(state.selectedSlotId);
    syncFormInputs();
  }

  function goToPage(pageName) {
    state.currentPage = pageName;
    setActivePage(pageName);
  }

  pageTabs.forEach((button) => {
    button.addEventListener("click", () => {
      goToPage(button.dataset.goPage);
    });
  });

  slotCards.forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedSlotId = Number(card.dataset.slotId);
      state.selectedRoomId = null;
      state.joinWaitlist = false;
      render();
      goToPage("room");
    });
  });

  roomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSlotId = Number(button.dataset.slotId);
      state.selectedRoomId = Number(button.dataset.slotRoomId);
      state.joinWaitlist = false;
      render();
      goToPage("form");
    });
  });

  waitlistButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSlotId = Number(button.dataset.waitlistSlot);
      state.selectedRoomId = null;
      state.joinWaitlist = true;
      render();
      goToPage("form");
    });
  });

  boardTabs.forEach((button) => {
    button.addEventListener("click", () => {
      updateBoardSlot(button.dataset.boardSlotTab);
    });
  });

  if (adminTrigger && modal) {
    adminTrigger.addEventListener("click", () => {
      state.tapCount += 1;

      if (state.tapCount < 10) {
        return;
      }

      state.tapCount = 0;
      modal.hidden = false;
      const firstInput = modal.querySelector("input[name='adminKey']");

      if (firstInput) {
        firstInput.focus();
      }
    });
  }

  if (modalClose && modal) {
    modalClose.addEventListener("click", () => {
      modal.hidden = true;
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.hidden = true;
      }
    });
  }

  setActivePage(state.currentPage);
  render();
}

function initAdminPage(adminState) {
  const pageTabs = Array.from(document.querySelectorAll("[data-go-page]"));
  const settingTabs = Array.from(document.querySelectorAll("[data-setting-slot-tab]"));
  const settingPanels = Array.from(document.querySelectorAll("[data-setting-slot]"));
  const presetButtons = Array.from(document.querySelectorAll("[data-apply-mode]"));
  const modeInputs = Array.from(document.querySelectorAll(".mode-group input[type='radio']"));

  if (!pageTabs.length) {
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
    const label = input.closest(".mode-pill");
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

    if (label) {
      label.classList.toggle("is-selected", input.checked);
    }

    if (fixedLabelField) {
      const shouldEnable = input.value === "fixed" && input.checked && !input.disabled;

      fixedLabelField.disabled = !shouldEnable;

      if (!shouldEnable) {
        fixedLabelField.value = "";
      }
    }
  }

  pageTabs.forEach((button) => {
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

  setActivePage(adminState.initialPage || "summary");

  const initialSettingTab =
    settingTabs.find(
      (tab) => Number(tab.dataset.settingSlotTab) === Number(adminState.initialSettingSlotId),
    ) ||
    settingTabs.find((tab) => tab.classList.contains("is-active")) ||
    settingTabs[0];

  if (initialSettingTab) {
    activateSettingSlot(initialSettingTab.dataset.settingSlotTab);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const publicState = readState("public-state");
  const adminState = readState("admin-state");

  if (publicState) {
    initPublicPage(publicState);
  }

  if (adminState) {
    initAdminPage(adminState);
  }
});
