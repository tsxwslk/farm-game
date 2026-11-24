import '../prototype/pixel-farm/scene.css';
import './style.css';
import '../prototype/pixel-farm/ground-assets.js';
import '../prototype/pixel-farm/ground-engine.js';
import '../prototype/pixel-farm/ground-painter.js';
import '../prototype/pixel-farm/depth-assets.js';
import '../prototype/pixel-farm/game.js';
import '../prototype/pixel-farm/scene.js';
import { RESOURCES } from './content';
import { createControls } from './controls';
import { assetUrl } from './assets';
import { jobMeter } from './game';

window.startLiuwanScene({
  layout: { resources: RESOURCES },
  assetUrl,
  jobMeter,
  createControls,
});
