export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type FonLebScores = {
  overall: number;
  hand: number | null;
  wrist: number | null;
  arm: number | null;
  body: number | null;
};

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

const distance = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export const mirrorPoseLandmarks = (pose?: Landmark[]): Landmark[] | undefined => {
  if (!pose) return undefined;
  const mirrored = pose.map(p => ({ ...p, x: 1 - p.x }));
  const swap = (left: number, right: number) => {
    const temp = mirrored[left];
    mirrored[left] = mirrored[right];
    mirrored[right] = temp;
  };
  // Swap standard left/right pairs
  swap(1, 4); swap(2, 5); swap(3, 6); swap(7, 8); swap(9, 10);
  swap(LEFT_SHOULDER, RIGHT_SHOULDER);
  swap(LEFT_ELBOW, RIGHT_ELBOW);
  swap(LEFT_WRIST, RIGHT_WRIST);
  swap(17, 18); swap(19, 20); swap(21, 22); swap(23, 24);
  swap(25, 26); swap(27, 28); swap(29, 30); swap(31, 32);
  return mirrored;
};

export const mirrorHandLandmarks = (hand?: Landmark[]): Landmark[] | undefined => {
  if (!hand) return undefined;
  return hand.map(p => ({ ...p, x: 1 - p.x }));
};

const clampScore = (error: number, tolerance: number) =>
  Math.round(Math.max(0, Math.min(100, (1 - error / tolerance) * 100)));

const angle = (a: Landmark, vertex: Landmark, c: Landmark) => {
  const first = [a.x - vertex.x, a.y - vertex.y, (a.z ?? 0) - (vertex.z ?? 0)];
  const second = [c.x - vertex.x, c.y - vertex.y, (c.z ?? 0) - (vertex.z ?? 0)];
  const firstLength = Math.hypot(...first);
  const secondLength = Math.hypot(...second);
  if (!firstLength || !secondLength) return null;
  const dot = first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
  return (Math.acos(Math.max(-1, Math.min(1, dot / (firstLength * secondLength)))) * 180) / Math.PI;
};

const average = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

const normalizedPointError = (
  reference: Landmark[],
  learner: Landmark[],
  indexes: number[],
  referenceAnchor: Landmark,
  learnerAnchor: Landmark,
  referenceScale: number,
  learnerScale: number,
) => {
  if (!referenceScale || !learnerScale) return null;
  const errors = indexes
    .filter((index) => reference[index] && learner[index])
    .map((index) => {
      const refX = (reference[index].x - referenceAnchor.x) / referenceScale;
      const refY = (reference[index].y - referenceAnchor.y) / referenceScale;
      const userX = (learner[index].x - learnerAnchor.x) / learnerScale;
      const userY = (learner[index].y - learnerAnchor.y) / learnerScale;
      return Math.hypot(refX - userX, refY - userY);
    });
  return average(errors);
};

const scoreHand = (reference: Landmark[] | undefined, learner: Landmark[] | undefined) => {
  if (!reference || !learner || reference.length < 21 || learner.length < 21) return null;
  const referenceScale = distance(reference[0], reference[9]);
  const learnerScale = distance(learner[0], learner[9]);
  const error = normalizedPointError(
    reference,
    learner,
    Array.from({ length: 20 }, (_, index) => index + 1),
    reference[0],
    learner[0],
    referenceScale,
    learnerScale,
  );
  return error === null ? null : clampScore(error, 0.42);
};

const scoreArm = (reference: Landmark[], learner: Landmark[]) => {
  const pairs: [number, number, number][] = [
    [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST],
    [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST],
  ];
  const errors = pairs
    .map(([shoulder, elbow, wrist]) => {
      if (!reference[shoulder] || !reference[elbow] || !reference[wrist] || !learner[shoulder] || !learner[elbow] || !learner[wrist]) return null;
      const refAngle = angle(reference[shoulder], reference[elbow], reference[wrist]);
      const userAngle = angle(learner[shoulder], learner[elbow], learner[wrist]);
      return refAngle === null || userAngle === null ? null : Math.abs(refAngle - userAngle);
    })
    .filter((value): value is number => value !== null);
  const error = average(errors);
  return error === null ? null : clampScore(error, 50);
};

