--[[
柳湾旧制盐遗迹：64×64 透明索引色精灵，Aseprite 生成。

运行：/Applications/Aseprite.app/Contents/MacOS/aseprite -b --script prototype/pixel-farm/salt-ruins.lua
输出：prototype/pixel-farm/assets/salt-ruins/salt-ruins-64x64.png / .aseprite
校验：python3 prototype/pixel-farm/salt-ruins-verify.py --verify

固定俯视微倾、左上受光。四件东西一件压一件：石台 → 铁盘 → 盐渍 → 木片。

1) 石台先立轮廓再分面。顶面是不规则多边形，底边分三段错开一格读作崩口，右上切掉一块，
   左边内凹一段。前立面由顶面每列底边向下推 6 行（断口 + 4 行立面 + 地脚），
   台沿的起伏因此一路带到地面。底行落在 y=58，就是接地点那一行。
2) 受光面是一块不规则的面，不是沿轮廓的一条带。贴边一圈亮边会读成“上糖霜”，
   岩石那套已经踩过；这里亮面只铺到台宽六成，核心再提一档，右下留中间调。
3) 铁盘必须比石面**更冷更亮**。第一版把盘画成 #4C4841、直径 26 像素，
   结果整块盘比石面还暗、又盖住大半个台面，八倍下直接读成石台上一个洞。
   现在盘径收到 19×9、铁色提亮到 #6A6862 / #8C8A82，石面才围得住它。
4) 盘按「离轮廓的步数」上色：第 1 层盘沿（上沿受光最亮）、第 2 层是沿内的暗影、
   第 3 层往里是盘底。浅盘靠“亮沿 → 一道暗影 → 平的盘底”三档立起来，
   少了中间那道暗影，盘底会被读成洞；把盘底画暗，同样读成洞。
5) 盘沿外圈压一道石色暗缝。这不是投影，是盘陷进去的那个凹坑；没有这道缝，
   盘沿与受光石面的亮度差只有个位数，八倍下会糊在一起。
6) 半陷靠石沿压住盘的下沿：盘画完后把压口以下换回台身底色，再补一行提亮石色当凸沿。
   必须从**台身缓冲区**取色，凭空取一个石色会在接缝处露边。
7) 盐渍按角度在盘沿上找点，不靠手填坐标。第一版是手填的 (17,43)(20,40)(24,39)，
   三撮里有两撮落在盘底而不是沿上，读成三朵白花。现在用 depth<=2 的沿像素里
   取最接近 202°/216°/231° 的三个点，每撮 2 像素带一粒更白的。
8) 木片最后压上去，顶端要真的越过台子的右沿、底端落在 y=58。第一版顶端只到 x=47.8，
   而台子右沿在 y=40 处只到 x=42，中间空了 6 像素，看着是立在地上的一块板。
   现在左沿从 (46,58) 斜到 (42,35)，中段开始压住台沿，才读成“靠着”。
9) 全色走索引色板，alpha 只有 0 与 255，没有抗锯齿、没有烘焙投影、没有发光烟雾。
]]

local W, H = 64, 64
local ANCHOR = { 32, 58 }        -- 接地点（0 基精灵坐标）
local FRONT_H = 5                -- 顶面底行往下推的行数：断口 + 3 行立面 + 地脚

-- ── 色板：0 号留透明，1..16 ────────────────────────────────────────
local c = {
  line = 1, dark = 2, face2 = 3, mid = 4, light = 5, hi = 6,   -- 灰褐石料
  i_line = 7, i_dark = 8, i_mid = 9, i_hi = 10,                -- 旧铁
  salt = 11, salt_hi = 12,
  w_line = 13, w_dark = 14, w_mid = 15, w_hi = 16,             -- 旧木料
}
local PALETTE = {
  { 0x32, 0x2D, 0x27 },   -- 1  line     轮廓、砌缝、地脚
  { 0x4A, 0x44, 0x3C },   -- 2  dark     背光石面
  { 0x57, 0x50, 0x46 },   -- 3  face2    背光石面的另一块，两块交替才读成砌石
  { 0x6E, 0x67, 0x5C },   -- 4  mid      台面主色（朝上的水平面，比野外岩石亮一档）
  { 0x8A, 0x82, 0x72 },   -- 5  light    受光面
  { 0xA7, 0x9C, 0x86 },   -- 6  hi       受光核心
  { 0x26, 0x25, 0x20 },   -- 7  i_line   沿内暗影、铁断面
  { 0x3C, 0x3B, 0x35 },   -- 8  i_dark   盘心
  { 0x55, 0x54, 0x4D },   -- 9  i_mid    盘沿、盘底外圈
  { 0x8B, 0x89, 0x81 },   -- 10 i_hi     盘沿高光
  { 0xDC, 0xD6, 0xC8 },   -- 11 salt     盐渍
  { 0xF5, 0xF2, 0xE9 },   -- 12 salt_hi  盐渍高光
  { 0x29, 0x1E, 0x15 },   -- 13 w_line   木片轮廓
  { 0x3A, 0x2A, 0x1C },   -- 14 w_dark   木片背光、木纹
  { 0x6A, 0x52, 0x36 },   -- 15 w_mid    木片正面
  { 0x82, 0x66, 0x44 },   -- 16 w_hi     木片受光
}

