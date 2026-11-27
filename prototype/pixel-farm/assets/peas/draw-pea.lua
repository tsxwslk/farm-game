-- 柳湾 · 矮生豌豆四期生长
-- aseprite --batch --script draw-pea.lua
-- 画布固定 48x72，根部固定 (24,66)，固定俯视微倾、左上受光。
-- 对生复叶：每个节位左右各一片圆卵形小叶，节位间留缝；顶端抽出卷须。
-- 中期在叶腋抽出侧枝与乳白花，成熟期在叶间垂下 2–3 条鼓粒豆荚。
-- 只落整像素，不做抗锯齿。

local out = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local OX, OY = 24, 66

local function rgba(hex)
  return app.pixelColor.rgba((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255)
end

local C = {
  rim   = rgba(0x26361F), -- 本色深边
  deep  = rgba(0x35552B),
  shade = rgba(0x4A7139),
  mid   = rgba(0x5F8A48),
  lit   = rgba(0x7AA85C),
  fresh = rgba(0x97BE74),
  young = rgba(0xADD08A),

  stemD = rgba(0x415F2F),
  stem  = rgba(0x557641),
  stemL = rgba(0x6B8C52),

  curl  = rgba(0x7FA063),
  curlL = rgba(0x9BBB7A),

  petal   = rgba(0xF1E7CC),
  petalL  = rgba(0xF7EFD9),
  petalSh = rgba(0xD9CCAE),
  petalRm = rgba(0xB9AA8D),
  calyx   = rgba(0x5C7B44),

  podRim = rgba(0x2C481C),
  podDk  = rgba(0x5C852D),
  pod    = rgba(0x8FBE3F),
  podLit = rgba(0xB4DD6E),
  podHi  = rgba(0xD2F092),
}

local RAMP = { C.deep, C.shade, C.mid, C.lit, C.fresh }
local YOUNG = { C.shade, C.mid, C.lit, C.fresh, C.young }

local LX, LY = -0.70710678, -0.70710678

local function layer(sprite, name, draw)
  local target = sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local function save(sprite, name)
  local pivot = sprite:newSlice(Rectangle(0, 0, sprite.width, sprite.height))
  pivot.name = "Placement"
  pivot.pivot = Point(OX, OY)
  assert(sprite:saveAs(app.fs.joinPath(out, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(out, name .. ".png")))
  sprite:close()
  print("Exported " .. name)
end

local function inCanvas(x, y)
  return x >= 0 and x < 48 and y >= 0 and y <= OY
end

-- 一片圆卵形小叶：短叶柄 + 圆钝叶身，背光侧压一像素深边
local function leaflet(img, ox, oy, cfg)
  local a = math.rad(cfg.angle)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local k = cfg.k or 0.92
  local pet = cfg.pet or 2.0
  local len, width = cfg.len, cfg.width
  local ramp = cfg.ramp or RAMP

  local lx, ly = LX, LY / k
  local ln = math.sqrt(lx * lx + ly * ly)
  lx, ly = lx / ln, ly / ln
  local lu, lv = lx * dx + ly * dy, lx * px + ly * py
  local vs = (lv >= 0) and 1 or -1

  local total = pet + len
  local spanU = total + 1
  local spanV = width * 0.55 + 1
  local ex = spanU * math.abs(dx) + spanV * math.abs(px) + 1
  local ey = (spanU * math.abs(dy) + spanV * math.abs(py)) * k + 1

  for yy = math.max(0, math.floor(oy - ey)), math.min(OY, math.ceil(oy + ey)) do
    local wy = (yy - oy) / k
    for xx = math.max(0, math.floor(ox - ex)), math.min(47, math.ceil(ox + ex)) do
      local rx, ry = xx - ox, wy
      local u = rx * dx + ry * dy
      local v = rx * px + ry * py
      if u >= 0 and u <= total then
        if u <= pet then
          -- 叶柄：窄，受光在左
          local p = u / math.max(0.001, pet)
          local hw = 0.85 + 0.25 * p
          if math.abs(v) <= hw then
            local tone = C.stem
            if v < -0.2 then tone = C.stemL end
            if v > 0.45 then tone = C.stemD end
            img:drawPixel(xx, yy, tone)
          end
        else
          local s = (u - pet) / len
          -- 圆卵形：中段最宽，叶尖收圆
          local body = math.sin(math.pi * (0.02 + 0.98 * s)) ^ 0.52
          if s > 0.84 then body = body * (1 - ((s - 0.84) / 0.16) ^ 1.5) end
          local hw = math.max(0.5, width * 0.5 * body)
          if math.abs(v) <= hw then
            local across = v / hw
            local b = 0.70 + 0.42 * (lu * (s - 0.44) + lv * across * 0.95)
            local edge = hw - math.abs(v)
            local level = b < 0.32 and 1 or b < 0.50 and 2 or b < 0.68 and 3 or b < 0.84 and 4 or 5
            local tone = ramp[level]
            local along = v * vs
            -- 受光侧叶缘亮一档，背光侧压深边
            if edge < 0.85 and along < -0.15 then
              tone = ramp[math.min(5, level + 1)]
            elseif edge < 0.80 and along > 0.15 then
              tone = ramp[2]
            end
            img:drawPixel(xx, yy, tone)
          end
        end
      end
    end
  end
end

-- 一段茎：从下往上略收，左受光
local function stem(img, topY, wBot, wTop, bend)
  bend = bend or 0
  for y = topY, OY do
    local t = (y - topY) / math.max(1, OY - topY)
    local cx = OX + bend * (1 - t) * (1 - t)
    local hw = (wTop + (wBot - wTop) * t) * 0.5
    for x = math.floor(cx - hw + 0.5), math.floor(cx + hw) do
      local rel = (x - cx + 0.5) / math.max(0.5, hw)
      local tone = C.stem
      if rel < -0.30 then tone = C.stemL
      elseif rel > 0.42 then tone = C.stemD end
      if y == OY then tone = C.stemD end
      if inCanvas(x, y) then img:drawPixel(x, y, tone) end
    end
  end
end

-- 侧枝：一段细茎，从 (x0,y0) 到 (x1,y1)
local function branch(img, x0, y0, x1, y1, w)
  local len = math.max(1, math.sqrt((x1 - x0) ^ 2 + (y1 - y0) ^ 2))
  for i = 0, math.floor(len) do
    local t = i / len
    local x = x0 + (x1 - x0) * t
    local y = y0 + (y1 - y0) * t
    local hw = (w or 1.6) * 0.5
    for xx = math.floor(x - hw + 0.5), math.floor(x + hw) do
      local tone = C.stem
      if xx < x then tone = C.stemL elseif xx > x then tone = C.stemD end
      if inCanvas(xx, math.floor(y + 0.5)) then img:drawPixel(xx, math.floor(y + 0.5), tone) end
    end
  end
end

-- 卷须：一截细柄，末端向内勾一个小弧
local function tendril(img, x0, y0, dir)
  local pts = {
    { 0, 0 }, { 1, -1 }, { 2, -2 }, { 3, -3 }, { 4, -4 },
    { 4, -5 }, { 3, -6 }, { 2, -6 }, { 2, -5 },
  }
  for i, p in ipairs(pts) do
    local x = x0 + p[1] * dir
    local y = y0 + p[2]
    if inCanvas(x, y) then
      img:drawPixel(x, y, (i <= 3) and C.curl or C.curlL)
    end
  end
end

-- 乳白小花：六像素宽的开口花冠，顶瓣分两片，绿萼接花梗
local function blossom(img, x, y)
  local rows = {
    { -2, { { -2, -1 }, { 1, 2 } }, "L" },
    { -1, { { -3,  2 } }, "L" },
    {  0, { { -3,  1 } }, "M" },
    {  1, { { -1,  0 } }, "S" },
  }
  for _, r in ipairs(rows) do
    local dy, segs, kind = r[1], r[2], r[3]
    for _, seg in ipairs(segs) do
      for dx = seg[1], seg[2] do
        local tone = C.petal
        if kind == "L" then
          tone = (dx <= 0) and C.petalL or C.petal
        elseif kind == "S" then
          tone = C.petalSh
        end
        if dx == seg[2] and kind ~= "L" then tone = C.petalRm end
        if dy == 1 then tone = (dx == 0) and C.calyx or C.petalSh end
        if inCanvas(x + dx, y + dy) then img:drawPixel(x + dx, y + dy, tone) end
      end
    end
  end
  if inCanvas(x, y + 2) then img:drawPixel(x, y + 2, C.calyx) end
  if inCanvas(x - 1, y + 2) then img:drawPixel(x - 1, y + 2, C.calyx) end
end

local function flower(img, x, y, cfg)
  cfg = cfg or {}
  local dir = cfg.dir or 1
  local stemLen = cfg.stem or 2
  local baseX, baseY = x - dir * 2, y + stemLen + 2
  for i = 0, stemLen + 2 do
    local px = baseX + dir * math.floor(i * 0.7)
    local py = baseY - i
    if inCanvas(px, py) then img:drawPixel(px, py, C.stem) end
  end
  blossom(img, x, y)
end

-- 豆荚：上缘平滑、下缘三个鼓包，背光侧整圈深边
local function pod(img, ox, oy, cfg)
  local a = math.rad(cfg.angle)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local len, width = cfg.len, cfg.width
  local curve = cfg.curve or 1.6
  local r = width * 0.5
  local spanU = len + 3
  local spanV = width + 4
  local ex = spanU * math.abs(dx) + spanV * math.abs(px) + 2
  local ey = spanU * math.abs(dy) + spanV * math.abs(py) + 2

  local filled = {}
  for yy = math.max(0, math.floor(oy - ey)), math.min(OY, math.ceil(oy + ey)) do
    for xx = math.max(0, math.floor(ox - ex)), math.min(47, math.ceil(ox + ex)) do
      local rx, ry = xx - ox, yy - oy
      local u = rx * dx + ry * dy
      local v = rx * px + ry * py - curve * (math.max(0, u) / len) ^ 1.7
      if u >= 0 and u <= len then
        local s = u / len
        local taper = math.sin(math.pi * (0.05 + 0.90 * s)) ^ 0.42
        if s > 0.84 then taper = taper * (1 - ((s - 0.84) / 0.16) ^ 1.3) end
        local ht = r * taper
        local hb = r * taper * (1 + 0.22 * math.sin(3 * math.pi * s + 0.35))
        if v >= -ht and v <= hb then
          filled[yy * 64 + xx] = true
          local tone = C.pod
          if v < -ht + 1.0 then tone = C.podLit end
          if v < -ht + 0.40 then tone = C.podHi end
          if v > hb - 1.0 then tone = C.podRim end
          if u < 1.3 or u > len - 1.3 then tone = C.podRim end
          -- 鼓包之间的缝：只压在下缘，不切断荚背
          for _, s0 in ipairs({ 0.26, 0.59 }) do
            if math.abs(u - len * s0) < 0.9 and v > hb - 2.0 and v < hb - 0.6 then
              tone = C.podDk
            end
          end
          img:drawPixel(xx, yy, tone)
        end
      end
    end
  end
  -- 整圈深边：只描贴着空处的一圈
  for key in pairs(filled) do
    local x, y = key % 64, math.floor(key / 64)
    for _, n in ipairs({ { x - 1, y }, { x + 1, y }, { x, y - 1 }, { x, y + 1 } }) do
      if not filled[n[2] * 64 + n[1]] and inCanvas(n[1], n[2]) then
        img:drawPixel(n[1], n[2], C.podRim)
      end
    end
  end
end

--[[ ------------------------------------------------------------------
     四个阶段
     ------------------------------------------------------------------ ]]

local stages = {
  {
    name = "01-sprout",
    stem = { top = 61, wBot = 2.4, wTop = 2.0, bend = 0.3 },
    leaves = {
      { ox = 23.2, oy = 60.0, angle = -70, len = 5.4, width = 4.6, k = 1.00, ramp = YOUNG },
      { ox = 24.8, oy = 60.0, angle =  70, len = 5.4, width = 4.6, k = 1.00, ramp = YOUNG },
    },
  },
  {
    name = "02-seedling",
    stem = { top = 51, wBot = 2.8, wTop = 2.0, bend = 0.4 },
    leaves = {
      { ox = 23.0, oy = 60.0, angle = -70, len = 8.4, width = 6.0, k = 0.98 },
      { ox = 25.0, oy = 60.0, angle =  70, len = 8.4, width = 6.0, k = 0.98 },
      { ox = 23.0, oy = 54.0, angle = -56, len = 7.4, width = 5.4, k = 0.98 },
      { ox = 25.0, oy = 54.0, angle =  56, len = 7.4, width = 5.4, k = 0.98 },
      { ox = 23.0, oy = 49.5, angle = -36, len = 5.6, width = 4.6, k = 1.00, ramp = YOUNG },
      { ox = 25.0, oy = 49.5, angle =  36, len = 5.6, width = 4.6, k = 1.00, ramp = YOUNG },
    },
    tendrils = { { x = 24, y = 49, dir = 1 } },
  },
  {
    name = "03-bulking",
    stem = { top = 44, wBot = 3.0, wTop = 2.0, bend = 0.5 },
    branches = { { 24, 57, 18, 52, 1.6 } },
    leaves = {
      { ox = 23.0, oy = 61.0, angle = -78, len = 9.0, width = 6.2, k = 0.96 },
      { ox = 25.0, oy = 61.0, angle =  78, len = 9.0, width = 6.2, k = 0.96 },
      { ox = 23.0, oy = 55.0, angle = -62, len = 8.6, width = 6.0, k = 0.98 },
      { ox = 25.0, oy = 55.0, angle =  62, len = 8.6, width = 6.0, k = 0.98 },
      { ox = 23.0, oy = 49.0, angle = -46, len = 7.6, width = 5.4, k = 0.98 },
      { ox = 25.0, oy = 49.0, angle =  46, len = 7.6, width = 5.4, k = 0.98 },
      { ox = 18.0, oy = 52.0, angle = -110, len = 7.0, width = 5.2, k = 0.98 },
      { ox = 18.0, oy = 52.0, angle = -165, len = 6.0, width = 4.6, k = 1.00 },
    },
    tendrils = { { x = 24, y = 44, dir = 1 }, { x = 18, y = 51, dir = -1 } },
    flowers = { { x = 18, y = 47, stem = 2, dir = -1 }, { x = 30, y = 45, stem = 2, dir = 1 } },
  },
  {
    name = "04-mature",
    stem = { top = 39, wBot = 3.6, wTop = 2.0, bend = 0.5 },
    branches = { { 24, 53, 17, 48, 1.8 }, { 24, 49, 31, 44, 1.6 } },
    leaves = {
      { ox = 23.0, oy = 61.0, angle = -82, len = 9.8, width = 6.4, k = 0.96 },
      { ox = 25.0, oy = 61.0, angle =  82, len = 9.8, width = 6.4, k = 0.96 },
      { ox = 23.0, oy = 54.0, angle = -66, len = 9.4, width = 6.2, k = 0.98 },
      { ox = 25.0, oy = 54.0, angle =  66, len = 9.4, width = 6.2, k = 0.98 },
      { ox = 23.0, oy = 47.0, angle = -50, len = 8.4, width = 5.8, k = 0.98 },
      { ox = 25.0, oy = 47.0, angle =  50, len = 8.4, width = 5.8, k = 0.98 },
      { ox = 23.0, oy = 42.0, angle = -32, len = 6.4, width = 5.0, k = 1.00, ramp = YOUNG },
      { ox = 25.0, oy = 42.0, angle =  32, len = 6.4, width = 5.0, k = 1.00, ramp = YOUNG },
      { ox = 17.0, oy = 48.0, angle = -110, len = 7.6, width = 5.6, k = 0.98 },
      { ox = 17.0, oy = 48.0, angle = -170, len = 6.4, width = 5.0, k = 1.00 },
      { ox = 31.0, oy = 44.0, angle =  110, len = 7.0, width = 5.4, k = 0.98 },
    },
    tendrils = { { x = 24, y = 39, dir = 1 }, { x = 17, y = 47, dir = -1 }, { x = 31, y = 43, dir = 1 } },
    pods = {
      { x = 14, y = 49.0, angle = 200, len = 14.0, width = 4.6, curve = 1.8 },
      { x = 25, y = 50.0, angle = 183, len = 13.5, width = 4.6, curve = 1.2 },
      { x = 34, y = 48.0, angle = 166, len = 14.0, width = 4.6, curve = 1.8 },
    },
  },
}

for _, spec in ipairs(stages) do
  local sprite = Sprite(48, 72, ColorMode.RGB)

  layer(sprite, "Stem", function(img)
    stem(img, spec.stem.top, spec.stem.wBot, spec.stem.wTop, spec.stem.bend)
    for _, b in ipairs(spec.branches or {}) do
      branch(img, b[1], b[2], b[3], b[4], b[5])
    end
  end)

  for i, l in ipairs(spec.leaves) do
    layer(sprite, "Leaf " .. i, function(img) leaflet(img, l.ox, l.oy, l) end)
  end

  layer(sprite, "Tendrils", function(img)
    for _, t in ipairs(spec.tendrils or {}) do
      tendril(img, t.x, t.y, t.dir)
    end
  end)

  layer(sprite, "Flowers", function(img)
    for _, f in ipairs(spec.flowers or {}) do
      flower(img, f.x, f.y, f)
    end
  end)

  layer(sprite, "Pods", function(img)
    for _, p in ipairs(spec.pods or {}) do
      -- 荚柄：从挂点连到植株
      pod(img, p.x, p.y, p)
    end
  end)

  save(sprite, spec.name)
end
