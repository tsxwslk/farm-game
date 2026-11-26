--[[
柳湾北侧林缘的橡树：96×128 透明索引色精灵，Aseprite 生成。

运行：/Applications/Aseprite.app/Contents/MacOS/aseprite -b --script prototype/pixel-farm/oak.lua
输出：prototype/pixel-farm/assets/oak/oak-96x128.png / .aseprite
校验：python3 prototype/pixel-farm/oak-verify.py --verify

纹理照星露谷那套橡树做。第一版是「几团大叶块叠起来」，出来是花椰菜；
星露谷的冠面是一层错开的小鳞片，不是大块：

1) 暗底 + 亮鳞：整片冠先铺最深一档，鳞片盖上去，鳞与鳞之间露出来的底就是缝。
   反过来（亮底 + 暗缝）试过，覆盖率一低整片就成格纹。
2) 每片鳞宽 4~6、高 3~4，椭圆切角，尺寸与位置都随机。
   固定 5×4 时每个凸起一样宽，排在冠缘上就是一圈等距的齿。
3) 横向步长 3~5、行距 3、行偏移 0~4、位置抖动 ±1~2：间距随机才不成格纹。
4) 冠缘另补一圈叶团（每 6~10° 一团、5~8 宽）。内部鳞片大多整块落在界线内，
   只靠跨界的少数几块，轮廓起伏就只有一两格；这圈专门冲轮廓去。
5) 界外的毛刺收两遍：八邻叶少于 3 的删掉，否则边缘挂出的一格两格读成沙粒。
6) 冠形左右对称：角度先折到右半（用 |dx|）再算扰动，两侧拿到同一条。
7) 树干粗、有收分；杈点放在冠底以下，整段 Y 露在冠外——星露谷那棵就是这么交待的。
8) 树根四瓣撇开，各带一条最深的边，树才站得住。
9) 叶六档偏橄榄，和垂柳的黄绿拉开；树干沿用同一族灰棕。
]]

local W, H = 96, 128
local ANCHOR = { 48, 122 }

-- ── 色板：0 号留透明 ──────────────────────────────────────────────
local c = {
  line = 1, deep = 2, overlap = 3, mid = 4, lit = 5, hi = 6,
  b_line = 7, b_dark = 8, b_mid = 9, b_hi = 10,
}
local PALETTE = {
  { 0x24, 0x30, 0x1E },   -- 1  line     叶冠外圈
  { 0x35, 0x49, 0x27 },   -- 2  deep     团与团交叠的最深处
  { 0x4A, 0x64, 0x32 },   -- 3  overlap  后层叶团基调
  { 0x68, 0x85, 0x3F },   -- 4  mid      中层基调
  { 0x8F, 0xA8, 0x55 },   -- 5  lit      受光叶
  { 0xAF, 0xC4, 0x6C },   -- 6  hi       受光核心、叶点
  { 0x33, 0x25, 0x1A },   -- 7  b_line   树皮轮廓、纵裂
  { 0x4C, 0x3A, 0x2B },   -- 8  b_dark   树皮背光
  { 0x6B, 0x53, 0x40 },   -- 9  b_mid    树皮主色
  { 0x7E, 0x67, 0x4E },   -- 10 b_hi     树皮受光
}

-- ── 路径从脚本自身推 ──────────────────────────────────────────────
local src = debug.getinfo(1, 'S').source:gsub('^@', '')
local DIR = src:match('^(.*)/[^/]+$')
local ASSETS = DIR .. '/assets/oak'
local PREVIEWS = DIR .. '/../../output/art-previews/oak'
app.fs.makeDirectory(ASSETS, true)
app.fs.makeDirectory(PREVIEWS, true)

-- ── 工具 ──────────────────────────────────────────────────────────
local function new_buf(v)
  if v == nil then v = 0 end
  local b = {}
  for y = 1, H do
    b[y] = {}
    for x = 1, W do b[y][x] = v end
  end
  return b
end

