/**
 * Project-selected reference clips from the curated Fon Leb lesson video.
 * Each clip begins at its selected reference frame and ends before the next pose.
 */
export type FonLebMovement = {
  id: string;
  name: string;
  thaiName: string;
  startTime: number;
  endTime: number;
};

const movement = (
  id: string,
  name: string,
  thaiName: string,
  startTime: number,
  endTime: number,
): FonLebMovement => ({
  id,
  name,
  thaiName,
  startTime,
  endTime,
});

export const FON_LEB_SEQUENCE: FonLebMovement[] = [
  movement("jib-song-lang", "Jib Song Lang", "จีบส่งหลัง", 25, 43),
  movement("tang-wong", "Tang Wong", "ตั้งวง", 44, 64),
  movement("wai", "Wai", "ไหว้", 65, 84),
  movement("bit-bua-ban-1", "Bit Bua Ban", "บิดบัวบาน", 85, 104),
  movement("klang-amphorn", "Klang Amphorn", "กลางอัมพร", 105, 125),
  movement("sod-sung", "Sod Soong", "สอดสูง", 126, 145),
  movement("jib-khu-ngo-khaen", "Jeeb Koo Ngo Khaen", "จีบคู่งอแขน", 146, 165),
  movement("phrom-si-na", "Phrom Si Na", "พรหมสี่หน้า", 166, 187),
  movement("kratai-tong-raew", "Kratai Tong Rae", "กระต่ายต้องแร้ว", 188, 209),
  movement("pha-la-phiang-lai", "Pha La Phiang Lai", "ผาลาเพียงไหล่", 210, 232),
  movement("sabat-jib", "Sabat Jeeb", "สะบัดจีบ", 233, 251),
  movement("sod-soi", "Sod Soi", "สอดสร้อย", 252, 271),
  // No following pose was supplied, so this final end time is a 10-second draft clip.
  movement("bit-bua-ban-2", "Bit Bua Ban", "บิดบัวบาน", 272, 282),
];

export const formatTimestamp = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};