-- ── 路径从脚本自身推 ──────────────────────────────────────────────
local src = debug.getinfo(1, 'S').source:gsub('^@', '')
local DIR = src:match('^(.*)/[^/]+$')
local ASSETS = DIR .. '/assets/salt-ruins'
local PREVIEWS = DIR .. '/../../output/art-previews/salt-ruins'
app.fs.makeDirectory(ASSETS, true)
app.fs.makeDirectory(PREVIEWS, true)

-- ── 缓冲区与几何工具（缓冲区 1 基，坐标一律用 0 基精灵坐标）────────
local function new_buf(v)
  -- 不能写 v or 0：new_buf(false) 会变成 0，而 0 在 Lua 里是真值，掩码就整块实心
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

local function union(a, b)
  local m = new_buf(false)
  for y = 1, H do
    for x = 1, W do m[y][x] = a[y][x] or b[y][x] end
  end
  return m
end

-- ── 石台 ──────────────────────────────────────────────────────────
-- 顶面顺时针：底边三段错开一格（崩口）、右上切掉一块、左边内凹一段、后沿一个残缺口
local TOP_POLY = {
  { 2.6, 54 }, { 14, 54.4 }, { 24, 54 }, { 36, 54.4 }, { 46, 54 },
  { 52.8, 53 }, { 52.8, 46 }, { 52.4, 38 }, { 50.8, 36.2 },
  { 44, 37 }, { 41.6, 39.4 }, { 37, 35.8 },
  { 34, 35.4 }, { 28, 34.4 }, { 20, 35.2 }, { 12, 35 },
  { 3.4, 38.4 }, { 2.0, 44 }, { 2.4, 49 },
}
local top_mask = poly_mask(TOP_POLY)

local front_mask = new_buf(false)
local col_bottom = {}
for x = 1, W do
  local b = -1
  for y = 1, H do
    if top_mask[y][x] then b = y end
  end
  col_bottom[x] = b
  if b > 0 then
    for y = b + 1, math.min(H, b + FRONT_H) do
      front_mask[y][x] = true
    end
  end
end

-- 台底崩掉两段：这两列的前立面少一行，地脚线因此上移，底边不再是一条直尺
for _, span in ipairs { { 18, 22 }, { 38, 41 } } do
  for x = span[1] + 1, span[2] + 1 do
    local y = col_bottom[x] + FRONT_H
    if y >= 1 and y <= H then front_mask[y][x] = false end
  end
end

local solid = union(top_mask, front_mask)
local out_d = depth_map(solid)
local top_d = depth_map(top_mask)

local base = new_buf(0)
for y = 1, H do
  for x = 1, W do
    if solid[y][x] then
      local cb = col_bottom[x]
      local is_front = front_mask[y][x] and not top_mask[y][x]
      if out_d[y][x] == 1 then
        base[y][x] = c.line
      elseif is_front then
        if y == cb + FRONT_H or y == cb + 1 then
          base[y][x] = c.line                   -- 地脚 / 顶面与前立面的断口
        else
          -- 立面按列切成四块石头，明暗交替；缝是 1 像素直线
          local band = (x - 1) < 12 and 1 or ((x - 1) < 26 and 2 or ((x - 1) < 40 and 3 or 4))
          local seam = (x - 1) == 12 or (x - 1) == 26 or (x - 1) == 40
          base[y][x] = seam and c.line or (band % 2 == 1 and c.dark or c.face2)
        end
      else
        base[y][x] = c.mid
      end
    end
  end
end

