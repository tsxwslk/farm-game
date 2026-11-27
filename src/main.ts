import '../prototype/pixel-farm/scene.css';
import './style.css';
import '../prototype/pixel-farm/ground-assets.js';
import '../prototype/pixel-farm/ground-engine.js';
import '../prototype/pixel-farm/ground-painter.js';
import '../prototype/pixel-farm/depth-assets.js';
import '../prototype/pixel-farm/game.js';
import '../prototype/pixel-farm/scene.js';
import { CROPS, TRACES, RESOURCES, SALT_RUIN, SOUTH_PASS, STATIONS } from './content';
import { createControls } from './controls';
import { assetUrl } from './assets';
import { cropStage, jobMeter, traceVisible } from './game';
import { liuwanWeather } from './weather';

window.startLiuwanScene({
  layout: { resources: RESOURCES, saltRuin: SALT_RUIN, southPass: SOUTH_PASS, traces: TRACES, stations: STATIONS },
  cropStage,
  cropArt: CROPS,
  assetUrl,
  jobMeter,
  weatherForDay: liuwanWeather,
  traceVisible,
  createControls,
});
