export interface RatingSnapshot {
  rating: number;
}

export interface RatingChange {
  p1: {old: number; next: number; delta: number};
  p2: {old: number; next: number; delta: number};
}

export function calculateElo(p1: RatingSnapshot, p2: RatingSnapshot, scoreP1: 0 | 0.5 | 1): RatingChange {
  const expected1 = 1 / (1 + Math.pow(10, (p2.rating - p1.rating) / 400));
  const expected2 = 1 - expected1;
  const scoreP2 = 1 - scoreP1;

  // Tính độ lệch điểm (delta) ban đầu cho cả 2 người
  let delta1 = 32 * (scoreP1 - expected1);
  let delta2 = 32 * (scoreP2 - expected2);

  // Áp dụng hệ số nhân: Người thắng x1.5, Người thua x1.2
  if (scoreP1 === 1) {
    delta1 *= 1.5; // P1 thắng -> điểm cộng được nhân 1.5
    delta2 *= 1.2; // P2 thua -> điểm bị trừ bị nhân 1.2 (trừ nặng hơn)
  } else if (scoreP1 === 0) {
    delta1 *= 1.2; // P1 thua -> điểm bị trừ bị nhân 1.2
    delta2 *= 1.5; // P2 thắng -> điểm cộng được nhân 1.5
  }
  // Trường hợp hòa (scoreP1 === 0.5) giữ nguyên không nhân hệ số

  const next1 = Math.max(100, Math.round(p1.rating + delta1));
  const next2 = Math.max(100, Math.round(p2.rating + delta2));

  return {
    p1: {old: p1.rating, next: next1, delta: next1 - p1.rating},
    p2: {old: p2.rating, next: next2, delta: next2 - p2.rating},
  };
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
