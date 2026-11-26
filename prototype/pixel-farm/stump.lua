--[[
柳湾待垦农田的旧树桩：48×48 透明索引色精灵，Aseprite 生成。

运行：/Applications/Aseprite.app/Contents/MacOS/aseprite -b --script prototype/pixel-farm/stump.lua
输出：prototype/pixel-farm/assets/stump/stump-48x48.png / .aseprite
校验：python3 prototype/pixel-farm/stump-verify.py --verify

固定俯视微倾、左上受光。底行落在 y=44，锚点 (24,44)，与岩石、收获箱同一套脚点。

1) 桩身压得很低：整件高约 19 像素、宽 34 左右，宽度是高度的 1.8 倍。
   岩石是 29×23、接近方形，树桩靠这个扁宽的比例就能在剪影上分开——
   校验里直接和岩石图集第一帧算交并比，要求低于 0.70。
2) 断面是这件的主角，必须比桩身浅一大截：桩身 #6B5340，断面 #C9B48C，
   差 113 个亮度单位。断面用椭圆，左上半再提一档受光，所以断面自己也有体积。
3) 断面上只放两道年轮和一个崩口。年轮是同一中心的套缩小椭圆，1 像素宽；
   崩口开在断面右前的沿上，吃掉两三像素、填断面断口的深色，桩就“缺了一块”。
4) 树根三条：左右各一条粗短楔形，另在左前再撇一条，三条把轮廓向两侧撑开。
   每条根与桩身之间压一道暗缝，既读成根的接缝，也让上色按段分档时不会连成一片。
5) 树皮按每行每段的相对位置分档：左两列受光、中间主色、右两列压暗、最外一圈最深。
   再点两三道竖向短裂纹，树皮才有质地。
6) 全色走索引色板，alpha 只有 0 与 255；没有草底、散落木材、投影、抗锯齿。
]]

local W, H = 48, 48
local ANCHOR = { 24, 44 }

-- ── 色板：0 号留透明 ──────────────────────────────────────────────
local c = {
  line = 1, dark = 2, mid = 3, hi = 4,          -- 树皮四档，取自《柳湾垂柳素材》
  face_edge = 5, ring = 6, face = 7, face_hi = 8, broken = 9,
}
local PALETTE = {
  { 0x33, 0x25, 0x1A },   -- 1 line      轮廓、树皮裂纹
  { 0x4C, 0x3A, 0x2B },   -- 2 dark      背光树皮
  { 0x6B, 0x53, 0x40 },   -- 3 mid       桩身主色
  { 0x7E, 0x67, 0x4E },   -- 4 hi        受光树皮
  { 0x8A, 0x74, 0x58 },   -- 5 face_edge 断面外沿、断口底
  { 0xAE, 0x99, 0x73 },   -- 6 ring      年轮
  { 0xC9, 0xB4, 0x8C },   -- 7 face      断面主色（比桩身浅 113）
  { 0xDD, 0xCB, 0xA6 },   -- 8 face_hi   断面受光
  { 0x7A, 0x5F, 0x44 },   -- 9 broken    崩口的新断面
}

-- ── 路径从脚本自身推 ──────────────────────────────────────────────
local src = debug.getinfo(1, 'S').source:gsub('^@', '')
local DIR = src:match('^(.*)/[^/]+$')
local ASSETS = DIR .. '/assets/stump'
local PREVIEWS = DIR .. '/../../output/art-previews/stump'
app.fs.makeDirectory(ASSETS, true)
app.fs.makeDirectory(PREVIEWS, true)

-- ── 缓冲区与几何工具（缓冲区 1 基，坐标一律 0 基精灵坐标）────────
local function new_buf(v)
  if v == nil then v = 0 end
  local b = {}
  for y = 1, H do
    b[y] = {}
    for x = 1, W do b[y][x] = v end
  end
  return b
end

local function poly_mask(poly)
  local m = new_buf(false)
  local ymin, ymax = math.huge, -math.huge
  for _, p in ipairs(poly) do
    ymin = math.min(ymin, p[2])
    ymax = math.max(ymax, p[2])
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
      local xa = math.ceil(xs[k] - 0.5)
      local xb = math.floor(xs[k + 1] - 0.5 - 1e-9)
      for x = math.max(0, xa), math.min(W - 1, xb) do
        m[y + 1][x + 1] = true
      end
    end
  end
  return m
end

local function ellipse_mask(cx, cy, rx, ry)
  local m = new_buf(false)
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      local dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
      if dx * dx + dy * dy <= 1 then m[y + 1][x + 1] = true end
    end
  end
  return m
end

local function union(a, b)
  local m = new_buf(false)
  for y = 1, H do
    for x = 1, W do m[y][x] = a[y][x] or b[y][x] end
  end
  return m
end

