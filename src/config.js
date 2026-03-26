const APP_TIME_ZONE = "Asia/Seoul";
const MIN_ATTENDEES = 4;

const NOTICE_ITEMS = [
  "주일 룸 예약 최소 인원은 4명입니다. 4명 이상 모임만 신청해 주세요.",
  "주일 주문 브레이크 타임은 14:30-16:30입니다.",
  "4타임 이용자는 14:30 전에 주문을 완료해 주세요.",
  "타카페 음료 및 외부 음식은 반입할 수 없습니다.",
  "예약은 매주 목요일 오전 10시부터 선착순으로 오픈됩니다.",
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
  { id: 1, label: "1타임", startsAt: "09:00", endsAt: "10:30", reservable: true },
  { id: 2, label: "2타임", startsAt: "10:30", endsAt: "12:30", reservable: true },
  { id: 3, label: "3타임", startsAt: "12:30", endsAt: "14:30", reservable: true },
  { id: 4, label: "4타임", startsAt: "14:30", endsAt: "16:30", reservable: true },
  {
    id: 5,
    label: "5타임",
    startsAt: "16:30",
    endsAt: "18:00",
    reservable: false,
    fixedLabel: "젊은이교회 셀 고정 사용",
  },
  { id: 6, label: "6타임", startsAt: "18:00", endsAt: "19:30", reservable: true },
];

module.exports = {
  APP_TIME_ZONE,
  MIN_ATTENDEES,
  NOTICE_ITEMS,
  ROOMS,
  TIME_SLOTS,
};