const scoreBody = (reference: Landmark[], learner: Landmark[]) => {
  if (!reference[LEFT_SHOULDER] || !reference[RIGHT_SHOULDER] || !learner[LEFT_SHOULDER] || !learner[RIGHT_SHOULDER]) return null;
  const referenceScale = distance(reference[LEFT_SHOULDER], reference[RIGHT_SHOULDER]);
  const learnerScale = distance(learner[LEFT_SHOULDER], learner[RIGHT_SHOULDER]);
  const referenceAnchor = {
    x: (reference[LEFT_SHOULDER].x + reference[RIGHT_SHOULDER].x) / 2,
    y: (reference[LEFT_SHOULDER].y + reference[RIGHT_SHOULDER].y) / 2,
  };
  const learnerAnchor = {
    x: (learner[LEFT_SHOULDER].x + learner[RIGHT_SHOULDER].x) / 2,
    y: (learner[LEFT_SHOULDER].y + learner[RIGHT_SHOULDER].y) / 2,
  };
  const error = normalizedPointError(
    reference,
    learner,
    [LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, 23, 24],
    referenceAnchor,
    learnerAnchor,
    referenceScale,
    learnerScale,
  );
  return error === null ? null : clampScore(error, 0.85);
};

const scoreWrist = (reference: Landmark[], learner: Landmark[]) => {
  if (!reference[LEFT_SHOULDER] || !reference[RIGHT_SHOULDER] || !learner[LEFT_SHOULDER] || !learner[RIGHT_SHOULDER]) return null;
  const referenceScale = distance(reference[LEFT_SHOULDER], reference[RIGHT_SHOULDER]);
  const learnerScale = distance(learner[LEFT_SHOULDER], learner[RIGHT_SHOULDER]);
  const referenceAnchor = {
    x: (reference[LEFT_SHOULDER].x + reference[RIGHT_SHOULDER].x) / 2,
    y: (reference[LEFT_SHOULDER].y + reference[RIGHT_SHOULDER].y) / 2,
  };
  const learnerAnchor = {
    x: (learner[LEFT_SHOULDER].x + learner[RIGHT_SHOULDER].x) / 2,
    y: (learner[LEFT_SHOULDER].y + learner[RIGHT_SHOULDER].y) / 2,
  };
  const error = normalizedPointError(
    reference,
    learner,
    [LEFT_WRIST, RIGHT_WRIST],
    referenceAnchor,
    learnerAnchor,
    referenceScale,
    learnerScale,
  );
  return error === null ? null : clampScore(error, 0.5);
};

const combine = (parts: Array<[number | null, number]>) => {
  const present = parts.filter((part): part is [number, number] => part[0] !== null);
  if (!present.length) return 0;
  const weight = present.reduce((total, [, itemWeight]) => total + itemWeight, 0);
  return Math.round(present.reduce((total, [score, itemWeight]) => total + score * itemWeight, 0) / weight);
};

export const scoreFonLebPose = (
  referencePose: Landmark[] | undefined,
  learnerPose: Landmark[] | undefined,
  referenceLeftHand: Landmark[] | undefined,
  learnerLeftHand: Landmark[] | undefined,
  referenceRightHand: Landmark[] | undefined,
  learnerRightHand: Landmark[] | undefined,
): FonLebScores | null => {
  if (!referencePose || !learnerPose) return null;
  const leftHand = scoreHand(referenceLeftHand, learnerLeftHand);
  const rightHand = scoreHand(referenceRightHand, learnerRightHand);
  const hand = average([leftHand, rightHand].filter((score): score is number => score !== null));
  const wrist = scoreWrist(referencePose, learnerPose);
  const arm = scoreArm(referencePose, learnerPose);
  const body = scoreBody(referencePose, learnerPose);

  return {
    overall: combine([
      [hand, 0.5],
      [wrist, 0.2],
      [arm, 0.2],
      [body, 0.1],
    ]),
    hand,
    wrist,
    arm,
    body,
  };
};

export const coachingCue = (scores: FonLebScores | null) => {
  if (!scores) return "Analyse the reference pose, then keep your full upper body and both hands visible.";
  if (scores.hand !== null && scores.hand < 60) return "Focus on finger curl, finger spread, and the hand shape before moving on.";
  if (scores.wrist !== null && scores.wrist < 65) return "Adjust wrist height and bend to match the reference gesture.";
  if (scores.arm !== null && scores.arm < 65) return "Match the elbow bend and the curve from shoulder to wrist.";
  if (scores.body !== null && scores.body < 65) return "Re-centre your shoulders and upper-body balance before refining the hands.";
  return "Good alignment. Hold this Fon Leb pose steadily for two seconds.";
};