local function rand(seed, i)
  local x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
  x = ((x ~ (x >> 13)) * 1274126177) & 0xFFFFFFFF
  return ((x ~ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF
end

local function disc_mask(cx, cy, r)
  local m = new_buf(false)
  for y = math.max(0, math.floor(cy - r)), math.min(H - 1, math.ceil(cy + r)) do
    for x = math.max(0, math.floor(cx - r)), math.min(W - 1, math.ceil(cx + r)) do
      local dx, dy = x + 0.5 - cx, y + 0.5 - cy
      if dx * dx + dy * dy <= r * r then m[y + 1][x + 1] = true end
    end
  end
  return m
end

-- ── 树冠轮廓 ──────────────────────────────────────────────────────
-- 左右对称：顶团落在正中轴，上下各一对镜像团。第一版左下比右下薄一块，
-- 整棵看着是歪的。
local CCX, CCY, CRX, CRY = 47.5, 47, 32, 39.5

-- 半径按角度分段扰动，段间用 smoothstep 过渡。
-- 每段角宽 8~16°、径向 ±3 像素；段与段之间不是硬切——硬切在像素上就是
-- 一段段水平的直边，读成多边形而不是叶团。深度用一阶惯性连着，不会跳。
local seed0 = 20270116
local STEPS = {}
do
  local a = -math.pi / 2
  local i = 0
  local prev = 0
  while a < math.pi / 2 do
    local w = (8 + math.floor(rand(seed0, i * 71) * 9)) * math.pi / 180
    local want = (rand(seed0 + 5, i * 53) - 0.32) * 6.0
    local d = prev * 0.62 + want * 0.38
    STEPS[#STEPS + 1] = { a0 = a, a1 = a + w, d0 = prev, d1 = d }
    prev = d
    a = a + w
    i = i + 1
  end
end
local function wobble(a)
  for _, st in ipairs(STEPS) do
    if a >= st.a0 and a < st.a1 then
      local t = (a - st.a0) / (st.a1 - st.a0)
      return st.d0 + (st.d1 - st.d0) * (t * t * (3 - 2 * t))
    end
  end
  return 0
end

local canopy = new_buf(false)
local RMEAN = (CRX + CRY) / 2
for y = 0, H - 1 do
  for x = 0, W - 1 do
    local dx, dy = (x + 0.5) - CCX, (y + 0.5) - CCY
    local u, v = dx / CRX, dy / CRY
    local q = math.sqrt(u * u + v * v)
    -- 角度先折到右半（用 |dx|）再算抖动：左右两侧拿到同一条扰动，冠形才真正对称
    if q <= 1 + wobble(math.atan(dy, math.abs(dx))) / RMEAN then canopy[y + 1][x + 1] = true end
  end
end
-- 顶团正中，上下各一对镜像（62/33、56/39 关于 x=47.5 对称）
for _, cl in ipairs { { 47.5, 22, 17 }, { 62, 34, 17 }, { 33, 34, 17 },
                      { 56, 70, 20 }, { 39, 70, 20 } } do
  local m = disc_mask(cl[1], cl[2], cl[3])
  for y = 1, H do
    for x = 1, W do canopy[y][x] = canopy[y][x] or m[y][x] end
  end
end

-- ── 叶鳞 ──────────────────────────────────────────────────────────
-- 暗底 + 亮鳞：整片冠先铺最深一档，鳞片整片照画、不裁在界线里。
-- 冠缘是鳞片自己蓬出来的，那一圈起伏才像叶团；裁在界线里不管界线怎么抖，
-- 边都还是那一条线。裁的问题从来不是“蓬”，是齿宽和齿距恒定。
-- 叶簇形状走椭圆、不走圆角矩形。矩形整块往界线外挪时，露出来的是一条横条，
-- 读成“插出来的一块板”；椭圆露出来是弧，才像叶团
local function clump_cells(wide, high)
  local cells = {}
  local cx, cy = (wide - 1) / 2, (high - 1) / 2
  local rw, rh = wide / 2 + 0.15, high / 2 + 0.15
  for j = 0, high - 1 do
    for i = 0, wide - 1 do
      local u, v = (i - cx) / rw, (j - cy) / rh
      if u * u + v * v <= 1 then cells[#cells + 1] = { i, j } end
    end
  end
  return cells
end

local buf = new_buf(0)
local leaf = new_buf(0)

for y = 1, H do
  for x = 1, W do
    if canopy[y][x] then leaf[y][x] = 2 end
  end
end

local LIGHT_X, LIGHT_Y = 24, 16
local function body_tone(x, y)
  local d = ((x - LIGHT_X) ^ 2 + ((y - LIGHT_Y) * 0.72) ^ 2) ^ 0.5
  if d < 42 then return 5 end
  if d < 78 then return 4 end
  return 3
end

local seed = 20261125
local row = 0
for cy = 4, H - 8, 3 do
  local off = math.floor(rand(seed + 1, row * 61) * 5)
  local cx = 2 + off
  while cx < W - 8 do
    -- 尺寸随机：宽 4~6、高 3~4。固定 5×4 时每个凸起一样宽，
    -- 排在冠缘上就是一圈等距的齿
    local wide = 4 + math.floor(rand(seed + 2, row * 53 + cx) * 3)
    local high = 3 + math.floor(rand(seed + 4, row * 47 + cx) * 2)
    local jx = math.floor(rand(seed, row * 97 + cx) * 4) - 1
    local jy = math.floor(rand(seed + 5, row * 89 + cx) * 3)
    local bx, by = cx + jx, cy + jy
    local cells = clump_cells(wide, high)

    -- 至少三成落在界线内才画：太少就是一块飘在冠外的碎叶
    local in_count = 0
    for _, cell in ipairs(cells) do
      local x, y = bx + cell[1] + 1, by + cell[2] + 1
      if x >= 1 and x <= W and y >= 1 and y <= H and canopy[y][x] then in_count = in_count + 1 end
    end
    if bx >= 0 and bx + wide <= W and by >= 0 and by + high <= H and in_count * 3 >= #cells then
      local tone = body_tone(bx + math.floor(wide / 2), by + 1)
      if rand(seed + 3, row * 71 + bx) < 0.22 then tone = math.max(3, tone - 1) end
      for _, cell in ipairs(cells) do
        leaf[by + cell[2] + 1][bx + cell[1] + 1] = tone
      end
      if tone >= 4 then
        for _, cell in ipairs { { 1, 0 }, { 2, 0 }, { 1, 1 }, { 2, 1 } } do
          if cell[1] < wide and cell[2] < high then
            leaf[by + cell[2] + 1][bx + cell[1] + 1] = math.min(6, tone + 1)
          end
        end
      end
    end
    -- 横向步长 3~5 随机：块宽 4~6，块间大多重叠、偶尔留一格缝
    cx = cx + 3 + math.floor(rand(seed + 17, row * 149 + cx) * 3)
  end
  row = row + 1
end

-- ── 冠缘补块 ──────────────────────────────────────────────────────
-- 沿界线每 6~10° 放一个叶簇，簇心压在界线上、再沿法线外偏 0~1.2 格。
-- 内部的叶簇大多整块落在界内，边缘只靠少数跨界的块，起伏就只有一两格；
-- 这一圈专门冲轮廓去：宽窄、深浅、间距都随机，才有“蓬”的读法。
-- 角度折成 |a| 算、再左右各画一次，冠形保持对称。
do
  local a = -math.pi / 2 + 0.03
  local i = 0
  while a < math.pi / 2 - 0.03 do
    local ca, sa = math.cos(a), math.sin(a)
    local wb = wobble(math.abs(a))
    local scale = (1 + wb / RMEAN) / math.sqrt((ca / CRX) ^ 2 + (sa / CRY) ^ 2)
    local wide = 5 + math.floor(rand(seed + 23, i * 67) * 4)
    local high = 4 + math.floor(rand(seed + 29, i * 79) * 3)
    local e = 0.2 + rand(seed + 31, i * 83) * 1.0
    local px = CCX + (scale + e) * ca
    local py = CCY + (scale + e) * sa
    -- 冠底正中那段留给树干分杈，别用叶簇盖住
    local guard = not (py > 82 and math.abs(px - CCX) < 9)
    if guard then
      local bw = math.floor(px - (wide - 1) / 2 + 0.5)
      local bh = math.floor(py - high / 2 + 0.5)
      local cells = clump_cells(wide, high)
      local tone = body_tone(math.floor(px), math.floor(py))
      if rand(seed + 37, i * 89) < 0.35 then tone = math.max(3, tone - 1) end
      for _, sx in ipairs { 1, -1 } do
        local bx = (sx == 1) and bw or math.floor(2 * CCX - bw - wide + 0.5)
        if bx >= 0 and bx + wide <= W and bh >= 0 and bh + high <= H then
          for _, cell in ipairs(cells) do
            leaf[bh + cell[2] + 1][bx + cell[1] + 1] = tone
          end
          if tone >= 4 then
            for _, cell in ipairs { { 1, 0 }, { 2, 0 }, { 1, 1 }, { 2, 1 } } do
              if cell[1] < wide and cell[2] < high then
                leaf[bh + cell[2] + 1][bx + cell[1] + 1] = math.min(6, tone + 1)
              end
            end
          end
        end
      end
    end
    a = a + (6 + math.floor(rand(seed + 41, i * 97) * 5)) * math.pi / 180
    i = i + 1
  end
end

-- 溢出清理：界外的叶像素至少要有 3 个八邻也是叶，否则就是一根单像素毛刺。
-- 不清理的话，边缘会零星挂出一格两格，读成沙粒而不是叶团
for _ = 1, 2 do
  local drop = {}
  for y = 1, H do
    for x = 1, W do
      if leaf[y][x] > 0 and not canopy[y][x] then
        local n = 0
        for dx = -1, 1 do
          for dy = -1, 1 do
            if not (dx == 0 and dy == 0) then
              local nx, ny = x + dx, y + dy
              if nx >= 1 and nx <= W and ny >= 1 and ny <= H and leaf[ny][nx] > 0 then n = n + 1 end
            end
          end
        end
        if n < 3 then drop[#drop + 1] = { x, y } end
      end
    end
  end
  if #drop == 0 then break end
  for _, pt in ipairs(drop) do leaf[pt[2]][pt[1]] = 0 end
end

-- ── 树干、分杈、树根 ──────────────────────────────────────────────
-- 树干要粗、要有收分，冠底的分杈处一分为三。枝只画在冠外（冠底缺口里），
-- 不做穿冠而出的枝条——星露谷那棵树的分杈就是这么交待的
local function limb(pts)
  local m = new_buf(false)
  for i = 1, #pts - 1 do
    local a, b = pts[i], pts[i + 1]
    local steps = math.max(1, math.ceil(math.abs(b[2] - a[2])))
    for s = 0, steps do
      local t = s / steps
      local cx = a[1] + (b[1] - a[1]) * t
      local cy = a[2] + (b[2] - a[2]) * t
      local hw = a[3] + (b[3] - a[3]) * t
      for y = math.floor(cy), math.floor(cy) + 1 do
        if y <= ANCHOR[2] then
          for x = math.floor(cx - hw), math.ceil(cx + hw) do
            if x >= 0 and x < W and y >= 0 then
              if math.abs((x + 0.5) - cx) <= hw then m[y + 1][x + 1] = true end
            end
          end
        end
      end
    end
  end
  return m
end

local function poly_mask(poly)
  local m = new_buf(false)
  local ymin, ymax = math.huge, -math.huge
  for _, pt in ipairs(poly) do
    ymin = math.min(ymin, pt[2]); ymax = math.max(ymax, pt[2])
  end
  for y = math.max(0, math.floor(ymin)), math.min(H - 1, math.ceil(ymax)) do
    local yc = y + 0.5
    local xs = {}
    for i = 1, #poly do
      local a, b = poly[i], poly[i % #poly + 1]
      if (a[2] <= yc and b[2] > yc) or (b[2] <= yc and a[2] > yc) then
        xs[#xs + 1] = a[1] + (yc - a[2]) * (b[1] - a[1]) / (b[2] - a[2])
      end
    end
    table.sort(xs)
    for k = 1, #xs - 1, 2 do
      for x = math.max(0, math.ceil(xs[k] - 0.5)), math.min(W - 1, math.floor(xs[k + 1] - 0.5 - 1e-9)) do
        m[y + 1][x + 1] = true
      end
    end
  end
  return m
end

local TRUNK = limb { { 48.6, 122.6, 6.4 }, { 48, 116, 5.6 }, { 47.4, 108, 5.0 }, { 47, 100, 4.4 } }
local BR_L = limb { { 47, 100, 4.2 }, { 43, 94, 3.2 }, { 40, 88, 2.3 }, { 38, 82, 1.6 } }
local BR_R = limb { { 47, 100, 4.2 }, { 51, 94, 3.2 }, { 54, 87, 2.3 }, { 56, 81, 1.6 } }
local BR_C = limb { { 47, 100, 3.2 }, { 47, 92, 2.4 }, { 46, 84, 1.6 } }
-- 树根：四瓣撇开，各带一条最深的边，树才站得住
local ROOT_MASKS = {
  poly_mask { { 43, 112 }, { 35, 118 }, { 33, 122.6 }, { 45, 122.6 } },
  poly_mask { { 52, 112 }, { 60, 118 }, { 62, 122.6 }, { 50, 122.6 } },
  poly_mask { { 41, 116 }, { 36.5, 120 }, { 36, 122.6 }, { 44, 122.6 } },
  poly_mask { { 54, 116 }, { 58.5, 120 }, { 59, 122.6 }, { 51, 122.6 } },
}

local wood = new_buf(false)
for _, m in ipairs { TRUNK, BR_L, BR_R, BR_C } do
  for y = 1, H do
    for x = 1, W do wood[y][x] = wood[y][x] or m[y][x] end
  end
end
for _, m in ipairs(ROOT_MASKS) do
  for y = 1, H do
    for x = 1, W do wood[y][x] = wood[y][x] or m[y][x] end
  end
end

-- 合成：叶在上、木只在冠外可见（冠底缺口里露出分杈）
for y = 1, H do
  for x = 1, W do buf[y][x] = leaf[y][x] end
end

local wood_d = new_buf(0)
do
  local q = {}
  local function inside(x, y)
    return x >= 1 and x <= W and y >= 1 and y <= H and wood[y][x]
  end
  for y = 1, H do
    for x = 1, W do
      if wood[y][x] and not (inside(x - 1, y) and inside(x + 1, y)
                             and inside(x, y - 1) and inside(x, y + 1)) then
        wood_d[y][x] = 1
        q[#q + 1] = { x, y }
      end
    end
  end
  local i = 1
  while i <= #q do
    local cx, cy = q[i][1], q[i][2]
    for _, o in ipairs { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
      local nx, ny = cx + o[1], cy + o[2]
      if inside(nx, ny) and wood_d[ny][nx] == 0 then
        wood_d[ny][nx] = wood_d[cy][cx] + 1
        q[#q + 1] = { nx, ny }
      end
    end
    i = i + 1
  end
end

-- 可见的木头 = 有木头且这里没有叶子（冠底缺口与冠下）
local wood_vis = new_buf(false)
for y = 1, H do
  for x = 1, W do wood_vis[y][x] = wood[y][x] and leaf[y][x] == 0 end
end
for y = 1, H do
  for x = 1, W do
    if wood_vis[y][x] and wood_d[y][x] == 1 then buf[y][x] = c.b_line end
  end
end
for y = 1, H do
  local x = 1
  while x <= W do
    if not (wood_vis[y][x] and wood_d[y][x] >= 2) then
      x = x + 1
    else
      local x0 = x
      while x <= W and wood_vis[y][x] and wood_d[y][x] >= 2 do x = x + 1 end
      local run = {}
      for xx = x0, x - 1 do run[#run + 1] = xx end
      local n = #run
      for i, xx in ipairs(run) do
        local k = i - 1
        if n >= 5 then
          if k == 0 then
            buf[y][xx] = c.b_hi
          elseif k == n - 1 then
            buf[y][xx] = c.b_dark
          else
            buf[y][xx] = c.b_mid
          end
        elseif n >= 3 then
          buf[y][xx] = (k == 0) and c.b_mid or c.b_dark
        else
          buf[y][xx] = c.b_mid
        end
      end
    end
  end
end

-- 树皮纵裂 + 分杈处的暗缝
for _, g in ipairs { { 45, 100, 7 }, { 49, 110, 5 }, { 46, 90, 4 }, { 50, 118, 4 }, { 43, 116, 3 } } do
  for i = 0, g[3] - 1 do
    local x, y = g[1] + 1, g[2] + i + 1
    if buf[y] and (buf[y][x] == c.b_mid or buf[y][x] == c.b_hi) then buf[y][x] = c.b_line end
  end
end

-- 叶冠外圈：只压在冠上、且与透明相邻的一圈
for y = 1, H do
  for x = 1, W do
    if buf[y][x] >= 2 and buf[y][x] <= 6 then
      local open = false
      for _, o in ipairs { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
        local nx, ny = x + o[1], y + o[2]
        if nx < 1 or nx > W or ny < 1 or ny > H or buf[ny][nx] == 0 then open = true end
      end
      if open then buf[y][x] = c.line end
    end
  end
end

-- 少量叶点：1 像素，落在最亮的左上侧
for i = 1, 40 do
  local x = 8 + math.floor(rand(seed + 31, i * 17) * (W - 16))
  local y = 8 + math.floor(rand(seed + 37, i * 19) * (H - 50))
  if leaf[y + 1] and leaf[y + 1][x + 1] >= 5 then buf[y + 1][x + 1] = 6 end
end

-- ── 组装 ──────────────────────────────────────────────────────────
local spr = Sprite(W, H, ColorMode.INDEXED)
spr.transparentColor = 0
local pal = spr.palettes[1]
pal:setColor(0, Color { r = 0, g = 0, b = 0, a = 0 })
for i, rgb in ipairs(PALETTE) do
  pal:setColor(i, Color { r = rgb[1], g = rgb[2], b = rgb[3], a = 255 })
end

local img = Image(W, H, ColorMode.INDEXED)
local count, minx, maxx, miny, maxy = {}, W, 0, H, 0
for y = 1, H do
  for x = 1, W do
    img:putPixel(x - 1, y - 1, buf[y][x])
    if buf[y][x] > 0 then
      count[buf[y][x]] = (count[buf[y][x]] or 0) + 1
      minx = math.min(minx, x - 1); maxx = math.max(maxx, x - 1)
      miny = math.min(miny, y - 1); maxy = math.max(maxy, y - 1)
    end
  end
end

local layer = spr.layers[1]
layer.name = 'oak'
spr:newCel(layer, 1, img, Point(0, 0))
spr:saveAs(ASSETS .. '/oak-96x128.aseprite')
spr:saveCopyAs(ASSETS .. '/oak-96x128.png')

local total = 0
for _, v in pairs(count) do total = total + v end
print(string.format('不透明 %d 像素，包围盒 x %d..%d y %d..%d（%d×%d）',
  total, minx, maxx, miny, maxy, maxx - minx + 1, maxy - miny + 1))
print(string.format('底行 y=%d，锚点 (%d,%d)', maxy, ANCHOR[1], ANCHOR[2]))
local used = 0
for i = 1, #PALETTE do if count[i] then used = used + 1 end end
print(string.format('用到的色数 %d / %d', used, #PALETTE))
