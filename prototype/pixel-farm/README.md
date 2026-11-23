# 柳湾 · 光影田畦

唯一场景入口为 `index.html`。支持直接打开本地 HTML，也可以在本目录运行：

```sh
python -m http.server 8766 --bind 127.0.0.1
```

访问 `http://127.0.0.1:8766/`。旧水彩、SVG 图标、几何像素、尺寸/间距、配色和高差比较 demo 已清理，保留已确认的河畔青绿和光影田畦。独立的 `../时钟与钱币测试台.html` 继续用于功能验证。

## 当前规格

- Canvas 2D，固定俯视微倾视角；左上光源，右下像素投影与脚底/根部接触阴影。
- 基础地格 32×32，普通作物种植单元 64×64、株行距 64，白菜 48×72，田畦厚度 4 源像素。
- 4×3 单元试验田，支持局部干湿、全干、全湿，隐藏作物、人物遮挡查看、1×/2×与窄屏左右观察。
- 人物和小屋仍是比例占位；尚未接入真实种植、生长、移动、存档或完整天气模拟。

## 源文件与生成

```sh
python prototype/pixel-farm/convert-cabbage.py
python prototype/pixel-farm/ground-generate.py
python prototype/pixel-farm/depth-generate.py
node prototype/pixel-farm/ground-verify.cjs
```

以上命令在仓库根目录运行。需要 Python、Pillow 和 Node.js，无需 npm 依赖和联网。

- `source/cabbage-mature.png`：开发者提供的原始 AI 生图；`source/conversion.json` 保存裁切和已选 16 色。`convert-cabbage.py` 重建已选白菜，像素与原定稿一致。
- `ground-generate.py`：河畔青绿色板、20 张原生 32×32 纹理、图集与人物占位；`ground-manifest.json` 和 `ground-assets.js` 同源生成。
- `depth-generate.py`：小屋和三种硬边像素投影；尺寸与锚点见 `depth-manifest.json` / `depth-assets.js`。
- `ground-engine.js`：邻接掩码、32 像素地形连接、当前试验田和 64 像素种植单元。`ground-verify.cjs` 校验实际使用的地图与拼接。
- `ground-painter.js`：透明边界缓存、地表与田畦顶面绘制。
- `scene.js`：固定模式、4 像素土壁、阴影、脚点排序、前景透显和观察控件。

生成器会覆盖对应生成图片与清单，应修改生成器而非只改输出 PNG。素材、来源、参数和代码均在此目录，重新生成不依赖 `output/`；本地临时输出和个人生图草稿由 Git 忽略。

详见[已确认场景标准](../../文档/美术/轻量立体感试作.md)、[地面套件](../../文档/美术/程序地面套件.md)和[后续制作计划](../../文档/美术/农场视觉样板制作计划.md)。
