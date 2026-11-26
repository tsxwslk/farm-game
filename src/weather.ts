const SPRING_WEATHER = ['clear', 'rain', 'haze', 'clear', 'clear', 'rain', 'clear'] as const;

export const FORECAST_DAYS = 7;
export type Weather = typeof SPRING_WEATHER[number];
export const WEATHER_LABELS: Record<Weather, string> = { clear: '晴', rain: '雨', haze: '霾' };

export function liuwanWeather(day: number): Weather {
  return SPRING_WEATHER[(day - 1) % SPRING_WEATHER.length];
}