-- 砌缝：两道从台前走到台后的板缝。缝本身用 dark 不用 line，
-- 纯黑直通会把台面切成三格抽屉；错台靠缝西一行提亮、缝东一行压暗表达。
local JOINTS = {
  { from = 17, to = 15, y0 = 36, y1 = 51 },
  { from = 33, to = 34, y0 = 36, y1 = 51 },
}
for _, j in ipairs(JOINTS) do
  for y = j.y0, j.y1 do
    local x = math.floor(j.from + (y - j.y0) / (j.y1 - j.y0) * (j.to - j.from) + 0.5)
    local px, py = x + 1, y + 1
    if top_mask[py][px] and base[py][px] ~= c.line then base[py][px] = c.dark end
    local ex = px + 1
    if ex <= W and top_mask[py][ex] and (base[py][ex] == c.mid or base[py][ex] == c.hi) then
      base[py][ex] = c.dark
    end
    local wx = px - 1
    if wx >= 1 and top_mask[py][wx] and base[py][wx] == c.mid then
      base[py][wx] = c.light
    end
  end
end

-- 台面受光：平铺的石板受光是均匀的，一整条亮带会读成“台面上又放了一块板”。
-- 只在朝上、朝左的那一圈轮廓内侧做 1 像素倒角，再在背左角点两格更亮的磨光。
for y = 1, H do
  for x = 1, W do
    if top_mask[y][x] and base[y][x] == c.mid and top_d[y][x] == 2 then
      local up_open = (y - 1 < 1) or not top_mask[y - 1][x]
      local left_open = (x - 1 < 1) or not top_mask[y][x - 1]
      if up_open or left_open then base[y][x] = c.light end
    end
  end
end
for _, p in ipairs { { 6, 40 }, { 7, 39 }, { 13, 36 } } do
  local x, y = p[1] + 1, p[2] + 1
  if top_mask[y][x] and (base[y][x] == c.light or base[y][x] == c.mid) then
    base[y][x] = c.hi
  end
end

-- 顶面石纹：一道裂缝、两处石孔、一处亮斑
local CRACK = { { 7, 47 }, { 8, 48 }, { 8, 49 }, { 9, 50 }, { 10, 50 } }
for _, p in ipairs(CRACK) do
  local x, y = p[1] + 1, p[2] + 1
  if top_mask[y][x] and base[y][x] ~= c.line then base[y][x] = c.dark end
end
for _, p in ipairs { { 39, 44 }, { 44, 40 }, { 14, 37 }, { 24, 36 }, { 45, 48 }, { 21, 52 } } do
  local x, y = p[1] + 1, p[2] + 1
  if top_mask[y][x] and base[y][x] ~= c.line then base[y][x] = c.dark end
end
for _, p in ipairs { { 11, 44 } } do
  local x, y = p[1] + 1, p[2] + 1
  if top_mask[y][x] and base[y][x] == c.light then base[y][x] = c.hi end
end

-- ── 铁盘：半陷在台面上，右前缺一角 ────────────────────────────────
local PCX, PCY, PRX, PRY = 26, 44.5, 9.5, 5.6
local LIP = 48.5                         -- 石沿压口（精灵行号）

