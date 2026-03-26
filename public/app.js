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
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));

  pageCards.forEach((card) => {
    card.classList.toggle("is-active", card.dataset.page === pageName);
  });

  pageButtons.forEach((button) => {
    if (button.classList.contains("page-tab")) {
      button.classList.toggle("is-active", button.dataset.goPage === pageName);
    }
  });
}

function initPublicPage(publicState) {
  const slotIdInput = document.getElementById("slot-id-input");
  const roomIdInput = document.getElementById("room-id-input");
  const dateInput = document.getElementById("reservation-date-input");
  const submitButton = document.getElementById("booking-submit-button");
  const summarySlotLabel = document.getElementById("summary-slot-label");
  const summaryRoomLabel = document.getElementById("summary-room-label");
  const summaryModeLabel = document.getElementById("summary-mode-label");
  const roomStepGuide = document.getElementById("room-step-guide");
  const selectedSlotBanner = document.getElementById("selected-slot-banner");
  const slotCards = Array.from(document.querySelectorAll("[data-slot-id]"));
  const roomPanels = Array.from(document.querySelectorAll("[data-slot-rooms]"));
  const roomButtons = Array.from(document.querySelectorAll("[data-slot-room-id]"));
  const boardTabs = Array.from(document.querySelectorAll("[data-board-slot-tab]"));
  const boardPanels = Array.from(document.querySelectorAll("[data-board-slot]"));
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));
  const modal = document.getElementById("admin-access-modal");
  const modalClose = document.getElementById("admin-modal-close");
  const adminTrigger = document.getElementById("admin-secret-trigger");

  if (!slotIdInput || !roomIdInput || !submitButton) {
    return;
  }

  const state = {
    currentPage: publicState.initialPage || "slot",
    selectedDate: publicState.selectedDate,
    selectedSlotId: Number(publicState.formValues.slotId || publicState.defaultSlotId || 0),
    selectedRoomId: publicState.formValues.roomId ? Number(publicState.formValues.roomId) : null,
    tapCount: 0,
  };

  function getSlot(slotId) {
    return publicState.slotDetails.find((slot) => slot.id === Number(slotId)) || null;
  }

  function getSelectedSlot() {
    return getSlot(state.selectedSlotId);
  }

  function getSelectedRoom() {
    const slot = getSelectedSlot();

    if (!slot) {
      return null;
    }

    return slot.rooms.find((room) => room.roomId === Number(state.selectedRoomId)) || null;
  }

  function updateSlotCards() {
    slotCards.forEach((card) => {
      card.classList.toggle("is-selected", Number(card.dataset.slotId) === Number(state.selectedSlotId));
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
        bannerBody.textContent = "먼저 타임을 선택해 주세요.";
      }

      if (roomStepGuide) {
        roomStepGuide.textContent = "타임을 먼저 선택하면 방 목록이 보입니다.";
      }

      return;
    }

    if (bannerTitle) {
      bannerTitle.textContent = `${selectedSlot.label} ${selectedSlot.timeRange}`;
    }

    if (bannerBody) {
      bannerBody.textContent = selectedSlot.detailLabel;
    }

    if (roomStepGuide) {
      roomStepGuide.textContent =
        selectedSlot.remainingRooms > 0
          ? "빈 방을 누르면 바로 예약, 사용 중인 방을 누르면 그 방 대기로 접수됩니다."
          : "빈 방은 없지만 사용 중인 방을 눌러 해당 방 대기 신청을 할 수 있습니다.";
    }
  }

  function updateRoomCards() {
    roomButtons.forEach((button) => {
      const sameSlot = Number(button.dataset.slotId) === Number(state.selectedSlotId);
      const sameRoom = Number(button.dataset.slotRoomId) === Number(state.selectedRoomId);

      button.classList.toggle("is-selected", sameSlot && sameRoom);
    });
  }

  function updateBoardSlot(slotId) {
    boardTabs.forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.boardSlotTab) === Number(slotId));
    });

    boardPanels.forEach((panel) => {
      panel.classList.toggle("is-active", Number(panel.dataset.boardSlot) === Number(slotId));
    });
  }

  function updateFormSummary() {
    const selectedSlot = getSelectedSlot();
    const selectedRoom = getSelectedRoom();

    summarySlotLabel.textContent = selectedSlot
      ? `${selectedSlot.label} ${selectedSlot.timeRange}`
      : "선택 전";
    summaryRoomLabel.textContent = selectedRoom ? selectedRoom.roomName : "선택 전";

    if (!selectedRoom || !selectedRoom.interactive) {
      summaryModeLabel.textContent = "선택 전";
      submitButton.disabled = true;
      return;
    }

    const isWaitlist = selectedRoom.actionType === "waitlist";

    summaryModeLabel.textContent = isWaitlist ? "해당 방 대기 접수" : "즉시 예약";
    submitButton.textContent = isWaitlist ? "대기 신청하기" : "예약 신청하기";
    submitButton.disabled = !publicState.bookingStatus.open;
  }

  function syncInputs() {
    if (dateInput) {
      dateInput.value = state.selectedDate;
    }

    slotIdInput.value = state.selectedSlotId ? String(state.selectedSlotId) : "";
    roomIdInput.value = state.selectedRoomId ? String(state.selectedRoomId) : "";
  }

  function render() {
    if (!getSelectedSlot()) {
      state.selectedSlotId = publicState.defaultSlotId;
    }

    const selectedRoom = getSelectedRoom();

    if (selectedRoom && !selectedRoom.interactive) {
      state.selectedRoomId = null;
    }

    updateSlotCards();
    updateRoomPanels();
    updateRoomCards();
    updateFormSummary();
    updateBoardSlot(state.selectedSlotId);
    syncInputs();
  }

  function goToPage(pageName) {
    state.currentPage = pageName;
    setActivePage(pageName);
  }

  pageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      goToPage(button.dataset.goPage);
    });
  });

  slotCards.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSlotId = Number(button.dataset.slotId);
      state.selectedRoomId = null;
      render();
      goToPage("room");
    });
  });

  roomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSlotId = Number(button.dataset.slotId);
      state.selectedRoomId = Number(button.dataset.slotRoomId);
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
      const passwordField = modal.querySelector("input[name='adminKey']");

      if (passwordField) {
        passwordField.focus();
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

  setActivePage(adminState.initialPage || "summary");

  const initialSettingTab =
    settingTabs.find(
      (tab) => Number(tab.dataset.settingSlotTab) === Number(adminState.initialSettingSlotId),
    ) || settingTabs[0];

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