local function depth_map(mask)
  local d = new_buf(0)
  local q = {}
  local function inside(x, y)
    return x >= 1 and x <= W and y >= 1 and y <= H and mask[y][x]
  end
  for y = 1, H do
    for x = 1, W do
      if mask[y][x] and not (inside(x - 1, y) and inside(x + 1, y)
                             and inside(x, y - 1) and inside(x, y + 1)) then
        d[y][x] = 1
        q[#q + 1] = { x, y }
      end
    end
  end
  local i = 1
  while i <= #q do
    local cx, cy = q[i][1], q[i][2]
    for _, o in ipairs { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
      local nx, ny = cx + o[1], cy + o[2]
      if inside(nx, ny) and d[ny][nx] == 0 then
        d[ny][nx] = d[cy][cx] + 1
        q[#q + 1] = { nx, ny }
      end
    end
    i = i + 1
  end
  return d
end

-- ── 桩身与树根 ────────────────────────────────────────────────────
-- 和岩石分开靠两件事：更扁、更宽。岩石是 29×23、上窄下宽的一个包；
-- 这里做成 36×16、顶面占大头、底部收窄再让根探出去，剪影交并比压到 0.6 上下。
local TRUNK = {
  { 9.4, 33 }, { 9.2, 29 }, { 12, 27.4 }, { 18.4, 27 }, { 25.8, 27.6 },
  { 31.8, 28.8 }, { 35.4, 30.6 }, { 36, 34.6 }, { 35.4, 39 }, { 32.6, 45 }, { 15, 45 },
  { 12, 39.4 },
}
-- 三条粗短根：左右大楔形把轮廓撑开，前面一条压在最前
local ROOTS = {
  { { 11.6, 37 }, { 7.6, 39.2 }, { 5.6, 42.4 }, { 7, 45 }, { 12.8, 44.8 } },
  { { 35, 38.2 }, { 38.2, 40 }, { 39.6, 42.6 }, { 38.4, 45 }, { 33.8, 44.6 } },
  { { 18, 41.6 }, { 15, 43 }, { 14.4, 45 }, { 21.4, 45 }, { 23.4, 42.6 } },
}

local trunk = poly_mask(TRUNK)
local root_masks = {}
local solid = new_buf(false)
for y = 1, H do
  for x = 1, W do solid[y][x] = trunk[y][x] end
end
for _, poly in ipairs(ROOTS) do
  local m = poly_mask(poly)
  root_masks[#root_masks + 1] = m
  for y = 1, H do
    for x = 1, W do solid[y][x] = solid[y][x] or m[y][x] end
  end
end

-- 断面：宽而扁，四周留 1 像素树皮
local FCX, FCY, FRX, FRY = 23.2, 31.6, 11.4, 3.8
local face = ellipse_mask(FCX, FCY, FRX, FRY)
local face_d = depth_map(face)

local buf = new_buf(0)
local out_d = depth_map(solid)

-- ── 树皮：轮廓先描，再在内侧算行内相对位置 ─────────────────────────
-- 相对位置必须只算内部：把最外圈描边也算进去，受光列整体偏移一格，
-- 结果整圈立面全是中间调（第一版就是这样，受光带只剩 1 像素）
for y = 1, H do
  for x = 1, W do
    if solid[y][x] and out_d[y][x] == 1 then buf[y][x] = c.line end
  end
end
for y = 1, H do
  local x = 1
  while x <= W do
    if not (solid[y][x] and out_d[y][x] >= 2) then
      x = x + 1
    else
      local x0 = x
      while x <= W and solid[y][x] and out_d[y][x] >= 2 do x = x + 1 end
      local run = {}
      for xx = x0, x - 1 do run[#run + 1] = xx end
      local n = #run
      for i, xx in ipairs(run) do
        local k = i - 1
        if n >= 6 then
          if k <= 1 then
            buf[y][xx] = c.hi
          elseif k >= n - 2 then
            buf[y][xx] = c.dark
          else
            buf[y][xx] = c.mid
          end
        elseif n >= 3 then
          buf[y][xx] = (k == 0) and c.hi or ((k == n - 1) and c.dark or c.mid)
        else
          buf[y][xx] = c.mid
        end
      end
    end
  end
end

-- 根与桩身之间压一道暗缝：既读成接缝，也让上色按段分开
for _, m in ipairs(root_masks) do
  for y = 2, H do
    for x = 1, W do
      -- 根与桩身相接的那条上沿压暗：读成“根从桩底探出来”
      if m[y][x] and not m[y - 1][x] and trunk[y - 1][x] and buf[y][x] ~= c.line then
        buf[y][x] = c.line
      end
    end
  end
end

-- 树皮纵纹：四条长竖纹，各自带一处断口。
-- 短横点读不出树皮；树皮的签名是竖向的长沟
for _, g in ipairs { { 15, 37, 6, 2 }, { 21, 37, 7, 4 }, { 28, 37, 6, 2 }, { 33, 38, 4, 1 } } do
  for i = 0, g[3] - 1 do
    if i == g[4] then goto skip end
    local x, y = g[1] + 1, g[2] + i + 1
    if buf[y][x] == c.mid or buf[y][x] == c.hi then buf[y][x] = c.dark end
    ::skip::
  end
end

-- 每条根的上沿提一档：根是横躺的，朝上的那一面受光，根身才从桩身里分出来
for _, m in ipairs(root_masks) do
  for y = 2, H do
    for x = 1, W do
      if m[y][x] and not m[y - 1][x] then
        if buf[y][x] == c.mid or buf[y][x] == c.dark then buf[y][x] = c.hi end
      end
    end
  end
end

-- ── 断面 ──────────────────────────────────────────────────────────
-- 断面平涂。第一版在左上铺了一大片提亮，整块断面读成鼓包；
-- 锯切面是平的，体积只靠一圈树皮和两道套圆交代。
for y = 1, H do
  for x = 1, W do
    if face[y][x] and solid[y][x] then
      local below_out = not (y + 1 <= H and face[y + 1][x])
      if (y - 1) > FCY + 0.2 and below_out then
        buf[y][x] = c.face_edge          -- 前唇挡住的那一行内阴影
      elseif face_d[y][x] == 1 and (y - 1) < FCY then
        buf[y][x] = c.face_hi            -- 后沿一线受光
      else
        buf[y][x] = c.face
      end
    end
  end
end

-- 年轮：两道完整套圆。扁椭圆上整圈会甩出上下长横条，但套起来就是年轮该有的样子，
-- 缺了整圈反而读不出“锯断的木头”
local function stroke_ring(rx, ry, tone)
  local steps = math.max(60, math.floor((rx + ry) * 12))
  for i = 0, steps - 1 do
    local a = i * 2 * math.pi / steps
    local x = math.floor(FCX + rx * math.cos(a) + 0.5)
    local y = math.floor(FCY + ry * math.sin(a) + 0.5)
    if x >= 0 and x < W and y >= 0 and y < H and face[y + 1][x + 1] then
      local idx = buf[y + 1][x + 1]
      if idx == c.face or idx == c.face_hi then buf[y + 1][x + 1] = tone end
    end
  end
end
stroke_ring(FRX * 0.62, FRY * 0.62, c.face_edge)

-- 髓心
for _, p in ipairs { { FCX - 0.6, FCY - 0.6 }, { FCX + 0.4, FCY - 0.6 } } do
  local x, y = math.floor(p[1]) + 1, math.floor(p[2]) + 1
  if face[y] and face[y][x] then buf[y][x] = c.face_edge end
end

-- 崩口：断面右前的沿上崩掉一块，露出新断面
local CHIP = { { 32.6, 30.2 }, { 35.6, 29.8 }, { 36, 32.4 }, { 33.4, 32.6 } }
local chip = poly_mask(CHIP)
for y = 1, H do
  for x = 1, W do
    if chip[y][x] and face[y][x] then
      buf[y][x] = c.broken
    end
  end
end
for y = 1, H do
  for x = 1, W do
    if chip[y][x] and face[y][x] then
      for _, o in ipairs { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
        local nx, ny = x + o[1], y + o[2]
        if nx >= 1 and nx <= W and ny >= 1 and ny <= H and face[ny][nx] and not chip[ny][nx] then
          if buf[ny][nx] ~= c.face_edge then buf[ny][nx] = c.face_edge end
        end
      end
    end
  end
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
    local v = buf[y][x]
    img:putPixel(x - 1, y - 1, v)
    if v > 0 then
      count[v] = (count[v] or 0) + 1
      minx = math.min(minx, x - 1); maxx = math.max(maxx, x - 1)
      miny = math.min(miny, y - 1); maxy = math.max(maxy, y - 1)
    end
  end
end

local layer = spr.layers[1]
layer.name = 'stump'
spr:newCel(layer, 1, img, Point(0, 0))
spr:saveAs(ASSETS .. '/stump-48x48.aseprite')
spr:saveCopyAs(ASSETS .. '/stump-48x48.png')

local total = 0
for _, v in pairs(count) do total = total + v end
print(string.format('不透明 %d 像素，包围盒 x %d..%d y %d..%d（%d×%d）',
  total, minx, maxx, miny, maxy, maxx - minx + 1, maxy - miny + 1))
print(string.format('底行 y=%d，锚点 (%d,%d)', maxy, ANCHOR[1], ANCHOR[2]))
local used = 0
for i = 1, #PALETTE do if count[i] then used = used + 1 end end
print(string.format('用到的色数 %d / %d', used, #PALETTE))
