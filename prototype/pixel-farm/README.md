# 柳湾 · 可玩 Demo

打开 `index.html` 开始试玩。可直接打开本地 HTML，或在本目录运行：

```sh
python -m http.server 8766 --bind 127.0.0.1
```

访问 `http://127.0.0.1:8766/`。春季全图沿土路串起田记所旧址、菜畦、旧盐坑、林缘、河岸和山道出口。使用新草坪、裸土与土路、草土过渡砖、干湿耕地、河水与土水过渡图集、岩石、木制收获箱、垂柳、河畔农舍与院内腌菜瓮。独立的 `../时钟与钱币测试台.html` 继续用于功能验证。

## 试玩

- WASD 移动，点击地面寻路，点击田块和设施会走到可操作位置。到达后可继续点击、按 E 或按操作按钮。
- 在角标划出的田块翻地、播种、浇水、收获。在旧盐坑敲击三次采一份岩盐，林缘的旧种匣每天可收集一次种子。
- 盐灶把岩盐制成粗盐。用粗盐和樱桃萝卜在菜缸里腌制，完工时按投入批次判定上锚并结稿酬。完成后到田记所提交物志，恢复场景里的缺字牌。
- 在背包选「摆放盐灶」或「摆放腌菜缸」，再点可到达的空地。加工完毕后可移动设施，摆放位置随进度保存。
- 地图铺满浏览器视口，镜头跟随角色。滚轮或画面右下角的按钮可缩放、打开全图或进入浏览器全屏。背包与物志可从画面左下角打开，也可按 B 和 J。按 Esc 收起面板。
- 试玩节奏为每秒 6 游戏分钟。樱桃萝卜浇水后，第 35、90、180、300 游戏分钟分别进入出土、幼苗、膨大、成熟。制盐 45 分钟，腌菜 75 分钟。画面右下角的 `»` 每次快进一小时。时间在失焦或午夜日结时暂停。
- 试玩进度自动保存在浏览器本地。可读回当天的田块、背包、在制品、位置、物志和日结。

## 当前规格

- Canvas 2D，固定俯视微倾视角；左上光源，右下像素投影与脚底/根部接触阴影。
- 基础地格 32×32，普通作物种植单元和株行距均为 64 像素，田畦顶面抬高 4 源像素。樱桃萝卜的四个生长阶段和背包图使用 `assets/cherry-radish/`。
- 全图为 34×20 地格，北侧主田 4×2 种植单元，南侧副田 4×1。地点按钮用于寻路，河岸和山道出口可以到达。
- 河面沿土水过渡砖接到连续的裸土岸。普通岩石使用 `assets/rock/rock-atlas.png` 前三帧，旧盐坑使用 `rock-ore-salt.png`。
- 柳湾的默认垂柳素材为 `assets/willow/willow-imported.png`，画布为 96×128，脚点为 `(48, 122)`。人物沿用像素样板，木牌由 Canvas 绘制。
- 盐灶使用 `assets/kiln/salt-stove-scene-48x48.png`，接地点为 `(24, 44)`。同目录包含 16×16 背包图标、分层源文件和 Lua 绘制脚本。
- 田记所旧址使用 `assets/house/house-cottage-128x104.png`，脚点为 `(64, 96)`，投影根据房屋轮廓生成。
- 院内和恢复后的腌菜缸使用 `assets/jar/jar-crock-48x48.png`，脚点为 `(24, 44)`，投影根据缸身轮廓生成。

## 源文件与生成

```sh
python prototype/pixel-farm/ground-generate.py
python prototype/pixel-farm/soil-generate.py
python prototype/pixel-farm/grass-generate.py
python prototype/pixel-farm/edge-generate.py
python prototype/pixel-farm/tilled-generate.py
python prototype/pixel-farm/crate-generate.py
python prototype/pixel-farm/water-generate.py
python prototype/pixel-farm/shore-generate.py
python prototype/pixel-farm/rock-generate.py
python prototype/pixel-farm/house-generate.py
python prototype/pixel-farm/jar-generate.py
python prototype/pixel-farm/radish-generate.py
python prototype/pixel-farm/depth-generate.py
node prototype/pixel-farm/ground-verify.cjs
```

以上命令在仓库根目录运行。需要 Python、Pillow 和 Node.js，无需 npm 依赖和联网。

- `ground-generate.py`：人物占位，附带上一版地表的再生成入口。
- `depth-generate.py`：生成硬边像素投影，读取农舍、收获箱和腌菜缸的素材清单与锚点。
- `ground-engine.js`：全图地格、院落与河岸轮廓、地图点位、邻接掩码和种植单元。
- `ground-painter.js`：以裸土为底，用草土过渡砖把土路和各院落拼成连续地表。干湿田畦沿用独立贴图。无过渡的 `assets/soil/soil-path-atlas.png` 保留备用。
- `game.js`：试玩规则、批次时限、加工、物志、时间与寻路。
- `game-controls.js`：输入、镜头缩放控制、游戏界面与浏览器本地保存。
- `scene.js`：地图地物、光影田畦、脚点排序、可点击点位与镜头渲染。

生成器会覆盖对应的场景图片与清单。放大验收图保存在 `output/art-previews/`。早期程序垂柳可单独运行 `willow-generate.py` 在该目录生成。退役的河畔青绿地表可用 `ground-generate.py --legacy-terrain` 重建到 `output/archived-art/riverside/`。`output/` 由 Git 忽略。

场景的视角、田畦厚度和排序规则见[光影田畦标准](../../文档/美术/轻量立体感试作.md)。新版地表见[草土过渡砖](../../文档/美术/柳湾草土过渡砖.md)、[耕地素材](../../文档/美术/柳湾耕地素材.md)、[水面素材](../../文档/美术/柳湾水面素材.md)、[河岸素材](../../文档/美术/柳湾河岸素材.md)、[岩石素材](../../文档/美术/柳湾岩石素材.md)、[垂柳素材](../../文档/美术/柳湾垂柳素材.md)、[农舍素材](../../文档/美术/柳湾农舍素材.md)和[腌菜瓮素材](../../文档/美术/柳湾腌菜瓮素材.md)。
