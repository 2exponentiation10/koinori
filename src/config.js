const APP_TIME_ZONE = "Asia/Seoul";
const MIN_ATTENDEES = 4;
const ROOM_MODES = {
  AVAILABLE: "available",
  FIXED: "fixed",
  CLOSED: "closed",
};

const NOTICE_ITEMS = [
  {
    id: "min-attendees",
    title: "최소 4명",
    detail: "4명 이상 모임만 신청할 수 있습니다.",
    screens: ["intro"],
  },
  {
    id: "booking-open",
    title: "목요일 오전 10시 오픈",
    detail: "오픈 전에는 예약 버튼이 잠겨 있습니다.",
    screens: ["intro"],
  },
  {
    id: "slot-four-order",
    title: "4타임 주문 안내",
    detail: "4타임은 14:30 전에 주문을 완료해 주세요.",
    screens: ["form"],
    slotIds: [4],
  },
  {
    id: "outside-food",
    title: "외부 음식 반입 불가",
    detail: "타카페 음료와 외부 음식은 반입할 수 없습니다.",
    screens: ["intro", "form"],
  },
];

const ROOMS = [
  { id: 1, name: "1번 사랑방" },
  { id: 2, name: "2번 희락방" },
  { id: 3, name: "3번 화평방" },
  { id: 4, name: "4번 오래참음방" },
  { id: 5, name: "5번 자비방" },
  { id: 6, name: "6번 양선방" },
  { id: 7, name: "7번 충성방" },
  { id: 8, name: "8번 온유방" },
  { id: 9, name: "9번 겨울방" },
];

const TIME_SLOTS = [
  {
    id: 1,
    label: "1타임",
    startsAt: "09:00",
    endsAt: "10:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 2,
    label: "2타임",
    startsAt: "10:30",
    endsAt: "12:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 3,
    label: "3타임",
    startsAt: "12:30",
    endsAt: "14:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 4,
    label: "4타임",
    startsAt: "14:30",
    endsAt: "16:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 5,
    label: "5타임",
    startsAt: "16:30",
    endsAt: "18:00",
    defaultMode: ROOM_MODES.FIXED,
    defaultLabel: "젊은이교회 셀 고정 사용",
  },
  {
    id: 6,
    label: "6타임",
    startsAt: "18:00",
    endsAt: "19:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
];

module.exports = {
  APP_TIME_ZONE,
  MIN_ATTENDEES,
  NOTICE_ITEMS,
  ROOMS,
  ROOM_MODES,
  TIME_SLOTS,
};
