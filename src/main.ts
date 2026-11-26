import '../prototype/pixel-farm/scene.css';
import './style.css';
import '../prototype/pixel-farm/ground-assets.js';
import '../prototype/pixel-farm/ground-engine.js';
import '../prototype/pixel-farm/ground-painter.js';
import '../prototype/pixel-farm/depth-assets.js';
import '../prototype/pixel-farm/game.js';
import '../prototype/pixel-farm/scene.js';
import { CROPS, MUSTARD_TRACE, RESOURCES, SALT_RUIN, SOUTH_PASS } from './content';
import { createControls } from './controls';
import { assetUrl } from './assets';
import { cropStage, jobMeter, mustardTraceVisible } from './game';
import { liuwanWeather } from './weather';

window.startLiuwanScene({
  layout: { resources: RESOURCES, saltRuin: SALT_RUIN, southPass: SOUTH_PASS, trace: MUSTARD_TRACE.tile },
  cropStage,
  cropArt: CROPS,
  assetUrl,
  jobMeter,
  weatherForDay: liuwanWeather,
  traceVisible: mustardTraceVisible,
  createControls,
});
