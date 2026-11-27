import { CROPS, type CropId, type Quality } from './content';

export interface Soil {
  nutrients: number;
  microbes: number;
  lastCrop: CropId | null;
  streak: number;
  vacantSince: number | null;
}

export const COMPOST_GAIN = { nutrients: 20, microbes: 12 } as const;
export const QUALITY_THRESHOLDS = { good: 50, fine: 75 } as const;

export function newSoil(vacantSince = 0): Soil {
  return { nutrients: 90, microbes: 90, lastCrop: null, streak: 0, vacantSince };
}

function adjust(value: number, change: number) {
  return Math.max(0, Math.min(100, value + change));
}

export function cropStreak(soil: Soil, crop: CropId) {
  return soil.lastCrop && CROPS[soil.lastCrop].family === CROPS[crop].family ? soil.streak + 1 : 1;
}

export function harvestQuality(soil: Soil, crop: CropId): Quality {
  const condition = Math.min(soil.nutrients, soil.microbes);
  if (condition < QUALITY_THRESHOLDS.good) return 'normal';
  if (condition >= QUALITY_THRESHOLDS.fine && cropStreak(soil, crop) === 1) return 'fine';
  return 'good';
}

export function recordHarvest(soil: Soil, crop: CropId, minute: number) {
  const streak = cropStreak(soil, crop);
  soil.nutrients = adjust(soil.nutrients, CROPS[crop].nutrients);
  soil.microbes = adjust(soil.microbes, streak >= 2 ? -8 : 0);
  soil.lastCrop = crop;
  soil.streak = streak;
  soil.vacantSince = minute;
}

export function restSoil(soil: Soil, minute: number, dayLength: number) {
  if (soil.lastCrop === null || soil.vacantSince === null || minute - soil.vacantSince < dayLength) return;
  soil.nutrients = adjust(soil.nutrients, 8);
  soil.microbes = adjust(soil.microbes, 6);
  soil.streak = 0;
}

export function compostGain(soil: Soil) {
  return {
    nutrients: adjust(soil.nutrients, COMPOST_GAIN.nutrients) - soil.nutrients,
    microbes: adjust(soil.microbes, COMPOST_GAIN.microbes) - soil.microbes,
  };
}