local pan_poly = {}
for i = 0, 27 do
  local a = i * 2 * math.pi / 28
  pan_poly[#pan_poly + 1] = { PCX + PRX * math.cos(a), PCY + PRY * math.sin(a) }
end
local pan_mask = poly_mask(pan_poly)
local pan_d = depth_map(pan_mask)

local PAN = new_buf(false)
for y = 1, H do
  for x = 1, W do PAN[y][x] = pan_mask[y][x] and (y - 1) <= LIP end
end

local buf = new_buf(0)
for y = 1, H do
  for x = 1, W do buf[y][x] = base[y][x] end
end

for y = 1, H do
  for x = 1, W do
    if PAN[y][x] then
      local d = pan_d[y][x]
      local above = (y - 1) < PCY
      -- 盘沿整圈提亮、内壁压一道最深、盘底留暗。
      -- 只亮上左半圈时，暗底直接被读成石台上一个洞；整圈亮环才是“金属盘”的唯一信号。
      -- 反过来把盘底也画亮，盘就融进石面里（铁与石都是低饱和灰，明度差不到 20）。
      if d == 1 then
        buf[y][x] = c.i_hi                                  -- 盘沿整圈受光
      elseif d == 2 then
        buf[y][x] = above and c.i_line or c.i_dark           -- 沿内壁：上侧被沿挡住，下侧反射
      else
        buf[y][x] = c.i_mid                                 -- 盘底是平的金属面，不是深洞
      end
    end
  end
end

-- 凹坑暗缝：沿盘沿外侧压一圈石色暗缝（不是投影，是盘陷进去的那个坑）
for y = 1, H do
  for x = 1, W do
    if solid[y][x] and not PAN[y][x] and (y - 1) <= math.floor(LIP) + 1 then
      local nb = false
      for _, o in ipairs { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
        local nx, ny = x + o[1], y + o[2]
        if ny >= 1 and ny <= H and nx >= 1 and nx <= W and PAN[ny][nx] then nb = true end
      end
      if nb and buf[y][x] ~= 0 and buf[y][x] ~= c.line then buf[y][x] = c.dark end
    end
  end
end

-- 缺角：右前侧拿走一小段沿
local CHIP = { { 33, 44 }, { 34, 44 }, { 34, 45 }, { 33, 45 } }
local chip = {}
for _, p in ipairs(CHIP) do chip[(p[2] + 1) * 1000 + (p[1] + 1)] = true end
for _, p in ipairs(CHIP) do
  local x, y = p[1] + 1, p[2] + 1
  if PAN[y][x] then buf[y][x] = base[y][x] end
end
for y = 1, H do
  for x = 1, W do
    if PAN[y][x] and not chip[y * 1000 + x] then
      local nb = false
      for _, o in ipairs { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
        if chip[(y + o[2]) * 1000 + (x + o[1])] then nb = true end
      end
      if nb then buf[y][x] = c.i_line end
    end
  end
end

-- 盘底中心两点焦痕：浅盘的盘底是要看得见的，全暗就是洞
for _, p in ipairs { { 24, 44 }, { 27, 45 } } do
  local x, y = p[1] + 1, p[2] + 1
  if PAN[y][x] and pan_d[y][x] >= 4 then buf[y][x] = c.i_dark end
end

-- 盘底左上一小片反光：没有它，暗底就是个洞；有了它，盘底才是平的金属面
for _, p in ipairs { { 19, 42 }, { 20, 42 }, { 21, 42 }, { 19, 43 } } do
  local x, y = p[1] + 1, p[2] + 1
  if PAN[y][x] and pan_d[y][x] >= 3 then buf[y][x] = c.i_mid end
end

-- 石沿压住盘下沿：压口以下换回台身底色，压口那行补一行提亮石色当凸沿
for y = 1, H do
  for x = 1, W do
    if pan_mask[y][x] and (y - 1) > LIP then
      buf[y][x] = base[y][x]
    end
  end
end
local lip_row = math.floor(LIP) + 1
for x = 1, W do
  if pan_mask[lip_row][x] and base[lip_row][x] ~= 0 and base[lip_row][x] ~= c.line then
    buf[lip_row][x] = (base[lip_row][x] == c.light or base[lip_row][x] == c.hi) and c.hi or c.light
  end
end

-- 盐渍：在盘沿（depth<=2）上按角度找最近像素，三撮
local function rim_point(deg)
  local a = math.rad(deg)
  local tx, ty = PCX + PRX * math.cos(a), PCY + PRY * math.sin(a)
  local best, bd
  for y = 1, H do
    for x = 1, W do
      if PAN[y][x] and pan_d[y][x] <= 2 then
        local dd = (x - 1 - tx) ^ 2 + (y - 1 - ty) ^ 2
        if not bd or dd < bd then bd, best = dd, { x - 1, y - 1 } end
      end
    end
  end
  return best
end

local SALT = {}
for _, deg in ipairs { 96, 130, 162 } do
  local p = rim_point(deg)
  -- 从沿上往盘心走几格，落到内缘（d>=3）再画：盐积在盘沿内侧，白点压在暗底上才跳出来
  local q
  for t = 1, 4 do
    local x = math.floor(p[1] + (PCX - p[1]) * t * 0.25 + 0.5)
    local y = math.floor(p[2] + (PCY - p[2]) * t * 0.25 + 0.5)
    if PAN[y + 1] and PAN[y + 1][x + 1] and pan_d[y + 1][x + 1] >= 3 then
      q = { x, y }
      break
    end
  end
  SALT[#SALT + 1] = { q or p }   -- 包一层：SALT 每项是一撮的像素表
end

-- 每撮 2~3 像素（沿切向再取一两格），其中两撮带一粒更白的
for i, plist in ipairs(SALT) do
  local q = plist[1]
  local cells = { q }
  for _, d in ipairs { { 1, 0 }, { 0, 1 }, { -1, 0 } } do
    local x, y = q[1] + d[1], q[2] + d[2]
    if #cells < 3 and PAN[y + 1] and PAN[y + 1][x + 1] and pan_d[y + 1][x + 1] >= 3 then
      cells[#cells + 1] = { x, y }
    end
  end
  for _, c2 in ipairs(cells) do
    if PAN[c2[2] + 1][c2[1] + 1] then buf[c2[2] + 1][c2[1] + 1] = c.salt end
  end
  if i ~= 3 then
    local h = cells[1]
    if PAN[h[2] + 1][h[1] + 1] then buf[h[2] + 1][h[1] + 1] = c.salt_hi end
  end
end

-- 盘底一点陈盐垢 / 锈底，交代这口盘煮过东西
for _, p in ipairs { { 29, 47 }, { 30, 47 } } do
  local x, y = p[1] + 1, p[2] + 1
  if PAN[y][x] and pan_d[y][x] >= 3 then buf[y][x] = c.i_dark end
end

-- ── 旧木片：靠住台子右前角 ────────────────────────────────────────
local PLANK = { { 52, 58.9 }, { 59.4, 58.9 }, { 55.4, 37.6 }, { 53.2, 39.4 }, { 48.2, 38.2 } }
local plank_mask = poly_mask(PLANK)
local plank_d = depth_map(plank_mask)

for y = 1, H do
  local run_start
  for x = 1, W + 1 do
    local inb = x <= W and plank_mask[y][x]
    if inb and not run_start then run_start = x end
    if (not inb) and run_start then
      local run_end = x - 1
      local width = run_end - run_start + 1
      for xx = run_start, run_end do
        local left = xx - run_start
        local right = run_end - xx
        if plank_d[y][xx] == 1 then
          buf[y][xx] = c.w_line
        elseif width > 5 and left <= 1 then
          buf[y][xx] = c.w_hi
        elseif width > 5 and right <= 0 then
          buf[y][xx] = c.w_dark
        else
          buf[y][xx] = c.w_mid
        end
      end
      run_start = nil
    end
  end
end
-- 木纹两道，落在正面
for _, g in ipairs { { 53, 44, 3 }, { 55, 50, 4 } } do
  for i = 0, g[3] - 1 do
    local x, y = g[1] + 1, g[2] + i + 1
    if buf[y][x] == c.w_mid then buf[y][x] = c.w_dark end
  end
end

-- ── 装饰间距自检：不同装饰之间切比雪夫距离 > 2（同一撮内部不算）──────
local groups = { CRACK, { { 39, 44 } }, { { 44, 40 } }, { { 11, 44 } }, { { 6, 40 } },
                 { { 14, 37 } }, { { 24, 36 } }, { { 45, 48 } }, { { 21, 52 } },
                 SALT[1], SALT[2], SALT[3], { { 29, 47 } }, CHIP }
local too_close, close_pair = 0, nil
for i = 1, #groups do
  for j = i + 1, #groups do
    for _, a in ipairs(groups[i]) do
      for _, b in ipairs(groups[j]) do
        if math.max(math.abs(a[1] - b[1]), math.abs(a[2] - b[2])) <= 2 then
          too_close = too_close + 1
          close_pair = string.format('(%d,%d)-(%d,%d)', a[1], a[2], b[1], b[2])
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
layer.name = 'salt-ruins'
spr:newCel(layer, 1, img, Point(0, 0))
spr:saveAs(ASSETS .. '/salt-ruins-64x64.aseprite')
spr:saveCopyAs(ASSETS .. '/salt-ruins-64x64.png')

local total = 0
for _, v in pairs(count) do total = total + v end
print(string.format('不透明 %d 像素，包围盒 x %d..%d y %d..%d（%d×%d）',
  total, minx, maxx, miny, maxy, maxx - minx + 1, maxy - miny + 1))
print(string.format('底行 y=%d，锚点 (%d,%d)，装饰过近 %d 对 %s',
  maxy, ANCHOR[1], ANCHOR[2], too_close, close_pair or ''))
local used = 0
for i = 1, #PALETTE do if count[i] then used = used + 1 end end
print(string.format('用到的色数 %d / %d', used, #PALETTE))
